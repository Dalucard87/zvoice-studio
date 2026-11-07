// Модель клипа и операции редактирования с undo/redo (оперы-вставки)

export function makeClip(name, chans, sr) {
  return { name, chans, sr, len: chans[0].length, rev: 1, history: { undo: [], redo: [] } };
}

// Вставка: удалить removed на позиции at, вставить inserted
export function applyOp(clip, op) {
  const nch = clip.chans.length;
  for (let ch = 0; ch < nch; ch++) {
    const data = clip.chans[ch];
    const ins = op.inserted[Math.min(ch, op.inserted.length - 1)] || new Float32Array(0);
    const rem = op.removed[Math.min(ch, op.removed.length - 1)] || new Float32Array(0);
    const nd = new Float32Array(data.length - rem.length + ins.length);
    nd.set(data.subarray(0, op.at));
    nd.set(ins, op.at);
    nd.set(data.subarray(op.at + rem.length), op.at + ins.length);
    clip.chans[ch] = nd;
  }
  clip.len = clip.chans[0].length;
  clip.rev = (clip.rev || 0) + 1;
}

export function pushOp(clip, op) {
  applyOp(clip, op);
  clip.history.undo.push(op);
  if (clip.history.undo.length > 40) clip.history.undo.shift();
  clip.history.redo.length = 0;
}

export function undo(clip) {
  const op = clip.history.undo.pop();
  if (!op) return false;
  applyOp(clip, { at: op.at, removed: op.inserted, inserted: op.removed });
  clip.history.redo.push(op);
  return true;
}
export function redo(clip) {
  const op = clip.history.redo.pop();
  if (!op) return false;
  applyOp(clip, op);
  clip.history.undo.push(op);
  return true;
}

export const extract = (clip, a, b) => clip.chans.map((d) => d.slice(a, b));

export function cut(clip, a, b) {
  const rem = extract(clip, a, b);
  pushOp(clip, { at: a, removed: rem, inserted: rem.map(() => new Float32Array(0)) });
  return rem;
}
export function del(clip, a, b) { cut(clip, a, b); }

export function paste(clip, at, segments) {
  pushOp(clip, {
    at,
    removed: clip.chans.map(() => new Float32Array(0)),
    inserted: segments,
  });
}

export function silence(clip, a, b) {
  const rem = extract(clip, a, b);
  pushOp(clip, { at: a, removed: rem, inserted: rem.map(() => new Float32Array(b - a)) });
}

export function fadeIn(clip, a, b) {
  const seg = clip.chans.map((d) => {
    const s = d.slice(a, b);
    for (let i = 0; i < s.length; i++) s[i] *= i / s.length;
    return s;
  });
  pushOp(clip, { at: a, removed: extract(clip, a, b), inserted: seg });
}
export function fadeOut(clip, a, b) {
  const seg = clip.chans.map((d) => {
    const s = d.slice(a, b);
    for (let i = 0; i < s.length; i++) s[i] *= 1 - i / s.length;
    return s;
  });
  pushOp(clip, { at: a, removed: extract(clip, a, b), inserted: seg });
}

export function normalize(clip, a, b, targetDb = -1) {
  let peak = 1e-9;
  for (const d of clip.chans) {
    const end = Math.min(b, d.length);
    for (let i = a; i < end; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const k = Math.pow(10, targetDb / 20) / peak;
  const seg = clip.chans.map((d) => {
    const s = d.slice(a, b);
    for (let i = 0; i < s.length; i++) s[i] *= k;
    return s;
  });
  pushOp(clip, { at: a, removed: extract(clip, a, b), inserted: seg });
  return k;
}

// Оставить только выделение (одним опом — целиком откатывается)
export function trimToSel(clip, a, b) {
  const sel = extract(clip, a, b);
  const all = clip.chans.map((d) => d);
  pushOp(clip, { at: 0, removed: all, inserted: sel });
}

export function clipFromAudioBuffer(ab, name) {
  const chans = [];
  for (let ch = 0; ch < ab.numberOfChannels; ch++) chans.push(ab.getChannelData(ch).slice());
  return makeClip(name || 'Импорт', chans, ab.sampleRate);
}
