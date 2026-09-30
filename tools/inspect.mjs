// Launch the inspect harness: `npm run inspect` (all suites) or `npm run inspect -- zones,ui`.
// Needs the Vite dev server on :5173 (npm run dev:web). Output: inspect/*.png + inspect/report.json.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const suites = process.argv[2] || 'all';
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, DRAGONBOUND_INSPECT: suites, VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173' },
});
child.on('exit', (code) => process.exit(code ?? 1));
