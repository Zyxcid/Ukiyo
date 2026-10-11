import * as THREE from "three";
import { PLAYFUL, type PlatformCollider } from "./types";
import { withOutline } from "./structures";

/**
 * Taman bermain di pulau pusat (Zyxcid) — mainan yang benar-benar bisa
 * dimainkan, bukan pajangan:
 *
 *  - TRAMPOLIN  : injak saja — pemain memantul tinggi (fisika engine).
 *  - AYUNAN     : E dekat kursi → burung ikut mengayun; SPASI = lompat dari
 *                 ayunan dengan kecepatan ayunan saat itu.
 *  - PEROSOTAN  : naiki undakan tangga (lompat pendek) di sisi luar, E di
 *                 platform atas → meluncur kinematik KE ARAH PUSAT pulau.
 *  - CONNECT 4  : E di meja → modal permainan; papan 3D di pulau ikut terisi
 *                 lewat setBoard(). Kalau ada tamu lain yang membuka meja yang
 *                 sama, permainan berubah jalan lawan-lawan (lihat multiplayer).
 *  - BOLA       : jalan mendekat untuk menendang — bola menggelinding,
 *                 memantul di tepi pulau, dan melambat. Tendangan di-broadcast
 *                 ke tamu lain (posisi + kecepatan) supaya bolanya sama.
 *  - GERBANG    : gerbang kayu bertahta kucing di sisi utara — E di depannya
 *                 membuka github.com/Zyxcid di tab baru. Ini pengganti label
 *                 "Zyxcid" yang dulu mengambang: penanda arah, bukan tulisan.
 *
 * Mainan-mainan ini juga jalan menuju LENCANA (kolektibel) — lihat BADGES.
 *
 * Catatan multiplayer: posisi bola & papan Connect 4 DISINKRONKAN ke tamu lain
 * (tendangan bola di-broadcast; papan C4 menyusuri pesan hi/pair/move/reset/
 * state — lihat multiplayer.ts). Pulau pusat memang identik di semua klien
 * (layout deterministik), jadi mainan yang sama terlihat di tempat yang sama.
 */

/** Lencana taman bermain — kolektibel yang dibuka lewat permainan */
export interface BadgeDef {
  id: string;
  label: string;
  desc: string;
}

export const BADGES: BadgeDef[] = [
  { id: "bouncer", label: "Kang Trampolin", desc: "Mantul 10 kali di trampolin" },
  { id: "rider", label: "Penunggang Ayunan", desc: "Mengayun penuh selama 6 detik" },
  { id: "slider", label: "Penerbang Perosotan", desc: "Meluncur dari perosotan 2 kali" },
  { id: "kicker", label: "Penggiring Bola", desc: "Menendang bola pantai 15 kali" },
  { id: "c4champ", label: "Juara Connect 4", desc: "Kalahkan penghuni di meja Connect 4" },
];

/** Titik interaksi mainan (koordinat DUNIA — pulau pusat berdiri di 0,0) */
export interface ToyStation {
  kind: "swing" | "slide" | "c4" | "github";
  x: number;
  z: number;
  /** radius pemicu (jarak horizontal) */
  r: number;
}

/** Undakan perosotan: collider platform + tinggi relatif terhadap puncak pulau */
export interface StepDef {
  c: PlatformCollider;
  dy: number;
}

export interface PlaygroundHandle {
  group: THREE.Group;
  stations: ToyStation[];
  steps: StepDef[];
  /** trampolin: pusat XZ, radius, dan permukaan (Y dunia disinkronkan engine) */
  tramp: { x: number; z: number; r: number; topY: number };
  /** ayunan: titik gantung (lokal pulau) & panjang tali */
  swing: { x: number; z: number; topY: number; L: number };
  /** perosotan: titik awal & akhir luncuran (Y dunia disinkronkan engine) */
  slide: { top: THREE.Vector3; bottom: THREE.Vector3 };
  /** posisi bola (XZ dunia) */
  ball: { x: number; z: number };
  /** statistik menuju lencana */
  bounces: number;
  kicks: number;
  /** denyut visual trampolin saat memantul */
  trampPulse: () => void;
  /** sudut ayunan: null = ayunan santai otomatis; angka = dikendalikan engine */
  swingAngle: (a: number | null) => void;
  /** fisika bola + animasi; return true bila bola BARUS AJA ditendang pemain */
  update: (
    dt: number,
    t: number,
    hubY: number,
    player: { x: number; z: number; speed: number }
  ) => boolean;
  /** state bola untuk broadcast ke tamu lain (posisi + kecepatan) */
  getBallState: () => { x: number; z: number; vx: number; vz: number };
  /** terima tendangan bola dari tamu lain (sinkron multiplayer) */
  setBallState: (x: number, z: number, vx: number, vz: number) => void;
  /** render state papan Connect 4: cells[col][row], 0 kosong / 1 pemain / 2 penghuni */
  setBoard: (cells: number[][]) => void;
  dispose: () => void;
}

/** Plakat gerbang: kartu kertas + kucing doodle + tulisan GITHUB */
function githubPlaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d");
  if (ctx) {
    const INK = "#1C1813";
    ctx.fillStyle = "#F7F2E6";
    ctx.beginPath();
    ctx.roundRect(6, 6, 500, 148, 22);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // kucing doodle (kepala bundar + telinga + kumis)
    ctx.save();
    ctx.translate(74, 82);
    ctx.strokeStyle = INK;
    ctx.fillStyle = "#F7F2E6";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-34, -12);
    ctx.lineTo(-26, -40);
    ctx.lineTo(-8, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(34, -12);
    ctx.lineTo(26, -40);
    ctx.lineTo(8, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const ex of [-13, 13]) {
      ctx.beginPath();
      ctx.arc(ex, 0, 4.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 4;
    for (const wy of [-6, 8]) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 14, wy);
        ctx.lineTo(s * 34, wy - 5);
        ctx.stroke();
      }
    }
    ctx.restore();

    // teks
    ctx.fillStyle = INK;
    ctx.font = "800 62px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("GITHUB", 132, 66);
    ctx.fillStyle = "#E4572E";
    ctx.font = "italic 700 34px Georgia, serif";
    ctx.fillText("→ zyxcid", 134, 116);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  return tex;
}

/** Piringan portal: cincin-cincin doodle yang berputar pelan */
function portalTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
    g.addColorStop(0, "rgba(46,196,182,0.95)");
    g.addColorStop(0.6, "rgba(46,196,182,0.55)");
    g.addColorStop(1, "rgba(228,87,46,0.75)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(28,24,19,0.5)";
    ctx.lineWidth = 3;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(128, 128, i * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    // sapuan spiral tinta
    ctx.strokeStyle = "rgba(247,242,230,0.85)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.08) {
      const r = 10 + (a / (Math.PI * 5)) * 110;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

export function createPlayground(hubGroup: THREE.Group): PlaygroundHandle {
  const disposables: Array<{ dispose: () => void }> = [];

  const toon = (color: number) => {
    const m = new THREE.MeshToonMaterial({ color });
    disposables.push(m);
    return m;
  };
  const wood = toon(0x8a7a5e);
  const ink = toon(0x1c1813);
  const cream = toon(PLAYFUL.cream);
  const coral = toon(PLAYFUL.coral);
  const teal = toon(PLAYFUL.teal);
  const sky = toon(PLAYFUL.sky);
  const lemon = toon(PLAYFUL.lemon);
  const berry = toon(PLAYFUL.berry);

  const g = new THREE.Group();
  hubGroup.add(g);

  const box = (w: number, h: number, d: number, mat: THREE.Material, outline = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    if (outline) withOutline(m, 1.08);
    return m;
  };
  const cyl = (rt: number, rb: number, h: number, seg: number, mat: THREE.Material, outline = false) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    if (outline) withOutline(m, 1.07);
    return m;
  };

  // ================= TRAMPOLIN (barat daya) =================
  const TRAMP = { x: -6.0, z: 2.4, r: 1.05, topY: 0.32 };
  let trampPulseT = 0;
  let trampPad: THREE.Mesh;
  {
    const t = new THREE.Group();
    t.position.set(TRAMP.x, 0, TRAMP.z);
    // 4 kaki
    for (const [lx, lz] of [
      [-0.7, -0.7],
      [0.7, -0.7],
      [-0.7, 0.7],
      [0.7, 0.7],
    ]) {
      const leg = box(0.09, 0.28, 0.09, ink);
      leg.position.set(lx, 0.14, lz);
      t.add(leg);
    }
    // bingkai karet
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(TRAMP.r, 0.07, 10, 28),
      ink
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    withOutline(ring, 1.06);
    t.add(ring);
    // karet pantul
    const pad = new THREE.Mesh(new THREE.CircleGeometry(TRAMP.r - 0.03, 28), teal);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = TRAMP.topY - 0.015;
    t.add(pad);
    // hiasan: lingkaran kecil di pinggir biar ramai
    const dot = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 20), lemon);
    dot.rotation.x = Math.PI / 2;
    dot.position.y = TRAMP.topY - 0.01;
    t.add(dot);
    g.add(t);
    trampPad = pad;
  }

  // ================= AYUNAN (barat laut) =================
  const SWING = { x: -5.6, z: -3.4, topY: 2.3, L: 1.42 };
  const swingPivot = new THREE.Group();
  swingPivot.position.set(SWING.x, SWING.topY, SWING.z);
  let swingManual: number | null = null;
  {
    // dua rangka A (di z dua sisi kursi)
    for (const fz of [SWING.z - 0.28, SWING.z + 0.28]) {
      for (const sx of [-1, 1]) {
        const leg = box(0.09, 2.42, 0.09, wood);
        const spread = 0.55;
        leg.position.set(SWING.x + (sx * spread) / 2, SWING.topY / 2, fz);
        leg.rotation.z = -sx * Math.atan2(spread, SWING.topY * 2);
        g.add(leg);
      }
      // palang atas pendek di tiap rangka (sepanjang z) — dekoratif
      const cap = box(0.13, 0.1, 0.13, berry);
      cap.position.set(SWING.x, SWING.topY, fz);
      g.add(cap);
    }
    // palang gantung utama sepanjang z
    const bar = cyl(0.05, 0.05, 0.78, 10, wood, true);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, 0, 0);
    swingPivot.add(bar);
    // dua tali
    for (const rz of [-0.24, 0.24]) {
      const rope = cyl(0.022, 0.022, SWING.L, 6, ink);
      rope.position.set(0, -SWING.L / 2, rz);
      swingPivot.add(rope);
    }
    // kursi
    const seat = box(0.34, 0.06, 0.58, coral, true);
    seat.position.set(0, -SWING.L, 0);
    swingPivot.add(seat);
    g.add(swingPivot);
  }

  // ================= PEROSOTAN (timur laut, luncur KE ARAH PUSAT) =================
  // Tangga di sisi LUAR (timur), platform di puncak, lintasan meluncur ke
  // BARAT (ke arah tengah pulau) — jadi mendarat jauh dari tepi jurang.
  const SLIDE_LOCAL_TOP_Y = 1.93;
  const SLIDE_LOCAL_BOTTOM_Y = 0.12;
  const SLIDE = {
    top: new THREE.Vector3(5.35, SLIDE_LOCAL_TOP_Y, -3.0),
    bottom: new THREE.Vector3(2.05, SLIDE_LOCAL_BOTTOM_Y, -2.72),
  };
  const SLIDE_PLATFORM = { x: 5.45, z: -3.0 };
  const steps: StepDef[] = [];
  {
    // undakan tangga (timur → barat, naik): pijakan dari luar ke platform
    const stepSpec: Array<[number, number]> = [
      [6.7, 0.55],
      [6.25, 1.05],
      [5.8, 1.55],
    ];
    for (const [sx, sy] of stepSpec) {
      const st = box(0.62, 0.09, 0.7, wood, true);
      st.position.set(sx, sy - 0.045, SLIDE_PLATFORM.z);
      g.add(st);
      const col: PlatformCollider = {
        index: -1,
        cx: sx,
        cz: SLIDE_PLATFORM.z,
        radius: 0.38,
        topY: sy,
        isIsland: false,
      };
      steps.push({ c: col, dy: sy });
    }
    // dua rel tangga miring
    for (const rz of [SLIDE_PLATFORM.z - 0.36, SLIDE_PLATFORM.z + 0.36]) {
      const rail = box(0.08, 0.08, 2.2, berry);
      const from = new THREE.Vector3(6.8, 0.1, rz);
      const to = new THREE.Vector3(5.5, 1.9, rz);
      rail.position.copy(from).lerp(to, 0.5);
      rail.lookAt(to);
      g.add(rail);
    }
    // platform atas + tiang penyangga
    const platform = box(0.95, 0.12, 0.95, lemon, true);
    platform.position.set(SLIDE_PLATFORM.x, 1.89, SLIDE_PLATFORM.z);
    g.add(platform);
    const post = box(0.16, 1.85, 0.16, wood);
    post.position.set(SLIDE_PLATFORM.x, 0.93, SLIDE_PLATFORM.z);
    g.add(post);
    const platformCol: PlatformCollider = {
      index: -1,
      cx: SLIDE_PLATFORM.x,
      cz: SLIDE_PLATFORM.z,
      radius: 0.55,
      topY: 1.95,
      isIsland: false,
    };
    steps.push({ c: platformCol, dy: 1.95 });

    // lintasan luncur (kotak memanjang + dua bibir samping)
    const dir = SLIDE.bottom.clone().sub(SLIDE.top);
    const mid = SLIDE.top.clone().lerp(SLIDE.bottom, 0.5);
    const len = dir.length() + 0.15;
    const chute = new THREE.Group();
    chute.position.copy(mid);
    chute.lookAt(SLIDE.bottom);
    const bed = box(0.72, 0.09, len, sky, true);
    chute.add(bed);
    for (const lx of [-0.36, 0.36]) {
      const lip = box(0.09, 0.16, len, berry, true);
      lip.position.set(lx, 0.12, 0);
      chute.add(lip);
    }
    g.add(chute);
  }

  // ================= MEJA CONNECT 4 (tenggara) =================
  const C4 = { x: 4.7, z: 2.5 };
  /** discs[col*6 + row] */
  const discs: THREE.Mesh[] = [];
  const discMats = [coral, lemon];
  {
    // dua kaki papan
    for (const rz of [C4.z - 0.72, C4.z + 0.72]) {
      const leg = box(0.14, 2.3, 0.14, wood, true);
      leg.position.set(C4.x, 1.15, rz);
      g.add(leg);
    }
    // papan (menghadap barat, ke tengah pulau)
    const board = box(0.16, 1.62, 1.86, cream, true);
    board.position.set(C4.x, 1.5, C4.z);
    g.add(board);
    // topi papan
    const cap = box(0.22, 0.14, 2.0, berry, true);
    cap.position.set(C4.x, 2.36, C4.z);
    g.add(cap);

    // lubang 7×6 (lingkaran gelap di sisi barat)
    const holeGeo = new THREE.CircleGeometry(0.098, 16);
    const holeMat = toon(0x2a241c);
    disposables.push(holeGeo);
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 6; r++) {
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(
          C4.x - 0.085,
          1.5 + (r - 2.5) * 0.24,
          C4.z + (c - 3) * 0.24
        );
        hole.rotation.y = -Math.PI / 2;
        g.add(hole);
      }
    }

    // kolam disc (maks 42) — silinder sumbu-X, muncul sesuai state
    const discGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.17, 14);
    disposables.push(discGeo);
    for (let i = 0; i < 42; i++) {
      const d = new THREE.Mesh(discGeo, discMats[0]);
      d.rotation.z = Math.PI / 2;
      d.visible = false;
      g.add(d);
      discs.push(d);
    }
  }

  // ================= GERBANG GITHUB (utara, menghadap pusat) =================
  // Pengganti label "Zyxcid" yang dulu mengambang: gerbang kayu dengan
  // plakat kucing + piringan portal yang berputar. E di depannya → buka
  // profil GitHub di tab baru (ditangani engine).
  const GITHUB_GATE = { x: 0, z: -5.05 };
  let portalDisc: THREE.Mesh | null = null;
  let portalMat: THREE.MeshBasicMaterial | null = null;
  const gateSparkles: Array<{ m: THREE.Mesh; a: number; r: number; y: number }> = [];
  {
    const gate = new THREE.Group();
    gate.position.set(GITHUB_GATE.x, 0, GITHUB_GATE.z);

    // dua tiang kayu
    for (const sx of [-1, 1]) {
      const post = box(0.2, 2.7, 0.2, wood, true);
      post.position.set(sx * 1.18, 1.35, 0);
      gate.add(post);
    }
    // ambang atas + atap kecil
    const lintel = box(2.85, 0.24, 0.34, berry, true);
    lintel.position.set(0, 2.72, 0);
    gate.add(lintel);
    const roof = box(3.15, 0.14, 0.5, coral, true);
    roof.position.set(0, 2.9, 0);
    gate.add(roof);

    // plakat di muka ambang
    const plqTex = githubPlaqueTexture();
    disposables.push(plqTex);
    const plqMat = new THREE.MeshBasicMaterial({ map: plqTex, transparent: true });
    disposables.push(plqMat);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.62), plqMat);
    disposables.push(plq.geometry);
    plq.position.set(0, 2.72, 0.19);
    gate.add(plq);

    // piringan portal berputar (dua sisi supaya terlihat dari belakang juga)
    const ptex = portalTexture();
    disposables.push(ptex);
    portalMat = new THREE.MeshBasicMaterial({
      map: ptex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    disposables.push(portalMat);
    portalDisc = new THREE.Mesh(new THREE.CircleGeometry(0.86, 28), portalMat);
    disposables.push(portalDisc.geometry);
    portalDisc.position.set(0, 1.34, 0);
    portalDisc.renderOrder = 2;
    gate.add(portalDisc);

    // cincin kayu pembatas portal
    const pring = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.06, 10, 32),
      toon(PLAYFUL.teal)
    );
    withOutline(pring, 1.1);
    pring.position.set(0, 1.34, 0);
    gate.add(pring);
    disposables.push(pring.geometry);

    // percik bintang kecil mengorbit gerbang
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), toon(PLAYFUL.lemon));
      disposables.push(m.geometry);
      withOutline(m, 1.25);
      gate.add(m);
      gateSparkles.push({
        m,
        a: (i / 3) * Math.PI * 2,
        r: 1.12 + i * 0.05,
        y: 1.3 + (i - 1) * 0.24,
      });
    }

    g.add(gate);
  }

  // ================= BOLA PANTAI (selatan) =================
  const BALL = { x: 1.0, z: 3.8, r: 0.5 };
  /** radius pantulan tepi pulau (pulau kini r ≈ 9.2) */
  const BALL_WALL = 8.5;
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 20, 16), teal);
  withOutline(ballMesh, 1.05);
  const ballBelt = new THREE.Mesh(
    new THREE.TorusGeometry(BALL.r, 0.055, 8, 24),
    cream
  );
  ballBelt.rotation.y = Math.PI / 2;
  withOutline(ballBelt, 1.08);
  ballMesh.add(ballBelt);
  const ballDot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), coral);
  ballDot.position.set(0, BALL.r - 0.02, 0);
  ballMesh.add(ballDot);
  g.add(ballMesh); // ditaruh sebagai anak pulau; posisi diset dunia tiap frame
  // (pulau pusat berada tepat di origin XZ — posisi lokal == posisi dunia;
  //  Y digeser engine mengikuti bob pulau)
  let bvx = 0;
  let bvz = 0;
  let kickCD = 0;
  let kicks = 0;
  const rollAxis = new THREE.Vector3();

  // ================= stations =================
  const stations: ToyStation[] = [
    { kind: "swing", x: SWING.x, z: SWING.z, r: 1.8 },
    { kind: "slide", x: SLIDE_PLATFORM.x, z: SLIDE_PLATFORM.z, r: 1.35 },
    { kind: "c4", x: C4.x - 1.2, z: C4.z, r: 1.5 },
    { kind: "github", x: GITHUB_GATE.x, z: GITHUB_GATE.z + 1.0, r: 1.45 },
  ];

  // ================= loop update =================
  const handle: PlaygroundHandle = {
    group: g,
    stations,
    steps,
    tramp: { x: TRAMP.x, z: TRAMP.z, r: TRAMP.r, topY: TRAMP.topY },
    swing: { x: SWING.x, z: SWING.z, topY: SWING.topY, L: SWING.L },
    slide: { top: SLIDE.top, bottom: SLIDE.bottom },
    ball: { x: BALL.x, z: BALL.z },
    bounces: 0,
    kicks: 0,
    trampPulse() {
      trampPulseT = 1;
    },
    swingAngle(a) {
      swingManual = a;
    },
    update(dt, t, hubY, player) {
      // --- sinkronkan ketinggian dunia (pulau pusat mengambang ±0.12) ---
      handle.tramp.topY = hubY + TRAMP.topY;
      for (const s of steps) s.c.topY = hubY + s.dy;
      handle.slide.top.y = hubY + SLIDE_LOCAL_TOP_Y;
      handle.slide.bottom.y = hubY + SLIDE_LOCAL_BOTTOM_Y;

      // --- ayunan: ayun santai bila tidak dinaiki ---
      if (swingManual === null) {
        swingPivot.rotation.z = Math.sin(t * 1.05) * 0.13;
      } else {
        swingPivot.rotation.z = swingManual;
      }

      // --- trampolin: denyut karet ---
      if (trampPulseT > 0) {
        trampPulseT = Math.max(0, trampPulseT - dt * 4);
        const p = trampPulseT;
        trampPad.scale.set(1 + p * 0.12, 1, 1 + p * 0.12);
        trampPad.position.y = TRAMP.topY - 0.015 - p * 0.05;
      }

      // --- gerbang github: portal berputar + percik mengorbit ---
      if (portalDisc && portalMat) {
        portalDisc.rotation.z += dt * 0.55;
        const s = 1 + Math.sin(t * 2.2) * 0.035;
        portalDisc.scale.set(s, s, 1);
        portalMat.opacity = 0.85 + Math.sin(t * 1.7) * 0.1;
      }
      for (const sp of gateSparkles) {
        sp.a += dt * 0.9;
        sp.m.position.set(
          Math.sin(sp.a) * sp.r,
          sp.y + Math.sin(t * 2 + sp.a) * 0.08,
          Math.cos(sp.a) * sp.r
        );
        sp.m.rotation.y += dt * 2.2;
      }

      // --- bola: tendangan, gesekan, pantul tepi pulau ---
      kickCD -= dt;
      const f = Math.exp(-1.1 * dt);
      bvx *= f;
      bvz *= f;
      const dx = handle.ball.x - player.x;
      const dz = handle.ball.z - player.z;
      const d = Math.hypot(dx, dz);
      let kicked = false;
      if (d < 1.2 && kickCD <= 0 && player.speed > 1.2) {
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const pow = 4.6 + Math.min(player.speed, 8) * 0.9;
        bvx = nx * pow + (Math.random() - 0.5) * 1.6;
        bvz = nz * pow + (Math.random() - 0.5) * 1.6;
        kickCD = 0.42;
        kicks += 1;
        handle.kicks = kicks;
        kicked = true;
      }
      handle.ball.x += bvx * dt;
      handle.ball.z += bvz * dt;
      const r = Math.hypot(handle.ball.x, handle.ball.z);
      if (r > BALL_WALL) {
        const nx = handle.ball.x / r;
        const nz = handle.ball.z / r;
        handle.ball.x = nx * BALL_WALL;
        handle.ball.z = nz * BALL_WALL;
        const vn = bvx * nx + bvz * nz;
        if (vn > 0) {
          bvx -= 1.65 * vn * nx;
          bvz -= 1.65 * vn * nz;
        }
      }
      ballMesh.position.set(handle.ball.x, BALL.r, handle.ball.z);
      const sp = Math.hypot(bvx, bvz);
      if (sp > 0.05) {
        rollAxis.set(bvz / sp, 0, -bvx / sp);
        ballMesh.rotateOnWorldAxis(rollAxis, (sp * dt) / BALL.r);
      }

      return kicked;
    },
    getBallState() {
      return {
        x: +handle.ball.x.toFixed(2),
        z: +handle.ball.z.toFixed(2),
        vx: +bvx.toFixed(2),
        vz: +bvz.toFixed(2),
      };
    },
    setBallState(x, z, vx, vz) {
      // tendangan dari tamu lain — terima state & beri jeda supaya fisika
      // lokal tidak langsung "menendang balik" bola yang baru tiba
      handle.ball.x = Math.max(-BALL_WALL, Math.min(BALL_WALL, x));
      handle.ball.z = Math.max(-BALL_WALL, Math.min(BALL_WALL, z));
      bvx = Math.max(-20, Math.min(20, vx));
      bvz = Math.max(-20, Math.min(20, vz));
      kickCD = Math.max(kickCD, 0.55);
    },
    setBoard(cells) {
      for (let c = 0; c < 7; c++) {
        const col = cells[c] ?? [];
        for (let r = 0; r < 6; r++) {
          const v = col[r] ?? 0;
          const disc = discs[c * 6 + r];
          if (!disc) continue;
          if (v === 0) {
            disc.visible = false;
          } else {
            disc.visible = true;
            disc.material = discMats[v - 1] ?? discMats[0];
            disc.position.set(
              C4.x - 0.04,
              1.5 + (r - 2.5) * 0.24,
              C4.z + (c - 3) * 0.24
            );
          }
        }
      }
    },
    dispose() {
      hubGroup.remove(g);
      for (const d of disposables) d.dispose();
    },
  };

  return handle;
}
