// Эквалайзер — Pro-Q: АЧХ поверх живого спектра + точки полос + ряды полос
import { createKnob } from '../ui/knob.js';
import { proShell } from './displays.js';
import { t, getLang } from '../i18n.js';

const TYPES = {
  ru: [['off', 'Выкл'], ['lowcut', 'НЧ срез'], ['lowshelf', 'НЧ полка'], ['peak', 'Пик'], ['highshelf', 'ВЧ полка'], ['highcut', 'ВЧ срез']],
  en: [['off', 'Off'], ['lowcut', 'Low cut'], ['lowshelf', 'Low shelf'], ['peak', 'Peak'], ['highshelf', 'High shelf'], ['highcut', 'High cut']],
};
const ACCENT = '#43d6b5';

export function defaultBands() {
  return [
    { on: 1, type: 'lowcut', freq: 85, gain: 0, q: 0.7 },
    { on: 1, type: 'peak', freq: 300, gain: -3, q: 1.4 },
    { on: 1, type: 'peak', freq: 900, gain: -1, q: 2.0 },
    { on: 1, type: 'peak', freq: 3500, gain: 1.5, q: 1.2 },
    { on: 1, type: 'highshelf', freq: 9500, gain: 1, q: 0.7 },
    { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1.0 },
  ];
}

export const EqPlugin = {
  id: 'eq', name: 'Эквалайзер', nameEn: 'Equalizer', category: 'Тембр',
  desc: '6 полос: срезы, полки, пики', descEn: '6 bands: cuts, shelves, peaks',
  brand: 'Pro-Q', accent: ACCENT,
  params: [],
  build(ctx, state) {
    const nodes = Array.from({ length: 6 }, () => ctx.createBiquadFilter());
    for (let i = 0; i < 5; i++) nodes[i].connect(nodes[i + 1]);
    const s = { bands: (state && state.bands) ? JSON.parse(JSON.stringify(state.bands)) : defaultBands() };
    while (s.bands.length < 6) s.bands.push({ on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 });
    const inst = {
      input: nodes[0], output: nodes[5], _nodes: nodes,
      _applyBand(i) {
        const b = s.bands[i], nd = nodes[i];
        const f = Math.max(20, Math.min(20000, b.freq));
        if (!b.on || b.type === 'off') { nd.type = 'peaking'; nd.frequency.value = f; nd.gain.value = 0; return; }
        switch (b.type) {
          case 'lowcut': nd.type = 'highpass'; nd.frequency.value = f; nd.Q.value = b.q; break;
          case 'highcut': nd.type = 'lowpass'; nd.frequency.value = f; nd.Q.value = b.q; break;
          case 'lowshelf': nd.type = 'lowshelf'; nd.frequency.value = f; nd.gain.value = b.gain; break;
          case 'highshelf': nd.type = 'highshelf'; nd.frequency.value = f; nd.gain.value = b.gain; break;
          default: nd.type = 'peaking'; nd.frequency.value = f; nd.gain.value = b.gain; nd.Q.value = b.q;
        }
      },
      _applyAll() { for (let i = 0; i < 6; i++) inst._applyBand(i); },
      setParam(id, v) {
        const m = /^b(\d+)\.(on|type|freq|gain|q)$/.exec(id);
        if (!m) return;
        const i = +m[1];
        s.bands[i][m[2]] = m[2] === 'type' ? v : +v;
        inst._applyBand(i);
      },
      setState(st) {
        if (st && st.bands) { s.bands = JSON.parse(JSON.stringify(st.bands)); inst._applyAll(); }
      },
      getState() { return { bands: JSON.parse(JSON.stringify(s.bands)) }; },
      destroy() { try { nodes.forEach((n) => n.disconnect()); } catch {} },
    };
    inst._applyAll();
    return inst;
  },
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: EqPlugin.accent,
      mode: 'eq', height: 230,
      getCurveNodes: () => inst._nodes,
      getBands: () => inst.getState().bands,
    });
    const rows = document.createElement('div');
    rows.style.cssText = 'margin:auto 12px 12px;padding:6px 10px;background:#16181d;border-top:1px solid #0e1013;border-radius:0 0 6px 6px';
    const en = getLang() === 'en';
    const types = TYPES[en ? 'en' : 'ru'];
    for (let i = 0; i < 6; i++) {
      const b = inst.getState().bands[i];
      const row = document.createElement('div');
      row.className = 'eq-band';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!b.on;
      cb.addEventListener('change', () => { inst.setParam('b' + i + '.on', cb.checked ? 1 : 0); onAny && onAny(); });
      const sel = document.createElement('select');
      sel.className = 'b-type';
      types.forEach(([v, l]) => sel.add(new Option(l, v)));
      sel.value = b.type;
      sel.addEventListener('change', () => { inst.setParam('b' + i + '.type', sel.value); onAny && onAny(); });
      const nm = document.createElement('span');
      nm.className = 'b-name'; nm.textContent = t('eq.band', { n: i + 1 });
      row.append(cb, nm, sel);
      const kf = createKnob({ label: t('eq.freq'), value: b.freq, min: 20, max: 20000, def: 1000, curve: 'log', fmt: 'hz', size: 44, onInput: (v) => { inst.setParam('b' + i + '.freq', v); onAny && onAny(); } });
      const kg = createKnob({ label: t('eq.gain'), value: b.gain, min: -18, max: 18, def: 0, fmt: 'db', size: 44, onInput: (v) => { inst.setParam('b' + i + '.gain', v); onAny && onAny(); } });
      const kq = createKnob({ label: t('eq.q'), value: b.q, min: 0.3, max: 8, def: 1, curve: 'log', fmt: 'x', size: 44, onInput: (v) => { inst.setParam('b' + i + '.q', v); onAny && onAny(); } });
      row.append(kf.el, kg.el, kq.el);
      rows.appendChild(row);
    }
    main.appendChild(rows);
    return () => disp.destroy();
  },
};
