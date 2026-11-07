// Гейт — Pro Gate: волна с линиями порогов + LED-метр уровня
import { defineWorklet, renderParams, ledMeter } from './base.js';
import { proShell } from './displays.js';

const params = [
  { id: 'openThr', name: 'Порог откр.', nameEn: 'Open thr.', min: -60, max: 0, def: -38, fmt: 'db' },
  { id: 'hyst', name: 'Гистерезис', nameEn: 'Hysteresis', min: 0, max: 15, def: 7, fmt: 'db' },
  { id: 'range', name: 'Приглушение', nameEn: 'Attenuation', min: -60, max: 0, def: -35, fmt: 'db' },
  { id: 'attack', name: 'Атака', nameEn: 'Attack', min: 0.1, max: 50, def: 1, fmt: 'ms' },
  { id: 'hold', name: 'Удержание', nameEn: 'Hold', min: 0, max: 1000, def: 250, fmt: 'ms' },
  { id: 'release', name: 'Релиз', nameEn: 'Release', min: 5, max: 500, def: 100, fmt: 'ms' },
  { id: 'lookahead', name: 'Lookahead', min: 0, max: 20, def: 5, fmt: 'ms' },
  { id: 'detLow', name: 'Детекция НЧ', nameEn: 'Detect low', min: 20, max: 800, def: 100, curve: 'log', fmt: 'hz' },
  { id: 'detHigh', name: 'Детекция ВЧ', nameEn: 'Detect high', min: 500, max: 8000, def: 4000, curve: 'log', fmt: 'hz' },
  { id: 'detOn', name: 'Речевая детекция', nameEn: 'Speech detect', kind: 'toggle', def: 1 },
  { id: 'bypass', name: 'Байпас', nameEn: 'Bypass', kind: 'toggle', def: 0 },
];

export const GatePlugin = defineWorklet({
  id: 'gate', name: 'Гейт', nameEn: 'Gate', category: 'Очистка', proc: 'gate-proc',
  desc: 'Режет шум в паузах (детекция 100 Гц–4 кГц, как в SETUP.md)',
  descEn: 'Cuts noise between phrases (100 Hz–4 kHz detection, per SETUP.md)',
  brand: 'Pro Gate', accent: '#ff9f43',
  params,
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: GatePlugin.accent,
      mode: 'wave', height: 190,
      getOverlays: () => {
        const s = inst.getState();
        return [
          { hline: s.openThr, color: '#ff9f43', label: 'OPEN ' + Math.round(s.openThr) + ' dB' },
          { hline: s.openThr - s.hyst, color: '#8a92a0', dash: true, label: 'CLOSE' },
        ];
      },
      meter: (right) => ledMeter(right, inst, { mode: 'env', accent: GatePlugin.accent, label: 'Level', height: 330 }),
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, params, onAny, GatePlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
});
