import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { startExtensionLoginFlow, stopExtensionLoginFlow, type AuthState } from './auth.js';
import { initDaemon, startDaemon, stopDaemon, type DaemonStatus } from './daemon.js';
import { loadLatestAccount, deleteAccount } from '../wechat/accounts.js';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'wechat-antigravity.sidebar';
  private _view?: vscode.WebviewView;
  private _outputChannel: vscode.OutputChannel;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._outputChannel = vscode.window.createOutputChannel('WeChat Daemon');
    initDaemon(this._outputChannel, (status) => this.sendDaemonStatusToWebview(status));
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'disconnect':
          vscode.window.showInformationMessage('微信绑定已断开。');
          stopExtensionLoginFlow();
          stopDaemon();
          try {
            const account = loadLatestAccount();
            if (account) {
              deleteAccount(account.accountId);
            }
          } catch (e: any) {
            this._outputChannel.appendLine(`[WeChat Daemon] Failed to delete account: ${e.message}`);
          }
          startExtensionLoginFlow((state) => this.sendStateToWebview(state));
          break;
        case 'onReady':
          startExtensionLoginFlow((state) => {
            this.sendStateToWebview(state);
            // Auto-start daemon after successful login
            if (state.status === 'connected') {
              startDaemon(this._extensionUri.fsPath);
            }
          });
          break;
        case 'daemonStop':
          stopDaemon();
          break;
        case 'daemonStart':
          startDaemon(this._extensionUri.fsPath);
          break;
      }
    });
  }

  public sendStateToWebview(state: AuthState) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'updateState', state });
    }
  }

  public sendDaemonStatusToWebview(status: DaemonStatus) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'daemonStatus', status });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'index.html');
    const cssPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'main.css')
    );

    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf-8');

    // Inject CSS
    htmlContent = htmlContent.replace(
      '<!-- CSS will be injected here -->',
      `<link href="${cssPath}" rel="stylesheet">`
    );

    // Inject JS logic
    const scriptContent = `
    <script>
      const vscode = acquireVsCodeApi();
      const views = {
        loading: document.getElementById('view-loading'),
        disconnected: document.getElementById('view-disconnected'),
        connected: document.getElementById('view-connected')
      };

      function switchView(viewName) {
        Object.values(views).forEach(v => v.classList.add('hidden'));
        views[viewName].classList.remove('hidden');
      }

      window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'updateState') {
          const state = message.state;
          if (state.status === 'loading') switchView('loading');
          else if (state.status === 'disconnected') {
            document.getElementById('qr-image').src = state.qrDataUrl;
            document.getElementById('qr-image').style.display = 'block';
            document.getElementById('qr-placeholder').style.display = 'none';
            switchView('disconnected');
          }
          else if (state.status === 'connected') {
            document.getElementById('user-name').innerText = '当前微信已就绪';
            switchView('connected');
          }
        } else if (message.type === 'daemonStatus') {
          const status = message.status;
          const dot = document.getElementById('daemon-dot');
          const label = document.getElementById('daemon-label');
          const btn = document.getElementById('btn-daemon-toggle');
          dot.className = 'daemon-dot ' + status;
          const labels = { running: '消息监听运行中', stopped: '监听已停止', starting: '正在启动...', error: '监听异常' };
          label.innerText = labels[status] || status;
          btn.innerText = (status === 'running') ? '停止' : '开启';
          btn.dataset.running = status === 'running' ? '1' : '0';
          if (status === 'running') {
            btn.classList.add('running');
          } else {
            btn.classList.remove('running');
          }
        }
      });

      document.getElementById('btn-daemon-toggle').addEventListener('click', (e) => {
        const running = e.currentTarget.dataset.running === '1';
        vscode.postMessage({ type: running ? 'daemonStop' : 'daemonStart' });
      });

      document.getElementById('btn-disconnect').addEventListener('click', () => {
        vscode.postMessage({ type: 'disconnect' });
      });

      // Notify host that UI is ready
      vscode.postMessage({ type: 'onReady' });
    </script>
    `;
    
    htmlContent = htmlContent.replace('<!-- Script will be injected here -->', scriptContent);

    // Inject CSP
    const nonce = this.getNonce();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">`;
    htmlContent = htmlContent.replace('<!-- Content Security Policy will be injected by the provider -->', csp);
    htmlContent = htmlContent.replace('<script>', `<script nonce="${nonce}">`);

    return htmlContent;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
