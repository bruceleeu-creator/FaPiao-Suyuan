// 一键开发启动器：同时启动后端代理 + 前端 Vite
//
// 背景：此前 `npm run dev` 只启动前端，后端代理（tencentProxyServer.mjs）
// 未启动时，Vite 代理 /api/tencent、/api/deepseek 会返回 HTTP 500，
// 前端 OCR 因此频繁报"请确认后端已启动"。
// 本脚本让一条命令启动全部进程，并负责：
//   - 先启动后端，等待其健康检查通过后再启动前端（消除启动竞态）
//   - 后端崩溃时自动重启（最多 BACKEND_MAX_RESTARTS 次）
//   - 任意进程退出时清理所有子进程，不留孤儿进程
// 零第三方依赖，仅使用 Node 内置模块。
//
// 用法：npm run dev （等价于 npm run dev:all / npm run backend:dev + npm run dev）

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const NODE = process.execPath;
const ROOT = process.cwd();
const BACKEND_SCRIPT = path.join(ROOT, 'server', 'tencentProxyServer.mjs');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const BACKEND_PORT = Number(process.env.BACKEND_PROXY_PORT || 8787);
const BACKEND_MAX_RESTARTS = 10;
const BACKEND_HEALTH_TIMEOUT_MS = 6000;
const BACKEND_RESTART_DELAY_MS = 600;

let shuttingDown = false;
let backend = null;
let vite = null;
let backendRestarts = 0;
let backendReused = false;

function log(tag, message) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}][${tag}] ${message}`);
}

// 启动后端代理进程（崩溃后自动重启，防止开发过程中后端意外退出导致 OCR 500）
function spawnBackend() {
  if (shuttingDown) return;
  log('backend', `启动 node server/tencentProxyServer.mjs（http://127.0.0.1:${BACKEND_PORT}）`);
  backend = spawn(NODE, [BACKEND_SCRIPT], { stdio: 'inherit' });
  backend.on('exit', (code, signal) => {
    log('backend', `进程退出 code=${code} signal=${signal}`);
    backend = null;
    if (shuttingDown) return;
    if (backendRestarts < BACKEND_MAX_RESTARTS) {
      backendRestarts += 1;
      log('backend', `${BACKEND_RESTART_DELAY_MS}ms 后自动重启（第 ${backendRestarts}/${BACKEND_MAX_RESTARTS} 次）...`);
      setTimeout(spawnBackend, BACKEND_RESTART_DELAY_MS);
    } else {
      log('backend', `连续崩溃超过 ${BACKEND_MAX_RESTARTS} 次，停止自动重启；前端将自动使用模拟识别模式，不影响演示。`);
    }
  });
}

// 轮询后端健康检查，等待其就绪
async function probeBackend() {
  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true && data?.service === 'invoice-evidence-backend-proxy';
  } catch {
    return false;
  }
}

async function waitForBackend(timeoutMs = BACKEND_HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeBackend()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// 等待后端就绪后启动前端 Vite
async function startVite() {
  log('vite', '等待后端就绪...');
  const ready = await waitForBackend();
  if (ready) {
    log('vite', '后端已就绪，启动前端...');
  } else {
    log('vite', `警告：后端 ${BACKEND_PORT} 未在 ${BACKEND_HEALTH_TIMEOUT_MS}ms 内就绪，仍启动前端；期间 OCR/DeepSeek 自动使用模拟模式，不影响演示。`);
  }
  vite = spawn(NODE, [VITE_BIN, '--host', '127.0.0.1'], { stdio: 'inherit' });
  vite.on('exit', (code, signal) => {
    log('vite', `进程退出 code=${code} signal=${signal}`);
    if (!shuttingDown) shutdown('vite-exit');
  });
}

// 清理所有子进程后退出
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('dev', `收到 ${reason}，正在关闭后端与前端...`);
  if (backend && !backendReused) backend.kill('SIGTERM');
  if (vite) vite.kill('SIGTERM');
  // 给子进程优雅关闭留出时间
  setTimeout(() => process.exit(0), 600).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 启动前检查依赖
if (!fs.existsSync(BACKEND_SCRIPT)) {
  console.error(`[dev] 找不到后端脚本：${BACKEND_SCRIPT}`);
  process.exit(1);
}
if (!fs.existsSync(VITE_BIN)) {
  console.error('[dev] 找不到 vite，请先执行 npm install');
  process.exit(1);
}

async function main() {
  // 若端口上已有健康的后端（例如用户另开终端运行了 npm run backend:dev），
  // 直接复用，避免 EADDRINUSE 崩溃循环
  if (await waitForBackend(1500)) {
    backendReused = true;
    log('backend', `检测到后端已在 ${BACKEND_PORT} 端口运行，直接复用，不再重复启动。`);
  } else {
    spawnBackend();
  }
  void startVite();
}

void main();