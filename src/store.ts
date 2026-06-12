import fs from 'node:fs';
import path from 'node:path';

export function validateAccountId(accountId: string): void {
  if (!accountId || typeof accountId !== 'string') {
    throw new Error('Invalid account ID');
  }
}

export function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as T;
    }
  } catch (err) {
    // ignore
  }
  return defaultValue;
}

export function saveJson<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
