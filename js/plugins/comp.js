// Компрессор — Pro Comp: волна с линией порога + LED-метр GR
import { db2lin, renderParams, ledMeter } from './base.js';
import { proShell } from './displays.js';

export const CompPlugin = {
  id: 'comp', name: 'Компрессор', nameEn: 'Compressor', category: 'Динамика',
  desc: 'Выравнивание громкости', descEn: 'Evens out loudness',
  brand: 'Pro Comp', accent: '#e0af68',
  params: [
    { id: 'thr', name: 'Порог', nameEn: 'Threshold', min: -60, max: 0, def: -20, fmt: 'db' },
    { id: 'ratio', name: 'Ratio', min: 1, max: 20, def: 3, fmt: 'ratio' },
    { id: 'attack', name: 'Атака', nameEn: 'Attack', min: 0.5, max: 100, def: 6, fmt: 'ms' },
    { id: 'release', name: 'Релиз', nameEn: 'Release', min: 10, max: 500, def: 90, fmt: 'ms' },
    { id: 'knee', name: 'Колено', nameEn: 'Knee', min: 0, max: 24, def: 6, fmt: 'db' },
    { id: 'makeup', name: 'Makeup', min: -12, max: 24, def: 0, fmt: 'db' },
  ],
  build(ctx, state) {
    const comp = ctx.createDynamicsCompressor();
    const out = ctx.createGain();
    comp.connect(out);
    const s = { thr: -20, ratio: 3, attack: 6, release: 90, knee: 6, makeup: 0, ...(state || {}) };
    const apply = () => {
      comp.threshold.value = s.thr;
      comp.ratio.value = s.ratio;
      comp.attack.value = Math.max(0.001, s.attack / 1000);
      comp.release.value = Math.max(0.01, s.release / 1000);
      comp.knee.value = s.knee;
      out.gain.value = db2lin(s.makeup);
    };
    apply();
    const meters = new Set();
    const iv = setInterval(() => {
      const r = typeof comp.reduction === 'number' ? comp.reduction : (comp.reduction && comp.reduction.value) || 0;
      for (const cb of meters) cb({ gr: +r.toFixed(1) });
    }, 100);
    return {
      input: comp, output: out,
      setParam(id, v) { s[id] = v; apply(); },
      setState(st) { Object.assign(s, st || {}); apply(); },
      getState() { return { ...s }; },
      onMeter(cb) { meters.add(cb); return () => meters.delete(cb); },
      destroy() { clearInterval(iv); try { comp.disconnect(); out.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: CompPlugin.accent,
      mode: 'wave', height: 190,
      getOverlays: () => [
        { hline: inst.getState().thr, color: '#f7768e', label: 'THRESHOLD' },
      ],
      meter: (right) => ledMeter(right, inst, { mode: 'gr', accent: CompPlugin.accent, label: 'GR', height: 330 }),
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, CompPlugin.params, onAny, CompPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
