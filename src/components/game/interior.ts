import * as THREE from "three";
import { PLAYFUL } from "./types";
import type { ProjectShowcase } from "@/lib/projects";

/**
 * Interior 3D gedung proyek — "Kanji Hall".
 *
 * Pintu gedung di pulau bukan lagi pembuka overlay teks: pemain BENAR-BENAR
 * diteleport masuk ke ruangan 3D ini (dimensi saku jauh di bawah kepulauan),
 * lalu berjalan-jalan di antara pameran:
 *  - 8 screenshot proyek berbingkai di dinding timur & barat
 *  - papan statistik di dinding selatan, plakat + tagline di dinding utara
 *  - stasiun KUIS KANJI yang bisa dimainkan (berdiri di karung jawaban + E)
 *  - pedestal "buku pamaran" → membuka pameran lengkap (overlay) bila mau baca
 *  - pintu keluar di dinding selatan (E lagi)
 *
 * Ruangan berbentuk kotak sumbu (AABB) sehingga tabrakan dinding, clamp
 * kamera, dan deteksi kedekatan station semuanya murah & pasti.
 */

const CJK_FONT =
  "'Noto Sans SC', 'MS Gothic', 'Yu Gothic', 'Hiragino Kaku Gothic Pro', sans-serif";
const SERIF = "'DM Serif Display', Georgia, serif";
const MONO = "'Space Mono', 'Courier New', monospace";

/** Kedalaman dunia tempat ruangan berdiri (jauh di bawah kepulauan) */
export const INTERIOR_Y = -70;

export interface QuizQuestion {
  kanji: string;
  correct: string;
  wrong: [string, string];
  hint: string;
}

const QUIZ_BANK: QuizQuestion[] = [
  { kanji: "山", correct: "やま", wrong: ["かわ", "そら"], hint: "gunung" },
  { kanji: "川", correct: "かわ", wrong: ["やま", "もり"], hint: "sungai" },
  { kanji: "空", correct: "そら", wrong: ["うみ", "やま"], hint: "langit" },
  { kanji: "犬", correct: "いぬ", wrong: ["ねこ", "とり"], hint: "anjing" },
  { kanji: "本", correct: "ほん", wrong: ["て", "みみ"], hint: "buku" },
  { kanji: "火", correct: "ひ", wrong: ["みず", "つち"], hint: "api" },
];

export type StationKind = "exit" | "shot" | "book" | "pad";

/** Titik interaksi di dalam ruangan (koordinat DUNIA, siap dipakai engine) */
export interface InsideStation {
  kind: StationKind;
  x: number;
  y: number;
  z: number;
  /** radius pemicu (jarak horizontal) */
  r: number;
  caption?: string;
  galleryIdx?: number;
  padIdx?: number;
}

export interface InteriorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
  ceilY: number;
}

export interface AnswerResult {
  correct: boolean;
  streak: number;
  question: QuizQuestion;
}

export interface InteriorHandle {
  group: THREE.Group;
  bounds: InteriorBounds;
  stations: InsideStation[];
  /** titik muncul pemain saat masuk (koordinat dunia) */
  spawn: THREE.Vector3;
  update: (dt: number, t: number) => void;
  setVisible: (v: boolean) => void;
  /** Coba jawab dari karung jawaban padIdx. null = kuis terkunci sementara. */
  answerPad: (padIdx: number) => AnswerResult | null;
  quizState: () => { question: QuizQuestion; streak: number };
  dispose: () => void;
}

// ---------- util kanvas ----------

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Kartu kertas (kanvas) dengan teks — gaya label museum */
function labelTexture(
  lines: string[],
  opts: {
    w?: number;
    h?: number;
    size?: number;
    maxChars?: number;
    font?: string;
  } = {}
): THREE.CanvasTexture {
  const w = opts.w ?? 640;
  const h = opts.h ?? 200;
  const size = opts.size ?? 40;
  const maxChars = opts.maxChars ?? 30;
  const font = opts.font ?? `400 ${size}px ${SERIF}`;

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#F7F2E6";
  c.beginPath();
  c.roundRect(4, 4, w - 8, h - 8, 18);
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = "#1C1813";
  c.stroke();
  c.fillStyle = "#E4572E";
  c.beginPath();
  c.roundRect(4, 4, 16, h - 8, [12, 0, 0, 12]);
  c.fill();

  const wrapped: string[] = [];
  for (const l of lines) wrapped.push(...wrapLines(l, maxChars));
  const lh = size * 1.32;
  c.fillStyle = "#1C1813";
  c.font = font;
  c.textAlign = "left";
  c.textBaseline = "middle";
  const y0 = h / 2 - ((wrapped.length - 1) * lh) / 2;
  wrapped.forEach((l, i) => c.fillText(l, 40, y0 + i * lh));

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 2;
  return tex;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bangun interior Kanji Hall dari data showcase */
export function buildKanjiHallInterior(
  showcase: ProjectShowcase
): InteriorHandle {
  const disposables: Array<{ dispose(): void }> = [];
  const g = new THREE.Group();
  g.position.set(0, INTERIOR_Y, 0);

  const toon = (color: number) => {
    const m = new THREE.MeshToonMaterial({ color });
    disposables.push(m);
    return m;
  };
  const cream = toon(PLAYFUL.cream);
  const ink = toon(0x241f18);
  const wood = toon(0x8a7a5e);
  const woodDark = toon(0x6e5f47);
  const coral = toon(PLAYFUL.coral);
  const gold = toon(PLAYFUL.lemon);
  const stone = toon(0xbfae97);
  const paperMat = toon(0xf3ecdb);
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  disposables.push(lampGlowMat);

  const box = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    disposables.push(m.geometry);
    return m;
  };

  // dimensi ruangan (koordinat LOKAL)
  const RX = 9.4; // setengah lebar (dinding barat→timur)
  const RZ = 6.3; // setengah kedalaman (dinding utara→selatan)
  const CH = 7.0; // tinggi plafon

  // ================= lantai =================
  box(RX * 2 + 0.6, 0.3, RZ * 2 + 0.6, woodDark, 0, -0.15, 0);
  for (let i = 0; i <= 10; i++) {
    box(RX * 2, 0.012, 0.03, ink, 0, 0.006, -RZ + (i * RZ * 2) / 10);
  }
  // karung area kuis
  box(6.9, 0.02, 4.9, coral, 0, 0.008, -2.3);
  box(6.4, 0.025, 4.4, paperMat, 0, 0.016, -2.3);

  // ================= dinding + plafon =================
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    box(w, h, d, cream, x, y, z);
  wall(RX * 2 + 0.6, CH, 0.3, 0, CH / 2, -RZ - 0.15); // utara
  wall(0.3, CH, RZ * 2 + 0.6, -RX - 0.15, CH / 2, 0); // barat
  wall(0.3, CH, RZ * 2 + 0.6, RX + 0.15, CH / 2, 0); // timur
  const segW = RX - 1.5; // dinding selatan kiri-kanan celah pintu (lebar 3)
  wall(segW, CH, 0.3, -(1.5 + segW / 2), CH / 2, RZ + 0.15);
  wall(segW, CH, 0.3, 1.5 + segW / 2, CH / 2, RZ + 0.15);
  wall(3.0, CH - 3.3, 0.3, 0, 3.3 + (CH - 3.3) / 2, RZ + 0.15); // ambang atas pintu
  // plafon + balok
  box(RX * 2 + 0.9, 0.25, RZ * 2 + 0.9, ink, 0, CH + 0.1, 0);
  for (const x of [-RX + 1, -RX / 2, 0, RX / 2, RX - 1]) {
    box(0.34, 0.24, RZ * 2, wood, x, CH - 0.12, 0);
  }
  // lis skirting
  box(RX * 2, 0.34, 0.12, wood, 0, 0.17, -RZ + 0.06);
  box(RX * 2, 0.34, 0.12, wood, 0, 0.17, RZ - 0.06);
  box(0.12, 0.34, RZ * 2, wood, -RX + 0.06, 0.17, 0);
  box(0.12, 0.34, RZ * 2, wood, RX - 0.06, 0.17, 0);

  // jendela shoji bercahaya (tinggi di dinding timur/barat)
  const shojiMat = new THREE.MeshBasicMaterial({
    color: 0xfff2cf,
    transparent: true,
    opacity: 0.92,
  });
  disposables.push(shojiMat);
  for (const side of [-1, 1]) {
    for (const z of [-3.6, 0, 3.6]) {
      box(0.1, 1.6, 2.2, wood, side * (RX - 0.02), 5.0, z);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 1.4),
        shojiMat
      );
      pane.position.set(side * (RX - 0.09), 5.0, z);
      pane.rotation.y = (-side * Math.PI) / 2;
      g.add(pane);
      disposables.push(pane.geometry);
    }
  }

  // ================= pintu keluar (dinding selatan) =================
  box(2.9, 3.15, 0.12, ink, 0, 1.58, RZ + 0.28); // lubang gelap
  box(3.4, 0.16, 0.7, stone, 0, 0.08, RZ - 0.1); // ambang batu
  const spillMat = new THREE.MeshBasicMaterial({
    color: 0xffd98a,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  disposables.push(spillMat);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.022, RZ - 1.15);
  g.add(spill);
  disposables.push(spill.geometry);
  // papan "出口 · KELUAR" di atas pintu (menghadap utara)
  const exitCv = document.createElement("canvas");
  exitCv.width = 512;
  exitCv.height = 160;
  {
    const c = exitCv.getContext("2d")!;
    c.fillStyle = "#241f18";
    c.beginPath();
    c.roundRect(6, 6, 500, 148, 16);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = "#F7B32B";
    c.stroke();
    c.fillStyle = "#F7F2E6";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 84px ${CJK_FONT}`;
    c.fillText("出口", 130, 84);
    c.font = `700 46px ${MONO}`;
    c.fillStyle = "#F7B32B";
    c.fillText("KELUAR", 350, 84);
  }
  const exitTex = new THREE.CanvasTexture(exitCv);
  exitTex.anisotropy = 2;
  disposables.push(exitTex);
  const exitBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.66),
    new THREE.MeshBasicMaterial({ map: exitTex })
  );
  disposables.push(exitBoard.material as THREE.Material);
  exitBoard.position.set(0, 3.55, RZ - 0.16);
  exitBoard.rotation.y = Math.PI;
  g.add(exitBoard);
  disposables.push(exitBoard.geometry);

  // ================= dinding utara: plakat besar + tagline =================
  const plaqueCv = document.createElement("canvas");
  plaqueCv.width = 512;
  plaqueCv.height = 224;
  {
    const c = plaqueCv.getContext("2d")!;
    c.fillStyle = "#8a7a5e";
    c.beginPath();
    c.roundRect(4, 4, 504, 216, 10);
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = "#1C1813";
    c.stroke();
    c.fillStyle = "#F7F2E6";
    c.beginPath();
    c.roundRect(34, 30, 444, 164, 12);
    c.fill();
    c.fillStyle = "#1C1813";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 116px ${CJK_FONT}`;
    c.fillText("漢字帳", 256, 118);
  }
  const plaqueTex = new THREE.CanvasTexture(plaqueCv);
  plaqueTex.anisotropy = 2;
  disposables.push(plaqueTex);
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.5),
    new THREE.MeshBasicMaterial({ map: plaqueTex })
  );
  disposables.push(plaque.material as THREE.Material);
  plaque.position.set(0, 5.95, -RZ + 0.16);
  g.add(plaque);
  disposables.push(plaque.geometry);

  const tagTex = labelTexture([showcase.tagline], {
    w: 1024,
    h: 260,
    size: 38,
    maxChars: 46,
  });
  disposables.push(tagTex);
  const tagBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 1.83),
    new THREE.MeshBasicMaterial({ map: tagTex })
  );
  disposables.push(tagBoard.material as THREE.Material);
  tagBoard.position.set(0, 4.15, -RZ + 0.14);
  g.add(tagBoard);
  disposables.push(tagBoard.geometry);

  // ================= papan statistik (dinding selatan, kiri-kanan pintu) =================
  showcase.stats.slice(0, 6).forEach((st, i) => {
    const side = i < 3 ? -1 : 1;
    const slot = i % 3;
    const x = side * (2.35 + slot * 2.1);
    const cv = document.createElement("canvas");
    cv.width = 384;
    cv.height = 224;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#F7F2E6";
    c.beginPath();
    c.roundRect(6, 6, 372, 212, 18);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = "#1C1813";
    c.stroke();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#E4572E";
    c.font = `italic 700 76px ${SERIF}`;
    c.fillText(st.value, 192, 92);
    c.fillStyle = "#1C1813";
    c.font = `400 34px ${MONO}`;
    c.fillText(st.label.toUpperCase(), 192, 170);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 2;
    disposables.push(tex);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.85, 1.08),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    disposables.push(board.material as THREE.Material);
    board.position.set(x, 2.15, RZ - 0.16);
    board.rotation.y = Math.PI;
    g.add(board);
    disposables.push(board.geometry);
  });

  // ================= bingkai screenshot (dinding barat & timur) =================
  const loader = new THREE.TextureLoader();
  interface ShotSpec {
    side: -1 | 1;
    z: number;
    idx: number;
  }
  const shotSpecs: ShotSpec[] = [];
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < 4; s++) {
      shotSpecs.push({ side, z: -3.9 + s * 2.6, idx: side === -1 ? s : 4 + s });
    }
  }
  shotSpecs.forEach((spec) => {
    const shot = showcase.gallery[spec.idx];
    if (!shot) return;
    const facing = (-spec.side * Math.PI) / 2; // rotasi bidang agar menghadap ke dalam
    // bingkai kayu (tipis di sumbu x, lebar di z — tanpa rotasi)
    box(0.14, 2.1, 2.8, wood, spec.side * (RX - 0.09), 2.35, spec.z);
    // mat gelap + bidang screenshot + label keterangan
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(2.55, 1.85),
      new THREE.MeshBasicMaterial({ color: 0x241f18 })
    );
    disposables.push(mat.material as THREE.Material);
    mat.position.set(spec.side * (RX - 0.18), 2.35, spec.z);
    mat.rotation.y = facing;
    g.add(mat);
    disposables.push(mat.geometry);

    const screenMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    disposables.push(screenMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
    screen.position.set(spec.side * (RX - 0.21), 2.42, spec.z);
    screen.rotation.y = facing;
    g.add(screen);
    disposables.push(screen.geometry);
    loader.load(
      shot.src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const img = tex.image as { width: number; height: number };
        const aspect = img.width / Math.max(1, img.height);
        const BOX_W = 2.38;
        const BOX_H = 1.66;
        let w = BOX_W;
        let h = BOX_H;
        if (aspect > BOX_W / BOX_H) h = BOX_W / aspect;
        else w = BOX_H * aspect;
        screen.scale.set(w, h, 1);
        screenMat.map = tex;
        screenMat.color.set(0xffffff);
        screenMat.needsUpdate = true;
      },
      undefined,
      () => {
        /* gagal memuat — biarkan bidang abu redup */
      }
    );
    const capTex = labelTexture(
      [`${spec.idx + 1}. ${shot.caption}`],
      { w: 640, h: 150, size: 36, maxChars: 28 }
    );
    disposables.push(capTex);
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.58),
      new THREE.MeshBasicMaterial({ map: capTex, transparent: true })
    );
    disposables.push(cap.material as THREE.Material);
    cap.position.set(spec.side * (RX - 0.18), 1.02, spec.z);
    cap.rotation.y = facing;
    g.add(cap);
    disposables.push(cap.geometry);
  });

  // ================= lentera gantung =================
  const lanterns: THREE.Group[] = [];
  for (const [x, z] of [
    [-3.4, -2.2],
    [3.4, -2.2],
    [-3.4, 2.6],
    [3.4, 2.6],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, CH - 0.3, z);
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.8, 5),
      ink
    );
    string.position.y = -0.4;
    pivot.add(string);
    disposables.push(string.geometry);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12),
      paperMat
    );
    body.position.y = -1.0;
    pivot.add(body);
    disposables.push(body.geometry);
    for (const y of [-0.78, -1.22]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10),
        ink
      );
      cap.position.y = y;
      pivot.add(cap);
      disposables.push(cap.geometry);
    }
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      lampGlowMat
    );
    glow.position.y = -1.0;
    pivot.add(glow);
    disposables.push(glow.geometry);
    g.add(pivot);
    lanterns.push(pivot);
  }

  // ================= pencahayaan ruangan =================
  const lights: THREE.PointLight[] = [];
  for (const [x, z] of [
    [0, -3.4],
    [-5.2, 2.4],
    [5.2, 2.4],
  ]) {
    const l = new THREE.PointLight(0xffd98a, 1.05, 17, 1.5);
    l.position.set(x, 5.2, z);
    g.add(l);
    lights.push(l);
  }

  // ================= pedestal "buku pamaran" (pojok barat-laut) =================
  const bookX = -6.6;
  const bookZ = -5.0;
  box(1.3, 0.1, 0.9, wood, bookX, 0.66, bookZ);
  for (const [dx, dz] of [
    [-0.55, -0.36],
    [0.55, -0.36],
    [-0.55, 0.36],
    [0.55, 0.36],
  ]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.62, 6),
      woodDark
    );
    leg.position.set(bookX + dx, 0.31, bookZ + dz);
    g.add(leg);
    disposables.push(leg.geometry);
  }
  for (const side of [-1, 1]) {
    const page = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.03, 0.6),
      paperMat
    );
    page.position.set(bookX + side * 0.24, 0.73, bookZ);
    page.rotation.z = side * 0.16;
    g.add(page);
    disposables.push(page.geometry);
  }
  const bookGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    lampGlowMat
  );
  bookGlow.position.set(bookX, 1.12, bookZ);
  g.add(bookGlow);
  disposables.push(bookGlow.geometry);
  const bookLamp = new THREE.PointLight(0xffd98a, 0.5, 4.5, 1.8);
  bookLamp.position.set(bookX, 1.3, bookZ);
  g.add(bookLamp);
  const bookTex = labelTexture(
    ["buku pamaran — cerita & fitur lengkap"],
    { w: 720, h: 130, size: 34, maxChars: 44 }
  );
  disposables.push(bookTex);
  const bookLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: bookTex, depthWrite: false })
  );
  disposables.push(bookLabel.material);
  bookLabel.scale.set(2.6, 0.47, 1);
  bookLabel.position.set(bookX, 1.75, bookZ);
  g.add(bookLabel);

  // ================= rak gulungan + kristal (pojok timur-laut) =================
  for (const z of [-5.4, -4.4]) {
    box(1.8, 1.15, 0.28, wood, 7.9, 0.6, z);
    for (const dx of [-0.6, 0, 0.6]) {
      const scroll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8),
        gold
      );
      scroll.rotation.z = Math.PI / 2;
      scroll.position.set(7.6 + dx, 1.3, z);
      g.add(scroll);
      disposables.push(scroll.geometry);
    }
  }
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4, 0),
    toon(PLAYFUL.lavender)
  );
  crystal.position.set(7.9, 1.9, -5.0);
  g.add(crystal);
  disposables.push(crystal.geometry);

  // ================= roh kanji (kartu melayang naik) =================
  const KANJI = ["漢", "字", "帳", "学", "山", "川", "空", "火"];
  const spirits: Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    x: number;
    z: number;
    speed: number;
    phase: number;
  }> = [];
  const spiritSpots: Array<[number, number, number, number]> = [
    [-7.8, -3.2, 0.11, 0.1],
    [-7.8, 1.0, 0.16, 0.4],
    [7.8, -1.6, 0.13, 0.7],
    [7.8, 2.2, 0.18, 0.2],
    [-2.5, -5.6, 0.15, 0.55],
    [2.5, -5.6, 0.12, 0.85],
    [-1.2, 4.9, 0.17, 0.3],
    [1.2, 4.9, 0.14, 0.65],
  ];
  spiritSpots.forEach(([x, z, speed, phase], i) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#F7F2E6";
    c.beginPath();
    c.roundRect(10, 10, 108, 108, 18);
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = "#1C1813";
    c.stroke();
    c.fillStyle = "#1C1813";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 76px ${CJK_FONT}`;
    c.fillText(KANJI[i], 64, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 2;
    disposables.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    disposables.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.5, 0.5, 1);
    sprite.position.set(x, 1.2, z);
    g.add(sprite);
    spirits.push({ sprite, mat, x, z, speed, phase });
  });

  // ================= papan kuis + 3 karung jawaban =================
  const boardCv = document.createElement("canvas");
  boardCv.width = 768;
  boardCv.height = 560;
  const boardTex = new THREE.CanvasTexture(boardCv);
  boardTex.anisotropy = 2;
  disposables.push(boardTex);

  // ---- state kuis ----
  let qIdx = Math.floor(Math.random() * QUIZ_BANK.length);
  let streak = 0;
  let lockT = 0; // > 0 = terkunci menunggu soal berikut
  let boardState: "question" | "right" | "wrong" = "question";
  let stateT = 0;
  let options: string[] = [];
  let correctPad = 0;

  const drawBoard = () => {
    const c = boardCv.getContext("2d")!;
    const q = QUIZ_BANK[qIdx];
    c.fillStyle = "#F7F2E6";
    c.fillRect(0, 0, 768, 560);
    c.lineWidth = 12;
    c.strokeStyle = "#1C1813";
    c.strokeRect(6, 6, 756, 548);
    c.fillStyle = "#E4572E";
    c.fillRect(6, 6, 756, 10);
    c.textAlign = "center";
    c.textBaseline = "middle";

    if (boardState === "question") {
      c.fillStyle = "#1C1813";
      c.font = `700 44px ${MONO}`;
      c.fillText("K U I S   K A N J I", 384, 64);
      c.font = `700 240px ${CJK_FONT}`;
      c.fillText(q.kanji, 384, 250);
      c.font = `italic 400 48px ${SERIF}`;
      c.fillStyle = "#1C1813";
      c.fillText(`arti: ${q.hint}`, 384, 396);
      c.font = `400 34px ${MONO}`;
      c.fillStyle = "#E4572E";
      c.fillText(`beruntun: ${streak}`, 384, 452);
      c.fillStyle = "#1C1813";
      c.font = `400 28px ${MONO}`;
      c.fillText("berdiri di karung jawaban + E", 384, 504);
    } else {
      // umpan balik: lingkaran / silang digambar manual (tanpa glyph khusus)
      const ok = boardState === "right";
      c.strokeStyle = ok ? "#3f9d4f" : "#c0392b";
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 22;
      c.lineCap = "round";
      if (ok) {
        c.beginPath();
        c.arc(384, 200, 84, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(342, 206);
        c.lineTo(376, 240);
        c.lineTo(432, 162);
        c.stroke();
      } else {
        c.beginPath();
        c.moveTo(312, 128);
        c.lineTo(456, 272);
        c.moveTo(456, 128);
        c.lineTo(312, 272);
        c.stroke();
      }
      c.fillStyle = "#1C1813";
      c.font = `italic 700 76px ${SERIF}`;
      c.fillText(ok ? "Benar!" : "Belum tepat", 384, 358);
      c.font = `400 36px ${MONO}`;
      c.fillText(`bacaannya: ${q.correct}`, 384, 430);
    }
    boardTex.needsUpdate = true;
  };

  // ---- karung jawaban ----
  const padCvs: HTMLCanvasElement[] = [];
  const padTexs: THREE.CanvasTexture[] = [];
  const padSprites: THREE.Sprite[] = [];
  const padMats: THREE.MeshToonMaterial[] = [];
  const PAD_POS: Array<[number, number]> = [
    [-1.6, -2.9],
    [0, -3.35],
    [1.6, -2.9],
  ];
  for (let i = 0; i < 3; i++) {
    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 220;
    padCvs.push(cv);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 2;
    disposables.push(tex);
    padTexs.push(tex);

    const [x, z] = PAD_POS[i];
    const padMat = toon(PLAYFUL.cream);
    padMats.push(padMat);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.86, 0.14, 18),
      padMat
    );
    pad.position.set(x, 0.07, z);
    g.add(pad);
    disposables.push(pad.geometry);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.035, 8, 24),
      toon(PLAYFUL.coral)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.145, z);
    g.add(rim);
    disposables.push(rim.geometry);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, depthWrite: false })
    );
    disposables.push(sprite.material);
    sprite.scale.set(1.15, 0.79, 1);
    sprite.position.set(x, 1.15, z);
    g.add(sprite);
    padSprites.push(sprite);
  }

  const drawPads = () => {
    for (let i = 0; i < 3; i++) {
      const c = padCvs[i].getContext("2d")!;
      c.clearRect(0, 0, 320, 220);
      c.fillStyle = "#F7F2E6";
      c.beginPath();
      c.roundRect(18, 30, 284, 160, 24);
      c.fill();
      c.lineWidth = 9;
      c.strokeStyle = "#1C1813";
      c.stroke();
      c.fillStyle = "#E4572E";
      c.beginPath();
      c.roundRect(18, 30, 22, 160, [14, 0, 0, 14]);
      c.fill();
      c.fillStyle = "#1C1813";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `700 96px ${CJK_FONT}`;
      c.fillText(options[i] ?? "—", 178, 112);
      padTexs[i].needsUpdate = true;
    }
  };

  const nextQuestion = () => {
    qIdx = (qIdx + 1 + Math.floor(Math.random() * 2)) % QUIZ_BANK.length;
    const q = QUIZ_BANK[qIdx];
    options = shuffle([q.correct, ...q.wrong]);
    correctPad = options.indexOf(q.correct);
    boardState = "question";
    lockT = 0;
    stateT = 0;
    drawBoard();
    drawPads();
    for (const m of padMats) m.color.set(PLAYFUL.cream);
  };
  // soal pertama
  {
    const q = QUIZ_BANK[qIdx];
    options = shuffle([q.correct, ...q.wrong]);
    correctPad = options.indexOf(q.correct);
    drawBoard();
    drawPads();
  }

  // papan kuis berdiri menempel dinding utara (di bawah tagline)
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 2.15),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  disposables.push(board.material as THREE.Material);
  board.position.set(0, 1.98, -RZ + 0.24);
  g.add(board);
  disposables.push(board.geometry);
  for (const dx of [-1.25, 1.25]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8),
      woodDark
    );
    post.position.set(dx, 0.45, -RZ + 0.3);
    g.add(post);
    disposables.push(post.geometry);
  }

  // ================= stations (koordinat DUNIA) =================
  // CATATAN: group hanya menggeser Y (INTERIOR_Y) — x/z lokal = x/z dunia
  const stations: InsideStation[] = [];
  stations.push({
    kind: "exit",
    x: 0,
    y: INTERIOR_Y,
    z: RZ - 0.9,
    r: 1.7,
    caption: "keluar dari gedung",
  });
  stations.push({
    kind: "book",
    x: bookX,
    y: INTERIOR_Y,
    z: bookZ,
    r: 1.75,
    caption: "buka buku pamaran",
  });
  shotSpecs.forEach((spec) => {
    const shot = showcase.gallery[spec.idx];
    if (!shot) return;
    stations.push({
      kind: "shot",
      x: spec.side * (RX - 1.35),
      y: INTERIOR_Y,
      z: spec.z,
      r: 1.6,
      caption: shot.caption,
      galleryIdx: spec.idx,
    });
  });
  PAD_POS.forEach(([px, pz], i) => {
    stations.push({
      kind: "pad",
      x: px,
      y: INTERIOR_Y,
      z: pz,
      r: 1.0,
      padIdx: i,
    });
  });

  const spawn = new THREE.Vector3(0, INTERIOR_Y, 3.6);
  const bounds: InteriorBounds = {
    minX: -RX + 0.55,
    maxX: RX - 0.55,
    minZ: -RZ + 0.55,
    maxZ: RZ - 0.35,
    floorY: INTERIOR_Y,
    ceilY: INTERIOR_Y + CH - 0.35,
  };

  g.visible = false;

  return {
    group: g,
    bounds,
    stations,
    spawn,
    update(dt, t) {
      // lentera bergoyang + berdenyut
      lanterns.forEach((l, i) => {
        l.rotation.z = Math.sin(t * 1.3 + i * 1.9) * 0.07;
        l.rotation.x = Math.sin(t * 1.0 + i * 1.3) * 0.05;
        (l.children[4] as THREE.Mesh).scale.setScalar(0.9 + Math.sin(t * 2.4 + i) * 0.12);
      });
      lights[0].intensity = 1.0 + Math.sin(t * 1.7) * 0.12;
      // kristal berputar
      crystal.rotation.y = t * 0.8;
      crystal.position.y = 1.9 + Math.sin(t * 1.4) * 0.12;
      // roh kanji naik
      for (const s of spirits) {
        const frac = (t * s.speed + s.phase) % 1;
        s.sprite.position.set(
          s.x + Math.sin(t * 1.5 + s.phase * 7) * 0.14,
          0.7 + frac * 5.2,
          s.z + Math.cos(t * 1.2 + s.phase * 5) * 0.1
        );
        s.mat.opacity = Math.sin(Math.PI * frac) ** 0.7;
      }
      // label mengambang
      bookLabel.position.y = 1.75 + Math.sin(t * 1.6) * 0.05;
      padSprites.forEach((sp, i) => {
        sp.position.y = 1.15 + Math.sin(t * 2 + i) * 0.06;
      });
      // kuis: buka kunci → soal berikut
      if (lockT > 0) {
        lockT -= dt;
        stateT += dt;
        if (stateT > 0.45) {
          for (const m of padMats) m.color.set(PLAYFUL.cream);
        }
        if (lockT <= 0) nextQuestion();
      }
    },
    setVisible(v) {
      g.visible = v;
    },
    answerPad(padIdx) {
      if (lockT > 0) return null;
      const q = QUIZ_BANK[qIdx];
      const correct = padIdx === correctPad;
      streak = correct ? streak + 1 : 0;
      boardState = correct ? "right" : "wrong";
      stateT = 0;
      lockT = 1.25;
      drawBoard();
      padMats[padIdx].color.set(correct ? 0x7bc47f : 0xc0392b);
      return { correct, streak, question: q };
    },
    quizState() {
      return { question: QUIZ_BANK[qIdx], streak };
    },
    dispose() {
      g.parent?.remove(g);
      for (const d of disposables) d.dispose();
    },
  };
}
