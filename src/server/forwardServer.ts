import tls, { Server, TLSSocket } from "node:tls";
import net from "node:net";
import { getSSL } from "../utils/getSSL";
import { ConnectionType } from "../../config.base";
import { pipeline } from "node:stream/promises";

export class ForwardServer {
  private readonly binds: Map<
    string,
    {
      domains: Array<string>;
      hasSSL: boolean;
      type: ConnectionType;
      port: number;
    }
  > = new Map();
  private tcpServer!: Server;
  private readonly port: number;

  constructor({ port }: { port: number }) {
    this.port = port;
  }

  public async init(): Promise<ForwardServer> {
    const ssl = await getSSL();

    await this.registerTCPServer(ssl);

    return this;
  }

  private async registerTCPServer(ssl) {
    this.tcpServer = tls.createServer(
      {
        keepAlive: true,
        minVersion: "TLSv1.3",
        key: ssl.private,
        cert: ssl.certificate,
        ca: ssl.certificate,
        dhparam: ssl.dhparam,
      },
      async (socket: TLSSocket) => {
        const bindPortInfo = this.findDomainBindPortInfo(
          // @ts-ignore
          socket?.servername ?? "",
          ConnectionType.TCP,
        );

        if (bindPortInfo) {
          const newSocket = bindPortInfo.hasSSL
            ? tls.connect({
                port: bindPortInfo.port,
                host: "localhost",
                minVersion: "TLSv1.3",
                rejectUnauthorized: false, //忽略证书错误
              })
            : net.createConnection({
                port: bindPortInfo.port,
                host: "localhost",
                keepAlive: true,
              });

          const close = () => {
            newSocket.end();
            newSocket.unref();
            newSocket.destroy();
            newSocket.removeAllListeners();
          };

          newSocket.on("error", (err) => {
            switch (err.message) {
              case "read ECONNRESET":
                newSocket.resume();
                break;
              case "write EPIPE":
                newSocket.resume();
                break;
              default:
                close();
                break;
            }
          });

          newSocket.on("close", close);
          newSocket.on("end", close);
          newSocket.on("timeout", close);

          socket.on("error", (err) => {
            switch (err.message) {
              case "read ECONNRESET":
                socket.resume();
                break;
              case "write EPIPE":
                socket.resume();
                break;
              default:
                //其他错误  不处理
                break;
            }
          });

          await Promise.all([
            pipeline(newSocket, socket),
            pipeline(socket, newSocket),
          ]).catch((e) => {});
        } else {
          socket.end(() => {
            socket.unref();
            socket.destroy();
            socket.removeAllListeners();
          });
        }
      },
    );

    this.tcpServer.listen(this.port);
  }

  public findDomainBindPortInfo(
    servername: string | undefined,
    serverType: ConnectionType,
  ):
    | {
        domains: Array<string>;
        hasSSL: boolean;
        type: ConnectionType;
        port: number;
      }
    | undefined {
    if (!servername || servername.trim().length === 0) return undefined;
    const keys = [...this.binds.keys()];

    for (let k of keys) {
      const item = this.binds.get(k);
      if (k.includes(serverType) && item && item.domains.includes(servername)) {
        return item;
      }
    }

    return undefined;
  }

  public addDomain(
    port: number,
    domains: Array<string>,
    type: ConnectionType,
    hasSSL = false,
  ) {
    if (!domains || domains.length === 0) return;
    this.binds.set(`${port}/${type}`, { domains, hasSSL, type, port });
  }

  public deleteDomain(port) {
    this.binds.delete(port);
  }
}
