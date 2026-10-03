// One heavy job at a time on this PC, across every Dragonbound checkout and agent.
// A heavy job is a build, a test run, a Blender export or a capture session.
//
//   node tools/heavy.cjs <command> [args...]
//   node tools/heavy.cjs "npm run build && npm test"     (a compound command goes in one quoted argument)
//
// Waits until no other heavy job holds the machine-wide lock, runs the command through cmd.exe in the
// current folder and exits with its exit code. The lock is a Windows named pipe that this process
// listens on, so Windows frees it the moment the process ends, however it ends. Stop a heavy job by
// ending its whole process tree (taskkill /T /F /PID <pid>), never this wrapper alone, or the job
// would run on without the lock.
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const PIPE = '\\\\.\\pipe\\dragonbound-heavy';
const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node tools/heavy.cjs <command> [args...]');
  process.exit(2);
}
/** One argument as cmd.exe and the C runtime read it back: quoted only when it has to be. */
const quote = (a) => (/^[\w\-.,:/\\=+@]+$/.test(a) ? a : `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`);
const cmd = args.length === 1 ? args[0] : args.map(quote).join(' ');
const me = JSON.stringify({ pid: process.pid, cwd: process.cwd(), cmd, at: new Date().toISOString() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Takes the lock (the listening pipe), or resolves null while another job holds it. */
const tryLock = () => new Promise((resolve, reject) => {
  const server = net.createServer((c) => c.end(me));
  server.once('error', (e) => (e.code === 'EADDRINUSE' ? resolve(null) : reject(e)));
  server.listen(PIPE, () => resolve(server));
});

/** What the holder is running: it answers every connection with its details. */
const holder = () => new Promise((resolve) => {
  let d = '';
  net.connect(PIPE).on('data', (x) => (d += x)).on('end', () => resolve(d)).on('error', () => resolve(''));
});

(async () => {
  let server, lastNote = 0;
  while (!(server = await tryLock())) {
    if (Date.now() - lastNote > 60_000) {
      lastNote = Date.now();
      console.error(`[heavy] waiting for another heavy job: ${(await holder()) || 'starting up'}`);
    }
    await sleep(3000);
  }
  console.error(`[heavy] running: ${cmd}`);
  const child = spawn(cmd, { shell: true, stdio: 'inherit' });
  // (Killing cmd.exe alone would leave the job running; end its whole tree before letting go.)
  const stop = () => {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });
  server.close();
  process.exit(code);
})();
