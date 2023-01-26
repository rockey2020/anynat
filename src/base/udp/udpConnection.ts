import EventEmitter2 from "eventemitter2";
import { Adapter } from "../adapter";
import dgram, { Socket, RemoteInfo } from "node:dgram";

export const UDPConnectionBroadcast: EventEmitter2 = new EventEmitter2({
  wildcard: true,
  verboseMemoryLeak: true,
  maxListeners: 10,
});

export const UDPConnectionMap: Map<string, UDPConnection> = new Map();

export class UDPConnection extends Adapter {
  private socket!: Socket;

  public init(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (!this.id) throw new Error("id不存在");

      this.socket = dgram.createSocket({ type: "udp4" });

      this.socket.on("message", async (msg: Buffer, remoteInfo: RemoteInfo) => {
        await this.emitData(this.id as string, msg);
      });

      this.socket.on("error", () => this.emitDestroyed(this.id as string));
      this.socket.on("close", () => this.emitDestroyed(this.id as string));

      const write = (chunk: Buffer): Promise<void> => {
        return new Promise((resolve, reject) => {
          this.socket.send(chunk, this.port, this.host, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      };

      const close = async (): Promise<void> => {
        await this.emitDestroyed(this.id as string);
      };

      this.socketMap.set(this.id, { write, close });

      return resolve(this);
    });
  }

  protected async emitDestroyed(belongId: string): Promise<void> {
    await super.emitDestroyed(belongId);
    this.socketMap.clear();
    this.getBroadcast().removeAllListeners();
    UDPConnectionMap.delete(belongId);
    await UDPConnectionBroadcast.emitAsync(`destroyed.${this.port}`, belongId);
  }

  protected async emitConnection(belongId: string): Promise<void> {
    await super.emitConnection(belongId);
    await UDPConnectionBroadcast.emitAsync(`connection.${this.port}`, belongId);
  }

  protected async emitData(belongId: string, chunk: Buffer): Promise<void> {
    await super.emitData(belongId, chunk);
    await UDPConnectionBroadcast.emitAsync(
      `data.${this.port}`,
      belongId,
      chunk,
    );
  }
}
