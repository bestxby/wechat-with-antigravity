import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { logger } from '../logger.js';
import { DATA_DIR } from '../constants.js';

let retryTimeout: NodeJS.Timeout | null = null;

function isLockActive(): boolean {
  try {
    const lockPath = path.join(DATA_DIR, 'listener.lock');
    if (fs.existsSync(lockPath)) {
      const pidStr = fs.readFileSync(lockPath, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && pid > 0) {
        process.kill(pid, 0); // Throws error if process does not exist
        return true;
      }
    }
  } catch (e) {}
  return false;
}

export type DaemonStatus = 'stopped' | 'starting' | 'running' | 'error';

type DaemonStateCallback = (status: DaemonStatus) => void;

let daemonProcess: ChildProcess | null = null;
let restartCount = 0;
const MAX_RESTARTS = 3;
let outputChannel: vscode.OutputChannel | null = null;
let stateCallback: DaemonStateCallback | null = null;

function log(msg: string) {
  outputChannel?.appendLine(`[WeChat Daemon] ${msg}`);
  logger.info(`[WeChat Daemon] ${msg}`);
}

export function initDaemon(channel: vscode.OutputChannel, onStateChange: DaemonStateCallback) {
  outputChannel = channel;
  stateCallback = onStateChange;
}

export function getDaemonStatus(): DaemonStatus {
  if (!daemonProcess) return 'stopped';
  if (daemonProcess.exitCode !== null) return 'stopped';
  return 'running';
}

let activeWorkspacePath = '';

export function startDaemon(extensionPath: string, workspacePath?: string): void {
  if (workspacePath) {
    activeWorkspacePath = workspacePath;
  }
  if (daemonProcess && daemonProcess.exitCode === null) {
    log('Daemon is already running.');
    stateCallback?.('running');
    return;
  }

  restartCount = 0;
  _spawn(extensionPath);
}

function _spawn(extensionPath: string): void {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  if (isLockActive()) {
    log('Another workspace holds the active polling lock. Checking again in 10 seconds.');
    stateCallback?.('running');
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      if (restartCount < MAX_RESTARTS) {
        _spawn(extensionPath);
      }
    }, 10000);
    return;
  }

  const scriptPath = path.join(extensionPath, 'dist', 'agent-loop', 'wait-message.js');
  log(`Starting daemon: node ${scriptPath}`);
  stateCallback?.('starting');

  daemonProcess = spawn('node', [scriptPath], {
    cwd: extensionPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WCC_ACTIVE_WORKSPACE: activeWorkspacePath },
  });

  daemonProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    log(text);
    if (text.startsWith('{')) {
      try {
        const payload = JSON.parse(text);
        if (payload.fromUserId) {
          wakeUpAgent(payload);
        }
      } catch (e: any) {
        log(`Failed to parse stdout JSON: ${e.message}`);
      }
    }
  });

  daemonProcess.stderr?.on('data', (data: Buffer) => {
    log(`[STDERR] ${data.toString().trim()}`);
  });

  daemonProcess.on('spawn', () => {
    log('Daemon process started.');
    stateCallback?.('running');
    restartCount = 0;
  });

  daemonProcess.on('exit', (code, signal) => {
    log(`Daemon exited (code=${code}, signal=${signal})`);

    if (code === 1) {
      // Lock file conflict — another instance is running
      log('Another daemon instance is already running (lock file detected). Treating as running.');
      stateCallback?.('running');
      if (retryTimeout) clearTimeout(retryTimeout);
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        if (restartCount < MAX_RESTARTS) {
          _spawn(extensionPath);
        }
      }, 10000);
      return;
    }

    if (code === 0) {
      // Normal exit after message received
      restartCount = 0;
      log('Normal exit (message received). Restarting daemon to listen for the next message...');
      setTimeout(() => _spawn(extensionPath), 3000);
      return;
    }

    if (code === 2) {
      // Yielded to active IDE
      restartCount = 0;
      log('Daemon yielded control. Restarting daemon in 10s...');
      setTimeout(() => _spawn(extensionPath), 10000);
      return;
    }

    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      log(`Auto-restarting daemon (attempt ${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(() => _spawn(extensionPath), 3000);
    } else {
      log('Max restart attempts reached. Daemon stopped.');
      stateCallback?.('error');
    }
  });

  daemonProcess.on('error', (err) => {
    log(`Daemon process error: ${err.message}`);
    stateCallback?.('error');
  });
}

export function stopDaemon(): void {
  log('Stopping daemon...');
  restartCount = MAX_RESTARTS; // prevent auto-restart
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (daemonProcess && daemonProcess.exitCode === null) {
    daemonProcess.kill('SIGTERM');
    daemonProcess = null;
  }
  stateCallback?.('stopped');
}

function wakeUpAgent(payload: any) {
  const fromUserId = payload.fromUserId;
  let contextToken = payload.contextToken;
  if (!contextToken) {
    contextToken = 'null';
  }

  const msgDetails: string[] = [];
  if (payload.text) {
    msgDetails.push(`文本内容: '${payload.text}'`);
  }
  if (payload.hasImage) {
    msgDetails.push(`附带图片本地路径: '${payload.imagePath}'`);
  }
  if (payload.hasFile) {
    msgDetails.push(`附带文件本地路径: '${payload.filePath}' (文件名: ${payload.fileName})`);
  }
  if (payload.hasVoice) {
    msgDetails.push(`附带语音本地路径: '${payload.voicePath}'`);
  }

  const detailsStr = msgDetails.join('\n');
  const instruction = `【微信消息处理】您收到了一条来自微信用户 ${fromUserId} 的消息：\n${detailsStr}\n(ContextToken: ${contextToken})\n\n请根据消息内容执行相应的操作。处理完成后，请将给用户的回复内容写到文件 '.wechat-agent/wechat-response.txt' 中，并运行命令：\nnode dist/agent-loop/send-message.js "${fromUserId}" "${contextToken}" .wechat-agent/wechat-response.txt\n\n来提交回复。`;

  log(`Waking up Antigravity IDE agent with instruction for user ${fromUserId}...`);

  // Dynamically resolve CLI and executable paths using vscode.env.appRoot if available,
  // falling back to standard install paths or process.execPath.
  let exePath = '';
  let cliJsPath = '';

  try {
    // 1. Resolve cli.js from vscode.env.appRoot
    if (vscode.env.appRoot) {
      cliJsPath = path.join(vscode.env.appRoot, 'out', 'cli.js');
    }

    // 2. Resolve exePath
    if (process.platform === 'win32') {
      if (vscode.env.appRoot) {
        const installDir = path.dirname(path.dirname(vscode.env.appRoot));
        const possibleExes = ['Antigravity IDE.exe', 'Code.exe'];
        for (const possibleExe of possibleExes) {
          const checkPath = path.join(installDir, possibleExe);
          if (fs.existsSync(checkPath)) {
            exePath = checkPath;
            break;
          }
        }
      }
      
      // Fallback 1: process.execPath if it ends with .exe and is not a node executable
      if (!exePath && process.execPath && process.execPath.endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe')) {
        exePath = process.execPath;
      }

      // Fallback 2: Hardcoded LOCALAPPDATA path
      if (!exePath) {
        const localAppData = process.env.LOCALAPPDATA;
        if (localAppData) {
          exePath = path.join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS installation structure:
      // appRoot is: /Applications/Antigravity IDE.app/Contents/Resources/app
      if (vscode.env.appRoot) {
        const contentsDir = path.dirname(path.dirname(vscode.env.appRoot));
        exePath = path.join(contentsDir, 'MacOS', 'Antigravity IDE');
        if (!fs.existsSync(exePath)) {
          exePath = path.join(contentsDir, 'MacOS', 'Electron');
        }
      }
      if (!exePath && process.execPath && !process.execPath.toLowerCase().includes('node')) {
        exePath = process.execPath;
      }
    } else {
      // Linux
      if (vscode.env.appRoot) {
        const installDir = path.dirname(path.dirname(vscode.env.appRoot));
        exePath = path.join(installDir, 'antigravity-ide');
        if (!fs.existsSync(exePath)) {
          exePath = path.join(installDir, 'code');
        }
      }
      if (!exePath && process.execPath && !process.execPath.toLowerCase().includes('node')) {
        exePath = process.execPath;
      }
    }

    // Final validation & fallbacks
    if (!exePath || !fs.existsSync(exePath)) {
      log(`Warning: Resolved exePath "${exePath}" does not exist. Falling back to default.`);
      const localAppData = process.env.LOCALAPPDATA;
      if (process.platform === 'win32' && localAppData) {
        exePath = path.join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
      } else {
        exePath = process.execPath;
      }
    }

    if (!cliJsPath || !fs.existsSync(cliJsPath)) {
      log(`Warning: Resolved cliJsPath "${cliJsPath}" does not exist. Falling back to default.`);
      const localAppData = process.env.LOCALAPPDATA;
      if (process.platform === 'win32' && localAppData) {
        cliJsPath = path.join(localAppData, 'Programs', 'Antigravity IDE', 'resources', 'app', 'out', 'cli.js');
      }
    }
  } catch (err: any) {
    log(`Error resolving paths dynamically: ${err.message}`);
  }

  log(`Resolved executable path: ${exePath}`);
  log(`Resolved CLI helper path: ${cliJsPath}`);

  let workspacePath = '';
  try {
    const dataDir = process.env.WCC_DATA_DIR || path.join(os.homedir(), '.wechat-antigravity');
    const activeWsFile = path.join(dataDir, 'active_workspace.txt');
    if (fs.existsSync(activeWsFile)) {
      const activePath = fs.readFileSync(activeWsFile, 'utf-8').trim();
      if (activePath && fs.existsSync(activePath)) {
        workspacePath = activePath;
        log(`Routing agent wakeup to active workspace: ${workspacePath}`);
      }
    }
  } catch (err: any) {
    log(`Failed to read active workspace file: ${err.message}`);
  }

  if (!workspacePath) {
    workspacePath = activeWorkspacePath || path.join(process.cwd());
  }

  try {
    const agentDir = path.join(workspacePath, '.wechat-agent');
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    const instructionPath = path.join(agentDir, 'wechat-instruction.txt');
    fs.writeFileSync(instructionPath, instruction, 'utf-8');
    log(`Saved instruction to ${instructionPath}`);

    const child = spawn(exePath, [cliJsPath, 'chat', '-r', '--mode', 'agent', '-a', instructionPath, '请开始微信消息处理：'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      cwd: workspacePath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    log(`Agent process spawned with PID: ${child.pid}`);

    child.stdout?.on('data', (data: Buffer) => {
      log(`[Agent STDOUT] ${data.toString().trim()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
      log(`[Agent STDERR] ${data.toString().trim()}`);
    });

    child.on('exit', (code, signal) => {
      log(`Agent process exited with code: ${code}, signal: ${signal}`);
    });

    child.on('close', (code, signal) => {
      log(`Agent process closed with code: ${code}, signal: ${signal}`);
    });

    child.on('error', (err) => {
      log(`ERROR spawning agent: ${err.message}`);
    });

    child.unref();
  } catch (err: any) {
    log(`ERROR spawning agent process: ${err.message}`);
  }
}
