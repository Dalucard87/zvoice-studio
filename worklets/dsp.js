// Общие DSP-функции для ворклетов (AudioWorklet модуль)
export const db2lin = (db) => Math.pow(10, db / 20);
export const lin2db = (v) => 20 * Math.log10(Math.max(v, 1e-9));

// RBJ biquad-фильтр (процесс на сэмпле)
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  _set(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  setLowpass(fs, f0, Q = 0.7071) {
    const w0 = 2 * Math.PI * Math.min(f0, fs * 0.45) / fs, c = Math.cos(w0), a = Math.sin(w0) / (2 * Q);
    this._set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + a, -2 * c, 1 - a);
  }
  setHighpass(fs, f0, Q = 0.7071) {
    const w0 = 2 * Math.PI * Math.min(f0, fs * 0.45) / fs, c = Math.cos(w0), a = Math.sin(w0) / (2 * Q);
    this._set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + a, -2 * c, 1 - a);
  }
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

// Кольцевой буфер-задержка (для lookahead)
export class DelayLine {
  constructor(maxN) { this.buf = new Float32Array(maxN); this.len = maxN; this.n = 0; this.w = 0; }
  setDelay(n) { this.n = Math.max(0, Math.min(n | 0, this.len - 1)); }
  step(x) { // читает сэмпл с задержкой n, пишет новый
    this.buf[this.w] = x;
    const y = this.buf[(this.w - this.n + this.len) % this.len];
    this.w = (this.w + 1) % this.len;
    return y;
  }
  clear() { this.buf.fill(0); }
}
