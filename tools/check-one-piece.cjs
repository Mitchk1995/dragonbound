// One object, one shape (AGENTS.md), run by `npm run check` through tests/one-piece.test.ts. Something meant to read
// as one solid object is one continuous mesh, never primitives pushed into each other. For every committed
// public/models/*.glb this welds each rigid part's triangles into connected pieces and measures how deep any
// piece's surface runs inside another closed piece. Pieces that only touch or rest on each other pass.
//
// Characters here are rigid parts hung on moving joints (no skinning): an upper arm overlaps the body at the
// shoulder and turns there, so pieces are only compared within one joint, never across one. A held weapon, bow or
// staff counts as its own joint (the fist closes round it), and each gear socket is one (gear is worn over the
// body, a separate file). Everything else a joint carries, the bits of a boot, a sword, a head or a helm, is one
// rigid object and is held to the rule.
//
// What it cannot see: an open piece (a sheet, or a shell with a crack in it) has no inside, so nothing is measured
// inside it, though its own surface is still tested against closed pieces; and two parts that share a vertex weld
// into one piece and are not compared with each other. The summary counts each model's open pieces.
const fs = require('node:fs');
const path = require('node:path');
const { TOUCH, meshNodes, pieces, depthInside } = require('./one-piece-geometry.cjs');

// The nodes src/render/anim.ts moves (or might move: every gear socket), plus held items. A mesh belongs to the
// nearest of these above it, or to the model's root. Blender's numbered copies (body.002) count as the same name.
const JOINT = /^(?:body|head|jaw|inner|neck\d+|tail\d+|wing[LR]|arm[LR]|elbow[LR]|hand[LR]|leg(?:[LR]|[FB][LR])|sock_\w+|weapon|bowbody|staffbody)$/;

// Models that were already breaking the rule when the check came in, each held at its worst depth then (whole mm)
// and its number of pairs of pieces passing inside one another, so neither can grow. A rebuild that fixes a model
// takes it off this list; a rebuild that only improves it lowers its numbers. Never add to it or raise a number.
const ALLOWED = {
  'cinderwing': [838, 443],
  'cultist': [88, 68],
  'drakeling': [236, 226],
  'gear_body_chain': [45, 13],
  'gear_body_leather': [118, 60],
  'gear_body_plate': [28, 8],
  'gear_body_plate_e': [35, 17],
  'gear_body_plate_p': [28, 8],
  'gear_boots': [95, 26],
  'gear_boots_e': [65, 4],
  'gear_boots_p': [65, 4],
  'gear_bow_drakebone': [43, 4],
  'gear_bow_hunter': [21, 6],
  'gear_bow_recurve': [7, 4],
  'gear_bow_worn': [29, 8],
  'gear_gloves': [74, 6],
  'gear_gloves_e': [10, 2],
  'gear_gloves_p': [10, 2],
  'gear_helm_full': [15, 8],
  'gear_helm_full_e': [98, 15],
  'gear_helm_full_p': [15, 8],
  'gear_helm_open': [53, 10],
  'gear_longsword': [59, 16],
  'gear_pickaxe': [79, 12],
  'gear_staff_apprentice': [49, 12],
  'gear_staff_ember': [50, 12],
  'gear_staff_oak': [59, 17],
  'gear_staff_runed': [43, 16],
  'gear_sword': [35, 13],
  'gear_u_ashen_crown': [40, 24],
  'gear_u_cinderfang': [59, 14],
  'gear_u_emberstring': [45, 47],
  'gear_u_kindled_ash': [54, 18],
  'gear_u_scaleguard': [144, 174],
  'gear_u_wyrmbone': [95, 38],
  'goblin': [130, 81],
  'golem': [70, 24],
  'hero': [128, 67],
  'kobold': [77, 88],
  'priest': [147, 121],
  'quartermaster': [125, 62],
  'warden': [210, 65],
  'whelp': [96, 101],
};

/**
 * A depth in metres as the allowlist records it: whole millimetres, rounded up, though a hundredth of a millimetre
 * over is still that millimetre (models are built to whole millimetres, and their float vertices miss by far less).
 */
const mm = (metres) => Math.ceil(metres * 1000 - 0.01);

/**
 * The rigid groups of a model: its meshes keyed by the path down to the joint (or root) that carries them, the
 * mesh's own node included in case it is a joint itself.
 */
function groups(meshes) {
  const out = new Map();
  for (const mesh of meshes) {
    let end = 1;
    mesh.chain.forEach((name, i) => { if (JOINT.test(name.replace(/\.\d+$/, ''))) end = i + 1; });
    const key = mesh.chain.slice(0, end).join('/');
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(mesh);
  }
  return out;
}

/**
 * One model measured: its pieces, the pairs of pieces that pass inside one another (each with its joint, the
 * meshes involved and its depth in metres) and its worst depth.
 */
function measureModel(file) {
  let count = 0, open = 0;
  const pairs = [];
  for (const [key, meshes] of groups(meshNodes(file))) {
    const joint = key.slice(key.lastIndexOf('/') + 1);
    const list = pieces(meshes);
    count += list.length;
    open += list.filter((p) => !p.closed).length;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const depth = Math.max(depthInside(list[i], list[j]), depthInside(list[j], list[i]));
      if (depth > TOUCH) pairs.push({ joint, a: list[i].names.join('+'), b: list[j].names.join('+'), depth });
    }
  }
  pairs.sort((x, y) => y.depth - x.depth);
  return { pieces: count, open, pairs, worst: pairs.length ? pairs[0].depth : 0 };
}

/** Every committed model under `root`, measured, as { model, ...measureModel }. */
function measure(root) {
  const dir = path.join(root, 'public', 'models');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()
    .map((f) => ({ model: f.replace(/\.glb$/, ''), ...measureModel(path.join(dir, f)) }));
}

/** One line per model: its pieces, how many pairs pass inside one another and the deepest, with where. */
function summary(results) {
  return results.map(({ model, pieces: n, open, pairs, worst }) => {
    const head = `${model.padEnd(24)} ${String(n).padStart(4)} pieces (${open} open)`;
    if (!pairs.length) return `${head}  clean`;
    const w = pairs[0];
    return `${head}  ${String(pairs.length).padStart(3)} pairs inside each other, worst ${mm(worst)} mm (${w.joint}: ${w.a} / ${w.b})`;
  });
}

/**
 * What breaks the rule: new offenders, allowlisted models worse than their entry or better than it (lower it), and
 * stale entries. An entry is [worst depth in mm, pairs of pieces inside one another].
 */
function problems(results, allowed = ALLOWED) {
  const bad = [];
  const seen = new Set();
  const where = 'tools/check-one-piece.cjs';
  const what = ([depth, count]) => `${depth} mm deep in ${count} pairs`;
  for (const { model, pairs, worst } of results) {
    const entry = allowed[model];
    const now = [mm(worst), pairs.length];
    if (entry !== undefined) {
      seen.add(model);
      if (!pairs.length) bad.push(`${model}: now one piece throughout; remove it from the allowlist in ${where}`);
      else if (now[0] > entry[0] || now[1] > entry[1]) {
        bad.push(`${model}: pieces pass inside one another ${what(now)}, worse than its allowlisted ${what(entry)} (worst ${pairs[0].a} / ${pairs[0].b}); model each object as one shape`);
      } else if (now[0] < entry[0] || now[1] < entry[1]) {
        bad.push(`${model}: now ${what(now)}, better than its allowlisted ${what(entry)}; lower its entry in ${where} to [${now.join(', ')}]`);
      }
    } else if (pairs.length) {
      bad.push(`${model}: pieces pass inside one another ${what(now)} (worst ${pairs[0].joint}: ${pairs[0].a} / ${pairs[0].b}); model each object as one shape (AGENTS.md, One object, one shape)`);
    }
  }
  for (const model of Object.keys(allowed)) if (!seen.has(model)) bad.push(`${model}: allowlisted but missing; remove it from the allowlist in ${where}`);
  return bad;
}

module.exports = { groups, measure, summary, problems };

if (require.main === module) {
  const results = measure(path.join(__dirname, '..'));
  console.log(summary(results).join('\n'));
  const bad = problems(results);
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; }
  else console.log('Every model keeps one object to one shape, or is no worse than its allowlist entry.');
}
