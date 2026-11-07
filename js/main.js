// ZVoice Studio — мультидорожечная студия: дорожки, запись (овердаб),
// монтаж, цепочка эффектов на дорожку, экспорт микса
import { Engine } from './engine/engine.js';
import { Recorder } from './engine/recorder.js';
import { renderMix, renderClip, downloadBlob, mixTracksOffline } from './engine/exporter.js';
import { encodeWav } from './engine/wav.js';
import { makeZip, readZip } from './engine/zip.js';
import { idbGet, idbSet } from './engine/idb.js';
import { Timeline, fmtTime } from './ui/timeline.js';
import { LevelMeter, Spectrum } from './ui/meters.js';
import { FxRack } from './ui/fxrack.js';
import { clipFromAudioBuffer, makeClip } from './engine/clip.js';
import { pushOp } from './engine/clip.js';
import {
  t, getLang, setLang, applyStatic,
  loadSettings as i18nLoadSettings, saveSettings as i18nSaveSettings,
} from './i18n.js';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'zvoice.tracks.v2';
const COLORS = ['#ff9f43', '#43d6b5', '#7aa2f7', '#f7768e', '#e0af68', '#9ece6a', '#bb9af7', '#73daca'];

let engine, recorder, timeline, rack;
let tracks = [];
let activeId = null;
let seq = 0;
let playing = false, playSources = [], playT0 = 0, playStart = 0;
let loopOn = false;
let recording = false, recTargetId = null, liveTimer = null;
let recStartSample = 0, recPunchSel = null; // точка панча
let headphonesWarned = false;
let itemSeq = 0;

function makeItem(name, chans, sr, start = 0) {
  return {
    id: 'i' + (++itemSeq), name, chans, sr,
    len: chans[0].length, start, rev: 1,
    history: { undo: [], redo: [] },
  };
}

const bufCache = new WeakMap();

// ---------------- Настройки ----------------
let settings = {
  lang: getLang(), theme: 'dark', accent: '', scale: 1, laneH: 96,
  sinkId: '', overdub: true, follow: true, confirmDel: true, masterVol: 1,
  projectDirName: '', hotkeys: {},
};
let stBase = '';
function loadUserSettings() { Object.assign(settings, i18nLoadSettings()); }
function persistSettings() { i18nSaveSettings(settings); }
// ---------------- Горячие клавиши ----------------
const HK_DEFAULTS = {
  play: 'Space', record: 'KeyR', loop: 'KeyL', del: 'Delete',
  undo: 'Ctrl+KeyZ', redo: 'Ctrl+Shift+KeyZ', cut: 'Ctrl+KeyX',
  copy: 'Ctrl+KeyC', paste: 'Ctrl+KeyV', selall: 'Ctrl+KeyA',
  clearsel: 'Escape', home: 'Home', split: null, merge: null,
};
let hkCapture = null; // действие, ожидающее нажатия клавиши

function hotkeys() { return Object.assign({}, HK_DEFAULTS, settings.hotkeys || {}); }
function eventCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}
function hkPretty(combo) { return combo.split('+').map((p) => p.replace(/^Key|^Digit/, '')).join('+'); }
function updateStatusHint() {
  const hk = hotkeys();
  $('st-hint').textContent = t('st.hint.dyn', { play: hkPretty(hk.play), record: hkPretty(hk.record) });
}
function doAction(act, e) {
  switch (act) {
    case 'play': playing ? stopPlay() : playFrom(timeline.cursor); break;
    case 'record': toggleRecord(); break;
    case 'loop': toggleLoop(); break;
    case 'del': timeline.doDelete(); refreshButtons(); break;
    case 'undo': timeline.doUndo(); refreshButtons(); break;
    case 'redo': timeline.doRedo(); refreshButtons(); break;
    case 'cut': timeline.doCut(); refreshButtons(); break;
    case 'copy': timeline.doCopy(); break;
    case 'paste': timeline.doPaste(); refreshButtons(); break;
    case 'selall': timeline.selectAll(); break;
    case 'clearsel': timeline.clearSel(); refreshButtons(); break;
    case 'home': timeline.cursor = 0; timeline.scroll = 0; timeline.requestDraw(); break;
    case 'split': splitActiveTrack(); refreshButtons(); break;
    case 'merge': mergeTracks(); break;
  }
}

function applySettings() {
  document.body.classList.toggle('theme-black', settings.theme === 'black');
  document.body.classList.toggle('theme-mid', settings.theme === 'mid');
  const root = document.documentElement;
  if (settings.accent) root.style.setProperty('--accent', settings.accent);
  else root.style.removeProperty('--accent');
  root.style.setProperty('--lane-h', (settings.laneH || 96) + 'px');
  document.body.style.zoom = (settings.scale && settings.scale !== 1) ? settings.scale : '';
  if (timeline && timeline.setLaneH) timeline.setLaneH(settings.laneH || 96);
  try {
    if (engine && engine.ctx && engine.ctx.setSinkId) engine.ctx.setSinkId(settings.sinkId || '');
  } catch {}
  if (engine && engine.setMasterVolume) engine.setMasterVolume(settings.masterVol ?? 1);
}

function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.toggle('err', err);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const debSave = debounce(saveState, 500);

const activeTrack = () => tracks.find((t) => t.id === activeId) || null;

// ---------------- Дорожки ----------------
function newTrack(name, chStates = null) {
  seq++;
  const trackName = name || t('track.default', { n: seq });
  const trk = {
    id: 't' + seq,
    name: trackName,
    items: [],
    chStates: chStates || [],
    gain: 1, pan: 0, mute: false, solo: false,
    color: COLORS[(seq - 1) % COLORS.length],
  };
  tracks.push(trk);
  engine.ensureTrack(trk.id, trk.chStates);
  activeId = trk.id;
  timeline.setTracks(tracks, activeId);
  syncMix();
  renderStrip();
  return trk;
}

function removeTrack(id) {
  const trk = tracks.find((x) => x.id === id);
  if (!trk) return;
  if (recording && recTargetId === id) finishRecord();
  if (trk.items.length > 0 && (!settings.confirmDel || !confirm(t('t.delTrack', { name: trk.name })))) return;
  engine.removeTrack(id);
  tracks = tracks.filter((x) => x.id !== id);
  if (activeId === id) activeId = tracks.length ? tracks[tracks.length - 1].id : null;
  if (rack && rack.pinnedId === id) rack.close();
  timeline.setTracks(tracks, activeId);
  syncMix();
  renderStrip();
  saveState();
  if (!tracks.length) toast(t('t.delAll'));
}

function setActive(id) {
  if (activeId === id) return;
  activeId = id;
  timeline.setActive(id); // вызовет onactive → renderStrip + rack
}

function renderStrip() {
  const rows = $('track-rows');
  rows.innerHTML = '';
  for (const trk of tracks) {
    const row = document.createElement('div');
    row.className = 'track-row' + (trk.id === activeId ? ' active' : '');
    row.style.setProperty('--tc', trk.color);
    row.innerHTML = `
      <div class="tr-top">
        <span class="tr-dot" style="background:${trk.color}"></span>
        <span class="tr-name" title="${t('tip.tr.rename')}">${trk.name}</span>
        <button class="tr-del" title="${t('tip.tr.del')}">✕</button>
      </div>
      <div class="tr-btns">
        <button class="tr-m ${trk.mute ? 'on' : ''}" title="${t('tip.tr.m')}">M</button>
        <button class="tr-s ${trk.solo ? 'on' : ''}" title="${t('tip.tr.s')}">S</button>
        <button class="tr-fx ${rack && rack.pinnedId === trk.id ? 'on' : ''}" title="${t('tip.tr.fx')}">FX</button>
        <label class="tr-sliders" title="${t('tip.tr.vol')}">🔊<input type="range" min="0" max="1.6" step="0.01" value="${trk.gain}" class="tr-vol"></label>
        <label class="tr-sliders" title="${t('tip.tr.pan')}">⟷<input type="range" min="-1" max="1" step="0.05" value="${trk.pan}" class="tr-pan"></label>
      </div>`;
    row.addEventListener('click', () => setActive(trk.id));
    row.querySelector('.tr-name').addEventListener('dblclick', () => {
      const n = prompt(t('t.trackName'), trk.name);
      if (n) {
        trk.name = n;
        renderStrip();
        if (rack && rack.pinnedId === trk.id) rack.renderAll();
        saveState();
      }
    });
    row.querySelector('.tr-del').addEventListener('click', (e) => { e.stopPropagation(); removeTrack(trk.id); });
    row.querySelector('.tr-m').addEventListener('click', (e) => { e.stopPropagation(); trk.mute = !trk.mute; syncMix(); renderStrip(); saveState(); });
    row.querySelector('.tr-s').addEventListener('click', (e) => { e.stopPropagation(); trk.solo = !trk.solo; syncMix(); renderStrip(); saveState(); });
    row.querySelector('.tr-fx').addEventListener('click', (e) => { e.stopPropagation(); rack.toggle(trk.id); });
    row.querySelector('.tr-vol').addEventListener('input', (e) => { trk.gain = +e.target.value; syncMix(); debSave(); });
    row.querySelector('.tr-pan').addEventListener('input', (e) => { trk.pan = +e.target.value; syncMix(); debSave(); });
    rows.appendChild(row);
  }
  if (engine) {
    $('st-sample').textContent = stBase + ' · ' + t('st.tracks', { n: tracks.length });
  }
}

function syncMix() {
  const params = {};
  for (const t of tracks) params[t.id] = { gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo };
  engine.applyMix(params);
}

// ---------------- Состояние ----------------
// Каждый запуск — полностью пустой проект без дорожек
function saveState() { /* проекты намеренно не сохраняются между запусками */ }

function loadState() {
  try { localStorage.removeItem(LS_KEY); } catch {}
  timeline.setTracks(tracks, null);
  renderStrip();
}

// ---------------- Воспроизведение ----------------
function getBuffer(item) {
  let c = bufCache.get(item);
  if (!c || c.rev !== item.rev) {
    const buf = engine.ctx.createBuffer(item.chans.length, item.len, item.sr);
    for (let ch = 0; ch < item.chans.length; ch++) buf.copyToChannel(item.chans[ch], ch);
    c = { rev: item.rev, buf };
    bufCache.set(item, c);
  }
  return c.buf;
}

function stopPlay() {
  for (const s of playSources) { try { s.stop(); } catch {} try { s.disconnect(); } catch {} }
  playSources = [];
  playing = false;
  timeline.playhead = -1;
  timeline.requestDraw();
  $('btn-play').textContent = '▶';
}

function playFrom(fromSample) {
  stopPlay();
  if (!timeline.itemCount()) return;
  engine.resume();
  const sel = timeline.sel;
  const useLoop = loopOn && !recording && sel && sel.b > sel.a;
  const start = Math.max(0, Math.min(fromSample, timeline.maxEnd()));
  for (const trk of tracks) {
    if (recording && trk.id === recTargetId) continue; // записываемую дорожку не играем
    for (const item of trk.items) {
      const iEnd = item.start + item.len;
      if (useLoop && sel) {
        if (iEnd <= sel.a || item.start >= sel.b) continue;
      } else if (start >= iEnd) continue;
      const src = engine.ctx.createBufferSource();
      src.buffer = getBuffer(item);
      if (useLoop) {
        src.loop = true;
        src.loopStart = sel.a / item.sr;
        src.loopEnd = sel.b / item.sr;
        src.start(0, Math.max(0, Math.max(sel.a, start) - item.start) / item.sr);
      } else {
        const when = item.start >= start ? (item.start - start) / item.sr : 0;
        const off = Math.max(0, start - item.start);
        src.start(when, off / item.sr);
      }
      engine.connectPlayback(trk.id, src);
      playSources.push(src);
    }
  }
  playing = true;
  playT0 = engine.ctx.currentTime;
  playStart = start;
  $('btn-play').textContent = '⏸';
  tickPlay();
}

function tickPlay() {
  if (!playing) return;
  const sel = timeline.sel;
  const useLoop = loopOn && !recording && sel && sel.b > sel.a;
  let pos = playStart + (engine.ctx.currentTime - playT0) * engine.sampleRate;
  const maxLen = timeline.maxEnd();
  if (useLoop && pos > sel.b) pos = sel.a + ((pos - sel.a) % (sel.b - sel.a));
  if (pos >= maxLen && !useLoop) { stopPlay(); return; }
  pos = Math.min(pos, maxLen);
  timeline.playhead = pos;
  if (settings.follow) timeline.ensureVisible(pos);
  timeline.requestDraw();
  $('timecode').textContent = fmtTime(pos / engine.sampleRate);
  requestAnimationFrame(tickPlay);
}

// ---------------- Запись (в дорожку, с овердабом) ----------------
async function toggleRecord() {
  if (recording) { finishRecord(); return; }
  stopPlay();
  // запись ВСЕГДА в активную дорожку; новая создаётся только если дорожек нет
  let target = activeTrack();
  if (!target) target = newTrack(t('track.voice'));
  recTargetId = target.id;
  // точка панча: выделение → заменяем выделенное, иначе — от курсора
  const sel = timeline.sel;
  if (sel && sel.b > sel.a) {
    recStartSample = Math.floor(sel.a);
    recPunchSel = [Math.floor(sel.a), Math.floor(sel.b)];
  } else {
    recStartSample = Math.floor(timeline.cursor);
    recPunchSel = null;
  }
  try {
    await recorder.start($('device-select').value || undefined);
  } catch (e) {
    toast(t('t.micErr', { err: e.message }), true);
    return;
  }
  engine.beginRecordInto(target.id, recorder.micNode);
  recording = true;
  $('btn-record').classList.add('recording');
  timeline.setActive(target.id);
  timeline.beginLive(target.id, recStartSample);
  recorder.onChunk = (chans, frames) => timeline.pushLive(chans, frames, engine.sampleRate);
  liveTimer = setInterval(() => {
    $('timecode').textContent = fmtTime(recorder.elapsed);
    // индикатор REC — в заголовке панели дорожек (не перекрывает линейку)
    const sp = document.querySelector('.strip-spacer');
    if (sp) { sp.textContent = '● REC ' + fmtTime(recorder.elapsed); sp.classList.add('rec'); }
  }, 100);
  if (settings.overdub) playFrom(recStartSample); // овердаб: остальные дорожки играют
  toast(t('t.recording', { name: target.name, overdub: playSources.length ? t('t.overdub.on') : t('t.overdub.off') }));
  refreshDevices();
}

// Reaper-style: новая запись перекрывает старые айтемы дорожки — подрезаем их
function trimOverlaps(track, start, end) {
  for (const it of [...track.items]) {
    const s = it.start, e = it.start + it.len;
    if (e <= start || s >= end) continue;
    if (s >= start && e <= end) {
      track.items.splice(track.items.indexOf(it), 1);
      continue;
    }
    if (s < start && e > end) {
      // айтем накрывает всю запись — режем на два
      const leftLen = start - s;
      const rightChans = it.chans.map((d) => d.slice(end - s));
      pushOp(it, { at: leftLen, removed: it.chans.map((d) => d.slice(leftLen)), inserted: [] });
      it.len = leftLen;
      it.rev = (it.rev || 0) + 1;
      track.items.push(makeItem(it.name + ' ·2', rightChans, it.sr, end));
    } else if (s < start) {
      // хвост айтема заходит в зону — обрезаем правый край
      const keep = start - s;
      pushOp(it, { at: keep, removed: it.chans.map((d) => d.slice(keep)), inserted: [] });
    } else {
      // голова айтема в зоне — обрезаем левый край
      const head = end - s;
      pushOp(it, { at: 0, removed: it.chans.map((d) => d.slice(0, head)), inserted: [] });
      it.start = end;
      it.rev = (it.rev || 0) + 1;
    }
  }
}

function finishRecord() {
  if (!recording) return;
  recording = false;
  clearInterval(liveTimer);
  $('btn-record').classList.remove('recording');
  const clip = recorder.stop();
  engine.endRecord();
  stopPlay();
  timeline.endLive();
  const tr = tracks.find((x) => x.id === recTargetId);
  recTargetId = null;
  if (clip && tr) {
    // запись = НОВЫЙ айтем в точке старта (как в Reaper); старые айтемы подрезаются
    trimOverlaps(tr, recStartSample, recStartSample + clip.len);
    tr.items.push(makeItem('Take ' + (tr.items.length + 1), clip.chans, clip.sr, recStartSample));
    timeline.sel = null;
    timeline.cursor = recStartSample + clip.len; // следующий дубль пишется сразу после
    timeline.ensureVisible(timeline.cursor);
    timeline.setTracks(tracks, activeId);
    toast(t('t.recorded', { name: tr.name, len: fmtTime(clip.len / clip.sr) }));
  } else if (!clip) {
    toast(t('t.emptyRec'), true);
  }
  // вернуть заголовок панели дорожек
  const sp = document.querySelector('.strip-spacer');
  if (sp) { sp.textContent = t('tracks'); sp.classList.remove('rec'); }
  refreshButtons();
}

// ---------------- Импорт ----------------
async function importFile(file) {
  if (!file) return;
  try {
    const ab = await file.arrayBuffer();
    const audio = await engine.ctx.decodeAudioData(ab);
    const name = file.name.replace(/\.[^.]+$/, '');
    const trk = newTrack(name);
    trk.items.push(makeItem(name, clipFromAudioBuffer(audio, name).chans, audio.sampleRate, 0));
    timeline.fitZoom();
    toast(t('t.imported', { file: file.name }));
  } catch (e) {
    toast(t('t.decodeErr', { err: e.message }), true);
  }
}

// ---------------- Разделение и склейка дорожек ----------------
function splitActiveTrack() {
  if (!timeline.doSplit()) return;
  refreshButtons();
}

async function mergeTracks() {
  if (timeline.itemCount() < 1) { toast(t('merge.need2'), true); return; }
  toast(t('merge.render'));
  try {
    const { chans, sr } = await mixTracksOffline(tracks, { chain: true });
    const trk = newTrack(t('track.merged'), makeClip(t('track.merged'), chans, sr));
    timeline.fitZoom();
    toast(t('merge.done', { name: trk.name }));
  } catch (e) {
    toast(t('proj.err', { err: e.message }), true);
  }
}

// ---------------- Проекты (.zip: WAV дорожек + настройки) ----------------
async function getProjectDir() {
  const handle = await idbGet('projectDir');
  if (!handle) return null;
  try {
    if (await handle.queryPermission({ mode: 'readwrite' }) === 'prompt') {
      await handle.requestPermission({ mode: 'readwrite' });
    }
    if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') return null;
    return handle;
  } catch { return null; }
}

function buildProjectFiles() {
  const files = [];
  const meta = { version: 2, sampleRate: engine.sampleRate, tracks: [] };
  tracks.forEach((t, i) => {
    const entry = {
      name: t.name, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
      chStates: engine.chainStates(t.id), items: [],
    };
    t.items.forEach((item, k) => {
      const wavName = 'track-' + String(i + 1).padStart(2, '0') + '-item-' + String(k + 1).padStart(2, '0') + '.wav';
      entry.items.push({ name: item.name, start: item.start, wav: wavName });
      files.push({ name: wavName, data: new Uint8Array(encodeWav(item.chans, item.sr, 24)) });
    });
    meta.tracks.push(entry);
  });
  files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 1)) });
  return { files, meta };
}

async function saveProject() {
  try {
    if (!tracks.length) { toast(t('t.noClip'), true); return; }
    const { files } = buildProjectFiles();
    const zip = makeZip(files);
    const base = (prompt(t('proj.name'), 'project') || 'project').replace(/[^\wа-яёА-ЯЁ\- ]/g, '').trim() || 'project';
    const fname = base + '.zvproj';
    const dir = await getProjectDir();
    if (dir) {
      const fh = await dir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(zip); await w.close();
      toast(t('proj.saved', { file: (dir.name || '.') + '/' + fname }));
    } else if (window.showSaveFilePicker) {
      const fh = await window.showSaveFilePicker({
        suggestedName: fname,
        types: [{ description: 'ZVoice project', accept: { 'application/zip': ['.zvproj', '.zip'] } }],
      });
      const w = await fh.createWritable();
      await w.write(zip); await w.close();
      toast(t('proj.saved', { file: fh.name }));
    } else {
      downloadBlob(new Blob([zip], { type: 'application/zip' }), fname);
      toast(t('proj.saved', { file: fname }));
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') toast(t('proj.err', { err: e.message }), true);
  }
}

async function openProjectFile(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = readZip(buf);
    const jsonEntry = entries.find((x) => x.name === 'project.json');
    if (!jsonEntry) throw new Error('project.json not found');
    const meta = JSON.parse(new TextDecoder().decode(jsonEntry.data));
    stopPlay();
    if (tracks.some((x) => x.items.length) && !confirm(t('proj.overwrite'))) return;
    for (const x of [...tracks]) engine.removeTrack(x.id);
    tracks = []; seq = 0; activeId = null;
    timeline.setTracks(tracks, null);
    for (const td of meta.tracks) {
      const trk = newTrack(td.name || t('track.default', { n: seq }), td.chStates || []);
      trk.gain = td.gain ?? 1;
      trk.pan = td.pan || 0;
      trk.mute = !!td.mute;
      trk.solo = !!td.solo;
      for (const imd of td.items || []) {
        const e = entries.find((x) => x.name === imd.wav);
        if (!e) continue;
        const ab = e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength);
        const audio = await engine.ctx.decodeAudioData(ab);
        const cl = clipFromAudioBuffer(audio, imd.name || 'Take');
        trk.items.push(makeItem(imd.name || 'Take', cl.chans, cl.sr, imd.start || 0));
      }
    }
    syncMix();
    renderStrip();
    timeline.setTracks(tracks, activeId);
    timeline.fitZoom();
    refreshButtons();
    toast(t('proj.loaded', { name: file.name, n: meta.tracks.length }));
  } catch (e) {
    toast(t('proj.err', { err: e.message }), true);
  }
}

async function pickProjectDir() {
  try {
    if (!window.showDirectoryPicker) throw new Error('File System Access API недоступен');
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet('projectDir', dir);
    settings.projectDirName = dir.name;
    persistSettings();
    updateProjDirLabel();
    toast(t('proj.dirSet', { name: dir.name }));
  } catch (e) {
    if (e && e.name !== 'AbortError') toast(t('proj.err', { err: e.message }), true);
  }
}
function updateProjDirLabel() {
  const el = $('proj-dir-name');
  if (el) el.textContent = settings.projectDirName || t('proj.dirNone');
}

// ---------------- Экспорт ----------------
function popup(items, anchor) {
  const old = document.getElementById('fx-menu');
  if (old) old.remove();
  const menu = document.createElement('div');
  menu.id = 'fx-menu';
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'm-item';
    el.innerHTML = `<span>${it.label}</span>`;
    el.addEventListener('click', () => { menu.remove(); it.fn(); });
    menu.appendChild(el);
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - 300) + 'px';
  menu.style.top = Math.min(r.bottom + 4, innerHeight - 220) + 'px';
  const onDoc = (e) => {
    if (!menu.contains(e.target)) menu.remove();
    document.removeEventListener('click', onDoc);
  };
  setTimeout(() => document.addEventListener('click', onDoc), 0);
}

async function doExport(kind, bits) {
  try {
    let blob, base, suffix;
    if (kind === 'track') {
      const tr = activeTrack();
      if (!tr || !tr.items.length) { toast(t('t.noClip'), true); return; }
      const { chans, sr } = await mixTracksOffline([tr], { chain: true });
      blob = new Blob([encodeWav(chans, sr, bits)], { type: 'audio/wav' });
      base = tr.name; suffix = 'solo';
    } else {
      blob = await renderMix(tracks, { bitDepth: bits, chain: kind === 'mix' });
      base = 'Микс'; suffix = kind === 'mix' ? 'mix' : 'dry';
    }
    downloadBlob(blob, (base.replace(/[^\wа-яёА-ЯЁ\- ]/g, '').trim() || 'export') + '-' + suffix + '.wav');
    toast(t('t.expDone', { bits }));
  } catch (e) {
    toast(t('t.expErr', { err: e.message }), true);
  }
}

// ---------------- Устройства ----------------
async function refreshDevices() {
  try {
    const devices = await recorder.listDevices();
    const sel = $('device-select');
    const cur = sel.value;
    sel.innerHTML = `<option value="">${t('dev.default')}</option>`;
    for (const d of devices) sel.appendChild(new Option(d.label || 'Микрофон', d.deviceId));
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  } catch {}
}

// ---------------- Кнопки/хоткеи ----------------
function refreshButtons() {
  $('btn-undo').disabled = !timeline.canUndo();
  $('btn-redo').disabled = !timeline.canRedo();
  const act = timeline.activeItem();
  const hasAudio = !!act;
  const hasSel = timeline.sel && timeline.sel.b > timeline.sel.a;
  for (const id of ['btn-cut', 'btn-copy', 'btn-del', 'btn-silence', 'btn-trim', 'btn-fadein', 'btn-fadeout', 'btn-norm']) {
    $(id).disabled = !(hasAudio && hasSel);
  }
  $('btn-paste').disabled = !(hasAudio && timeline.clipboard);
  $('btn-split').disabled = !act;
  $('btn-merge').disabled = timeline.itemCount() < 1;
}

function toggleLoop() {
  loopOn = !loopOn;
  $('btn-loop').classList.toggle('on', loopOn);
  if (playing && !recording) playFrom(timeline.playhead >= 0 ? timeline.playhead : timeline.cursor);
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!$('settings-dlg').hidden) return; // в настройках глобальные хоткеи выключены
    const combo = eventCombo(e);
    const hk = hotkeys();
    for (const [act, bind] of Object.entries(hk)) {
      if (bind && bind === combo) {
        e.preventDefault();
        doAction(act, e);
        return;
      }
    }
  });
}

// ---------------- Инициализация ----------------
async function init() {
  if (!window.AudioWorklet) { toast('Браузер без AudioWorklet — нужен свежий Chrome/Firefox', true); return; }
  engine = new Engine();
  await engine.init();
  recorder = new Recorder(engine);

  timeline = new Timeline({
    waveEl: $('wave'),
    rulerEl: $('ruler'),
    scrollEl: $('timeline'),
    playheadEl: $('playhead'),
    emptyEl: $('wave-empty'),
    areaEl: $('wave-area'),
    onchanged: () => { refreshButtons(); saveState(); },
    onselect: () => { refreshButtons(); },
    onitem: () => { refreshButtons(); },
    onitemsmoved: () => {},
    onactive: () => { renderStrip(); rack.renderAll(); saveState(); },
    onspliterr: (key) => toast(t(key), true),
  });

  rack = new FxRack(engine, {
    getTrackById: (id) => tracks.find((x) => x.id === id) || null,
  }, {
    onChanged: debSave,
    onPinChange: () => renderStrip(),
  });

  new LevelMeter($('master-meter'), () => engine.masterAnalyser);
  new Spectrum($('spectrum'), () => engine.masterAnalyser);

  const lat = Math.round((engine.ctx.baseLatency || 0) * 1000);
  stBase = `${(engine.sampleRate / 1000).toFixed(1)} kHz · ${t('st.latency', { ms: lat })}`;
  $('st-sample').textContent = stBase + ' · ' + t('st.tracks', { n: tracks.length });

  loadUserSettings();
  applyStatic();
  applySettings();
  bindSettings();
  idbGet('projectDir').then((d) => {
    if (d) settings.projectDirName = d.name || '';
    updateProjDirLabel();
  }).catch(() => {});
  document.addEventListener('langchange', () => {
    applyStatic();
    renderStrip();
    rack.renderPresets();
    rack.renderAll();
    refreshDevices();
    fillSinkDevices();
    updateStatusHint();
    if (!$('settings-dlg').hidden) renderHotkeys();
    timeline.requestDraw();
  });
  loadState();
  bindUI();
  refreshButtons();
  refreshDevices();
  updateStatusHint();
  toast(t('t.ready'));
}

// ---------------- Диалог настроек ----------------
function markAccent() {
  document.querySelectorAll('#set-accent [data-c]').forEach((b) =>
    b.classList.toggle('sel', b.dataset.c === settings.accent));
}
function renderHotkeys() {
  const list = $('hk-list');
  if (!list) return;
  list.innerHTML = '';
  const hk = hotkeys();
  for (const [act, def] of Object.entries(HK_DEFAULTS)) {
    const bind = hk[act];
    const row = document.createElement('div');
    row.className = 'hk-row';
    const keyTxt = hkCapture === act ? t('hk.press') : (bind ? hkPretty(bind) : t('hk.disabled'));
    row.innerHTML = `
      <span class="hk-name">${t('hk.' + act)}</span>
      <span class="hk-ctl">
        <button class="hk-key ${hkCapture === act ? 'listen' : ''} ${!bind ? 'off' : ''}">${keyTxt}</button>
        <button class="hk-clear" title="${t('hk.disabled')}">✕</button>
      </span>`;
    row.querySelector('.hk-key').addEventListener('click', () => { hkCapture = act; renderHotkeys(); });
    row.querySelector('.hk-clear').addEventListener('click', () => {
      const h = hotkeys(); h[act] = null;
      settings.hotkeys = h; persistSettings();
      renderHotkeys(); updateStatusHint();
    });
    list.appendChild(row);
  }
}

function bindSettings() {
  $('btn-settings').addEventListener('click', async () => {
    $('set-lang').value = settings.lang;
    $('set-theme').value = settings.theme;
    $('set-scale').value = Math.round((settings.scale || 1) * 100);
    $('set-scale-val').textContent = Math.round((settings.scale || 1) * 100) + '%';
    $('set-laneh').value = settings.laneH || 96;
    $('set-laneh-val').textContent = (settings.laneH || 96) + ' px';
    $('set-mvol').value = Math.round((settings.masterVol ?? 1) * 100);
    $('set-mvol-val').textContent = Math.round((settings.masterVol ?? 1) * 100) + '%';
    $('set-overdub').classList.toggle('on', !!settings.overdub);
    $('set-follow').classList.toggle('on', !!settings.follow);
    $('set-confirmdel').classList.toggle('on', !!settings.confirmDel);
    markAccent();
    hkCapture = null;
    renderHotkeys();
    await fillSinkDevices();
    $('settings-dlg').hidden = false;
  });
  $('dlg-close').addEventListener('click', () => { $('settings-dlg').hidden = true; });
  $('settings-dlg').addEventListener('click', (e) => {
    if (e.target.id === 'settings-dlg') $('settings-dlg').hidden = true;
  });
  $('set-lang').addEventListener('change', (e) => {
    settings.lang = e.target.value;
    persistSettings();
    setLang(settings.lang);
  });
  $('set-theme').addEventListener('change', (e) => {
    settings.theme = e.target.value;
    persistSettings();
    applySettings();
  });
  $('set-accent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    settings.accent = b.dataset.c;
    persistSettings();
    applySettings();
    markAccent();
  });
  $('set-accent-custom').addEventListener('input', (e) => {
    settings.accent = e.target.value;
    persistSettings();
    applySettings();
    markAccent();
  });
  $('set-scale').addEventListener('input', (e) => {
    settings.scale = +e.target.value / 100;
    $('set-scale-val').textContent = e.target.value + '%';
    persistSettings();
    applySettings();
  });
  $('set-laneh').addEventListener('input', (e) => {
    settings.laneH = +e.target.value;
    $('set-laneh-val').textContent = e.target.value + ' px';
    persistSettings();
    applySettings();
  });
  $('set-mvol').addEventListener('input', (e) => {
    settings.masterVol = +e.target.value / 100;
    $('set-mvol-val').textContent = e.target.value + '%';
    persistSettings();
    applySettings();
  });
  $('set-sink').addEventListener('change', (e) => {
    settings.sinkId = e.target.value;
    persistSettings();
    applySettings();
  });
  const bindSwitch = (id, key) => {
    const el = document.getElementById(id.replace('#', ''));
    if (!el) return;
    el.addEventListener('click', () => {
      settings[key] = !settings[key];
      el.classList.toggle('on', !!settings[key]);
      persistSettings();
    });
  };
  bindSwitch('#set-overdub', 'overdub');
  bindSwitch('#set-follow', 'follow');
  bindSwitch('#set-confirmdel', 'confirmDel');
  $('set-reset').addEventListener('click', () => {
    localStorage.removeItem('zvoice.settings');
    location.reload();
  });
  $('hk-reset').addEventListener('click', () => {
    settings.hotkeys = {};
    persistSettings();
    hkCapture = null;
    renderHotkeys();
    updateStatusHint();
  });
  // перехват клавиши при переназначении (фаза capture — раньше глобальных хоткеев)
  document.addEventListener('keydown', (e) => {
    if (!hkCapture) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { hkCapture = null; renderHotkeys(); return; }
    const h = hotkeys();
    h[hkCapture] = eventCombo(e);
    settings.hotkeys = h;
    persistSettings();
    hkCapture = null;
    renderHotkeys();
    updateStatusHint();
  }, true);
}
async function fillSinkDevices() {
  const sel = $('set-sink');
  sel.innerHTML = `<option value="">${t('dev.default')}</option>`;
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    for (const d of ds.filter((x) => x.kind === 'audiooutput')) {
      sel.appendChild(new Option(d.label || d.deviceId.slice(0, 6), d.deviceId));
    }
  } catch {}
  sel.value = settings.sinkId || '';
}

function bindUI() {
  // транспорт
  $('btn-play').addEventListener('click', () => playing ? stopPlay() : playFrom(timeline.cursor));
  $('btn-stop').addEventListener('click', stopPlay);
  $('btn-home').addEventListener('click', () => { timeline.cursor = 0; timeline.scroll = 0; timeline.requestDraw(); });
  $('btn-loop').addEventListener('click', toggleLoop);
  $('btn-record').addEventListener('click', toggleRecord);

  // мониторинг и байпас
  $('chk-monitor').addEventListener('change', (e) => {
    engine.setMonitor(e.target.checked);
    if (e.target.checked && !headphonesWarned) {
      headphonesWarned = true;
      toast('Мониторинг включён — используй наушники, иначе самовозбуждение!', true);
    }
  });
  $('btn-bypass-all').addEventListener('click', () => {
    engine.setBypassAll(!engine.bypassAll);
    $('btn-bypass-all').classList.toggle('on', engine.bypassAll);
    saveState();
  });

  // дорожки
  $('track-add').addEventListener('click', () => newTrack());

  // редактирование
  $('btn-undo').addEventListener('click', () => { timeline.doUndo(); refreshButtons(); });
  $('btn-redo').addEventListener('click', () => { timeline.doRedo(); refreshButtons(); });
  $('btn-cut').addEventListener('click', () => { timeline.doCut(); refreshButtons(); });
  $('btn-copy').addEventListener('click', () => { timeline.doCopy(); });
  $('btn-paste').addEventListener('click', () => { timeline.doPaste(); refreshButtons(); });
  $('btn-del').addEventListener('click', () => { timeline.doDelete(); refreshButtons(); });
  $('btn-silence').addEventListener('click', () => { timeline.doSilence(); refreshButtons(); });
  $('btn-trim').addEventListener('click', () => { timeline.doTrim(); refreshButtons(); });
  $('btn-fadein').addEventListener('click', () => { timeline.doFadeIn(); refreshButtons(); });
  $('btn-fadeout').addEventListener('click', () => { timeline.doFadeOut(); refreshButtons(); });
  $('btn-norm').addEventListener('click', () => { timeline.doNormalize(); refreshButtons(); });
  $('btn-selall').addEventListener('click', () => timeline.selectAll());
  $('btn-selnone').addEventListener('click', () => { timeline.clearSel(); refreshButtons(); });
  $('btn-zoom-in').addEventListener('click', () => { timeline.spp /= 1.6; timeline.requestDraw(); });
  $('btn-zoom-out').addEventListener('click', () => { timeline.spp *= 1.6; timeline.requestDraw(); });
  $('btn-zoom-fit').addEventListener('click', () => timeline.fitZoom());

  // импорт / проекты
  $('btn-import').addEventListener('click', (e) => popup([
    { label: t('imp.audio'), fn: () => $('file-input').click() },
    { label: t('imp.project'), fn: () => $('proj-input').click() },
  ], e.currentTarget));
  $('proj-input').addEventListener('change', (e) => {
    if (e.target.files[0]) openProjectFile(e.target.files[0]);
    e.target.value = '';
  });
  $('btn-split').addEventListener('click', () => { splitActiveTrack(); refreshButtons(); });
  $('btn-merge').addEventListener('click', () => mergeTracks());
  $('pick-dir').addEventListener('click', pickProjectDir);
  $('file-input').addEventListener('change', (e) => { importFile(e.target.files[0]); e.target.value = ''; });
  const tl = $('timeline');
  tl.addEventListener('dragover', (e) => { e.preventDefault(); tl.classList.add('dragover'); });
  tl.addEventListener('dragleave', () => tl.classList.remove('dragover'));
  tl.addEventListener('drop', (e) => {
    e.preventDefault();
    tl.classList.remove('dragover');
    importFile(e.dataTransfer.files[0]);
  });

  // экспорт
  $('btn-export').addEventListener('click', (e) => popup([
    { label: t('exp.mix', { bits: 24 }), fn: () => doExport('mix', 24) },
    { label: t('exp.mix', { bits: 16 }), fn: () => doExport('mix', 16) },
    { label: t('exp.mixdry'), fn: () => doExport('mixdry', 24) },
    { label: t('exp.track'), fn: () => doExport('track', 24) },
    { label: t('exp.project'), fn: () => saveProject() },
  ], e.currentTarget));

  bindKeys();
}

init().catch((e) => {
  console.error(e);
  toast('Ошибка запуска: ' + e.message, true);
});

// отладочный доступ (используется автотестами)
window.__zv = {
  info: () => ({ tracks: tracks.length, playing, recording, activeId }),
  addClip(name, chans, sr) {
    const trk = newTrack(name);
    trk.items.push(makeItem(name, chans, sr, 0));
    timeline.fitZoom();
    return trk.id;
  },
  play: () => playFrom(timeline.cursor),
  stop: stopPlay,
  cursor: () => timeline.cursor,
  remove: removeTrack,
  fx: (id) => rack.toggle(id),
  pin: () => rack.pinnedId,
  addClip(name, chans, sr) {
    const trk = newTrack(name);
    trk.items.push(makeItem(name, chans, sr, 0));
    timeline.fitZoom();
    return trk.id;
  },
  items: () => tracks.map((t) => ({ name: t.name, items: t.items.map((i) => ({ name: i.name, start: i.start, len: i.len })) })),
  buildProjectZip() {
    const { files } = buildProjectFiles();
    const zip = makeZip(files);
    const parsed = readZip(zip);
    return {
      files: files.map((f) => f.name),
      zipBytes: zip.length,
      roundTrip: parsed.map((p) => p.name),
      jsonOk: !!parsed.find((p) => p.name === 'project.json'),
    };
  },
};
