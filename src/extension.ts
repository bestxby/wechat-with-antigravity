import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SidebarProvider } from './ide-bridge/sidebar-provider.js';
import { startDaemon, stopDaemon } from './ide-bridge/daemon.js';
import { loadLatestAccount } from './wechat/accounts.js';
import { DATA_DIR } from './constants.js';

let ideLockPath: string | null = null;

function updateActiveWorkspace(workspacePath: string) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const activeWsFile = path.join(DATA_DIR, 'active_workspace.txt');
        fs.writeFileSync(activeWsFile, workspacePath, 'utf-8');
        console.log(`[WeChat Extension] Updated active workspace to: ${workspacePath}`);
    } catch (err: any) {
        console.error(`[WeChat Extension] Failed to update active workspace: ${err.message}`);
    }
}

function registerWorkspace(workspacePath: string) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const wsFile = path.join(DATA_DIR, 'workspaces.json');
        let workspaces: string[] = [];
        if (fs.existsSync(wsFile)) {
            try {
                workspaces = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
            } catch (e) {}
        }
        if (!Array.isArray(workspaces)) {
            workspaces = [];
        }
        const normPath = path.resolve(workspacePath);
        const exists = workspaces.some(w => path.resolve(w).toLowerCase() === normPath.toLowerCase());
        if (!exists) {
            workspaces.push(workspacePath);
            fs.writeFileSync(wsFile, JSON.stringify(workspaces, null, 2), 'utf-8');
            console.log(`[WeChat Extension] Registered workspace: ${workspacePath}`);
        }
    } catch (err: any) {
        console.error(`[WeChat Extension] Failed to register workspace: ${err.message}`);
    }
}

function unregisterWorkspace(workspacePath: string) {
    try {
        const wsFile = path.join(DATA_DIR, 'workspaces.json');
        if (fs.existsSync(wsFile)) {
            let workspaces: string[] = [];
            try {
                workspaces = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
            } catch (e) {}
            if (Array.isArray(workspaces)) {
                const normPath = path.resolve(workspacePath);
                const beforeLength = workspaces.length;
                workspaces = workspaces.filter(w => path.resolve(w).toLowerCase() !== normPath.toLowerCase());
                if (workspaces.length !== beforeLength) {
                    fs.writeFileSync(wsFile, JSON.stringify(workspaces, null, 2), 'utf-8');
                    console.log(`[WeChat Extension] Unregistered workspace: ${workspacePath}`);
                }
            }
        }
        // Clear active workspace if it matches the current one
        const activeWsFile = path.join(DATA_DIR, 'active_workspace.txt');
        if (fs.existsSync(activeWsFile)) {
            const activeWs = fs.readFileSync(activeWsFile, 'utf-8').trim();
            if (path.resolve(activeWs).toLowerCase() === path.resolve(workspacePath).toLowerCase()) {
                fs.writeFileSync(activeWsFile, '', 'utf-8');
            }
        }
    } catch (err: any) {
        console.error(`[WeChat Extension] Failed to unregister workspace: ${err.message}`);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('WeChat Antigravity Extension is now active!');
    
    // Write IDE lock file to let background listener know IDE is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const agentDir = path.join(workspacePath, '.wechat-agent');
        if (!fs.existsSync(agentDir)) {
            fs.mkdirSync(agentDir, { recursive: true });
        }
        ideLockPath = path.join(agentDir, '.ide.lock');
        fs.writeFileSync(ideLockPath, process.pid.toString(), 'utf-8');
        console.log(`Created IDE lock at ${ideLockPath} with PID ${process.pid}`);
        
        registerWorkspace(workspacePath);
        updateActiveWorkspace(workspacePath);
    }

    // Update active workspace when window gains focus or active editor/terminal changes
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((e) => {
            if (e.focused) {
                const folders = vscode.workspace.workspaceFolders;
                if (folders && folders.length > 0) {
                    updateActiveWorkspace(folders[0].uri.fsPath);
                }
            }
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                const folders = vscode.workspace.workspaceFolders;
                if (folders && folders.length > 0) {
                    updateActiveWorkspace(folders[0].uri.fsPath);
                }
            }
        }),
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            if (terminal) {
                const folders = vscode.workspace.workspaceFolders;
                if (folders && folders.length > 0) {
                    updateActiveWorkspace(folders[0].uri.fsPath);
                }
            }
        })
    );

    // Auto-start daemon on startup if user is logged in
    const account = loadLatestAccount();
    if (account) {
        const wsPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '';
        startDaemon(context.extensionUri.fsPath, wsPath);
    }

    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    // Diagnostic: Dump all registered commands to help find the correct chat command in Antigravity IDE
    vscode.commands.getCommands(true).then(commands => {
        const filtered = commands.filter(c => c.toLowerCase().includes('chat') || c.toLowerCase().includes('antigravity'));
        const outPath = path.join(workspaceFolders?.[0]?.uri?.fsPath || '', '.wechat-agent', 'registered-commands.txt');
        fs.writeFileSync(outPath, filtered.join('\n'), 'utf-8');
        console.log(`Diagnostic: Dumped ${filtered.length} commands to ${outPath}`);
    });

    // Helper to extract prompt text, including reading from temporary files passed by cli.js
    function getPromptFromArgs(args: any[]): string {
        const collected: string[] = [];
        function traverse(arg: any) {
            if (!arg) return;
            if (typeof arg === 'string') {
                if (fs.existsSync(arg)) {
                    try {
                        const content = fs.readFileSync(arg, 'utf-8');
                        collected.push(content);
                    } catch (e) {
                        collected.push(arg);
                    }
                } else {
                    collected.push(arg);
                }
            } else if (Array.isArray(arg)) {
                for (const item of arg) {
                    traverse(item);
                }
            } else if (typeof arg === 'object') {
                if (arg.scheme === 'file' && typeof arg.fsPath === 'string') {
                    traverse(arg.fsPath);
                } else if (arg.scheme === 'file' && typeof arg.path === 'string') {
                    let cleanPath = arg.path;
                    if (cleanPath.startsWith('/') && cleanPath[2] === ':') {
                        cleanPath = cleanPath.substring(1);
                    }
                    try {
                        cleanPath = decodeURIComponent(cleanPath);
                    } catch (e) {}
                    traverse(cleanPath);
                } else {
                    // Extract known prompt fields and attachments
                    if (typeof arg.query === 'string') {
                        traverse(arg.query);
                    }
                    if (typeof arg.prompt === 'string') {
                        traverse(arg.prompt);
                    }
                    if (typeof arg.message === 'string') {
                        traverse(arg.message);
                    }
                    if (arg.attachFiles) {
                        traverse(arg.attachFiles);
                    }
                    
                    // Fallback for other plain objects
                    if (typeof arg.query !== 'string' && 
                        typeof arg.prompt !== 'string' && 
                        typeof arg.message !== 'string' && 
                        !arg.attachFiles) {
                        for (const key of Object.keys(arg)) {
                            traverse(arg[key]);
                        }
                    }
                }
            }
        }
        traverse(args);
        return collected.join('\n');
    }

    // Intercept both commands that the VS Code CLI/cli.js could run to trigger a chat session
    const handleChatCall = (commandName: string, args: any[]) => {
        const outPath = path.join(workspaceFolders?.[0]?.uri?.fsPath || '', '.wechat-agent', 'chat-args.json');
        fs.writeFileSync(outPath, JSON.stringify({ command: commandName, args }, null, 2), 'utf-8');
        console.log(`Intercepted ${commandName} with args:`, args);

        const prompt = getPromptFromArgs(args);
        console.log(`Extracted prompt:`, prompt);

        if (prompt && prompt.trim()) {
            // Wake up Antigravity Agent by focusing the side panel and sending the prompt
            vscode.commands.executeCommand('antigravity.agentSidePanel.open').then(() => {
                vscode.commands.executeCommand('antigravity.agentSidePanel.focus').then(() => {
                    vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', prompt);
                });
            });
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('workbench.action.chat.newChat', (...args) => handleChatCall('workbench.action.chat.newChat', args)),
        vscode.commands.registerCommand('workbench.action.chat.open', (...args) => handleChatCall('workbench.action.chat.open', args))
    );

    let disposable = vscode.commands.registerCommand('wechat-antigravity.startDaemon', () => {
        vscode.window.showInformationMessage('WeChat Daemon Started!');
        sidebarProvider.sendStateToWebview({ status: 'connected', userName: 'bestxby' });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    stopDaemon();
    if (ideLockPath && fs.existsSync(ideLockPath)) {
        try {
            fs.unlinkSync(ideLockPath);
            console.log('Removed IDE lock.');
        } catch (e) {}
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        unregisterWorkspace(workspaceFolders[0].uri.fsPath);
    }
    console.log('WeChat Antigravity Extension deactivated.');
}
