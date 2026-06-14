import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadLatestAccount } from '../wechat/accounts.js';
import { WeChatApi } from '../wechat/api.js';
import { createSender } from '../wechat/send.js';

const userId = process.argv[2];
const contextToken = process.argv[3] || '';

if (!userId) {
  process.exit(1);
}

// Write PID so send-message can kill it
const agentCoreDir = path.join(process.cwd(), '.wechat-agent');
if (!fs.existsSync(agentCoreDir)) {
  fs.mkdirSync(agentCoreDir, { recursive: true });
}
const pidFile = path.join(agentCoreDir, '.typing.pid');
fs.writeFileSync(pidFile, process.pid.toString());

const account = loadLatestAccount();
if (!account) process.exit(1);

const api = new WeChatApi(account.botToken, account.baseUrl);
const sender = createSender(api, account.accountId);

// Start the keep-alive loop
const stopTyping = sender.startTyping(userId, contextToken);

// Handle exit gracefully
const cleanup = () => {
  stopTyping();
  if (fs.existsSync(pidFile)) {
    try { fs.unlinkSync(pidFile); } catch (e) {}
  }
  // Wait a bit for the cancel request to be sent
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Also auto-kill after 10 minutes max to prevent zombie processes
setTimeout(cleanup, 10 * 60 * 1000);
