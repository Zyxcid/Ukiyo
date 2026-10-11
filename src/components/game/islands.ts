import * as THREE from "three";
import { PALETTE, PLAYFUL, type PlatformCollider } from "./types";
import { buildDiorama, buildHubDiorama, withOutline, type Diorama } from "./structures";
import type { Project } from "@/lib/projects";

export interface IslandHandle {
  index: number;
  group: THREE.Group;
  collider: PlatformCollider;
  diorama: Diorama | null;
  /** bendera kunjungan (naik saat dikunjungi) */
  flag: THREE.Group;
  flagMat: THREE.MeshToonMaterial;
  flagRaised: boolean;
  bobPhase: number;
  baseY: number;
  label: THREE.Sprite;
}

/** PRNG deterministik supaya layout kepulauan selalu sama */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface IslandsResult {
  handles: IslandHandle[];
  colliders: PlatformCollider[];
  /** posisi spawn bintang di seluruh dunia */
  starSpots: THREE.Vector3[];
  update: (t: number, activeIndex: number | null) => void;
  setVisited: (index: number) => void;
  dispose: () => void;
  spawnPoint: THREE.Vector3;
}

/**
 * Kepulauan non-linear: satu pulau pusat besar + 10 pulau proyek besar
 * yang mengelilingi dalam ring dengan ketinggian bervariasi.
 * Rute ke tiap pulau lewat batu loncatan, ada jalan pintas antar-pulau,
 * dan pulau bonus tinggi untuk menguji skill double jump + dash.
 */
export function createIslands(scene: THREE.Scene, projects: Project[]): IslandsResult {
  const disposables: Array<{ dispose: () => void }> = [];
  const extraGroups: THREE.Group[] = [];
  const rand = mulberry32(424242);

  const toon = (color: number) => {
    const m = new THREE.MeshToonMaterial({ color });
    disposables.push(m);
    return m;
  };

  const handles: IslandHandle[] = [];
  const colliders: PlatformCollider[] = [];
  const starSpots: THREE.Vector3[] = [];

  // ================= penempatan =================
  const HUB_R = 7;
  interface Node {
    x: number;
    y: number;
    z: number;
    r: number;
    a: number;
  }
  const hub: Node = { x: 0, y: 0, z: 0, r: HUB_R, a: 0 };
  const nodes: Node[] = [];
  const heights = [0.5, 3.0, 5.0, 1.5, -1.5, 3.5, 5.5, 0, -2.0, 2.5];
  for (let i = 0; i < projects.length; i++) {
    const a = (i / projects.length) * Math.PI * 2 + (rand() - 0.5) * 0.22;
    const dist = 21 + rand() * 6;
    nodes.push({
      x: Math.sin(a) * dist,
      y: heights[i % heights.length],
      z: Math.cos(a) * dist,
      r: 4.8 + rand() * 1.6,
      a,
    });
  }

  // ================= label sprite paper-ink =================
  const makeLabel = (name: string, accent: string, isHome: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = 560;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#F7F2E6";
    ctx.beginPath();
    ctx.roundRect(8, 8, 544, 144, 30);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1C1813";
    ctx.stroke();

    // bar aksen kiri
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(8, 8, 26, 144, [14, 0, 0, 14]);
    ctx.fill();

    if (isHome) {
      ctx.save();
      ctx.translate(64, 80);
      ctx.fillStyle = "#F7B32B";
      ctx.strokeStyle = "#1C1813";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const b = ang + Math.PI / 5;
        ctx.lineTo(Math.cos(ang) * 20, Math.sin(ang) * 20);
        ctx.lineTo(Math.cos(b) * 9, Math.sin(b) * 9);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(64, 80, 13, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1C1813";
      ctx.stroke();
    }

    const label = name.length > 20 ? name.slice(0, 19) + "…" : name;
    ctx.fillStyle = "#1C1813";
    ctx.font = "700 54px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 96, 84);

    const tex = new THREE.CanvasTexture(canvas);
    disposables.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    disposables.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5.6, 1.6, 1);
    return sprite;
  };

  // ================= dasar pulau =================
  const grassMats = PALETTE.grass.map((c) => toon(c));
  const dirtMat = toon(PALETTE.dirt);
  const dirtDarkMat = toon(PALETTE.dirtDark);
  const flowerColors = [PLAYFUL.coral, PLAYFUL.lemon, PLAYFUL.berry, PLAYFUL.lavender];

  const buildIslandBase = (node: Node, r: number, decorLevel: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(node.x, node.y, node.z);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.96, 0.6, 12),
      grassMats[Math.floor(rand() * grassMats.length)]
    );
    top.position.y = -0.3;
    g.add(top);
    disposables.push(top.geometry);

    const under = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.82, r * 0.2, 2.6, 12),
      dirtMat
    );
    under.position.y = -1.9;
    g.add(under);
    disposables.push(under.geometry);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.3, 0.05, 1.4, 8),
      dirtDarkMat
    );
    tip.position.y = -3.9;
    g.add(tip);
    disposables.push(tip.geometry);

    if (decorLevel > 0) {
      for (let i = 0; i < decorLevel * 2; i++) {
        const a = rand() * Math.PI * 2;
        const d = r * (0.55 + rand() * 0.4);
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.3, 5),
          grassMats[0]
        );
        tuft.position.set(Math.sin(a) * d, 0.15, Math.cos(a) * d);
        tuft.rotation.z = (rand() - 0.5) * 0.5;
        g.add(tuft);
        disposables.push(tuft.geometry);
      }
      for (let i = 0; i < decorLevel + 1; i++) {
        const a = rand() * Math.PI * 2;
        const d = r * (0.5 + rand() * 0.45);
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5),
          grassMats[2]
        );
        stem.position.set(Math.sin(a) * d, 0.2, Math.cos(a) * d);
        g.add(stem);
        disposables.push(stem.geometry);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 8, 6),
          toon(flowerColors[Math.floor(rand() * flowerColors.length)])
        );
        head.position.set(Math.sin(a) * d, 0.45, Math.cos(a) * d);
        g.add(head);
        disposables.push(head.geometry);
      }
      for (let i = 0; i < 2; i++) {
        const pebble = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.2 + rand() * 0.25, 0),
          toon(PALETTE.rock)
        );
        const pa = rand() * Math.PI * 2;
        pebble.position.set(
          Math.sin(pa) * (r + 0.9 + rand()),
          -1.4 - rand() * 1.6,
          Math.cos(pa) * (r + 0.9 + rand())
        );
        pebble.rotation.set(rand(), rand(), 0);
        g.add(pebble);
        disposables.push(pebble.geometry);
      }
    }
    return g;
  };

  // bendera kunjungan (terlipat, naik saat pulau dikunjungi)
  const makeFlag = (accent: number) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6),
      toon(0x8a7a5e)
    );
    pole.position.y = 1.0;
    g.add(pole);
    disposables.push(pole.geometry);

    const flagMat = toon(accent);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.05), flagMat);
    withOutline(flag, 1.1);
    flag.position.set(0.35, 1.72, 0);
    g.add(flag);
    disposables.push(flag.geometry);
    g.scale.set(1, 0.02, 1);
    return { group: g, mat: flagMat };
  };

  // ================= pulau pusat =================
  {
    const g = buildIslandBase(hub, HUB_R, 2);
    scene.add(g);
    const diorama = buildHubDiorama(toon, disposables);
    diorama.group.position.set(0, 0, -0.8);
    g.add(diorama.group);

    const label = makeLabel("Beranda", "#E4572E", true);
    label.position.set(0, 4.6, 0);
    g.add(label);

    const fl = makeFlag(PLAYFUL.coral);
    fl.group.position.set(2.6, 0, -1.8);
    g.add(fl.group);

    const collider: PlatformCollider = {
      index: 0,
      cx: 0,
      cz: 0,
      radius: HUB_R,
      topY: 0,
      isIsland: true,
    };
    colliders.push(collider);
    handles.push({
      index: 0,
      group: g,
      collider,
      diorama,
      flag: fl.group,
      flagMat: fl.mat,
      flagRaised: false,
      bobPhase: rand() * Math.PI * 2,
      baseY: 0,
      label,
    });

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      starSpots.push(
        new THREE.Vector3(Math.sin(a) * 3.5, 1.4 + rand() * 1.2, Math.cos(a) * 3.5)
      );
    }
  }

  // ================= 10 pulau proyek =================
  nodes.forEach((node, i) => {
    const project = projects[i];
    const accent = parseInt(project.accent.slice(1), 16);
    const g = buildIslandBase(node, node.r, 2);
    g.rotation.y = node.a + Math.PI;
    scene.add(g);

    const diorama = buildDiorama(i, toon, disposables);
    diorama.group.position.set(0, 0, -0.9);
    g.add(diorama.group);

    const label = makeLabel(project.name, project.accent, false);
    label.position.set(0, 4.7, 0);
    g.add(label);

    const fl = makeFlag(accent);
    fl.group.position.set(node.r - 1.0, 0, -node.r + 1.6);
    g.add(fl.group);

    const collider: PlatformCollider = {
      index: i + 1,
      cx: node.x,
      cz: node.z,
      radius: node.r,
      topY: node.y,
      isIsland: true,
    };
    colliders.push(collider);
    handles.push({
      index: i + 1,
      group: g,
      collider,
      diorama,
      flag: fl.group,
      flagMat: fl.mat,
      flagRaised: false,
      bobPhase: rand() * Math.PI * 2,
      baseY: node.y,
      label,
    });

    starSpots.push(new THREE.Vector3(node.x, node.y + 1.8, node.z));
    for (let s = 0; s < 2; s++) {
      const a = node.a + Math.PI + (s === 0 ? 1.1 : -1.4);
      starSpots.push(
        new THREE.Vector3(
          node.x + Math.sin(a) * (node.r - 1.6),
          node.y + 1.0,
          node.z + Math.cos(a) * (node.r - 1.6)
        )
      );
    }
  });

  // ================= batu loncatan: pusat → tiap pulau =================
  const buildHopStone = (x: number, y: number, z: number, r: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.9, 0.42, 9),
      grassMats[Math.floor(rand() * grassMats.length)]
    );
    top.position.y = -0.21;
    g.add(top);
    disposables.push(top.geometry);
    const under = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.8, r * 0.15, 0.9, 8),
      dirtMat
    );
    under.position.y = -0.87;
    g.add(under);
    disposables.push(under.geometry);
    scene.add(g);
    extraGroups.push(g);

    colliders.push({ index: -1, cx: x, cz: z, radius: r, topY: y, isIsland: false });
    starSpots.push(new THREE.Vector3(x, y + 1.15, z));
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const dir = new THREE.Vector3(node.x - hub.x, 0, node.z - hub.z).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);

    const startX = hub.x + dir.x * (HUB_R + 3.6 + rand());
    const startZ = hub.z + dir.z * (HUB_R + 3.6 + rand());
    const endX = node.x - dir.x * (node.r + 3.4 + rand());
    const endZ = node.z - dir.z * (node.r + 3.4 + rand());
    const len = Math.hypot(endX - startX, endZ - startZ);
    const count = Math.max(2, Math.round(len / 5.6));

    for (let s = 0; s < count; s++) {
      const t = (s + 1) / (count + 1);
      const x = startX + (endX - startX) * t;
      const z = startZ + (endZ - startZ) * t;
      const y =
        hub.y + (node.y - hub.y) * t + Math.sin(t * Math.PI) * 1.5 + (rand() - 0.5) * 0.6;
      const side = (rand() - 0.5) * 2.2;
      buildHopStone(
        x + perp.x * side,
        y,
        z + perp.z * side,
        1.35 + rand() * 0.45
      );
    }
  }

  // ================= jalan pintas antar-pulau =================
  const pairs: Array<[number, number]> = [
    [0, 1],
    [3, 4],
    [6, 7],
  ];
  for (const [a, b] of pairs) {
    const na = nodes[a];
    const nb = nodes[b];
    const dir = new THREE.Vector3(nb.x - na.x, 0, nb.z - na.z).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const startX = na.x + dir.x * (na.r + 3.6);
    const startZ = na.z + dir.z * (na.r + 3.6);
    const endX = nb.x - dir.x * (nb.r + 3.6);
    const endZ = nb.z - dir.z * (nb.r + 3.6);
    for (let s = 0; s < 2; s++) {
      const t = (s + 1) / 3;
      const x = startX + (endX - startX) * t + perp.x * (s === 0 ? 2.2 : -2.0);
      const z = startZ + (endZ - startZ) * t + perp.z * (s === 0 ? 2.2 : -2.0);
      const y = na.y + (nb.y - na.y) * t + 2.6 + s * 1.2;
      buildHopStone(x, y, z, 1.3 + rand() * 0.3);
    }
  }

  // ================= pulau bonus tinggi (skill check) =================
  const bonusIslands = [1, 4, 6, 8, 9];
  for (const idx of bonusIslands) {
    const node = nodes[idx];
    const a = node.a + 0.6 + rand() * 0.8;
    const d = node.r + 6.5 + rand() * 2;
    const bx = node.x + Math.sin(a) * d;
    const bz = node.z + Math.cos(a) * d;
    const by = node.y + 3.4 + rand() * 1.4;

    buildHopStone(
      (node.x + bx) / 2 + (rand() - 0.5) * 2,
      (node.y + by) / 2 - 0.4,
      (node.z + bz) / 2 + (rand() - 0.5) * 2,
      1.4
    );

    const g = new THREE.Group();
    g.position.set(bx, by, bz);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.75, 0.45, 9),
      grassMats[1]
    );
    top.position.y = -0.22;
    g.add(top);
    disposables.push(top.geometry);
    const under = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 0.3, 1.1, 8),
      dirtMat
    );
    under.position.y = -1.0;
    g.add(under);
    disposables.push(under.geometry);

    const trophy = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.1, 4),
      toon(PLAYFUL.lemon)
    );
    withOutline(trophy, 1.1);
    trophy.position.y = 0.55;
    trophy.rotation.y = Math.PI / 4;
    g.add(trophy);
    disposables.push(trophy.geometry);
    scene.add(g);
    extraGroups.push(g);

    colliders.push({ index: -1, cx: bx, cz: bz, radius: 1.9, topY: by, isIsland: false });
    for (let s = 0; s < 3; s++) {
      const sa = (s / 3) * Math.PI * 2;
      starSpots.push(
        new THREE.Vector3(bx + Math.sin(sa) * 1.1, by + 1.3, bz + Math.cos(sa) * 1.1)
      );
    }
  }

  return {
    handles,
    colliders,
    starSpots,
    spawnPoint: new THREE.Vector3(0, 1.5, 2.5),
    update(t: number, activeIndex: number | null) {
      for (const h of handles) {
        h.group.position.y = h.baseY + Math.sin(t * 0.5 + h.bobPhase) * 0.12;
        h.collider.topY = h.group.position.y;
        h.diorama?.update?.(t);

        const targetScale = h.flagRaised ? 1 : 0.02;
        h.flag.scale.y += (targetScale - h.flag.scale.y) * 0.04;
        if (h.flagRaised) {
          h.flag.rotation.y = Math.sin(t * 1.8 + h.bobPhase) * 0.08;
        }

        h.label.position.y =
          (h.index === 0 ? 4.6 : 4.7) + Math.sin(t * 0.8 + h.bobPhase) * 0.1;
        const s = activeIndex === h.index ? 1.12 : 1.0;
        h.label.scale.set(5.6 * s, 1.6 * s, 1);
      }
    },
    setVisited(index: number) {
      const h = handles.find((x) => x.index === index);
      if (h) h.flagRaised = true;
    },
    dispose() {
      for (const h of handles) scene.remove(h.group);
      for (const g of extraGroups) scene.remove(g);
      for (const d of disposables) d.dispose();
    },
  };
}
