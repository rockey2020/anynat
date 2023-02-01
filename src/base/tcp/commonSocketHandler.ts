import { Socket } from "node:net";

export const commonSocketHandler = async (
  socket: Socket,
  socketId,
  emitConnection,
  socketMap,
  emitData,
  emitDestroyed,
) => {
  socket.setTimeout(1000 * 30); //socket超时配置

  //暂停socket
  socket.pause();

  const write = (chunk: Buffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.write(chunk, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  };

  const close = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.end(() => {
        socket.unref();
        socket.destroy();
        socket.removeAllListeners();

        resolve();
      });
    });
  };

  //将socket缓存起来 以便后续的操作
  socketMap.set(socketId, { close, write });

  socket.on("data", async (chunk: Buffer) => {
    //读取到一段数据后先暂停 传给client 传送完成后再接着传下一段数据
    socket.pause();
    await emitData(socketId, chunk);
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
        emitDestroyed(socketId);
        break;
    }
  });

  socket.on("close", () => emitDestroyed(socketId));

  socket.on("end", () => emitDestroyed(socketId));

  socket.on("timeout", () => emitDestroyed(socketId));

  //建立连接 建立完成之后再恢复socket
  await emitConnection(socketId);

  socket.resume();
};
