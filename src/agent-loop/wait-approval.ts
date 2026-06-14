import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadLatestAccount } from '../wechat/accounts.js';
import { WeChatApi } from '../wechat/api.js';
import { createSender } from '../wechat/send.js';

async function main() {
  const account = loadLatestAccount();
  if (!account) {
    console.error('No account found. Run setup first.');
    process.exit(1);
  }

  const [,, fromUserId, contextToken, promptMessage] = process.argv;

  if (!fromUserId || !promptMessage) {
    console.error('Usage: node wait-approval.js <fromUserId> <contextToken> <promptMessage>');
    process.exit(1);
  }

  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sender = createSender(api, account.accountId);

  const agentCoreDir = path.join(process.cwd(), '.wechat-agent');
  if (!fs.existsSync(agentCoreDir)) {
    fs.mkdirSync(agentCoreDir, { recursive: true });
  }

  const lockPath = path.join(agentCoreDir, '.approval.lock');
  const resultPath = path.join(agentCoreDir, 'approval-result.txt');

  // Clear any existing stale result files
  if (fs.existsSync(resultPath)) {
    try { fs.unlinkSync(resultPath); } catch (e) {}
  }

  // Write approval lock file
  fs.writeFileSync(lockPath, promptMessage, 'utf-8');

  // Register cleanup function
  const cleanup = () => {
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch (e) {}
    }
  };

  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('SIGTERM', () => { cleanup(); process.exit(1); });

  // Send the confirmation prompt message to WeChat
  const cToken = contextToken === 'null' ? '' : contextToken;
  try {
    await sender.sendText(fromUserId, cToken, promptMessage);
  } catch (err) {
    console.error('Failed to send approval prompt:', err);
    cleanup();
    process.exit(1);
  }

  // Poll for result file (max 5 minutes)
  const pollIntervalMs = 1000;
  const timeoutMs = 5 * 60 * 1000;
  let elapsedMs = 0;

  while (elapsedMs < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      const result = fs.readFileSync(resultPath, 'utf-8').trim();
      
      // Clean up files
      cleanup();
      try { fs.unlinkSync(resultPath); } catch (e) {}

      // Output result to stdout
      console.log(result);
      process.exit(0);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    elapsedMs += pollIntervalMs;
  }

  // Timeout reached, default to rejection
  console.log('no');
  cleanup();
  process.exit(1);
}

main().catch((err) => {
  console.error('Approval runner encountered error:', err);
  process.exit(1);
});
