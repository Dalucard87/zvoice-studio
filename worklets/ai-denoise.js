// AI-шумодав: RNNoise (нейросеть Xiph.Org, BSD) в WebAssembly.
// Модуль .wasm компилируется на main-потоке и приходит через processorOptions
// (или postMessage — fallback). RNNoise работает на 48 кГц/480 сэмплов,
// поэтому вокруг ядра: ресемплинг ± авто-нормализация уровня ± свой гейт.

// ── обёртка над wasm ────────────────────────────────────────────────────
function rnnoiseInstantiate(mod) {
  const imports = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] = imports[imp.module] || {};
    imports[imp.module][imp.name] = () => 0; // наша сборка импортов не требует
  }
  const inst = new WebAssembly.Instance(mod, imports);
  const X = inst.exports;
  const memory = X.memory || (X.c && X.c instanceof WebAssembly.Memory ? X.c : null);
  const mem = () => memory.buffer;
  const u8 = () => new Uint8Array(mem());
  X.rnnoise_get_size && X.rnnoise_get_size();
  const st = X.rnnoise_create(0);
  if (!st) return null;
  const FS = X.rnnoise_get_frame_size() | 0;
  const inP = X.malloc(FS * 4), outP = X.malloc(FS * 4);
  const inV = new Float32Array(mem(), inP, FS);
  const outV = new Float32Array(mem(), outP, FS);
  return {
    st, FS, inV, outV,
    frame(inArr, outArr) {
      inV.set(inArr);
      const vad = X.rnnoise_process_frame(st, outP, inP);
      outArr.set(outV);
      return vad;
    },
  };
}

// ── процессор ───────────────────────────────────────────────────────────
const FS = 480;              // 480 сэмплов @ 48 кГц (внутренняя частота rnnoise)
const RATE = 48000;
const TARGET_RMS = 0.5;      // рабочая зона нейросети (эмпирически: ≥0.45)

class AiDenoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // amount/gate приходят в 0..100 из UI
    this.p = { amount: 100, gate: 60, outGainDb: 0, bypass: 0 };
    this.core = null;           // rnnoise-обёртка
    this.failed = false;

    // 48 кГц ↔ частота контекста: два линейных ресемплера
    this.ratioIn = sampleRate / RATE;   // шаг по исходнику на один сэмпл 48к
    this.ratioOut = RATE / sampleRate;

    // вход (частота контекста, моно)
    this.inFifo = new Float32Array(65536); this.iw = 0; this.ir = 0;
    // 48 кГц поток до/после ядра
    this.mid = new Float32Array(FS + 8); this.midN = 0;          // нормализованный кадр
    this.mid48 = new Float32Array(65536); this.mw = 0; this.mr = 0;   // 48к вход (после ресемпла)
    this.out48 = new Float32Array(65536); this.ow = 0; this.or = 0;   // 48к выход (до ресемпла)

    this.srcPos = 0;  // фракционная позиция ресемплера in→48k
    this.dstPos = 0;  // фракционная позиция ресемплера 48k→ctx

    this.gsm = 1;         // сглаженный нормализующий гейн
    this.noiseFloor = 0;  // мин-трекинг пола шума (для гейта)
    this.gateGain = 1;    // сглаженный гейт
    this.grSmooth = 0;
    this.block = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.params) Object.assign(this.p, d.params);
      if (d && d.type === 'wasm' && !this.core && !this.failed) {
        try { this.core = rnnoiseInstantiate(d.mod); } catch { this.failed = true; }
      }
    };
    // основной путь: модуль приходит синхронно в processorOptions
    const mod = options && options.processorOptions && options.processorOptions.mod;
    if (mod) { try { this.core = rnnoiseInstantiate(mod); } catch { this.failed = true; } }
  }

  // ---- ресемплер in→48k: выдаёт доступные сэмплы 48к из inFifo -------------
  _resampleIn() {
    const { inFifo, mid48 } = this;
    const avail = (this.iw - this.ir + inFifo.length) % inFifo.length;
    if (avail < 2) return;
    let pos = this.srcPos;
    while (pos + 1 < avail) {
      const i0 = (this.ir + Math.floor(pos)) % inFifo.length;
      const i1 = (i0 + 1) % inFifo.length;
      const f = pos - Math.floor(pos);
      mid48[this.mw] = inFifo[i0] * (1 - f) + inFifo[i1] * f;
      this.mw = (this.mw + 1) % mid48.length;
      pos += this.ratioIn;
    }
    this.ir = (this.ir + Math.floor(pos)) % inFifo.length;
    this.srcPos = pos - Math.floor(pos);
  }
  // ---- ресемплер 48k→ctx --------------------------------------------------
  _resampleOut(n, out) {
    const { out48 } = this;
    const avail = (this.ow - this.or + out48.length) % out48.length;
    let produced = 0;
    let pos = this.dstPos;
    while (produced < n && pos + 1 < avail) {
      const i0 = (this.or + Math.floor(pos)) % out48.length;
      const i1 = (i0 + 1) % out48.length;
      const f = pos - Math.floor(pos);
      out[produced] = out48[i0] * (1 - f) + out48[i1] * f;
      produced++;
      pos += this.ratioOut;
    }
    this.or = (this.or + Math.floor(pos)) % out48.length;
    this.dstPos = pos - Math.floor(pos);
    return produced;
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const frames = out[0].length;
    const inCh = inp && inp.length ? inp[0] : null;

    // моно-вход в fifo
    if (inCh) {
      for (let i = 0; i < frames; i++) {
        this.inFifo[this.iw] = inCh[i];
        this.iw = (this.iw + 1) % this.inFifo.length;
      }
    } else {
      for (let i = 0; i < frames; i++) {
        this.inFifo[this.iw] = 0;
        this.iw = (this.iw + 1) % this.inFifo.length;
      }
    }
    this._resampleIn();

    // кадры по 480
    const frame = new Float32Array(FS);
    while ((this.mw - this.mr + this.mid48.length) % this.mid48.length >= FS) {
      for (let i = 0; i < FS; i++) {
        frame[i] = this.mid48[this.mr];
        this.mr = (this.mr + 1) % this.mid48.length;
      }
      this._processFrame(frame);
    }

    // выгрузка на частоте контекста + mix/gain
    const p = this.p;
    const amount = p.amount / 100, gate = p.gate / 100;
    const wet = p.bypass ? 0 : amount;
    const dry = 1 - wet;
    const og = Math.pow(10, p.outGainDb / 20);
    const tmp = new Float32Array(frames);
    const got = this._resampleOut(frames, tmp);
    for (let i = 0; i < frames; i++) {
      const w = i < got ? tmp[i] : 0;
      for (let ch = 0; ch < out.length; ch++) {
        const srcCh = inCh ? inp[Math.min(ch, inp.length - 1)] : null;
        const d = srcCh ? srcCh[i] : 0;
        out[ch][i] = p.bypass ? d : (d * dry + w * wet) * og;
      }
    }

    if ((this.block++ & 7) === 0) {
      const gr = this.grSmooth;
      const envDb = 20 * Math.log10(Math.max(this.noiseFloor, 1e-4));
      this.port.postMessage({ type: 'meter', gr: +gr.toFixed(1), env: +envDb.toFixed(1), gate: this.gateGain });
    }
    return true;
  }

  _processFrame(frame) {
    const p = this.p;
    let rms = 0;
    for (let i = 0; i < FS; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / FS);

    let wetFrame;
    if (!this.core || this.failed || p.bypass) {
      wetFrame = frame; // passthrough
      this.grSmooth = this.grSmooth * 0.9 + 0 * 0.1;
    } else {
      // авто-нормализация уровня в рабочую зону нейросети
      let g = rms > 1e-5 ? TARGET_RMS / rms : 1;
      if (g > 16) g = 16; else if (g < 0.0625) g = 0.0625;
      this.gsm = this.gsm + 0.5 * (g - this.gsm);
      const norm = new Float32Array(FS);
      for (let i = 0; i < FS; i++) norm[i] = frame[i] * this.gsm;
      const den = new Float32Array(FS);
      this.core.frame(norm, den);
      const inv = 1 / this.gsm;
      for (let i = 0; i < FS; i++) den[i] *= inv;
      wetFrame = den;

      // уровень давки для метра (по сглаженному кадру)
      let or2 = 0;
      for (let i = 0; i < FS; i++) or2 += den[i] * den[i];
      const orRms = Math.sqrt(or2 / FS);
      const gr = rms > 1e-5 ? 20 * Math.log10(Math.max(orRms / rms, 1e-4)) : 0;
      this.grSmooth = this.grSmooth * 0.7 + Math.min(gr, 0) * 0.3;
    }

    // свой гейт по полу шума: мин-трекинг RMS
    const k = Math.exp(-FS / RATE / 1.2);      // ~1.2 c спуск пола
    if (this.noiseFloor === 0) this.noiseFloor = rms;
    this.noiseFloor = Math.min(this.noiseFloor * k, rms);
    const ratio = rms / Math.max(this.noiseFloor, 1e-6);
    const wantOpen = gate <= 0 || ratio >= (1 + 5 * gate);
    const target = wantOpen ? 1 : 0;
    this.gateGain += (target - this.gateGain) * (target > this.gateGain ? 0.5 : 0.06);

    const { out48 } = this;
    for (let i = 0; i < FS; i++) {
      out48[this.ow] = wetFrame[i] * this.gateGain;
      this.ow = (this.ow + 1) % out48.length;
    }
  }
}
registerProcessor('ai-denoise-proc', AiDenoiseProcessor);
