export enum ServerMode {
  MQTTS = "mqtts",
  WSS = "WSS",
}

const baseConfig: BaseConfig = {
  isDebug: false,
  server: {
    mode: ServerMode.MQTTS,
    port: 2333,
    bindDomains: [],
    forwardServer: {
      port: 443,
    },
  },
  client: {
    connections: [],
  },
};

export { baseConfig };

export interface EncryptionConfig {
  aesKey: JsonWebKey;
  iv: Uint8Array;
}

export interface Connection {
  type: ConnectionType;
  serverUrl: string;
  //连接的uuid
  uuid: string;
  //连接的秘钥
  secretKey: string;
  //本地代理配置
  localPort: number;
  localHost: string;
  bindPort: number;
  bindDomains?: Array<string>;
  encryption: EncryptionConfig;
  //需要穿透的本地服务是否有证书 默认是没有证书 如果该项不填写准备无法将内网服务穿透出去
  hasSSL?: boolean;
  //证书错误是否报错 关闭这个选项会导致中间人攻击
  rejectUnauthorized?: boolean;
  qos?: 0 | 1 | 2; //QoS传输控制 默认0 https://www.emqx.com/zh/blog/introduction-to-mqtt-qos
}

export interface ServerConfig {
  mode?: ServerMode; //提供两种传输方式 默认mqtts 但是mqtts大部分cdn厂商都不支持 没办法使用cdn wss是加密websocket基本都支持
  port?: number;
  qos?: 0 | 1 | 2; //QoS传输控制 默认0 https://www.emqx.com/zh/blog/introduction-to-mqtt-qos
  //server client 绑定的通信域名
  bindDomains?: Array<string>;
  forwardServer?: {
    port?: number;
  };
}

export interface ClientConfig {
  connections?: Array<Connection>;
}

export interface BaseConfig {
  isDebug?: boolean;
  client?: ClientConfig;
  server?: ServerConfig;
}

export enum ConnectionType {
  TCP = "tcp",
  UDP = "udp",
}
