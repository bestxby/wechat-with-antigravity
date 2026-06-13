import * as QRCode from 'qrcode';
import { startQrLogin, waitForQrScan } from '../wechat/login.js';
import { loadLatestAccount } from '../wechat/accounts.js';
import { logger } from '../logger.js';

export interface AuthState {
  status: 'loading' | 'disconnected' | 'connected';
  userName?: string;
  qrDataUrl?: string;
}

type StateCallback = (state: AuthState) => void;

let isPolling = false;

export async function startExtensionLoginFlow(onStateChange: StateCallback) {
    // Check if already logged in
    const account = loadLatestAccount();
    if (account) {
        onStateChange({ status: 'connected', userName: account.userId || 'User' });
        return;
    }

    // Prevent multiple concurrent polling loops
    if (isPolling) return;
    isPolling = true;

    onStateChange({ status: 'loading' });

    try {
        while (isPolling) {
            const { qrcodeUrl, qrcodeId } = await startQrLogin();
            
            // Convert raw text URL to a Data URI for Webview
            const qrDataUrl = await QRCode.toDataURL(qrcodeUrl, {
                type: 'image/png',
                width: 300,
                margin: 2
            });

            onStateChange({ status: 'disconnected', qrDataUrl });

            try {
                const accountData = await waitForQrScan(qrcodeId);
                logger.info('Extension QR login successful');
                onStateChange({ status: 'connected', userName: accountData.userId || 'User' });
                isPolling = false;
                return;
            } catch (err: any) {
                if (err.message?.includes('expired')) {
                    logger.info('QR expired, regenerating in extension...');
                    onStateChange({ status: 'loading' });
                    continue; // Generate a new one
                }
                throw err;
            }
        }
    } catch (error) {
        logger.error('Extension login flow failed', { error });
        isPolling = false;
    }
}

export function stopExtensionLoginFlow() {
    isPolling = false;
}
