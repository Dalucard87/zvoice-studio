// Кнобы: компактный классический и большой «FabFilter»-стиль (свечение, градиент)
// Перетаскивание по вертикали, Shift — точно, двойной клик — сброс, колесо — шаг

let seq = 0;

const FMT = {
  db: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' dB',
  hz: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz'),
  ms: (v) => (v >= 1000 ? (v / 1000).toFixed(2) + ' s' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms'),
  pct: (v) => Math.round(v) + ' %',
  ratio: (v) => (+v).toFixed(1) + ':1',
  x: (v) => (+v).toFixed(2),
  raw: (v) => Math.round(v),
};
export const formatters = FMT;

function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function createKnob(opts) {
  const {
    label, value, min, max, def,
    curve = 'lin', fmt = 'raw', size = 56, onInput,
    look = 'classic', accent = '#ff9f43',
  } = opts;
  const f = typeof fmt === 'function' ? fmt : (FMT[fmt] || FMT.raw);
  const toT = (v) => (curve === 'log' ? Math.log(Math.max(v, min) / min) / Math.log(max / min) : (v - min) / (max - min));
  const toV = (t) => (curve === 'log' ? min * Math.pow(max / min, t) : min + t * (max - min));
  const clampT = (t) => Math.max(0, Math.min(1, t));

  let cur = Math.max(min, Math.min(max, value));
  const A0 = (-135 * Math.PI) / 180, A1 = (135 * Math.PI) / 180;
  const c = size / 2, r = size / 2 - 7;
  const el = document.createElement('div');
  el.className = 'knob' + (look === 'ff' ? ' ff' : '');
  const uid = 'kgrad' + (++seq);

  if (look === 'ff') {
    el.innerHTML = `
      <div class="k-name"></div>
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
          <radialGradient id="${uid}" cx="50%" cy="35%" r="80%">
            <stop offset="0%" stop-color="#2c3038"/>
            <stop offset="100%" stop-color="#16181d"/>
          </radialGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${uid})" stroke="#0a0c10" stroke-width="1.5"/>
        <path class="k-track" fill="none" stroke="#2b2f36" stroke-width="4" stroke-linecap="round"/>
        <path class="k-arc" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
        <line class="k-needle" stroke="#dfe4ec" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div class="k-val"></div>`;
  } else {
    el.innerHTML = `
      <div class="k-name"></div>
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="#1d212a" stroke="#2b313d"/>
        <path class="k-track" fill="none" stroke="#333a47" stroke-width="4" stroke-linecap="round"/>
        <path class="k-arc" fill="none" stroke="#ff9f43" stroke-width="4" stroke-linecap="round"/>
        <line class="k-needle" stroke="#ccd3df" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div class="k-val"></div>`;
  }

  const svg = el.querySelector('svg');
  const track = el.querySelector('.k-track');
  const arc = el.querySelector('.k-arc');
  const needle = el.querySelector('.k-needle');
  const nameEl = el.querySelector('.k-name');
  const valEl = el.querySelector('.k-val');
  nameEl.textContent = label;
  track.setAttribute('d', arcPath(c, c, r, A0, A1));

  function draw() {
    const t = clampT(toT(cur));
    const a = A0 + t * (A1 - A0);
    if (t > 0.004) arc.setAttribute('d', arcPath(c, c, r, A0, a));
    else arc.setAttribute('d', '');
    const r1 = r - 4, r2 = r - (look === 'ff' ? 13 : 12);
    const [x1, y1] = polar(c, c, r2, a), [x2, y2] = polar(c, c, r1, a);
    needle.setAttribute('x1', x1); needle.setAttribute('y1', y1);
    needle.setAttribute('x2', x2); needle.setAttribute('y2', y2);
    valEl.textContent = f(cur);
  }
  draw();

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, t: clampT(toT(cur)) };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const sens = e.shiftKey ? 600 : 150;
    const t = clampT(drag.t + (drag.y - e.clientY) / sens);
    cur = toV(t);
    draw();
    onInput && onInput(cur);
  });
  const endDrag = (e) => { drag = null; try { svg.releasePointerCapture(e.pointerId); } catch {} };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('dblclick', () => { cur = def !== undefined ? def : cur; draw(); onInput && onInput(cur); });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = (max - min) / (e.shiftKey ? 200 : 40);
    cur = Math.max(min, Math.min(max, cur + (e.deltaY < 0 ? step : -step)));
    draw(); onInput && onInput(cur);
  }, { passive: false });

  return {
    el,
    get value() { return cur; },
    set(v) { cur = Math.max(min, Math.min(max, v)); draw(); },
  };
}
