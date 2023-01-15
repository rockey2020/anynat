export class Adapter {
  protected readonly port: number;

  constructor({ port }: { port: number }) {
    this.port = port;
  }

  public async init(): Promise<any> {
    return this;
  }

  public async write(belongId: string, chunk: Buffer): Promise<void> {}

  public async onConnection(belongId: string): Promise<void> {}

  public async onData(belongId: string, chunk: Buffer): Promise<void> {}

  public async destroyBelongId(belongId: string): Promise<void> {}

  public async onDestroyed(belongId: string): Promise<void> {}
}
