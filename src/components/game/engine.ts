import * as THREE from "three";
import { createEnvironment } from "./environment";
import { createIslands } from "./islands";
import { createPaperBird } from "./character";
import { createStars } from "./stars";
import { createEffects } from "./effects";
import { createNpcs, type NpcHandle } from "./npcs";
import { Sfx } from "./sfx";
import { InputManager } from "./input";
import { Multiplayer } from "./multiplayer";
import {
  buildKanjiHallInterior,
  type InteriorHandle,
  type InsideStation,
} from "./interior";
import {
  createPlayground,
  BADGES,
  type PlaygroundHandle,
  type ToyStation,
} from "./playground";
import {
  loadStars,
  saveStars,
  loadVisited,
  saveVisited,
  loadBadges,
  saveBadges,
} from "./progress";
import type { DioramaBlocker } from "./structures";
import {
  EMOTES,
  emoteById,
  emoteIconTexture,
  emoteUnlocked,
  unlockStars,
  loadMaxStars,
  saveMaxStars,
  loadGoldScarf,
  saveGoldScarf,
  disposeEmoteIcons,
} from "./emotes";
import {
  PALETTE,
  type EngineCallbacks,
  type PlayerAction,
} from "./types";
import { GITHUB_PROFILE, NPC_QUOTES, type Project } from "@/lib/projects";

// ---------- tuning fisika ----------
const GRAVITY = 26;
const JUMP_V = 10.5;
const DOUBLE_JUMP_V = 9.2;
const GLIDE_CAP = -4.0;
const SPEED = 7.5;
const TERMINAL_V = -30;
const COYOTE_TIME = 0.12;
const DASH_SPEED = 17;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.75;
const RESPAWN_Y = -26;
const EDGE_MARGIN = 0.3;
const TALK_RANGE = 2.3;
const TALK_DURATION = 6.0;
const DOOR_RANGE = 2.1;

// ---- taman bermain ----
const TRAMPOLINE_V = 15.5;
const PLAYER_R = 0.42;
const SWING_BADGE_T = 6;
const SWING_AUTO_EXIT = 12;
const SLIDE_DUR = 1.35;
const TOY_LABEL: Record<ToyStation["kind"], string> = {
  swing: "naik ayunan",
  slide: "luncur perosotan",
  c4: "main Connect 4",
  github: "buka github zyxcid",
};

export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private lastTime = 0;
  private elapsed = 0;
  private rafId = 0;
  private disposed = false;

  private env!: ReturnType<typeof createEnvironment>;
  private islands!: ReturnType<typeof createIslands>;
  private character!: ReturnType<typeof createPaperBird>;
  private stars!: ReturnType<typeof createStars>;
  private effects!: ReturnType<typeof createEffects>;
  private npcs!: ReturnType<typeof createNpcs>;
  input!: InputManager;
  sfx = new Sfx();
  /** Multiplayer presence — null bila host tidak diset (mode solo) */
  private multiplayer: Multiplayer | null = null;

  private cb: EngineCallbacks;
  private projectsCount: number;

  // state pemain (posisi = telapak kaki)
  private pos = new THREE.Vector3(0, 1.5, 2.5);
  private vel = new THREE.Vector3();
  private grounded = false;
  private groundCollider: number = -2; // index collider yang dipijak
  private groundIslandIndex: number | null = null;
  private coyote = 0;
  private airJumps = 1;
  private lastIslandIndex = 0;
  private visited = new Set<number>();
  private inputEnabled = true;
  private smoothCamPos = new THREE.Vector3();

  // tutorial input-driven: aksi yang sudah pernah dilakukan pemain
  private firedActions = new Set<PlayerAction>();

  // elemen bubble karakter
  private bubbleEl: HTMLElement | null = null;
  private projV = new THREE.Vector3();

  // bicara dengan penghuni pulau
  private talkNpc: NpcHandle | null = null;
  private talkTimer = 0;
  private nearNpcIsland: number | null = null;

  // pintu gedung proyek (Kanji Hall dkk.)
  private nearDoorIsland: number | null = null;
  private doorV = new THREE.Vector3();

  // interior 3D gedung proyek (ruangan "dimensi saku")
  private interiors = new Map<number, InteriorHandle>();
  private insideIsland: number | null = null;
  private returnPos = new THREE.Vector3();
  private insideNear: InsideStation | null = null;
  private insideNearKey: string | null = null;

  // emote (bintang → unlock)
  private emoteActiveId: string | null = null;
  private emoteT = 0;
  private emoteIcon: THREE.Sprite | null = null;
  private maxStarsSaved = 0;
  private goldScarf = false;
  private firedUnlocks = new Set<string>();
  private quizStreak = 0;

  // taman bermain + penghalang bangunan + progres lintas reload
  private playground!: PlaygroundHandle;
  private blockers: Array<{
    /** index pulau pemilik bangunan */
    island: number;
    cx: number;
    cz: number;
    hx: number;
    hz: number;
    top: number;
    /** posisi & rotasi dunia pulau (dihitung sekali — pulau hanya mengambang di Y) */
    wx: number;
    wz: number;
    rot: number;
    /** Y dunia batas atas blok */
    blockTopY: number;
  }> = [];
  private ride: { t: number } | null = null;
  private slideT = -1;
  private slides = 0;
  private trampCD = 0;
  private nearToy: ToyStation | null = null;
  private nearToyKey: string | null = null;
  private badges = new Set<string>();
  private savedStarIdx: number[] = [];

  // dash state
  private dashT = 0;
  private dashCD = 0;
  private dashDir = new THREE.Vector3(0, 0, -1);
  private trailAcc = 0;

  // star combo
  private collected = 0;
  private combo = 0;
  private comboTimer = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    projects: Project[],
    callbacks: EngineCallbacks,
    opts: { multiplayerHost?: string } = {}
  ) {
    this.cb = callbacks;
    this.projectsCount = projects.length;
    this.initScene();
    this.env = createEnvironment(this.scene);
    this.islands = createIslands(this.scene, projects);
    this.character = createPaperBird(this.scene);
    this.stars = createStars(this.scene, this.islands.starSpots);
    this.effects = createEffects(this.scene);

    // ---- penghalang bangunan (pemain & NPC tidak menembus gedung) ----
    const blockersByIsland = new Map<number, DioramaBlocker[]>();
    this.islands.handles.forEach((h) => {
      const bl = h.diorama?.blockers;
      if (!bl?.length) return;
      blockersByIsland.set(h.index, bl);
      for (const b of bl) {
        this.blockers.push({
          island: h.index,
          cx: b.cx,
          cz: b.cz,
          hx: b.hx,
          hz: b.hz,
          top: b.top,
          wx: h.group.position.x,
          wz: h.group.position.z,
          rot: h.group.rotation.y,
          blockTopY: h.group.position.y + b.top,
        });
      }
    });

    this.npcs = createNpcs(this.scene, this.islands.handles, blockersByIsland);

    // ---- taman bermain di pulau pusat ----
    this.playground = createPlayground(this.islands.handles[0].group);
    // undakan perosotan ikut daftar collider umum (bisa dipijak/diinjak)
    for (const s of this.playground.steps) this.islands.colliders.push(s.c);

    // ---- interior 3D gedung proyek (saat ini: Kanji Hall) ----
    projects.forEach((p, i) => {
      if (!p.showcase) return;
      const islandIndex = i + 1; // pulau 0 = Beranda
      const handle = this.islands.handles[islandIndex];
      if (!handle?.diorama?.door) return;
      const interior = buildKanjiHallInterior(p.showcase);
      this.interiors.set(islandIndex, interior);
      this.scene.add(interior.group);
    });

    // ---- pencapaian tersimpan (emote & syal emas) ----
    this.maxStarsSaved = loadMaxStars();
    this.goldScarf = loadGoldScarf();
    if (this.goldScarf) this.character.setScarfGold(true);

    // ---- progres lintas reload: bintang, kunjungan, lencana ----
    this.badges = new Set(loadBadges());
    this.savedStarIdx = loadStars().filter(
      (i) => i >= 0 && i < this.stars.stars.length
    );
    for (const i of this.savedStarIdx) {
      const st = this.stars.stars[i];
      if (!st.taken) {
        st.taken = true;
        st.sprite.visible = false;
        this.collected += 1;
      }
    }
    if (this.collected > this.maxStarsSaved) {
      this.maxStarsSaved = this.collected;
      saveMaxStars(this.collected);
    }
    for (const i of loadVisited()) {
      if (i >= 1 && i < this.islands.handles.length && !this.visited.has(i)) {
        this.visited.add(i);
        this.islands.setVisited(i);
      }
    }

    this.input = new InputManager(container);
    this.input.camDist = 11;
    this.input.onTalkKey = () => this.tryTalk();
    this.input.onEmoteKey = (slot) => {
      if (typeof slot === "number") this.playEmote(EMOTES[slot - 1]?.id ?? "");
      else if (slot === "next") this.playNextEmote();
    };

    // ---- multiplayer (opsional): tamu lain bila host ruang diset ----
    if (opts.multiplayerHost) {
      this.multiplayer = new Multiplayer({
        host: opts.multiplayerHost,
        onPresence: (n) => this.cb.onPresence?.(n),
        // tendangan bola dari tamu → terima ke fisika bola lokal
        onBall: (x, z, vx, vz) => this.playground.setBallState(x, z, vx, vz),
        // protokol Connect 4 → diteruskan ke UI (state permainan ada di sana)
        onC4: (msg) => this.cb.onC4Event?.(msg),
        onC4Peers: (peers) => this.cb.onC4Peers?.(peers),
      });
      this.multiplayer.attach(this.scene);
    }

    this.pos.copy(this.islands.spawnPoint);
    this.character.group.position.copy(this.pos);
    this.lastTime = performance.now() / 1000;
    this.cb.onStar(this.collected, this.stars.total); // info total (+yang tersimpan) ke UI

    this.updateCamera(0, true);
    this.onResize();
    window.addEventListener("resize", this.onResize);
    this.loop();
  }

  private initScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 45, 170);

    this.camera = new THREE.PerspectiveCamera(
      55,
      this.container.clientWidth / Math.max(1, this.container.clientHeight),
      0.1,
      500
    );
  }

  // ================= loop utama =================
  private loop = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastTime, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    const t = this.elapsed;

    this.input.tick(dt);
    this.physics(dt);
    this.updateMultiplayer(dt);
    this.updateEmote(dt);
    this.env.update(t);
    this.islands.update(t, this.groundIslandIndex);
    this.npcs.update(dt, t, this.pos);
    this.stars.update(dt, t);
    this.effects.update(dt);
    if (this.insideIsland !== null) {
      const interior = this.interiors.get(this.insideIsland);
      interior?.update(dt, t);
    }
    this.updateCharacterAnim(dt, t);
    this.updateCamera(dt, false);
    this.updateBubblePos();
    this.updateNpcProximity();
    this.updateDoorProximity();
    this.updatePlayground(dt);
    this.updateToyProximity();
    if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      if (this.talkTimer <= 0) {
        this.talkNpc = null;
        this.cb.onTalk(null);
      }
    }
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else this.combo = 0;
    if (this.dashCD > 0) this.dashCD -= dt;
    this.renderer.render(this.scene, this.camera);
  };

  /** Aksi pertama kali dilakukan → dilaporkan sekali ke UI (tutorial) */
  private fireAction(a: PlayerAction) {
    if (this.firedActions.has(a)) return;
    this.firedActions.add(a);
    this.cb.onAction(a);
  }

  /** Broadcast posisi sendiri + animasikan hantu tamu lain */
  private updateMultiplayer(dt: number) {
    if (!this.multiplayer) return;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let s: 0 | 1 | 2 | 3 = 0;
    if (this.dashT > 0) s = 3;
    else if (!this.grounded && this.vel.y < 0 && this.input.jumpHeld) s = 2;
    else if (!this.grounded) s = 1;
    this.multiplayer.update(dt, {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      ry: this.character.group.rotation.y,
      m: Math.min(1, speed / SPEED),
      s,
    });
  }

  /** Getaran gamepad halus (ikut mati bersama tombol suara) */
  private thump(strength: number, ms: number) {
    if (!this.sfx.isMuted) this.input.rumble(strength, ms);
  }

  // ================= fisika =================
  private physics(dt: number) {
    // ---- sedang mengayun di ayunan: kinematik penuh ----
    if (this.ride) {
      this.updateSwingRide(dt);
      return;
    }
    // ---- sedang meluncur di perosotan: kinematik penuh ----
    if (this.slideT >= 0) {
      this.updateSlide(dt);
      return;
    }

    // gerak terkunci selama emote bermain
    const move =
      this.inputEnabled && this.emoteT <= 0 ? this.input.getMove() : { x: 0, y: 0 };
    const hasInput = Math.hypot(move.x, move.y) > 0.08;
    const yaw = this.input.camYaw;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    // forward (menjauhi kamera) dan right dalam ruang dunia
    const moveX = c * move.x - s * move.y;
    const moveZ = -s * move.x - c * move.y;

    // ---- DASH ----
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.z = this.dashDir.z * DASH_SPEED;
      this.vel.y = 0.4; // dash melayang sedikit
      this.trailAcc += dt;
      if (this.trailAcc > 0.03) {
        this.trailAcc = 0;
        this.effects.trail(this.pos.x, this.pos.y, this.pos.z);
      }
      if (this.dashT <= 0) {
        this.vel.x *= 0.45;
        this.vel.z *= 0.45;
      }
    } else {
      if (this.inputEnabled && this.input.peekDash() && this.dashCD <= 0) {
        this.dashT = DASH_TIME;
        this.dashCD = DASH_COOLDOWN;
        this.input.consumeDash();
        this.fireAction("dash");
        if (hasInput) {
          this.dashDir.set(moveX, 0, moveZ).normalize();
        } else {
          // dash ke arah hadap karakter
          const yawChar = this.character.group.rotation.y;
          this.dashDir.set(Math.sin(yawChar), 0, Math.cos(yawChar));
        }
        this.sfx.dash();
        this.thump(0.5, 80);
        this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 3);
      }

      // ---- gerakan normal (akselerasi) ----
      const targetX = moveX * SPEED;
      const targetZ = moveZ * SPEED;
      const accelK = this.grounded ? 1 - Math.exp(-11 * dt) : 1 - Math.exp(-5.5 * dt);
      this.vel.x += (targetX - this.vel.x) * accelK;
      this.vel.z += (targetZ - this.vel.z) * accelK;

      // ---- lompat & double jump ----
      const wantJump = this.inputEnabled && this.input.peekJump();
      if (wantJump && (this.grounded || this.coyote > 0)) {
        this.vel.y = JUMP_V;
        this.grounded = false;
        this.coyote = 0;
        this.input.consumeJump();
        this.airJumps = 1;
        this.fireAction("jump");
        this.sfx.jump();
        this.thump(0.22, 50);
        this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 4);
      } else if (wantJump && !this.grounded && this.airJumps > 0) {
        this.vel.y = DOUBLE_JUMP_V;
        this.airJumps -= 1;
        this.input.consumeJump();
        this.character.onDoubleJump();
        this.fireAction("djump");
        this.sfx.doubleJump();
        this.thump(0.3, 60);
        this.effects.ring(this.pos.x, this.pos.y, this.pos.z);
      }

      // ---- gravitasi (tidak berlaku saat dash) ----
      this.vel.y -= GRAVITY * dt;
      const gliding =
        !this.grounded && this.vel.y < 0 && this.inputEnabled && this.input.jumpHeld;
      if (gliding) {
        this.vel.y = Math.max(this.vel.y, GLIDE_CAP);
      }
    }
    this.vel.y = Math.max(this.vel.y, TERMINAL_V);

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // ---- DI DALAM GEDUNG: lantai datar + dinding AABB ----
    if (this.insideIsland !== null) {
      this.physicsInterior();
      if (Math.hypot(this.vel.x, this.vel.z) > 1.4 && hasInput) {
        this.fireAction("move");
      }
      this.character.group.position.copy(this.pos);
      return;
    }

    // ---- dinding bangunan: dorong keluar supaya tidak menembus ----
    this.resolveBlockers();

    // ---- trampolin: injak / mendarat → pantul tinggi ----
    this.trampCD = Math.max(0, this.trampCD - dt);
    this.checkTrampoline();

    // ---- tetap menempel platform yang dipijak (pulau mengambang) ----
    if (this.grounded) {
      const col = this.islands.colliders[this.groundCollider];
      const dx = this.pos.x - col.cx;
      const dz = this.pos.z - col.cz;
      const stillOn = dx * dx + dz * dz <= (col.radius + 0.06) ** 2;
      if (stillOn) {
        this.pos.y = col.topY;
        this.vel.y = 0;
      } else {
        this.grounded = false;
        this.coyote = COYOTE_TIME;
        this.groundIslandIndex = null;
        this.cb.onPlatformChange(null);
      }
    }

    // ---- deteksi pendaratan (tabrakan lingkaran) ----
    if (!this.grounded && this.vel.y <= 0.4) {
      let bestIdx: number | null = null;
      let bestTop = -Infinity;
      for (let i = 0; i < this.islands.colliders.length; i++) {
        const col = this.islands.colliders[i];
        const dx = this.pos.x - col.cx;
        const dz = this.pos.z - col.cz;
        const within = dx * dx + dz * dz <= (col.radius + EDGE_MARGIN) ** 2;
        if (
          within &&
          prevY >= col.topY - 0.02 &&
          this.pos.y <= col.topY + 0.02 &&
          col.topY > bestTop
        ) {
          bestTop = col.topY;
          bestIdx = i;
        }
      }
      if (bestIdx !== null) {
        this.landOn(bestIdx);
      }
    }

    if (!this.grounded && this.coyote > 0) this.coyote -= dt;

    // ---- jatuh ke kehampaan → respawn ----
    if (this.pos.y < RESPAWN_Y) {
      this.respawn();
    }

    // ---- koleksi bintang ----
    const si = this.stars.tryCollect(this.pos.x, this.pos.y + 0.55, this.pos.z);
    if (si >= 0) {
      const st = this.stars.stars[si];
      this.effects.burst(st.x, st.y, st.z);
      this.collected += 1;
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 0;
      this.comboTimer = 1.6;
      this.sfx.collect(this.combo);
      this.thump(0.18, 45);
      this.cb.onStar(this.collected, this.stars.total);
      // catat pencapaian tertinggi (pembuka emote permanen) + simpan index
      // bintang supaya progres tidak hilang saat reload
      this.savedStarIdx.push(si);
      saveStars(this.savedStarIdx);
      if (this.collected > this.maxStarsSaved) {
        this.maxStarsSaved = this.collected;
        saveMaxStars(this.collected);
      }
      this.checkUnlocks();
      if (this.collected === this.stars.total) {
        this.sfx.allStars();
        this.cb.onAllStars();
      } else if (
        this.collected === 10 ||
        this.collected === 25 ||
        this.collected === 50
      ) {
        this.sfx.milestone();
      }
    }

    // ---- tutorial: pemain benar-benar bergerak ----
    if (hasInput && Math.hypot(this.vel.x, this.vel.z) > 1.4) {
      this.fireAction("move");
    }

    this.character.group.position.copy(this.pos);
  }

  /** Fisika khusus ruangan interior: lantai rata + dinding clamp */
  private physicsInterior() {
    const interior = this.interiors.get(this.insideIsland as number);
    if (!interior) {
      this.exitBuilding();
      return;
    }
    const b = interior.bounds;
    // dinding (kotak sumbu — clamp pasti benar)
    this.pos.x = Math.min(b.maxX, Math.max(b.minX, this.pos.x));
    this.pos.z = Math.min(b.maxZ, Math.max(b.minZ, this.pos.z));
    // lantai
    if (this.pos.y <= b.floorY) {
      if (!this.grounded) {
        this.pos.y = b.floorY;
        this.grounded = true;
        this.groundCollider = -2;
        this.groundIslandIndex = null;
        this.airJumps = 1;
        this.dashT = 0;
        this.vel.y = 0;
        this.character.onLand();
        this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 4);
        this.sfx.land();
        this.thump(0.3, 60);
      } else {
        this.pos.y = b.floorY;
        this.vel.y = 0;
      }
    } else if (this.grounded) {
      // melompat dari lantai
      this.grounded = false;
    }
    // pengaman: tidak ada kehampaan di dalam ruangan
    if (this.pos.y < b.floorY - 2) {
      this.pos.y = b.floorY;
      this.vel.set(0, 0, 0);
    }
  }

  private landOn(colliderIndex: number) {
    const col = this.islands.colliders[colliderIndex];
    this.pos.y = col.topY;
    this.vel.y = 0;
    this.grounded = true;
    this.groundCollider = colliderIndex;
    this.airJumps = 1;
    this.dashT = 0;
    this.character.onLand();
    this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 5);
    this.sfx.land();
    this.thump(0.32, 70);

    const islandIndex = col.isIsland ? col.index : null;
    if (islandIndex !== null && islandIndex !== this.groundIslandIndex) {
      this.groundIslandIndex = islandIndex;
      this.lastIslandIndex = islandIndex;
      this.cb.onPlatformChange(islandIndex);
    } else if (islandIndex === null && this.groundIslandIndex !== null) {
      this.groundIslandIndex = null;
      this.cb.onPlatformChange(null);
    }
    if (islandIndex !== null && islandIndex >= 1 && !this.visited.has(islandIndex)) {
      this.visited.add(islandIndex);
      this.islands.setVisited(islandIndex);
      this.sfx.visit();
      this.cb.onVisit(islandIndex);
      saveVisited([...this.visited]); // bendera tetap naik setelah reload
    }
  }

  private respawn() {
    const handle = this.islands.handles[this.lastIslandIndex];
    this.pos.set(
      handle.group.position.x,
      handle.group.position.y + 2.6,
      handle.group.position.z
    );
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 0;
    this.dashT = 0;
    this.groundIslandIndex = null;
    this.cb.onPlatformChange(null);
    this.sfx.fall();
    this.updateCamera(0, true);
  }

  // ================= animasi karakter =================
  private updateCharacterAnim(dt: number, t: number) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = speed > 0.6;
    const speedNorm = Math.min(1, speed / SPEED);
    let targetYaw: number | null = null;
    if (moving) {
      targetYaw = Math.atan2(this.vel.x, this.vel.z);
    } else if (this.dashT > 0) {
      targetYaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    }
    this.character.update({
      dt,
      t,
      moving,
      speedNorm,
      grounded: this.grounded,
      gliding: !this.grounded && this.vel.y < 0 && this.input.jumpHeld,
      dashing: this.dashT > 0,
      targetYaw,
    });

    // bayangan blob: cari permukaan di bawah karakter
    let shadowY: number | null = null;
    if (this.insideIsland !== null) {
      // di dalam gedung: lantai ruangan
      const b = this.interiors.get(this.insideIsland)?.bounds;
      if (b && this.pos.y >= b.floorY - 0.1) shadowY = b.floorY;
    } else {
      for (const col of this.islands.colliders) {
        const dx = this.pos.x - col.cx;
        const dz = this.pos.z - col.cz;
        if (
          dx * dx + dz * dz <= (col.radius + 0.3) ** 2 &&
          col.topY <= this.pos.y + 0.05 &&
          (shadowY === null || col.topY > shadowY)
        ) {
          shadowY = col.topY;
        }
      }
    }
    const sh = this.character.shadow;
    if (shadowY !== null) {
      const dist = this.pos.y - shadowY;
      sh.visible = true;
      sh.position.set(this.pos.x, shadowY + 0.03, this.pos.z);
      const k = Math.max(0.35, 1 - dist * 0.16);
      sh.scale.setScalar(k);
      (sh.material as THREE.MeshBasicMaterial).opacity = 0.24 * k;
    } else {
      sh.visible = false;
    }
  }

  // ================= kamera =================
  private updateCamera(dt: number, snap: boolean) {
    // di dalam ruangan: jarak kamera lebih dekat agar tidak menembus dinding
    const dist =
      this.insideIsland !== null
        ? Math.min(this.input.camDist, 9)
        : this.input.camDist;

    // auto-align: kamera mengikuti belakang pelan saat bergerak
    if (
      !snap &&
      performance.now() - this.input.lastDragTime > 1600 &&
      Math.hypot(this.vel.x, this.vel.z) > 3
    ) {
      const moveYaw = Math.atan2(this.vel.x, this.vel.z);
      const behind = moveYaw + Math.PI;
      let d = behind - this.input.camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.input.camYaw += d * Math.min(1, 1.2 * dt);
    }

    const y = this.input.camYaw;
    const p = this.input.camPitch;
    const off = new THREE.Vector3(
      Math.sin(y) * Math.cos(p) * dist,
      Math.sin(p) * dist + 1.8,
      Math.cos(y) * Math.cos(p) * dist
    );
    const target = new THREE.Vector3(
      this.pos.x + off.x,
      this.pos.y + off.y,
      this.pos.z + off.z
    );
    if (snap) {
      this.smoothCamPos.copy(target);
    } else {
      const k = 1 - Math.exp(-8 * dt);
      this.smoothCamPos.lerp(target, k);
    }
    // di dalam ruangan: kamera TIDAK boleh keluar kotak ruangan
    // (dinding sumbu-sejajar → clamp posisi kamera pasti benar)
    if (this.insideIsland !== null) {
      const b = this.interiors.get(this.insideIsland)?.bounds;
      if (b) {
        this.smoothCamPos.x = Math.min(b.maxX + 0.25, Math.max(b.minX - 0.25, this.smoothCamPos.x));
        this.smoothCamPos.z = Math.min(b.maxZ + 0.25, Math.max(b.minZ - 0.25, this.smoothCamPos.z));
        this.smoothCamPos.y = Math.min(b.ceilY, Math.max(b.floorY + 0.45, this.smoothCamPos.y));
        target.set(this.smoothCamPos.x, this.smoothCamPos.y, this.smoothCamPos.z);
      }
    }
    this.camera.position.copy(this.smoothCamPos);
    this.camera.lookAt(this.pos.x, this.pos.y + 0.85, this.pos.z);

    // juice: FOV melebar saat dash
    const wantFov = this.dashT > 0 ? 62 : 55;
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();
  }

  // ================= bubble bicara NPC =================
  setBubbleEl(el: HTMLElement | null) {
    this.bubbleEl = el;
  }

  private updateBubblePos() {
    if (!this.bubbleEl) return;
    if (!this.talkNpc) {
      this.bubbleEl.style.opacity = "0";
      return;
    }
    const p = this.talkNpc.worldPos;
    this.projV.set(p.x, p.y + 1.15, p.z);
    this.projV.project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const x = (this.projV.x * 0.5 + 0.5) * w;
    const y = (-this.projV.y * 0.5 + 0.5) * h;
    const behind = this.projV.z > 1;
    this.bubbleEl.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    this.bubbleEl.style.opacity = behind ? "0" : "1";
  }

  // ================= interaksi NPC =================
  private findNearNpc(): NpcHandle | null {
    if (!this.inputEnabled) return null;
    let best: NpcHandle | null = null;
    let bestD = TALK_RANGE;
    for (const npc of this.npcs.npcs) {
      const dx = this.pos.x - npc.worldPos.x;
      const dz = this.pos.z - npc.worldPos.z;
      const dy = this.pos.y - npc.worldPos.y;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dy > -0.9 && dy < 1.8) {
        best = npc;
        bestD = d;
      }
    }
    return best;
  }

  private updateNpcProximity() {
    const near = this.findNearNpc();
    const idx = near ? near.islandIndex : null;
    if (idx !== this.nearNpcIsland) {
      this.nearNpcIsland = idx;
      this.cb.onNpcNear(idx);
    }
  }

  // ================= interaksi gedung =================
  /** Station interior / pintu gedung mana yang sedang dekat pemain */
  private updateDoorProximity() {
    // ---- di dalam gedung: station terdekat ----
    if (this.insideIsland !== null) {
      const interior = this.interiors.get(this.insideIsland);
      let best: InsideStation | null = null;
      let bestD = Infinity;
      if (interior && this.inputEnabled) {
        for (const st of interior.stations) {
          const dx = this.pos.x - st.x;
          const dz = this.pos.z - st.z;
          const dy = this.pos.y - st.y;
          const d = Math.hypot(dx, dz);
          if (d < st.r && dy > -1.6 && dy < 3.6 && d < bestD) {
            best = st;
            bestD = d;
          }
        }
      }
      const key = best
        ? `${best.kind}|${best.galleryIdx ?? best.padIdx ?? ""}`
        : null;
      if (key !== this.insideNearKey) {
        this.insideNear = best;
        this.insideNearKey = key;
        this.cb.onInsideNear?.(
          best
            ? {
                kind: best.kind,
                caption: best.caption,
                galleryIdx: best.galleryIdx,
              }
            : null
        );
      }
      if (this.nearDoorIsland !== null) {
        this.nearDoorIsland = null;
        this.cb.onDoorNear?.(null);
      }
      return;
    }

    // ---- di luar: pintu gedung ----
    if (this.insideNearKey !== null) {
      this.insideNear = null;
      this.insideNearKey = null;
      this.cb.onInsideNear?.(null);
    }
    let idx: number | null = null;
    if (this.inputEnabled) {
      for (const h of this.islands.handles) {
        const door = h.diorama?.door;
        if (!door) continue;
        door.getWorldPosition(this.doorV);
        const dx = this.pos.x - this.doorV.x;
        const dz = this.pos.z - this.doorV.z;
        const dy = this.pos.y - this.doorV.y;
        if (Math.hypot(dx, dz) < DOOR_RANGE && dy > -1.2 && dy < 2.6) {
          idx = h.index;
          break;
        }
      }
    }
    if (idx !== this.nearDoorIsland) {
      this.nearDoorIsland = idx;
      this.cb.onDoorNear?.(idx);
    }
  }

  /** Dispar saat tombol E / tombol BICARA ditekan (bisa juga dari React).
   *  Prioritas: interaksi interior > pintu gedung > sapa NPC. */
  tryTalk() {
    if (!this.inputEnabled) return;

    // ---- di dalam gedung ----
    if (this.insideIsland !== null) {
      const st = this.insideNear;
      if (!st) return;
      if (st.kind === "exit") {
        this.exitBuilding();
        return;
      }
      if (st.kind === "book") {
        this.sfx.talk();
        this.cb.onEnterBuilding?.(this.insideIsland);
        return;
      }
      if (st.kind === "shot") {
        this.sfx.talk();
        this.cb.onEnterBuilding?.(this.insideIsland, st.galleryIdx);
        return;
      }
      if (st.kind === "pad") {
        const interior = this.interiors.get(this.insideIsland);
        if (!interior || st.padIdx === undefined) return;
        const res = interior.answerPad(st.padIdx);
        if (!res) return; // kuis terkunci sementara
        this.quizStreak = res.streak;
        if (res.correct) {
          this.sfx.collect(Math.min(this.quizStreak, 8));
          this.effects.burst(this.pos.x, this.pos.y + 1.1, this.pos.z);
          this.effects.confetti(this.pos.x, this.pos.y, this.pos.z);
          this.thump(0.35, 80);
        } else {
          this.sfx.talk();
          this.thump(0.15, 60);
        }
        this.cb.onQuizResult?.(res.correct, res.streak);
        return;
      }
      return;
    }

    // ---- pintu gedung → masuk ruangan 3D ----
    if (this.nearDoorIsland !== null) {
      this.enterBuilding(this.nearDoorIsland);
      return;
    }

    // ---- sedang mengayun: E = turun ----
    if (this.ride) {
      this.endSwingRide(true);
      return;
    }

    // ---- mainan taman bermain ----
    if (this.nearToy) {
      if (this.nearToy.kind === "swing") {
        this.rideSwing();
      } else if (this.nearToy.kind === "slide") {
        this.startSlide();
      } else if (this.nearToy.kind === "github") {
        // gerbang GitHub: buka profil di tab baru (dipicu gesture E/tap —
        // window.open aman dari pemblokir pop-up)
        this.sfx.visit();
        this.thump(0.25, 60);
        try {
          window.open(GITHUB_PROFILE, "_blank", "noopener,noreferrer");
        } catch {
          // pemblokir pop-up — diam saja, hint tetap ada di UI
        }
      } else {
        this.sfx.talk();
        this.cb.onOpenConnect4?.();
      }
      return;
    }

    const npc = this.findNearNpc();
    if (!npc) return;
    npc.excite();
    this.talkNpc = npc;
    this.talkTimer = TALK_DURATION;
    this.fireAction("talk");
    this.sfx.talk();
    this.cb.onTalk({
      islandIndex: npc.islandIndex,
      quote: NPC_QUOTES[npc.islandIndex % NPC_QUOTES.length],
    });
  }

  // ================= interior gedung =================
  /** Masuk ke ruangan 3D gedung proyek (pintu / tombol panel) */
  enterBuilding(islandIndex: number) {
    if (this.insideIsland === islandIndex) return;
    const interior = this.interiors.get(islandIndex);
    if (!interior) {
      // tidak ada interior 3D — fallback ke overlay pameran
      this.cb.onEnterBuilding?.(islandIndex);
      return;
    }
    if (this.insideIsland !== null) this.exitBuilding();
    // ingat posisi kembali (tepat di depan pintu tempat pemain berdiri)
    this.returnPos.copy(this.pos);
    this.returnPos.y += 0.02;
    interior.setVisible(true);
    this.pos.copy(interior.spawn);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.groundCollider = -2;
    this.groundIslandIndex = null;
    this.coyote = 0;
    this.dashT = 0;
    this.talkNpc = null;
    this.talkTimer = 0;
    this.insideIsland = islandIndex;
    this.insideNear = null;
    this.insideNearKey = null;
    this.cb.onInsideNear?.(null);
    this.cb.onPlatformChange(null);
    this.cb.onBuildingInside?.(islandIndex);
    this.sfx.visit();
    this.thump(0.25, 70);
    this.updateCamera(0, true);
  }

  /** Keluar dari interior → kembali ke depan pintu gedung */
  exitBuilding() {
    if (this.insideIsland === null) return;
    const interior = this.interiors.get(this.insideIsland);
    interior?.setVisible(false);
    this.pos.copy(this.returnPos);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 0;
    this.dashT = 0;
    this.insideIsland = null;
    this.insideNear = null;
    this.insideNearKey = null;
    this.cb.onInsideNear?.(null);
    this.cb.onBuildingInside?.(null);
    this.sfx.talk();
    this.updateCamera(0, true);
  }

  // ================= emote =================
  /** Mainkan emote (dipanggil UI / tombol Q / gamepad) — cek unlock bintang.
   *  Sengaja TIDAK dicek inputEnabled: roda emote mematikan input engine,
   *  tapi emote yang dipilih dari roda tetap harus bisa bermain. */
  playEmote(id: string) {
    if (!id || this.emoteT > 0) return;
    const def = emoteById(id);
    if (!def) return;
    const stars = Math.max(this.collected, this.maxStarsSaved);
    if (!emoteUnlocked(def, stars, this.stars.total)) {
      this.cb.onEmoteBlocked?.(def.id, unlockStars(def, this.stars.total));
      return;
    }
    this.emoteActiveId = id;
    this.emoteT = def.dur;
    this.character.playEmote(id, def.dur);
    if (def.fx === "hearts") this.effects.hearts(this.pos.x, this.pos.y, this.pos.z);
    if (def.fx === "confetti")
      this.effects.confetti(this.pos.x, this.pos.y, this.pos.z);
    this.sfx.emote();
    this.multiplayer?.sendEmote(id);
    // ikon emote melayang di atas kepala (terlihat pemain sendiri & konsisten
    // dengan yang dilihat tamu lain pada ghost)
    if (!this.emoteIcon) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      this.emoteIcon = new THREE.Sprite(mat);
      this.emoteIcon.scale.set(0.55, 0.55, 1);
      this.emoteIcon.renderOrder = 5;
      this.scene.add(this.emoteIcon);
    }
    const mat = this.emoteIcon.material as THREE.SpriteMaterial;
    mat.map = emoteIconTexture(id);
    mat.needsUpdate = true;
    this.emoteIcon.visible = true;
  }

  /** Siklus ke emote berikutnya yang sudah terbuka (gamepad LB) */
  playNextEmote() {
    const stars = Math.max(this.collected, this.maxStarsSaved);
    const unlocked = EMOTES.filter((d) =>
      emoteUnlocked(d, stars, this.stars.total)
    );
    if (unlocked.length <= 1) {
      this.playEmote("wave");
      return;
    }
    const cur = unlocked.findIndex((d) => d.id === this.emoteActiveId);
    const next = unlocked[(cur + 1) % unlocked.length];
    this.playEmote(next.id);
  }

  /** Posisi ikon emote sendiri + akhir durasi */
  private updateEmote(dt: number) {
    if (this.emoteT <= 0) return;
    this.emoteT = Math.max(0, this.emoteT - dt);
    if (this.emoteIcon) {
      this.emoteIcon.position.set(
        this.pos.x,
        this.pos.y + 2.1 + Math.sin(this.elapsed * 3) * 0.06,
        this.pos.z
      );
      if (this.emoteT <= 0) this.emoteIcon.visible = false;
    }
  }

  /** Cek pencapaian baru setelah bintang terkumpul (emote & syal emas) */
  private checkUnlocks() {
    const total = this.stars.total;
    for (const def of EMOTES) {
      const need = unlockStars(def, total);
      if (
        need > 0 &&
        this.collected >= need &&
        !this.firedUnlocks.has(def.id)
      ) {
        this.firedUnlocks.add(def.id);
        this.cb.onEmoteUnlocked?.(def.id);
        this.sfx.milestone();
      }
    }
    if (!this.goldScarf && total > 0 && this.collected >= total) {
      this.goldScarf = true;
      saveGoldScarf();
      this.character.setScarfGold(true);
      this.cb.onScarfUnlock?.();
    }
  }

  // ================= taman bermain =================
  /** Loop taman bermain: fisika bola + denyut trampolin + sinkron ketinggian */
  private updatePlayground(dt: number) {
    const hubY = this.islands.handles[0].group.position.y;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const kicked = this.playground.update(dt, this.elapsed, hubY, {
      x: this.pos.x,
      z: this.pos.z,
      speed,
    });
    if (kicked) {
      this.sfx.boing();
      this.thump(0.22, 55);
      // broadcast tendangan (posisi + kecepatan) supaya bola tamu lain sama
      const b = this.playground.getBallState();
      this.multiplayer?.sendBall(b.x, b.z, b.vx, b.vz);
      if (this.playground.kicks >= 15) this.awardBadge("kicker");
    }
  }

  /** Mainan mana yang sedang dekat pemain (untuk hint E / tombol sentuh) */
  private updateToyProximity() {
    let best: ToyStation | null = null;
    let bestD = Infinity;
    if (this.inputEnabled && this.ride === null && this.slideT < 0) {
      const hubY = this.islands.handles[0].group.position.y;
      for (const st of this.playground.stations) {
        const dx = this.pos.x - st.x;
        const dz = this.pos.z - st.z;
        const dy = this.pos.y - hubY;
        const d = Math.hypot(dx, dz);
        if (d < st.r && d < bestD) {
          if (st.kind === "slide" && dy < 1.35) continue; // harus di platform atas
          if (st.kind === "swing" && dy > 2.4) continue; // bukan saat melintas di udara
          best = st;
          bestD = d;
        }
      }
    }
    const key = best ? best.kind : null;
    if (key !== this.nearToyKey) {
      this.nearToy = best;
      this.nearToyKey = key;
      this.cb.onToyNear?.(
        best ? { kind: best.kind, label: TOY_LABEL[best.kind] } : null
      );
    }
  }

  /** Dorong pemain keluar dari kotak bangunan (AABB lokal pulau) */
  private resolveBlockers() {
    for (const b of this.blockers) {
      if (this.pos.y > b.blockTopY) continue; // melompati atap — biarkan
      const dx = this.pos.x - b.wx;
      const dz = this.pos.z - b.wz;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      // dunia → lokal pulau
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      const ox = b.hx + PLAYER_R - Math.abs(lx - b.cx);
      if (ox <= 0) continue;
      const oz = b.hz + PLAYER_R - Math.abs(lz - b.cz);
      if (oz <= 0) continue;
      // dorong keluar lewat sisi tertipis
      let nlx = lx;
      let nlz = lz;
      if (ox < oz) {
        nlx = b.cx + (lx >= b.cx ? 1 : -1) * (b.hx + PLAYER_R);
      } else {
        nlz = b.cz + (lz >= b.cz ? 1 : -1) * (b.hz + PLAYER_R);
      }
      // lokal pulau → dunia
      this.pos.x = b.wx + c * nlx + s * nlz;
      this.pos.z = b.wz - s * nlx + c * nlz;
    }
  }

  /** Pantulan trampolin (berlaku saat jatuh ke atasnya atau berjalan menimpanya) */
  private checkTrampoline() {
    if (this.trampCD > 0) return;
    const tr = this.playground.tramp;
    const dx = this.pos.x - tr.x;
    const dz = this.pos.z - tr.z;
    if (dx * dx + dz * dz > tr.r * tr.r) return;
    if (this.pos.y > tr.topY + 0.2 || this.pos.y < tr.topY - 1.4) return;
    if (this.dashT > 0) return; // dash tetap melesat, tidak terganggu
    this.pos.y = tr.topY;
    this.vel.y = TRAMPOLINE_V;
    this.grounded = false;
    this.coyote = 0;
    this.trampCD = 0.3;
    this.playground.bounces += 1;
    this.playground.trampPulse();
    this.sfx.boing();
    this.thump(0.3, 70);
    this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 3);
    if (this.playground.bounces >= 10) this.awardBadge("bouncer");
  }

  /** Kinematik mengayun: posisi mengikuti bandul, SPASI = lompat dengan momentum */
  private updateSwingRide(dt: number) {
    const ride = this.ride;
    if (!ride) return;
    ride.t += dt;
    const sw = this.playground.swing;
    const hubY = this.islands.handles[0].group.position.y;
    const A = 0.8;
    const W = 4.0;
    const th = A * Math.sin(W * ride.t);
    const dth = A * W * Math.cos(W * ride.t);
    this.playground.swingAngle(th);
    this.pos.set(
      sw.x + Math.sin(th) * sw.L,
      hubY + sw.topY - Math.cos(th) * sw.L + 0.12,
      sw.z
    );
    // kecepatan (untuk animasi kaki + broadcast ke tamu lain)
    this.vel.set(
      Math.cos(th) * dth * sw.L,
      Math.sin(th) * dth * sw.L,
      0
    );

    // lompat = melompat dari ayunan membawa kecepatan ayunannya
    if (this.inputEnabled && this.input.peekJump()) {
      this.input.consumeJump();
      this.endSwingRide(false);
      this.vel.set(THREE.MathUtils.clamp(this.vel.x, -8, 8), 8.6, 0);
      this.fireAction("jump");
      this.sfx.jump();
      this.thump(0.25, 60);
      return;
    }
    if (ride.t >= SWING_BADGE_T) this.awardBadge("rider");
    if (ride.t >= SWING_AUTO_EXIT) this.endSwingRide(true);
    this.character.group.position.copy(this.pos);
  }

  /** Turun dari ayunan (gentle = pelan tanpa lompatan) */
  private endSwingRide(gentle: boolean) {
    if (!this.ride) return;
    this.playground.swingAngle(null);
    this.ride = null;
    this.grounded = false;
    this.coyote = 0;
    this.airJumps = 1;
    if (gentle) {
      this.vel.multiplyScalar(0.25);
      this.vel.y = 1.5;
    }
  }

  /** Mulai mengayun (dipanggil E dekat kursi ayunan) */
  rideSwing() {
    if (this.ride || this.slideT >= 0) return;
    this.ride = { t: 0 };
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.talkNpc = null;
    this.talkTimer = 0;
    this.sfx.emote();
    this.thump(0.2, 50);
  }

  /** Kinematik luncuran perosotan dari platform atas sampai bawah */
  private updateSlide(dt: number) {
    this.slideT += dt;
    const sl = this.playground.slide;
    const p = Math.min(1, this.slideT / SLIDE_DUR);
    const pe = p * (0.35 + 0.65 * p); // mulai pelan, makin cepat
    this.pos.set(
      sl.top.x + (sl.bottom.x - sl.top.x) * pe,
      sl.top.y + (sl.bottom.y - sl.top.y) * pe,
      sl.top.z + (sl.bottom.z - sl.top.z) * pe
    );
    const dpe = (0.35 + 1.3 * p) / SLIDE_DUR;
    this.vel.set(
      (sl.bottom.x - sl.top.x) * dpe,
      (sl.bottom.y - sl.top.y) * dpe,
      (sl.bottom.z - sl.top.z) * dpe
    );
    if (p >= 1) {
      this.slideT = -1;
      this.slides += 1;
      const dirX = sl.bottom.x - sl.top.x;
      const dirZ = sl.bottom.z - sl.top.z;
      const dl = Math.hypot(dirX, dirZ) || 1;
      this.vel.set((dirX / dl) * 5.2, 2.4, (dirZ / dl) * 5.2);
      this.grounded = false;
      this.airJumps = 1;
      this.effects.dust(this.pos.x, this.pos.y, this.pos.z, 5);
      this.sfx.land();
      this.thump(0.35, 80);
      if (this.slides >= 2) this.awardBadge("slider");
    }
    this.character.group.position.copy(this.pos);
  }

  /** Mulai meluncur (dipanggil E di platform atas perosotan) */
  startSlide() {
    if (this.slideT >= 0 || this.ride) return;
    this.slideT = 0;
    this.talkNpc = null;
    this.talkTimer = 0;
    this.sfx.dash(); // whoosh luncur
    this.thump(0.2, 60);
  }

  /** Buka lencana taman bermain (kolektibel) — return true bila baru terbuka */
  awardBadge(id: string): boolean {
    if (this.badges.has(id)) return false;
    const def = BADGES.find((b) => b.id === id);
    if (!def) return false;
    this.badges.add(id);
    saveBadges([...this.badges]);
    this.sfx.milestone();
    this.effects.confetti(this.pos.x, this.pos.y + 0.8, this.pos.z);
    this.thump(0.4, 90);
    this.cb.onBadgeUnlocked?.(id);
    return true;
  }

  // ================= API publik =================
  /** Teleport karakter ke pulau proyek (untuk daftar proyek) */
  teleportTo(index: number) {
    // bila sedang mengayun/meluncur: hentikan dulu
    if (this.ride) this.endSwingRide(true);
    this.slideT = -1;
    // bila sedang di dalam gedung: keluar dulu (posisi kembali diabaikan)
    if (this.insideIsland !== null) this.exitBuilding();
    const handle = this.islands.handles[index];
    this.pos.set(
      handle.group.position.x,
      handle.group.position.y + 2.6,
      handle.group.position.z
    );
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.lastIslandIndex = index;
    this.updateCamera(0, true);
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    // matikan juga listener input mentah — agar overlay UI (daftar pulau, dll.)
    // bisa di-scroll native tanpa dicegah preventDefault engine
    this.input.setEnabled(enabled);
  }

  getVisitedCount() {
    return this.visited.size;
  }

  getStarCount() {
    return { collected: this.collected, total: this.stars.total };
  }

  /** Buka/tutup syal emas (hadiah semua bintang) */
  setGoldScarf(on: boolean) {
    if (!this.goldScarf && on) return; // belum berhak
    this.character.setScarfGold(on);
  }

  /** Sinkronkan papan Connect 4 3D dengan state permainan di UI */
  setConnect4Board(cells: number[][]) {
    this.playground.setBoard(cells);
  }

  /** UI membuka/menutup modal Connect 4 → heartbeat "aku di meja" + bye */
  setC4Active(on: boolean) {
    this.multiplayer?.setC4Active(on);
  }

  /** Kirim pesan protokol Connect 4 ke tamu lain (pair/move/reset/state) */
  sendC4Message(extra: Record<string, unknown>) {
    this.multiplayer?.sendC4(extra);
  }

  /** Identitas multiplayer sesi ini (untuk penentuan warna & nama lawan) */
  getMpInfo(): { id: string; name: string; connected: boolean } | null {
    return this.multiplayer
      ? { id: this.multiplayer.myId, name: this.multiplayer.myName, connected: this.multiplayer.connected }
      : null;
  }

  /** HANYA untuk pengujian otomatis — warp langsung ke titik dunia. */
  debugWarp(x: number, z: number, y?: number) {
    if (this.insideIsland !== null) this.exitBuilding();
    if (this.ride) this.endSwingRide(true);
    this.slideT = -1;
    const hubY = this.islands.handles[0].group.position.y;
    this.pos.set(x, y ?? hubY + 2.2, z);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.updateCamera(0, true);
  }

  /** State internal untuk debugging/pengujian (dipakai via window hook) */
  getDebugState() {
    return {
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      vel: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
      grounded: this.grounded,
      island: this.groundIslandIndex,
      nearDoor: this.nearDoorIsland,
      inside: this.insideIsland,
      insideNear: this.insideNear
        ? `${this.insideNear.kind}${
            this.insideNear.galleryIdx ?? this.insideNear.padIdx ?? ""
          }`
        : null,
      emoteT: this.emoteT,
      quizStreak: this.quizStreak,
      dashT: this.dashT,
      dashCD: this.dashCD,
      airJumps: this.airJumps,
      collected: this.collected,
      maxStarsSaved: this.maxStarsSaved,
      goldScarf: this.goldScarf,
      visited: this.visited.size,
      // taman bermain & progres
      toyNear: this.nearToy?.kind ?? null,
      ride: this.ride ? Math.round(this.ride.t * 100) / 100 : null,
      slideT: this.slideT,
      slides: this.slides,
      bounces: this.playground?.bounces ?? 0,
      kicks: this.playground?.kicks ?? 0,
      badges: [...this.badges],
      ball: this.playground
        ? {
            x: Math.round(this.playground.ball.x * 10) / 10,
            z: Math.round(this.playground.ball.z * 10) / 10,
          }
        : null,
      tramp: this.playground
        ? { x: this.playground.tramp.x, z: this.playground.tramp.z, topY: Math.round(this.playground.tramp.topY * 100) / 100 }
        : null,
      // penghalang bangunan (OBB dunia) — dipakai verifikasi otomatis
      blockersWorld: this.blockers.map((b) => ({
        wx: b.wx,
        wz: b.wz,
        rot: b.rot,
        cx: b.cx,
        cz: b.cz,
        hx: b.hx,
        hz: b.hz,
      })),
      mp: this.multiplayer ? this.multiplayer.getDebug() : null,
    };
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    this.input.dispose();
    this.multiplayer?.dispose();
    this.env.dispose();
    this.islands.dispose();
    this.npcs.dispose();
    this.stars.dispose();
    this.effects.dispose();
    this.character.dispose();
    for (const interior of this.interiors.values()) interior.dispose();
    this.interiors.clear();
    this.playground?.dispose();
    if (this.emoteIcon) {
      this.scene.remove(this.emoteIcon);
      (this.emoteIcon.material as THREE.SpriteMaterial).dispose();
      this.emoteIcon = null;
    }
    disposeEmoteIcons();
    this.sfx.dispose();
    this.renderer.dispose();
    void this.scene.clear();
  }
}
