import * as THREE from "three";
import { PLAYFUL } from "./types";

/**
 * Diorama per proyek — dibangun dari primitif Three.js dengan gaya
 * "kertas & tinta": warna pastel toon + outline tinta (BackSide mesh).
 * Setiap struktur menggambarkan isi proyeknya.
 */

const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x1c1813,
  side: THREE.BackSide,
});

/** Tambah outline tinta pada mesh (trik back-side scaled). */
export function withOutline(mesh: THREE.Mesh, k = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  o.scale.setScalar(k);
  mesh.add(o);
  return mesh;
}

export interface Diorama {
  group: THREE.Group;
  /** animasi tambahan per frame (t detik) */
  update?: (t: number) => void;
}

type Toon = (color: number) => THREE.MeshToonMaterial;

export interface DioramaContext {
  toon: Toon;
  accent: number;
  disposables: Array<{ dispose: () => void }>;
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  outline = false
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return outline ? withOutline(m, 1.08) : m;
}
function cyl(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  mat: THREE.Material,
  outline = false
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  return outline ? withOutline(m, 1.07) : m;
}
function sph(r: number, mat: THREE.Material, outline = false) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
  return outline ? withOutline(m, 1.07) : m;
}

/** Tekstur kanvas sederhana (papan nama dengan teks) */
function textBoardTexture(text: string, accent: string) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#F7F2E6";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = accent;
  g.fillRect(0, 0, 14, 128);
  g.fillStyle = "#1C1813";
  g.font = "italic 700 64px 'DM Serif Display', Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 142, 68);
  return new THREE.CanvasTexture(cv);
}

// ================= 1. KOMAH — skuter ojek =================
function buildScooter(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const teal = toon(accent);
  const dark = toon(0x3a3128);

  const chassis = box(1.6, 0.4, 0.6, teal, true);
  chassis.position.y = 0.62;
  g.add(chassis);

  const floor = box(0.85, 0.1, 0.5, dark);
  floor.position.set(0, 0.5, 0.32);
  g.add(floor);

  const shield = box(0.55, 0.75, 0.09, teal, true);
  shield.position.set(0, 1.0, 0.68);
  shield.rotation.x = -0.35;
  g.add(shield);

  const column = cyl(0.045, 0.045, 0.62, 8, dark);
  column.position.set(0, 1.15, 0.55);
  column.rotation.x = 0.32;
  g.add(column);

  const tbar = box(0.66, 0.06, 0.06, toon(0x1c1813));
  tbar.position.set(0, 1.42, 0.44);
  g.add(tbar);

  const lamp = sph(0.1, toon(PLAYFUL.lemon));
  lamp.position.set(0, 1.12, 0.76);
  g.add(lamp);

  const seat = box(0.62, 0.15, 0.42, toon(0x1c1813));
  seat.position.set(0, 0.9, -0.38);
  g.add(seat);

  const rack = box(0.55, 0.06, 0.4, dark);
  rack.position.set(0, 0.74, -0.6);
  g.add(rack);

  const helmet = sph(0.19, toon(PLAYFUL.mint), true);
  helmet.position.set(0.33, 1.42, 0.44);
  g.add(helmet);

  const wheelMat = toon(0x1c1813);
  for (const z of [0.66, -0.66]) {
    const wheel = cyl(0.34, 0.34, 0.13, 14, wheelMat, true);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.34, z);
    g.add(wheel);
    const hub = cyl(0.1, 0.1, 0.15, 10, toon(PLAYFUL.silver));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0, 0.34, z);
    g.add(hub);
  }

  g.position.y = 0;
  return { group: g };
}

// ================= 2. KANJICHO-DATA — torii + kristal data =================
function buildTorii(ctx: DioramaContext): Diorama {
  const { toon } = ctx;
  const g = new THREE.Group();
  const coral = toon(PLAYFUL.coral);
  const ink = toon(0x1c1813);
  const gold = toon(PLAYFUL.lemon);

  for (const x of [-0.85, 0.85]) {
    const pillar = box(0.18, 2.3, 0.18, coral, true);
    pillar.position.set(x, 1.15, 0);
    g.add(pillar);
  }
  const topBeam = box(2.4, 0.24, 0.32, ink, true);
  topBeam.position.y = 2.45;
  g.add(topBeam);
  const midBeam = box(2.0, 0.15, 0.22, coral);
  midBeam.position.y = 1.9;
  g.add(midBeam);
  for (const x of [-1.05, 1.05]) {
    const cap = box(0.22, 0.16, 0.36, gold);
    cap.position.set(x, 2.62, 0);
    g.add(cap);
  }

  // kristal data (berputar)
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), toon(0xbfae97));
  rock.position.set(0, 0.4, 1.1);
  g.add(rock);
  const crystals: THREE.Mesh[] = [];
  const crystalMat = toon(PLAYFUL.lavender);
  const spec: Array<[number, number, number, number]> = [
    [0, 1.2, 1.1, 0.42],
    [0.42, 0.85, 1.35, 0.28],
    [-0.4, 0.75, 0.85, 0.24],
  ];
  for (const [x, y, z, r] of spec) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), crystalMat);
    withOutline(c, 1.1);
    c.position.set(x, y, z);
    g.add(c);
    crystals.push(c);
  }

  return {
    group: g,
    update(t) {
      crystals.forEach((c, i) => {
        c.rotation.y = t * (1.1 + i * 0.35);
        c.position.y = spec[i][1] + Math.sin(t * 1.6 + i * 2) * 0.08;
      });
    },
  };
}

// ================= 3. KANJICHO-PRIVACY — gembok raksasa + gulungan =================
function buildPadlock(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const gold = toon(accent);
  const ink = toon(0x1c1813);
  const cream = toon(PLAYFUL.cream);

  const body = box(0.95, 0.8, 0.55, gold, true);
  body.position.set(-0.4, 0.75, 0);
  g.add(body);

  const shackle = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.09, 10, 24, Math.PI),
    gold
  );
  withOutline(shackle, 1.12);
  shackle.position.set(-0.4, 1.15, 0);
  g.add(shackle);

  const keyhole = cyl(0.09, 0.09, 0.1, 10, ink);
  keyhole.rotation.x = Math.PI / 2;
  keyhole.position.set(-0.4, 0.8, 0.3);
  g.add(keyhole);
  const keySlot = box(0.08, 0.22, 0.06, ink);
  keySlot.position.set(-0.4, 0.68, 0.3);
  g.add(keySlot);

  // gulungan kebijakan bersandar di batu
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), toon(0xbfae97));
  rock.position.set(0.85, 0.42, 0.3);
  g.add(rock);
  const scroll = cyl(0.2, 0.2, 1.15, 12, cream, true);
  scroll.rotation.z = Math.PI / 2 - 0.28;
  scroll.position.set(0.8, 0.85, 0.45);
  g.add(scroll);
  for (const x of [0.28, 1.32]) {
    const cap = cyl(0.23, 0.23, 0.08, 12, gold);
    cap.rotation.z = Math.PI / 2 - 0.28;
    cap.position.set(0.8 + (x - 0.8) * 0.97, 0.85 + (x - 0.8) * 0.26, 0.45);
    g.add(cap);
  }
  void ink;

  return { group: g };
}

// ================= 4. ZYXCID — papan selamat datang + bendera =================
function buildSignpost(ctx: DioramaContext): Diorama {
  const { toon, accent, disposables } = ctx;
  const g = new THREE.Group();
  const wood = toon(0x8a7a5e);
  const cream = toon(PLAYFUL.cream);

  const pole = box(0.16, 2.6, 0.16, wood, true);
  pole.position.set(-0.9, 1.3, 0);
  g.add(pole);
  const pole2 = box(0.12, 1.9, 0.12, wood);
  pole2.position.set(0.95, 0.95, 0);
  g.add(pole2);

  const tex = textBoardTexture("Zyx", "#E4572E");
  disposables.push(tex);
  const boardMats = [
    wood,
    wood,
    wood,
    wood,
    new THREE.MeshToonMaterial({ map: tex }),
    new THREE.MeshToonMaterial({ map: tex }),
  ];
  disposables.push(...boardMats.slice(4));
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.1), boardMats);
  board.position.set(-0.9, 2.0, 0.09);
  g.add(board);
  const boardSh = new THREE.Mesh(board.geometry, OUTLINE_MAT);
  boardSh.scale.setScalar(1.05);
  board.add(boardSh);

  // tali bendera segitiga
  const flagColors = [accent, PLAYFUL.mint, PLAYFUL.lemon, PLAYFUL.sky, PLAYFUL.berry];
  const flags: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.38, 4),
      toon(flagColors[i % flagColors.length])
    );
    f.rotation.x = Math.PI;
    f.rotation.y = Math.PI / 4;
    const t = (i + 1) / 6;
    f.position.set(-0.9 + t * 1.85, 2.5 - Math.sin(t * Math.PI) * 0.28, 0);
    g.add(f);
    flags.push(f);
  }

  return {
    group: g,
    update(t) {
      flags.forEach((f, i) => {
        f.rotation.z = Math.sin(t * 2.4 + i) * 0.18;
      });
    },
  };
}

// ================= 5. T3R — jam raksasa + mata 20-20-20 =================
function buildClock(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const cream = toon(PLAYFUL.cream);
  const ink = toon(0x1c1813);

  const pole = cyl(0.09, 0.11, 1.1, 8, toon(0x8a7a5e));
  pole.position.set(-0.8, 0.55, 0);
  g.add(pole);

  const face = cyl(0.95, 0.95, 0.18, 24, cream, true);
  face.rotation.x = Math.PI / 2;
  face.position.set(-0.8, 1.35, 0.1);
  g.add(face);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 10, 32), ink);
  rim.position.set(-0.8, 1.35, 0.12);
  g.add(rim);

  for (let i = 0; i < 4; i++) {
    const tick = box(0.07, 0.16, 0.05, ink);
    const a = (i * Math.PI) / 2;
    tick.position.set(-0.8 + Math.sin(a) * 0.78, 1.35 + Math.cos(a) * 0.78, 0.2);
    tick.rotation.z = -a;
    g.add(tick);
  }

  const handLong = box(0.07, 0.68, 0.04, ink);
  handLong.position.set(-0.8, 1.35, 0.22);
  const handShort = box(0.09, 0.45, 0.04, ink);
  handShort.position.set(-0.8, 1.35, 0.22);
  const pin = sph(0.07, toon(accent));
  pin.position.set(-0.8, 1.35, 0.24);
  g.add(handLong, handShort, pin);

  // mata besar (aturan 20-20-20)
  const eye = sph(0.6, cream, true);
  eye.position.set(0.9, 1.0, 0.4);
  g.add(eye);
  const iris = sph(0.24, toon(accent));
  iris.position.set(0.9, 1.0, 0.92);
  g.add(iris);
  const pupil = sph(0.11, ink);
  pupil.position.set(0.9, 1.0, 1.1);
  g.add(pupil);

  return {
    group: g,
    update(t) {
      handLong.rotation.z = -t * 0.5;
      handShort.rotation.z = -t * 0.1;
      // mata melirik kiri-kanan
      const look = Math.sin(t * 0.9) * 0.12;
      iris.position.x = 0.9 + look;
      pupil.position.x = 0.9 + look;
    },
  };
}

// ================= 6. ALINE-CONFIGURATOR — 5 keycap makropad =================
function buildKeycaps(ctx: DioramaContext): Diorama {
  const { toon } = ctx;
  const g = new THREE.Group();
  const colors = [
    PLAYFUL.mint,
    PLAYFUL.lemon,
    PLAYFUL.coral,
    PLAYFUL.lavender,
    PLAYFUL.sky,
  ];

  const base = box(6.6, 0.3, 1.8, toon(0x3a3128), true);
  base.position.y = 0.18;
  g.add(base);

  for (let i = 0; i < 5; i++) {
    const pressed = i === 2;
    const cap = box(1.1, 0.55, 1.15, toon(colors[i]), true);
    cap.position.set(-2.6 + i * 1.3, pressed ? 0.42 : 0.62, 0);
    g.add(cap);
    const stem = cyl(0.3, 0.3, 0.25, 8, toon(0x8a7a5e));
    stem.position.set(-2.6 + i * 1.3, 0.25, 0);
    g.add(stem);
  }
  return { group: g };
}

// ================= 7. EDUTRACK — grafik + topi wisuda =================
function buildGradCap(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const ink = toon(0x1c1813);

  const bars: Array<[number, number, number]> = [
    [-0.9, 0.8, PLAYFUL.mint],
    [-0.15, 1.4, PLAYFUL.lemon],
    [0.6, 2.0, PLAYFUL.coral],
  ];
  for (const [x, h, c] of bars) {
    const b = box(0.55, h, 0.55, toon(c), true);
    b.position.set(x, h / 2 + 0.35, 0.6);
    g.add(b);
  }

  // topi wisuda melayang
  const capGroup = new THREE.Group();
  const board = box(1.6, 0.13, 1.6, ink, true);
  capGroup.add(board);
  const capTop = box(0.85, 0.32, 0.85, ink);
  capTop.position.y = 0.2;
  capGroup.add(capTop);
  const tassel = cyl(0.03, 0.03, 0.75, 6, toon(accent));
  tassel.position.set(0.55, -0.25, 0);
  tassel.rotation.z = 0.35;
  capGroup.add(tassel);
  const knob = sph(0.09, toon(accent));
  knob.position.set(0.72, -0.6, 0);
  capGroup.add(knob);
  capGroup.position.set(0, 3.3, -0.4);
  g.add(capGroup);

  return {
    group: g,
    update(t) {
      capGroup.position.y = 3.3 + Math.sin(t * 1.4) * 0.18;
      capGroup.rotation.y = Math.sin(t * 0.5) * 0.25;
    },
  };
}

// ================= 8. APLIKASICUACA — awan + matahari + hujan =================
function buildWeather(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const white = toon(0xfffdf7);

  const sunBall = sph(0.4, toon(PLAYFUL.lemon), true);
  sunBall.position.set(0.1, 2.1, -0.75);
  g.add(sunBall);

  const cloudGroup = new THREE.Group();
  const puffs: Array<[number, number, number, number]> = [
    [-0.6, 2.3, 0, 0.62],
    [0, 2.5, 0, 0.75],
    [0.65, 2.35, 0, 0.58],
    [0.1, 2.2, 0.35, 0.5],
  ];
  for (const [x, y, z, r] of puffs) {
    const p = sph(r, white, true);
    p.position.set(x, y, z);
    cloudGroup.add(p);
  }
  g.add(cloudGroup);

  // tetesan hujan bergantung
  const drops: THREE.Mesh[] = [];
  const dropMat = toon(accent);
  for (let i = 0; i < 3; i++) {
    const x = -0.5 + i * 0.5;
    const thread = cyl(0.015, 0.015, 0.6, 6, toon(0x1c1813));
    thread.position.set(x, 1.55, 0.1);
    g.add(thread);
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 8), dropMat);
    withOutline(drop, 1.12);
    drop.rotation.x = Math.PI;
    drop.position.set(x, 1.25, 0.1);
    g.add(drop);
    drops.push(drop);
  }

  return {
    group: g,
    update(t) {
      cloudGroup.position.y = Math.sin(t * 0.8) * 0.12;
      drops.forEach((d, i) => {
        d.position.y = 1.25 + Math.sin(t * 2 + i * 1.4) * 0.07;
      });
    },
  };
}

// ================= 9. IDCAMP-2023 — papan kode + tenda =================
function buildCodeCamp(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();
  const ink = toon(0x1c1813);

  // papan "</>"
  for (const x of [-1.0, 1.0]) {
    const post = box(0.12, 1.9, 0.12, toon(0x8a7a5e));
    post.position.set(x, 0.95, 0);
    g.add(post);
  }
  const lt = box(0.5, 0.09, 0.09, ink);
  lt.position.set(-0.42, 1.7, 0.12);
  lt.rotation.z = 0.8;
  g.add(lt);
  const gt = box(0.5, 0.09, 0.09, ink);
  gt.position.set(0.42, 1.7, 0.12);
  gt.rotation.z = -0.8;
  g.add(gt);
  const slash = box(0.11, 0.75, 0.09, ink);
  slash.position.set(0, 1.68, 0.12);
  slash.rotation.z = 0.25;
  g.add(slash);

  // tenda kemah
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.25, 4), toon(accent));
  withOutline(tent, 1.06);
  tent.position.set(1.6, 0.9, -0.7);
  tent.rotation.y = Math.PI / 4;
  g.add(tent);
  const door = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.6, 4),
    toon(0x1c1813)
  );
  door.position.set(1.6, 0.45, -0.15);
  door.rotation.y = Math.PI / 4;
  g.add(door);

  return { group: g };
}

// ================= 10. TURN-BASED-RPG-IN-C — pedang di batu + dadu =================
function buildSwordStone(ctx: DioramaContext): Diorama {
  const { toon, accent } = ctx;
  const g = new THREE.Group();

  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), toon(0xbfae97));
  withOutline(stone, 1.06);
  stone.position.set(-0.3, 0.6, 0);
  g.add(stone);

  const swordGroup = new THREE.Group();
  const blade = box(0.16, 1.7, 0.06, toon(PLAYFUL.silver), true);
  blade.position.y = 0.85;
  swordGroup.add(blade);
  const guard = box(0.55, 0.1, 0.14, toon(PLAYFUL.lemon));
  guard.position.y = 0.05;
  swordGroup.add(guard);
  const hilt = cyl(0.05, 0.05, 0.42, 8, toon(0x8a7a5e));
  hilt.position.y = -0.2;
  swordGroup.add(hilt);
  const pommel = sph(0.09, toon(PLAYFUL.lemon));
  pommel.position.y = -0.44;
  swordGroup.add(pommel);
  swordGroup.position.set(-0.3, 1.15, 0);
  swordGroup.rotation.z = 0.18;
  g.add(swordGroup);
  void accent;

  // dua dadu
  const dice: THREE.Mesh[] = [];
  const pipMat = toon(0x1c1813);
  for (const [x, z, r] of [
    [1.15, 0.5, 0.42],
    [1.65, -0.35, 0.34],
  ]) {
    const die = box(r * 2, r * 2, r * 2, toon(PLAYFUL.cream), true);
    die.position.set(x, r + 0.05, z);
    die.rotation.set(0.3, 0.7, 0.15);
    g.add(die);
    // pips di face atas
    for (const [px, pz] of [
      [-r * 0.4, -r * 0.4],
      [r * 0.4, r * 0.4],
      [0, 0],
    ]) {
      const pip = sph(0.05, pipMat);
      pip.position.set(x + px, r * 2 + 0.03, z + pz);
      g.add(pip);
    }
    dice.push(die);
  }

  return {
    group: g,
    update(t) {
      dice[0].rotation.y = t * 0.35;
      dice[1].rotation.y = -t * 0.5;
    },
  };
}

// ================= HUB BERANDA — pohon + papan penunjuk + bendera =================
function buildHub(ctx: DioramaContext): Diorama {
  const { toon } = ctx;
  const g = new THREE.Group();

  // pohon besar
  const trunk = cyl(0.3, 0.4, 2.1, 10, toon(0x8a7a5e));
  trunk.position.set(-1.6, 1.05, -0.6);
  withOutline(trunk, 1.05);
  g.add(trunk);
  const greens = [0x9cd08f, 0xa8d977, 0x8fcf8f];
  const foliage: Array<[number, number, number, number]> = [
    [-1.6, 3.1, -0.6, 1.35],
    [-2.35, 2.55, -0.2, 0.85],
    [-0.95, 2.7, -1.1, 0.9],
  ];
  for (const [x, y, z, r] of foliage) {
    const f = sph(r, toon(greens[Math.floor(Math.random() * 3)]), true);
    f.position.set(x, y, z);
    g.add(f);
  }

  // bangku
  const bench = new THREE.Group();
  const seat = box(1.5, 0.1, 0.45, toon(0x8a7a5e));
  seat.position.y = 0.5;
  bench.add(seat);
  for (const x of [-0.6, 0.6]) {
    const leg = box(0.1, 0.5, 0.4, toon(0x8a7a5e));
    leg.position.set(x, 0.25, 0);
    bench.add(leg);
  }
  bench.position.set(1.8, 0, 1.2);
  bench.rotation.y = -0.5;
  g.add(bench);

  // papan penunjuk arah (4 arah, warna pulau)
  const arrowColors = [PLAYFUL.teal, PLAYFUL.lavender, PLAYFUL.mint, PLAYFUL.coral];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const post = cyl(0.05, 0.06, 1.6, 8, toon(0x8a7a5e));
    post.position.set(Math.sin(a) * 3.2, 0.8, Math.cos(a) * 3.2);
    g.add(post);
    const arrow = box(0.95, 0.26, 0.07, toon(arrowColors[i]), true);
    arrow.position.set(Math.sin(a) * 3.2, 1.45, Math.cos(a) * 3.2);
    arrow.rotation.y = a + Math.PI / 2;
    g.add(arrow);
  }

  // tali bendera pesta di depan
  const flagColors = [PLAYFUL.coral, PLAYFUL.lemon, PLAYFUL.mint, PLAYFUL.sky, PLAYFUL.lavender, PLAYFUL.berry, PLAYFUL.tangerine];
  const flags: THREE.Mesh[] = [];
  for (const x of [-2.5, 2.5]) {
    const pole = cyl(0.05, 0.06, 2.8, 8, toon(0x8a7a5e));
    pole.position.set(x, 1.4, 2.6);
    g.add(pole);
  }
  for (let i = 0; i < 7; i++) {
    const t = (i + 1) / 8;
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.36, 4),
      toon(flagColors[i % flagColors.length])
    );
    f.rotation.x = Math.PI;
    f.position.set(-2.5 + t * 5, 2.7 - Math.sin(t * Math.PI) * 0.45, 2.6);
    g.add(f);
    flags.push(f);
  }

  return {
    group: g,
    update(t) {
      flags.forEach((f, i) => {
        f.rotation.z = Math.sin(t * 2.2 + i * 0.8) * 0.2;
      });
    },
  };
}

// ================= builder utama =================
export function buildDiorama(
  projectIndex: number,
  toon: Toon,
  disposables: Array<{ dispose: () => void }>
): Diorama {
  const accents = [
    PLAYFUL.teal,
    PLAYFUL.lavender,
    PLAYFUL.lemon,
    PLAYFUL.berry,
    PLAYFUL.sky,
    PLAYFUL.tangerine,
    PLAYFUL.mint,
    PLAYFUL.sky,
    PLAYFUL.coral,
    PLAYFUL.lavender,
  ];
  const accent = accents[projectIndex % accents.length];
  const ctx: DioramaContext = { toon, accent, disposables };

  switch (projectIndex) {
    case 0: return buildScooter(ctx);
    case 1: return buildTorii(ctx);
    case 2: return buildPadlock(ctx);
    case 3: return buildSignpost(ctx);
    case 4: return buildClock(ctx);
    case 5: return buildKeycaps(ctx);
    case 6: return buildGradCap(ctx);
    case 7: return buildWeather(ctx);
    case 8: return buildCodeCamp(ctx);
    case 9: return buildSwordStone(ctx);
    default: return buildHub(ctx);
  }
}

export function buildHubDiorama(
  toon: Toon,
  disposables: Array<{ dispose: () => void }>
): Diorama {
  const ctx: DioramaContext = { toon, accent: PLAYFUL.coral, disposables };
  return buildHub(ctx);
}
