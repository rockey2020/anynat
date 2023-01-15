import { Adapter } from "../adapter";
import net, { Socket, Server } from "node:net";
import { uuid } from "../../utils/uuid";
import PQueue from "p-queue";

export const tcpServerMap: Map<number, TCPServer> = new Map();

export class TCPServer extends Adapter {
  private server: Server | undefined;
  private readonly socketMap: Map<
    string,
    { close: () => Promise<void>; write: (chunk: Buffer) => Promise<void> }
  > = new Map();

  public async init(): Promise<any> {
    this.server = net.createServer({
      keepAlive: true,
    });

    tcpServerMap.set(this.port, this);

    this.server.on("connection", async (socket) => {
      socket.setTimeout(1000 * 60); //60秒超时
      const id = uuid();
      const readQueue = new PQueue({
        concurrency: 1,
        //任务超时直接记作失败
        timeout: 1000 * 60,
        throwOnTimeout: true,
      });
      const writeQueue = new PQueue({
        concurrency: 1,
        //任务超时直接记作失败
        timeout: 1000 * 60,
        throwOnTimeout: true,
      });

      let locked = false;

      const close = (): Promise<void> => {
        return new Promise(async (resolve) => {
          if (!this.socketMap.has(id) || locked) {
            resolve();
            return;
          }

          locked = true;

          const handler = () => {
            if (
              writeQueue.size === 0 &&
              writeQueue.pending === 0 &&
              readQueue.size === 0 &&
              readQueue.pending === 0
            ) {
              socket.end(async () => {
                socket.unref();
                socket.destroy();
                socket.removeAllListeners();

                readQueue.clear();
                writeQueue.clear();
                readQueue.removeAllListeners();
                writeQueue.removeAllListeners();

                this.socketMap.delete(id);

                await this.onDestroyed(id).catch((e) => console.log(e));

                resolve(undefined);
              });
            }
          };

          readQueue.on("idle", handler);
          writeQueue.on("idle", handler);

          handler();
        });
      };

      const write = async (chunk: Buffer) => {
        await writeQueue.add(() => {
          return new Promise((resolve) => {
            socket.write(chunk, () => resolve(undefined));
          });
        });
      };

      this.socketMap.set(id, { close, write });

      try {
        //需要等客户端创建socket
        await this.onConnection(id);
      } catch (e) {
        console.log("server: 创建连接失败");
        await close();
        return;
      }

      socket.on("data", async (chunk: Buffer) => {
        socket.pause();
        try {
          await readQueue.add(() => this.onData(id, chunk));
        } catch (e) {
          await close();
          return;
        }
        socket.resume();
      });

      socket.on("error", (err) => {
        switch (err.message) {
          case "read ECONNRESET":
            socket.resume();
            break;
          case "write EPIPE":
            socket.resume();
            break;
          default:
            close();
            break;
        }
      });

      socket.on("close", close);

      socket.on("end", close);

      socket.on("timeout", close);
    });

    this.server.listen(this.port);
    return this;
  }

  public async destroyBelongId(belongId: string) {
    const socket = this.socketMap.get(belongId);
    if (!socket) return;
    await socket.close();
  }

  public async write(belongId: string, chunk: Buffer): Promise<void> {
    const socket = this.socketMap.get(belongId);
    if (!socket) return;

    await socket.write(chunk);
  }
}
