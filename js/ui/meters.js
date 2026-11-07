// Метры уровня и спектроанализатор на выходе

export class LevelMeter {
  // canvas горизонтальный, getAnalyser() → AnalyserNode | null
  constructor(canvas, getAnalyser) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.get = getAnalyser;
    this.peak = 0; this.hold = 0; this.holdT = 0;
    this.buf = null;
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  draw() {
    const { canvas, g } = this;
    const w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    const an = this.get();
    let level = 0;
    if (an) {
      if (!this.buf || this.buf.length !== an.fftSize) this.buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(this.buf);
      for (let i = 0; i < this.buf.length; i++) level = Math.max(level, Math.abs(this.buf[i]));
    }
    // сглаживание
    this.peak = Math.max(level, this.peak * 0.86);
    if (this.peak >= this.hold) { this.hold = this.peak; this.holdT = performance.now(); }
    else if (performance.now() - this.holdT > 1200) this.hold *= 0.95;

    const db = 20 * Math.log10(Math.max(this.peak, 1e-5));
    const t = Math.max(0, Math.min(1, (db + 60) / 60)); // −60…0 дБ
    const x = t * (w - 4);
    const grad = g.createLinearGradient(2, 0, w - 2, 0);
    grad.addColorStop(0, '#3ddc84'); grad.addColorStop(0.7, '#ffd166'); grad.addColorStop(1, '#ff5252');
    g.fillStyle = grad;
    g.fillRect(2, 6, x, h - 12);
    // hold-линия
    const dbh = 20 * Math.log10(Math.max(this.hold, 1e-5));
    const th = Math.max(0, Math.min(1, (dbh + 60) / 60));
    g.fillStyle = '#e8edf5';
    g.fillRect(2 + th * (w - 4) - 1, 4, 2, h - 8);
    // шкала
    g.fillStyle = '#5a6272'; g.font = '8px monospace';
    for (const d of [-60, -40, -20, -12, -6, 0]) {
      const xx = 2 + ((d + 60) / 60) * (w - 4);
      g.fillRect(xx, h - 4, 1, 3);
    }
  }
}

export class Spectrum {
  constructor(canvas, getAnalyser) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.get = getAnalyser;
    this.data = null;
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  draw() {
    const { canvas, g } = this;
    const w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    const an = this.get();
    if (!an) return;
    if (!this.data || this.data.length !== an.frequencyBinCount) this.data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(this.data);
    const bars = 36, sr = an.context.sampleRate;
    g.fillStyle = '#43d6b5';
    for (let b = 0; b < bars; b++) {
      const f0 = 40 * Math.pow(20000 / 40, b / bars);
      const f1 = 40 * Math.pow(20000 / 40, (b + 1) / bars);
      const i0 = Math.floor((f0 / (sr / 2)) * this.data.length);
      const i1 = Math.max(i0 + 1, Math.floor((f1 / (sr / 2)) * this.data.length));
      let m = -100;
      for (let i = i0; i < i1 && i < this.data.length; i++) m = Math.max(m, this.data[i]);
      const t = Math.max(0, Math.min(1, (m + 90) / 90));
      const bw = w / bars;
      g.fillRect(b * bw + 1, h - 2 - t * (h - 4), bw - 2, t * (h - 4));
    }
  }
}
