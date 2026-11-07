// Аудио-движок: мультидорожечный микшер.
// Каждая дорожка: input → [своя цепочка плагинов] → gain → pan → mixIn → master
// Запись: микрофон → monitorGain → input дорожки (мониторинг отдельно от плеера)
import { getDef } from '../plugins/registry.js';

// ?v= — сброс HTTP-кэша ворклетов при правках DSP
export const WORKLET_FILES = [
  'worklets/capture.js?v=3', 'worklets/gate.js?v=3', 'worklets/deesser.js?v=3', 'worklets/denoise.js?v=3',
  'worklets/ai-denoise.js?v=4',
];

export class Engine {
  constructor() {
    this.ctx = null;
    this.tracks = new Map();   // id → {input, instances[], gain, pan}
    this.bypassAll = false;
    this.monitor = false;
    this.monGain = null;       // мониторинг во время записи
    this.onChainChanged = null;
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await Promise.all(WORKLET_FILES.map((w) => this.ctx.audioWorklet.addModule(w)));
    this.master = this.ctx.createGain();
    this.masterVol = this.ctx.createGain();   // пользовательская громкость выхода
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.master.connect(this.masterVol);
    this.masterVol.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.mixIn = this.ctx.createGain();
    this.mixIn.connect(this.master);
    this.inputAnalyser = this.ctx.createAnalyser(); // метр микрофона (не на выход)
    this.inputAnalyser.fftSize = 2048;
    return this;
  }

  resume() { return this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve(); }
  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 0; }

  ensureTrack(id, chStates) {
    if (this.tracks.has(id)) return this.tracks.get(id);
    const t = {
      input: this.ctx.createGain(),
      instances: [],
      gain: this.ctx.createGain(),
      pan: this.ctx.createStereoPanner(),
      analyser: null,
    };
    // анализатор входа дорожки — для дисплеев плагинов (спектр/волна)
    try {
      t.analyser = this.ctx.createAnalyser();
      t.analyser.fftSize = 2048;
      t.analyser.smoothingTimeConstant = 0.75;
      t.input.connect(t.analyser);
    } catch {}
    t.gain.connect(t.pan);
    t.pan.connect(this.mixIn);
    this.tracks.set(id, t);
    if (chStates && chStates.length) this.loadTrackChain(id, chStates);
    else this.rebuildTrack(id);
    return t;
  }

  getTrackAnalyser(id) {
    const t = this.tracks.get(id);
    return t && t.analyser ? t.analyser : null;
  }

  // Своя цепочка плагинов дорожки
  loadTrackChain(id, states) {
    const t = this.ensureTrack(id);
    for (const inst of t.instances) { try { inst.destroy(); } catch {} }
    t.instances = [];
    for (const cs of states || []) {
      const def = getDef(cs.plugin);
      if (!def) continue;
      const inst = def.build(this.ctx, cs.state);
      inst.def = def;
      inst.enabled = cs.enabled !== false;
      t.instances.push(inst);
    }
    this.rebuildTrack(id);
  }

  trackInstances(id) { return this.tracks.get(id) ? this.tracks.get(id).instances : []; }

  rebuildTrack(id) {
    const t = this.tracks.get(id);
    if (!t) return;
    try { t.input.disconnect(); } catch {}
    for (const inst of t.instances) { try { inst.output.disconnect(); } catch {} }
    let prev = t.input;
    for (const inst of t.instances) {
      if (!this.bypassAll && inst.enabled) {
        try { prev.connect(inst.input); } catch {}
        prev = inst.output;
      }
    }
    try { prev.connect(t.gain); } catch {}
    // вернуть отвод на анализатор дисплеев (disconnect() выше его рвёт)
    if (t.analyser) { try { t.input.connect(t.analyser); } catch {} }
  }

  addPlugin(trackId, defId, state) {
    const t = this.ensureTrack(trackId);
    const def = getDef(defId);
    if (!def) throw new Error('Нет плагина: ' + defId);
    const inst = def.build(this.ctx, state);
    inst.def = def;
    inst.enabled = true;
    t.instances.push(inst);
    this.rebuildTrack(trackId);
    this._changed();
    return inst;
  }

  removePlugin(trackId, inst) {
    const t = this.tracks.get(trackId);
    if (!t) return;
    const i = t.instances.indexOf(inst);
    if (i >= 0) t.instances.splice(i, 1);
    try { inst.destroy(); } catch {}
    this.rebuildTrack(trackId);
    this._changed();
  }

  movePlugin(trackId, from, to) {
    const t = this.tracks.get(trackId);
    if (!t || from === to || from < 0 || to < 0 || from >= t.instances.length) return;
    const [it] = t.instances.splice(from, 1);
    t.instances.splice(to, 0, it);
    this.rebuildTrack(trackId);
    this._changed();
  }

  chainStates(trackId) {
    const t = this.tracks.get(trackId);
    if (!t) return [];
    return t.instances.map((i) => ({ plugin: i.def.id, state: i.getState(), enabled: !!i.enabled }));
  }

  // Громкости/пан/мьют/соло всех дорожек (солируется глобально)
  applyMix(paramsById) {
    if (!this.ctx) return;
    const ids = [...this.tracks.keys()];
    const anySolo = ids.some((id) => paramsById[id] && paramsById[id].solo);
    for (const id of ids) {
      const t = this.tracks.get(id);
      const p = paramsById[id] || {};
      const eff = (p.mute || (anySolo && !p.solo)) ? 0 : (p.gain !== undefined ? p.gain : 1);
      t.gain.gain.setTargetAtTime(eff, this.ctx.currentTime, 0.01);
      if (p.pan !== undefined) t.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.pan)), this.ctx.currentTime, 0.01);
    }
  }

  connectPlayback(trackId, srcNode) {
    const t = this.ensureTrack(trackId);
    try { srcNode.connect(t.input); } catch {}
  }

  // Запись в дорожку: микрофон через monitorGain (слышать себя — настройка «Мониторинг»)
  beginRecordInto(trackId, micNode) {
    const t = this.ensureTrack(trackId);
    this.monGain = this.ctx.createGain();
    this.monGain.gain.value = this.monitor ? 1 : 0;
    micNode.connect(this.monGain);
    this.monGain.connect(t.input);
    try { micNode.connect(this.inputAnalyser); } catch {}
  }
  endRecord() {
    if (this.monGain) { try { this.monGain.disconnect(); } catch {} this.monGain = null; }
    try { if (this._lastMic) this._lastMic.disconnect(this.inputAnalyser); } catch {}
  }
  setMonitor(v) {
    this.monitor = v;
    if (this.monGain) this.monGain.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.01);
  }

  setMasterVolume(v) {
    if (this.masterVol) this.masterVol.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.ctx.currentTime, 0.01);
  }

  setBypassAll(v) {
    this.bypassAll = v;
    for (const id of this.tracks.keys()) this.rebuildTrack(id);
    this._changed();
  }

  removeTrack(id) {
    const t = this.tracks.get(id);
    if (!t) return;
    for (const inst of t.instances) { try { inst.destroy(); } catch {} }
    try { t.pan.disconnect(); } catch {}
    this.tracks.delete(id);
  }

  _changed() { if (this.onChainChanged) this.onChainChanged(); }
}
