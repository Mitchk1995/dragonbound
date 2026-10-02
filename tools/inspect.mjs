// Launch the inspect harness: `npm run inspect` (all suites) or `npm run inspect -- zones,ui`.
// Starts its own local server unless VITE_DEV_SERVER_URL is supplied. Output: inspect/.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { rm } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electron = require('electron');
const suites = process.argv[2] || 'all';
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
let url = process.env.VITE_DEV_SERVER_URL;
if (!url) {
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  url = server.resolvedUrls.local[0];
}
const child = spawn(electron, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DRAGONBOUND_INSPECT: suites, VITE_DEV_SERVER_URL: url },
});
const stop = () => child.kill();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  process.exitCode = await new Promise((resolve, reject) => { child.once('exit', code => resolve(code ?? 1)); child.once('error', reject); });
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  await server?.close();
  if (Number.isInteger(child.pid) && child.pid > 0) {
    const tempRoot = path.resolve(os.tmpdir());
    const profile = path.resolve(tempRoot, `dragonbound-inspect-${child.pid}`);
    if (path.dirname(profile) !== tempRoot) throw Error('Unexpected inspect profile path');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
