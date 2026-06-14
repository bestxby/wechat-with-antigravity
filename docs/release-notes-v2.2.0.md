# Release v2.2.0: Native Workspace Visualizer, Dynamic Routing & High-Reliability Polling 🚀

Welcome to WeChat Bridge v2.2.0! This release brings major visual updates and robustness enhancements, enabling you to control multiple codebases seamlessly with WeChat without conflicts.

### 🌟 What's New
- **🖥️ Workspace Visualizer Panel**: A brand-new UI container has been added to the WeChat Agent sidebar. It lists all active IDE workspaces in real time.
- **🟢 "Receiving" Badge**: Displays a glowing green badge next to the active workspace which is currently capturing WeChat tasks.
- **🖱️ Click-to-Switch Routing**: Seamless routing redirection. Simply click any workspace directory in the sidebar list to manually route incoming WeChat messages to that workspace immediately.
- **🧹 Active Process Lifetime Filter**: Fixed a potential memory/display leak. Stale workspace paths from crash sessions or closed IDE windows are automatically validated using PID survival verification (`process.kill(pid, 0)`) and filtered from `workspaces.json`.
- **🔒 Global Polling Mutex Lock**: Implemented a physical Mutex lock file (`~/.wechat-claude-code/listener.lock`). If multiple IDE instances are opened, only one listener daemon will run, with a 10s retry failover loop on conflict.
- **✨ Persistent Message Deduplication**: Message IDs are now persistently saved in `processed_msg_ids.json`. This completely resolves the "duplicate execution" bug when switching workspaces or reloading IDEs.
- **🗑️ Auto-Destruct Instruction Files**: Once `send-message.js` successfully posts a WeChat reply, the corresponding `.wechat-agent/wechat-instruction.txt` is automatically deleted to prevent loop re-entry.

### 📦 Installation
If you are using Antigravity IDE, download `wechat-antigravity-bridge-2.2.0.vsix` and import it directly via command palette (`Extensions: Install from VSIX...`). No manual installation or compilation is needed!

---

# 发布版本 v2.2.0：原生多工作区可视化、动态路由与高可靠监听 🚀

欢迎使用微信桥接网关 v2.2.0！此版本引入了全新的可视化界面与系统健壮性提升，让您能够在多窗口开发环境下通过微信安全、无缝地调度您的本地智能体。

### 🌟 新增特性
- **🖥️ 活跃工作区可视化看板**：微信智能体控制台侧边栏新增“活跃工作区”面板，实时渲染当前所有已注册的代码宇宙。
- **🟢 “接收中”呼吸徽章**：为当前实际接管微信消息接收的工作区打上醒目的绿色呼吸徽章，让您时刻了解消息路由走向。
- **🖱️ 点击直接切换路由**：支持手动点击切换。在侧边栏工作区列表中点击任意路径，即可瞬间将消息大脑转移至该窗口。
- **🧹 存活进程物理过滤（幽灵窗口清理）**：基于 `.ide.lock` 中的 PID 进行进程存活校验。一旦 IDE 实例被关闭或强制退出，其对应的工作区将自动从列表中清除并更新 `workspaces.json`。
- **🔒 全局物理 Mutex 互斥锁**：引入 `~/.wechat-claude-code/listener.lock` 进程互斥锁。多开 IDE 时自动防冲突，备用实例将进入 10 秒重试 Failover 循环。
- **✨ 消息持久化去重**：使用 `processed_msg_ids.json` 记录已处理消息 ID，彻底杜绝了多窗口开启或重载时，消息被执行两遍的 bug。
- **🗑️ 指令文件自动消费销毁**：只要 `send-message.js` 成功将回执发回微信，便会立即将本地 `.wechat-agent/wechat-instruction.txt` 物理删除，防止任何旧消息重入。

### 📦 安装方式
使用 Antigravity IDE 的用户，请直接下载 `wechat-antigravity-bridge-2.2.0.vsix` 离线包，并在命令面板中选择 `Extensions: Install from VSIX...` 导入即可！普通用户完全无需命令行安装或编译。
