import EventEmitter2 from "eventemitter2";

export class Adapter {
  protected id?: string;
  protected readonly port: number;
  protected readonly host: string = "localhost";
  protected socketMap: Map<
    string,
    { close: () => Promise<void>; write: (chunk: Buffer) => Promise<void> }
  > = new Map();
  private readonly broadcast: EventEmitter2 = new EventEmitter2({
    wildcard: true,
    verboseMemoryLeak: true,
    maxListeners: 10,
  });

  constructor({
    port,
    id,
    host,
  }: {
    port: number;
    id?: string;
    host?: string;
  }) {
    this.port = port;
    this.id = id;
    this.host = host ?? this.host;
  }

  public async init(): Promise<any> {
    return this;
  }

  public async write(belongId: string, chunk: Buffer): Promise<void> {
    const socket = this.socketMap.get(belongId);
    if (!socket) {
      return;
    }

    await socket.write(chunk);
  }

  public async destroyBelongId(belongId: string): Promise<void> {
    await this.emitDestroyed(belongId);
  }

  public getBroadcast(): EventEmitter2 {
    return this.broadcast;
  }

  protected async emitConnection(belongId: string): Promise<void> {
    await this.broadcast.emitAsync(`connection`, belongId);
  }

  protected async emitData(belongId: string, chunk: Buffer): Promise<void> {
    await this.broadcast.emitAsync(`data`, belongId, chunk);
  }

  protected async emitDestroyed(belongId: string): Promise<void> {
    const socket = this.socketMap.get(belongId);
    if (!socket) {
      return;
    }

    this.socketMap.delete(belongId);
    await socket.close();
    await this.broadcast.emitAsync(`destroyed`, belongId);
  }
}
