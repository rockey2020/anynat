import { getSSL } from "../../utils/getSSL";
import { IClientOptions } from "mqtt";
import { Connection, ConnectionType } from "../../../config.base";
import mqtt from "mqtt";
import { ClientChannelReplyParams, ClientChannelSendParams } from "../index";
import { IPublishPacket } from "mqtt-packet";
import { TransportType } from "../../base/types";

export const createMQTTClient = async (
  connection: Connection,
  callback: (data: ClientChannelReplyParams) => Promise<void>,
) => {
  const ssl = await getSSL();

  const mqttOptions: IClientOptions = {
    key: ssl.private,
    cert: ssl.certificate,
    ca: ssl.certificate,
    keepalive: 3,
    protocolVersion: 4,
    clientId: `${connection.bindPort}/${connection.type}/${connection.uuid}/${connection.secretKey}`,
    rejectUnauthorized: connection.rejectUnauthorized ?? true,
    wsOptions: {
      minVersion: "TLSv1.3",
      maxPayload: Infinity,
      perMessageDeflate: false,
    },
  };
  const client = mqtt.connect(connection.serverUrl, mqttOptions);

  client.on("error", (error) => {
    console.log(`client:${connection.serverUrl} 出错`, error);
  });

  client.on("disconnect", () => {
    console.log(`client:${connection.serverUrl} 连接断开`);
  });

  client.on("close", () => {
    console.log(`client:${connection.serverUrl} 关闭`);
  });

  client.on(
    "message",
    async (topic: string, payload: Buffer, packet: IPublishPacket) => {
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
        chunk: payload,
        connectionKey: `${bindPort}/${connectionType}`,
        transportType,
      });
    },
  );

  client.on("connect", () => {
    console.log(`client:${connection.serverUrl} 已连接`);
  });

  return (data: ClientChannelSendParams): Promise<void> => {
    return new Promise((resolve, reject) => {
      const topic = `${connection.bindPort}/${connection.type}/${data.transportType}/${data.belongId}`;

      if (!client.connected) {
        return reject("离线");
      }

      client.publish(
        topic,
        data.chunk,
        {
          dup: false,
          qos: connection.qos ?? 0,
          retain: false,
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
