import net, { Server } from "node:net";
import { Adapter } from "../adapter";
import { uuid } from "../../utils/uuid";
import { commonSocketHandler } from "./commonSocketHandler";

export class TCPServer extends Adapter {
  private server: Server | undefined;

  async init(): Promise<any> {
    this.server = net.createServer({
      keepAlive: true,
    });

    this.server.on("connection", async (socket) => {
      await commonSocketHandler(
        socket,
        uuid(),
        this.emitConnection.bind(this),
        this.socketMap,
        this.emitData.bind(this),
        this.emitDestroyed.bind(this),
      );
    });

    this.server.listen(this.port, this.host);

    return this;
  }
}
