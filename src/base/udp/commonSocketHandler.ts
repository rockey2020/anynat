import { Socket, RemoteInfo } from "node:dgram";

export const commonSocketHandler = async (
  server: Socket,
  socketId: string,
  remoteInfo: RemoteInfo,
  msg: Buffer,
  socketMap,
  emitData,
  emitDestroyed,
) => {
  const write = (chunk: Buffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      server.send(chunk, remoteInfo.port, remoteInfo.address, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  };

  const close = async (): Promise<void> => {
    await emitDestroyed(socketId);
  };

  socketMap.set(socketId, { write, close });

  await emitData(socketId, msg);
};
