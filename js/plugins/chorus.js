// Хорус — Pro Chorus: осциллограф + кнобы
import { renderParams } from './base.js';
import { proShell } from './displays.js';

export const ChorusPlugin = {
  id: 'chorus', name: 'Хорус', nameEn: 'Chorus', category: 'Эффекты',
  desc: 'Расширение и объём голоса', descEn: 'Width and depth for voice',
  brand: 'Pro Chorus', accent: '#bb9af7',
  params: [
    { id: 'rate', name: 'Скорость', nameEn: 'Rate', min: 0.1, max: 8, def: 1.2, fmt: 'x', unit: 'Hz' },
    { id: 'depth', name: 'Глубина', nameEn: 'Depth', min: 0, max: 10, def: 3, fmt: 'ms' },
    { id: 'mix', name: 'Микс', nameEn: 'Mix', min: 0, max: 100, def: 35, fmt: 'pct' },
  ],
  build(ctx, state) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dl = ctx.createDelay(0.2);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const s = { rate: 1.2, depth: 3, mix: 35, ...(state || {}) };
    input.connect(dl); dl.connect(wet); wet.connect(out);
    input.connect(dry); dry.connect(out);
    lfo.connect(lfoG); lfoG.connect(dl.delayTime);
    lfo.start();
    const apply = () => {
      dl.delayTime.value = 0.03;
      lfo.frequency.value = s.rate;
      lfoG.gain.value = s.depth / 1000;
      wet.gain.value = s.mix / 100;
      dry.gain.value = 1;
    };
    apply();
    return {
      input, output: out,
      setParam(id, v) { s[id] = +v; apply(); },
      setState(st) { Object.assign(s, st || {}); apply(); },
      getState() { return { ...s }; },
      destroy() { try { lfo.stop(); input.disconnect(); out.disconnect(); } catch {} },
    };
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: ChorusPlugin.accent,
      mode: 'scope', height: 210,
    });
    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, ChorusPlugin.params, onAny, ChorusPlugin.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
};
