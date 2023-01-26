import { Connection } from "../../config.base";
import { TransportType } from "../base/types";
import { ClientTransport } from "./clientTransport";
import { createMQTTClient } from "./mqtt";

export const startClient = async (connection: Connection) => {
  const clientTransport = new ClientTransport({ connection });
  const MQTTClient = await createMQTTClient(
    connection,
    clientTransport.reply.bind(clientTransport),
  );
  clientTransport.setSend(MQTTClient);
  await clientTransport.init();
};

export interface ClientChannelSendParams {
  transportType: TransportType;
  belongId: string;
  connectionKey: string;
  chunk: Buffer;
  clientId: string;
}

export interface ClientChannelReplyParams {
  transportType: TransportType;
  belongId: string;
  connectionKey: string;
  chunk: Buffer;
}

export interface ClientChannelParams {
  serverUrl: string;
  rejectUnauthorized: boolean;
  connection: Connection;
  onReply: (data: ClientChannelReplyParams) => Promise<void>;
}
