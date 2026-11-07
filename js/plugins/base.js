// База для плагинов: фабрика worklet-плагинов, ff-панель параметров, LED-метры
import { createKnob } from '../ui/knob.js';
import { getLang, t } from '../i18n.js';

export const db2lin = (x) => Math.pow(10, x / 20);

export function paramDefaults(params) {
  const o = {};
  for (const p of params) o[p.id] = p.def;
  return o;
}

// Панель параметров в стиле FabFilter: большие кнобы, свитчи, селекты
export function renderParams(container, inst, params, onAny, accent = '#ff9f43') {
  const grid = document.createElement('div');
  grid.className = 'ff-grid';
  grid.style.setProperty('--ff-accent', accent);
  const en = getLang() === 'en';
  for (const p of params) {
    const label = (en && p.nameEn) ? p.nameEn : p.name;
    const v = inst.getState()[p.id];
    if (p.kind === 'toggle') {
      const wrap = document.createElement('div');
      wrap.className = 'ff-switch' + (v ? ' on' : '');
      wrap.style.setProperty('--ff-accent', accent);
      wrap.innerHTML = `<span class="sw"></span><span class="lb">${label}</span>`;
      wrap.addEventListener('click', () => {
        const on = !wrap.classList.contains('on');
        wrap.classList.toggle('on', on);
        inst.setParam(p.id, on ? 1 : 0);
        onAny && onAny();
      });
      grid.appendChild(wrap);
    } else if (p.kind === 'select') {
      const wrap = document.createElement('label');
      wrap.className = 'knob';
      const sel = document.createElement('select');
      sel.className = 'b-type';
      const opts = (en && p.optionsEn) ? p.optionsEn : p.options;
      opts.forEach(([val, lbl]) => sel.add(new Option(lbl, val)));
      sel.value = String(v);
      sel.addEventListener('change', () => { inst.setParam(p.id, sel.value); onAny && onAny(); });
      const nm = document.createElement('div');
      nm.className = 'k-name'; nm.textContent = label;
      wrap.append(sel, nm);
      grid.appendChild(wrap);
    } else {
      const k = createKnob({
        label, value: v, min: p.min, max: p.max, def: p.def,
        curve: p.curve || 'lin', fmt: p.fmt || 'raw', size: 52,
        look: 'ff', accent,
        onInput: (val) => { inst.setParam(p.id, val); onAny && onAny(); },
      });
      grid.appendChild(k.el);
    }
  }
  container.appendChild(grid);
  return grid;
}

// Вертикальный сегментный LED-метр со шкалой дБ (стиль Pro-L)
// mode: 'gr' — давка (m.gr ≤ 0), 'env' — уровень (m.env, дБ)
export function ledMeter(container, inst, { height = 190, mode = 'gr', accent = '#ff9f43', label = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ff-right';
  wrap.style.setProperty('--ff-accent', accent);
  const box = document.createElement('div');
  box.className = 'ff-meter';
  const W = 26, dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = height * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = height + 'px';
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  box.appendChild(canvas);
  const scale = document.createElement('div');
  scale.className = 'scale';
  for (const d of [0, -12, -24, -36, -48, -60]) {
    const s = document.createElement('span');
    s.textContent = d === 0 ? '0' : String(d);
    scale.appendChild(s);
  }
  box.appendChild(scale);
  wrap.appendChild(box);
  if (label) {
    const lb = document.createElement('div');
    lb.className = 'ff-meter-label';
    lb.textContent = label;
    wrap.appendChild(lb);
  }
  container.appendChild(wrap);

  const SEGS = 26;
  const draw = (v) => {
    v = Math.max(0, Math.min(1, v));
    g.clearRect(0, 0, W, height);
    g.fillStyle = '#0d0f14';
    g.fillRect(0, 0, W, height);
    const sh = height / SEGS;
    const lit = Math.round(v * SEGS);
    for (let i = 0; i < SEGS; i++) {
      const t = 1 - i / (SEGS - 1);      // 0 внизу, 1 вверху
      const y = height - (i + 1) * sh;
      const on = i < lit;
      g.fillStyle = on
        ? (t > 0.82 ? '#ff5252' : t > 0.6 ? '#ffd166' : '#3ddc84')
        : '#191d25';
      g.fillRect(2, y + 1.2, W - 4, sh - 2.4);
    }
  };
  draw(0);
  if (inst.onMeter) {
    inst.onMeter((m) => {
      let v = 0;
      if (mode === 'env') v = ((m.env !== undefined ? m.env : -60) + 60) / 60;
      else v = -(m.gr || 0) / 60;
      draw(v);
    });
  }
  return wrap;
}

// Плагин на AudioWorklet: параметры через postMessage, метры обратно
export function defineWorklet(spec) {
  const defaults = paramDefaults(spec.params);
  return {
    id: spec.id, name: spec.name, nameEn: spec.nameEn, category: spec.category,
    desc: spec.desc, descEn: spec.descEn,
    params: spec.params, brand: spec.brand, accent: spec.accent,
    build(ctx, state) {
      const node = new AudioWorkletNode(ctx, spec.proc, {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        ...(spec.processorOptions ? { processorOptions: spec.processorOptions() } : {}),
      });
      const inst = {
        input: node, output: node,
        _state: { ...defaults, ...(state || {}) },
        _meters: new Set(),
        setParam(id, v) { inst._state[id] = v; node.port.postMessage({ params: { [id]: v } }); },
        setState(s) { Object.assign(inst._state, s); node.port.postMessage({ params: s }); },
        getState() { return { ...inst._state }; },
        onMeter(cb) { inst._meters.add(cb); return () => inst._meters.delete(cb); },
        send(msg) { node.port.postMessage(msg); },
        destroy() { try { node.disconnect(); } catch {} },
      };
      node.port.onmessage = (e) => {
        const d = e.data;
        if (d && d.type === 'meter') for (const cb of inst._meters) cb(d);
      };
      node.port.postMessage({ params: inst._state });
      return inst;
    },
    renderBody: spec.renderBody,
  };
}

// Горизонтальный meter-bar (совместимость)
export function meterBar(container, inst, extract) {
  const bar = document.createElement('div');
  bar.className = 'fx-meter-bar';
  const fill = document.createElement('div');
  fill.className = 'fx-meter-fill';
  bar.appendChild(fill);
  container.appendChild(bar);
  if (inst.onMeter) {
    inst.onMeter((m) => {
      const t = Math.max(0, Math.min(1, extract(m)));
      fill.style.width = (t * 100).toFixed(1) + '%';
    });
  }
}
