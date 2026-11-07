// Эхо/дилей с фильтром в петле — Pro Delay: осциллограф + кнобы
import { renderParams } from './base.js';
import { proShell } from './displays.js';

export const DelayPlugin = {
  id: 'delay', name: 'Эхо', nameEn: 'Delay', category: 'Эффекты',
  desc: 'Дилей с обратной связью и тоном', descEn: 'Delay with filtered feedback',
  brand: 'Pro Delay', accent: '#7aa2f7',
  params: [
    { id: 'time', name: 'Время', nameEn: 'Time', min: 10, max: 2000, def: 350, fmt: 'ms' },
    { id: 'fb', name: 'Обратная связь', nameEn: 'Feedback', min: 0, max: 95, def: 35, fmt: 'pct' },
    { id: 'tone', name: 'Тон', nameEn: 'Tone', min: 500, max: 18000, def: 8000, curve: 'log', fmt: 'hz' },
    { id: 'mix', name: 'Микс', nameEn: 'Mix', min: 0, max: 100, def: 25, fmt: 'pct' },
  ],
  build(ctx, state) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dl = ctx.createDelay(2.5);
    const lp = ctx.createBiquadFilter();
    const fb = ctx.createGain();
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const s = { time: 350, fb: 35, tone: 8000, mix: 25, ...(state || {}) };
    input.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
    dl.connect(wet); wet.connect(out);
    input.connect(dry); dry.connect(out);
    const apply = () => {
      dl.delayTime.setTargetAtTime(s.time / 1000, ctx.currentTime, 0.05);
      lp.type = 'lowpass'; lp.frequency.value = s.tone;
      fb.gain.value = s.fb / 100;
      wet.gain.value = s.mix / 100;
      dry.gain.value = 1;
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
      engine: ectx.engine, trackId: ectx.trackId, accent: DelayPlugin.accent,
      mode: 'scope', height: 210,
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, DelayPlugin.params, onAny, DelayPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
