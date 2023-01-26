import { Connection, ConnectionType, ServerConfig } from "../../config.base";
import { TransportType } from "../base/types";
import { ServerTransport } from "./serverTransport";
import { createMQTTServer } from "./mqtt";
import { ForwardServer } from "./forwardServer";
import { getConfig } from "../utils/getConfig";

export const startServer = async (
  serverConfig: ServerConfig,
  connections: Array<Connection>,
) => {
  const forwardServer = await new ForwardServer({
    port: getConfig.server?.forwardServer?.port || 0,
  }).init();
  const serverTransport = new ServerTransport({ connections });
  const MQTTServer = await createMQTTServer(
    serverTransport.reply.bind(serverTransport),
  );
  serverTransport.setSend(MQTTServer);
  await serverTransport.init();

  forwardServer.addDomain({
    port: getConfig.server?.port || 0,
    domains: getConfig.server?.bindDomains ?? [],
    type: ConnectionType.TCP,
    hasSSL: true,
  });

  for (let item of connections) {
    forwardServer.addDomain({
      port: item.bindPort,
      domains: item.bindDomains ?? [],
      type: item.type,
      hasSSL: item.hasSSL ?? false,
    });
  }
};

export interface ServerChannelSendParams {
  transportType: TransportType;
  belongId: string;
  connectionKey: string;
  connection: Connection;
  chunk: Buffer;
}

export interface ServerChannelReplyParams {
  transportType: TransportType;
  belongId: string;
  connectionKey: string;
  chunk: Buffer;
}
