// AI De-Noise — нейросетевой шумодав RNNoise (wasm) в стиле FabFilter
import { defineWorklet, renderParams, ledMeter } from './base.js';
import { proShell } from './displays.js';

// wasm компилируется один раз на main-потоке и раздаётся нодам
let wasmMod = null;
let wasmPromise = null;
const pendingNodes = new Set();

function fetchWasm() {
  if (wasmPromise) return wasmPromise;
  wasmPromise = fetch(new URL('../../worklets/rnnoise.wasm', import.meta.url))
    .then((r) => r.arrayBuffer())
    .then((buf) => WebAssembly.compile(buf))
    .then((m) => {
      wasmMod = m;
      for (const node of pendingNodes) { try { node.port.postMessage({ type: 'wasm', mod: m }); } catch {} }
      pendingNodes.clear();
      return m;
    })
    .catch(() => null);
  return wasmPromise;
}
fetchWasm(); // старт при загрузке страницы

const params = [
  { id: 'amount', name: 'Сила', nameEn: 'Amount', min: 0, max: 100, def: 100, fmt: 'pct' },
  { id: 'gate', name: 'Гейт голоса', nameEn: 'Voice Gate', min: 0, max: 100, def: 60, fmt: 'pct' },
  { id: 'outGainDb', name: 'Выход', nameEn: 'Output', min: -18, max: 6, def: 0, fmt: 'db' },
  { id: 'bypass', name: 'Байпас', nameEn: 'Bypass', kind: 'toggle', def: 0 },
];

const AiBase = defineWorklet({
  id: 'aidenoise', name: 'AI De-Noise', nameEn: 'AI De-Noise', category: 'Очистка', proc: 'ai-denoise-proc',
  desc: 'Нейросетевой шумодав RNNoise: убирает вентиляторы, гул, улицу — без обучения профилю',
  descEn: 'RNNoise neural denoiser: kills fans, hum and street noise with zero profile training',
  brand: 'AI De-Noise', accent: '#b18cff',
  params,
  processorOptions: () => (wasmMod ? { mod: wasmMod } : undefined),
  renderBody(container, inst, onAny, ectx) {
    const { main, disp } = proShell(container, {
      engine: ectx.engine, trackId: ectx.trackId, accent: AiBase.accent,
      mode: 'spectrum', height: 200,
      meter: (right) => ledMeter(right, inst, { mode: 'gr', accent: AiBase.accent, label: 'Reduction', height: 330 }),
    });

    const note = document.createElement('div');
    note.className = 'ff-note';
    note.style.cssText = 'padding:8px 12px 0;display:flex;gap:6px;align-items:center';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#b18cff;box-shadow:0 0 6px #b18cff';
    note.append(dot, document.createTextNode('RNNoise · neural network · no profile needed'));
    main.appendChild(note);

    const row = document.createElement('div');
    row.className = 'ff-knobrow';
    renderParams(row, inst, params, onAny, AiBase.accent);
    main.appendChild(row);
    return () => disp.destroy();
  },
});

// build поверх базового: раздаём wasm нодам, если он ещё не был готов
const origBuild = AiBase.build;
AiBase.build = function (ctx, state) {
  const inst = origBuild(ctx, state);
  if (!wasmMod && wasmPromise) {
    pendingNodes.add(inst.input);
    wasmPromise.then((m) => { pendingNodes.delete(inst.input); });
  }
  return inst;
};

export const AiDenoisePlugin = AiBase;
