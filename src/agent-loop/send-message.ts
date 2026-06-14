import process from 'node:process';
import { readFileSync } from 'node:fs';
import { WeChatApi } from '../wechat/api.js';
import { loadLatestAccount } from '../wechat/accounts.js';
import { createSender } from '../wechat/send.js';

async function main() {
  const account = loadLatestAccount();
  if (!account) {
    console.error('No account found. Run setup first.');
    process.exit(1);
  }

  const [,, fromUserId, contextToken, filePath, typeFlag] = process.argv;

  if (!fromUserId || !filePath) {
    console.error('Usage: node send-message.js <fromUserId> <contextToken> <pathToTextFile> [--file]');
    process.exit(1);
  }

  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sender = createSender(api, account.accountId);

  // Stop typing indicator if it is running
  const fs = await import('node:fs');
  const path = await import('node:path');
  const agentCoreDir = path.join(process.cwd(), '.wechat-agent');
  const pidFile = path.join(agentCoreDir, '.typing.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8');
    try {
      process.kill(parseInt(pid, 10), 'SIGTERM');
    } catch (e) {}
    try { fs.unlinkSync(pidFile); } catch (e) {}
  }

  const cToken = contextToken === 'null' ? '' : contextToken;

  if (typeFlag === '--file') {
    await sender.sendFile(fromUserId, cToken, filePath);
    console.log('File sent successfully!');
  } else {
    const text = fs.readFileSync(filePath, 'utf-8');
    await sender.sendText(fromUserId, cToken, text);
    console.log('Message sent successfully!');
  }

  // Clear instruction file after successful delivery to prevent duplicate consumption
  const instFile = path.join(agentCoreDir, 'wechat-instruction.txt');
  if (fs.existsSync(instFile)) {
    try {
      fs.unlinkSync(instFile);
      console.log('Cleared wechat-instruction.txt');
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Failed to send message:', err);
  process.exit(1);
});
