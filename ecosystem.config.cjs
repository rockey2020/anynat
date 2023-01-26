const os = require('node:os');
const systemMemory = os.totalmem() / 1024 / 1024 //系统总内存 单位M
const max_memory_restart = Math.ceil(systemMemory * 0.8) + "M"

module.exports = {
  apps: [
    {
      name: "anynat",
      script: "./dist-prod/index.js",
      args: "start",
      node_args: "--expose-gc --trace-warnings",
      instances: 1,//0:根据cpu核数启动对应的进程数量
      exec_mode: "cluster",//cluster or fork
      watch: ["./dist-prod"], //监听变化重载应用
      max_memory_restart,//超出最大内存就重启应用
      autorestart: true,//应用崩溃的时候自动重启
      max_restarts: Infinity,//最大重启次数
      restart_delay: 5000,//延时重启
      error_file: "./logs/pm2/logs/error.log",
      out_file: "./logs/pm2/logs/console.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
      },
    }
  ]
}
