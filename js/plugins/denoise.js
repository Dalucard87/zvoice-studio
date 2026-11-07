// Шумодав — Pro DeNoise: серый спектр как в Acon DeNoise + кнопки обучения
import { defineWorklet, renderParams, ledMeter } from './base.js';
import { t } from '../i18n.js';
import { proShell } from './displays.js';

const params = [
  { id: 'strength', name: 'Сила', nameEn: 'Strength', min: 0, max: 4, def: 2.2, fmt: 'x' },
  { id: 'floorDb', name: 'Пол давки', nameEn: 'Floor', min: -60, max: -10, def: -28, fmt: 'db' },
  { id: 'smooth', name: 'Сглаживание', nameEn: 'Smoothing', min: 0, max: 0.9, def: 0.35, fmt: 'pct' },
  { id: 'bypass', name: 'Байпас', nameEn: 'Bypass', kind: 'toggle', def: 0 },
];

export const DenoisePlugin = defineWorklet({
  id: 'denoise', name: 'Шумодав', nameEn: 'De-Noiser', category: 'Очистка', proc: 'denoise-proc',
  desc: 'Спектральное вычитание шума. Зажми «Учить» в тишине — выучит профиль',
  descEn: 'Spectral noise reduction. Hold “Learn” in silence to profile the noise',
  brand: 'Pro DeNoise', accent: '#43d6b5',
  params,
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: DenoisePlugin.accent,
      mode: 'spectrum', height: 200,
      getOverlays: () => {
        const s = inst.getState();
        return [{ hline: s.floorDb, color: '#43d6b5', dash: true, label: 'FLOOR' }];
      },
      meter: (right) => ledMeter(right, inst, { mode: 'gr', accent: DenoisePlugin.accent, label: 'Reduction', height: 330 }),
    });

    // строка обучения (как у Acon: Learn жёлтой кнопкой)
    const learnRow = document.createElement('div');
    learnRow.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 12px 0;flex-wrap:wrap';
    const learn = document.createElement('button');
    learn.className = 'ff-btn';
    learn.style.setProperty('--ff-accent', DenoisePlugin.accent);
    learn.textContent = t('dn.learn');
    const reset = document.createElement('button');
    reset.className = 'ff-btn';
    reset.textContent = t('dn.reset');
    const status = document.createElement('span');
    status.className = 'ff-note';
    status.textContent = t('dn.noProfile');
    learnRow.append(learn, reset, status);
    main.appendChild(learnRow);

    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, params, onAny, DenoisePlugin.accent);
    main.appendChild(row);

    const start = (e) => {
      e.preventDefault();
      inst.send({ cmd: 'learn-start' });
      status.textContent = t('dn.listening');
      status.style.color = '#e0c341';
    };
    const stop = () => {
      if (status.textContent === t('dn.listening')) {
        inst.send({ cmd: 'learn-stop' });
        status.textContent = t('dn.done');
        status.style.color = '#43d6b5';
      }
    };
    learn.addEventListener('pointerdown', start);
    learn.addEventListener('pointerup', stop);
    learn.addEventListener('pointerleave', stop);
    reset.addEventListener('click', () => {
      inst.send({ cmd: 'reset' });
      status.textContent = t('dn.noProfile');
      status.style.color = '#6a7382';
    });
    return () => disp.destroy();
  },
});
