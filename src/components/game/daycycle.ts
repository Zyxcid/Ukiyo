import * as THREE from "three";

/**
 * Siklus siang-malam realtime — langit, cahaya, matahari/bulan, bintang
 * mengikuti jam lokal pengunjung (browser). Tanpa server, tanpa database:
 * cocok untuk deploy statis (Vercel).
 *
 * Debug: tambahkan ?jam=HH atau ?jam=HH.MM pada URL untuk memaksa jam tertentu,
 * mis. ?jam=22 → malam. Hanya memengaruhi tampilan lingkungan.
 */

export type PhaseName = "fajar" | "pagi" | "siang" | "sore" | "senja" | "malam";

export interface DayState {
  /** warna kubah langit */
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  skyBottom: THREE.Color;
  fog: THREE.Color;
  /** warna bola matahari (siang) */
  sunColor: THREE.Color;
  /** cahaya utama (matahari siang → bulan malam) */
  dirColor: THREE.Color;
  dirIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  ambColor: THREE.Color;
  ambIntensity: number;
  sunHaloOpacity: number;
  moonHaloOpacity: number;
  cloudTint: THREE.Color;
  cloudOpacity: number;
  /** opasitas bintang di langit (malam) */
  starOpacity: number;
  /** 0 = konfeti warna (siang) → 1 = kunang-kunang hangat (malam) */
  firefly: number;
  /** progres busur matahari 0..1 (terbit → tenggelam) */
  sunArc: number;
  /** progres busur bulan 0..1 */
  moonArc: number;
  sunVis: number;
  moonVis: number;
  phase: PhaseName;
}

interface Keyframe {
  h: number;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  sun: number;
  dir: number;
  dirI: number;
  hemiS: number;
  hemiG: number;
  hemiI: number;
  amb: number;
  ambI: number;
  haloS: number;
  haloM: number;
  cloud: number;
  cloudO: number;
  star: number;
  firefly: number;
  sunArc: number;
  moonArc: number;
  sunVis: number;
  moonVis: number;
}

/** Titik kunci sepanjang 24 jam (estetika kertas & tinta tetap terjaga). */
const KEYS: Keyframe[] = [
  // ---- malam (00:00–04:30) ----
  { h: 0.0, skyTop: 0x1d2638, skyMid: 0x26324a, skyHorizon: 0x324058, skyBottom: 0x212b40, fog: 0x253049, sun: 0xf4efe2, dir: 0x9db8e8, dirI: 0.62, hemiS: 0x39445e, hemiG: 0x1d2331, hemiI: 0.62, amb: 0xaebbd8, ambI: 0.42, haloS: 0, haloM: 0.85, cloud: 0x3d465e, cloudO: 0.5, star: 1, firefly: 1, sunArc: 0, moonArc: 0.2, sunVis: 0, moonVis: 1 },
  { h: 3.5, skyTop: 0x1d2638, skyMid: 0x26324a, skyHorizon: 0x324058, skyBottom: 0x212b40, fog: 0x253049, sun: 0xf4efe2, dir: 0x9db8e8, dirI: 0.62, hemiS: 0x39445e, hemiG: 0x1d2331, hemiI: 0.62, amb: 0xaebbd8, ambI: 0.42, haloS: 0, haloM: 0.85, cloud: 0x3d465e, cloudO: 0.5, star: 1, firefly: 1, sunArc: 0, moonArc: 0.6, sunVis: 0, moonVis: 1 },
  // ---- dini hari: langit mulai terangkat ----
  { h: 4.6, skyTop: 0x2a3350, skyMid: 0x3a4266, skyHorizon: 0x5c5c82, skyBottom: 0x303a55, fog: 0x3c4258, sun: 0xf4efe2, dir: 0xb8a8d0, dirI: 0.55, hemiS: 0x555f85, hemiG: 0x2a2f42, hemiI: 0.62, amb: 0xc0c4e0, ambI: 0.4, haloS: 0, haloM: 0.7, cloud: 0x4a5268, cloudO: 0.5, star: 0.8, firefly: 0.9, sunArc: 0, moonArc: 0.88, sunVis: 0, moonVis: 1 },
  // ---- fajar (±05:30): peach + lavender ----
  { h: 5.6, skyTop: 0x7e86c0, skyMid: 0xc9a3c0, skyHorizon: 0xf2c79c, skyBottom: 0xdcc0b2, fog: 0xe0c4b4, sun: 0xffd9a0, dir: 0xffc9a4, dirI: 0.85, hemiS: 0xd4d6f0, hemiG: 0xbfa9bc, hemiI: 0.8, amb: 0xfff0e0, ambI: 0.32, haloS: 0.5, haloM: 0.25, cloud: 0xf2d6c2, cloudO: 0.75, star: 0.15, firefly: 0.5, sunArc: 0.05, moonArc: 1, sunVis: 0.85, moonVis: 0.25 },
  // ---- pagi (07:00) ----
  { h: 7.0, skyTop: 0xf3eee4, skyMid: 0xf5eeda, skyHorizon: 0xf9e9cd, skyBottom: 0xe9e1cf, fog: 0xf2ede3, sun: 0xffdd96, dir: 0xffefd0, dirI: 1.15, hemiS: 0xfffbeb, hemiG: 0xe9e1cf, hemiI: 0.92, amb: 0xffffff, ambI: 0.3, haloS: 0.8, haloM: 0, cloud: 0xffffff, cloudO: 0.95, star: 0, firefly: 0.15, sunArc: 0.3, moonArc: 1, sunVis: 1, moonVis: 0 },
  // ---- siang (12:00) — tampilan asli kertas terang ----
  { h: 12.0, skyTop: 0xfbf7ec, skyMid: 0xf5eeda, skyHorizon: 0xf7e9d3, skyBottom: 0xe9e1cf, fog: 0xf2ede3, sun: 0xffd98a, dir: 0xfff2d8, dirI: 1.25, hemiS: 0xfffbeb, hemiG: 0xe9e1cf, hemiI: 0.95, amb: 0xffffff, ambI: 0.3, haloS: 0.8, haloM: 0, cloud: 0xffffff, cloudO: 0.95, star: 0, firefly: 0, sunArc: 1, moonArc: 0, sunVis: 1, moonVis: 0 },
  // ---- sore (16:00): keemasan ----
  { h: 16.0, skyTop: 0xf6e0ba, skyMid: 0xf4d8a4, skyHorizon: 0xf4c98c, skyBottom: 0xe6cbab, fog: 0xf1ddbb, sun: 0xffbe6b, dir: 0xffdc9e, dirI: 1.1, hemiS: 0xfff3d8, hemiG: 0xe2d0b0, hemiI: 0.9, amb: 0xffffff, ambI: 0.3, haloS: 0.8, haloM: 0, cloud: 0xffe4c4, cloudO: 0.9, star: 0, firefly: 0, sunArc: 0.55, moonArc: 0, sunVis: 1, moonVis: 0 },
  // ---- senja (±18:00): coral + mauve ----
  { h: 17.9, skyTop: 0xb98bb0, skyMid: 0xe89a8e, skyHorizon: 0xf6b778, skyBottom: 0xd6a29c, fog: 0xdfb39a, sun: 0xff9955, dir: 0xffb37a, dirI: 0.9, hemiS: 0xffd9c0, hemiG: 0xc9a0a8, hemiI: 0.8, amb: 0xffe4d0, ambI: 0.32, haloS: 0.75, haloM: 0, cloud: 0xffc9b0, cloudO: 0.85, star: 0.1, firefly: 0.15, sunArc: 0.12, moonArc: 0, sunVis: 0.9, moonVis: 0 },
  // ---- magrib (±19:00) ----
  { h: 18.9, skyTop: 0x4a4a74, skyMid: 0x8a6a8c, skyHorizon: 0xd88a6a, skyBottom: 0x675a6c, fog: 0x7a6a80, sun: 0xff7a4d, dir: 0xd9a0c0, dirI: 0.55, hemiS: 0x8a8ab8, hemiG: 0x4a4a5e, hemiI: 0.68, amb: 0xc0b8d8, ambI: 0.36, haloS: 0.4, haloM: 0.35, cloud: 0x8a7a94, cloudO: 0.65, star: 0.55, firefly: 0.7, sunArc: 0.02, moonArc: 0.03, sunVis: 0.45, moonVis: 0.35 },
  // ---- malam kembali (20:30) ----
  { h: 20.5, skyTop: 0x1d2638, skyMid: 0x26324a, skyHorizon: 0x324058, skyBottom: 0x212b40, fog: 0x253049, sun: 0xf4efe2, dir: 0x9db8e8, dirI: 0.62, hemiS: 0x39445e, hemiG: 0x1d2331, hemiI: 0.62, amb: 0xaebbd8, ambI: 0.42, haloS: 0, haloM: 0.85, cloud: 0x3d465e, cloudO: 0.5, star: 1, firefly: 1, sunArc: 0, moonArc: 0.25, sunVis: 0, moonVis: 1 },
  // ---- lembar data duplikat jam 24 untuk interpolasi wrap ----
  { h: 24.0, skyTop: 0x1d2638, skyMid: 0x26324a, skyHorizon: 0x324058, skyBottom: 0x212b40, fog: 0x253049, sun: 0xf4efe2, dir: 0x9db8e8, dirI: 0.62, hemiS: 0x39445e, hemiG: 0x1d2331, hemiI: 0.62, amb: 0xaebbd8, ambI: 0.42, haloS: 0, haloM: 0.85, cloud: 0x3d465e, cloudO: 0.5, star: 1, firefly: 1, sunArc: 0, moonArc: 0.2, sunVis: 0, moonVis: 1 },
];

/* ---------- override debug ?jam=HH(.MM) — hanya tampilan lingkungan ---------- */
let overrideHour: number | null | undefined;

function getOverrideHour(): number | null {
  if (overrideHour !== undefined) return overrideHour;
  overrideHour = null;
  if (typeof window !== "undefined") {
    const v = new URLSearchParams(window.location.search).get("jam");
    if (v) {
      const parsed =
        v.includes(":")
          ? (() => {
              const [hh, mm] = v.split(":");
              return Number(hh) + Number(mm || 0) / 60;
            })()
          : Number(v);
      if (Number.isFinite(parsed)) {
        overrideHour = ((parsed % 24) + 24) % 24;
      }
    }
  }
  return overrideHour;
}

/** Jam saat ini sebagai desimal 0..24 (memakai override ?jam= bila ada). */
export function currentHour(): number {
  const ov = getOverrideHour();
  if (ov !== null) return ov;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Nama fase untuk HUD (bahasa Indonesia, player-facing). */
export function phaseName(hour: number): PhaseName {
  if (hour < 4.5) return "malam";
  if (hour < 6.2) return "fajar";
  if (hour < 10) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 17.4) return "sore";
  if (hour < 19.1) return "senja";
  return "malam";
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const lerpC = (a: number, b: number, t: number, out: THREE.Color) =>
  out.copy(tmpA.setHex(a)).lerp(tmpB.setHex(b), t);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolasi keadaan lingkungan pada jam tertentu (transisi mulus antar fase). */
export function sampleDayCycle(hour: number, out?: DayState): DayState {
  const state: DayState =
    out ??
    {
      skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyHorizon: new THREE.Color(), skyBottom: new THREE.Color(),
      fog: new THREE.Color(), sunColor: new THREE.Color(), dirColor: new THREE.Color(),
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), ambColor: new THREE.Color(),
      cloudTint: new THREE.Color(),
      dirIntensity: 0, hemiIntensity: 0, ambIntensity: 0,
      sunHaloOpacity: 0, moonHaloOpacity: 0, cloudOpacity: 0,
      starOpacity: 0, firefly: 0, sunArc: 0, moonArc: 0, sunVis: 0, moonVis: 0,
      phase: "siang",
    };

  const h = ((hour % 24) + 24) % 24;
  let k1 = KEYS[0];
  let k2 = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
      k1 = KEYS[i];
      k2 = KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, k2.h - k1.h);
  const t = (h - k1.h) / span;

  lerpC(k1.skyTop, k2.skyTop, t, state.skyTop);
  lerpC(k1.skyMid, k2.skyMid, t, state.skyMid);
  lerpC(k1.skyHorizon, k2.skyHorizon, t, state.skyHorizon);
  lerpC(k1.skyBottom, k2.skyBottom, t, state.skyBottom);
  lerpC(k1.fog, k2.fog, t, state.fog);
  lerpC(k1.sun, k2.sun, t, state.sunColor);
  lerpC(k1.dir, k2.dir, t, state.dirColor);
  lerpC(k1.hemiS, k2.hemiS, t, state.hemiSky);
  lerpC(k1.hemiG, k2.hemiG, t, state.hemiGround);
  lerpC(k1.amb, k2.amb, t, state.ambColor);
  lerpC(k1.cloud, k2.cloud, t, state.cloudTint);
  state.dirIntensity = lerpN(k1.dirI, k2.dirI, t);
  state.hemiIntensity = lerpN(k1.hemiI, k2.hemiI, t);
  state.ambIntensity = lerpN(k1.ambI, k2.ambI, t);
  state.sunHaloOpacity = lerpN(k1.haloS, k2.haloS, t);
  state.moonHaloOpacity = lerpN(k1.haloM, k2.haloM, t);
  state.cloudOpacity = lerpN(k1.cloudO, k2.cloudO, t);
  state.starOpacity = lerpN(k1.star, k2.star, t);
  state.firefly = lerpN(k1.firefly, k2.firefly, t);
  state.sunArc = lerpN(k1.sunArc, k2.sunArc, t);
  state.moonArc = lerpN(k1.moonArc, k2.moonArc, t);
  state.sunVis = lerpN(k1.sunVis, k2.sunVis, t);
  state.moonVis = lerpN(k1.moonVis, k2.moonVis, t);
  state.phase = phaseName(h);
  return state;
}
