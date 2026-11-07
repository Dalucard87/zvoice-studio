// Сатурация/драйв (WaveShaper) с dry/wet — Pro Satin: осциллограф + кнобы
import { db2lin, renderParams } from './base.js';
import { proShell } from './displays.js';

function makeCurve(type, driveDb) {
  const k = Math.max(1, db2lin(driveDb));
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y;
    if (type === 'hard') y = Math.max(-1, Math.min(1, x * k));
    else if (type === 'tube') {
      y = x < 0 ? Math.tanh(k * x) * 0.8 : Math.tanh(k * x * 1.15);
      const m = Math.tanh(k * 1.15) || 1;
      y /= m;
    } else y = Math.tanh(k * x) / Math.tanh(k);
    c[i] = y;
  }
  return c;
}

export const SaturationPlugin = {
  id: 'saturation', name: 'Сатурация', nameEn: 'Saturation', category: 'Тембр',
  desc: 'Тёплый драйв, жёсткий клип, лампа', descEn: 'Warm drive, hard clip, tube',
  brand: 'Pro Satin', accent: '#f7768e',
  params: [
    { id: 'drive', name: 'Драйв', nameEn: 'Drive', min: 0, max: 24, def: 6, fmt: 'db' },
    { id: 'type', name: 'Тип', nameEn: 'Type', kind: 'select', def: 'soft',
      options: [['soft', 'Мягкая'], ['hard', 'Жёсткая'], ['tube', 'Лампа']],
      optionsEn: [['soft', 'Soft'], ['hard', 'Hard'], ['tube', 'Tube']] },
    { id: 'mix', name: 'Микс', nameEn: 'Mix', min: 0, max: 100, def: 100, fmt: 'pct' },
  ],
  build(ctx, state) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const s = { drive: 6, type: 'soft', mix: 100, ...(state || {}) };
    input.connect(shaper); shaper.connect(wet); wet.connect(out);
    input.connect(dry); dry.connect(out);
    const apply = () => {
      shaper.curve = makeCurve(s.type, s.drive);
      const t = s.mix / 100;
      wet.gain.value = Math.sin((t * Math.PI) / 2);
      dry.gain.value = Math.cos((t * Math.PI) / 2);
    };
    apply();
    return {
      input, output: out,
      setParam(id, v) { s[id] = id === 'type' ? v : +v; apply(); },
      setState(st) { Object.assign(s, st || {}); apply(); },
      getState() { return { ...s }; },
      destroy() { try { input.disconnect(); out.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: SaturationPlugin.accent,
      mode: 'scope', height: 210,
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, SaturationPlugin.params, onAny, SaturationPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
