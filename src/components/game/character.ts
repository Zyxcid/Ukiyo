import * as THREE from "three";
import { PALETTE } from "./types";

export interface CharacterHandle {
  group: THREE.Group;
  /** bayangan blob di bawah karakter */
  shadow: THREE.Mesh;
  /** animasi & update per frame */
  update: (params: {
    dt: number;
    t: number;
    moving: boolean;
    speedNorm: number;
    grounded: boolean;
    gliding: boolean;
    dashing: boolean;
    targetYaw: number | null;
  }) => void;
  /** squash saat mendarat */
  onLand: () => void;
  /** front-flip 360 saat double jump */
  onDoubleJump: () => void;
  /** mainkan emote (id dari emotes.ts) — animasi prosedural */
  playEmote: (id: string, dur: number) => void;
  /** sisa waktu emote yang sedang bermain (0 = tidak ada) */
  emoteLeft: () => number;
  /** syal emas — hadiah semua bintang terkumpul */
  setScarfGold: (on: boolean) => void;
  dispose: () => void;
}

/**
 * Karakter burung kertas: badan telur krem, mata titik hitam,
 * paruh kecil oranye, sayap, kaki batang, satu ahoge.
 * Struktur: root (yaw) → flipGroup (flip double-jump) → bagian tubuh.
 */
export function createPaperBird(scene: THREE.Scene): CharacterHandle {
  const disposables: Array<{ dispose: () => void }> = [];

  const group = new THREE.Group();
  const flipGroup = new THREE.Group();
  group.add(flipGroup);

  const toon = (color: number) => {
    const m = new THREE.MeshToonMaterial({ color });
    disposables.push(m);
    return m;
  };

  const bodyMat = toon(PALETTE.charBody);
  const wingMat = toon(PALETTE.charWing);
  const darkMat = toon(PALETTE.charDark);
  const beakMat = toon(PALETTE.charBeak);

  // ---- badan: telur ----
  const bodyGeo = new THREE.SphereGeometry(0.34, 24, 20);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1, 1.28, 1);
  body.position.y = 0.52;
  flipGroup.add(body);
  disposables.push(bodyGeo);

  // ---- mata titik hitam ----
  const eyes: THREE.Mesh[] = [];
  const eyeGeo = new THREE.SphereGeometry(0.052, 12, 10);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14121a });
  disposables.push(eyeGeo, eyeMat);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.115 * sx, 0.63, 0.285);
    flipGroup.add(eye);
    eyes.push(eye);
  }

  // ---- paruh kecil ----
  const beakGeo = new THREE.ConeGeometry(0.06, 0.16, 10);
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.rotation.x = Math.PI * 0.52;
  beak.position.set(0, 0.52, 0.34);
  flipGroup.add(beak);
  disposables.push(beakGeo);

  // ---- sayap (pivot di bahu) ----
  const makeWing = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * side, 0.6, 0.02);
    const wingGeo = new THREE.SphereGeometry(0.16, 14, 12);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.set(0.55, 1.15, 0.8);
    wing.position.set(0.06 * side, -0.12, 0);
    wing.rotation.z = -0.35 * side;
    pivot.add(wing);
    disposables.push(wingGeo);
    flipGroup.add(pivot);
    return pivot;
  };
  const wingL = makeWing(-1);
  const wingR = makeWing(1);

  // ---- kaki batang ----
  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.11 * side, 0.26, 0);
    const legGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.26, 8);
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.y = -0.13;
    pivot.add(leg);
    const footGeo = new THREE.BoxGeometry(0.11, 0.035, 0.14);
    const foot = new THREE.Mesh(footGeo, darkMat);
    foot.position.set(0, -0.26, 0.04);
    pivot.add(foot);
    disposables.push(legGeo, footGeo);
    flipGroup.add(pivot);
    return pivot;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ---- ahoge ----
  const ahogeGeo = new THREE.CylinderGeometry(0.008, 0.004, 0.16, 6);
  const ahoge = new THREE.Mesh(ahogeGeo, wingMat);
  ahoge.position.set(0.03, 0.985, 0);
  ahoge.rotation.z = -0.28;
  flipGroup.add(ahoge);
  disposables.push(ahogeGeo);

  // ---- syal kecil warna aksen (biar semangat) ----
  const scarfGeo = new THREE.TorusGeometry(0.22, 0.05, 8, 16);
  const scarfMat = toon(PALETTE.accent);
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.42;
  flipGroup.add(scarf);
  disposables.push(scarfGeo);

  // ---- bayangan blob ----
  const shadowGeo = new THREE.CircleGeometry(0.42, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x1c1813,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);
  disposables.push(shadowGeo, shadowMat);

  scene.add(group);

  // ================= state animasi =================
  const bodyScale = body.scale.clone();
  let walkPhase = 0;
  let squash = 0;
  let blinkTimer = 2.5 + Math.random() * 2.5;
  let blinkT = -1;
  let smoothYaw = 0;
  let flipT = 0; // sisa waktu flip

  // state emote
  let emoteId: string | null = null;
  let emoteT = 0;
  let emoteDur = 1;

  // ---- utilitas gerak emote: easing + amplop naik/turun ----
  const easeInOutCubic = (p: number) =>
    p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  /** amplop: 0 → 1 di awal, tahan 1 di tengah, → 0 di akhir (pose menyatu
   *  halus dari & kembali ke pose netral — tidak ada lagi pose yang "menjumput") */
  const envelope = (p: number, rampIn = 0.16, rampOut = 0.2) =>
    clamp01(Math.min(p / rampIn, (1 - p) / rampOut));
  /** amplop khusus pose yang harus "tinggal" lama lalu pulih (mis. duduk) */
  const envelopeHold = (p: number, rampIn = 0.2, rampOut = 0.14) =>
    clamp01(Math.min(p / rampIn, (1 - p) / rampOut));

  return {
    group,
    shadow,
    update({ dt, t, moving, speedNorm, grounded, gliding, dashing, targetYaw }) {
      // --- rotasi badan menghadap arah gerak ---
      if (targetYaw !== null) {
        let diff = targetYaw - smoothYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        smoothYaw += diff * Math.min(1, 12 * dt);
        group.rotation.y = smoothYaw;
      }

      // --- flip double jump (front-flip 360°) ---
      if (flipT > 0) {
        flipT = Math.max(0, flipT - dt);
        const p = 1 - flipT / 0.5;
        flipGroup.rotation.x = p * Math.PI * 2;
      } else {
        flipGroup.rotation.x = 0;
      }

      // --- siklus jalan ---
      walkPhase += dt * (moving ? 8 + speedNorm * 6 : 0);
      const legSwing = moving ? Math.sin(walkPhase) * 0.85 : 0;
      legL.rotation.x = legSwing;
      legR.rotation.x = -legSwing;

      // --- badan: bob & napas ---
      const idleBreath = 1 + Math.sin(t * 2.1) * 0.02;
      const walkBob = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : 0;
      body.position.y = 0.52 + walkBob;
      // condong saat lari / dash
      const lean = dashing ? 0.38 : moving ? 0.1 * speedNorm : 0;
      body.rotation.x += (lean - body.rotation.x) * Math.min(1, 10 * dt);
      ahoge.rotation.z =
        -0.28 + Math.sin(t * 3.2) * 0.1 + (moving ? Math.sin(walkPhase * 2) * 0.15 : 0);

      // --- squash & stretch saat mendarat ---
      squash = Math.max(0, squash - dt * 5);
      const sq = squash * 0.35;
      body.scale.set(
        bodyScale.x * (1 + sq * 0.5),
        bodyScale.y * (1 - sq) * idleBreath,
        bodyScale.z * (1 + sq * 0.5)
      );

      // --- sayap ---
      if (dashing) {
        // sayap menyapu ke belakang saat dash
        wingL.rotation.z += (-1.15 - wingL.rotation.z) * Math.min(1, 12 * dt);
        wingR.rotation.z += (1.15 - wingR.rotation.z) * Math.min(1, 12 * dt);
      } else if (!grounded) {
        const flapSpeed = gliding ? 10 : 26;
        const flapAmp = gliding ? 0.9 : 0.7;
        const f = Math.sin(t * flapSpeed) * flapAmp;
        wingL.rotation.z = -(0.25 + f);
        wingR.rotation.z = 0.25 + f;
        legL.rotation.x = -0.45 + Math.sin(t * 8) * 0.08;
        legR.rotation.x = -0.3 + Math.sin(t * 8 + 1) * 0.08;
      } else {
        wingL.rotation.z += (0 - wingL.rotation.z) * Math.min(1, 8 * dt);
        wingR.rotation.z += (0 - wingR.rotation.z) * Math.min(1, 8 * dt);
      }

      // --- kedipan mata ---
      blinkTimer -= dt;
      if (blinkT < 0 && blinkTimer <= 0) {
        blinkT = 0;
        blinkTimer = 2.5 + Math.random() * 3.5;
      }
      if (blinkT >= 0) {
        blinkT += dt;
        const p = blinkT / 0.14;
        const s = p < 1 ? Math.max(0.08, 1 - Math.sin(p * Math.PI)) : 1;
        for (const e of eyes) e.scale.y = s;
        if (p >= 1) blinkT = -1;
      }

      // --- EMOTE (menimpa sebagian pose di atasnya) ---
      const prevEmote = emoteT;
      if (emoteT > 0) emoteT = Math.max(0, emoteT - dt);
      if (emoteId && prevEmote > 0 && emoteT <= 0) {
        // emote barus saja selesai — pulihkan pose yang tidak di-lerp otomatis
        emoteId = null;
        body.position.x = 0;
        flipGroup.rotation.y = 0;
        flipGroup.position.y = 0;
        body.rotation.z = 0;
        for (const e of eyes) e.scale.y = 1;
        legL.rotation.x = 0;
        legR.rotation.x = 0;
      }
      if (emoteId && emoteT > 0) {
        const p = 1 - emoteT / emoteDur; // progres 0..1
        const env = envelope(p);
        const hold = envelopeHold(p);
        switch (emoteId) {
          case "wave": {
            // dua sayap terangkat perlahan dulu, lalu mengibas bergantian
            const wig = Math.sin(t * 9) * 0.3;
            wingL.rotation.z = -(1.15 + wig) * env;
            wingR.rotation.z = (1.15 - wig) * env;
            body.rotation.z = Math.sin(t * 4.5) * 0.08 * env;
            body.position.y = 0.52 + Math.sin(t * 4.5) * 0.025 * env;
            ahoge.rotation.z = -0.28 + Math.sin(t * 9) * 0.18 * env;
            break;
          }
          case "dance": {
            // goyang pinggul + kepak selang-seling + kaki menepuk
            const beat = Math.sin(t * 6.3);
            const flap = Math.sin(t * 12);
            body.position.x = beat * 0.11 * env;
            body.position.y = 0.52 + Math.abs(beat) * 0.075 * env;
            body.rotation.z = beat * 0.13 * env;
            wingL.rotation.z = -(0.55 + flap * 0.62) * env;
            wingR.rotation.z = (0.55 - flap * 0.62) * env;
            legL.rotation.x = flap * 0.55 * env;
            legR.rotation.x = -flap * 0.55 * env;
            ahoge.rotation.z = -0.28 + flap * 0.4 * env;
            break;
          }
          case "spin": {
            // dua putaran penuh dengan easing (mulai-pelan → cepat → berhenti
            // mulus) + lompatan kecil di tengah putaran
            flipGroup.rotation.y = easeInOutCubic(p) * Math.PI * 4;
            flipGroup.position.y = Math.sin(p * Math.PI) * 0.5;
            wingL.rotation.z = -1.05 * env;
            wingR.rotation.z = 1.05 * env;
            break;
          }
          case "flip": {
            // salto ganda sebagai LOMPATAN sungguhan: busur naik-turun,
            // rotasi mengikuti busurnya (cepat di puncak), kaki melipat
            flipGroup.rotation.x = easeInOutCubic(p) * Math.PI * 4;
            flipGroup.position.y = Math.sin(p * Math.PI) * 0.62;
            wingL.rotation.z = -0.95 * env;
            wingR.rotation.z = 0.95 * env;
            legL.rotation.x = 0.9 * Math.sin(p * Math.PI);
            legR.rotation.x = 0.9 * Math.sin(p * Math.PI);
            break;
          }
          case "sit": {
            // merosot perlahan ke pose duduk, menahan, lalu bangun mulus
            const q = 1 - Math.pow(1 - hold, 3); // ease-out ke pose duduk
            body.position.y = 0.52 + (0.34 - 0.52) * q;
            body.scale.set(
              bodyScale.x * (1 + 0.12 * q),
              bodyScale.y * (1 - 0.26 * q) * idleBreath,
              bodyScale.z * (1 + 0.12 * q)
            );
            legL.rotation.x = 1.25 * q;
            legR.rotation.x = 1.25 * q;
            wingL.rotation.z = -0.55 * q;
            wingR.rotation.z = 0.55 * q;
            for (const e of eyes) e.scale.y = 1 - 0.9 * q; // merem santai
            ahoge.rotation.z = -0.05 + Math.sin(t * 1.6) * 0.06 * q;
            break;
          }
          case "hearts": {
            // lompat-lompat gembira dengan squash & stretch
            const hop = Math.abs(Math.sin(t * 3.6));
            body.position.y = 0.52 + hop * 0.17 * env;
            body.scale.set(
              bodyScale.x * (1 + 0.06 * (1 - hop) * env),
              bodyScale.y * (1 - 0.1 * (1 - hop) * env + 0.12 * hop * env) * idleBreath,
              bodyScale.z * (1 + 0.06 * (1 - hop) * env)
            );
            wingL.rotation.z = -(0.4 + Math.sin(t * 7) * 0.35) * env;
            wingR.rotation.z = (0.4 + Math.sin(t * 7) * 0.35) * env;
            body.rotation.z = Math.sin(t * 3.6) * 0.12 * env;
            break;
          }
          case "glitter": {
            // berputar tiga kali sambil naik pelan + terbang melayang turun
            flipGroup.rotation.y = easeInOutCubic(p) * Math.PI * 6;
            flipGroup.position.y = Math.sin(p * Math.PI) * 0.42;
            wingL.rotation.z = -1.3 * env;
            wingR.rotation.z = 1.3 * env;
            body.position.y = 0.52 + Math.abs(Math.sin(t * 10)) * 0.1 * env;
            ahoge.rotation.z = -0.28 + Math.sin(t * 10) * 0.3 * env;
            break;
          }
        }
      }
    },
    onLand() {
      squash = 1;
    },
    onDoubleJump() {
      flipT = 0.5;
    },
    playEmote(id: string, dur: number) {
      if (emoteId && emoteT > 0) return; // satu emote dalam satu waktu
      emoteId = id;
      emoteDur = Math.max(0.4, dur);
      emoteT = emoteDur;
      flipGroup.rotation.y = 0;
    },
    emoteLeft() {
      return emoteT;
    },
    setScarfGold(on: boolean) {
      scarfMat.color.set(on ? 0xf7b32b : PALETTE.accent);
    },
    dispose() {
      scene.remove(group, shadow);
      for (const d of disposables) d.dispose();
    },
  };
}
