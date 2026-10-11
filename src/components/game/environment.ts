import * as THREE from "three";
import { PALETTE } from "./types";
import { currentHour, sampleDayCycle, type DayState } from "./daycycle";

export interface EnvironmentHandles {
  update: (t: number) => void;
  dispose: () => void;
}

/**
 * Lingkungan mengikuti JAM REALTIME pengunjung:
 * fajar → pagi → siang → sore → senja → malam (bintang, bulan, kunang-kunang).
 * Semua dihitung lokal di browser — tanpa server. Debug: ?jam=HH untuk memaksa jam.
 */
export function createEnvironment(scene: THREE.Scene): EnvironmentHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const state: DayState = sampleDayCycle(currentHour());

  // ---------- Langit (dome gradient — warnanya ikut jam) ----------
  const skyGeo = new THREE.SphereGeometry(240, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(PALETTE.skyTop) },
      midColor: { value: new THREE.Color(PALETTE.skyMid) },
      horizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
      bottomColor: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col;
        if (h > 0.25) col = mix(midColor, topColor, smoothstep(0.25, 0.75, h));
        else if (h > 0.0) col = mix(horizonColor, midColor, smoothstep(0.0, 0.25, h));
        else col = mix(horizonColor, bottomColor, smoothstep(0.0, 0.35, -h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  disposables.push(skyGeo, skyMat);

  // ---------- Cahaya (diperbarui tiap frame sesuai jam) ----------
  const hemi = new THREE.HemisphereLight(0xfffbeb, 0xe9e1cf, 0.95);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.25);
  sunLight.position.set(40, 70, -60);
  scene.add(sunLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  const fog = scene.fog as THREE.Fog | null;

  // ---------- Matahari (doodle: bola + cincin tinta) ----------
  // elevasi rendah agar tetap terlihat dari kamera platformer yang menghadap agak ke bawah
  const sunGroup = new THREE.Group();
  scene.add(sunGroup);

  const sunGeo = new THREE.SphereGeometry(10, 32, 24);
  const sunMat = new THREE.MeshBasicMaterial({
    color: PALETTE.sun,
    fog: false,
    transparent: true,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sunGroup.add(sun);
  disposables.push(sunGeo, sunMat);

  const ringGeo = new THREE.TorusGeometry(12.5, 0.9, 12, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x1c1813,
    fog: false,
    transparent: true,
  });
  const sunRing = new THREE.Mesh(ringGeo, ringMat);
  sunGroup.add(sunRing);
  disposables.push(ringGeo, ringMat);

  // halo hangat
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 256;
  const hctx = haloCanvas.getContext("2d")!;
  const grad = hctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, "rgba(255, 217, 138, 0.6)");
  grad.addColorStop(0.4, "rgba(255, 217, 138, 0.2)");
  grad.addColorStop(1, "rgba(255, 217, 138, 0)");
  hctx.fillStyle = grad;
  hctx.fillRect(0, 0, 256, 256);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(70, 70, 1);
  scene.add(halo);
  disposables.push(haloTex, haloMat);

  // ---------- Bulan (doodle: bola krem + cincin tinta + kawah) ----------
  const moonGroup = new THREE.Group();
  scene.add(moonGroup);

  const moonGeo = new THREE.SphereGeometry(10, 32, 24);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xf4efe2,
    fog: false,
    transparent: true,
  });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moonGroup.add(moon);
  disposables.push(moonGeo, moonMat);

  const moonRingGeo = new THREE.TorusGeometry(12.6, 0.85, 12, 64);
  const moonRingMat = new THREE.MeshBasicMaterial({
    color: 0x1c1813,
    fog: false,
    transparent: true,
  });
  const moonRing = new THREE.Mesh(moonRingGeo, moonRingMat);
  moonGroup.add(moonRing);
  disposables.push(moonRingGeo, moonRingMat);

  // kawah doodle (lingkaran kecil di sisi yang menghadap pemain)
  const craterMat = new THREE.MeshBasicMaterial({
    color: 0xd8d2c2,
    fog: false,
    transparent: true,
  });
  const craters: THREE.Mesh[] = [];
  const craterSpots: Array<[number, number, number]> = [
    [3.0, 2.8, 9.0],
    [-3.7, 0.7, 8.8],
    [0.7, -3.6, 8.9],
  ];
  for (const [cx, cy, cz] of craterSpots) {
    const cg = new THREE.SphereGeometry(1.05, 12, 8);
    const cm = new THREE.Mesh(cg, craterMat);
    cm.position.set(cx, cy, cz);
    moonGroup.add(cm);
    craters.push(cm);
    disposables.push(cg);
  }
  disposables.push(craterMat);

  // halo bulan (biru pucat)
  const mHaloCanvas = document.createElement("canvas");
  mHaloCanvas.width = mHaloCanvas.height = 256;
  const mctx = mHaloCanvas.getContext("2d")!;
  const mgrad = mctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  mgrad.addColorStop(0, "rgba(191, 211, 255, 0.5)");
  mgrad.addColorStop(0.4, "rgba(191, 211, 255, 0.16)");
  mgrad.addColorStop(1, "rgba(191, 211, 255, 0)");
  mctx.fillStyle = mgrad;
  mctx.fillRect(0, 0, 256, 256);
  const moonHaloTex = new THREE.CanvasTexture(mHaloCanvas);
  const moonHaloMat = new THREE.SpriteMaterial({
    map: moonHaloTex,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moonHalo = new THREE.Sprite(moonHaloMat);
  moonHalo.scale.set(70, 70, 1);
  scene.add(moonHalo);
  disposables.push(moonHaloTex, moonHaloMat);

  // posisi busur: az bergerak dalam rentang yang tetap terlihat dari kamera
  const arcPos = (
    arc: number,
    minAz: number,
    maxAz: number,
    yMin: number,
    yAmp: number,
    out: THREE.Vector3
  ) => {
    const az = minAz + (maxAz - minAz) * arc;
    const y = yMin + yAmp * Math.sin(Math.PI * Math.min(1, Math.max(0, arc)));
    const d = 125;
    return out.set(Math.sin(az) * d, y, -Math.cos(az) * d);
  };
  const sunP = new THREE.Vector3();
  const moonP = new THREE.Vector3();

  // ---------- Bintang langit (malam) ----------
  const starDotTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, "rgba(255, 250, 235, 1)");
    rg.addColorStop(0.35, "rgba(255, 250, 235, 0.9)");
    rg.addColorStop(1, "rgba(255, 250, 235, 0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(cv);
  })();
  disposables.push(starDotTex);

  interface StarLayer {
    pts: THREE.Points;
    mat: THREE.PointsMaterial;
    phase: number;
    rate: number;
  }
  const starLayers: StarLayer[] = [];
  const makeStarLayer = (count: number, size: number, rate: number) => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // sebar di kubah atas, radius 200–228
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        0.12 + Math.random() * 0.85,
        Math.random() * 2 - 1
      ).normalize();
      const r = 200 + Math.random() * 28;
      pos[i * 3] = dir.x * r;
      pos[i * 3 + 1] = dir.y * r;
      pos[i * 3 + 2] = dir.z * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: starDotTex,
      color: 0xfff6dc,
      size,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    disposables.push(geo, mat);
    starLayers.push({ pts, mat, phase: Math.random() * Math.PI * 2, rate });
  };
  makeStarLayer(260, 1.6, 1.4); // bintang kecil ramai
  makeStarLayer(70, 3.4, 2.2); // bintang terang besar

  // ---------- Awan doodle (tekstur kanvas dengan outline tinta) ----------
  const cloudTexture = () => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 128;
    const g = cv.getContext("2d")!;
    g.beginPath();
    g.moveTo(28, 92);
    g.quadraticCurveTo(30, 52, 80, 54);
    g.quadraticCurveTo(100, 26, 148, 40);
    g.quadraticCurveTo(200, 32, 214, 66);
    g.quadraticCurveTo(240, 74, 228, 92);
    g.closePath();
    g.fillStyle = "rgba(255, 253, 247, 0.95)";
    g.fill();
    g.strokeStyle = "#1C1813";
    g.lineWidth = 5;
    g.lineJoin = "round";
    g.stroke();
    return new THREE.CanvasTexture(cv);
  };

  interface Cloud {
    sp: THREE.Sprite;
    vx: number;
    range: number;
  }
  const clouds: Cloud[] = [];
  const cloudTex = cloudTexture();
  disposables.push(cloudTex);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: false,
    });
    const sp = new THREE.Sprite(m);
    const an = (i / 14) * Math.PI * 2 + 0.5;
    const d = 60 + Math.random() * 90;
    sp.scale.set(10 + Math.random() * 14, 5 + Math.random() * 6, 1);
    sp.position.set(
      Math.sin(an) * d,
      10 + Math.random() * 30,
      Math.cos(an) * d
    );
    scene.add(sp);
    disposables.push(m);
    clouds.push({ sp, vx: 0.25 + Math.random() * 0.5, range: d });
  }

  // ---------- Sparkles / kunang-kunang ----------
  // siang: konfeti warna-warni melayang • malam: kunang-kunang hangat
  const SPARKLE_COLORS = [0xe4572e, 0x7bc47f, 0xb8a7e8, 0xf6d55c, 0x6ec6ff];
  const SPARKLE_COUNT = 130;
  const sparkleData: Array<{
    base: THREE.Vector3;
    phase: number;
    color: number;
  }> = [];
  const sPos = new Float32Array(SPARKLE_COUNT * 3);
  const sColor = new Float32Array(SPARKLE_COUNT * 3);
  const c = new THREE.Color();
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const x = (Math.random() - 0.5) * 130;
    const y = Math.random() * 30 - 8;
    const z = (Math.random() - 0.5) * 130;
    const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
    sparkleData.push({ base: new THREE.Vector3(x, y, z), phase: Math.random() * Math.PI * 2, color });
    sPos[i * 3] = x;
    sPos[i * 3 + 1] = y;
    sPos[i * 3 + 2] = z;
    c.setHex(color);
    sColor[i * 3] = c.r;
    sColor[i * 3 + 1] = c.g;
    sColor[i * 3 + 2] = c.b;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute("color", new THREE.BufferAttribute(sColor, 3));
  const sMat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const sparkles = new THREE.Points(sGeo, sMat);
  scene.add(sparkles);
  disposables.push(sGeo, sMat);

  // warna rata untuk tint kunang-kunang (mengalikan warna vertex)
  const dayTint = new THREE.Color(0xffffff);
  const nightTint = new THREE.Color(0xffcf8a);

  return {
    update(t: number) {
      // ==== jam realtime → keadaan lingkungan (mulus tiap menit) ====
      sampleDayCycle(currentHour(), state);

      // langit
      skyMat.uniforms.topColor.value.copy(state.skyTop);
      skyMat.uniforms.midColor.value.copy(state.skyMid);
      skyMat.uniforms.horizonColor.value.copy(state.skyHorizon);
      skyMat.uniforms.bottomColor.value.copy(state.skyBottom);
      if (fog) fog.color.copy(state.fog);

      // cahaya
      hemi.color.copy(state.hemiSky);
      hemi.groundColor.copy(state.hemiGround);
      hemi.intensity = state.hemiIntensity;
      sunLight.color.copy(state.dirColor);
      sunLight.intensity = state.dirIntensity;
      ambient.color.copy(state.ambColor);
      ambient.intensity = state.ambIntensity;

      // matahari menyusuri busurnya (elevasi cukup tinggi agar lepas dari pulau)
      arcPos(state.sunArc, 0.05, 0.65, 26, 20, sunP);
      sunGroup.position.copy(sunP);
      sunGroup.lookAt(0, 0, 0);
      sunMat.color.copy(state.sunColor);
      sunMat.opacity = state.sunVis;
      ringMat.opacity = state.sunVis * 0.9;
      halo.position.copy(sunP);
      haloMat.opacity = state.sunHaloOpacity * (0.8 + 0.15 * Math.sin(t * 0.8));
      sunRing.rotation.z = t * 0.1;

      // bulan menyusuri busurnya
      arcPos(state.moonArc, -0.05, 0.9, 28, 22, moonP);
      moonGroup.position.copy(moonP);
      moonGroup.lookAt(0, 0, 0);
      moonMat.opacity = state.moonVis;
      moonRingMat.opacity = state.moonVis * 0.85;
      craterMat.opacity = state.moonVis;
      moonHalo.position.copy(moonP);
      moonHaloMat.opacity =
        state.moonHaloOpacity * (0.75 + 0.12 * Math.sin(t * 0.6 + 1.3));

      // cahaya utama datang dari matahari (siang) / bulan (malam)
      if (state.sunVis >= state.moonVis) sunLight.position.copy(sunP);
      else sunLight.position.copy(moonP);

      // bintang berkelip di langit malam
      for (const layer of starLayers) {
        layer.mat.opacity =
          state.starOpacity * (0.62 + 0.38 * Math.abs(Math.sin(t * layer.rate + layer.phase)));
      }

      // awan melayang pelan mengelilingi dunia + tint ikut jam
      for (const cl of clouds) {
        const cur = cl.sp.position;
        const ang = Math.atan2(cur.x, cur.z) + cl.vx * 0.001;
        cl.sp.position.x = Math.sin(ang) * cl.range;
        cl.sp.position.z = Math.cos(ang) * cl.range;
        (cl.sp.material as THREE.SpriteMaterial).color.copy(state.cloudTint);
        (cl.sp.material as THREE.SpriteMaterial).opacity = state.cloudOpacity;
      }

      // sparkles / kunang-kunang melayang lembut
      const arr = sGeo.getAttribute("position") as THREE.BufferAttribute;
      const nightBob = state.firefly;
      for (let i = 0; i < SPARKLE_COUNT; i++) {
        const p = sparkleData[i];
        arr.setXYZ(
          i,
          p.base.x + Math.sin(t * 0.5 + p.phase) * 1.8,
          p.base.y + Math.sin(t * 0.8 + p.phase * 1.6) * (1.1 + nightBob * 0.4),
          p.base.z + Math.cos(t * 0.6 + p.phase) * 1.8
        );
      }
      arr.needsUpdate = true;
      // siang: konfeti ceria • malam: kunang-kunang hangat berkedip pelan
      sMat.color.copy(dayTint).lerp(nightTint, state.firefly);
      sMat.size = 0.22 + 0.14 * state.firefly;
      sMat.opacity =
        (0.7 + 0.25 * Math.sin(t * 2.3)) * (1 - 0.35 * state.firefly) +
        state.firefly * (0.55 + 0.4 * Math.abs(Math.sin(t * 0.9 + 0.4)));
    },
    dispose() {
      scene.remove(sky, sunGroup, halo, moonGroup, moonHalo, sparkles);
      for (const layer of starLayers) scene.remove(layer.pts);
      for (const cl of clouds) scene.remove(cl.sp);
      for (const d of disposables) d.dispose();
    },
  };
}
