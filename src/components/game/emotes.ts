import * as THREE from "three";

/**
 * Sistem emote & kolektibel — dibuka dengan mengumpulkan bintang.
 *
 * Prinsip:
 *  - Ambang unlock = PERSEN dari total bintang di dunia (bukan angka mati),
 *    jadi tetap seimbang bila jumlah bintang berubah.
 *  - Progres bintang tertinggi disimpan di localStorage — bintang di dunia
 *    memang reset tiap sesi, tapi pencapaian unlock TIDAK ikut reset.
 *  - Semua ikon digambar sendiri di kanvas (doodle tinta) — tanpa emoji,
 *    konsisten dengan gaya "kertas & tinta".
 */

export interface EmoteDef {
  id: EmoteId;
  /** nama tampilan (Indonesia) */
  label: string;
  /** fraksi total bintang untuk membuka (0 = langsung terbuka) */
  frac: number;
  /** durasi animasi (detik) */
  dur: number;
  /** partikel yang menyala saat diputar */
  fx: "none" | "hearts" | "confetti";
}

export type EmoteId =
  | "wave"
  | "dance"
  | "spin"
  | "flip"
  | "sit"
  | "hearts"
  | "glitter";

export const EMOTES: EmoteDef[] = [
  { id: "wave", label: "Lambai", frac: 0, dur: 1.7, fx: "none" },
  { id: "dance", label: "Dansa", frac: 0.08, dur: 2.6, fx: "none" },
  { id: "spin", label: "Putar", frac: 0.2, dur: 1.5, fx: "none" },
  { id: "flip", label: "Salto", frac: 0.33, dur: 1.1, fx: "none" },
  { id: "sit", label: "Duduk", frac: 0.47, dur: 3.2, fx: "none" },
  { id: "hearts", label: "Hati", frac: 0.62, dur: 2.4, fx: "hearts" },
  { id: "glitter", label: "Konfeti", frac: 0.78, dur: 1.8, fx: "confetti" },
];

export const LS_MAX_STARS = "ukiyo:maxStars";
export const LS_GOLD_SCARF = "ukiyo:goldScarf";

export function loadMaxStars(): number {
  try {
    const v = Number(localStorage.getItem(LS_MAX_STARS));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveMaxStars(n: number) {
  try {
    localStorage.setItem(LS_MAX_STARS, String(n));
  } catch {
    /* storage bisa diblokir — pencapaian hanya hidup sesi ini */
  }
}

export function loadGoldScarf(): boolean {
  try {
    return localStorage.getItem(LS_GOLD_SCARF) === "1";
  } catch {
    return false;
  }
}

export function saveGoldScarf() {
  try {
    localStorage.setItem(LS_GOLD_SCARF, "1");
  } catch {
    /* diam saja */
  }
}

/** Jumlah bintang yang dibutuhkan untuk membuka sebuah emote */
export function unlockStars(def: EmoteDef, totalStars: number): number {
  if (def.frac <= 0) return 0;
  return Math.max(2, Math.ceil(def.frac * totalStars));
}

export function emoteUnlocked(
  def: EmoteDef,
  stars: number,
  totalStars: number
): boolean {
  return stars >= unlockStars(def, totalStars);
}

export function emoteById(id: string): EmoteDef | null {
  return EMOTES.find((e) => e.id === id) ?? null;
}

// ================= ikon doodle (kanvas → tekstur) =================

const iconCache = new Map<string, THREE.CanvasTexture>();

function inkDoodle(
  g: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void
) {
  g.lineWidth = 10;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = "#1C1813";
  g.fillStyle = "#1C1813";
  draw(g);
}

/** Kartu kertas kecil + doodle tinta mewakili satu emote */
export function emoteIconTexture(id: string): THREE.CanvasTexture {
  const cached = iconCache.get(id);
  if (cached) return cached;

  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;

  // kartu kertas
  g.fillStyle = "#F7F2E6";
  g.beginPath();
  g.roundRect(10, 10, 108, 108, 22);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "#1C1813";
  g.stroke();
  // bar aksen
  g.fillStyle = "#E4572E";
  g.beginPath();
  g.roundRect(10, 10, 12, 108, [8, 0, 0, 8]);
  g.fill();

  g.save();
  g.translate(64, 64);
  g.fillStyle = "#F7B32B";

  switch (id) {
    case "wave": {
      // tiga busur "halo" + titik — isyarat melambai
      inkDoodle(g, (c) => {
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(-14 + i * 14, 4, 26 - i * 4, -Math.PI * 0.78, -Math.PI * 0.34);
          c.stroke();
        }
      });
      g.beginPath();
      g.arc(0, 18, 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case "dance": {
      // nada musik: kepala bulat + tangkai + bendera
      inkDoodle(g, (c) => {
        c.beginPath();
        c.arc(-10, 16, 13, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(3, 16);
        c.lineTo(3, -24);
        c.stroke();
        c.beginPath();
        c.moveTo(3, -24);
        c.quadraticCurveTo(20, -18, 14, -2);
        c.stroke();
      });
      g.beginPath();
      g.arc(-10, 16, 9, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "spin": {
      // panah melingkar
      inkDoodle(g, (c) => {
        c.beginPath();
        c.arc(0, 0, 24, Math.PI * 0.2, Math.PI * 1.55);
        c.stroke();
        // mata panah
        const ax = Math.cos(Math.PI * 1.55) * 24;
        const ay = Math.sin(Math.PI * 1.55) * 24;
        c.beginPath();
        c.moveTo(ax - 2, ay - 12);
        c.lineTo(ax + 10, ay + 2);
        c.lineTo(ax - 12, ay + 8);
        c.closePath();
        c.fill();
      });
      break;
    }
    case "flip": {
      // panah memutar penuh (salto)
      inkDoodle(g, (c) => {
        c.beginPath();
        c.arc(0, 2, 22, Math.PI * 1.85, Math.PI * 0.75);
        c.stroke();
        const ax = Math.cos(Math.PI * 0.75) * 22;
        const ay = Math.sin(Math.PI * 0.75) * 22 + 2;
        c.beginPath();
        c.moveTo(ax - 12, ay - 8);
        c.lineTo(ax + 8, ay - 4);
        c.lineTo(ax - 2, ay + 12);
        c.closePath();
        c.fill();
      });
      break;
    }
    case "sit": {
      // Z Z Z — huruf digambar manual (tanpa tergantung font)
      inkDoodle(g, (c) => {
        const z = (x: number, y: number, s: number) => {
          c.beginPath();
          c.moveTo(x - s, y - s * 0.7);
          c.lineTo(x + s, y - s * 0.7);
          c.lineTo(x - s, y + s * 0.7);
          c.lineTo(x + s, y + s * 0.7);
          c.stroke();
        };
        z(-12, 2, 14);
        z(12, -8, 10);
        z(24, -18, 6);
      });
      break;
    }
    case "hearts": {
      // hati doodle
      g.save();
      g.beginPath();
      g.moveTo(0, 20);
      g.bezierCurveTo(-30, -4, -16, -26, 0, -10);
      g.bezierCurveTo(16, -26, 30, -4, 0, 20);
      g.closePath();
      g.fill();
      g.lineWidth = 9;
      g.strokeStyle = "#1C1813";
      g.stroke();
      g.restore();
      break;
    }
    case "glitter": {
      // bintang + percik
      const star = (x: number, y: number, r: number, rot: number) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = rot + (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const b = a + Math.PI / 5;
          g.lineTo(Math.cos(a) * r + x, Math.sin(a) * r + y);
          g.lineTo(Math.cos(b) * r * 0.45 + x, Math.sin(b) * r * 0.45 + y);
        }
        g.closePath();
      };
      g.save();
      g.translate(-4, 2);
      star(0, 0, 22, 0);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = "#1C1813";
      g.stroke();
      g.restore();
      // percik kecil
      inkDoodle(g, (c) => {
        c.beginPath();
        c.moveTo(20, -22);
        c.lineTo(27, -15);
        c.moveTo(23, 20);
        c.lineTo(29, 14);
        c.stroke();
      });
      break;
    }
    default: {
      // tanda tanya doodle
      inkDoodle(g, (c) => {
        c.beginPath();
        c.arc(0, -6, 12, Math.PI, 0);
        c.lineTo(0, 8);
        c.stroke();
      });
      g.beginPath();
      g.arc(0, 24, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 2;
  iconCache.set(id, tex);
  return tex;
}

/** Bersihkan cache ikon (dipangail saat engine dibuang) */
export function disposeEmoteIcons() {
  for (const t of iconCache.values()) t.dispose();
  iconCache.clear();
}
