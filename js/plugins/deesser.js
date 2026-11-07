// Де-эссер — Pro-DS: спектр с зоной свистящих + LED-метр давки
import { defineWorklet, renderParams, ledMeter } from './base.js';
import { proShell } from './displays.js';

const params = [
  { id: 'split', name: 'Частота сплита', nameEn: 'Split freq', min: 2000, max: 8000, def: 5200, curve: 'log', fmt: 'hz' },
  { id: 'thr', name: 'Порог', nameEn: 'Threshold', min: -60, max: 0, def: -30, fmt: 'db' },
  { id: 'ratio', name: 'Ratio', min: 1, max: 10, def: 4, fmt: 'ratio' },
  { id: 'maxRed', name: 'Макс. давка', nameEn: 'Max reduction', min: 0, max: 24, def: 10, fmt: 'db' },
  { id: 'attack', name: 'Атака', nameEn: 'Attack', min: 0.5, max: 20, def: 1.5, fmt: 'ms' },
  { id: 'release', name: 'Релиз', nameEn: 'Release', min: 20, max: 300, def: 70, fmt: 'ms' },
];

export const DeEsserPlugin = defineWorklet({
  id: 'deesser', name: 'Де-эссер', nameEn: 'De-Esser', category: 'Очистка', proc: 'deesser-proc',
  desc: 'Снимает резкие «с» и «ш»',
  descEn: 'Tames harsh “s” sounds',
  brand: 'Pro-DS', accent: '#e0c341',
  params,
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: DeEsserPlugin.accent,
      mode: 'deess', height: 190,
      getOverlays: () => {
        const s = inst.getState();
        return [
          { zone: { from: s.split, to: 12000 } },
          { vfreq: s.split, color: '#e0c341', label: 'SPLIT' },
          { hline: s.thr, color: '#f7768e', dash: true, label: 'THR' },
        ];
      },
      meter: (right) => ledMeter(right, inst, { mode: 'gr', accent: DeEsserPlugin.accent, label: 'Reduction', height: 330 }),
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, params, onAny, DeEsserPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
});
