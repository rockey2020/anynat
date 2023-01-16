import Aedes, { AedesOptions } from "aedes";
import { getSSL } from "../utils/getSSL";
import { Connection, ConnectionType, ServerConfig } from "../../config.base";
import { AedesPublishPacket } from "aedes:packet";
import { Client } from "aedes:client";
import { TCPServer, tcpServerMap } from "../base/tcp/tcpServer";
import { CoreCrypto } from "core.crypto";
import Transformer from "../utils/transformer";
import { getConfig } from "../utils/getConfig";
import { UDPServer, udpServerMap } from "../base/udp/udpServer";
import { ForwardServer } from "./forwardServer";
import http2, { SecureServerOptions } from "node:http2";
import ws from "websocket-stream";
import tls from "node:tls";

const isDebug = getConfig.isDebug;

const onClientPublishHandler = async (
  packet: AedesPublishPacket,
  client: Client | null,
) => {
  const topic2Array = packet.topic.split("/");
  const messageType = topic2Array[0];
  const belongId = topic2Array[1] || "";
  const bindPort = client?.id ? Number(client.id.split("/")[0]) : undefined;
  const connection = (getConfig.client?.connections ?? []).find(
    (value) => value.bindPort === bindPort,
  );
  const findServer: TCPServer | UDPServer | undefined = bindPort
    ? connection?.type === ConnectionType.TCP
      ? tcpServerMap.get(bindPort)
      : udpServerMap.get(bindPort)
    : undefined;

  if (!findServer || !connection) return;

  switch (messageType) {
    case "message":
      if (packet.payload) {
        const coreCrypto = new CoreCrypto();
        await coreCrypto.setIv(connection.encryption.iv);
        await coreCrypto.setAesKey(connection.encryption.aesKey);
        isDebug && console.log(`server: 开始传输2 === `, belongId);
        await findServer.write(
          belongId,
          (await Transformer.decryption(
            coreCrypto,
            packet.payload as Buffer,
          )) as Buffer,
        );
        isDebug && console.log(`server: 传输完成2 === `, belongId);
      }
      break;

    case "destroyed":
      isDebug && console.log(`server: 开始销毁2 === `, belongId);
      await findServer.destroyBelongId(belongId);
      isDebug && console.log(`server: 销毁完成2 === `, belongId);
      break;
  }
};

const initProxyServer = async (connection: Connection, aedesServer: Aedes) => {
  const clientId = `${connection.bindPort}/${connection.uuid}/${connection.secretKey}`;
  const coreCrypto = new CoreCrypto();
  await coreCrypto.setIv(connection.encryption.iv);
  await coreCrypto.setAesKey(connection.encryption.aesKey);

  const server: TCPServer | UDPServer =
    connection.type === ConnectionType.TCP
      ? ((await new TCPServer({
          port: connection.bindPort,
        }).init()) as TCPServer)
      : ((await new UDPServer({
          port: connection.bindPort,
        }).init()) as UDPServer);

  server.onConnection = (belongId) => {
    return new Promise(async (resolve, reject) => {
      // @ts-ignore
      const client: Client | undefined = (aedesServer?.clients || {})[clientId];

      //客户端未连接 则直接关闭socket
      if (!client) {
        await server.destroyBelongId(belongId);
        return reject("客户端未连接");
      }

      isDebug && console.log(`server: 开始创建 === `, belongId);

      client.publish(
        {
          cmd: "publish",
          dup: false,
          qos: getConfig.server?.qos ?? 0,
          retain: false,
          topic: `connection/${belongId}`,
          payload: "",
        },
        (error) => {
          isDebug && console.log(`server: 创建完成 === `, belongId);
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        },
      );
    });
  };

  server.onData = (belongId, chunk) => {
    return new Promise(async (resolve, reject) => {
      // @ts-ignore
      const client: Client | undefined = (aedesServer?.clients || {})[clientId];

      //客户端未连接 则直接关闭socket
      if (!client) {
        await server.destroyBelongId(belongId);
        return reject("客户端未连接");
      }

      isDebug && console.log(`server: 开始传输 === `, belongId);

      client.publish(
        {
          cmd: "publish",
          dup: false,
          qos: getConfig.server?.qos ?? 0,
          retain: false,
          topic: `message/${belongId}`,
          payload: (await Transformer.encryption(coreCrypto, chunk)) as Buffer,
        },
        (error) => {
          isDebug && console.log(`server: 传输完成 === `, belongId);
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        },
      );
    });
  };

  server.onDestroyed = (belongId) => {
    return new Promise(async (resolve, reject) => {
      // @ts-ignore
      const client: Client | undefined = (aedesServer?.clients || {})[clientId];

      //客户端未连接 则忽略
      if (!client) {
        return reject("客户端未连接");
      }

      isDebug && console.log(`server: 开始销毁 === `, belongId);

      client.publish(
        {
          cmd: "publish",
          dup: false,
          qos: getConfig.server?.qos ?? 0,
          retain: false,
          topic: `destroyed/${belongId}`,
          payload: "",
        },
        (error) => {
          isDebug && console.log(`server: 销毁完成 === `, belongId);
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        },
      );
    });
  };
};

const initForwardServer = async (
  serverConfig: ServerConfig,
  connections: Array<Connection>,
): Promise<ForwardServer> => {
  const forwardServer = await new ForwardServer({
    port: serverConfig.forwardServer?.port ?? 0,
  }).init();

  for (let connection of connections) {
    forwardServer.addDomain(
      connection.bindPort,
      connection.bindDomains ?? [],
      connection.type,
      connection.hasSSL,
    );
  }

  return forwardServer;
};

const createMqttServer = async (
  serverConfig: ServerConfig,
): Promise<{ aedesServer: Aedes }> => {
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

  switch (serverConfig.mode) {
    case "wss":
      const httpServer = http2.createSecureServer(tlsOptions);

      ws.createServer(
        {
          server: httpServer as any,
          maxPayload: Infinity,
          perMessageDeflate: false,
        },
        aedesServer.handle as any,
      );

      httpServer.listen(serverConfig.port, () => {
        console.log(`server:${serverConfig.port} 启动成功`);
      });

      return { aedesServer };
      break;
    default:
      const tlsServer = tls.createServer(tlsOptions, aedesServer.handle as any);
      tlsServer.listen(serverConfig.port, () => {
        console.log(`server:${serverConfig.port} 启动成功`);
      });
      return { aedesServer };
      break;
  }
};

export const startServer = async (
  serverConfig: ServerConfig | undefined,
  connections: Array<Connection>,
) => {
  if (!serverConfig) return;

  const forwardServer = await initForwardServer(serverConfig, connections);
  const { aedesServer } = await createMqttServer(serverConfig);

  forwardServer.addDomain(
    serverConfig.port as number,
    serverConfig.bindDomains,
    ConnectionType.TCP,
    true,
  );

  for (let connection of connections) {
    await initProxyServer(connection, aedesServer);
  }

  aedesServer.on("publish", onClientPublishHandler);
};
