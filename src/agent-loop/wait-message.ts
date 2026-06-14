import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { WeChatApi } from '../wechat/api.js';
import { loadLatestAccount } from '../wechat/accounts.js';
import { createMonitor } from '../wechat/monitor.js';
import { createSender } from '../wechat/send.js';
import { MessageType, WeixinMessage } from '../wechat/types.js';
import { extractText, extractFirstImageUrl, extractFirstFileItem, extractFirstVoiceItem, downloadVoice, saveImageToFile } from '../wechat/media.js';
import { logger } from '../logger.js';

async function main() {
  const agentCoreDir = path.join(process.cwd(), '.wechat-agent');
  if (!fs.existsSync(agentCoreDir)) {
    fs.mkdirSync(agentCoreDir, { recursive: true });
  }
  const lockPath = path.join(agentCoreDir, '.listener.lock');
  if (fs.existsSync(lockPath)) {
    const pid = fs.readFileSync(lockPath, 'utf8');
    try {
      process.kill(parseInt(pid, 10), 0);
      console.error(JSON.stringify({ error: `监听器已在另一窗口运行 (PID: ${pid})，禁止重复启动！` }));
      process.exit(1);
    } catch (e) {
      // Stale lock
    }
  }
  fs.writeFileSync(lockPath, process.pid.toString());

  const clearLock = () => {
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch (e) {}
    }
  };
  process.on('exit', clearLock);
  process.on('SIGINT', () => { clearLock(); process.exit(0); });
  process.on('SIGTERM', () => { clearLock(); process.exit(0); });

  const account = loadLatestAccount();
  if (!account) {
    console.error(JSON.stringify({ error: 'No account found. Run setup first.' }));
    process.exit(1);
  }

  const api = new WeChatApi(account.botToken, account.baseUrl);

  const monitor = createMonitor(api, {
    onMessage: async (msg: WeixinMessage) => {
      // Only process valid user messages
      if (msg.message_type !== MessageType.USER || !msg.item_list) return;
      if (account.userId && msg.from_user_id !== account.userId) return;

      const userText = msg.item_list.map(extractText).filter(Boolean).join('\n');
      const imageItem = extractFirstImageUrl(msg.item_list);
      const fileItem = extractFirstFileItem(msg.item_list);
      const voiceItem = extractFirstVoiceItem(msg.item_list);

      // Try to download media
      let voicePath = '';
      if (voiceItem) {
        const path = await downloadVoice(voiceItem);
        if (path) voicePath = path;
      }
      
      let imagePath = '';
      if (imageItem) {
        const path = await saveImageToFile(imageItem);
        if (path) imagePath = path;
      }

      // If it's empty, ignore it
      if (!userText && !imageItem && !fileItem && !voiceItem) return;

      const payload = {
        fromUserId: msg.from_user_id,
        contextToken: msg.context_token ?? '',
        text: userText,
        hasImage: !!imageItem,
        hasFile: !!fileItem,
        hasVoice: !!voiceItem,
        imagePath: imagePath,
        filePath: fileItem?.local_file_path || '',
        fileName: fileItem?.file_item?.file_name || '',
        voicePath: voicePath
      };

      // Print the JSON exactly on one line to stdout so the agent can parse it
      console.log(JSON.stringify(payload));
      
      // Spawn detached typing indicator
      const { spawn } = await import('node:child_process');
      const path = await import('node:path');
      const scriptPath = path.join(process.cwd(), 'dist', 'agent-loop', 'keep-typing.js');
      const child = spawn(process.execPath, [scriptPath, msg.from_user_id!, msg.context_token ?? ''], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // Send an immediate ACK back to the user
      try {
        const sender = createSender(api, account.accountId);
        await sender.sendText(msg.from_user_id!, msg.context_token ?? '', '✅ 任务已收到，正在处理中...');
      } catch (err) {
        logger.warn('Failed to send ACK', { error: String(err) });
      }

      // Stop monitor and exit to yield to the agent
      monitor.stop();
      process.exit(0);
    },
    onSessionExpired: async () => {
      console.error(JSON.stringify({ error: 'Session expired' }));
      process.exit(1);
    }
  });

  // Supress standard logger outputs to stdout if possible, so we don't pollute the JSON
  // In a real scenario we'd route logger to stderr, but for now we just rely on JSON.parse
  // being robust to extra lines.
  
  await monitor.run();
}

main().catch(err => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
