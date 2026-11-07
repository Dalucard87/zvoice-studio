// Реестр плагинов
import { AiDenoisePlugin } from './aidenoise.js';
import { DenoisePlugin } from './denoise.js';
import { GatePlugin } from './gate.js';
import { DeEsserPlugin } from './deesser.js';
import { EqPlugin } from './eq.js';
import { CompPlugin } from './comp.js';
import { LimiterPlugin } from './limiter.js';
import { GainPlugin } from './gain.js';
import { SaturationPlugin } from './saturation.js';
import { ChorusPlugin } from './chorus.js';
import { DelayPlugin } from './delay.js';
import { ReverbPlugin } from './reverb.js';

export const PLUGIN_LIST = [
  AiDenoisePlugin,
  DenoisePlugin, GatePlugin, DeEsserPlugin,
  EqPlugin, SaturationPlugin,
  CompPlugin, LimiterPlugin, GainPlugin,
  ChorusPlugin, DelayPlugin, ReverbPlugin,
];

const MAP = Object.fromEntries(PLUGIN_LIST.map((p) => [p.id, p]));
export const getDef = (id) => MAP[id];
