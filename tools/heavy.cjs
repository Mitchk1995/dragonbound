// A few heavy jobs at a time on this PC, across every Dragonbound checkout and agent, as memory allows.
// A heavy job is a build, a test run, a Blender export or a capture session.
//
//   node tools/heavy.cjs <command> [args...]
//   node tools/heavy.cjs "npm run build && npm test"     (a compound command goes in one quoted argument)
//
// Waits for a free machine-wide slot, runs the command through cmd.exe in the current folder and exits
// with its exit code. Slot 0 is always open to a job; the others open only while enough memory is free.
// A slot is a Windows named pipe that this process listens on, so Windows frees it the moment the
// process ends, however it ends. Stop a heavy job by ending its whole process tree
// (taskkill /T /F /PID <pid>), never this wrapper alone, or the job would run on without its slot.
const net = require('net');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PIPE = '\\\\.\\pipe\\dragonbound-heavy';
// Four slots at most: more concurrent jobs than that gain little on this PC's cores.
const MAX_SLOTS = 4;
// A job beyond the first starts only with 6 GB free, so a few jobs cannot exhaust this 32 GB machine.
const MIN_FREE_BYTES = 6 * 1024 ** 3;

/** Slot 0 keeps the original pipe name, so older copies of this script still count against it. */
const slotPipe = (slot) => (slot === 0 ? PIPE : `${PIPE}-${slot}`);
/** Slots a new job may take now: slot 0 always (a lone job never waits on memory), the rest only with enough free memory. */
const allowedSlots = (freeBytes, maxSlots = MAX_SLOTS, minFree = MIN_FREE_BYTES) =>
  Array.from({ length: maxSlots }, (_, i) => i).filter((i) => i === 0 || freeBytes >= minFree);

module.exports = { MAX_SLOTS, MIN_FREE_BYTES, slotPipe, allowedSlots };

if (require.main === module) main();

function main() {
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

  /** Takes the slot (the listening pipe), or resolves null while another job holds it. */
  const tryLock = (slot) => new Promise((resolve, reject) => {
    const server = net.createServer((c) => c.end(me));
    server.once('error', (e) => (e.code === 'EADDRINUSE' ? resolve(null) : reject(e)));
    server.listen(slotPipe(slot), () => resolve(server));
  });

  /** What a slot's holder is running: it answers every connection with its details. */
  const holder = (slot) => new Promise((resolve) => {
    let d = '';
    net.connect(slotPipe(slot)).on('data', (x) => (d += x)).on('end', () => resolve(d)).on('error', () => resolve(''));
  });

  /** The first slot this job may take right now, or null. */
  const takeSlot = async () => {
    for (const slot of allowedSlots(os.freemem())) {
      const server = await tryLock(slot);
      if (server) return server;
    }
    return null;
  };

  (async () => {
    let server, lastNote = 0;
    while (!(server = await takeSlot())) {
      if (Date.now() - lastNote > 60_000) {
        lastNote = Date.now();
        console.error(`[heavy] waiting for a free slot; slot 0 runs: ${(await holder(0)) || 'starting up'}`);
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
}
