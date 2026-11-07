// Дисплеи плагинов в стиле FabFilter:
//   spectrum — серый спектр (Acon DeNoise), eq — АЧХ + спектр + точки полос (Pro-Q),
//   wave — бегущая волна с линиями порогов (Pro-C/Pro-G), deess — спектр с зоной свистящих,
//   scope — осциллограф, history — история пиков (Pro-L)
// + proShell(): каркас «дисплей сверху + ряд кнобов снизу»

const DB_TOP = 0, DB_BOT = -60;

const lin2db = (v) => 20 * Math.log10(Math.max(v, 1e-6));

import { t } from '../i18n.js';

export function makeDisplay(opts) {
  const {
    engine, trackId, accent = '#43d6b5',
    mode = 'scope', height = 170,
    getOverlays = null, getCurveNodes = null, getBands = null,
  } = opts;
  const el = document.createElement('div');
  el.className = 'ff-display';
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  const g = canvas.getContext('2d');
  let W = 320, H = height, alive = true;
  const hist = [];
  const HIST_MAX = 720;
  let autoGain = 0.05;

  function resize() {
    const w = el.clientWidth || 420;
    const dpr = window.devicePixelRatio || 1;
    W = Math.max(200, w);
    H = height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(el);
  resize();

  const yOf = (db) => ((DB_TOP - db) / (DB_TOP - DB_BOT)) * H;
  const yFor = (db) => (mode === 'eq' ? H / 2 - (db * (H / 2)) / 24 : yOf(db));
  const xOfFreq = (f) => (Math.log10(Math.max(f, 20) / 20) / 3) * W; // 20 Гц … 20 кГц

  const FREQ_MARKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const DB_MARKS = [0, -12, -24, -36, -48, -60];

  function gridLevel(withFreq) {
    g.strokeStyle = '#1b1e25'; g.fillStyle = '#4d5560'; g.font = '8px monospace'; g.lineWidth = 1;
    for (const db of DB_MARKS) {
      const y = yOf(db);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      g.fillText(String(db), W - 26, y - 2);
    }
    if (withFreq) {
      for (const f of FREQ_MARKS) {
        const x = xOfFreq(f);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
        g.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x + 3, H - 3);
      }
    }
  }
  function gridEq(withFreq) {
    g.strokeStyle = '#1b1e25'; g.fillStyle = '#4d5560'; g.font = '8px monospace'; g.lineWidth = 1;
    for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
      const y = H / 2 - (db * (H / 2)) / 24;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      if (db !== 0) g.fillText((db > 0 ? '+' : '') + db, W - 26, y - 2);
    }
    g.strokeStyle = '#2a2f38';
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    if (withFreq) {
      for (const f of FREQ_MARKS) {
        const x = xOfFreq(f);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
        g.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x + 3, H - 3);
      }
    }
  }

  const buf = { td: null, fd: null, size: 0 };
  function adata(an) {
    if (buf.size !== an.fftSize) {
      buf.td = new Float32Array(an.fftSize);
      buf.fd = new Float32Array(an.frequencyBinCount);
      buf.size = an.fftSize;
    }
    return buf;
  }

  function drawSpectrum(an, dim) {
    const d = adata(an);
    an.getFloatFrequencyData(d.fd);
    const sr = an.context.sampleRate;
    g.beginPath();
    let started = false;
    for (let i = 1; i < d.fd.length; i++) {
      const f = (i * sr) / (2 * d.fd.length);
      if (f > 20000) break;
      const x = xOfFreq(f);
      const db = Math.max(DB_BOT, Math.min(DB_TOP, d.fd[i] + 7));
      const y = yOf(db);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    if (dim) {
      g.strokeStyle = 'rgba(170,182,200,.4)'; g.lineWidth = 1; g.stroke();
    } else {
      g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      g.fillStyle = 'rgba(178,190,206,.22)'; g.fill();
      g.strokeStyle = 'rgba(205,214,228,.55)'; g.lineWidth = 1; g.stroke();
    }
    g.lineWidth = 1;
  }

  function drawEqCurve(nodes, bands) {
    const n = 200;
    const freqs = new Float32Array(n);
    for (let i = 0; i < n; i++) freqs[i] = 20 * Math.pow(1000, i / (n - 1));
    const mag = new Float32Array(n), ph = new Float32Array(n), total = new Float32Array(n);
    for (const nd of nodes) {
      nd.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < n; i++) total[i] += 20 * Math.log10(Math.max(mag[i], 1e-6));
    }
    g.strokeStyle = accent; g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOfFreq(freqs[i]);
      const db = Math.max(-24, Math.min(24, total[i]));
      const y = H / 2 - (db * (H / 2)) / 24;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.lineWidth = 1;
    if (bands) {
      for (const b of bands) {
        if (!b.on || b.type === 'off') continue;
        const x = xOfFreq(b.freq);
        const fi = Math.max(0, Math.min(n - 1, Math.round((Math.log10(Math.max(b.freq, 20) / 20) / 3) * (n - 1))));
        const db = Math.max(-24, Math.min(24, total[fi]));
        const y = H / 2 - (db * (H / 2)) / 24;
        g.fillStyle = '#e8edf5';
        g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawWave(an) {
    const d = adata(an);
    an.getFloatTimeDomainData(d.td);
    let mn = 1, mx = -1;
    for (let i = 0; i < d.td.length; i++) { const v = d.td[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    autoGain = Math.max(Math.abs(mx), Math.abs(mn), autoGain * 0.996, 0.03);
    hist.push({ mn, mx });
    if (hist.length > HIST_MAX) hist.shift();
    const len = hist.length;
    const step = W / Math.max(1, Math.min(len, W));
    const scale = ((H / 2) * 0.9) / autoGain;
    g.beginPath();
    for (let i = 0; i < len; i++) {
      const x = W - (len - i) * step;
      const y = Math.max(1, H / 2 - hist[i].mx * scale);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    for (let i = len - 1; i >= 0; i--) {
      const x = W - (len - i) * step;
      const y = Math.min(H - 1, H / 2 - hist[i].mn * scale);
      g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = 'rgba(196,206,220,.32)'; g.fill();
    g.strokeStyle = 'rgba(224,231,242,.75)'; g.stroke();
    g.strokeStyle = '#262a31';
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  }

  function drawScope(an) {
    const d = adata(an);
    an.getFloatTimeDomainData(d.td);
    g.strokeStyle = accent; g.lineWidth = 1.5;
    g.beginPath();
    const n = d.td.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const y = H / 2 - d.td[i] * (H / 2) * 0.92;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.lineWidth = 1;
  }

  function drawHistory(an) {
    const d = adata(an);
    an.getFloatTimeDomainData(d.td);
    let pk = 0;
    for (let i = 0; i < d.td.length; i++) pk = Math.max(pk, Math.abs(d.td[i]));
    const db = Math.max(DB_BOT, Math.min(DB_TOP, lin2db(pk)));
    hist.push(db);
    if (hist.length > HIST_MAX) hist.shift();
    const len = hist.length;
    const step = W / Math.max(1, Math.min(len, W));
    const bw = Math.max(1, step - 1);
    for (let i = 0; i < len; i++) {
      const x = W - (len - i) * step;
      const y = yOf(hist[i]);
      g.fillStyle = 'rgba(132,170,250,.55)';
      g.fillRect(x, y, bw, H - y);
      if (hist[i] > -3) { g.fillStyle = '#ffd166'; g.fillRect(x, y, bw, 2); }
    }
  }

  function drawOverlays() {
    if (!getOverlays) return;
    for (const o of getOverlays()) {
      if (o.hline !== undefined) {
        const y = yFor(o.hline);
        g.strokeStyle = o.color || accent;
        g.setLineDash(o.dash ? [4, 3] : []);
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        g.setLineDash([]);
        if (o.label) { g.fillStyle = o.color || accent; g.font = '8px monospace'; g.fillText(o.label, 4, y - 3); }
      }
      if (o.vfreq !== undefined) {
        const x = xOfFreq(o.vfreq);
        g.strokeStyle = o.color || accent;
        g.setLineDash(o.dash ? [4, 3] : []);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
        g.setLineDash([]);
        if (o.label) { g.fillStyle = o.color || accent; g.font = '8px monospace'; g.fillText(o.label, x + 3, 10); }
      }
      if (o.zone) {
        const x0 = xOfFreq(o.zone.from), x1 = xOfFreq(o.zone.to);
        g.fillStyle = o.zone.fill || 'rgba(255,209,102,.07)';
        g.fillRect(x0, 0, x1 - x0, H);
      }
    }
  }

  function frame() {
    if (!alive) return;
    const an = engine && engine.getTrackAnalyser ? engine.getTrackAnalyser(trackId) : null;
    g.fillStyle = '#0e1013';
    g.fillRect(0, 0, W, H);
    if (mode === 'eq') {
      gridEq(true);
      if (an) drawSpectrum(an, true);
      if (getCurveNodes) drawEqCurve(getCurveNodes(), getBands && getBands());
    } else {
      gridLevel(mode === 'spectrum' || mode === 'deess');
      if (an) {
        if (mode === 'spectrum') drawSpectrum(an, false);
        else if (mode === 'deess') drawSpectrum(an, false);
        else if (mode === 'wave') drawWave(an);
        else if (mode === 'scope') drawScope(an);
        else if (mode === 'history') drawHistory(an);
      } else {
        g.fillStyle = '#4d5560'; g.font = '10px monospace';
        g.fillText(t('dsp.noSignal'), 10, H / 2);
      }
    }
    drawOverlays();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    el,
    destroy() { alive = false; ro.disconnect(); },
  };
}

// Каркас панели: дисплей сверху (.ff-main), метр справа, ряд кнобов добавляет плагин
export function proShell(container, o) {
  const layout = document.createElement('div');
  layout.className = 'ff-layout';
  layout.style.setProperty('--ff-accent', o.accent);
  const main = document.createElement('div');
  main.className = 'ff-main';
  const disp = makeDisplay({
    engine: o.engine, trackId: o.trackId, accent: o.accent,
    mode: o.mode, height: o.height || 180,
    getOverlays: o.getOverlays, getCurveNodes: o.getCurveNodes, getBands: o.getBands,
  });
  main.appendChild(disp.el);
  layout.appendChild(main);
  if (o.meter) {
    const right = document.createElement('div');
    right.className = 'ff-right';
    o.meter(right);
    layout.appendChild(right);
  }
  container.appendChild(layout);
  return { layout, main, disp };
}
