// Лимитер — Pro-L: история пиков + линия потолка + большой LED-метр GR
import { renderParams, ledMeter } from './base.js';
import { proShell } from './displays.js';

export const LimiterPlugin = {
  id: 'limiter', name: 'Лимитер', nameEn: 'Limiter', category: 'Динамика',
  desc: 'Не даёт сигналу превысить потолок', descEn: 'Keeps the signal under the ceiling',
  brand: 'Pro-L', accent: '#ff5252',
  params: [
    { id: 'ceiling', name: 'Потолок', nameEn: 'Ceiling', min: -12, max: 0, def: -5, fmt: 'db' },
    { id: 'release', name: 'Релиз', nameEn: 'Release', min: 10, max: 500, def: 60, fmt: 'ms' },
  ],
  build(ctx, state) {
    const comp = ctx.createDynamicsCompressor();
    const s = { ceiling: -5, release: 60, ...(state || {}) };
    const apply = () => {
      comp.threshold.value = s.ceiling;
      comp.knee.value = 0;
      comp.ratio.value = 20;
      comp.attack.value = 0.002;
      comp.release.value = Math.max(0.01, s.release / 1000);
    };
    apply();
    const ms = new Set();
    const iv = setInterval(() => {
      const r = typeof comp.reduction === 'number' ? comp.reduction : (comp.reduction && comp.reduction.value) || 0;
      for (const cb of ms) cb({ gr: +r.toFixed(1) });
    }, 100);
    return {
      input: comp, output: comp,
      setParam(id, v) { s[id] = v; apply(); },
      setState(st) { Object.assign(s, st || {}); apply(); },
      getState() { return { ...s }; },
      onMeter(cb) { ms.add(cb); return () => ms.delete(cb); },
      destroy() { clearInterval(iv); try { comp.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: LimiterPlugin.accent,
      mode: 'history', height: 210,
      getOverlays: () => [
        { hline: inst.getState().ceiling, color: '#ffd166', label: 'CEILING' },
      ],
      meter: (right) => ledMeter(right, inst, { mode: 'gr', accent: LimiterPlugin.accent, label: 'Gain Red.', height: 330 }),
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, LimiterPlugin.params, onAny, LimiterPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
