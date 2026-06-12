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

  const [,, fromUserId, contextToken, filePath] = process.argv;

  if (!fromUserId || !filePath) {
    console.error('Usage: node send-message.js <fromUserId> <contextToken> <pathToTextFile>');
    process.exit(1);
  }

  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sender = createSender(api, account.accountId);

  // Stop typing indicator if it is running
  const fs = await import('node:fs');
  const path = await import('node:path');
  const pidFile = path.join(process.cwd(), '.typing.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8');
    try {
      process.kill(parseInt(pid, 10), 'SIGTERM');
    } catch (e) {}
    try { fs.unlinkSync(pidFile); } catch (e) {}
  }

  const text = fs.readFileSync(filePath, 'utf-8');

  // If text is too long, we might need to split it (sender usually handles it or we can just send as is)
  // `sender.sendText` should handle basic sending. Let's rely on it.
  
  await sender.sendText(fromUserId, contextToken === 'null' ? '' : contextToken, text);
  console.log('Message sent successfully!');
}

main().catch(err => {
  console.error('Failed to send message:', err);
  process.exit(1);
});
