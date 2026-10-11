import * as THREE from "three";
import { withOutline, type DioramaBlocker } from "./structures";
import type { IslandHandle } from "./islands";

/**
 * Penghuni pulau: makhluk doodle kecil yang berkeliaran santai di pulaunya.
 * Pemain bisa menyapanya (tombol E / tombol BICARA di layar sentuh) —
 * mereka membalas dengan kalimat pendek lewat bubble.
 */

export interface NpcHandle {
  /** index pulau tempat NPC ini tinggal (0 = pulau pusat) */
  islandIndex: number;
  group: THREE.Group;
  /** posisi dunia — diperbarui tiap frame (pulau ikut mengambang) */
  worldPos: THREE.Vector3;
  /** animasi senang saat diajak bicara */
  excite: () => void;
}

export interface NpcsResult {
  npcs: NpcHandle[];
  update: (dt: number, t: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
}

/** Warna tubuh penghuni — lembut, ala referensi index.html (juga dipakai thumbnail doodle) */
export const NPC_COLOR_HEX = [
  "#7E9AA8",
  "#C26D4F",
  "#8A9B5C",
  "#D9A441",
  "#6E8577",
  "#B0575C",
  "#4F6D7A",
  "#A2798F",
  "#8A9B5C",
  "#C26D4F",
  "#6E8577",
];
const NPC_COLORS = NPC_COLOR_HEX.map((h) => parseInt(h.slice(1), 16));

/** PRNG deterministik supaya penghuni selalu sama */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NpcInternal extends NpcHandle {
  radius: number;
  speed: number;
  state: "idle" | "walk";
  idleT: number;
  target: THREE.Vector3;
  heading: number;
  hopV: number;
  hopY: number;
  exciteT: number;
  body: THREE.Mesh;
  legs: THREE.Mesh[];
  leaf: THREE.Group;
  shadow: THREE.Mesh;
  /** kotak bangunan di pulaunya (koordinat lokal pulau) — dihindari */
  blockers: DioramaBlocker[];
}

export function createNpcs(
  scene: THREE.Scene,
  handles: IslandHandle[],
  blockersByIsland: Map<number, DioramaBlocker[]> = new Map()
): NpcsResult {
  const disposables: Array<{ dispose: () => void }> = [];
  const npcs: NpcInternal[] = [];
  const rand = mulberry32(777);

  const toon = (color: number) => {
    const m = new THREE.MeshToonMaterial({ color });
    disposables.push(m);
    return m;
  };
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1c1813 });
  disposables.push(darkMat);

  const buildNpc = (
    handle: IslandHandle,
    localX: number,
    localZ: number,
    blockers: DioramaBlocker[]
  ): NpcInternal => {
    const color = NPC_COLORS[(handle.index + 1) % NPC_COLORS.length];
    const group = new THREE.Group();
    group.position.set(localX, 0, localZ);

    const bodyMat = toon(color);

    // badan: telur bulat kecil
    const bodyGeo = new THREE.SphereGeometry(0.26, 18, 14);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 1.15, 0.95);
    body.position.y = 0.3;
    withOutline(body, 1.09);
    group.add(body);
    disposables.push(bodyGeo);

    // mata titik
    const eyeGeo = new THREE.SphereGeometry(0.042, 10, 8);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, darkMat);
      eye.position.set(0.095 * sx, 0.36, 0.235);
      group.add(eye);
    }
    disposables.push(eyeGeo);

    // kaki kecil
    const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.16, 6);
    const legs: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.set(0.1 * sx, 0.08, 0);
      group.add(leg);
      legs.push(leg);
    }
    disposables.push(legGeo);

    // tunas daun di kepala
    const leaf = new THREE.Group();
    leaf.position.set(0, 0.62, 0);
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.16, 5);
    const stem = new THREE.Mesh(stemGeo, toon(0x8a9b5c));
    stem.position.y = 0.05;
    leaf.add(stem);
    disposables.push(stemGeo);
    const leafGeo = new THREE.SphereGeometry(0.09, 8, 6);
    leafGeo.scale(1, 0.45, 0.7);
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(leafGeo, toon(0x7bc47f));
      l.position.set(0.1 * sx, 0.14, 0);
      l.rotation.z = 0.5 * sx;
      withOutline(l, 1.12);
      leaf.add(l);
    }
    disposables.push(leafGeo);
    group.add(leaf);

    // bayangan blob kecil
    const shadowGeo = new THREE.CircleGeometry(0.22, 12);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1c1813,
      transparent: true,
      opacity: 0.16,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);
    disposables.push(shadowGeo, shadowMat);

    handle.group.add(group);

    const npc: NpcInternal = {
      islandIndex: handle.index,
      group,
      worldPos: new THREE.Vector3(),
      excite: () => {
        npc.exciteT = 1.4;
        if (npc.hopY <= 0.001) npc.hopV = 3.4;
      },
      radius: handle.collider.radius,
      speed: 0.9 + rand() * 0.5,
      state: "idle",
      idleT: 1 + rand() * 3,
      target: new THREE.Vector3(localX, 0, localZ),
      heading: rand() * Math.PI * 2,
      hopV: 0,
      hopY: 0,
      exciteT: 0,
      body,
      legs,
      leaf,
      shadow,
      blockers,
    };
    return npc;
  };

  // satu penghuni per pulau; pulau pusat dapat dua
  handles.forEach((handle) => {
    const count = handle.index === 0 ? 2 : 1;
    const blockers = blockersByIsland.get(handle.index) ?? [];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = handle.collider.radius * (0.25 + rand() * 0.35);
      const npc = buildNpc(
        handle,
        Math.sin(a) * d,
        Math.cos(a) * d - (handle.index === 0 ? 1.6 : 0),
        blockers
      );
      // kalau pulau pusat, penghuni kedua di sisi lain
      if (handle.index === 0 && i === 1) {
        npc.group.position.x = -Math.sin(a) * d;
        npc.group.position.z = 1.9;
      }
      npcs.push(npc);
    }
  });

  // tiap NPC: titik dunia di atas kepala untuk bubble
  const tmp = new THREE.Vector3();
  const playerV = new THREE.Vector3();

  /** Apakah titik (lokal pulau) menabrak kotak bangunan? */
  const hitBlocker = (
    b: DioramaBlocker[],
    lx: number,
    lz: number,
    pad: number
  ) => b.some((bl) => Math.abs(lx - bl.cx) < bl.hx + pad && Math.abs(lz - bl.cz) < bl.hz + pad);

  return {
    npcs,
    update(dt: number, t: number, playerPos: THREE.Vector3) {
      playerV.copy(playerPos);
      for (const n of npcs) {
        // ---- dunia: pulau mengambang → posisi dunia ikut group.parent ----
        n.group.getWorldPosition(tmp);
        n.worldPos.copy(tmp);

        const dx = playerV.x - n.worldPos.x;
        const dz = playerV.z - n.worldPos.z;
        const distToPlayer = Math.hypot(dx, dz);
        const playerNear = distToPlayer < 2.2 && Math.abs(playerV.y - n.worldPos.y) < 2;

        if (n.exciteT > 0) n.exciteT -= dt;

        if (playerNear) {
          // penasaran: berhenti & hadap pemain
          n.state = "idle";
          n.idleT = Math.max(n.idleT, 0.4);
          n.heading = Math.atan2(dx, dz);
          // lompat-lompat kecil saat dekat
          if (n.hopY <= 0.001 && Math.random() < dt * 1.2) {
            n.hopV = 3.2;
          }
        } else if (n.state === "idle") {
          n.idleT -= dt;
          if (n.idleT <= 0) {
            // pilih tujuan baru dalam pulau (hindari gedung bila ada)
            let tries = 0;
            while (tries < 4) {
              tries += 1;
              const a = Math.random() * Math.PI * 2;
              const d = n.radius * 0.15 + Math.random() * n.radius * 0.4;
              const px = n.group.position.x + Math.sin(a) * d;
              const pz = n.group.position.z + Math.cos(a) * d;
              if (Math.hypot(px, pz) < n.radius * 0.62) {
                if (hitBlocker(n.blockers, px, pz, 0.4)) continue; // jangan masuk gedung
                n.target.set(px, 0, pz);
                n.state = "walk";
                break;
              }
            }
            if (n.state !== "walk") n.idleT = 0.6 + Math.random() * 2.4;
          }
        } else {
          // berjalan santai ke tujuan (koordinat lokal pulau)
          const lx = n.target.x - n.group.position.x;
          const lz = n.target.z - n.group.position.z;
          const len = Math.hypot(lx, lz);
          if (len < 0.25) {
            n.state = "idle";
            n.idleT = 1.2 + Math.random() * 3;
          } else {
            const step = n.speed * dt;
            n.group.position.x += (lx / len) * step;
            n.group.position.z += (lz / len) * step;
            n.heading = Math.atan2(lx, lz);
            // pengaman: kalau terdorong masuk kotak gedung → keluarkan & berhenti
            for (const bl of n.blockers) {
              const ox = bl.hx + 0.35 - Math.abs(n.group.position.x - bl.cx);
              if (ox <= 0) continue;
              const oz = bl.hz + 0.35 - Math.abs(n.group.position.z - bl.cz);
              if (oz <= 0) continue;
              if (ox < oz) {
                n.group.position.x = bl.cx + (n.group.position.x >= bl.cx ? 1 : -1) * (bl.hx + 0.35);
              } else {
                n.group.position.z = bl.cz + (n.group.position.z >= bl.cz ? 1 : -1) * (bl.hz + 0.35);
              }
              n.state = "idle";
              n.idleT = 1 + Math.random() * 2;
            }
            // hop kecil berkala saat jalan
            if (n.hopY <= 0.001 && Math.random() < dt * 2.2) {
              n.hopV = 1.9;
            }
          }
        }

        // ---- fisika hop lokal ----
        if (n.hopY > 0 || n.hopV > 0) {
          n.hopV -= 14 * dt;
          n.hopY += n.hopV * dt;
          if (n.hopY <= 0) {
            n.hopY = 0;
            n.hopV = 0;
          }
        }

        // ---- animasi ----
        const walking = n.state === "walk";
        const bounce = walking ? Math.sin(t * 9 + n.worldPos.x) * 0.03 : 0;
        const excited = n.exciteT > 0 ? Math.sin(t * 14) * 0.06 : 0;
        const liftY = n.hopY + Math.max(0, bounce) + Math.max(0, excited);
        n.group.position.y = liftY;
        n.group.rotation.y = n.heading;

        // bayangan tetap menempel tanah pulau
        n.shadow.position.y = 0.02 - liftY;
        const shScale = Math.max(0.55, 1 - liftY * 0.8);
        n.shadow.scale.setScalar(shScale);

        // squash-stretch ringan
        const sq = 1 + n.hopY * 0.25;
        n.body.scale.set(1 / sq, 1.15 * sq, 0.95 / sq);

        // kaki mengayun saat jalan
        const swing = walking ? Math.sin(t * 9 + n.worldPos.x) * 0.35 : 0;
        n.legs[0].rotation.x = swing;
        n.legs[1].rotation.x = -swing;

        // tunas daun bergoyang
        n.leaf.rotation.z = Math.sin(t * 2.2 + n.worldPos.z) * 0.18 + (n.exciteT > 0 ? 0.25 : 0);
      }
    },
    dispose() {
      for (const n of npcs) n.group.parent?.remove(n.group);
      for (const d of disposables) d.dispose();
    },
  };
}
