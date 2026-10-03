// One heavy job at a time on this PC, across every Dragonbound checkout and agent.
// A heavy job is a build, a test run, a Blender export or a capture session.
//
//   node tools/heavy.cjs <command> [args...]
//
// Waits for the machine-wide lock, runs the command through the shell in the current folder,
// releases the lock and exits with the command's exit code. A lock whose owner process has died
// is cleared automatically.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const LOCK = path.join(os.tmpdir(), 'dragonbound-heavy.lock');
const OWNER = path.join(LOCK, 'owner.json');
const cmd = process.argv.slice(2).join(' ');
if (!cmd) {
  console.error('usage: node heavy.cjs <command> [args...]');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

async function acquire() {
  let lastNote = 0;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(OWNER, JSON.stringify({ pid: process.pid, cwd: process.cwd(), cmd, at: new Date().toISOString() }));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(OWNER, 'utf8')); } catch { /* being written or gone */ }
    const age = (() => { try { return Date.now() - fs.statSync(LOCK).mtimeMs; } catch { return 0; } })();
    if ((owner && !alive(owner.pid)) || (!owner && age > 60_000)) {
      fs.rmSync(LOCK, { recursive: true, force: true });
      continue;
    }
    if (Date.now() - lastNote > 60_000) {
      lastNote = Date.now();
      console.error(`[heavy] waiting for another heavy job: ${owner ? `${owner.cmd} (in ${owner.cwd}, since ${owner.at})` : 'starting up'}`);
    }
    await sleep(3000);
  }
}

function release() {
  try {
    const owner = JSON.parse(fs.readFileSync(OWNER, 'utf8'));
    if (owner.pid === process.pid) fs.rmSync(LOCK, { recursive: true, force: true });
  } catch { /* already gone */ }
}

(async () => {
  await acquire();
  console.error(`[heavy] running: ${cmd}`);
  const child = spawn(cmd, { shell: true, stdio: 'inherit' });
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', release);
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });
  release();
  process.exit(code);
})();
