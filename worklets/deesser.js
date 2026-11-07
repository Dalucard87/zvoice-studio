// Де-эссер: сплит-полоса + динамическое даверхение только высоких частот
import { Biquad, db2lin, lin2db } from './dsp.js';

class DeEsserProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { split: 5200, thr: -30, ratio: 4, maxRed: 10, attack: 1.5, release: 70, bypass: false };
    this.env = 0;
    this.gain = 1;
    this.lp = []; this.hp = [];
    this._apply();
    this.block = 0;
    this.port.onmessage = (e) => {
      if (e.data.params) { Object.assign(this.p, e.data.params); this._apply(); }
    };
  }
  _apply() {
    const sr = sampleRate, p = this.p;
    while (this.lp.length < 8) { this.lp.push(new Biquad()); this.hp.push(new Biquad()); }
    for (let i = 0; i < this.lp.length; i++) {
      this.lp[i].setLowpass(sr, p.split, 0.7071);
      this.hp[i].setHighpass(sr, p.split, 0.7071);
    }
    const atkSec = Math.max(p.attack, 0.05) * 0.001;
    const relSec = Math.max(p.release, 5) * 0.001;
    this.atkCoef = 1 - Math.exp(-1 / (atkSec * sr));
    this.relCoef = 1 - Math.exp(-1 / (relSec * sr));
    this.envRel = Math.exp(-1 / (0.03 * sr));
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const nch = out.length;
    if (!inp || !inp.length) { out.forEach((o) => o.fill(0)); return true; }
    const p = this.p, frames = out[0].length;
    let totalRed = 0;
    for (let i = 0; i < frames; i++) {
      // высокие частоты каждого канала
      let det = 0;
      for (let ch = 0; ch < nch; ch++) {
        const x = inp && inp.length ? inp[Math.min(ch, inp.length - 1)][i] : 0;
        det = Math.max(det, Math.abs(this.hp[ch].step(x)));
      }
      this.env = det > this.env ? det : this.env * this.envRel;
      const envDb = lin2db(this.env + 1e-9);
      let red = 0;
      if (envDb > p.thr) red = Math.min((envDb - p.thr) * (1 - 1 / p.ratio), p.maxRed);
      const target = db2lin(-red);
      if (target > this.gain) this.gain += (target - this.gain) * this.atkCoef;
      else this.gain += (target - this.gain) * this.relCoef;
      totalRed += red;
      for (let ch = 0; ch < nch; ch++) {
        const x = inp && inp.length ? inp[Math.min(ch, inp.length - 1)][i] : 0;
        const low = this.lp[ch].step(x);
        const high = x - low; // комплементарный верх (сумма = вход)
        out[ch][i] = low + high * this.gain;
      }
    }
    if ((this.block++ & 7) === 0) {
      this.port.postMessage({ type: 'meter', gr: +(-(totalRed / frames)).toFixed(1) });
    }
    return true;
  }
}
registerProcessor('deesser-proc', DeEsserProcessor);
