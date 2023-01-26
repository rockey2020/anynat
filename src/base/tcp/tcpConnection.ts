import { Adapter } from "../adapter";
import net, { Socket } from "node:net";
import { commonSocketHandler } from "./commonSocketHandler";
import EventEmitter2 from "eventemitter2";

export const TCPConnectionBroadcast: EventEmitter2 = new EventEmitter2({
  wildcard: true,
  verboseMemoryLeak: true,
  maxListeners: 10,
});

export const TCPConnectionMap: Map<string, TCPConnection> = new Map();

export class TCPConnection extends Adapter {
  private socket!: Socket;

  public init(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.id) throw new Error("id不存在");

      this.socket = net.createConnection({
        port: this.port,
        host: this.host,
        keepAlive: true,
      });

      this.socket.on("connect", async () => {
        await commonSocketHandler(
          this.socket,
          this.id as string,
          this.emitConnection.bind(this),
          this.socketMap,
          this.emitData.bind(this),
          this.emitDestroyed.bind(this),
        );
        TCPConnectionMap.set(this.id as string, this);

        return resolve(this);
      });
    });
  }

  protected async emitDestroyed(belongId: string): Promise<void> {
    await super.emitDestroyed(belongId);
    this.socketMap.clear();
    this.getBroadcast().removeAllListeners();
    TCPConnectionMap.delete(belongId);
    await TCPConnectionBroadcast.emitAsync(`destroyed.${this.port}`, belongId);
  }

  protected async emitConnection(belongId: string): Promise<void> {
    await super.emitConnection(belongId);
    await TCPConnectionBroadcast.emitAsync(`connection.${this.port}`, belongId);
  }

  protected async emitData(belongId: string, chunk: Buffer): Promise<void> {
    await super.emitData(belongId, chunk);
    await TCPConnectionBroadcast.emitAsync(
      `data.${this.port}`,
      belongId,
      chunk,
    );
  }
}
