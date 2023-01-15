import mqtt from "mqtt";
import { Connection, ConnectionType } from "../../config.base";
import { IClientOptions, MqttClient } from "mqtt/types/lib/client";
import { getSSL } from "../utils/getSSL";
import { IPublishPacket } from "mqtt-packet";
import {
  broadcast as TCPBroadcast,
  createSocket as createTCPSocket,
  findSocket as findTCPSocket,
} from "../base/tcp/tcpConnectionManage";
import {
  broadcast as UDPBroadcast,
  createSocket as createUDPSocket,
  findSocket as findUDPSocket,
} from "../base/udp/udpConnectionManage";
import { CoreCrypto } from "core.crypto";
import Transformer from "../utils/transformer";
import EventEmitter2 from "eventemitter2";
import { getConfig } from "../utils/getConfig";

const isDebug = getConfig.isDebug;

const initBroadcast = async (
  connection: Connection,
  client: MqttClient,
  coreCrypto: CoreCrypto,
) => {
  const broadcast: EventEmitter2 =
    connection.type === ConnectionType.TCP ? TCPBroadcast : UDPBroadcast;
  const findSocket =
    connection.type === ConnectionType.TCP ? findTCPSocket : findUDPSocket;

  broadcast.on(
    `${connection.localPort}.${connection.type}.data.*`,
    ({ belongId, chunk }) => {
      return new Promise(async (resolve, reject) => {
        //掉线 则直接关闭socket
        if (!client.connected) {
          const socket = await findSocket(belongId);
          if (socket) {
            await socket.destroyBelongId(belongId);
          }
          return reject("离线");
        }

        isDebug && console.log(`client: 开始传输2 === `, belongId);
        client.publish(
          `message/${belongId}`,
          (await Transformer.encryption(coreCrypto, chunk)) as Buffer,
          {
            dup: false,
            qos: connection.qos ?? 0,
            retain: false,
          },
          (error) => {
            isDebug && console.log(`client: 传输完成2 === `, belongId);
            if (error) {
              reject(error);
            } else {
              resolve(undefined);
            }
          },
        );
      });
    },
  );
  broadcast.on(
    `${connection.localPort}.${connection.type}.destroyed.*`,
    ({ belongId }) => {
      return new Promise(async (resolve, reject) => {
        //掉线 则忽略
        if (!client.connected) {
          return reject("离线");
        }

        isDebug && console.log(`client: 开始销毁2 === `, belongId);
        client.publish(
          `destroyed/${belongId}`,
          "",
          {
            dup: false,
            qos: connection.qos ?? 0,
            retain: false,
          },
          (error) => {
            isDebug && console.log(`client: 销毁完成2 === `, belongId);
            if (error) {
              reject(error);
            } else {
              resolve(undefined);
            }
          },
        );
      });
    },
  );
};

const onMessageHandler = async (
  connection: Connection,
  coreCrypto: CoreCrypto,
  topic: string,
  payload: Buffer,
  packet: IPublishPacket,
) => {
  const topic2Array = topic.split("/");
  const messageType = topic2Array[0];
  const belongId = topic2Array[1];

  const createSocket =
    connection.type === ConnectionType.TCP ? createTCPSocket : createUDPSocket;
  const findSocket =
    connection.type === ConnectionType.TCP ? findTCPSocket : findUDPSocket;

  switch (messageType) {
    case "connection":
      isDebug && console.log(`client: 开始创建 === `, belongId);
      await createSocket(belongId, connection);
      isDebug && console.log(`client: 创建完成 === `, belongId);
      break;

    case "message":
      let socket = await findSocket(belongId);
      //udp协议不需要connection  所以要在message层做createSocket操作
      if (connection.type === ConnectionType.UDP && !socket) {
        socket = await createSocket(belongId, connection);
      }
      if (!socket) return;

      isDebug && console.log(`client: 开始传输 === `, belongId);
      if (payload) {
        await socket.write(
          belongId,
          (await Transformer.decryption(coreCrypto, payload)) as Buffer,
        );
      }
      isDebug && console.log(`client: 传输完成 === `, belongId);
      break;

    case "destroyed":
      const socket2 = await findSocket(belongId);
      if (!socket2) return;

      isDebug && console.log(`client: 开始销毁 === `, belongId);
      await socket2.destroyBelongId(belongId);
      isDebug && console.log(`client: 销毁完成 === `, belongId);
      break;
  }
};

export const startClient = async (connection: Connection) => {
  const ssl = await getSSL();

  const coreCrypto = new CoreCrypto();
  await coreCrypto.setIv(connection.encryption.iv);
  await coreCrypto.setAesKey(connection.encryption.aesKey);

  const mqttOptions: IClientOptions = {
    key: ssl.private,
    cert: ssl.certificate,
    ca: ssl.certificate,
    keepalive: 3,
    protocolVersion: 4,
    clientId: `${connection.bindPort}/${connection.uuid}/${connection.secretKey}`,
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
    console.log(`client:${connection.serverUrl} 断开连接`);
  });

  client.on("close", () => {
    console.log(`client:${connection.serverUrl} 关闭`);
  });

  client.on("message", (...args) =>
    onMessageHandler(connection, coreCrypto, ...args),
  );

  client.on("connect", () => {
    console.log(`client:${connection.serverUrl} 连接成功`);
  });

  await initBroadcast(connection, client, coreCrypto);
};
