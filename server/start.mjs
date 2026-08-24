// pm2 / 生产环境启动入口
// 说明：tencentProxyServer.mjs 通过 import.meta 判断"是否直接运行"来决定是否启动监听，
// 而 pm2 fork 模式下 process.argv[1] 是 pm2 的 ProcessContainerFork 包装脚本，
// 该判断不会命中——生产环境统一用本文件作为进程入口。
import { startServer } from './tencentProxyServer.mjs';

startServer();
