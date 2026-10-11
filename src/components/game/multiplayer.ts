import * as THREE from "three";
import { PALETTE, PLAYFUL, type C4EventMsg, type C4Peer } from "./types";
import { emoteIconTexture } from "./emotes";
import type { PartySocket } from "partysocket";

/**
 * Multiplayer presence — "bertemu pengunjung lain".
 *
 * Prinsip rancang:
 *  - 100% OPSIONAL & degradasi halus: tanpa host/koneksi → game tetap jalan solo,
 *    tidak ada error yang terlihat pemain.
 *  - TANPA data tersimpan: identitas tamu (id + nama samaran) hanya hidup di memori
 *    tab saat ini — reload = tamu "baru".
 *  - Ringan: kirim posisi ~9×/detik (~100 byte/pesan), relai sederhana di server.
 *
 * Tamu lain digambar sebagai burung kertas dengan syal warna acak + label
 * nama samaran ("tamu 07"), diinterpolasi halus ke posisi terakhir dilaporkan.
 *
 * Selain posisi & emote, dua mainan pulau pusat ikut disinkronkan:
 *  - BOLA ("b"): tendangan di-broadcast lengkap dengan posisi + kecepatan —
 *    fisika bola deterministik, jadi lintasannya sama di semua klien.
 *  - CONNECT 4 ("c4"): protokol ringan hi/bye/pair/move/reset/state.
 *    Pemain yang membuka meja C4 mengirim heartbeat "hi" tiap 2 detik;
 *    dua pemain yang sama-sama membuka meja otomatis BERPASANGAN (AI penghuni
 *    dinonaktifkan di dua-duanya, warna ditentukan urutan id: id terkecil =
 *    merah). Lawan yang pergi (bye/timeout) → AI mengambil alih kembali.
 */

// ---------- tuning ----------
const SEND_INTERVAL = 0.11; // detik antar kirim posisi (~9 Hz)
const GHOST_TIMEOUT_MS = 8000; // tamu dianggap pergi bila senyap selama ini
const GHOST_CAP = 12; // maksimal hantu yang digambar (sisanya hanya dihitung)
const LERP_K = 10; // kecepatan interpolasi posisi hantu
const RECV_SAFE = { XY: 400, Y_MIN: -140, Y_MAX: 400 }; // jangkauan wajar posisi (termasuk interior y=-70)
const C4_HEARTBEAT = 2.0; // detik antar "aku masih di meja C4"
const C4_PEER_TIMEOUT_MS = 4500; // lawan C4 dianggap pergi bila senyap selama ini

/** 0 = di tanah · 1 = di udara · 2 = melayang (glide) · 3 = dash */
export type AirState = 0 | 1 | 2 | 3;

export interface OwnState {
  x: number;
  y: number;
  z: number;
  /** yaw karakter (radian) */
  ry: number;
  /** kecepatan ternormalisasi 0..1 */
  m: number;
  s: AirState;
}

export interface MultiplayerOptions {
  host: string;
  /** nama ruang — semua pengunjung situs masuk ruang yang sama */
  room?: string;
  /** jumlah tamu online (termasuk diri sendiri); 0 = tidak terhubung */
  onPresence?: (count: number) => void;
  /** tendangan bola dari tamu lain (sinkron fisika bola) */
  onBall?: (x: number, z: number, vx: number, vz: number) => void;
  /** pesan Connect 4 dari tamu lain */
  onC4?: (msg: C4EventMsg) => void;
  /** daftar tamu yang sedang di meja C4 berubah */
  onC4Peers?: (peers: C4Peer[]) => void;
}

interface Ghost {
  id: string;
  bird: THREE.Group;
  tag: THREE.Sprite;
  wingL: THREE.Group;
  wingR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  body: THREE.Mesh;
  // target interpolasi
  tx: number;
  ty: number;
  tz: number;
  tYaw: number;
  yaw: number;
  m: number;
  s: AirState;
  phase: number;
  lastSeen: number;
  // emote yang sedang dimainkan tamu ini
  emoteId: string | null;
  emoteT: number;
  emoteIcon: THREE.Sprite | null;
  /** bebaskan geometri/material/mesh hantu ini */
  dispose: () => void;
}

// warna syal tamu (indeks dikirim dalam pesan)
const SCARF_COLORS = [
  PLAYFUL.teal,
  PLAYFUL.coral,
  PLAYFUL.berry,
  PLAYFUL.lavender,
  PLAYFUL.tangerine,
  PLAYFUL.sky,
  PLAYFUL.mint,
  PLAYFUL.lemon,
  PLAYFUL.berry,
  PLAYFUL.teal,
];

function safeName(raw: unknown): string {
  if (typeof raw !== "string") return "tamu";
  // hanya alfanumerik, spasi, titik & strip — sisanya dibuang (anti nama aneh)
  const cleaned = raw.replace(/[^a-zA-Z0-9 .\-·]/g, "").trim();
  return cleaned.slice(0, 20) || "tamu";
}

function fin(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

/** Label nama samaran di atas kepala tamu (kanvas → sprite) */
function makeTag(name: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 88;
  const g = c.getContext("2d");
  if (g) {
    // kartu kertas + garis tinta ala label pulau
    const r = 16;
    g.beginPath();
    g.moveTo(r + 6, 6);
    g.arcTo(314, 6, 314, 82, r);
    g.arcTo(314, 82, 6, 82, r);
    g.arcTo(6, 82, 6, 6, r);
    g.arcTo(6, 6, 314, 6, r);
    g.closePath();
    g.fillStyle = "#F7F2E6";
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = "#1C1813";
    g.stroke();
    g.font = "italic 700 46px 'DM Serif Display', Georgia, serif";
    g.fillStyle = "#1C1813";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name, 160, 48);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.72, 0.47, 1);
  sp.position.y = 1.52;
  sp.renderOrder = 3;
  return sp;
}

export class Multiplayer {
  private scene: THREE.Scene | null = null;
  private ghosts = new Map<string, Ghost>();
  private socket: PartySocket | null = null;
  private sendT = 0;
  private connecting = false;
  private dead = false; // menyerah (host tidak tersedia) — mati permanen
  connected = false;

  /** tamu lain yang sedang membuka meja Connect 4 (heartbeat) */
  private c4Peers = new Map<string, { name: string; lastSeen: number }>();
  private c4Active = false;
  private c4BeatT = 0;
  private c4PeersSig = "";

  /** identitas sesi ini — hanya di memori, tanpa localStorage */
  readonly myId: string;
  readonly myName: string;
  readonly myScarf: number;

  private lastPresence = -1;

  constructor(private opts: MultiplayerOptions) {
    this.myId =
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
      ).replace(/-/g, "").slice(0, 10);
    this.myName = `tamu ${String(1 + Math.floor(Math.random() * 98)).padStart(2, "0")}`;
    this.myScarf = Math.floor(Math.random() * SCARF_COLORS.length);
  }

  // ================= koneksi =================

  private connect() {
    if (this.connecting || this.socket || this.dead || this.disposed) return;
    this.connecting = true;
    let fails = 0;
    void import("partysocket")
      .then(({ PartySocket: PS }) => {
        if (this.disposed || this.dead) {
          this.connecting = false;
          return;
        }
        const sock = new PS({
          host: this.opts.host,
          room: this.opts.room ?? "dunia",
          party: "main",
        });
        this.socket = sock;
        sock.addEventListener("open", () => {
          if (this.disposed) return;
          this.connecting = false;
          this.connected = true;
          fails = 0;
          this.sendT = SEND_INTERVAL; // kirim posisi pertama segera
          this.emitPresence();
        });
        sock.addEventListener("message", (ev: MessageEvent) => {
          this.onMessage(String(ev.data));
        });
        sock.addEventListener("close", () => {
          this.connected = false;
          this.emitPresence();
        });
        sock.addEventListener("error", () => {
          // host tidak pernah tersedia (belum di-deploy / offline) → berhenti mencoba
          fails += 1;
          if (fails >= 4) this.giveUp();
        });
      })
      .catch(() => {
        this.connecting = false;
        this.giveUp();
      });
  }

  private giveUp() {
    this.dead = true;
    this.connecting = false;
    try {
      this.socket?.close();
    } catch {
      /* diam saja */
    }
    this.socket = null;
    this.connected = false;
    this.emitPresence();
  }

  // ================= pesan =================

  private onMessage(raw: string) {
    if (this.disposed) return;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const t = d.t;
    const id = typeof d.id === "string" ? d.id.slice(0, 40) : "";
    if (!id || id === this.myId) return; // pesan milik sendiri / tidak valid

    if (t === "bye") {
      this.removeGhost(id);
      if (this.c4Peers.delete(id)) this.emitC4Peers();
      return;
    }

    // ---- emote tamu lain ----
    if (t === "e") {
      const g = this.ghosts.get(id);
      if (g) {
        const emoteId =
          typeof d.e === "string" ? d.e.replace(/[^a-z]/g, "").slice(0, 12) : "";
        if (emoteId) this.playGhostEmote(g, emoteId);
      }
      return;
    }

    // ---- tendangan bola dari tamu lain ----
    if (t === "b") {
      this.opts.onBall?.(
        fin(d.x, -50, 50),
        fin(d.z, -50, 50),
        fin(d.vx, -20, 20),
        fin(d.vz, -20, 20)
      );
      return;
    }

    // ---- protokol Connect 4 ----
    if (t === "c4") {
      this.handleC4Message(d, id);
      return;
    }

    if (t !== "p") return;

    const now = performance.now();
    const existing = this.ghosts.get(id);
    if (existing) {
      existing.tx = fin(d.x, -RECV_SAFE.XY, RECV_SAFE.XY);
      existing.ty = fin(d.y, RECV_SAFE.Y_MIN, RECV_SAFE.Y_MAX);
      existing.tz = fin(d.z, -RECV_SAFE.XY, RECV_SAFE.XY);
      existing.tYaw = fin(d.ry, -Math.PI * 8, Math.PI * 8);
      existing.m = fin(d.m, 0, 1);
      existing.s = (Math.round(fin(d.s, 0, 3)) | 0) as AirState;
      existing.lastSeen = now;
      return;
    }
    if (this.ghosts.size >= GHOST_CAP) return; // cukup — sisanya hanya kehadiran
    this.spawnGhost(id, safeName(d.n), d);
  }

  private spawnGhost(id: string, name: string, d: Record<string, unknown>) {
    if (!this.scene) return;
    const scarf = SCARF_COLORS[Math.round(fin(d.c, 0, SCARF_COLORS.length - 1)) % SCARF_COLORS.length];

    const bird = new THREE.Group();
    const disposables: Array<{ dispose(): void }> = [];
    const toon = (color: number) => {
      const m = new THREE.MeshToonMaterial({ color });
      disposables.push(m);
      return m;
    };

    // ---- badan telur (miniatur burung kertas) ----
    const bodyGeo = new THREE.SphereGeometry(0.34, 18, 14);
    const body = new THREE.Mesh(bodyGeo, toon(PALETTE.charBody));
    body.scale.set(1, 1.28, 1);
    body.position.y = 0.52;
    bird.add(body);
    disposables.push(bodyGeo);

    // ---- mata titik ----
    const eyeGeo = new THREE.SphereGeometry(0.052, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14121a });
    disposables.push(eyeGeo, eyeMat);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0.115 * sx, 0.63, 0.285);
      bird.add(eye);
    }

    // ---- paruh ----
    const beakGeo = new THREE.ConeGeometry(0.06, 0.16, 10);
    const beak = new THREE.Mesh(beakGeo, toon(PALETTE.charBeak));
    beak.rotation.x = Math.PI * 0.52;
    beak.position.set(0, 0.52, 0.34);
    bird.add(beak);
    disposables.push(beakGeo);

    // ---- syal warna khas tamu ini ----
    const scarfGeo = new THREE.TorusGeometry(0.22, 0.05, 8, 14);
    const scarfMesh = new THREE.Mesh(scarfGeo, toon(scarf));
    scarfMesh.rotation.x = Math.PI / 2;
    scarfMesh.position.y = 0.42;
    bird.add(scarfMesh);
    disposables.push(scarfGeo);

    // ---- sayap (pivot di bahu) ----
    const wingGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const wingMat = toon(PALETTE.charWing);
    disposables.push(wingGeo);
    const makeWing = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * side, 0.6, 0.02);
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.scale.set(0.55, 1.15, 0.8);
      wing.position.set(0.06 * side, -0.12, 0);
      wing.rotation.z = -0.35 * side;
      pivot.add(wing);
      bird.add(pivot);
      return pivot;
    };
    const wingL = makeWing(-1);
    const wingR = makeWing(1);

    // ---- kaki batang ----
    const legGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.26, 8);
    const footGeo = new THREE.BoxGeometry(0.11, 0.035, 0.14);
    const darkMat = toon(PALETTE.charDark);
    disposables.push(legGeo, footGeo);
    const makeLeg = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.11 * side, 0.26, 0);
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.y = -0.13;
      pivot.add(leg);
      const foot = new THREE.Mesh(footGeo, darkMat);
      foot.position.set(0, -0.26, 0.04);
      pivot.add(foot);
      bird.add(pivot);
      return pivot;
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // ---- label nama samaran ----
    const tag = makeTag(name);
    bird.add(tag);

    const tx = fin(d.x, -RECV_SAFE.XY, RECV_SAFE.XY);
    const ty = fin(d.y, RECV_SAFE.Y_MIN, RECV_SAFE.Y_MAX);
    const tz = fin(d.z, -RECV_SAFE.XY, RECV_SAFE.XY);
    bird.position.set(tx, ty, tz);
    const yaw = fin(d.ry, -Math.PI * 8, Math.PI * 8);
    bird.rotation.y = yaw;
    this.scene.add(bird);

    const ghost: Ghost = {
      id,
      bird,
      tag,
      wingL,
      wingR,
      legL,
      legR,
      body,
      tx,
      ty,
      tz,
      tYaw: yaw,
      yaw,
      m: fin(d.m, 0, 1),
      s: (Math.round(fin(d.s, 0, 3)) | 0) as AirState,
      phase: Math.random() * 6,
      lastSeen: performance.now(),
      emoteId: null,
      emoteT: 0,
      emoteIcon: null,
      dispose: () => {
        this.scene?.remove(bird);
        (tag.material.map as THREE.Texture | null)?.dispose();
        tag.material.dispose();
        if (ghost.emoteIcon) {
          ghost.emoteIcon.material.dispose(); // tekstur ikon di-cache global — jangan dispose
        }
        for (const dp of disposables) dp.dispose();
      },
    };
    this.ghosts.set(id, ghost);
    this.emitPresence();
  }

  /** Tamu lain memutar emote → animasikan burung hantunya + ikon di atas kepala */
  private playGhostEmote(g: Ghost, emoteId: string) {
    g.emoteId = emoteId;
    g.emoteT = 2.2;
    if (!g.emoteIcon && this.scene) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      g.emoteIcon = new THREE.Sprite(mat);
      g.emoteIcon.scale.set(0.55, 0.55, 1);
      g.emoteIcon.renderOrder = 5;
      g.bird.add(g.emoteIcon);
    }
    if (g.emoteIcon) {
      const mat = g.emoteIcon.material as THREE.SpriteMaterial;
      mat.map = emoteIconTexture(emoteId);
      mat.needsUpdate = true;
      g.emoteIcon.position.set(0, 1.95, 0);
      g.emoteIcon.visible = true;
    }
  }

  private removeGhost(id: string) {
    const g = this.ghosts.get(id);
    if (!g) return;
    this.ghosts.delete(id);
    g.dispose();
    this.emitPresence();
  }

  // ================= Connect 4 (protokol lintas klien) =================

  /** Terima pesan c4: perbarui daftar pemain di meja, lalu teruskan ke UI */
  private handleC4Message(d: Record<string, unknown>, id: string) {
    const rawSub =
      typeof d.sub === "string" ? d.sub.replace(/[^a-z]/g, "") : "";
    if (
      rawSub !== "hi" && rawSub !== "bye" && rawSub !== "pair" &&
      rawSub !== "move" && rawSub !== "reset" && rawSub !== "state"
    ) {
      return; // sub tidak dikenal — abaikan
    }
    const sub: C4EventMsg["sub"] = rawSub;
    const now = performance.now();
    if (sub === "hi") {
      this.c4Peers.set(id, { name: safeName(d.n), lastSeen: now });
      this.emitC4Peers();
    } else if (sub === "bye") {
      if (this.c4Peers.delete(id)) this.emitC4Peers();
    } else if (this.c4Peers.has(id)) {
      // pesan aktif dari pemain di meja → segarkan umur heartbeat-nya
      this.c4Peers.get(id)!.lastSeen = now;
    }

    // teruskan isinya (klien UI yang memvalidasi & menerapkan)
    const ev: C4EventMsg = { sub, id };
    if (sub === "hi") ev.name = safeName(d.n);
    if (typeof d.red === "string") ev.red = d.red.slice(0, 40);
    if (typeof d.yellow === "string") ev.yellow = d.yellow.slice(0, 40);
    if (typeof d.col === "number") ev.col = Math.round(fin(d.col, -1, 7));
    if (typeof d.p === "number") ev.p = Math.round(fin(d.p, 1, 2)) === 2 ? 2 : 1;
    if (Array.isArray(d.cells)) ev.cells = d.cells as number[][];
    if (typeof d.turn === "number") ev.turn = d.turn === 2 ? 2 : 1;
    if (typeof d.paired === "boolean") ev.paired = d.paired;
    this.opts.onC4?.(ev);
  }

  private emitC4Peers(force = false) {
    const peers: C4Peer[] = [...this.c4Peers.entries()].map(([id, p]) => ({
      id,
      name: p.name,
    }));
    const sig = peers.map((p) => p.id).join(",");
    if (!force && sig === this.c4PeersSig) return;
    this.c4PeersSig = sig;
    this.opts.onC4Peers?.(peers);
  }

  /** UI membuka/menutup modal C4 — kirim hi/bye + kelola heartbeat */
  setC4Active(on: boolean) {
    if (this.c4Active === on) return;
    this.c4Active = on;
    if (on) {
      this.c4BeatT = 0; // kirim "hi" pertama segera
    } else {
      if (this.c4Peers.size > 0) {
        this.c4Peers.clear();
        this.emitC4Peers(true);
      }
      this.sendC4({ sub: "bye" });
    }
  }

  private emitPresence() {
    const count = this.connected ? this.ghosts.size + 1 : 0;
    if (count !== this.lastPresence) {
      this.lastPresence = count;
      this.opts.onPresence?.(count);
    }
  }

  // ================= loop per frame =================

  /** Dipanggil engine setiap frame dengan state pemain sendiri */
  update(dt: number, own: OwnState) {
    if (this.disposed) return;
    if (!this.socket && !this.dead) this.connect();

    // ---- kirim posisi ~9 Hz ----
    this.sendT += dt;
    if (this.connected && this.sendT >= SEND_INTERVAL) {
      this.sendT = 0;
      this.send(own);
    }

    // ---- heartbeat & pemangkasan meja Connect 4 ----
    const now = performance.now();
    if (this.c4Active && this.connected) {
      this.c4BeatT -= dt;
      if (this.c4BeatT <= 0) {
        this.c4BeatT = C4_HEARTBEAT;
        this.sendC4({ sub: "hi", n: this.myName });
      }
      let pruned = false;
      for (const [pid, p] of this.c4Peers) {
        if (now - p.lastSeen > C4_PEER_TIMEOUT_MS) {
          this.c4Peers.delete(pid);
          pruned = true;
        }
      }
      if (pruned) this.emitC4Peers();
    }

    // ---- interpolasi & animasi hantu ----
    const k = 1 - Math.exp(-LERP_K * dt);
    for (const g of this.ghosts.values()) {
      if (now - g.lastSeen > GHOST_TIMEOUT_MS) {
        this.removeGhost(g.id);
        continue;
      }
      g.bird.position.x += (g.tx - g.bird.position.x) * k;
      g.bird.position.y += (g.ty - g.bird.position.y) * k;
      g.bird.position.z += (g.tz - g.bird.position.z) * k;

      let dyaw = g.tYaw - g.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      g.yaw += dyaw * Math.min(1, 10 * dt);
      g.bird.rotation.y = g.yaw;

      // animasi ringan: jalan / kepak / dash
      g.phase += dt * (g.m > 0.15 ? 8 + g.m * 6 : 0);
      const air = g.s === 1 || g.s === 2;
      if (g.s === 3) {
        // sayap menyapu ke belakang
        g.wingL.rotation.z += (-1.15 - g.wingL.rotation.z) * Math.min(1, 10 * dt);
        g.wingR.rotation.z += (1.15 - g.wingR.rotation.z) * Math.min(1, 10 * dt);
      } else if (air) {
        const flapSpeed = g.s === 2 ? 10 : 24;
        const f = Math.sin(now * 0.001 * flapSpeed) * (g.s === 2 ? 0.9 : 0.7);
        g.wingL.rotation.z = -(0.25 + f);
        g.wingR.rotation.z = 0.25 + f;
        g.legL.rotation.x = -0.45;
        g.legR.rotation.x = -0.3;
      } else {
        g.wingL.rotation.z += (0 - g.wingL.rotation.z) * Math.min(1, 8 * dt);
        g.wingR.rotation.z += (0 - g.wingR.rotation.z) * Math.min(1, 8 * dt);
        const swing = g.m > 0.15 ? Math.sin(g.phase) * 0.85 : 0;
        g.legL.rotation.x = swing;
        g.legR.rotation.x = -swing;
      }
      // bob badan saat jalan
      g.body.position.y = 0.52 + (g.m > 0.15 ? Math.abs(Math.sin(g.phase)) * 0.05 : 0);
      // label ikut mengambang lembut
      g.tag.position.y = 1.52 + Math.sin(now * 0.002 + g.phase) * 0.03;

      // ---- emote hantu: ikon + animasi ringan (dengan amplop naik/turun) ----
      if (g.emoteT > 0) {
        g.emoteT -= dt;
        // amplop: pose menyatu halus di awal & akhir emote tamu
        const genv = Math.min(1, Math.min(2.2 - g.emoteT, g.emoteT) / 0.25);
        if (g.emoteIcon) {
          g.emoteIcon.position.y = 1.95 + Math.sin(now * 0.003) * 0.07;
          if (g.emoteT <= 0) g.emoteIcon.visible = false;
        }
        if (g.emoteId === "spin") {
          const p = 1 - g.emoteT / 2.2;
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          g.bird.rotation.y = g.yaw + e * Math.PI * 4;
        } else if (g.emoteId === "glitter") {
          const p = 1 - g.emoteT / 2.2;
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          g.bird.rotation.y = g.yaw + e * Math.PI * 6;
          g.body.position.y = 0.52 + Math.sin(p * Math.PI) * 0.35;
        } else {
          g.bird.rotation.y = g.yaw;
          if (g.emoteId === "dance") {
            g.body.position.x = Math.sin(now * 0.006) * 0.1 * genv;
            g.body.position.y = 0.52 + Math.abs(Math.sin(now * 0.006)) * 0.07 * genv;
            g.wingL.rotation.z = -(0.5 + Math.sin(now * 0.012) * 0.6) * genv;
            g.wingR.rotation.z = (0.5 + Math.sin(now * 0.012 + Math.PI) * 0.6) * genv;
          } else if (g.emoteId === "hearts") {
            g.body.position.y = 0.52 + Math.abs(Math.sin(now * 0.004)) * 0.16 * genv;
          } else if (g.emoteId === "sit") {
            g.body.position.y = 0.52 - 0.18 * genv;
            g.legL.rotation.x = 1.2 * genv;
            g.legR.rotation.x = 1.2 * genv;
          } else if (g.emoteId === "wave") {
            g.wingL.rotation.z = -(1.15 + Math.sin(now * 0.009) * 0.3) * genv;
            g.wingR.rotation.z = (1.15 - Math.sin(now * 0.009) * 0.3) * genv;
          }
        }
      } else {
        // pulihkan pose yang pernah diubah emote (badan bergeser goyang dansa)
        g.body.position.x *= Math.max(0, 1 - 6 * dt);
      }
    }
  }

  private send(own: OwnState) {
    const msg = JSON.stringify({
      t: "p",
      id: this.myId,
      n: this.myName,
      c: this.myScarf,
      x: +own.x.toFixed(2),
      y: +own.y.toFixed(2),
      z: +own.z.toFixed(2),
      ry: +own.ry.toFixed(2),
      m: +own.m.toFixed(2),
      s: own.s,
    });
    try {
      this.socket?.send(msg);
    } catch {
      // koneksi sedang drop — reconnect ditangani partysocket
    }
  }

  /** Broadcast emote ke tamu lain (satu pesan, sekali jalan) */
  sendEmote(emoteId: string) {
    if (!this.connected || !this.socket) return;
    const msg = JSON.stringify({
      t: "e",
      id: this.myId,
      e: emoteId.replace(/[^a-z]/g, "").slice(0, 12),
    });
    try {
      this.socket.send(msg);
    } catch {
      /* diam saja */
    }
  }

  /** Broadcast tendangan bola (posisi + kecepatan) ke tamu lain */
  sendBall(x: number, z: number, vx: number, vz: number) {
    if (!this.connected || !this.socket) return;
    const msg = JSON.stringify({
      t: "b",
      id: this.myId,
      x: +x.toFixed(2),
      z: +z.toFixed(2),
      vx: +vx.toFixed(2),
      vz: +vz.toFixed(2),
    });
    try {
      this.socket.send(msg);
    } catch {
      /* diam saja */
    }
  }

  /** Kirim pesan protokol Connect 4 (sub + isinya; id ditambah otomatis) */
  sendC4(extra: Record<string, unknown>) {
    if (!this.connected || !this.socket || this.disposed) return;
    try {
      this.socket.send(JSON.stringify({ t: "c4", id: this.myId, ...extra }));
    } catch {
      /* diam saja */
    }
  }

  // ================= daur hidup =================

  attach(scene: THREE.Scene) {
    this.scene = scene;
  }

  private disposed = false;

  getDebug() {
    return {
      connected: this.connected,
      dead: this.dead,
      ghosts: this.ghosts.size,
      presence: this.connected ? this.ghosts.size + 1 : 0,
      id: this.myId,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.c4Active) {
      this.c4Active = false;
      this.c4Peers.clear();
      this.emitC4Peers(true);
    }
    try {
      this.socket?.send(JSON.stringify({ t: "bye", id: this.myId }));
    } catch {
      /* koneksi mungkin sudah mati */
    }
    try {
      this.socket?.close();
    } catch {
      /* diam saja */
    }
    this.socket = null;
    this.connected = false;
    for (const id of [...this.ghosts.keys()]) this.removeGhost(id);
    this.scene = null;
    this.emitPresence();
  }
}
