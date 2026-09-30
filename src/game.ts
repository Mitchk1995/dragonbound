import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { holdTarget, pressTarget, type HoldMode } from './combat/holdInput';
import type { PlayerStats } from './combat/stats';
import type { AbilityKey } from './data/abilities';
import { COMBAT_TUNING } from './data/tuning';
import { KEEP_STAGE, ZONES } from './data/zones';
import type { Enemy } from './entities/enemy';
import type { GroundItem } from './entities/groundItem';
import type { Interactable } from './entities/interactable';
import { Pet } from './entities/pet';
import { Player } from './entities/player';
import { Particles } from './fx/particles';
import { Sfx } from './fx/sfx';
import { Rig, newAnimState } from './render/anim';
import { PAL } from './render/kit';
import { zoneLighting } from './render/env';
import { makeModel } from './render/registry';
import { getBackend, loadSave, newSave, type Appearance, type Graphics, type SaveBackend, type SaveData } from './save/save';
import { Combat } from './systems/combat';
import { Fx } from './systems/fx';
import { Items } from './systems/items';
import { Progression } from './systems/progression';
import { Skilling } from './systems/skilling';
import { Story } from './systems/story';
import type { SkillId } from './types';
import { UI } from './ui/ui';
import { WorldText } from './ui/worldText';
import { OCCLUDE } from './world/worldView';
import { ZoneRuntime } from './world/zone';

export type Mode = 'title' | 'create' | 'play';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  /** Scene → bloom (HDR, only values above ~1 glow: emissives, fire, lava, portals) → tone map. */
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
  readonly sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  readonly hemi = new THREE.HemisphereLight(0xb8c8e8, 0x5a4636, 1.25);
  /**
   * Cool fill from the side opposite the sun (no shadows): shadowed sides pick up sky colour
   * instead of going flat, so forms read warm-lit / cool-shaded like a painting.
   */
  readonly fill = new THREE.DirectionalLight(0x9ab4ff, 0.5);
  readonly particles = new Particles(2500, false);
  readonly glow = new Particles(3000, true);
  readonly sfx = new Sfx();
  readonly player = new Player();
  readonly combat = new Combat(this);
  readonly fx = new Fx(this);
  readonly items = new Items(this);
  readonly prog = new Progression(this);
  readonly skilling = new Skilling(this);
  readonly story = new Story(this);
  readonly ui: UI;
  readonly text: WorldText;
  save: SaveData = newSave();
  hasSave = false;
  backend: SaveBackend = getBackend();
  stats!: PlayerStats;
  levels: Record<SkillId, number> = { melee: 1, ranged: 1, magic: 1, defence: 1, hitpoints: 10, mining: 1, smithing: 1 };
  mode: Mode = 'title';
  zoneOrNull: ZoneRuntime | null = null;
  pet: Pet | null = null;

  /**
   * Screen position; NaN until the pointer is over the window (nothing is hovered before that).
   * `mode` is what holding the left button does (set by the press, see combat/holdInput.ts);
   * `swingsAtPress` tells a quick click whether its swing has started.
   */
  mouse = { x: NaN, y: NaN, down: false, holdT: 0, mode: 'none' as HoldMode, swingsAtPress: 0 };
  ground = new THREE.Vector3();
  hovered: Enemy | null = null;
  hoveredItem: GroundItem | null = null;
  hoveredThing: Interactable | null = null;
  altHeld = false;
  shiftHeld = false;
  /** Game time each skill key last fired (a held key's auto-repeat is throttled to keyRepeat). */
  private keyRepeatAt: Partial<Record<AbilityKey, number>> = {};
  camZoom = 1;
  camPos = new THREE.Vector3();
  shakeMag = 0;
  shakeT = 0;
  hitstopT = 0;
  time = 0;
  saveT = 20;
  dirty = false;
  deathT = 0;
  recallT = -1;
  traveling = false;
  debug: {
    god: boolean; dropMult: number; timeScale: number; oneShot: boolean; poseView: boolean;
    /** Dev tooling takes over the frame: called instead of update; return true if it rendered itself. */
    hold: (() => boolean) | null;
  } = { god: false, dropMult: 1, timeScale: 1, oneShot: false, poseView: false, hold: null };

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private last = performance.now();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ambientT = 0;
  private titleDragon: { obj: THREE.Group; rig: Rig; anim: ReturnType<typeof newAnimState> } | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.scene.fog = new THREE.Fog(0x2c2630, 38, 85);
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -28;
    sc.right = sc.top = 28;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.fill.target = this.sun.target;
    this.scene.add(this.sun, this.sun.target, this.fill, this.particles.mesh, this.glow.mesh, this.player.obj);
    this.player.bind(this);

    this.text = new WorldText(document.getElementById('world-ui')!, this);
    this.ui = new UI(this);
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** The current zone. Only valid after the first travel (which happens before any gameplay). */
  get zone(): ZoneRuntime {
    return this.zoneOrNull!;
  }

  /** False once another window has taken over the save (browser only), so stale windows can't overwrite it. */
  private ownsSave = true;

  /** In the browser, the newest window owns the save; older windows stop writing. */
  private claimSave() {
    if (window.electronAPI) return;
    const key = 'dragonbound.session';
    const id = Math.random().toString(36).slice(2);
    try {
      localStorage.setItem(key, id);
    } catch {
      return;
    }
    window.addEventListener('storage', (e) => {
      if (e.key !== key || e.newValue === id || !this.ownsSave) return;
      this.ownsSave = false;
      this.announce('Dragonbound was opened in another window. This window will no longer save.', 'deny');
    });
  }

  async start() {
    this.claimSave();
    const loaded = await loadSave(this.backend);
    this.hasSave = !!loaded?.character;
    this.save = loaded ?? newSave();
    this.sfx.setVolume(this.save.settings.volume);
    this.applyGraphics(this.save.settings.graphics ?? 'high');
    this.prog.refreshLevels();
    this.prog.recomputeStats();
    this.enterZone('keep');
    this.player.obj.visible = false;
    this.buildTitleDragon();
    this.ui.init();
    this.ui.showTitle();
    (window as any).__game = this;
    requestAnimationFrame(this.frame);
  }

  // ─── Modes ───────────────────────────────────────────────────────────────

  showCreate() {
    this.mode = 'create';
    // Stage the preview on the open plaza, clear of the island's rim trees.
    this.player.pos.set(KEEP_STAGE.x, 0, KEEP_STAGE.z);
    this.player.facing = this.player.targetFacing = 0;
    this.player.obj.visible = true;
    this.ui.showCreate();
  }

  /** Character-creation preview: dress the hero in plain clothes with the chosen look. */
  previewLook(look: Appearance) {
    this.player.dresser.dress(look, {});
  }

  /** Yaw offset for the creation preview, driven by mouse drag. */
  previewYaw = 0;

  /** Start a brand-new character (overwrites any existing save). */
  newGame(look: Appearance, skipTutorial: boolean) {
    const prev = this.save;
    this.save = newSave();
    this.save.settings = prev.settings;
    // A migrated demo save has progress but no character yet: carry levels and logs over.
    if (!prev.character) Object.assign(this.save, { skills: prev.skills, kc: prev.kc, collection: prev.collection, gold: prev.gold, stats: prev.stats, pets: prev.pets, activePet: prev.activePet });
    this.save.character = look;
    this.prog.refreshLevels();
    this.prog.recomputeStats();
    if (skipTutorial) this.story.finishTutorial(true);
    this.hasSave = true;
    this.beginPlay();
    if (!skipTutorial) this.ui.openDialogue(this.story.talk('warden'));
    this.persist();
  }

  continueGame() {
    this.beginPlay();
  }

  private beginPlay() {
    this.mode = 'play';
    this.titleDragon?.obj.removeFromParent();
    this.titleDragon = null;
    this.player.obj.visible = true;
    this.player.dress();
    this.player.hp = this.stats.maxHp;
    this.items.setPet(this.save.activePet);
    this.travel('keep', true);
    this.ui.showHud();
  }

  // ─── Zones & travel ──────────────────────────────────────────────────────

  private enterZone(id: string) {
    if (this.zoneOrNull) this.zoneOrNull.dispose();
    this.fx.clear();
    this.particles.clear();
    this.glow.clear();
    this.text.clear();
    this.ui.clearZoneState();
    const seed = id === 'keep' || id === 'foothills' || id === 'mine' || id === 'ruin' || id === 'lair' ? 1000 + id.length * 97 : Math.floor(Math.random() * 1e6);
    const z = new ZoneRuntime(this, id, seed);
    this.zoneOrNull = z;
    this.scene.add(z.group);
    z.populate();
    const t = z.def.theme;
    this.scene.background = new THREE.Color(t.bg);
    (this.scene.fog as THREE.Fog).color.setHex(t.bg);
    (this.scene.fog as THREE.Fog).near = t.fog[0];
    (this.scene.fog as THREE.Fog).far = t.fog[1];
    this.hemi.color.setHex(t.hemi[0]);
    this.hemi.groundColor.setHex(t.hemi[1]);
    this.hemi.intensity = t.hemi[2];
    const lit = zoneLighting(t);
    this.sun.color.copy(lit.key);
    this.sun.intensity = lit.keyIntensity;
    this.hemi.intensity = lit.hemiIntensity;
    this.fill.color.copy(lit.fill);
    this.fill.intensity = lit.fillIntensity;
    this.renderer.toneMappingExposure = t.exposure;
    this.hovered = null;
    this.hoveredItem = null;
    this.hoveredThing = null;
    this.ui.showBoss(null);
  }

  /** Portal travel with a fade. Leaving a zone discards it; the next visit is a fresh instance. */
  travel(id: string, instant = false) {
    if (this.traveling) return;
    const go = () => {
      this.skilling.stop();
      this.enterZone(id);
      const e = this.zone.layout.entry;
      const p = this.player;
      p.pos.set(e.x, 0, e.z);
      p.stop();
      p.queued = null;
      p.dash = null;
      p.action = null;
      p.kbx = p.kbz = 0;
      p.faceTo(e.x, e.z - 10, true);
      this.camPos.copy(p.pos);
      if (this.pet) this.pet.pos.set(e.x + 1, 0, e.z + 1);
      if (id === 'keep') {
        this.save.potions = this.save.potionMax;
        p.hp = Math.max(p.hp, this.stats.maxHp * 0.5);
      }
      this.fx.teleport(e.x, e.z);
      this.prog.recomputeStats();
      this.story.onEnterZone(id);
      this.ui.zoneTitle(ZONES[id].name);
      this.dirty = true;
    };
    if (instant) {
      go();
      return;
    }
    this.traveling = true;
    this.sfx.play('frost', 0.6, 0.7);
    this.ui.fade(() => {
      go();
      this.traveling = false;
    });
  }

  recall() {
    if (this.mode !== 'play' || this.player.dead || this.traveling) return;
    if (this.zone.def.kind === 'hub') {
      this.announce('You are already home.', 'info');
      return;
    }
    if (this.recallT >= 0) return;
    this.recallT = this.save.diaryClaimed.medium ? 1.5 : 3;
    this.skilling.stop();
    this.player.stop();
    this.announce('You grip the Veilstone...', 'info');
  }

  private updateRecall(dt: number) {
    if (this.recallT < 0) return;
    const p = this.player;
    if (p.cmd.kind !== 'none' || p.sinceHit < 0.05 || p.dead) {
      this.recallT = -1;
      this.announce('Your recall was interrupted.', 'deny');
      return;
    }
    this.recallT -= dt;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.spawn(p.x + Math.cos(a) * 0.7, 0.1, p.z + Math.sin(a) * 0.7, 0, 2 + Math.random() * 2, 0, 0.8, 0.07, 0x9ab8ff, 0, 0.5);
    }
    if (this.recallT <= 0) {
      this.recallT = -1;
      this.story.onRecall();
      this.travel('keep');
    }
  }

  onPlayerDied() {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.deadT = 0;
    p.action = null;
    p.dash = null;
    p.stop();
    this.skilling.stop();
    this.recallT = -1;
    this.deathT = 0;
    this.save.stats.deaths++;
    this.announce('Oh dear, you are dead!', 'death');
    this.sfx.play('roar', 0.3, 2);
    this.dirty = true;
  }

  private respawn() {
    const p = this.player;
    p.dead = false;
    p.anim.dead = -1;
    p.weakenedT = 10;
    this.prog.recomputeStats();
    p.hp = this.stats.maxHp;
    this.travel('keep');
    this.announce('You wake in the keep, shaken. Weakened for 10s (−25% damage).', 'info');
  }

  dressHero() {
    this.player.dress();
  }

  // ─── Loop ────────────────────────────────────────────────────────────────

  private frame = (now: number) => {
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let dt = raw * this.debug.timeScale;
    if (this.hitstopT > 0) {
      this.hitstopT -= raw;
      dt *= 0.08;
    }
    const hold = this.debug.hold;
    if (hold) {
      if (!hold()) this.draw();
    } else {
      this.update(dt, raw);
      this.draw();
    }
    requestAnimationFrame(this.frame);
  };

  /** Advance the simulation. Exposed for automated testing. */
  update(dt: number, raw = dt) {
    this.time += dt;
    if (this.mode !== 'play') {
      this.updateTitle(raw);
      this.zone.update(dt);
      this.glow.update(dt);
      this.particles.update(dt);
      this.ui.update(raw);
      return;
    }
    this.save.stats.playtime += raw;
    this.updateHover();
    this.updateHeldMouse(raw);
    this.updateRecall(raw);

    this.player.update(dt, this);
    if (this.player.dead) {
      this.deathT += raw;
      if (this.deathT > 3 && !this.traveling) this.respawn();
    }
    if (this.pet) this.pet.follow(dt, this.player, this.zone.nav);

    const z = this.zone;
    for (const e of z.enemies) e.update(dt, this);
    this.combat.separateUnits();
    z.enemies = z.enemies.filter((e) => {
      if (e.dead && e.deadT > 3) {
        e.obj.removeFromParent();
        return false;
      }
      return true;
    });
    z.update(dt);
    this.skilling.update(dt);
    this.combat.updateProjectiles(dt);
    this.combat.updateTelegraphs(dt);
    this.combat.updateHazards(dt);
    this.items.update(dt);
    this.fx.update(dt);
    this.updateAmbient(dt);
    this.particles.update(dt);
    this.glow.update(dt);
    this.updateCamera(raw);
    this.text.update(raw);
    this.ui.update(raw);

    this.saveT -= raw;
    if (this.saveT <= 0 || (this.dirty && this.saveT < 17)) this.persist();
  }

  /**
   * Quality presets. High: up to 2× pixel ratio, 4× MSAA, 2048 shadows, bloom. Medium: 1.5×,
   * MSAA, 1536 shadows, bloom. Low: 1× (no supersampling on HiDPI), no MSAA, 1024 shadows, no
   * bloom — for integrated GPUs.
   */
  applyGraphics(level: Graphics) {
    const p = { high: { ratio: 2, msaa: 4, shadow: 2048, bloom: true }, medium: { ratio: 1.5, msaa: 4, shadow: 1536, bloom: true }, low: { ratio: 1, msaa: 0, shadow: 1024, bloom: false } }[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.ratio));
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) rt.samples = p.msaa;
    this.bloom.enabled = p.bloom;
    if (this.sun.shadow.mapSize.x !== p.shadow) {
      this.sun.shadow.mapSize.set(p.shadow, p.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  /** Render the current view through the post chain. */
  draw() {
    this.composer.render();
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // Bloom is soft by nature: half resolution looks the same and costs a quarter.
    this.bloom.setSize(Math.round((w * this.renderer.getPixelRatio()) / 2), Math.round((h * this.renderer.getPixelRatio()) / 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number) {
    const p = this.player.pos;
    this.camPos.lerp(p, 1 - Math.exp(-dt * 8));
    const z = this.camZoom;
    this.camera.position.set(this.camPos.x, this.camPos.y + 21 * z, this.camPos.z + 14 * z);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.min(1, this.shakeT * 4);
      this.camera.position.x += (Math.random() - 0.5) * m;
      this.camera.position.y += (Math.random() - 0.5) * m;
      this.camera.position.z += (Math.random() - 0.5) * m;
    }
    this.camera.lookAt(this.camPos.x, this.camPos.y + 1, this.camPos.z);
    OCCLUDE.uOccOn.value = 1;
    OCCLUDE.uOccPlayer.value.copy(p);
    OCCLUDE.uOccCam.value.copy(this.camera.position);
    this.sun.position.set(p.x + 14, 28, p.z + 10);
    this.sun.target.position.set(p.x, 0, p.z);
    this.fill.position.set(p.x - 18, 14, p.z - 6);
  }

  private buildTitleDragon() {
    const m = makeModel('cinderwing');
    const obj = new THREE.Group();
    obj.add(m.root);
    const anim = newAnimState();
    anim.fly = 1;
    anim.speed = 3;
    this.scene.add(obj);
    this.titleDragon = { obj, rig: new Rig(m.root), anim };
  }

  private updateTitle(dt: number) {
    if (this.mode === 'create') {
      const p = this.player;
      p.obj.rotation.y = this.previewYaw + Math.sin(this.time * 0.4) * 0.15;
      p.anim.speed = 0;
      p.rig.update(dt, p.anim);
      // Frame the hero right of centre so the creation panel doesn't cover them
      // (debug pose checks centre them instead).
      const off = this.debug.poseView ? 0 : -1.4;
      this.camera.position.set(p.x + off, 2.2, p.z + 5.2);
      this.camera.lookAt(p.x + off, 1.15, p.z);
      this.sun.position.set(p.x + 6, 14, p.z + 10);
      this.fill.position.set(p.x - 8, 6, p.z - 2);
      this.sun.target.position.set(p.x, 0, p.z);
      OCCLUDE.uOccOn.value = 0;
      for (const f of this.zone.view.followers) f.position.set(p.x, 0, p.z);
      return;
    }
    const L = this.zone.layout;
    const cx = L.w / 2, cz = L.h / 2;
    const t = this.time * 0.05;
    this.camera.position.set(cx + Math.cos(t) * 52, 26, cz + Math.sin(t) * 52);
    this.camera.lookAt(cx, 2, cz);
    OCCLUDE.uOccOn.value = 0;
    this.sun.position.set(cx + 20, 40, cz + 10);
    this.fill.position.set(cx - 24, 20, cz - 8);
    this.sun.target.position.set(cx, 0, cz);
    const d = this.titleDragon;
    if (d) {
      const a = this.time * 0.22;
      const r = 42;
      d.obj.position.set(cx + Math.cos(a) * r, 8 + Math.sin(a * 2) * 3, cz + Math.sin(a) * r);
      // Orbiting counter-clockwise: velocity is (-sin a, cos a), so heading = atan2(-sin a, cos a) = -a.
      d.obj.rotation.y = -a;
      d.rig.update(dt, d.anim);
    }
    for (const f of this.zone.view.followers) f.position.set(cx, 0, cz);
  }

  private updateAmbient(dt: number) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.05;
    const p = this.player;
    const rx = () => p.x + (Math.random() - 0.5) * 30, rz = () => p.z + (Math.random() - 0.5) * 24;
    switch (this.zone.def.theme.ambient) {
      case 'embers':
        this.glow.spawn(rx(), 0.2 + Math.random() * 3, rz(), 0.6, 0.4 + Math.random() * 0.4, -0.3, 4, 0.05, Math.random() < 0.5 ? PAL.ember : PAL.fire, -0.05, 0);
        break;
      case 'void':
        this.glow.spawn(rx(), 0.3 + Math.random() * 2, rz(), (Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3, 3, 0.05, Math.random() < 0.5 ? 0xb8a0ff : 0x8ad0ff, -0.02, 0);
        break;
      case 'cave':
        this.glow.spawn(rx(), 0.5 + Math.random() * 2.5, rz(), 0.1, 0.05, 0.1, 5, 0.04, 0xffc890, 0, 0);
        break;
      case 'ash':
        this.particles.spawn(rx(), 6, rz(), 0.3, -0.6, 0.1, 6, 0.06, 0xb0b0b0, 0, 0);
        break;
    }
  }

  shake(mag: number, dur: number) {
    this.shakeMag = Math.max(this.shakeMag * Math.min(1, this.shakeT * 4), mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  hitstop(t: number) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  announce(text: string, kind: string) {
    this.ui.message(text, kind);
  }

  // ─── Input ───────────────────────────────────────────────────────────────

  private bindInput() {
    const c = this.canvas;
    window.addEventListener('mousemove', (e) => {
      if (this.mode === 'create' && e.buttons & 1 && e.target === c) this.previewYaw += e.movementX * 0.012;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    c.addEventListener('mousedown', (e) => {
      this.sfx.unlock();
      if (e.button !== 0 || this.mode !== 'play') return;
      this.mouse.down = true;
      this.mouse.holdT = 0;
      this.shiftHeld = e.shiftKey;
      this.onClick(e.shiftKey);
    });
    document.addEventListener('mouseleave', () => {
      this.mouse.x = this.mouse.y = NaN;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouse.down) this.onRelease();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      this.camZoom = Math.min(1.35, Math.max(0.65, this.camZoom + Math.sign(e.deltaY) * 0.06));
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      this.sfx.unlock();
      if (e.key === 'Alt') {
        this.altHeld = true;
        e.preventDefault();
        return;
      }
      if (e.key === 'Shift') this.shiftHeld = true;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') t.blur();
        return;
      }
      if (this.mode !== 'play') {
        this.ui.handleKey(e);
        return;
      }
      const k = e.key.toUpperCase();
      const skillKey = k === 'Q' || k === 'W' || k === 'E' || k === 'R' ? (k as AbilityKey) : null;
      if (e.repeat) {
        // A held skill key recasts, but no faster than keyRepeat and without refusal noise.
        if (!skillKey || this.time - (this.keyRepeatAt[skillKey] ?? -1e9) < COMBAT_TUNING.input.keyRepeat) return;
        this.keyRepeatAt[skillKey] = this.time;
        this.combat.useAbility(skillKey, true);
        return;
      }
      if (this.ui.handleKey(e)) {
        e.preventDefault();
        return;
      }
      if (skillKey) {
        this.keyRepeatAt[skillKey] = this.time;
        this.combat.useAbility(skillKey);
      }
      else if (k === '1') this.items.drinkPotion();
      else if (k === 'T') this.recall();
      else if (k === ' ') {
        this.player.stop();
        this.skilling.stop();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') this.altHeld = false;
      if (e.key === 'Shift') this.shiftHeld = false;
    });
    window.addEventListener('blur', () => {
      this.altHeld = false;
      this.shiftHeld = false;
      if (this.mouse.down) this.onRelease();
    });
    window.addEventListener('beforeunload', () => this.persist());
  }

  private updateHover() {
    if (!Number.isFinite(this.mouse.x)) {
      this.hovered = null;
      this.hoveredThing = null;
      if (!this.text.labelHovered) this.hoveredItem = null;
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    this.ndc.set((this.mouse.x / w) * 2 - 1, -(this.mouse.y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    ray.intersectPlane(this.groundPlane, this.ground);
    const center = new THREE.Vector3();
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.zone.enemies) {
      if (e.dead || e.untargetable) continue;
      const hgt = e.model.height;
      center.set(e.x, hgt * 0.45, e.z);
      const r = Math.max(e.radius * 1.3, hgt * 0.45, 0.7);
      if (ray.distanceSqToPoint(center) < r * r) {
        const along = ray.origin.distanceTo(center);
        if (along < bestD) {
          bestD = along;
          best = e;
        }
      }
    }
    this.hovered = best;
    this.hoveredThing = null;
    if (best || this.ui.overUI) return;
    let bi: GroundItem | null = null;
    let bd = 0.8 * 0.8;
    for (const it of this.zone.items) {
      if (it.gone || !it.landed) continue;
      const d = ray.distanceSqToPoint(center.set(it.x, 0.2, it.z));
      if (d < bd) {
        bd = d;
        bi = it;
      }
    }
    if (bi) this.hoveredItem = bi;
    else if (this.hoveredItem && !this.text.labelHovered) this.hoveredItem = null;
    if (bi) return;
    let bt: Interactable | null = null;
    bestD = Infinity;
    for (const it of this.zone.interactables) {
      center.set(it.x, it.height * 0.45, it.z);
      const r = Math.max(it.radius, it.height * 0.4);
      if (ray.distanceSqToPoint(center) < r * r) {
        const along = ray.origin.distanceTo(center);
        if (along < bestD) {
          bestD = along;
          bt = it;
        }
      }
    }
    this.hoveredThing = bt;
  }

  private onClick(shift: boolean) {
    const p = this.player;
    const m = this.mouse;
    m.mode = 'none';
    if (p.dead || this.traveling) return;
    if (this.recallT >= 0) this.recallT = -1;
    m.swingsAtPress = p.swings;
    if (shift && this.zone.def.kind !== 'hub') {
      // Attack in place; letting go of Shift mid-hold keeps attacking (never walks).
      m.mode = 'attack';
      this.forceAttack();
      return;
    }
    if (this.hovered) {
      m.mode = 'attack';
      p.attack(this.hovered, true);
      return;
    }
    if (this.hoveredItem) {
      p.pickup(this.hoveredItem);
      return;
    }
    if (this.hoveredThing) {
      p.interact(this.hoveredThing);
      return;
    }
    const near = pressTarget(this.zone.enemies, this.ground);
    if (near) {
      m.mode = 'attack';
      p.attack(near, true);
      return;
    }
    m.mode = 'move';
    p.moveTo(this, this.ground.x, this.ground.z);
    this.fx.moveMarker(this.ground.x, this.ground.z);
  }

  /** Letting go: a click on an enemy that hasn't swung yet still walks up and swings once. */
  private onRelease() {
    const p = this.player, m = this.mouse;
    m.down = false;
    if (m.mode === 'attack' && p.cmd.kind === 'attack') {
      if (p.swings > m.swingsAtPress) p.stop();
      else p.cmd.hold = false;
    }
    m.mode = 'none';
  }

  private updateHeldMouse(dt: number) {
    const p = this.player, m = this.mouse;
    if (!m.down || p.dead) return;
    m.holdT += dt;
    if (this.shiftHeld && m.mode !== 'none' && this.zone.def.kind !== 'hub') {
      m.mode = 'attack';
      if (!p.action && p.attackCd <= 0) this.forceAttack();
      return;
    }
    if (m.mode === 'attack') {
      // Keep swinging; when the target dies pick up the next one near the cursor, or stand ready.
      const cur = p.cmd.kind === 'attack' ? p.cmd.target : null;
      const next = holdTarget(this.zone.enemies, cur, this.hovered, this.ground, p, this.stats.range);
      if (next) p.attack(next, true);
      else if (!p.action) p.faceTo(this.ground.x, this.ground.z);
      return;
    }
    if (m.mode === 'move' && m.holdT > COMBAT_TUNING.input.walkRepeat) {
      m.holdT = 0;
      p.moveTo(this, this.ground.x, this.ground.z);
    }
  }

  private forceAttack() {
    const p = this.player;
    if (p.dash) return;
    p.stop();
    this.skilling.stop();
    p.faceTo(this.ground.x, this.ground.z, true);
    if (!p.action && p.attackCd <= 0) this.combat.startBasicAttack(this.hovered);
  }

  // ─── Saving ──────────────────────────────────────────────────────────────

  async persist() {
    this.saveT = 20;
    this.dirty = false;
    if (!this.save.character || !this.ownsSave) return;
    await this.backend.write(JSON.stringify(this.save));
  }

  async resetSave() {
    this.save = newSave();
    await this.backend.write(JSON.stringify(this.save));
    location.reload();
  }
}
