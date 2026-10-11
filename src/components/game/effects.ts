import * as THREE from "three";
import { starTexture } from "./stars";

/**
 * Partikel pool: debu saat mendarat/melompat, burst bintang saat collect,
 * cincin saat double jump, dan trail saat dash.
 */
export interface EffectsResult {
  dust(x: number, y: number, z: number, n: number): void;
  burst(x: number, y: number, z: number): void;
  ring(x: number, y: number, z: number): void;
  trail(x: number, y: number, z: number): void;
  /** hati melayang (emote "hearts") */
  hearts(x: number, y: number, z: number): void;
  /** konfeti warna-warni (emote "glitter") */
  confetti(x: number, y: number, z: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** Tekstur hati doodle (emote "hearts") */
function heartTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  g.translate(32, 34);
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-20, -4, -11, -20, 0, -7);
  g.bezierCurveTo(11, -20, 20, -4, 0, 14);
  g.closePath();
  g.fillStyle = "#e4572e";
  g.fill();
  g.lineWidth = 6;
  g.lineJoin = "round";
  g.strokeStyle = "#1C1813";
  g.stroke();
  return new THREE.CanvasTexture(cv);
}

export function createEffects(scene: THREE.Scene): EffectsResult {
  // ---------- debu ----------
  interface Particle {
    mesh: THREE.Object3D;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    on: boolean;
    kind: "dust" | "trail";
  }
  const particles: Particle[] = [];
  const dustMat = new THREE.MeshBasicMaterial({
    color: 0xd9cfb8,
    transparent: true,
  });
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xf7f2e6,
    transparent: true,
  });
  const dustGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const trailGeo = new THREE.SphereGeometry(0.16, 8, 6);

  const makeParticle = (kind: "dust" | "trail") => {
    const mesh = new THREE.Mesh(kind === "dust" ? dustGeo : trailGeo, kind === "dust" ? dustMat : trailMat);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, on: false, kind });
  };
  for (let i = 0; i < 16; i++) makeParticle("dust");
  for (let i = 0; i < 14; i++) makeParticle("trail");

  // ---------- burst bintang ----------
  interface Burst {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    on: boolean;
  }
  const bursts: Burst[] = [];
  const sTex = starTexture();
  for (let i = 0; i < 28; i++) {
    const mat = new THREE.SpriteMaterial({ map: sTex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    scene.add(sp);
    bursts.push({ sprite: sp, material: mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, on: false });
  }

  // ---------- cincin ----------
  interface RingFx {
    mesh: THREE.Mesh;
    life: number;
    on: boolean;
  }
  const rings: RingFx[] = [];
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf7f2e6,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(0.5, 0.62, 24);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.visible = false;
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    rings.push({ mesh: m, life: 0, on: false });
  }

  // ---------- hati (emote) ----------
  interface FloatFx {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    on: boolean;
  }
  const floats: FloatFx[] = [];
  const heartTex = heartTexture();
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.scale.set(0.34, 0.34, 1);
    scene.add(sp);
    floats.push({ sprite: sp, material: mat, vx: 0, vy: 1, vz: 0, life: 0, maxLife: 1, on: false });
  }

  // ---------- konfeti (emote) ----------
  interface ConfettiFx {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    vx: number;
    vy: number;
    vz: number;
    spin: number;
    life: number;
    maxLife: number;
    on: boolean;
  }
  const confetti: ConfettiFx[] = [];
  const CONFETTI_COLORS = [0xe4572e, 0xf7b32b, 0x2ec4b6, 0xd95d9e, 0x6ec6ff, 0x7bc47f];
  const confettiGeo = new THREE.PlaneGeometry(0.14, 0.09);
  for (let i = 0; i < 26; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      side: THREE.DoubleSide,
      transparent: true,
    });
    const m = new THREE.Mesh(confettiGeo, material);
    m.visible = false;
    scene.add(m);
    confetti.push({ mesh: m, material, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, maxLife: 1, on: false });
  }

  return {
    dust(x, y, z, n) {
      let c = 0;
      for (const p of particles) {
        if (p.kind !== "dust" || p.on) continue;
        p.on = true;
        p.life = 0;
        p.maxLife = 0.3 + Math.random() * 0.25;
        p.mesh.visible = true;
        p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.05, z + (Math.random() - 0.5) * 0.4);
        p.vx = (Math.random() - 0.5) * 2.4;
        p.vz = (Math.random() - 0.5) * 2.4;
        p.vy = 0.8 + Math.random() * 1.6;
        if (++c >= n) break;
      }
    },
    burst(x, y, z) {
      let c = 0;
      for (const b of bursts) {
        if (b.on) continue;
        b.on = true;
        b.life = 0;
        b.maxLife = 0.35 + Math.random() * 0.2;
        b.sprite.visible = true;
        b.sprite.position.set(x, y, z);
        const an = Math.random() * Math.PI * 2;
        b.vx = Math.cos(an) * (1 + Math.random() * 1.8);
        b.vz = Math.sin(an) * (1 + Math.random() * 1.8);
        b.vy = 2 + Math.random() * 2.6;
        if (++c >= 7) break;
      }
    },
    ring(x, y, z) {
      for (const r of rings) {
        if (r.on) continue;
        r.on = true;
        r.life = 0;
        r.mesh.visible = true;
        r.mesh.position.set(x, y + 0.4, z);
        r.mesh.scale.setScalar(0.6);
        break;
      }
    },
    trail(x, y, z) {
      for (const p of particles) {
        if (p.kind !== "trail" || p.on) continue;
        p.on = true;
        p.life = 0;
        p.maxLife = 0.3;
        p.mesh.visible = true;
        p.mesh.position.set(x, y + 0.5, z);
        p.vx = 0;
        p.vy = 0.3;
        p.vz = 0;
        break;
      }
    },
    hearts(x, y, z) {
      let c = 0;
      for (const f of floats) {
        if (f.on) continue;
        f.on = true;
        f.life = 0;
        f.maxLife = 1.1 + Math.random() * 0.4;
        f.sprite.visible = true;
        f.sprite.position.set(
          x + (Math.random() - 0.5) * 0.7,
          y + 0.7 + Math.random() * 0.5,
          z + (Math.random() - 0.5) * 0.7
        );
        f.vx = (Math.random() - 0.5) * 0.8;
        f.vy = 0.9 + Math.random() * 0.7;
        f.vz = (Math.random() - 0.5) * 0.8;
        if (++c >= 6) break;
      }
    },
    confetti(x, y, z) {
      for (const f of confetti) {
        if (f.on) continue;
        f.on = true;
        f.life = 0;
        f.maxLife = 0.9 + Math.random() * 0.5;
        f.mesh.visible = true;
        f.mesh.position.set(x, y + 1.1, z);
        const an = Math.random() * Math.PI * 2;
        const sp = 1.4 + Math.random() * 2.2;
        f.vx = Math.cos(an) * sp;
        f.vz = Math.sin(an) * sp;
        f.vy = 2.6 + Math.random() * 2.4;
        f.spin = (Math.random() - 0.5) * 14;
      }
    },
    update(dt) {
      for (const p of particles) {
        if (!p.on) continue;
        p.life += dt;
        if (p.life > p.maxLife) {
          p.on = false;
          p.mesh.visible = false;
          continue;
        }
        if (p.kind === "dust") p.vy -= 5 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const k = Math.max(0.05, 1 - p.life / p.maxLife);
        p.mesh.scale.setScalar(p.kind === "dust" ? k : 1.6 * k + 0.2);
        ((p.mesh as THREE.Mesh).material as THREE.Material).opacity = k;
      }
      for (const b of bursts) {
        if (!b.on) continue;
        b.life += dt;
        if (b.life > b.maxLife) {
          b.on = false;
          b.sprite.visible = false;
          continue;
        }
        b.vy -= 8 * dt;
        b.sprite.position.x += b.vx * dt;
        b.sprite.position.y += b.vy * dt;
        b.sprite.position.z += b.vz * dt;
        const k = Math.max(0.01, 0.3 * (1 - b.life / b.maxLife));
        b.sprite.scale.set(k, k, 1);
        b.material.opacity = 1 - b.life / b.maxLife;
      }
      for (const r of rings) {
        if (!r.on) continue;
        r.life += dt;
        if (r.life > 0.4) {
          r.on = false;
          r.mesh.visible = false;
          continue;
        }
        const p = r.life / 0.4;
        r.mesh.scale.setScalar(0.6 + p * 3.2);
        ringMat.opacity = 0.9 * (1 - p);
      }
      for (const f of floats) {
        if (!f.on) continue;
        f.life += dt;
        if (f.life > f.maxLife) {
          f.on = false;
          f.sprite.visible = false;
          continue;
        }
        f.sprite.position.x += f.vx * dt;
        f.sprite.position.y += f.vy * dt;
        f.sprite.position.z += f.vz * dt;
        const k = 1 - f.life / f.maxLife;
        f.material.opacity = Math.min(1, k * 1.6);
        const s = 0.3 + (1 - k) * 0.12;
        f.sprite.scale.set(s, s, 1);
      }
      for (const f of confetti) {
        if (!f.on) continue;
        f.life += dt;
        if (f.life > f.maxLife) {
          f.on = false;
          f.mesh.visible = false;
          continue;
        }
        f.vy -= 4.4 * dt;
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.z += f.vz * dt;
        f.mesh.rotation.x += f.spin * dt;
        f.mesh.rotation.y += f.spin * 0.7 * dt;
        f.material.opacity = Math.min(1, (1 - f.life / f.maxLife) * 2.2);
      }
    },
    dispose() {
      for (const p of particles) scene.remove(p.mesh);
      for (const b of bursts) scene.remove(b.sprite);
      for (const r of rings) scene.remove(r.mesh);
      for (const f of floats) scene.remove(f.sprite);
      for (const f of confetti) scene.remove(f.mesh);
      for (const b of bursts) b.material.dispose();
      for (const f of floats) f.material.dispose();
      for (const f of confetti) f.material.dispose();
      dustMat.dispose();
      trailMat.dispose();
      dustGeo.dispose();
      trailGeo.dispose();
      ringMat.dispose();
      ringGeo.dispose();
      sTex.dispose();
      heartTex.dispose();
      confettiGeo.dispose();
    },
  };
}
