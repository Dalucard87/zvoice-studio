// AI-шумодав: RNNoise (нейросеть Xiph.Org, BSD) в WebAssembly.
// Модуль .wasm компилируется на main-потоке и приходит через processorOptions
// (или postMessage — fallback). RNNoise работает на 48 кГц/480 сэмплов,
// поэтому вокруг ядра: ресемплинг ± авто-нормализация уровня ± свой гейт.
//
// Транспорт: очереди-кольца степени двойки со СЧЁТЧИКАМИ занятости —
// переполнение безопасно (дроп старых), арифметика не «перегоняется».

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
const QSIZE = 16384, QMASK = QSIZE - 1;

class AiDenoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // amount/gate приходят в 0..100 из UI
    this.p = { amount: 100, gate: 60, outGainDb: 0, bypass: 0 };
    this.core = null;           // rnnoise-обёртка
    this.failed = false;

    this.ratioIn = sampleRate / RATE;   // шаг по исходнику на один сэмпл 48к
    this.ratioOut = RATE / sampleRate;

    // три очереди: вход контекста (моно) → поток 48к до ядра → выход 48к
    this.iq = new Float32Array(QSIZE); this.iqR = 0; this.iqW = 0; this.iqN = 0;
    this.mq = new Float32Array(QSIZE); this.mqR = 0; this.mqW = 0; this.mqN = 0;
    this.oq = new Float32Array(QSIZE); this.oqR = 0; this.oqW = 0; this.oqN = 0;

    this.srcPos = 0;  // фракционная позиция ресемплера in→48k
    this.dstPos = 0;  // фракционная позиция ресемплера 48k→ctx

    this.gsm = 1;         // сглаженный нормализующий гейн
    this.noiseFloor = 0;  // мин-трекинг пола шума (для гейта)
    this.gateGain = 1;    // сглаженный гейт
    this.grSmooth = 0;
    this.block = 0;
    this.frame = new Float32Array(FS);
    this.tmpOut = new Float32Array(FS);

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

  _clearQueues() {
    this.iqN = this.mqN = this.oqN = 0;
    this.iqR = this.iqW = this.mqR = this.mqW = this.oqR = this.oqW = 0;
    this.srcPos = this.dstPos = 0;
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const frames = out[0].length;
    const inCh = inp && inp.length ? inp[0] : null;
    const p = this.p;

    if (!inCh) {                       // вход не подключён — тишина, очереди чистим
      for (let ch = 0; ch < out.length; ch++) out[ch].fill(0);
      if ((this.block++ & 63) === 0) this._clearQueues();
      return true;
    }

    // 1) моно-вход в очередь
    for (let i = 0; i < frames; i++) {
      this.iq[this.iqW] = inCh[i];
      this.iqW = (this.iqW + 1) & QMASK;
      this.iqN++;
    }
    if (this.iqN > QSIZE - 256) {      // переполнение: дропаем самый старый блок
      const drop = this.iqN - (QSIZE - 256);
      this.iqR = (this.iqR + drop) & QMASK;
      this.iqN -= drop;
    }

    // 2) вход → 48 кГц (линейная интерполяция по дробной позиции)
    let pos = this.srcPos;
    while (pos + 1 < this.iqN && this.mqN < QSIZE - 256) {
      const i0 = (this.iqR + Math.floor(pos)) & QMASK;
      const i1 = (i0 + 1) & QMASK;
      const f = pos - Math.floor(pos);
      this.mq[this.mqW] = this.iq[i0] * (1 - f) + this.iq[i1] * f;
      this.mqW = (this.mqW + 1) & QMASK;
      this.mqN++;
      pos += this.ratioIn;
    }
    const consumed = Math.floor(pos);
    this.iqR = (this.iqR + consumed) & QMASK;
    this.iqN -= consumed;
    this.srcPos = pos - consumed;

    // 3) кадры по 480 → ядро
    while (this.mqN >= FS) {
      for (let i = 0; i < FS; i++) {
        this.frame[i] = this.mq[this.mqR];
        this.mqR = (this.mqR + 1) & QMASK;
      }
      this.mqN -= FS;
      this._processFrame();
    }

    // 4) выход 48 кГц → частота контекста + mix/gain
    const amount = p.amount / 100, gate = p.gate / 100;
    const wet = p.bypass ? 0 : amount;
    const dry = 1 - wet;
    const og = Math.pow(10, p.outGainDb / 20);
    let opos = this.dstPos;
    for (let i = 0; i < frames; i++) {
      let w = 0;
      if (opos < this.oqN) {
        const j0 = (this.oqR + Math.floor(opos)) & QMASK;
        const j1 = (j0 + 1) & QMASK;
        const f = opos - Math.floor(opos);
        w = this.oq[j0] * (1 - f) + this.oq[j1] * f;
      }
      opos += this.ratioOut;
      for (let ch = 0; ch < out.length; ch++) {
        const srcCh = inp[Math.min(ch, inp.length - 1)];
        const d = srcCh ? srcCh[i] : 0;
        out[ch][i] = p.bypass ? d : (d * dry + w * wet) * og;
      }
    }
    const oConsumed = Math.floor(opos);
    this.oqR = (this.oqR + oConsumed) & QMASK;
    this.oqN -= oConsumed;
    this.dstPos = opos - oConsumed;
    if (this.oqN > QSIZE - 256) {      // страховка от накопления на паузах
      const drop = this.oqN - (QSIZE - 256);
      this.oqR = (this.oqR + drop) & QMASK;
      this.oqN -= drop;
    }

    if ((this.block++ & 7) === 0) {
      const envDb = 20 * Math.log10(Math.max(this.noiseFloor, 1e-4));
      this.port.postMessage({ type: 'meter', gr: +this.grSmooth.toFixed(1), env: +envDb.toFixed(1), gate: this.gateGain });
    }
    return true;
  }

  _processFrame() {
    const p = this.p;
    const frame = this.frame;
    let rms = 0;
    for (let i = 0; i < FS; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / FS);

    let wetFrame;
    if (!this.core || this.failed || p.bypass) {
      wetFrame = frame; // passthrough
      this.grSmooth = this.grSmooth * 0.9;
    } else {
      // авто-нормализация уровня в рабочую зону нейросети
      let g = rms > 1e-5 ? TARGET_RMS / rms : 1;
      if (g > 16) g = 16; else if (g < 0.0625) g = 0.0625;
      this.gsm = this.gsm + 0.5 * (g - this.gsm);
      const norm = this.tmpOut;
      for (let i = 0; i < FS; i++) norm[i] = frame[i] * this.gsm;
      const den = new Float32Array(FS);
      this.core.frame(norm, den);
      const inv = 1 / this.gsm;
      for (let i = 0; i < FS; i++) den[i] *= inv;
      wetFrame = den;

      // уровень давки для метра
      let or2 = 0;
      for (let i = 0; i < FS; i++) or2 += den[i] * den[i];
      const orRms = Math.sqrt(or2 / FS);
      const gr = rms > 1e-5 ? 20 * Math.log10(Math.max(orRms / rms, 1e-4)) : 0;
      this.grSmooth = this.grSmooth * 0.7 + Math.min(gr, 0) * 0.3;
    }

    // свой гейт по полу шума: мгновенный мин-трекинг вниз, медленный вверх
    if (rms < this.noiseFloor || this.noiseFloor === 0) this.noiseFloor = rms;
    else this.noiseFloor += (rms - this.noiseFloor) * 0.02;   // вверх ~2%/кадр
    const ratio = rms / Math.max(this.noiseFloor, 1e-6);
    const wantOpen = p.gate <= 0 || ratio >= (1 + 2.5 * p.gate);
    const target = wantOpen ? 1 : 0;
    this.gateGain += (target - this.gateGain) * (target > this.gateGain ? 0.5 : 0.06);

    const { oq } = this;
    for (let i = 0; i < FS; i++) {
      oq[this.oqW] = wetFrame[i] * this.gateGain;
      this.oqW = (this.oqW + 1) & QMASK;
    }
    this.oqN += FS;
    if (this.oqN > QSIZE - 256) {      // дроп старых при переполнении
      const drop = this.oqN - (QSIZE - 256);
      this.oqR = (this.oqR + drop) & QMASK;
      this.oqN -= drop;
    }
  }
}
registerProcessor('ai-denoise-proc', AiDenoiseProcessor);
