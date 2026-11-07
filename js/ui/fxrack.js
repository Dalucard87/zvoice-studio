// Окно FX как в Reaper: плавающее окно, слева список плагинов с чекбоксами,
// справа редактор выбранного плагина. Окно привязывается к дорожке (пин).
import { PLUGIN_LIST } from '../plugins/registry.js';
import { renderParams } from '../plugins/base.js';
import { getUserPresets, saveUserPreset } from '../presets.js';
import { t, getLang } from '../i18n.js';

const CAT_KEYS = { 'Очистка': 'cat.clean', 'Динамика': 'cat.dyn', 'Тембр': 'cat.tone', 'Эффекты': 'cat.fx', 'Уровень': 'cat.level' };
const defName = (def) => (getLang() === 'en' && def.nameEn) ? def.nameEn : def.name;
const defDesc = (def) => (getLang() === 'en' && def.descEn) ? def.descEn : (def.desc || '');

const LS_GEO = 'zvoice.fxwin';

export class FxRack {
  // deps: { getTrackById(id) → {id, name} | null }
  constructor(engine, deps, opts = {}) {
    this.engine = engine;
    this.deps = deps;
    this.opts = opts;
    this.pinnedId = null;
    this.selIndex = -1;
    this.selByTrack = {};
    this.listUnsubs = [];
    this._editorCleanup = null;

    this.win = document.getElementById('fxwin');
    this.titleEl = document.getElementById('fxwin-title');
    this.listEl = document.getElementById('fx-list');
    this.editorBody = document.getElementById('fx-editor-body');
    this.editorEmpty = document.getElementById('fx-editor-empty');
    this.presetSel = document.getElementById('preset-select');
    this.addBtn = document.getElementById('fx-add');
    this.saveBtn = document.getElementById('fx-save');

    document.getElementById('fxwin-close').addEventListener('click', () => this.close());
    this.addBtn.addEventListener('click', () => this.showAddMenu());
    this.saveBtn.addEventListener('click', () => this.savePreset());
    this.presetSel.addEventListener('change', () => this.applyPresetByName(this.presetSel.value));
    this.renderPresets();
    this._bindWindow();
  }

  _tid() { return this.pinnedId; }
  _track() { return this.pinnedId ? this.deps.getTrackById(this.pinnedId) : null; }

  // ---------- окно ----------
  open(id) {
    const t = this.deps.getTrackById(id);
    if (!t) return;
    this.pinnedId = id;
    this.win.hidden = false;
    this._restoreGeometry();
    this.renderAll();
    this.opts.onPinChange && this.opts.onPinChange();
  }
  close() {
    this.win.hidden = true;
    this._saveGeometry();
    this.pinnedId = null;
    this.opts.onPinChange && this.opts.onPinChange();
  }
  toggle(id) {
    if (!this.win.hidden && this.pinnedId === id) this.close();
    else this.open(id);
  }
  isOpen() { return !this.win.hidden; }

  _bindWindow() {
    const head = document.getElementById('fxwin-head');
    const rz = document.getElementById('fxwin-resize');
    const z = () => parseFloat(document.body.style.zoom) || 1;
    let drag = null, rsz = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      head.setPointerCapture(e.pointerId);
      const r = this.win.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const Z = z();
      const x = Math.max(6, Math.min((e.clientX - drag.dx) / Z, innerWidth / Z - this.win.offsetWidth - 6));
      const y = Math.max(6, Math.min((e.clientY - drag.dy) / Z, innerHeight / Z - 80));
      this.win.style.left = x + 'px';
      this.win.style.top = y + 'px';
    });
    const endDrag = (e) => { if (drag) { drag = null; this._saveGeometry(); } try { head.releasePointerCapture(e.pointerId); } catch {} };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    rz.addEventListener('pointerdown', (e) => {
      rz.setPointerCapture(e.pointerId);
      const r = this.win.getBoundingClientRect();
      rsz = { x: e.clientX, y: e.clientY, w: r.width / z(), h: r.height / z() };
    });
    rz.addEventListener('pointermove', (e) => {
      if (!rsz) return;
      const Z = z();
      this.win.style.width = Math.max(560, rsz.w + (e.clientX - rsz.x) / Z) + 'px';
      this.win.style.height = Math.max(340, rsz.h + (e.clientY - rsz.y) / Z) + 'px';
    });
    const endRz = (e) => { if (rsz) { rsz = null; this._saveGeometry(); } try { rz.releasePointerCapture(e.pointerId); } catch {} };
    rz.addEventListener('pointerup', endRz);
    rz.addEventListener('pointercancel', endRz);
  }

  _restoreGeometry() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(LS_GEO)); } catch {}
    this.win.style.right = 'auto';
    this.win.style.bottom = 'auto';
    if (g && g.w && g.h) {
      const Z = parseFloat(document.body.style.zoom) || 1;
      this.win.style.width = g.w + 'px';
      this.win.style.height = g.h + 'px';
      this.win.style.left = Math.max(6, Math.min(g.x, innerWidth / Z - 160)) + 'px';
      this.win.style.top = Math.max(6, Math.min(g.y, innerHeight / Z - 90)) + 'px';
    } else {
      this.win.style.width = '800px';
      this.win.style.height = '500px';
      this.win.style.left = Math.max(6, innerWidth - 826) + 'px';
      this.win.style.top = '74px';
    }
  }
  _saveGeometry() {
    if (this.win.hidden) return;
    const r = this.win.getBoundingClientRect();
    try { localStorage.setItem(LS_GEO, JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height })); } catch {}
  }

  // ---------- пресеты ----------
  renderPresets() {
    // только пользовательские пресеты; встроенные убраны
    const names = Object.keys(getUserPresets());
    this.presetSel.innerHTML = '';
    if (!names.length) {
      this.presetSel.hidden = true;
      this.presetSel.value = '';
      return;
    }
    this.presetSel.hidden = false;
    this.presetSel.appendChild(new Option(t('fx.presets.ph'), ''));
    for (const name of names) this.presetSel.appendChild(new Option(name, 'u:' + name));
    this.presetSel.value = '';
  }
  applyPresetByName(key) {
    if (!key || !this._tid()) return;
    const name = key.startsWith('u:') ? key.slice(2) : key;
    const states = getUserPresets()[name];
    if (!states) return;
    this.loadStates(states);
  }
  loadStates(states) {
    const id = this._tid();
    if (!id) return;
    this.engine.loadTrackChain(id, states);
    this.renderAll();
    this.opts.onChanged && this.opts.onChanged();
  }

  // ---------- плагины ----------
  add(defId, state) {
    const id = this._tid();
    if (!id) return null;
    const inst = this.engine.addPlugin(id, defId, state);
    this.renderAll();
    this.select(this.engine.trackInstances(id).length - 1);
    this.opts.onChanged && this.opts.onChanged();
    return inst;
  }

  select(i) {
    this.selIndex = i;
    if (this.pinnedId) this.selByTrack[this.pinnedId] = i;
    [...this.listEl.children].forEach((el, k) => el.classList.toggle('sel', k === i));
    this._renderEditor();
  }

  renderAll() {
    const track = this._track();
    this.titleEl.textContent = track ? t('fx.title', { name: track.name }) : t('fx.rename');
    for (const u of this.listUnsubs) u();
    this.listUnsubs = [];
    this.listEl.innerHTML = '';
    const insts = this.pinnedId ? this.engine.trackInstances(this.pinnedId) : [];
    this.selIndex = Math.min(this.selByTrack[this.pinnedId] ?? 0, insts.length - 1);
    insts.forEach((inst, i) => this._renderItem(inst, i));
    this._renderEditor();
  }

  _renderItem(inst, i) {
    const el = document.createElement('div');
    el.className = 'fx-item' + (inst.enabled ? '' : ' off') + (i === this.selIndex ? ' sel' : '');
    el.innerHTML = `
      <input type="checkbox" ${inst.enabled ? 'checked' : ''} title="${t('tip.fx.power')}">
      <span class="n">${i + 1}. ${defName(inst.def)}</span>
      <span class="gr"></span>
      <button class="del" title="${t('tip.fx.del')}">✕</button>`;
    const cb = el.querySelector('input');
    cb.addEventListener('change', () => {
      inst.enabled = cb.checked;
      el.classList.toggle('off', !inst.enabled);
      const id = this._tid();
      if (id) this.engine.rebuildTrack(id);
      this.opts.onChanged && this.opts.onChanged();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('input') || e.target.closest('button')) return;
      this.select(i);
    });
    el.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = this._tid();
      if (!id) return;
      this.engine.removePlugin(id, inst);
      this.renderAll();
      this.opts.onChanged && this.opts.onChanged();
    });
    // метр в строке
    if (inst.onMeter) {
      const grEl = el.querySelector('.gr');
      this.listUnsubs.push(inst.onMeter((m) => {
        let txt = '';
        if (m.gr !== undefined && Math.abs(m.gr) > 0.05) txt = 'GR ' + (m.gr > 0 ? '+' : '') + m.gr;
        if (m.open !== undefined) txt = (m.open ? '🟢' : '🔴') + txt;
        grEl.textContent = txt;
      }));
    }
    // перетаскивание для порядка
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      el.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-before');
      const from = +e.dataTransfer.getData('text/plain');
      if (Number.isNaN(from)) return;
      const r = el.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      const items = [...this.listEl.children];
      const idx = items.indexOf(el);
      let to = idx + (before ? 0 : 1);
      if (from < to) to--;
      const id = this._tid();
      if (id) this.engine.movePlugin(id, from, to);
      this.renderAll();
      this.opts.onChanged && this.opts.onChanged();
    });

    this.listEl.appendChild(el);
  }

  _renderEditor() {
    this.editorBody.innerHTML = '';
    const insts = this.pinnedId ? this.engine.trackInstances(this.pinnedId) : [];
    const inst = insts[this.selIndex];
    if (!inst) {
      this.editorEmpty.hidden = false;
      return;
    }
    this.editorEmpty.hidden = true;
    if (this._editorCleanup) { try { this._editorCleanup(); } catch {} }
    this._editorCleanup = null;
    const def = inst.def;
    // панель в стиле FabFilter: бренд-шапка с акцентным цветом плагина
    const panel = document.createElement('div');
    panel.className = 'ff-panel';
    panel.style.setProperty('--ff-accent', def.accent || '#ff9f43');
    const head = document.createElement('div');
    head.className = 'ff-topbar';
    head.innerHTML = `<span class="ff-dot"></span><span class="ff-logo">zvoice</span><span class="ff-product">${def.brand || def.name}</span><span class="ff-top-hint">ZVOICE STUDIO</span>`;
    const body = document.createElement('div');
    body.className = 'ff-body';
    panel.append(head, body);
    this.editorBody.appendChild(panel);
    const onAny = () => this.opts.onChanged && this.opts.onChanged();
    const ectx = { engine: this.engine, trackId: this.pinnedId };
    const res = def.renderBody ? def.renderBody(body, inst, onAny, ectx)
      : renderParams(body, inst, def.params, onAny, def.accent);
    this._editorCleanup = typeof res === 'function' ? res : null;
  }

  showAddMenu() {
    const old = document.getElementById('fx-menu');
    if (old) old.remove();
    const menu = document.createElement('div');
    menu.id = 'fx-menu';
    const cats = {};
    for (const d of PLUGIN_LIST) (cats[d.category] ||= []).push(d);
    for (const [cat, defs] of Object.entries(cats)) {
      const h = document.createElement('div');
      h.className = 'm-cat';
      h.textContent = t(CAT_KEYS[cat] || cat);
      menu.appendChild(h);
      for (const d of defs) {
        const it = document.createElement('div');
        it.className = 'm-item';
        it.innerHTML = `<span>${defName(d)}</span>`;
        it.title = defDesc(d); // описание появляется при наведении
        it.addEventListener('click', () => { menu.remove(); this.add(d.id); });
        menu.appendChild(it);
      }
    }
    document.body.appendChild(menu);
    const r = this.addBtn.getBoundingClientRect();
    menu.style.left = Math.min(r.left, innerWidth - 300) + 'px';
    menu.style.top = Math.min(r.bottom + 4, innerHeight - 340) + 'px';
    const onDoc = (e) => {
      if (!menu.contains(e.target)) menu.remove();
      document.removeEventListener('click', onDoc);
    };
    setTimeout(() => document.addEventListener('click', onDoc), 0);
  }

  savePreset() {
    const id = this._tid();
    if (!id) { alert(t('t.presetNeedTrack')); return; }
    const name = prompt(t('t.presetName'), 'Preset');
    if (!name) return;
    saveUserPreset(name, this.engine.chainStates(id));
    this.renderPresets();
    this.presetSel.value = 'u:' + name;
  }
}
