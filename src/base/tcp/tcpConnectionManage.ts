import { Adapter } from "../adapter";
import { Connection } from "../../../config.base";
import net, { Socket } from "node:net";
import PQueue from "p-queue";
import EventEmitter2 from "eventemitter2";

export const broadcast = new EventEmitter2({
  wildcard: true,
  verboseMemoryLeak: true,
  maxListeners: 10,
});

const socketMap: Map<string, TCPConnection> = new Map();

export class TCPConnection extends Adapter {
  private readonly host: string;
  private readonly belongId: string;
  private server!: Socket;
  private readonly readQueue = new PQueue({
    concurrency: 1,
    //任务超时直接记作失败
    timeout: 1000 * 60,
    throwOnTimeout: true,
  });
  private readonly writeQueue = new PQueue({
    concurrency: 1,
    //任务超时直接记作失败
    timeout: 1000 * 60,
    throwOnTimeout: true,
  });
  private locked = false;

  constructor({
    port,
    host,
    belongId,
  }: {
    port: number;
    host: string;
    belongId: string;
  }) {
    super({ port });
    this.host = host;
    this.belongId = belongId;
  }

  public async init(): Promise<any> {
    this.server = net.createConnection({
      port: this.port,
      host: this.host,
      keepAlive: true,
      timeout: 1000 * 60, //60秒超时
    });

    try {
      await this.onConnection(this.belongId);
    } catch (e) {
      console.log("client: 创建连接失败");
      await this.destroyBelongId(this.belongId);
      return;
    }

    this.server.on("data", async (chunk) => {
      this.server.pause();
      try {
        await this.readQueue.add(() => this.onData(this.belongId, chunk));
      } catch (e) {
        await this.destroyBelongId(this.belongId);
        return;
      }
      this.server.resume();
    });

    this.server.on("error", (err) => {
      switch (err.message) {
        case "read ECONNRESET":
          this.server.resume();
          break;
        case "write EPIPE":
          this.server.resume();
          break;
        default:
          this.destroyBelongId(this.belongId);
          break;
      }
    });

    this.server.on("close", () => this.destroyBelongId(this.belongId));

    this.server.on("end", () => this.destroyBelongId(this.belongId));

    this.server.on("timeout", () => this.destroyBelongId(this.belongId));

    return this;
  }

  public destroyBelongId(belongId: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.locked) {
        resolve();
        return;
      }
      this.locked = true;

      const handler = () => {
        if (
          this.writeQueue.size === 0 &&
          this.writeQueue.pending === 0 &&
          this.readQueue.size === 0 &&
          this.readQueue.pending === 0
        ) {
          this.server.end(async () => {
            this.server.unref();
            this.server.destroy();
            this.server.removeAllListeners();

            this.readQueue.clear();
            this.writeQueue.clear();
            this.readQueue.removeAllListeners();
            this.writeQueue.removeAllListeners();

            socketMap.delete(this.belongId);

            await this.onDestroyed(this.belongId).catch((e) => console.log(e));

            resolve();
          });
        }
      };

      this.readQueue.on("idle", handler);
      this.writeQueue.on("idle", handler);

      handler();
    });
  }

  public async write(belongId: string, chunk: Buffer): Promise<void> {
    await this.writeQueue.add(() => {
      return new Promise((resolve) => {
        this.server.write(chunk, () => resolve(undefined));
      });
    });
  }
}

export const findSocket = async (
  belongId: string,
): Promise<TCPConnection | undefined> => {
  return socketMap.get(belongId);
};

export const createSocket = async (
  belongId: string,
  connection: Connection,
): Promise<TCPConnection> => {
  if (socketMap.has(belongId)) {
    throw new Error("已经存在相同的socket");
  }

  const tcpConnection = new TCPConnection({
    port: connection.localPort,
    host: connection.localHost,
    belongId,
  });

  tcpConnection.onConnection = async (belongId) => {
    await broadcast.emitAsync(
      `${connection.localPort}.${connection.type}.connection.${belongId}`,
      {
        belongId,
      },
    );
  };

  tcpConnection.onData = async (belongId, chunk) => {
    await broadcast.emitAsync(
      `${connection.localPort}.${connection.type}.data.${belongId}`,
      {
        belongId,
        chunk,
      },
    );
  };

  tcpConnection.onDestroyed = async (belongId) => {
    await broadcast.emitAsync(
      `${connection.localPort}.${connection.type}.destroyed.${belongId}`,
      {
        belongId,
      },
    );
  };

  await tcpConnection.init();

  socketMap.set(belongId, tcpConnection);

  return tcpConnection;
};
