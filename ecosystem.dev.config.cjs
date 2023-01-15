const pm2 = require('pm2')
const process = require('node:process')

const config = {
  name: "anynat",
  script: "./dist-dev/index.js",
  args: "start",
  node_args: "--expose-gc --trace-warnings",
  instances: 1,//0:根据cpu核数启动对应的进程数量
  exec_mode: "cluster",//cluster or fork
  watch: ["./dist-dev"], //监听变化重载应用
  max_memory_restart: "500M",//超出最大内存就重启应用
  autorestart: true,//应用崩溃的时候自动重启
  max_restarts: 10,//最大重启次数
  restart_delay: 1000,//延时重启
  error_file: "./logs/pm2/logs/error.log",
  out_file: "./logs/pm2/logs/console.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  env: {
    NODE_ENV: "production",
  }
}

pm2.connect(() => {
  const exit = (processName = "") => {
    return new Promise((resolve, reject) => {
      pm2.stop(processName, () => {
        pm2.delete(processName, () => {
          resolve()
        })
      })
    })
  }

  process.on('SIGINT', async () => {
    await exit(config.name)
    process.exit(2)
  })

  pm2.start(config)
})