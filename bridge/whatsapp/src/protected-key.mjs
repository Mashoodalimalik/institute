import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function protectedKey(path) {
  if (process.platform !== 'win32') throw new Error('Production WhatsApp credential protection requires Windows DPAPI');
  const existing = existsSync(path);
  const input = existing ? readFileSync(path) : randomBytes(32);
  const verb = existing ? 'Unprotect' : 'Protect';
  // Secret travels on stdin, never in a command line or log.
  const script = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${verb}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r))`;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: input.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const result = Buffer.from(output.trim(), 'base64');
  if (!existing) writeFileSync(path, result, { flag: 'wx', mode: 0o600 });
  return existing ? result : input;
}
