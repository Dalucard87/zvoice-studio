// Пресеты цепочки: значения из SETUP.md для ZONIS + пользовательские
const LS_KEY = 'zvoice.userPresets';

export const CHAIN_PRESETS = {
  'ZONIS · Стрим (из SETUP.md)': [
    { plugin: 'denoise', state: { strength: 2.4, floorDb: -28, smooth: 0.35 } },
    { plugin: 'gain', state: { gain: 6 } },
    { plugin: 'gate', state: { openThr: -38, hyst: 7, range: -35, attack: 1, hold: 250, release: 100, lookahead: 5, detLow: 100, detHigh: 4000, detOn: 1 } },
    { plugin: 'eq', state: { bands: [
      { on: 1, type: 'lowcut', freq: 85, gain: 0, q: 0.7 },
      { on: 1, type: 'peak', freq: 300, gain: -3, q: 1.4 },
      { on: 1, type: 'peak', freq: 900, gain: -1, q: 2.0 },
      { on: 1, type: 'peak', freq: 3500, gain: 1.5, q: 1.2 },
      { on: 1, type: 'highshelf', freq: 9500, gain: 1, q: 0.7 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1.0 },
    ] } },
    { plugin: 'deesser', state: { split: 5200, thr: -30, ratio: 4, maxRed: 10, attack: 1.5, release: 70 } },
    { plugin: 'comp', state: { thr: -20, ratio: 3, attack: 6, release: 90, knee: 6, makeup: 0 } },
    { plugin: 'limiter', state: { ceiling: -5, release: 60 } },
  ],
  'ZONIS · Тихий голос (гейн до порогов)': [
    { plugin: 'denoise', state: { strength: 2.6, floorDb: -26, smooth: 0.4 } },
    { plugin: 'gain', state: { gain: 10 } },
    { plugin: 'gate', state: { openThr: -42, hyst: 8, range: -30, attack: 0.5, hold: 300, release: 120, lookahead: 7, detLow: 100, detHigh: 4000, detOn: 1 } },
    { plugin: 'eq', state: { bands: [
      { on: 1, type: 'lowcut', freq: 85, gain: 0, q: 0.7 },
      { on: 1, type: 'peak', freq: 300, gain: -3, q: 1.4 },
      { on: 1, type: 'peak', freq: 900, gain: -1, q: 2.0 },
      { on: 1, type: 'peak', freq: 3500, gain: 2, q: 1.2 },
      { on: 1, type: 'highshelf', freq: 9500, gain: 1.5, q: 0.7 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1.0 },
    ] } },
    { plugin: 'deesser', state: { split: 5200, thr: -33, ratio: 4, maxRed: 10, attack: 1.5, release: 70 } },
    { plugin: 'comp', state: { thr: -24, ratio: 3, attack: 6, release: 90, knee: 6, makeup: 2 } },
    { plugin: 'limiter', state: { ceiling: -5, release: 60 } },
  ],
  'Голос · Чистая речь (лёгкая)': [
    { plugin: 'gate', state: { openThr: -45, hyst: 6, range: -20, attack: 1, hold: 200, release: 120, lookahead: 4 } },
    { plugin: 'eq', state: { bands: [
      { on: 1, type: 'lowcut', freq: 90, gain: 0, q: 0.7 },
      { on: 0, type: 'peak', freq: 300, gain: 0, q: 1.4 },
      { on: 0, type: 'peak', freq: 900, gain: 0, q: 2 },
      { on: 1, type: 'peak', freq: 3300, gain: 1.5, q: 1.1 },
      { on: 1, type: 'highshelf', freq: 10000, gain: 1, q: 0.7 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 },
    ] } },
    { plugin: 'comp', state: { thr: -18, ratio: 2, attack: 8, release: 120, knee: 8, makeup: 0 } },
    { plugin: 'limiter', state: { ceiling: -3, release: 60 } },
  ],
  'Подкаст · Тёплый': [
    { plugin: 'denoise', state: { strength: 2, floorDb: -30, smooth: 0.4 } },
    { plugin: 'gate', state: { openThr: -42, hyst: 7, range: -25, attack: 2, hold: 250, release: 150, lookahead: 5 } },
    { plugin: 'eq', state: { bands: [
      { on: 1, type: 'lowcut', freq: 80, gain: 0, q: 0.7 },
      { on: 1, type: 'peak', freq: 250, gain: -2, q: 1.2 },
      { on: 1, type: 'peak', freq: 3200, gain: 2, q: 1.1 },
      { on: 1, type: 'highshelf', freq: 9000, gain: 0.5, q: 0.7 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 },
    ] } },
    { plugin: 'deesser', state: { split: 5600, thr: -32, ratio: 3, maxRed: 8, attack: 2, release: 80 } },
    { plugin: 'comp', state: { thr: -18, ratio: 2.5, attack: 10, release: 120, knee: 10, makeup: 1 } },
    { plugin: 'limiter', state: { ceiling: -4, release: 80 } },
  ],
  'Радио · Плотно и громко': [
    { plugin: 'denoise', state: { strength: 2.5, floorDb: -27, smooth: 0.35 } },
    { plugin: 'gain', state: { gain: 5 } },
    { plugin: 'gate', state: { openThr: -40, hyst: 8, range: -35, attack: 1, hold: 200, release: 90, lookahead: 5 } },
    { plugin: 'eq', state: { bands: [
      { on: 1, type: 'lowcut', freq: 95, gain: 0, q: 0.7 },
      { on: 1, type: 'peak', freq: 320, gain: -3.5, q: 1.4 },
      { on: 1, type: 'peak', freq: 2800, gain: 3, q: 1.0 },
      { on: 1, type: 'highshelf', freq: 9000, gain: 1.5, q: 0.7 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 },
      { on: 0, type: 'peak', freq: 1000, gain: 0, q: 1 },
    ] } },
    { plugin: 'deesser', state: { split: 5000, thr: -30, ratio: 5, maxRed: 10, attack: 1.5, release: 60 } },
    { plugin: 'comp', state: { thr: -24, ratio: 4, attack: 4, release: 80, knee: 4, makeup: 4 } },
    { plugin: 'saturation', state: { drive: 4, type: 'soft', mix: 60 } },
    { plugin: 'limiter', state: { ceiling: -3, release: 50 } },
  ],
  'Пустая цепочка': [],
};

export function getUserPresets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
export function saveUserPreset(name, states) {
  const u = getUserPresets();
  u[name] = states;
  localStorage.setItem(LS_KEY, JSON.stringify(u));
}
export function deleteUserPreset(name) {
  const u = getUserPresets();
  delete u[name];
  localStorage.setItem(LS_KEY, JSON.stringify(u));
}
