import { TransportType } from "../base/types";
import { Connection, ConnectionType } from "../../config.base";
import {
  TCPConnection,
  TCPConnectionBroadcast,
  TCPConnectionMap,
} from "../base/tcp/tcpConnection";
import { ClientChannelReplyParams, ClientChannelSendParams } from "./index";
import PQueue, { QueueAddOptions } from "p-queue";
import PriorityQueue from "p-queue/dist/priority-queue";
import { CoreCrypto } from "core.crypto";
import Transformer from "../utils/transformer";
import {
  UDPConnection,
  UDPConnectionBroadcast,
  UDPConnectionMap,
} from "../base/udp/udpConnection";

export class ClientTransport {
  private readonly connection: Connection;
  private send: ((data: ClientChannelSendParams) => Promise<void>) | undefined;
  private readonly clientId: string;
  private readonly replyTaskQueueMap: Map<string, PQueue> = new Map();
  private readonly coreCrypto: CoreCrypto;

  constructor({
    connection,
    send,
  }: {
    connection: Connection;
    send?: (data: ClientChannelSendParams) => Promise<void>;
  }) {
    this.coreCrypto = new CoreCrypto();
    this.clientId = `${connection.bindPort}/${connection.type}/${connection.uuid}/${connection.secretKey}`;
    this.connection = connection;
    this.send = send;
  }

  public setSend(fn: (data: ClientChannelSendParams) => Promise<void>) {
    this.send = fn;
  }

  public getConnectionKey(connection: Connection) {
    return `${connection.bindPort}/${connection.type}`;
  }

  public getClientId(): string {
    return this.clientId;
  }

  private async sendInterceptor(
    data: ClientChannelSendParams,
  ): Promise<ClientChannelSendParams> {
    if (data.chunk && !this.coreCrypto) {
      throw new Error("coreCrypto不能为空");
    } else {
      data.chunk = (await Transformer.encryption(
        this.coreCrypto as CoreCrypto,
        data.chunk,
      )) as Buffer;
    }

    return data;
  }

  private async replyInterceptor(
    belongId: string,
    chunk?: Buffer,
  ): Promise<{ belongId: string; chunk?: Buffer }> {
    if (chunk && !this.coreCrypto) {
      throw new Error("coreCrypto不能为空");
    }

    return {
      belongId,
      chunk:
        chunk && this.coreCrypto
          ? ((await Transformer.decryption(this.coreCrypto, chunk)) as Buffer)
          : chunk,
    };
  }

  public async init(): Promise<ClientTransport> {
    const connectionKey = this.getConnectionKey(this.connection);
    if (!this.send) throw new Error("send方法未实现");

    await this.coreCrypto.setIv(this.connection.encryption.iv);
    await this.coreCrypto.setAesKey(this.connection.encryption.aesKey);

    if (this.connection.type === ConnectionType.TCP) {
      TCPConnectionBroadcast.on(
        `destroyed.${this.connection.localPort}`,
        async (belongId: string) => {
          const sendInterceptorResult = await this.sendInterceptor({
            transportType: TransportType.DESTROYED,
            belongId,
            connectionKey,
            chunk: Buffer.from([]),
            clientId: this.clientId,
          });
          await this.send?.(sendInterceptorResult);
        },
      );

      TCPConnectionBroadcast.on(
        `data.${this.connection.localPort}`,
        async (belongId: string, chunk: Buffer) => {
          const sendInterceptorResult = await this.sendInterceptor({
            transportType: TransportType.MESSAGE,
            belongId,
            connectionKey,
            chunk,
            clientId: this.clientId,
          });
          await this.send?.(sendInterceptorResult);
        },
      );
    } else {
      UDPConnectionBroadcast.on(
        `destroyed.${this.connection.localPort}`,
        async (belongId: string) => {
          const sendInterceptorResult = await this.sendInterceptor({
            transportType: TransportType.DESTROYED,
            belongId,
            connectionKey,
            chunk: Buffer.from([]),
            clientId: this.clientId,
          });
          await this.send?.(sendInterceptorResult);
        },
      );

      UDPConnectionBroadcast.on(
        `data.${this.connection.localPort}`,
        async (belongId: string, chunk: Buffer) => {
          const sendInterceptorResult = await this.sendInterceptor({
            transportType: TransportType.MESSAGE,
            belongId,
            connectionKey,
            chunk,
            clientId: this.clientId,
          });
          await this.send?.(sendInterceptorResult);
        },
      );
    }

    return this;
  }

  public async reply(data: ClientChannelReplyParams) {
    let replyTask = this.replyTaskQueueMap.get(
      `${this.getConnectionKey(this.connection)}/${data.belongId}`,
    );
    if (!replyTask) {
      replyTask = new PQueue<PriorityQueue, QueueAddOptions>({
        concurrency: 1,
        throwOnTimeout: true,
        timeout: 1000 * 120, //任务最多执行120秒 超时会报错
      });
      this.replyTaskQueueMap.set(
        `${this.getConnectionKey(this.connection)}/${data.belongId}`,
        replyTask,
      );
    }

    switch (data.transportType) {
      case TransportType.CONNECTION:
        await replyTask.add(async () => {
          this.connection.type === ConnectionType.TCP
            ? await new TCPConnection({
                port: this.connection.localPort,
                host: this.connection.localHost,
                id: data.belongId,
              }).init()
            : await new UDPConnection({
                port: this.connection.localPort,
                host: this.connection.localHost,
                id: data.belongId,
              }).init();
        });
        break;

      case TransportType.MESSAGE:
        await replyTask.add(async () => {
          //udp不是基于长连接  所以这里要特殊处理
          if (this.connection.type === ConnectionType.UDP) {
            const udpSocket: UDPConnection = await new UDPConnection({
              port: this.connection.localPort,
              host: this.connection.localHost,
              id: data.belongId,
            }).init();
            const { belongId, chunk } = await this.replyInterceptor(
              data.belongId,
              data.chunk,
            );

            await udpSocket.write(belongId, chunk as Buffer);

            return;
          }

          const findSocket: TCPConnection | UDPConnection | undefined =
            this.connection.type === ConnectionType.TCP
              ? TCPConnectionMap.get(data.belongId)
              : UDPConnectionMap.get(data.belongId);

          if (!findSocket) return;

          const { belongId, chunk } = await this.replyInterceptor(
            data.belongId,
            data.chunk,
          );
          await findSocket?.write(belongId, chunk as Buffer);
        });
        break;

      case TransportType.DESTROYED:
        await replyTask.onIdle();
        await replyTask.add(async () => {
          const findSocket: TCPConnection | UDPConnection | undefined =
            this.connection.type === ConnectionType.TCP
              ? TCPConnectionMap.get(data.belongId)
              : UDPConnectionMap.get(data.belongId);

          if (!findSocket) return;

          const { belongId } = await this.replyInterceptor(data.belongId);
          await findSocket?.destroyBelongId(belongId);
        });
        replyTask?.clear();
        this.replyTaskQueueMap.delete(data.belongId);
        break;
    }
  }
}
