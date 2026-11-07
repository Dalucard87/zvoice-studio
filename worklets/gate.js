// Гейт: порог открывания, гистерезис, hold, attack/release, lookahead,
// детекция в речевой полосе (как в Advanced Gate из SETUP.md)
import { Biquad, DelayLine, db2lin, lin2db } from './dsp.js';

class GateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {
      openThr: -38, hyst: 7, range: -35, attack: 1, hold: 250,
      release: 100, lookahead: 5, detLow: 100, detHigh: 4000, detOn: true, bypass: false,
    };
    this.env = 0;
    this.gain = 1;
    this.open = false;
    this.holdN = 0;
    this.holdCnt = 0;
    this.delays = [];
    this.hp = new Biquad();
    this.lp = new Biquad();
    this._apply();
    this.block = 0;
    this.port.onmessage = (e) => {
      if (e.data.params) { Object.assign(this.p, e.data.params); this._apply(); }
    };
  }
  _apply() {
    const p = this.p, sr = sampleRate;
    this.hp.setHighpass(sr, p.detLow, 0.7071);
    this.lp.setLowpass(sr, p.detHigh, 0.7071);
    const atkSec = Math.max(p.attack, 0.05) * 0.001;
    const relSec = Math.max(p.release, 5) * 0.001;
    this.atkCoef = 1 - Math.exp(-1 / (atkSec * sr));
    this.relCoef = 1 - Math.exp(-1 / (relSec * sr));
    this.envRel = Math.exp(-1 / (0.06 * sr)); // внутреннее сглаживание детектора
    this.rangeLin = db2lin(p.range);
    const lookN = Math.round(Math.max(0, p.lookahead) * 0.001 * sr);
    while (this.delays.length < 8) this.delays.push(new DelayLine(4096));
    for (const d of this.delays) { d.setDelay(lookN); }
    this.holdN = Math.round(Math.max(0, p.hold) * 0.001 * sr);
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const nch = out.length;
    if (!inp || !inp.length) { out.forEach((o) => o.fill(0)); return true; }
    const p = this.p, frames = out[0].length;
    // моно-вход может дублироваться на оба выхода
    const src = [];
    for (let ch = 0; ch < nch; ch++) src.push(inp && inp.length ? inp[Math.min(ch, inp.length - 1)] : null);
    for (let i = 0; i < frames; i++) {
      if (p.bypass) {
        for (let ch = 0; ch < nch; ch++) out[ch][i] = src[ch] ? src[ch][i] : 0;
        continue;
      }
      // детекция: моно-сумма, при необходимости — речевая полоса
      let s = 0;
      for (let ch = 0; ch < nch; ch++) s += src[ch] ? src[ch][i] : 0;
      s /= nch;
      if (p.detOn) { s = this.hp.step(s); s = this.lp.step(s); }
      const a = Math.abs(s);
      this.env = a > this.env ? a : this.env * this.envRel;
      const envDb = lin2db(this.env + 1e-9);

      // гистерезис + hold
      if (envDb > p.openThr) { this.open = true; this.holdCnt = this.holdN; }
      else if (envDb < p.openThr - p.hyst && this.holdCnt <= 0) this.open = false;
      if (this.holdCnt > 0) this.holdCnt--;

      const target = this.open ? 1 : this.rangeLin;
      if (target > this.gain) this.gain += (target - this.gain) * this.atkCoef;
      else this.gain += (target - this.gain) * this.relCoef;

      // lookahead-задержка сигнала, усиление применяется заранее
      for (let ch = 0; ch < nch; ch++) {
        const x = src[ch] ? src[ch][i] : 0;
        out[ch][i] = this.delays[ch].step(x) * this.gain;
      }
    }
    if ((this.block++ & 7) === 0) {
      this.port.postMessage({
        type: 'meter',
        env: +lin2db(this.env + 1e-9).toFixed(1),
        gr: +(20 * Math.log10(Math.max(this.gain, 1e-6))).toFixed(1),
        open: this.open,
      });
    }
    return true;
  }
}
registerProcessor('gate-proc', GateProcessor);
