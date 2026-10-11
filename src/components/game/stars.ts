import * as THREE from "three";

export interface StarHandle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  x: number;
  y: number;
  z: number;
  phase: number;
  taken: boolean;
  /** animasi terkumpul: >0 sedang bermain */
  collectAnim: number;
}

/** Tekstur bintang 5 titik gaya doodle (emas + outline tinta). */
export function starTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  g.translate(64, 64);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const b = a + Math.PI / 5;
    g.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
    g.lineTo(Math.cos(b) * 22, Math.sin(b) * 22);
  }
  g.closePath();
  g.fillStyle = "#F7B32B";
  g.fill();
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = "#1C1813";
  g.stroke();
  return new THREE.CanvasTexture(cv);
}

export interface StarsResult {
  stars: StarHandle[];
  total: number;
  /** cek & ambil bintang dekat pemain; return index bintang yang diambil atau -1 */
  tryCollect(px: number, py: number, pz: number): number;
  /** animasi bintang yang sedang terkumpul */
  update(dt: number, t: number): void;
  dispose(): void;
}

const COLLECT_RADIUS = 1.15;

export function createStars(scene: THREE.Scene, spots: THREE.Vector3[]): StarsResult {
  const tex = starTexture();
  const stars: StarHandle[] = [];

  for (const p of spots) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.62, 0.62, 1);
    sp.position.copy(p);
    scene.add(sp);
    stars.push({
      sprite: sp,
      material: mat,
      x: p.x,
      y: p.y,
      z: p.z,
      phase: Math.random() * Math.PI * 2,
      taken: false,
      collectAnim: 0,
    });
  }

  return {
    stars,
    total: stars.length,
    tryCollect(px, py, pz) {
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (s.taken) continue;
        const dx = s.x - px;
        const dy = s.y - py;
        const dz = s.z - pz;
        if (dx * dx + dy * dy + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
          s.taken = true;
          s.collectAnim = 0.001;
          return i;
        }
      }
      return -1;
    },
    update(dt, t) {
      for (const s of stars) {
        if (s.taken) {
          if (s.collectAnim > 0) {
            s.collectAnim += dt;
            const p = s.collectAnim / 0.4;
            if (p >= 1) {
              s.sprite.visible = false;
              s.collectAnim = 0;
            } else {
              s.sprite.position.y = s.y + p * 2.2;
              const sc = 0.62 * (1 + p * 1.6);
              s.sprite.scale.set(sc, sc, 1);
              s.material.opacity = 1 - p;
            }
          }
        } else {
          // melayang & berputar pelan
          s.sprite.position.y = s.y + Math.sin(t * 1.4 + s.phase) * 0.16;
          s.material.rotation = Math.sin(t * 1.1 + s.phase) * 0.35;
          const sc = 0.62 + Math.sin(t * 2 + s.phase) * 0.05;
          s.sprite.scale.set(sc, sc, 1);
        }
      }
    },
    dispose() {
      for (const s of stars) scene.remove(s.sprite);
      for (const s of stars) s.material.dispose();
      tex.dispose();
    },
  };
}
