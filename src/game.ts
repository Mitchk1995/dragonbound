import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { HoldMode } from './combat/holdInput';
import type { PlayerStats } from './combat/stats';
import { KEEP_STAGE } from './data/zones';
import type { Enemy } from './entities/enemy';
import type { GroundItem } from './entities/groundItem';
import type { Interactable } from './entities/interactable';
import { Pet } from './entities/pet';
import { Player } from './entities/player';
import { Particles } from './fx/particles';
import { Sfx } from './fx/sfx';
import { AmbientMotes } from './game/ambient';
import { followCamera } from './game/camera';
import { GameInput } from './game/input';
import * as life from './game/life';
import { ViewLight } from './game/lighting';
import * as render from './game/render';
import * as saving from './game/saving';
import { TitleScene } from './game/title';
import * as travel from './game/travel';
import { initIcons } from './render/icons3d';
import { PostChain } from './render/post';
import { disposeObject } from './render/resources';
import { getBackend, loadSave, newSave, type Appearance, type Graphics, type Lighting, type SaveBackend, type SaveData } from './save/save';
import { SaveWriter } from './save/writer';
import { Combat } from './systems/combat';
import { Fx } from './systems/fx';
import { Items } from './systems/items';
import { Progression } from './systems/progression';
import { Skilling } from './systems/skilling';
import { Story } from './systems/story';
import type { SkillId } from './types';
import { UI } from './ui/ui';
import { WorldText } from './ui/worldText';
import type { ZoneRuntime } from './world/zone';

export type Mode = 'title' | 'create' | 'play';

/** Neither WebGPU nor its WebGL 2 fallback could start on this machine. */
export class GraphicsError extends Error {
  constructor(cause: unknown) {
    super('The graphics could not start', { cause });
  }
}

/**
 * The game: its state, the systems that act on it, and the frame loop. The parts live beside it in
 * game/: rendering setup and quality, the view's light, the cameras, input, travel, recall and death,
 * the ambient motes and saving.
 */
export class Game {
  /** WebGPU where the machine has it, else WebGL 2 (the renderer falls back by itself). */
  readonly renderer: WebGPURenderer;
  /**
   * Scene → ambient occlusion and colour grade → bloom (HDR, only values above ~1 glow: emissives,
   * fire, lava, portals) → tone map.
   */
  readonly post: PostChain;
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
  /** Saving's own state (see SaveHost in game/saving.ts). */
  saveWriter = new SaveWriter((json) => this.backend.write(json));
  savesInFlight = 0;
  saveWarned = false;
  ownsSave = true;
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
  /** Yaw offset for the creation preview, driven by mouse drag. */
  previewYaw = 0;
  debug: {
    god: boolean; dropMult: number; timeScale: number; oneShot: boolean; poseView: boolean;
    /** Dev tooling takes over the frame: called instead of update; return true if it rendered itself. */
    hold: (() => boolean) | null;
  } = { god: false, dropMult: 1, timeScale: 1, oneShot: false, poseView: false, hold: null };

  private last = performance.now();
  private readonly input = new GameInput(this);
  private readonly view = new ViewLight(this);
  private readonly title = new TitleScene(this);
  private readonly ambient = new AmbientMotes(this);

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = render.createRenderer(canvas);
    this.post = new PostChain(this.renderer, this.scene, this.camera, () => this.scene.fog as THREE.Fog | null);
    render.dressScene(this);
    this.player.bind(this);

    this.text = new WorldText(document.getElementById('world-ui')!, this);
    this.ui = new UI(this);
    this.input.bind();
    window.addEventListener('resize', () => render.resize(this));
    render.resize(this);
  }

  /** The current zone. Only valid after the first travel (which happens before any gameplay). */
  get zone(): ZoneRuntime {
    return this.zoneOrNull!;
  }

  async start() {
    await Promise.all([this.renderer.init(), initIcons()]).catch((cause: unknown) => {
      throw new GraphicsError(cause);
    });
    saving.claimSave(this);
    const loaded = await loadSave(this.backend);
    this.hasSave = !!loaded?.character;
    this.save = loaded ?? newSave();
    this.sfx.setVolume(this.save.settings.volume);
    this.applyGraphics(this.save.settings.graphics ?? 'high');
    this.prog.refreshLevels();
    this.prog.recomputeStats();
    travel.enterZone(this, 'keep');
    this.player.obj.visible = false;
    this.title.buildDragon();
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
    // Back to the zone's own fog (the title orbit pushes it out).
    const fog = this.scene.fog as THREE.Fog;
    [fog.near, fog.far] = this.zone.def.theme.fog;
    this.ui.showCreate();
  }

  /** Character-creation preview: dress the hero in plain clothes with the chosen look. */
  previewLook(look: Appearance) {
    this.player.dresser.dress(look, {});
  }

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
    this.title.dispose();
    this.player.obj.visible = true;
    this.player.dress();
    this.player.hp = this.stats.maxHp;
    this.items.setPet(this.save.activePet);
    this.travel('keep', true);
    this.ui.showHud();
  }

  // ─── Zones, travel, recall and death (game/travel.ts, game/life.ts) ──────

  /** Light the scene for the current zone's theme (the sun, the sky and bounce light, the fill, the sky dome). */
  relight() {
    this.view.relight();
  }

  /** Portal travel with a fade. Leaving a zone discards it; the next visit is a fresh instance. */
  travel(id: string, instant = false) {
    travel.travel(this, id, instant);
  }

  /** Step onto a tower stair to change floors, emerging outside the other landing's trigger. */
  private tryStairs(dt: number) {
    travel.tryStairs(this, dt);
  }

  recall() {
    life.recall(this);
  }

  onPlayerDied() {
    life.onPlayerDied(this);
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
      this.title.update(raw);
      this.zone.update(dt);
      this.glow.update(dt);
      this.particles.update(dt);
      this.text.update(raw);
      this.ui.update(raw);
      return;
    }
    this.save.stats.playtime += raw;
    this.input.updateHover();
    this.input.updateHeldMouse(raw);
    life.updateRecall(this, raw);

    this.player.update(dt, this);
    this.tryStairs(dt);
    this.combat.updateMana(dt);
    life.updateDeath(this, raw);
    if (this.pet) this.pet.follow(dt, this.player, this.zone.nav);

    const z = this.zone;
    for (const e of z.enemies) e.update(dt, this);
    this.combat.separateUnits();
    z.enemies = z.enemies.filter((e) => {
      if (e.dead && e.deadT > 3) {
        disposeObject(e.obj);
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
    this.ambient.update(dt);
    this.particles.update(dt);
    this.glow.update(dt);
    this.updateCamera(raw);
    this.text.update(raw);
    this.ui.update(raw);

    this.saveT -= raw;
    if (!this.savesInFlight && (this.saveT <= 0 || (this.dirty && this.saveT < 17))) void this.persist();
  }

  // ─── Rendering (game/render.ts, game/lighting.ts, game/camera.ts) ────────

  /** Pick a quality preset (see game/render.ts). */
  applyGraphics(level: Graphics) {
    render.applyGraphics(this, level);
  }

  /** Switch the lighting effects (saved with the settings) and redraw the chain for them. */
  setLighting(lighting: Lighting) {
    this.save.settings.lighting = { ...lighting };
    this.applyGraphics(this.save.settings.graphics ?? 'high');
    this.dirty = true;
  }

  /** Render the current view through the post chain. */
  draw() {
    this.light();
    this.post.render();
  }

  /** Fit the sun's shadows and the fill to the current view (dev tooling wraps this). */
  private light() {
    this.view.fit();
  }

  /** Follow the hero with the play camera (dev tooling calls this to frame captures). */
  private updateCamera(dt: number) {
    followCamera(this, dt);
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

  // ─── Saving (game/saving.ts) ─────────────────────────────────────────────

  persist(): Promise<boolean> {
    return saving.persist(this);
  }

  /** Finish saving any progress earned while an earlier close-time snapshot was being written. */
  flushSave(): Promise<boolean> {
    return saving.flushSave(this);
  }

  resetSave() {
    return saving.resetSave(this);
  }
}
