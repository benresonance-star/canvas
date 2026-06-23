/**
 * Shared port helpers for dev-stack start/stop scripts.
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const CANVAS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadDevStackConfig() {
  return JSON.parse(
    readFileSync(join(CANVAS_ROOT, 'dev-stack.config.json'), 'utf8'),
  );
}

export function isListening(port) {
  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'netstat' : 'lsof',
      process.platform === 'win32'
        ? ['-ano']
        : [`-i:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8', shell: true },
    );
    const portPattern = new RegExp(`:${port}(\\s|$)`);
    return (result.stdout ?? '')
      .split('\n')
      .some((line) => line.includes('LISTEN') && portPattern.test(line));
  } catch {
    return false;
  }
}

export function stopProcessOnPort(port) {
  if (!isListening(port)) return;
  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
    const portPattern = new RegExp(`:${port}(\\s|$)`);
    const pids = new Set();
    for (const line of result.stdout?.split('\n') ?? []) {
      if (!line.includes('LISTEN') || !portPattern.test(line)) continue;
      const pid = Number.parseInt(line.trim().split(/\s+/).pop(), 10);
      if (pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      });
    }
    return;
  }
  spawnSync('sh', ['-c', `lsof -ti:${port} | xargs -r kill -TERM`], {
    stdio: 'ignore',
    shell: true,
  });
}
