import { Adapter } from "../adapter";
import EventEmitter2 from "eventemitter2";
import { Connection } from "../../../config.base";
import dgram, { Socket } from "node:dgram";
import { RemoteInfo } from "dgram";

export const broadcast = new EventEmitter2({
  wildcard: true,
  verboseMemoryLeak: true,
  maxListeners: 10,
});

const socketMap: Map<string, UDPConnection> = new Map();

export class UDPConnection extends Adapter {
  private readonly host: string;
  private readonly belongId: string;
  private server!: Socket;
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
    this.server = dgram.createSocket({ type: "udp4" });
    this.server.on("message", async (msg: Buffer, remoteInfo: RemoteInfo) => {
      try {
        await this.onData(this.belongId, msg);
      } catch (e) {
        await this.destroyBelongId(this.belongId);
      }
    });
    this.server.on("close", async () => {
      await this.destroyBelongId(this.belongId);
    });
    this.server.on("error", async () => {
      await this.destroyBelongId(this.belongId);
    });
  }

  public destroyBelongId(belongId: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.locked) {
        resolve();
        return;
      }
      this.locked = true;

      this.server.close(async () => {
        this.server.disconnect();
        this.server.removeAllListeners();

        socketMap.delete(this.belongId);

        await this.onDestroyed(this.belongId).catch((e) => console.log(e));

        resolve();
      });
    });
  }

  public write(belongId: string, chunk: Buffer): Promise<void> {
    return new Promise((resolve) => {
      this.server.send(chunk, this.port, this.host, () => {
        resolve();
      });
    });
  }
}

export const findSocket = async (
  belongId: string,
): Promise<UDPConnection | undefined> => {
  return socketMap.get(belongId);
};

export const createSocket = async (
  belongId: string,
  connection: Connection,
): Promise<UDPConnection> => {
  if (socketMap.has(belongId)) {
    throw new Error("已经存在相同的socket");
  }

  const udpConnection = new UDPConnection({
    port: connection.localPort,
    host: connection.localHost,
    belongId,
  });

  udpConnection.onData = async (belongId, chunk) => {
    await broadcast.emitAsync(
      `${connection.localPort}.${connection.type}.data.${belongId}`,
      {
        belongId,
        chunk,
      },
    );
  };

  udpConnection.onDestroyed = async (belongId) => {
    await broadcast.emitAsync(
      `${connection.localPort}.${connection.type}.destroyed.${belongId}`,
      {
        belongId,
      },
    );
  };

  await udpConnection.init();

  socketMap.set(belongId, udpConnection);

  return udpConnection;
};
