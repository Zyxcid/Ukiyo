/**
 * InputManager: keyboard (WASD/arrow/spasi), drag pointer untuk kamera,
 * dan API publik untuk joystick virtual + tombol lompat dari React.
 */
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export class InputManager {
  private keys = new Set<string>();

  // joystick virtual (diisi komponen React)
  joystick = { x: 0, y: 0, active: false };
  jumpHeldTouch = false;

  // kamera (yaw/pitch diubah lewat drag; engine membacanya)
  camYaw = 0;
  camPitch = 0.38;
  camDist = 10;
  dragging = false;
  /** waktu (ms) sejak terakhir kali user men-drag kamera */
  lastDragTime = 0;

  private jumpBufferT = 0;
  private dashBufferT = 0;
  private lastX = 0;
  private lastY = 0;
  private pinchStartDist = 0;

  /** Input game aktif? Dimatikan saat overlay UI (daftar pulau, kartu kendali) terbuka
   *  agar scroll/keyboard/gesture UI tidak dicuri engine. */
  enabled = true;

  /** Dipanggil saat tombol Start (daftar pulau) ditekan — diset oleh UI React */
  onListKey: (() => void) | null = null;
  /** Dipanggil saat tombol Select/Back (kartu kendali) ditekan — diset oleh UI React */
  onControlsKey: (() => void) | null = null;

  /** Gerak dari stik kiri gamepad (dibaca getMove) */
  private padMove = { x: 0, y: 0 };
  /** Tombol A ditahan (lompat / melayang) */
  private jumpHeldPad = false;
  /** Status tombol frame lalu — untuk deteksi tepi (baru ditekan) */
  private padPrev: boolean[] = [];

  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;

  /** Dipanggil saat tombol bicara (E) ditekan — diset oleh engine */
  onTalkKey: (() => void) | null = null;

  constructor(private element: HTMLElement) {
    this.onKeyDownBound = (e) => {
      if (!this.enabled) return; // biarkan key native (mis. spasi menscroll daftar)
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
      }
      if (k === " " && !this.keys.has(" ")) {
        this.jumpBufferT = 0.15; // jump buffer (agar tekanan sedikit awal tetap dihitung)
      }
      if ((k === "shift" || k === "k") && !this.keys.has(k)) {
        this.dashBufferT = 0.2;
      }
      if (k === "e" && !this.keys.has(k)) {
        this.onTalkKey?.();
      }
      this.keys.add(k);
    };
    this.onKeyUpBound = (e) => this.keys.delete(e.key.toLowerCase());
    this.onBlurBound = () => this.keys.clear();

    window.addEventListener("keydown", this.onKeyDownBound, { passive: false });
    window.addEventListener("keyup", this.onKeyUpBound);
    window.addEventListener("blur", this.onBlurBound);

    element.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("touchmove", this.onTouchPinch, { passive: false });
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.camYaw -= dx * 0.0042;
    this.camPitch = clamp(this.camPitch + dy * 0.0032, -0.42, 1.05);
    this.lastDragTime = performance.now();
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return; // JANGAN preventDefault — scroll overlay UI harus hidup
    e.preventDefault();
    this.camDist = clamp(this.camDist + e.deltaY * 0.008, 6, 15);
  };

  private onTouchPinch = (e: TouchEvent) => {
    if (!this.enabled) return; // gestur UI (scroll list) tetap native
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.pinchStartDist === 0) this.pinchStartDist = d;
      else {
        this.camDist = clamp(this.camDist - (d - this.pinchStartDist) * 0.02, 6, 15);
      }
    } else {
      this.pinchStartDist = 0;
    }
  };

  /** Aktif/matikan semua input — dipanggil engine saat overlay UI terbuka */
  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.dragging = false;
      this.pinchStartDist = 0;
      this.jumpBufferT = 0;
      this.dashBufferT = 0;
      this.jumpHeldTouch = false;
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
    }
  }

  /** Tombol lompat di layar sentuh */
  touchJumpPress() {
    this.jumpBufferT = 0.15;
    this.jumpHeldTouch = true;
  }
  touchJumpRelease() {
    this.jumpHeldTouch = false;
  }

  /** Tombol dash di layar sentuh */
  touchDashPress() {
    this.dashBufferT = 0.2;
  }

  /** Apakah ada permintaan lompat yang masih dibuffer? */
  peekJump(): boolean {
    return this.jumpBufferT > 0;
  }

  /** Habis-kan buffer lompat */
  consumeJump() {
    this.jumpBufferT = 0;
  }

  peekDash(): boolean {
    return this.dashBufferT > 0;
  }

  consumeDash() {
    this.dashBufferT = 0;
  }

  /** Vektor gerak gabungan keyboard + gamepad + joystick, dinormalisasi. y = maju. */
  getMove(): { x: number; y: number } {
    let x = this.padMove.x;
    let y = this.padMove.y;
    if (this.keys.has("w") || this.keys.has("arrowup")) y += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;

    if (this.joystick.active) {
      x += this.joystick.x;
      y += this.joystick.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get jumpHeld(): boolean {
    return this.keys.has(" ") || this.jumpHeldTouch || this.jumpHeldPad;
  }

  // ================= gamepad =================

  private activePad(): Gamepad | null {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected) return p;
    }
    return null;
  }

  private readPad(dt: number) {
    const pad = this.activePad();
    if (!pad) {
      this.padPrev = [];
      this.jumpHeldPad = false;
      this.padMove.x = 0;
      this.padMove.y = 0;
      return;
    }
    const prev = this.padPrev;
    const b = (i: number) => pad.buttons[i]?.pressed ?? false;
    const justPressed = (i: number) => b(i) && !prev[i];

    // ---- stik kiri / d-pad: gerak (deadzone radial + rescale agar halus) ----
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const len = Math.hypot(lx, ly);
    let mx = 0;
    let my = 0;
    if (len > 0.18) {
      const k = Math.min((len - 0.18) / 0.82, 1) / len;
      mx = lx * k;
      my = -ly * k; // stik dorong ke atas (nilai negatif) = maju
    }
    if (b(12)) my = 1; // d-pad atas
    if (b(13)) my = -1; // d-pad bawah
    if (b(14)) mx = -1; // d-pad kiri
    if (b(15)) mx = 1; // d-pad kanan
    this.padMove.x = mx;
    this.padMove.y = my;

    // ---- aksi gameplay (hanya saat input aktif) ----
    if (this.enabled) {
      // stik kanan: kamera
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.22) {
        this.camYaw -= rx * 2.6 * dt;
        this.camPitch = clamp(this.camPitch + ry * 1.8 * dt, -0.42, 1.05);
        this.lastDragTime = performance.now();
      }
      if (justPressed(0)) this.jumpBufferT = 0.15; // A / Cross — lompat
      if (justPressed(1) || justPressed(2)) this.dashBufferT = 0.2; // B / X — dash
      if (justPressed(3)) this.onTalkKey?.(); // Y / Triangle — sapa
    }
    this.jumpHeldPad = b(0); // tahan A saat jatuh = melayang

    // ---- tombol UI: tetap bekerja walau overlay terbuka ----
    if (justPressed(9)) this.onListKey?.(); // Start — daftar pulau
    if (justPressed(8)) this.onControlsKey?.(); // Select/Back — kartu kendali

    this.padPrev = pad.buttons.map((btn) => btn.pressed);
  }

  /** Getaran halus — diabaikan bila gamepad tidak mendukung */
  rumble(strength: number, ms: number) {
    if (this.padPrev.length === 0) return; // tidak ada gamepad aktif
    const pad = this.activePad() as (Gamepad & {
      vibrationActuator?: {
        playEffect?: (
          type: "dual-rumble",
          opts: { duration: number; strongMagnitude: number; weakMagnitude: number }
        ) => Promise<unknown>;
      };
    }) | null;
    try {
      void pad?.vibrationActuator?.playEffect?.("dual-rumble", {
        duration: ms,
        strongMagnitude: strength,
        weakMagnitude: strength * 0.7,
      });
    } catch {
      // sebagian browser/gamepad tidak mendukung getaran — diam saja
    }
  }

  tick(dt: number) {
    this.readPad(dt);
    if (this.jumpBufferT > 0) this.jumpBufferT -= dt;
    if (this.dashBufferT > 0) this.dashBufferT -= dt;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    window.removeEventListener("blur", this.onBlurBound);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("touchmove", this.onTouchPinch);
  }
}
