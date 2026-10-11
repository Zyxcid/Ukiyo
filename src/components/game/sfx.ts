/**
 * SFX synth ringan via WebAudio — tanpa file audio.
 * Semua suara dibuat dari oscillator + noise buffer.
 * Context dibuat saat gesture pertama (tombol Mulai).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;

  /** Harus dipanggil dari event handler user (klik Mulai) */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);

      // noise buffer untuk whoosh/thud
      const len = this.ctx.sampleRate * 0.4;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  get isMuted() {
    return this.muted;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) {
      o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, vol: number, sweep = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq + sweep, t + dur);
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  jump() {
    this.tone(300, 0.16, "square", 0.05, 620);
  }
  doubleJump() {
    this.tone(420, 0.12, "square", 0.05, 840);
    this.tone(640, 0.14, "triangle", 0.04, 1080, 0.06);
  }
  dash() {
    this.noise(0.22, 900, 0.08, -500);
    this.tone(180, 0.18, "sawtooth", 0.028, 90);
  }
  land() {
    this.noise(0.1, 500, 0.06, -300);
  }
  fall() {
    this.tone(500, 0.5, "triangle", 0.05, 120);
  }
  visit() {
    this.tone(520, 0.1, "triangle", 0.05);
    this.tone(780, 0.14, "triangle", 0.05, undefined, 0.09);
  }
  /** balasan NPC: blip lembut dua nada */
  talk() {
    this.tone(430, 0.08, "sine", 0.05, 560);
    this.tone(620, 0.1, "sine", 0.045, 760, 0.08);
  }
  /** combo: 0..8 — nada naik mengikuti streak */
  collect(combo: number) {
    const base = 740 * Math.pow(2, Math.min(combo, 10) / 12);
    this.tone(base, 0.09, "triangle", 0.055);
    this.tone(base * 1.5, 0.13, "triangle", 0.045, undefined, 0.05);
  }
  /** emote: dua blip riang */
  emote() {
    this.tone(600, 0.09, "square", 0.04, 760);
    this.tone(880, 0.12, "square", 0.04, 1040, 0.07);
  }
  milestone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, "triangle", 0.05, undefined, i * 0.09));
  }
  allStars() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) =>
      this.tone(f, 0.2, "triangle", 0.055, undefined, i * 0.11)
    );
  }

  dispose() {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }
}
