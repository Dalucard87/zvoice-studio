// Мультидорожечный таймлайн с айтемами (как в Reaper):
// на дорожке много клипов-айтемов со своими позициями; запись создаёт новый айтем,
// клипы двигаются за плашку с именем, Split режет активный айтем по курсору.
import {
  cut, del, silence, fadeIn, fadeOut, normalize,
  undo as undoOp, redo as redoOp, extract, pushOp,
} from '../engine/clip.js';
import { t as i18 } from '../i18n.js';

export const RULER_H = 26;
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function fmtTime(sec, withMs = true) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + (withMs ? '.' + String(ms).padStart(3, '0') : '');
}

const NAME_BAR = 15; // высота плашки с именем айтема

export class Timeline {
  constructor(opts) {
    this.o = opts;
    this.wave = opts.waveEl;
    this.ruler = opts.rulerEl;
    this.g = this.wave.getContext('2d');
    this.gr = this.ruler.getContext('2d');
    this.tracks = [];          // {id, name, color, items: [{id,name,chans,sr,len,start,rev,history}]}
    this.activeId = null;      // активная дорожка
    this.activeItemId = null;  // активный айтем (для операций монтажа)
    this.sel = null;
    this.cursor = 0;
    this.spp = 256;
    this.scroll = 0;
    this.playhead = -1;
    this.clipboard = null;
    this.live = null;          // {trackId, start, sr, data, w, len}
    this.dirty = true;
    this.w = 300; this.h = 200;
    this.laneH = 96;           // настраивается в ⚙ → «Высота дорожек»

    new ResizeObserver(() => this._resize()).observe(opts.areaEl);
    this._resize();
    const loop = () => { if (this.dirty) { this.dirty = false; this.drawAll(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this._bind();
  }

  requestDraw() { this.dirty = true; }

  maxEnd() {
    let m = 0;
    for (const t of this.tracks) for (const it of t.items) m = Math.max(m, it.start + it.len);
    return m;
  }
  itemCount() { let n = 0; for (const t of this.tracks) n += t.items.length; return n; }

  _resize() {
    const r = this.o.areaEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(300, r.width);
    this.h = Math.max(r.height - RULER_H, Math.max(1, this.tracks.length) * this.laneH);
    this.wave.width = Math.round(this.w * dpr);
    this.wave.height = Math.round(this.h * dpr);
    this.wave.style.width = this.w + 'px';
    this.wave.style.height = this.h + 'px';
    this.ruler.width = Math.round(this.w * dpr);
    this.ruler.height = Math.round(RULER_H * dpr);
    this.ruler.style.width = this.w + 'px';
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gr.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ph = this.o.playheadEl;
    if (ph) ph.style.height = this.h + 'px';
    this.requestDraw();
  }

  setLaneH(px) {
    px = Math.max(64, Math.min(128, Math.round(px)));
    if (this.laneH === px) return;
    this.laneH = px;
    this._resize();
    this.requestDraw();
  }

  setTracks(tracks, activeId) {
    this.tracks = tracks;
    this.activeId = activeId !== undefined ? activeId : this.activeId;
    if (this.activeId && !tracks.find((t) => t.id === this.activeId)) {
      this.activeId = tracks.length ? tracks[tracks.length - 1].id : null;
    }
    if (this.activeItemId && !this._findItem(this.activeItemId)) this.activeItemId = null;
    this.o.emptyEl.hidden = tracks.length > 0;
    this._resize();
  }
  setActive(id) {
    if (this.activeId === id) return;
    this.activeId = id;
    this.requestDraw();
    this.o.onactive && this.o.onactive(id);
  }
  active() { return this.tracks.find((t) => t.id === this.activeId) || null; }

  _findItem(id) {
    for (const t of this.tracks) for (const it of t.items) if (it.id === id) return { track: t, item: it };
    return null;
  }
  getActive() { return this._findItem(this.activeItemId); }
  setActiveItem(id) {
    if (this.activeItemId === id) return;
    this.activeItemId = id;
    this.requestDraw();
    this.o.onitem && this.o.onitem();
  }
  activeItem() {
    const a = this.getActive();
    return a && a.item.len > 0 ? a : null;
  }

  s2x(s) { return (s - this.scroll) / this.spp; }
  x2s(x) { return this.scroll + x * this.spp; }
  fitZoom() {
    this.spp = Math.max(1 / 64, this.maxEnd() / this.w || 256);
    this.scroll = 0;
    this.requestDraw();
  }

  // ---------- живая запись ----------
  beginLive(trackId, startSample) {
    this.live = { trackId, start: startSample, sr: 48000, data: new Float32Array(48000 * 20), w: 0, len: 0 };
    this.requestDraw();
  }
  pushLive(chans, frames, sr) {
    const L = this.live;
    if (!L) return;
    L.sr = sr || L.sr;
    const src = chans[0];
    for (let i = 0; i < frames; i++) {
      L.data[L.w] = src ? src[i] : 0;
      L.w = (L.w + 1) % L.data.length;
      L.len = Math.min(L.len + 1, L.data.length);
    }
    this.requestDraw();
  }
  endLive() { this.live = null; this.requestDraw(); }

  // ---------- отрисовка ----------
  drawAll() {
    this._drawRuler();
    this._drawWave();
    const ph = this.o.playheadEl;
    if (ph) {
      if (this.playhead >= 0) {
        ph.hidden = false;
        ph.style.left = this.s2x(this.playhead) + 'px';
      } else ph.hidden = true;
    }
  }

  _drawRuler() {
    const g = this.gr, w = this.w, h = RULER_H;
    g.fillStyle = '#15181e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b313d';
    g.beginPath(); g.moveTo(0, h - 0.5); g.lineTo(w, h - 0.5); g.stroke();
    const sr = this.live ? this.live.sr : 48000;
    const secPerPx = this.spp / sr;
    let step = STEPS[STEPS.length - 1];
    for (const s of STEPS) { if (s / secPerPx >= 80) { step = s; break; } }
    g.fillStyle = '#5a6272'; g.font = '10px monospace';
    const t0 = Math.floor(this.scroll / sr / step) * step;
    for (let t = t0; ; t += step) {
      const x = this.s2x(t * sr);
      if (x > w) break;
      if (x >= 0) {
        g.fillRect(x, h - 6, 1, 6);
        g.fillText(fmtTime(t, step < 1), x + 3, 12);
      }
    }
  }

  _itemAt(track, sample) {
    return track.items.find((it) => sample >= it.start && sample < it.start + it.len) || null;
  }

  _drawWave() {
    const g = this.g, w = this.w, h = this.h;
    g.fillStyle = '#0e1014';
    g.fillRect(0, 0, w, h);

    if (this.sel && this.sel.b > this.sel.a) {
      const x1 = this.s2x(this.sel.a), x2 = this.s2x(this.sel.b);
      g.fillStyle = 'rgba(255,159,67,.13)';
      g.fillRect(x1, 0, x2 - x1, h);
      g.fillStyle = 'rgba(255,159,67,.55)';
      g.fillRect(x1, 0, 1, h); g.fillRect(x2 - 1, 0, 1, h);
    }

    this.tracks.forEach((track, i) => {
      const top = i * this.laneH;
      if (track.id === this.activeId) {
        g.fillStyle = 'rgba(255,255,255,.025)';
        g.fillRect(0, top, w, this.laneH);
        g.fillStyle = track.color || '#ff9f43';
        g.fillRect(0, top, 3, this.laneH);
      }
      g.strokeStyle = '#232833';
      g.beginPath(); g.moveTo(0, top + this.laneH - 0.5); g.lineTo(w, top + this.laneH - 0.5); g.stroke();

      if (this.live && this.live.trackId === track.id) { this._drawLive(g, w, top); return; }
      if (!track.items.length) {
        g.fillStyle = '#4a5261';
        g.font = '12px sans-serif';
        g.textAlign = 'center';
        g.fillText(i18('laneEmpty'), w / 2, top + this.laneH / 2);
        g.textAlign = 'left';
        return;
      }
      for (const item of track.items) this._drawItem(g, top, track, item);
    });

    const cx = this.s2x(this.cursor);
    if (cx >= -2 && cx <= w + 2) {
      g.strokeStyle = '#e8edf5';
      g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
    }
  }

  _drawItem(g, top, track, item) {
    const x0 = this.s2x(item.start);
    const x1 = this.s2x(item.start + item.len);
    if (x1 <= 0 || x0 >= this.w) return;
    const active = item.id === this.activeItemId;
    const laneH = this.laneH;
    const bodyTop = top + NAME_BAR;

    g.fillStyle = active ? 'rgba(122,162,247,.16)' : 'rgba(122,162,247,.07)';
    g.fillRect(x0, bodyTop, x1 - x0, laneH - NAME_BAR - 1);
    g.strokeStyle = active ? (track.color || '#7aa2f7') : 'rgba(122,162,247,.4)';
    g.strokeRect(x0 + 0.5, bodyTop + 0.5, x1 - x0 - 1, laneH - NAME_BAR - 2);

    g.fillStyle = track.color || '#7aa2f7';
    g.fillRect(x0, top, x1 - x0, NAME_BAR);
    g.fillStyle = '#0e1014';
    g.font = 'bold 9px sans-serif';
    g.save();
    g.beginPath(); g.rect(x0 + 2, top, Math.max(0, x1 - x0 - 4), NAME_BAR); g.clip();
    g.fillText(item.name, x0 + 4, top + 10);
    g.restore();

    const pad = 4;
    const waveTop = bodyTop + 2, waveH = laneH - NAME_BAR - pad - 3;
    const lanes = Math.min(2, item.chans.length);
    const laneLane = waveH / lanes;
    const spp = this.spp;
    for (let l = 0; l < lanes; l++) {
      const data = item.chans[Math.min(l, item.chans.length - 1)];
      const mid = waveTop + laneLane * l + laneLane / 2;
      const amp = (laneLane / 2) * 0.92;
      g.strokeStyle = l === 0 ? (active ? '#cdd9f5' : 'rgba(160,180,220,.75)') : 'rgba(122,162,247,.5)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        let s0 = Math.floor(this.scroll + x * spp) - item.start;
        let s1 = Math.floor(this.scroll + (x + 1) * spp) - item.start;
        if (s1 <= 0 || s0 >= item.len) continue;
        s0 = Math.max(0, s0); s1 = Math.min(item.len, s1);
        let mn = 1, mx = -1;
        const stride = Math.max(1, Math.floor((s1 - s0) / 60));
        for (let i = s0; i < s1; i += stride) { const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        if (s1 - s0 <= 2) { mn = data[s0] || 0; mx = data[s0] || 0; }
        if (mn > mx) { mn = 0; mx = 0; }
        g.moveTo(x + 0.5, mid - mx * amp);
        g.lineTo(x + 0.5, Math.max(mid - mn * amp, mid - mx * amp + 0.5));
      }
      g.stroke();
    }
  }

  _drawLive(g, w, top) {
    const L = this.live;
    const spp = 220;
    const x0 = this.s2x(L.start);
    const mid = top + (NAME_BAR + this.laneH) / 2, amp = (this.laneH / 2 - 12) * 0.92;
    g.fillStyle = 'rgba(255,82,82,.08)';
    g.fillRect(x0, top + NAME_BAR, Math.max(0, w - x0), this.laneH - NAME_BAR - 1);
    g.strokeStyle = '#ff5252';
    g.beginPath();
    const total = Math.min(L.len, Math.floor(Math.max(0, w - x0) * spp));
    for (let x = Math.max(0, Math.floor(x0)); x < w; x++) {
      let s0 = L.len - total + (x - Math.max(0, Math.floor(x0))) * spp;
      if (s0 < 0 || s0 >= L.len) continue;
      let mn = 1, mx = -1;
      const stride = Math.max(1, Math.floor(spp / 60));
      for (let i = s0; i < Math.min(s0 + spp, L.len); i += stride) {
        const v = L.data[(L.w - L.len + i + L.data.length * 2) % L.data.length];
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      if (mn > mx) { mn = 0; mx = 0; }
      g.moveTo(x + 0.5, mid - mx * amp);
      g.lineTo(x + 0.5, Math.max(mid - mn * amp, mid - mx * amp + 0.5));
    }
    g.stroke();
  }

  // ---------- ввод ----------
  _laneAt(y) {
    const idx = Math.max(0, Math.min(this.tracks.length - 1, Math.floor(y / this.laneH)));
    return this.tracks[idx] || null;
  }

  _bind() {
    const c = this.wave;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const track = this._laneAt(y);
      if (track && track.id !== this.activeId) this.setActive(track.id);
      c.setPointerCapture(e.pointerId);
      const s = this.x2s(x);
      const item = track ? this._itemAt(track, s) : null;
      if (item) this.setActiveItem(item.id);
      if (item && y < this.tracks.indexOf(track) * this.laneH + NAME_BAR) {
        drag = { kind: 'item', item, track, grab: s - item.start };
        this.requestDraw();
        return;
      }
      if (e.altKey) {
        drag = { kind: 'seek' };
        this.cursor = Math.max(0, s);
      } else {
        drag = { kind: 'sel', anchor: s, moved: false };
        this.sel = null;
      }
      this.requestDraw();
      this.o.onselect && this.o.onselect();
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (drag.kind === 'seek') {
        this.cursor = Math.max(0, this.x2s(x));
      } else if (drag.kind === 'item') {
        drag.item.start = Math.max(0, Math.round(this.x2s(x) - drag.grab));
        // перенос между дорожками
        const laneTrack = this._laneAt(y);
        if (laneTrack && drag.track && laneTrack.id !== drag.track.id) {
          const idx = drag.track.items.indexOf(drag.item);
          if (idx >= 0) drag.track.items.splice(idx, 1);
          laneTrack.items.push(drag.item);
          drag.track = laneTrack;
          this.setActive(laneTrack.id);
        }
      } else {
        const s = this.x2s(x);
        if (Math.abs(s - drag.anchor) > 2 / this.spp) drag.moved = true;
        this.sel = { a: Math.max(0, Math.min(drag.anchor, s)), b: Math.max(drag.anchor, s) };
        this.o.onselect && this.o.onselect();
      }
      this.requestDraw();
    });
    const up = (e) => {
      if (!drag) return;
      if (drag.kind === 'sel' && !drag.moved) {
        this.cursor = Math.max(0, drag.anchor);
        this.sel = null;
        this.o.onselect && this.o.onselect();
      }
      if (drag.kind === 'item') this.o.onitemsmoved && this.o.onitemsmoved();
      drag = null;
      this.requestDraw();
      try { c.releasePointerCapture(e.pointerId); } catch {}
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', () => this.selectAll());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const sc = this.x2s(mx);
        this.spp = Math.max(1 / 64, Math.min(this.spp * (e.deltaY > 0 ? 1.25 : 1 / 1.25), 1e7));
        this.scroll = sc - mx * this.spp;
      } else if (e.shiftKey) {
        e.preventDefault();
        this.scroll += (e.deltaY + e.deltaX) * this.spp * 0.6;
      } else {
        const tl = this.o.scrollEl;
        const canScrollY = tl && tl.scrollHeight > tl.clientHeight + 2;
        if (canScrollY) return;
        e.preventDefault();
        this.scroll += (e.deltaY + e.deltaX) * this.spp * 0.6;
      }
      if (this.tracks.length) this.scroll = Math.max(-this.w * this.spp * 0.2, Math.min(this.scroll, this.maxEnd()));
      this.requestDraw();
    }, { passive: false });

    const r = this.ruler;
    let rdrag = false;
    const seek = (e) => {
      const rect = r.getBoundingClientRect();
      this.cursor = Math.max(0, this.x2s(e.clientX - rect.left));
      this.requestDraw();
      this.o.onselect && this.o.onselect();
    };
    r.addEventListener('pointerdown', (e) => { rdrag = true; r.setPointerCapture(e.pointerId); seek(e); });
    r.addEventListener('pointermove', (e) => { if (rdrag) seek(e); });
    const rup = (e) => { rdrag = false; try { r.releasePointerCapture(e.pointerId); } catch {} };
    r.addEventListener('pointerup', rup);
    r.addEventListener('pointercancel', rup);
  }

  ensureVisible(s) {
    const margin = 40;
    const x = this.s2x(s);
    if (x > this.w - margin || x < margin) {
      this.scroll = s - (x > this.w - margin ? (this.w - margin) : margin) * this.spp;
      this.requestDraw();
    }
  }

  // ---------- локальные координаты активного айтема ----------
  _localRange() {
    const a = this.getActive();
    if (!a || !a.item.len) return null;
    const item = a.item;
    let a0, b0;
    if (this.sel && this.sel.b > this.sel.a) {
      a0 = this.sel.a - item.start; b0 = this.sel.b - item.start;
    } else {
      a0 = b0 = this.cursor - item.start;
    }
    a0 = Math.max(0, Math.min(item.len, Math.floor(a0)));
    b0 = Math.max(0, Math.min(item.len, Math.floor(b0)));
    return { track: a.track, item, a: a0, b: b0 };
  }
  _afterEdit() {
    const a = this.getActive();
    if (a && a.item) this.cursor = Math.min(this.cursor, a.item.start + a.item.len);
    const m = this.maxEnd();
    if (this.sel) {
      this.sel.a = Math.max(0, Math.min(this.sel.a, m));
      this.sel.b = Math.max(0, Math.min(this.sel.b, m));
      if (this.sel.b <= this.sel.a) this.sel = null;
    }
    this.requestDraw();
    this.o.onchanged && this.o.onchanged();
  }
  selectAll() { const m = this.maxEnd(); if (m > 0) { this.sel = { a: 0, b: m }; this.requestDraw(); this.o.onselect && this.o.onselect(); } }
  clearSel() { this.sel = null; this.requestDraw(); this.o.onselect && this.o.onselect(); }

  // ---------- монтаж (над активным айтемом, локальные координаты) ----------
  doCut() {
    const L = this._localRange(); if (!L || L.b <= L.a) return;
    this.clipboard = extract(L.item, L.a, L.b);
    cut(L.item, L.a, L.b);
    this.sel = null; this.cursor = L.item.start + L.a;
    this._afterEdit();
  }
  doCopy() {
    const L = this._localRange(); if (!L || L.b <= L.a) return;
    this.clipboard = extract(L.item, L.a, L.b);
  }
  doPaste() {
    const a = this.getActive(); if (!a || !this.clipboard) return;
    const item = a.item;
    const at = Math.max(0, Math.min(item.len, Math.floor(this.cursor - item.start)));
    pushOp(item, {
      at,
      removed: item.chans.map(() => new Float32Array(0)),
      inserted: this.clipboard.map((x) => x.slice()),
    });
    this.sel = { a: item.start + at, b: item.start + at + this.clipboard[0].length };
    this.cursor = this.sel.b;
    this._afterEdit();
  }
  doDelete() {
    const L = this._localRange(); if (!L || L.b <= L.a) return;
    del(L.item, L.a, L.b);
    this.sel = null; this.cursor = L.item.start + L.a;
    this._afterEdit();
  }
  doSilence() {
    const L = this._localRange(); if (!L || L.b <= L.a) return;
    silence(L.item, L.a, L.b);
    this._afterEdit();
  }
  doFadeIn() { const L = this._localRange(); if (!L || L.b <= L.a) return; fadeIn(L.item, L.a, L.b); this._afterEdit(); }
  doFadeOut() { const L = this._localRange(); if (!L || L.b <= L.a) return; fadeOut(L.item, L.a, L.b); this._afterEdit(); }
  doNormalize() { const L = this._localRange(); if (!L || L.b <= L.a) return; normalize(L.item, L.a, L.b, -1); this._afterEdit(); }

  // Split: активный айтем режется по курсору на два айтема той же дорожки
  doSplit() {
    const a = this.getActive();
    if (!a || !a.item.len) { this.o.onspliterr && this.o.onspliterr('t.noClip'); return false; }
    const item = a.item;
    const local = Math.floor(this.cursor - item.start);
    if (local <= 0 || local >= item.len) { this.o.onspliterr && this.o.onspliterr('split.needCursor'); return false; }
    const rightLen = item.len - local;
    const rightChans = item.chans.map((d) => d.slice(local));
    pushOp(item, { at: local, removed: rightChans, inserted: [] });
    const right = {
      id: 'i' + Math.random().toString(36).slice(2, 9),
      name: item.name + ' ·2',
      chans: rightChans, sr: item.sr, len: rightLen,
      start: item.start + local, rev: 1, history: { undo: [], redo: [] },
    };
    item.len = local;
    item.rev = (item.rev || 0) + 1;
    a.track.items.push(right);
    this.setActiveItem(right.id);
    this.requestDraw();
    this.o.onchanged && this.o.onchanged();
    return true;
  }

  doUndo() { const a = this.getActive(); if (a && a.item && undoOp(a.item)) this._afterEdit(); }
  doRedo() { const a = this.getActive(); if (a && a.item && redoOp(a.item)) this._afterEdit(); }
  canUndo() { const a = this.getActive(); return !!(a && a.item && a.item.history.undo.length); }
  canRedo() { const a = this.getActive(); return !!(a && a.item && a.item.history.redo.length); }
}
