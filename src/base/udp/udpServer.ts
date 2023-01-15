import { Adapter } from "../adapter";
import dgram from "node:dgram";
import { RemoteInfo, Socket } from "dgram";
import { uuid } from "../../utils/uuid";

export const udpServerMap: Map<number, UDPServer> = new Map();

export class UDPServer extends Adapter {
  private server!: Socket;
  private remoteInfoMap: Map<string, RemoteInfo> = new Map();

  public async init(): Promise<any> {
    this.server = dgram.createSocket("udp4");
    udpServerMap.set(this.port, this);

    this.server.on("message", async (msg: Buffer, remoteInfo: RemoteInfo) => {
      const id = uuid();
      this.remoteInfoMap.set(id, remoteInfo);
      await this.onData(id, msg).catch((e) => console.log(e));
    });

    this.server.bind(this.port);
    return this;
  }

  public async destroyBelongId(belongId: string) {
    this.remoteInfoMap.delete(belongId);
  }

  public write(belongId: string, chunk: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const remoteInfo = this.remoteInfoMap.get(belongId);
      if (!remoteInfo) return resolve();

      this.server.send(chunk, remoteInfo.port, remoteInfo.address, (error) => {
        resolve();
      });
    });
  }
}
