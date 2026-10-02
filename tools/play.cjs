const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CACHE_VERSION = 1;

function fingerprint(root, inputs, salt = '') {
  const hash = createHash('sha256').update(salt);
  const visit = (relative) => {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return hash.update(`missing:${relative}\0`);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      hash.update(relative.replaceAll('\\', '/') + '\0').update(fs.readFileSync(file));
    }
  };
  for (const input of inputs) visit(input);
  return hash.digest('hex');
}

function launchPlan(root, cache, runtime = process.version) {
  const dependencies = fingerprint(root, ['package.json', 'package-lock.json'], `${runtime}|${process.platform}|${CACHE_VERSION}`);
  const build = fingerprint(root, ['src', 'public', 'electron', 'index.html', 'vite.config.ts', 'tsconfig.json'], dependencies);
  const electronBinary = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
  const install = cache?.dependencies !== dependencies || !['electron', 'vite', 'typescript', 'three'].every((name) => fs.existsSync(path.join(root, 'node_modules', name, 'package.json')))
    || !fs.existsSync(path.join(root, 'node_modules', 'electron', 'dist', electronBinary));
  const rebuild = install || cache?.build !== build || !fs.existsSync(path.join(root, 'dist', 'index.html')) || cache?.output !== fingerprint(root, ['dist']);
  return { dependencies, build, install, rebuild };
}

function runNpm(root, args) {
  // All commands are fixed, internal npm script names/flags. cmd is needed for npm.cmd on Windows.
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { cwd: root, stdio: 'inherit', windowsHide: true })
    : spawnSync('npm', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Dragonbound could not prepare to start.');
}

function play(root = path.resolve(__dirname, '..')) {
  const cacheFile = path.join(root, 'node_modules', '.cache', 'dragonbound', 'play.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  const plan = launchPlan(root, cache);
  const remember = () => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(cache), 'utf8');
    fs.renameSync(cacheFile + '.tmp', cacheFile);
  };
  if (plan.install) {
    console.log('Preparing Dragonbound...');
    runNpm(root, ['ci', '--no-audit', '--no-fund']);
    cache = { dependencies: plan.dependencies };
    remember();
  }
  if (plan.rebuild) {
    console.log('Preparing the updated game...');
    runNpm(root, ['run', 'build']);
    Object.assign(cache, { build: plan.build, output: fingerprint(root, ['dist']) });
    remember();
  }
  console.log('Starting Dragonbound...');
  runNpm(root, ['run', 'start']);
}

module.exports = { fingerprint, launchPlan, play };
if (require.main === module) {
  try { play(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
