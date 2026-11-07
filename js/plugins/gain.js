// Гейн — Pro Gain: осциллограф + ряд кнобов
import { db2lin, renderParams } from './base.js';
import { proShell } from './displays.js';

export const GainPlugin = {
  id: 'gain', name: 'Гейн', nameEn: 'Gain', category: 'Уровень',
  desc: 'Усиление или ослабление сигнала', descEn: 'Boost or cut the level',
  brand: 'Pro Gain', accent: '#9ece6a',
  params: [{ id: 'gain', name: 'Усиление', nameEn: 'Gain', min: -24, max: 24, def: 0, fmt: 'db' }],
  build(ctx, state) {
    const g = ctx.createGain();
    const s = { gain: state && state.gain !== undefined ? state.gain : 0 };
    g.gain.value = db2lin(s.gain);
    return {
      input: g, output: g,
      setParam(id, v) { if (id === 'gain') { s.gain = v; g.gain.setTargetAtTime(db2lin(v), ctx.currentTime, 0.01); } },
      setState(st) { if (st && st.gain !== undefined) { s.gain = st.gain; g.gain.value = db2lin(st.gain); } },
      getState() { return { ...s }; },
      destroy() { try { g.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: GainPlugin.accent,
      mode: 'scope', height: 210,
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, GainPlugin.params, onAny, GainPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
