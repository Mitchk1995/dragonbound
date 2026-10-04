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
const fs = require('node:fs');
const path = require('node:path');
const { TOUCH, meshNodes, pieces, depthInside } = require('./one-piece-geometry.cjs');

// The nodes src/render/anim.ts moves (or might move: every gear socket), plus held items. A mesh belongs to the
// nearest of these above it, or to the model's root. Blender's numbered copies (body.002) count as the same name.
const JOINT = /^(?:body|head|jaw|inner|neck\d+|tail\d+|wing[LR]|arm[LR]|elbow[LR]|hand[LR]|leg(?:[LR]|[FB][LR])|sock_\w+|weapon|bowbody|staffbody)$/;

// Models that were already breaking the rule when the check came in, each held at its worst depth then (mm,
// rounded up) so it cannot get worse. A rebuild that fixes a model takes it off this list; a rebuild that only
// improves it lowers its number. Never add to it or raise a number.
const ALLOWED = {
  'beard_1': 13,
  'beard_2': 55,
  'beard_3': 50,
  'cinderwing': 838,
  'cultist': 126,
  'drakeling': 237,
  'gear_body_chain': 45,
  'gear_body_leather': 118,
  'gear_body_plate': 28,
  'gear_body_plate_e': 35,
  'gear_body_plate_p': 28,
  'gear_boots': 95,
  'gear_boots_e': 65,
  'gear_boots_p': 65,
  'gear_bow_drakebone': 49,
  'gear_bow_hunter': 47,
  'gear_bow_recurve': 74,
  'gear_bow_worn': 82,
  'gear_gloves': 74,
  'gear_gloves_e': 11,
  'gear_gloves_p': 11,
  'gear_helm_full': 16,
  'gear_helm_full_e': 98,
  'gear_helm_full_p': 16,
  'gear_helm_open': 53,
  'gear_longsword': 59,
  'gear_pickaxe': 79,
  'gear_staff_apprentice': 49,
  'gear_staff_ember': 50,
  'gear_staff_oak': 59,
  'gear_staff_runed': 43,
  'gear_sword': 35,
  'gear_u_ashen_crown': 40,
  'gear_u_cinderfang': 59,
  'gear_u_emberstring': 45,
  'gear_u_kindled_ash': 54,
  'gear_u_scaleguard': 144,
  'gear_u_wyrmbone': 95,
  'goblin': 131,
  'golem': 71,
  'hair_3': 19,
  'hero': 128,
  'kobold': 94,
  'priest': 147,
  'quartermaster': 125,
  'warden': 210,
  'whelp': 96,
};

/** Rounds a depth in metres up to whole millimetres, as the allowlist records it. */
const mm = (metres) => Math.ceil(metres * 1000 - 1e-6);

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

/** What breaks the rule: new offenders, allowlisted models past their depth or below it, and stale entries. */
function problems(results, allowed = ALLOWED) {
  const bad = [];
  const seen = new Set();
  const where = 'tools/check-one-piece.cjs';
  for (const { model, pairs, worst } of results) {
    const ceiling = allowed[model];
    const now = mm(worst);
    if (ceiling !== undefined) {
      seen.add(model);
      if (!pairs.length) bad.push(`${model}: now one piece throughout; remove it from the allowlist in ${where}`);
      else if (now > ceiling) bad.push(`${model}: pieces pass ${now} mm inside one another, past its allowlisted ${ceiling} mm (${pairs[0].a} / ${pairs[0].b}); model it as one shape`);
      else if (now < ceiling) bad.push(`${model}: worst overlap now ${now} mm, below its allowlisted ${ceiling} mm; lower its entry in ${where}`);
    } else if (pairs.length) {
      bad.push(`${model}: ${pairs.length} pairs of pieces pass inside one another, worst ${now} mm (${pairs[0].joint}: ${pairs[0].a} / ${pairs[0].b}); model each object as one shape (AGENTS.md, One object, one shape)`);
    }
  }
  for (const model of Object.keys(allowed)) if (!seen.has(model)) bad.push(`${model}: allowlisted but missing; remove it from the allowlist in ${where}`);
  return bad;
}

module.exports = { ALLOWED, JOINT, groups, measureModel, measure, summary, problems, mm };

if (require.main === module) {
  const results = measure(path.join(__dirname, '..'));
  console.log(summary(results).join('\n'));
  const bad = problems(results);
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; }
  else console.log('Every model keeps one object to one shape, or no worse than its allowlisted depth.');
}
