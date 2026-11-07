// Запись с микрофона через capture-ворклет (сырой вход, без AGC браузера)
export class Recorder {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.srcNode = null;
    this.capNode = null;
    this.chunks = [];
    this.recording = false;
    this.t0 = 0;
    this.onChunk = null; // (chans, frames) для живой волны
  }

  async listDevices() {
    const ds = await navigator.mediaDevices.enumerateDevices();
    return ds.filter((d) => d.kind === 'audioinput');
  }

  async start(deviceId) {
    const engine = this.engine;
    await engine.resume();
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    // отдельные узлы: captureSrc питает запись, chainSrc — движок (его rebuild может дёргать)
    this.capSrc = engine.ctx.createMediaStreamSource(this.stream);
    this.srcNode = engine.ctx.createMediaStreamSource(this.stream);
    this.capNode = new AudioWorkletNode(engine.ctx, 'capture-proc');
    this.capNode.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'audio' && this.recording) {
        this.chunks.push(d.chans);
        if (this.onChunk) this.onChunk(d.chans, d.frames);
      }
    };
    this.chunks = [];
    this.capSrc.connect(this.capNode);
    // вход в движок (мониторинг + метр) подключает main через engine.beginRecordInto()
    this.capNode.port.postMessage({ cmd: 'start' });
    this.recording = true;
    this.t0 = performance.now();
  }

  get elapsed() { return this.recording ? (performance.now() - this.t0) / 1000 : 0; }

  // исходный узел микрофона (для подключения в дорожку)
  get micNode() { return this.srcNode; }

  stop() {
    if (!this.recording) return null;
    this.recording = false;
    this.capNode.port.postMessage({ cmd: 'stop' });
    const sr = this.engine.ctx.sampleRate;

    const nch = this.chunks.length ? this.chunks[0].length : 1;
    const total = this.chunks.reduce((a, c) => a + c[0].length, 0);
    const chans = Array.from({ length: nch }, () => new Float32Array(total));
    let off = 0;
    for (const c of this.chunks) {
      const n = c[0].length;
      for (let ch = 0; ch < nch; ch++) if (c[ch]) chans[ch].set(c[ch], off);
      off += n;
    }

    try { this.capNode.disconnect(); } catch {}
    try { this.capSrc.disconnect(); } catch {}
    try { this.srcNode.disconnect(); } catch {}
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.chunks = [];

    if (total === 0) return null;
    const name = 'Запись ' + new Date().toLocaleTimeString('ru-RU');
    return { name, chans, sr, len: total, rev: 1, history: { undo: [], redo: [] } };
  }
}
