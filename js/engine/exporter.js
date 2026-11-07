// Рендер в WAV: микс всех дорожек (каждая со своей цепочкой, гейном, паном)
// или одна дорожка с её цепочкой
import { encodeWav } from './wav.js';
import { getDef } from '../plugins/registry.js';
import { WORKLET_FILES } from './engine.js';

const TAIL_SEC = 2; // хвост для ревербов/дилеев

// Оффлайн-микс всех дорожек (айтемы со своими позициями) → каналы
export async function mixTracksOffline(tracks, { chain = true } = {}) {
  const entries = [];
  let maxEnd = 0;
  for (const t of tracks) {
    for (const item of t.items) {
      if (!item.len) continue;
      entries.push({ t, item });
      maxEnd = Math.max(maxEnd, item.start + item.len);
    }
  }
  if (!entries.length) throw new Error('Нет аудио для экспорта');
  const sr = entries[0].item.sr;
  const len = Math.ceil(maxEnd + TAIL_SEC * sr);
  const ofc = new OfflineAudioContext(2, len, sr);
  if (chain && entries.some((e) => (e.t.chStates || []).length)) {
    await Promise.all(WORKLET_FILES.map((w) => ofc.audioWorklet.addModule(w)));
  }
  const mix = ofc.createGain();
  mix.connect(ofc.destination);
  const anySolo = entries.some((e) => e.t.solo);
  for (const { t, item } of entries) {
    const buf = ofc.createBuffer(item.chans.length, item.len, sr);
    for (let ch = 0; ch < item.chans.length; ch++) buf.copyToChannel(item.chans[ch], ch);
    const src = ofc.createBufferSource();
    src.buffer = buf;
    let node = src;
    if (chain) {
      for (const cs of t.chStates || []) {
        const def = getDef(cs.plugin);
        if (!def || cs.enabled === false) continue;
        const inst = def.build(ofc, cs.state);
        node.connect(inst.input);
        node = inst.output;
      }
    }
    const g = ofc.createGain();
    g.gain.value = (t.mute || (anySolo && !t.solo)) ? 0 : (t.gain !== undefined ? t.gain : 1);
    const pan = ofc.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, t.pan || 0));
    node.connect(g); g.connect(pan); pan.connect(mix);
    src.start(item.start / sr);
  }
  const rendered = await ofc.startRendering();
  return {
    chans: [rendered.getChannelData(0), rendered.getChannelData(1)],
    sr,
    len: rendered.length,
  };
}

export async function renderMix(tracks, { bitDepth = 24, chain = true } = {}) {
  const { chans, sr } = await mixTracksOffline(tracks, { chain });
  return new Blob([encodeWav(chans, sr, bitDepth)], { type: 'audio/wav' });
}

export async function renderClip(clip, chainStates, { bitDepth = 24 } = {}) {
  if (!clip || clip.len === 0) throw new Error('Клип пуст');
  const sr = clip.sr, nch = clip.chans.length, len = clip.len;
  const ofc = new OfflineAudioContext(nch, len, sr);
  const insts = [];
  if (chainStates && chainStates.length) {
    await Promise.all(WORKLET_FILES.map((w) => ofc.audioWorklet.addModule(w)));
    for (const cs of chainStates) {
      const def = getDef(cs.plugin);
      if (!def || cs.enabled === false) continue;
      insts.push(def.build(ofc, cs.state));
    }
  }
  const buf = ofc.createBuffer(nch, len, sr);
  for (let ch = 0; ch < nch; ch++) buf.copyToChannel(clip.chans[ch], ch);
  const src = ofc.createBufferSource();
  src.buffer = buf;
  let prev = src;
  for (const inst of insts) { prev.connect(inst.input); prev = inst.output; }
  prev.connect(ofc.destination);
  src.start(0);
  const rendered = await ofc.startRendering();
  const outChans = [];
  for (let ch = 0; ch < nch; ch++) outChans.push(rendered.getChannelData(ch));
  return new Blob([encodeWav(outChans, sr, bitDepth)], { type: 'audio/wav' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
