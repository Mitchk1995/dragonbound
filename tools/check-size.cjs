// File size limits, run by `npm run check` and so by CI. Small files keep the project cheap for agents
// to read and change: a file over the limit is split before it grows, never waved through.
const fs = require('node:fs');
const path = require('node:path');

// 600 lines of code (about 25 KB, 7k tokens) is one comfortable read and one clear job per file.
// 25 KB of Markdown (about 6k tokens) is one area of the plan read whole before a job starts.
const LIMITS = { code: 600, doc: 25000 };
const CODE = /\.(?:[cm]?ts|[cm]?js|py)$/;
const DOC = /\.md$/;
const CODE_ROOTS = ['src', 'tests', 'tools', 'electron'];
const DOC_ROOTS = ['docs', 'public', '.claude/agents', 'AGENTS.md', 'README.md', 'CLAUDE.md'];
const IGNORED = new Set(['node_modules', 'previews', '__pycache__']);

// Files that were already over the limit when it came in, each held at that size (lines for code,
// bytes for docs; counting the jobs in flight that day) so it cannot grow. Part 2 of the cleanup
// splits every one and empties this list; never add to it.
const ALLOWED = {
  'docs/CASTLE_DESIGN.md': 29410,
  'src/dev/inspect.ts': 1181,
  'src/game.ts': 966,
  'src/render/masonry.ts': 655,
  'src/ui/panels.ts': 712,
  'src/world/buildingModel.ts': 2387,
  'src/world/castle/keepModel.ts': 781,
  'src/world/castleProps/bailey.ts': 980,
  'src/world/castleProps/curtain.ts': 914,
  'src/world/props.ts': 3395,
  'src/world/terrain.ts': 1241,
  'tests/castle-geometry.test.ts': 879,
  'tools/blender/_common.py': 728,
  'tools/blender/gear.py': 1079,
};

/** Every checked file under `root` as { file, kind, size }: lines for code, bytes for docs. */
function measure(root) {
  const out = [];
  const visit = (rel, kind) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const stat = fs.lstatSync(abs);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(abs)) if (!IGNORED.has(name)) visit(path.posix.join(rel, name), kind);
    } else if (stat.isFile() && (kind === 'code' ? CODE : DOC).test(rel)) {
      const text = fs.readFileSync(abs, 'utf8');
      const size = kind === 'code' ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : Buffer.byteLength(text);
      out.push({ file: rel, kind, size });
    }
  };
  for (const r of CODE_ROOTS) visit(r, 'code');
  for (const r of DOC_ROOTS) visit(r, 'doc');
  return out;
}

/** What breaks the limits: files over them, allowlisted files past their ceiling, and stale allowlist entries. */
function problems(files, limits = LIMITS, allowed = ALLOWED) {
  const bad = [];
  const unit = (kind) => (kind === 'code' ? 'lines' : 'bytes');
  const seen = new Set();
  for (const { file, kind, size } of files) {
    const limit = limits[kind];
    const ceiling = allowed[file];
    if (ceiling !== undefined) {
      seen.add(file);
      if (size <= limit) bad.push(`${file}: now ${size} ${unit(kind)}, within the limit; remove it from the allowlist in tools/check-size.cjs`);
      else if (size > ceiling) bad.push(`${file}: ${size} ${unit(kind)}, past its allowlisted ${ceiling}; split it rather than grow it`);
    } else if (size > limit) {
      bad.push(`${file}: ${size} ${unit(kind)}, over the limit of ${limit}; split it into smaller files`);
    }
  }
  for (const file of Object.keys(allowed)) if (!seen.has(file)) bad.push(`${file}: allowlisted but missing; remove it from the allowlist in tools/check-size.cjs`);
  return bad;
}

module.exports = { LIMITS, ALLOWED, measure, problems };

if (require.main === module) {
  const bad = problems(measure(path.join(__dirname, '..')));
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; }
  else console.log('File sizes are within limits.');
}
