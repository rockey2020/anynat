import { Adapter } from "../adapter";
import dgram, { RemoteInfo, Socket } from "dgram";
import { uuid } from "../../utils/uuid";
import { commonSocketHandler } from "./commonSocketHandler";

export class UDPServer extends Adapter {
  private server!: Socket;

  public async init(): Promise<any> {
    this.server = dgram.createSocket("udp4");

    this.server.on("message", async (msg: Buffer, remoteInfo: RemoteInfo) => {
      const socketId = uuid();

      await commonSocketHandler(
        this.server,
        socketId,
        remoteInfo,
        msg,
        this.socketMap,
        this.emitData.bind(this),
        this.emitDestroyed.bind(this),
      );
    });

    this.server.bind(this.port);
    return this;
  }
}
