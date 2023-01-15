import { startServer } from "./server";
import { startClient } from "./client";
import { getConfig } from "./utils/getConfig";

// process.env.VITE_RUNTIME_TYPE docker环境的时候 设置的环境变量
const VITE_RUNTIME_TYPE: "server" | "client" | "both" =
  process.env.VITE_RUNTIME_TYPE ||
  // @ts-ignore 这里不能用可选链语法 会导致env为空
  import.meta.env.VITE_RUNTIME_TYPE ||
  "server";

if (VITE_RUNTIME_TYPE === "server") {
  startServer(getConfig.server, getConfig?.client?.connections ?? []);
}

if (VITE_RUNTIME_TYPE === "client") {
  for (let connection of getConfig?.client?.connections ?? []) {
    startClient(connection);
  }
}

if (VITE_RUNTIME_TYPE === "both") {
  startServer(getConfig.server, getConfig?.client?.connections ?? []).then(
    async () => {
      for (let connection of getConfig?.client?.connections ?? []) {
        await startClient(connection);
      }
    },
  );
}
