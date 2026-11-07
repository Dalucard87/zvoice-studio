// Реверберация: свёртка с синтезированным импульсом — Pro Reverb: осциллограф + кнобы
import { renderParams } from './base.js';
import { proShell } from './displays.js';

export const ReverbPlugin = {
  id: 'reverb', name: 'Реверберация', nameEn: 'Reverb', category: 'Эффекты',
  desc: 'Комната, зал, пространство', descEn: 'Room, hall, space',
  brand: 'Pro Reverb', accent: '#73daca',
  params: [
    { id: 'size', name: 'Размер', nameEn: 'Size', min: 0.2, max: 6, def: 1.8, fmt: 'x', unit: 's' },
    { id: 'predelay', name: 'Предзадержка', nameEn: 'Pre-delay', min: 0, max: 120, def: 20, fmt: 'ms' },
    { id: 'mix', name: 'Микс', nameEn: 'Mix', min: 0, max: 100, def: 20, fmt: 'pct' },
  ],
  build(ctx, state) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    const pre = ctx.createDelay(0.3);
    const conv = ctx.createConvolver();
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const s = { size: 1.8, predelay: 20, mix: 20, ...(state || {}) };
    input.connect(pre); pre.connect(conv); conv.connect(wet); wet.connect(out);
    input.connect(dry); dry.connect(out);
    let irSize = -1;
    const genIR = () => {
      const sz = Math.round(s.size * 10) / 10;
      if (sz === irSize) return;
      irSize = sz;
      const sr = ctx.sampleRate, len = Math.max(64, Math.floor(sr * sz));
      const buf = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / len);
        }
      }
      conv.buffer = buf;
    };
    const apply = () => {
      pre.delayTime.value = s.predelay / 1000;
      wet.gain.value = s.mix / 100;
      dry.gain.value = 1;
      genIR();
    };
    apply();
    return {
      input, output: out,
      setParam(id, v) { s[id] = +v; apply(); },
      setState(st) { Object.assign(s, st || {}); apply(); },
      getState() { return { ...s }; },
      destroy() { try { input.disconnect(); out.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: ReverbPlugin.accent,
      mode: 'scope', height: 210,
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, ReverbPlugin.params, onAny, ReverbPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
