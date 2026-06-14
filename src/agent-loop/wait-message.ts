import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { WeChatApi } from '../wechat/api.js';
import { loadLatestAccount } from '../wechat/accounts.js';
import { createMonitor } from '../wechat/monitor.js';
import { createSender } from '../wechat/send.js';
import { MessageType, WeixinMessage } from '../wechat/types.js';
import { extractText, extractFirstImageUrl, extractFirstFileItem, extractFirstVoiceItem, downloadVoice, saveImageToFile } from '../wechat/media.js';
import { logger } from '../logger.js';
import { DATA_DIR } from '../constants.js';

async function main() {
  let workspacePath = process.env.WCC_ACTIVE_WORKSPACE || '';
  if (!workspacePath) {
    try {
      const dataDir = process.env.WCC_DATA_DIR || path.join(homedir(), '.wechat-claude-code');
      const activeWsFile = path.join(dataDir, 'active_workspace.txt');
      if (fs.existsSync(activeWsFile)) {
        const activePath = fs.readFileSync(activeWsFile, 'utf-8').trim();
        if (activePath && fs.existsSync(activePath)) {
          workspacePath = activePath;
        }
      }
    } catch (e) {}
  }
  if (!workspacePath) {
    workspacePath = process.cwd();
  }
  const agentCoreDir = path.join(workspacePath, '.wechat-agent');
  if (!fs.existsSync(agentCoreDir)) {
    fs.mkdirSync(agentCoreDir, { recursive: true });
  }
  const lockPath = path.join(DATA_DIR, 'listener.lock');
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

  // Startup cleanup of stale locks if agent is not running
  const typingPidPath = path.join(agentCoreDir, '.typing.pid');
  if (!fs.existsSync(typingPidPath)) {
    const staleApprovalLock = path.join(agentCoreDir, '.approval.lock');
    if (fs.existsSync(staleApprovalLock)) {
      try { fs.unlinkSync(staleApprovalLock); } catch (e) {}
    }
    const staleApprovalResult = path.join(agentCoreDir, 'approval-result.txt');
    if (fs.existsSync(staleApprovalResult)) {
      try { fs.unlinkSync(staleApprovalResult); } catch (e) {}
    }
  }

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

      // Intercept if waiting for approval
      const approvalLockPath = path.join(agentCoreDir, '.approval.lock');
      if (fs.existsSync(approvalLockPath) && userText) {
        const replyText = userText.trim().toLowerCase();
        let approved = 'no';
        if (replyText === 'y' || replyText === 'yes' || replyText === '确认' || replyText === '同意' || replyText === 'ok' || replyText === '行' || replyText === '好' || replyText === '允许' || replyText === 'approve') {
          approved = 'yes';
        }
        fs.writeFileSync(path.join(agentCoreDir, 'approval-result.txt'), approved);
        
        try {
          const sender = createSender(api, account.accountId);
          let approvalAckText = `✅ 审批已收到（${approved === 'yes' ? '已同意' : '已拒绝'}），正在继续处理...`;
          if (voiceItem?.voice_item?.text) {
            approvalAckText = `🔊 语音已识别：“${voiceItem.voice_item.text}”\n${approvalAckText}`;
          }
          await sender.sendText(msg.from_user_id!, msg.context_token ?? '', approvalAckText);
        } catch (err) {
          logger.warn('Failed to send approval ACK', { error: String(err) });
        }
        
        monitor.stop();
        process.exit(2);
      }

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
      const scriptPath = path.join(process.cwd(), 'dist', 'agent-loop', 'keep-typing.js');
      const child = spawn(process.execPath, [scriptPath, msg.from_user_id!, msg.context_token ?? ''], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // Send an immediate ACK back to the user
      try {
        const sender = createSender(api, account.accountId);
        let ackText = '✅ 任务已收到，正在处理中...';
        if (voiceItem?.voice_item?.text) {
          ackText = `🔊 语音已识别：“${voiceItem.voice_item.text}”\n${ackText}`;
        }
        await sender.sendText(msg.from_user_id!, msg.context_token ?? '', ackText);
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
