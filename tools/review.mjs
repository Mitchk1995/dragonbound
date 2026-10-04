// Review pictures in one command: an area's standard views as labelled JPG sheets at review size,
// written outside the repo for the review page. Run it through the heavy-job lock:
//
//   node tools/heavy.cjs "npm run review -- castle"            this checkout's views
//   node tools/heavy.cjs "npm run review -- castle --base"     before (origin/main) and after, side by side
//   npm run review -- castle --base=<ref> --out=<dir>          another base, or another output folder
//   npm run review -- hall-door --suite=bailey-angles:door      any inspect suite under a name of your own
//   npm run review -- --list                                    the named areas
//
// The base is exported from git into inspect/review-base (no worktree) and captured with this
// checkout's packages. Sheets go to D:\dragonbound-archive\review\<name>\sheet-<n>.jpg.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Each area's standard views: an inspect suite (see src/dev/inspect.ts) and, optionally, which of its captures to keep. */
const AREAS = {
  castle: { suite: 'bailey:overview+skyline+entry+centre+avenue+door+terrace+stable-yard+training+walls-southside', about: 'the castle from above and through the play camera' },
  'castle-angles': { suite: 'bailey-angles:entry+door+terrace+stable-yard', about: 'key castle spots, each from three more angles' },
  'castle-buildings': { suite: 'bailey:range+range-hall+range-chapel+stables-front+barracks-front+hall+chapel+stables+barracks', about: 'the north range, stables and barracks, outside and in' },
  'castle-rock': { suite: 'bailey:rock', about: 'the castle rock and the falls from below' },
  rooms: { suite: 'castle', about: 'the castle plans and every room' },
  trees: { suite: 'trees:ladder', about: 'the woodcutting ladder' },
  'tree-roots': { suite: 'trees:roots', about: 'every tree species\' roots and crown' },
  characters: { suite: 'characters', about: 'the redesigned hero and enemies, close up and at the play camera' },
  skirts: { suite: 'skirts', about: 'the hero\'s tunic and armour skirts mid-stride, close up and at the play camera' },
  dragons: { suite: 'dragons', about: 'the drakeling and Cinderwing' },
  text: { suite: 'font,uitext', about: 'the painted alphabets and the menus\' lettering' },
  digits: { suite: 'digits', about: 'the painted damage numbers' },
  lighting: { suite: 'lighting:keep', about: 'the light round the home island' },
  island: { suite: 'zones:keep', about: 'the home island\'s points of interest' },
  zones: { suite: 'zones', about: 'every zone\'s points of interest' },
  ui: { suite: 'ui', about: 'every panel and screen' },
};

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function parse(argv) {
  const opts = { name: '', base: '', suite: '', out: 'D:\\dragonbound-archive\\review', list: false };
  for (const a of argv) {
    if (a === '--list') opts.list = true;
    else if (a === '--base') opts.base = 'origin/main';
    else if (a.startsWith('--base=')) opts.base = a.slice(7);
    else if (a.startsWith('--suite=')) opts.suite = a.slice(8);
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (!a.startsWith('--') && !opts.name) opts.name = a;
    else throw Error(`unknown argument ${a}`);
  }
  return opts;
}

const run = (cmd, args, cwd, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

/** The PNGs an inspect run in `dir` wrote after `since`, by capture name, in the order it took them. */
function captures(dir, since) {
  if (!fs.existsSync(dir)) return new Map();
  const shots = fs.readdirSync(dir).filter((f) => f.endsWith('.png'))
    .map((f) => ({ name: f.slice(0, -4), p: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((s) => s.t >= since).sort((a, b) => a.t - b.t);
  return new Map(shots.map((s) => [s.name, s.p]));
}

/** Runs the inspect suite in `checkout` (this one, or the exported base) and returns its captures. */
async function capture(checkout, suite) {
  const since = Date.now() - 1000;
  const env = {};
  let server;
  if (checkout !== root) {
    // The base has no packages of its own; serve it with this checkout's Vite, allowed to read them.
    const { createServer } = await import('vite');
    server = await createServer({
      root: checkout, configFile: path.join(checkout, 'vite.config.ts'), logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [checkout, root] } },
    });
    await server.listen();
    env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
  }
  try {
    const code = await run(process.execPath, [path.join(checkout, 'tools', 'inspect.mjs'), suite], checkout, env);
    if (code) console.warn(`[review] inspect in ${checkout} exited with ${code}; using the captures it made`);
  } finally {
    await server?.close();
  }
  return captures(path.join(checkout, 'inspect'), since);
}

/** Exports `ref` from git into inspect/review-base, fresh, without a worktree. */
function exportBase(ref) {
  const dir = path.join(root, 'inspect', 'review-base');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(dir, { recursive: true });
  if (ref.startsWith('origin/')) spawnSync('git', ['fetch', '--quiet', 'origin', ref.slice(7)], { cwd: root, stdio: 'inherit' });
  const tar = path.join(dir, 'base.tar');
  const git = spawnSync('git', ['archive', '--format=tar', '-o', tar, ref], { cwd: root, stdio: 'inherit' });
  if (git.status) throw Error(`git archive ${ref} failed`);
  // A relative archive name, so Windows' tar and Git's GNU tar both read it.
  const untar = spawnSync('tar', ['-xf', 'base.tar'], { cwd: dir, stdio: 'inherit' });
  if (untar.status) throw Error('could not unpack the base');
  fs.rmSync(tar);
  return dir;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  if (opts.list || !opts.name) {
    console.log('npm run review -- <area> [--base[=<ref>]] [--suite=<inspect suite>] [--out=<dir>]\nAreas:');
    for (const [name, a] of Object.entries(AREAS)) console.log(`  ${name.padEnd(17)} ${a.about}`);
    return;
  }
  const area = AREAS[opts.name];
  const suite = opts.suite || area?.suite;
  if (!suite) throw Error(`no area called ${opts.name}; use --suite=<inspect suite> or --list`);
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') === 'HEAD' ? git('rev-parse', '--short', 'HEAD') : git('rev-parse', '--abbrev-ref', 'HEAD');

  const after = await capture(root, suite);
  let before;
  if (opts.base) {
    const base = exportBase(opts.base);
    try { before = await capture(base, suite); }
    finally {
      // Keep only the base's captures, copied beside this checkout's, and drop the exported tree.
      const keep = path.join(root, 'inspect', 'review-before');
      fs.rmSync(keep, { recursive: true, force: true });
      fs.mkdirSync(keep, { recursive: true });
      for (const [name, p] of before ?? []) {
        fs.copyFileSync(p, path.join(keep, `${name}.png`));
        before.set(name, path.join(keep, `${name}.png`));
      }
      fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  const names = [...new Set([...after.keys(), ...(before?.keys() ?? [])])];
  if (!names.length) throw Error(`the suite ${suite} made no captures`);

  const out = path.join(opts.out, opts.name);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^sheet-\d+\.jpg$/.test(f)) fs.rmSync(path.join(out, f));
  const job = {
    out,
    title: `${opts.name}: ${area?.about ?? suite}`,
    columns: before ? [`Before (${opts.base})`, `After (${branch})`] : null,
    views: names.map((name) => ({ name, before: before?.get(name) ?? null, after: after.get(name) ?? null })),
    date: new Date().toISOString().slice(0, 10),
  };
  const jobFile = path.join(root, 'inspect', 'review-job.json');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const code = await run(require('electron'), [path.join(root, 'tools', 'review-sheet.cjs'), jobFile], root);
  fs.rmSync(jobFile, { force: true });
  fs.rmSync(path.join(root, 'inspect', 'review-before'), { recursive: true, force: true });
  if (code) throw Error('could not build the sheets');
  for (const f of fs.readdirSync(out).sort()) if (f.endsWith('.jpg')) console.log(path.join(out, f));
}

main().catch((e) => {
  console.error(`[review] ${e.message ?? e}`);
  process.exitCode = 1;
});
