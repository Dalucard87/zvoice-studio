// Спектральный шумодав: STFT 1024, спектральное вычитание с полом,
// обучение профилю шума (кнопка «учить»), временное сглаживание гейнов
const N = 1024, HOP = N / 2, HALF = N / 2 + 1, MAX_LEARN = 300;

class FFT {
  constructor(n) {
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cosT = new Float64Array(n / 2); this.sinT = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      const a = (-2 * Math.PI * k) / n;
      this.cosT[k] = Math.cos(a); this.sinT[k] = Math.sin(a);
    }
  }
  forward(re, im) { this._t(re, im, false); }
  inverse(re, im) { this._t(re, im, true); const n = this.n; for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; } }
  _t(re, im, inv) {
    const { n, rev, cosT, sinT } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, stride = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * stride;
          const wr = cosT[k], wi = inv ? -sinT[k] : sinT[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

class DenoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fft = new FFT(N);
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    this.noise = new Float32Array(HALF);
    this.noiseSum = new Float32Array(HALF);
    this.noiseCnt = 0;
    this.learn = false;
    this.p = { strength: 2.2, floorDb: -28, smooth: 0.35, bypass: false };
    this.chans = [];
    this.block = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.params) Object.assign(this.p, d.params);
      if (d.cmd === 'learn-start') { this.learn = true; this.noiseSum.fill(0); this.noiseCnt = 0; }
      if (d.cmd === 'learn-stop') {
        this.learn = false;
        if (this.noiseCnt > 0) for (let k = 0; k < HALF; k++) this.noise[k] = this.noiseSum[k] / this.noiseCnt;
      }
      if (d.cmd === 'reset') { this.noise.fill(0); this.noiseSum.fill(0); this.noiseCnt = 0; }
      if (d.cmd === 'has-profile') this.port.postMessage({ type: 'profile', has: this.noiseCnt > 0 });
    };
  }
  _newChan() {
    return {
      buf: new Float32Array(N * 2), fill: 0,
      ola: new Float32Array(N),
      out: new Float32Array(16384), ow: 0, or: 0,
      re: new Float32Array(N), im: new Float32Array(N),
      smooth: new Float32Array(HALF).fill(1),
    };
  }
  _frame(st) {
    const { re, im } = st;
    const { win: W, fft } = this;
    const p = this.p;
    const floorLin = Math.pow(10, p.floorDb / 20);
    for (let i = 0; i < N; i++) { re[i] = st.buf[i] * W[i]; im[i] = 0; }
    fft.forward(re, im);
    for (let k = 0; k < HALF; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (this.learn && this.noiseCnt < MAX_LEARN) this.noiseSum[k] += mag;
      let g = 1;
      const nz = this.noise[k];
      if (!p.bypass && !this.learn && nz > 0 && this.noiseCnt > 0) {
        const sub = mag - p.strength * nz;
        g = mag > 1e-6 ? Math.max(floorLin, sub / mag) : floorLin;
      }
      const sm = p.smooth;
      st.smooth[k] = sm * st.smooth[k] + (1 - sm) * g;
      const gg = st.smooth[k];
      re[k] *= gg; im[k] *= gg;
      if (k > 0 && k < N / 2) { const m = N - k; re[m] *= gg; im[m] *= gg; }
    }
    if (this.learn && this.noiseCnt < MAX_LEARN) this.noiseCnt++;
    fft.inverse(re, im);
    for (let i = 0; i < N; i++) st.ola[i] += re[i] * W[i];
    for (let i = 0; i < HOP; i++) {
      st.out[st.ow] = st.ola[i];
      st.ow = (st.ow + 1) % st.out.length;
    }
    st.ola.copyWithin(0, HOP);
    st.ola.fill(0, HOP);
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const nch = out.length, frames = out[0].length;
    if (this.chans.length !== nch) this.chans = Array.from({ length: nch }, () => this._newChan());
    for (let ch = 0; ch < nch; ch++) {
      const st = this.chans[ch];
      const src = inp && inp.length ? inp[Math.min(ch, inp.length - 1)] : null;
      for (let i = 0; i < frames; i++) st.buf[st.fill++] = src ? src[i] : 0;
      while (st.fill >= N) {
        this._frame(st);
        st.buf.copyWithin(0, HOP, st.fill);
        st.fill -= HOP;
      }
    }
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < nch; ch++) {
        const st = this.chans[ch];
        const avail = (st.ow - st.or + st.out.length) % st.out.length;
        if (avail > 0) { out[ch][i] = st.out[st.or]; st.or = (st.or + 1) % st.out.length; }
        else out[ch][i] = 0;
      }
    }
    if ((this.block++ & 15) === 0) {
      let red = 0, cnt = 0;
      for (const st of this.chans) for (let k = 0; k < HALF; k += 16) { red += st.smooth[k]; cnt++; }
      const mean = cnt ? red / cnt : 1;
      this.port.postMessage({ type: 'meter', gr: +(20 * Math.log10(Math.max(mean, 1e-3))).toFixed(1) });
    }
    return true;
  }
}
registerProcessor('denoise-proc', DenoiseProcessor);
