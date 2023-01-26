import { TransportType } from "../base/types";
import { Connection, ConnectionType } from "../../config.base";
import { TCPServer } from "../base/tcp/tcpServer";
import { ServerChannelReplyParams, ServerChannelSendParams } from "./index";
import PQueue, { QueueAddOptions } from "p-queue";
import PriorityQueue from "p-queue/dist/priority-queue";
import { CoreCrypto } from "core.crypto";
import Transformer from "../utils/transformer";
import { UDPServer } from "../base/udp/udpServer";

export class ServerTransport {
  private send: ((data: ServerChannelSendParams) => Promise<void>) | undefined;
  private readonly connectionMap: Map<string, TCPServer | UDPServer> =
    new Map();
  private readonly connectionCoreCryptoMap: Map<string, CoreCrypto> = new Map();
  private readonly connections: Array<Connection> = [];
  private readonly replyTaskQueueMap: Map<string, PQueue> = new Map();

  constructor({
    send,
    connections,
  }: {
    send?: (data: ServerChannelSendParams) => Promise<void>;
    connections?: Array<Connection>;
  }) {
    this.send = send;
    this.connections = connections ?? this.connections;
  }

  public setSend(fn: (data: ServerChannelSendParams) => Promise<void>) {
    this.send = fn;
  }

  private async sendInterceptor(
    data: ServerChannelSendParams,
  ): Promise<ServerChannelSendParams> {
    const coreCrypto = this.connectionCoreCryptoMap.get(data.connectionKey);

    if (data.chunk && !coreCrypto) {
      throw new Error("coreCrypto不能为空");
    } else {
      data.chunk = (await Transformer.encryption(
        coreCrypto as CoreCrypto,
        data.chunk,
      )) as Buffer;
    }

    return data;
  }

  private async replyInterceptor(
    belongId: string,
    chunk?: Buffer,
    coreCrypto?: CoreCrypto,
  ): Promise<{ belongId: string; chunk?: Buffer }> {
    if (chunk && !coreCrypto) {
      throw new Error("coreCrypto不能为空");
    }

    return {
      belongId,
      chunk:
        chunk && coreCrypto
          ? ((await Transformer.decryption(coreCrypto, chunk)) as Buffer)
          : chunk,
    };
  }

  private async initConnectionListener(
    server: TCPServer | UDPServer,
    connectionKey: string,
    connection: Connection,
  ) {
    const broadcast = server.getBroadcast();
    if (!this.send) throw new Error("send方法未实现");

    broadcast.on(`connection`, async (belongId: string) => {
      const sendInterceptorResult = await this.sendInterceptor({
        transportType: TransportType.CONNECTION,
        belongId,
        connectionKey,
        connection,
        chunk: Buffer.from([]),
      });
      await this.send?.(sendInterceptorResult);
    });

    broadcast.on(`data`, async (belongId: string, chunk: Buffer) => {
      const sendInterceptorResult = await this.sendInterceptor({
        transportType: TransportType.MESSAGE,
        belongId,
        connectionKey,
        connection,
        chunk: chunk,
      });
      await this.send?.(sendInterceptorResult);
    });
    broadcast.on(`destroyed`, async (belongId: string) => {
      const sendInterceptorResult = await this.sendInterceptor({
        transportType: TransportType.DESTROYED,
        belongId,
        connectionKey,
        connection,
        chunk: Buffer.from([]),
      });
      await this.send?.(sendInterceptorResult);
    });
  }

  public getConnectionKey(connection: Connection) {
    return `${connection.bindPort}/${connection.type}`;
  }

  public async init(): Promise<ServerTransport> {
    for (let item of this.connections) {
      const server: TCPServer | UDPServer =
        item.type === ConnectionType.TCP
          ? new TCPServer({ port: item.bindPort })
          : new UDPServer({ port: item.bindPort });

      const connectionKey = this.getConnectionKey(item);
      const coreCrypto = new CoreCrypto();

      await coreCrypto.setIv(item.encryption.iv);
      await coreCrypto.setAesKey(item.encryption.aesKey);

      this.connectionMap.set(connectionKey, server);
      this.connectionCoreCryptoMap.set(connectionKey, coreCrypto);

      await server.init();

      await this.initConnectionListener(server, connectionKey, item);
    }

    return this;
  }

  public async reply(data: ServerChannelReplyParams) {
    const connection = this.connectionMap.get(data.connectionKey);
    if (!connection) return;

    let replyTask = this.replyTaskQueueMap.get(
      `${data.connectionKey}/${data.belongId}`,
    );
    if (!replyTask) {
      replyTask = new PQueue<PriorityQueue, QueueAddOptions>({
        concurrency: 1,
        throwOnTimeout: true,
        timeout: 1000 * 120, //任务最多执行120秒 超时会报错
      });
      this.replyTaskQueueMap.set(
        `${data.connectionKey}/${data.belongId}`,
        replyTask,
      );
    }

    switch (data.transportType) {
      case TransportType.CONNECTION:
        //client的CONNECTION不需要处理
        break;

      case TransportType.MESSAGE:
        await replyTask.add(async () => {
          const { belongId, chunk } = await this.replyInterceptor(
            data.belongId,
            data.chunk,
            this.connectionCoreCryptoMap.get(data.connectionKey),
          );
          await connection.write(belongId, chunk as Buffer);
        });
        break;

      case TransportType.DESTROYED:
        await replyTask.onIdle();
        await replyTask.add(async () => {
          const { belongId } = await this.replyInterceptor(data.belongId);
          await connection.destroyBelongId(belongId);
        });
        replyTask?.clear();
        this.replyTaskQueueMap.delete(data.belongId);
        break;
    }
  }
}
