import { getSSL } from "../../utils/getSSL";
import { SecureServerOptions } from "http2";
import Aedes, { AedesOptions } from "aedes";
import http2 from "node:http2";
import tls from "node:tls";
import ws from "websocket-stream";
import { ServerChannelReplyParams, ServerChannelSendParams } from "../index";
import { ConnectionType, ServerMode } from "../../../config.base";
import { AedesPublishPacket } from "packet";
import { Client } from "aedes:client";
import { TransportType } from "../../base/types";
import { getConfig } from "../../utils/getConfig";

export const createMQTTServer = async (
  callback: (data: ServerChannelReplyParams) => Promise<void>,
) => {
  const ssl = await getSSL();

  const aedesOptions: AedesOptions = {
    concurrency: Infinity,
    queueLimit: 2048,
    maxClientsIdLength: Infinity,
    heartbeatInterval: 3000,
  };

  const tlsOptions: SecureServerOptions = {
    key: ssl.private,
    cert: ssl.certificate,
    ca: ssl.certificate,
    dhparam: ssl.dhparam,
    minVersion: "TLSv1.3",
    keepAlive: true,
    allowHTTP1: true,
  };

  const aedesServer = new Aedes(aedesOptions);

  switch (getConfig.server?.mode || ServerMode.MQTTS) {
    case ServerMode.WSS:
      const httpServer = http2.createSecureServer(tlsOptions);

      ws.createServer(
        {
          server: httpServer as any,
          maxPayload: Infinity,
          perMessageDeflate: false,
        },
        aedesServer.handle as any,
      );

      httpServer.listen(getConfig.server?.port || 0, () => {
        console.log(`server:${getConfig.server?.port || 0} 已启动`);
      });

      break;
    default:
      const tlsServer = tls.createServer(tlsOptions, aedesServer.handle as any);

      tlsServer.listen(getConfig.server?.port || 0, () => {
        console.log(`server:${getConfig.server?.port || 0} 已启动`);
      });
      break;
  }

  aedesServer.on(
    "publish",
    async (packet: AedesPublishPacket, client: Client | null) => {
      const topic2Array = packet.topic.split("/");
      const bindPort = Number(topic2Array[0]);
      const connectionType: ConnectionType = topic2Array[1] as ConnectionType;
      const transportType: TransportType = topic2Array[2] as TransportType;
      const belongId = topic2Array[3];

      if (!bindPort || !connectionType || !transportType || !belongId) {
        return;
      }

      await callback({
        belongId,
        chunk: packet.payload as Buffer,
        connectionKey: `${bindPort}/${connectionType}`,
        transportType,
      });
    },
  );

  return (data: ServerChannelSendParams): Promise<void> => {
    return new Promise((resolve, reject) => {
      const topic = `${data.connection.bindPort}/${data.connection.type}/${data.transportType}/${data.belongId}`;
      const clientId = `${data.connection.bindPort}/${data.connection.type}/${data.connection.uuid}/${data.connection.secretKey}`;
      // @ts-ignore
      const client: Client | undefined = (aedesServer?.clients || {})[clientId];

      if (!client) {
        return reject("客户端未连接");
      }

      client.publish(
        {
          cmd: "publish",
          dup: false,
          qos: getConfig.server?.qos ?? 0,
          retain: false,
          topic,
          payload: data.chunk,
        },
        (error) => {
          if (error) {
            return reject(error);
          }

          resolve();
        },
      );
    });
  };
};
