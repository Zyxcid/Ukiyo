/**
 * Progres pemain yang bertahan lintas reload browser (localStorage).
 *
 * Yang disimpan:
 *  - bintang yang sudah terkumpul (index bintang — urutannya deterministik
 *    karena layout kepulauan memakai PRNG berbibit tetap)
 *  - pulau yang sudah dikunjungi (benderanya naik lagi setelah reload)
 *  - lencana taman bermain (lihat playground.ts)
 *
 * maxStars & syal emas tetap disimpan di emotes.ts (kunci ukiyo:maxStars
 * dan ukiyo:goldScarf) — resetAllProgress() ikut membersihkannya.
 *
 * Semua akses dibungkus try/catch: kalau storage diblokir (mode privat
 * ketat dsb.) progres hanya hidup selama sesi — game tetap jalan.
 */

import { LS_GOLD_SCARF, LS_MAX_STARS } from "./emotes";

const LS_STARS = "ukiyo:stars";
const LS_VISITED = "ukiyo:visited";
const LS_BADGES = "ukiyo:badges";

function loadIntList(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is number => Number.isInteger(v) && v >= 0);
  } catch {
    return [];
  }
}

function saveIntList(key: string, list: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage bisa diblokir — progres hanya hidup sesi ini */
  }
}

// ================= bintang =================

/** Index bintang yang sudah terkumpul sepanjang masa (untuk dipulihkan) */
export function loadStars(): number[] {
  return loadIntList(LS_STARS);
}

export function saveStars(list: number[]) {
  saveIntList(LS_STARS, list);
}

// ================= pulau dikunjungi =================

/** Index pulau proyek (1..N) yang sudah pernah diinjak pemain */
export function loadVisited(): number[] {
  return loadIntList(LS_VISITED);
}

export function saveVisited(list: number[]) {
  saveIntList(LS_VISITED, list);
}

// ================= lencana taman bermain =================

/** Id lencana yang sudah dibuka (lihat BADGES di playground.ts) */
export function loadBadges(): string[] {
  try {
    const raw = localStorage.getItem(LS_BADGES);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function saveBadges(list: string[]) {
  try {
    localStorage.setItem(LS_BADGES, JSON.stringify(list));
  } catch {
    /* diam saja */
  }
}

// ================= reset total =================

/** Hapus SEMUA progres ukiyo (bintang, kunjungan, lencana, emote, syal).
 *  Pemanggil biasanya me-reload halaman setelah ini. */
export function resetAllProgress() {
  try {
    localStorage.removeItem(LS_STARS);
    localStorage.removeItem(LS_VISITED);
    localStorage.removeItem(LS_BADGES);
    localStorage.removeItem(LS_MAX_STARS);
    localStorage.removeItem(LS_GOLD_SCARF);
  } catch {
    /* diam saja */
  }
}
