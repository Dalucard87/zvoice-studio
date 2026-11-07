// i18n: словарь ru/en, t(), применение к статичной разметке
const LS = 'zvoice.settings';
export function loadSettings() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
export function saveSettings(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} }

const RU = {
  // транспорт
  'tip.home': 'В начало (Home)', 'tip.play': 'Воспроизведение / Пауза (Пробел)',
  'tip.stop': 'Стоп', 'tip.loop': 'Цикл по выделению', 'tip.record': 'Запись в дорожку (R)',
  'monitor': 'Мониторинг', 'tip.monitor': 'Слышать микрофон через цепочку (только в наушниках!)',
  'dev.default': '— по умолчанию —', 'tip.bypass': 'Обход всех цепочек (быстрое A/B)',
  'imp': '📂 Импорт', 'tip.imp': 'Файл → новая дорожка',
  'exp': '💾 Экспорт WAV', 'tip.exp': 'Рендер в WAV',
  'tip.settings': 'Настройки',
  // панель редактирования
  'tb.undo': '↶ Отменить', 'tb.redo': '↷ Повторить', 'tb.cut': '✂ Вырезать',
  'tb.copy': '⧉ Копировать', 'tb.paste': '⎘ Вставить', 'tb.del': '✕ Удалить',
  'tb.silence': 'Тишина', 'tb.trim': 'Обрезать', 'tb.fadein': '↘ Фейд-ин',
  'tb.fadeout': '↗ Фейд-аут', 'tb.norm': 'Нормализовать', 'tb.all': 'Всё', 'tb.none': 'Снять',
  'tip.undo': 'Отменить (Ctrl+Z)', 'tip.redo': 'Повторить (Ctrl+Shift+Z)',
  'tip.cut': 'Вырезать (Ctrl+X)', 'tip.copy': 'Копировать (Ctrl+C)', 'tip.paste': 'Вставить (Ctrl+V)',
  'tip.del': 'Удалить выделение (Del)', 'tip.silence': 'Заглушить выделение',
  'tip.trim': 'Оставить только выделенное', 'tip.fadein': 'Фейд-ин на выделении',
  'tip.fadeout': 'Фейд-аут на выделении', 'tip.norm': 'Нормализовать выделение до −1 дБ',
  'tip.all': 'Выделить всё (Ctrl+A)', 'tip.none': 'Снять выделение (Esc)',
  'tip.zoomin': 'Приблизить', 'tip.zoomout': 'Отдалить', 'tip.zoomfit': 'Показать всё',
  // таймлайн
  'tracks': 'Дорожки', 'addTrack': '＋ Дорожка', 'tip.addTrack': 'Новая пустая дорожка',
  'dropHint': 'Перетащи сюда аудиофайл — станет новой дорожкой · или жми ⏺',
  'laneEmpty': 'пусто — ⏺ запиши или перетащи файл',
  // FX-окно
  'fx.pick': 'Выбери плагин слева — его настройки появятся здесь',
  'fx.presets.ph': '— пресеты цепочки —', 'fx.preset.builtin': 'Встроенные', 'fx.preset.mine': 'Мои',
  'fx.add': '＋', 'tip.fx.add': 'Добавить плагин в цепочку', 'tip.fx.save': 'Сохранить цепочку как пресет',
  'tip.fx.close': 'Закрыть', 'tip.fx.del': 'Удалить из цепочки', 'tip.fx.power': 'Вкл/выкл (байпас)',
  'fx.rename': 'FX', 'fx.title': 'FX: «{name}»',
  'st.tracks': 'дорожек: {n}',
  // статус
  'st.hint': 'Пробел — плей/стоп · R — запись в дорожку · клик по дорожке — выбрать · колесо — зум',
  // категории
  'cat.clean': 'Очистка', 'cat.dyn': 'Динамика', 'cat.tone': 'Тембр', 'cat.fx': 'Эффекты', 'cat.level': 'Уровень',
  // диалог настроек
  'dlg.title': 'Настройки', 'dlg.lang': 'Язык интерфейса', 'dlg.theme': 'Тема',
  'dlg.out': 'Устройство вывода', 'dlg.overdub': 'Играть остальные дорожки при записи (овердаб)',
  'dlg.reset': 'Сбросить настройки', 'theme.dark': 'Тёмная', 'theme.black': 'Чёрная (OLED)', 'theme.mid': 'Полуночная',
  // тосты/диалоги
  't.ready': 'Готово. FX на дорожке — окно цепочки · ⏺ — записать · ＋ Дорожка — добавить.',
  't.recording': 'Запись в «{name}»{overdub}. «Мониторинг» — слышать себя (наушники!)',
  't.overdub.on': ' (остальные дорожки играют)', 't.overdub.off': '',
  't.recorded': 'Записано в «{name}»: {len}',
  't.emptyRec': 'Пустая запись', 't.micErr': 'Нет доступа к микрофону: {err}',
  't.monitorWarn': 'Мониторинг включён — используй наушники, иначе самовозбуждение!',
  't.imported': 'Новая дорожка: {file}', 't.decodeErr': 'Не удалось декодировать: {err}',
  't.noClip': 'Активная дорожка пуста', 't.expDone': 'Готово: WAV {bits} бит',
  't.expErr': 'Ошибка рендера: {err}', 't.delAll': 'Все дорожки удалены. ＋ Дорожка — добавить новую.',
  't.trackName': 'Название дорожки:', 't.delTrack': 'Удалить дорожку «{name}» вместе с аудио?',
  't.presetName': 'Название пресета цепочки:', 't.presetNeedTrack': 'Сначала открой FX на дорожке',
  'exp.mix': 'Микс всех дорожек (с цепочками) · {bits} бит', 'exp.mixdry': 'Микс без обработки · 24 бит',
  'exp.track': 'Активная дорожка (с её цепочкой) · 24 бит',
  'eq.freq': 'Частота', 'eq.gain': 'Гейн', 'eq.q': 'Q', 'eq.band': 'Полоса {n}',
  'dn.learn': '🎙 Учить шум (удерживай)', 'dn.reset': 'Сбросить профиль',
  'dn.noProfile': 'Профиль не задан — давка выключена', 'dn.listening': 'Слушаю шум — молчи 2–3 секунды…',
  'dn.done': 'Профиль шума обновлён ✓',
  'dsp.noSignal': 'нет сигнала — выбери дорожку с аудио',
  'st.latency': 'выход {ms} мс',
  'track.default': 'Дорожка {n}', 'track.voice': 'Голос', 'track.take': 'Дубль {n}',
  'tip.tr.rename': 'Двойной клик — переименовать', 'tip.tr.del': 'Удалить дорожку',
  'tip.tr.m': 'Заглушить', 'tip.tr.s': 'Соло', 'tip.tr.vol': 'Громкость',
  'tip.tr.pan': 'Панорама', 'tip.tr.fx': 'Цепочка эффектов дорожки (окно FX)',
  'dlg.appearance': 'Внешний вид', 'dlg.behavior': 'Поведение',
  'dlg.accent': 'Акцентный цвет', 'dlg.accent.def': 'Стандартный',
  'dlg.scale': 'Масштаб интерфейса', 'dlg.laneH': 'Высота дорожек',
  'dlg.follow': 'Следовать за плейхедом при воспроизведении',
  'dlg.confirmDel': 'Спрашивать подтверждение при удалении дорожки',
  'dlg.mastervol': 'Громкость выхода',
  'dlg.hotkeys': 'Горячие клавиши',
  'hk.play': 'Плей / Стоп', 'hk.record': 'Запись', 'hk.loop': 'Цикл по выделению',
  'hk.del': 'Удалить выделение', 'hk.undo': 'Отменить', 'hk.redo': 'Повторить',
  'hk.cut': 'Вырезать', 'hk.copy': 'Копировать', 'hk.paste': 'Вставить',
  'hk.selall': 'Выделить всё', 'hk.clearsel': 'Снять выделение', 'hk.home': 'Курсор в начало',
  'hk.press': 'Нажми клавишу…', 'hk.disabled': 'Отключено',
  'hk.reset': 'Сбросить горячие клавиши', 'hk.tip': 'Клик — переназначить, ✕ — отключить',
  'st.hint.dyn': '{play} — плей/стоп · {record} — запись в дорожку · клик по дорожке — выбрать · колесо — зум',
  'tb.split': 'Разделить', 'tb.merge': 'Склеить',
  'tip.split': 'Разделить дорожку на две по курсору', 'tip.merge': 'Склеить все дорожки в одну (микс с эффектами)',
  'hk.split': 'Разделить дорожку', 'hk.merge': 'Склеить дорожки',
  'track.split': '{name} — часть 2', 'track.merged': 'Склейка',
  'split.needCursor': 'Поставь курсор внутрь аудио дорожки',
  'split.done': 'Разделено: «{name}»', 'merge.need2': 'Нужно минимум две дорожки с аудио',
  'merge.render': 'Склеиваю…', 'merge.done': 'Склеено: «{name}»',
  'dlg.projects': 'Проекты', 'dlg.projdir': 'Папка проектов', 'dlg.pickdir': 'Выбрать…',
  'proj.dirNone': 'не выбрана', 'proj.dirSet': 'Папка проектов: {name}',
  'proj.name': 'Имя проекта:', 'proj.saved': 'Сохранено: {file}',
  'proj.err': 'Ошибка: {err}', 'proj.loaded': 'Проект «{name}» загружен, дорожек: {n}',
  'proj.overwrite': 'Заменить текущий проект?',
  'imp.audio': 'Импорт аудиофайла (новая дорожка)', 'imp.project': 'Открыть проект (.zip)',
  'exp.project': 'Сохранить проект (.zip: WAV каждой дорожки + цепочки)',
};

const EN = {
  'tip.home': 'To start (Home)', 'tip.play': 'Play / Pause (Space)',
  'tip.stop': 'Stop', 'tip.loop': 'Loop selection', 'tip.record': 'Record into track (R)',
  'monitor': 'Monitoring', 'tip.monitor': 'Hear the mic through the chain (headphones only!)',
  'dev.default': '— default —', 'tip.bypass': 'Bypass all chains (quick A/B)',
  'imp': '📂 Import', 'tip.imp': 'File → new track',
  'exp': '💾 Export WAV', 'tip.exp': 'Render to WAV',
  'tip.settings': 'Settings',
  'tb.undo': '↶ Undo', 'tb.redo': '↷ Redo', 'tb.cut': '✂ Cut',
  'tb.copy': '⧉ Copy', 'tb.paste': '⎘ Paste', 'tb.del': '✕ Delete',
  'tb.silence': 'Silence', 'tb.trim': 'Trim', 'tb.fadein': '↘ Fade in',
  'tb.fadeout': '↗ Fade out', 'tb.norm': 'Normalize', 'tb.all': 'All', 'tb.none': 'None',
  'tip.undo': 'Undo (Ctrl+Z)', 'tip.redo': 'Redo (Ctrl+Shift+Z)',
  'tip.cut': 'Cut (Ctrl+X)', 'tip.copy': 'Copy (Ctrl+C)', 'tip.paste': 'Paste (Ctrl+V)',
  'tip.del': 'Delete selection (Del)', 'tip.silence': 'Silence selection',
  'tip.trim': 'Keep selection only', 'tip.fadein': 'Fade in on selection',
  'tip.fadeout': 'Fade out on selection', 'tip.norm': 'Normalize selection to −1 dB',
  'tip.all': 'Select all (Ctrl+A)', 'tip.none': 'Clear selection (Esc)',
  'tip.zoomin': 'Zoom in', 'tip.zoomout': 'Zoom out', 'tip.zoomfit': 'Zoom to fit',
  'tracks': 'Tracks', 'addTrack': '＋ Track', 'tip.addTrack': 'New empty track',
  'dropHint': 'Drop an audio file here — it becomes a new track · or press ⏺',
  'laneEmpty': 'empty — ⏺ record or drop a file',
  'fx.pick': 'Pick a plugin on the left — its settings appear here',
  'fx.presets.ph': '— chain presets —', 'fx.preset.builtin': 'Built-in', 'fx.preset.mine': 'My presets',
  'fx.add': '＋', 'tip.fx.add': 'Add plugin to the chain', 'tip.fx.save': 'Save chain as preset',
  'tip.fx.close': 'Close', 'tip.fx.del': 'Remove from chain', 'tip.fx.power': 'On/off (bypass)',
  'fx.rename': 'FX', 'fx.title': 'FX: “{name}”',
  'st.tracks': 'tracks: {n}',
  'st.hint': 'Space — play/stop · R — record into track · click a track to select · wheel — zoom',
  'cat.clean': 'Cleaning', 'cat.dyn': 'Dynamics', 'cat.tone': 'Tone', 'cat.fx': 'Effects', 'cat.level': 'Level',
  'dlg.title': 'Settings', 'dlg.lang': 'Interface language', 'dlg.theme': 'Theme',
  'dlg.out': 'Output device', 'dlg.overdub': 'Play other tracks while recording (overdub)',
  'dlg.reset': 'Reset settings', 'theme.dark': 'Dark', 'theme.black': 'Black (OLED)', 'theme.mid': 'Midnight',
  't.ready': 'Ready. FX on a track opens the chain · ⏺ — record · ＋ Track — add.',
  't.recording': 'Recording into “{name}”{overdub}. “Monitoring” — hear yourself (headphones!)',
  't.overdub.on': ' (other tracks playing)', 't.overdub.off': '',
  't.recorded': 'Recorded into “{name}”: {len}',
  't.emptyRec': 'Empty take', 't.micErr': 'Microphone access failed: {err}',
  't.monitorWarn': 'Monitoring is on — use headphones to avoid feedback!',
  't.imported': 'New track: {file}', 't.decodeErr': 'Cannot decode: {err}',
  't.noClip': 'Active track is empty', 't.expDone': 'Done: WAV {bits}-bit',
  't.expErr': 'Render error: {err}', 't.delAll': 'All tracks removed. ＋ Track to add a new one.',
  't.trackName': 'Track name:', 't.delTrack': 'Delete track “{name}” with its audio?',
  't.presetName': 'Chain preset name:', 't.presetNeedTrack': 'Open FX on a track first',
  'exp.mix': 'Mix of all tracks (with chains) · {bits}-bit', 'exp.mixdry': 'Mix unprocessed · 24-bit',
  'exp.track': 'Active track (with its chain) · 24-bit',
  'eq.freq': 'Freq', 'eq.gain': 'Gain', 'eq.q': 'Q', 'eq.band': 'Band {n}',
  'dn.learn': '🎙 Learn noise (hold)', 'dn.reset': 'Reset profile',
  'dn.noProfile': 'No profile — reduction is off', 'dn.listening': 'Listening — stay silent for 2–3 s…',
  'dn.done': 'Noise profile updated ✓',
  'dsp.noSignal': 'no signal — select a track with audio',
  'st.latency': 'out {ms} ms',
  'track.default': 'Track {n}', 'track.voice': 'Voice', 'track.take': 'Take {n}',
  'tip.tr.rename': 'Double-click to rename', 'tip.tr.del': 'Delete track',
  'tip.tr.m': 'Mute', 'tip.tr.s': 'Solo', 'tip.tr.vol': 'Volume',
  'tip.tr.pan': 'Pan', 'tip.tr.fx': 'Track FX chain (FX window)',
  'dlg.appearance': 'Appearance', 'dlg.behavior': 'Behavior',
  'dlg.accent': 'Accent color', 'dlg.accent.def': 'Default',
  'dlg.scale': 'Interface scale', 'dlg.laneH': 'Track height',
  'dlg.follow': 'Follow the playhead during playback',
  'dlg.confirmDel': 'Confirm before deleting a track',
  'dlg.mastervol': 'Output volume',
  'dlg.hotkeys': 'Hotkeys',
  'hk.play': 'Play / Stop', 'hk.record': 'Record', 'hk.loop': 'Loop selection',
  'hk.del': 'Delete selection', 'hk.undo': 'Undo', 'hk.redo': 'Redo',
  'hk.cut': 'Cut', 'hk.copy': 'Copy', 'hk.paste': 'Paste',
  'hk.selall': 'Select all', 'hk.clearsel': 'Clear selection', 'hk.home': 'Cursor to start',
  'hk.press': 'Press a key…', 'hk.disabled': 'Disabled',
  'hk.reset': 'Reset hotkeys', 'hk.tip': 'Click to remap, ✕ to disable',
  'st.hint.dyn': '{play} — play/stop · {record} — record into track · click a track to select · wheel — zoom',
  'tb.split': 'Split', 'tb.merge': 'Glue',
  'tip.split': 'Split the track in two at the cursor', 'tip.merge': 'Glue all tracks into one (mix with effects)',
  'hk.split': 'Split track', 'hk.merge': 'Glue tracks',
  'track.split': '{name} — part 2', 'track.merged': 'Glue',
  'split.needCursor': 'Place the cursor inside the track audio',
  'split.done': 'Split: “{name}”', 'merge.need2': 'Need at least two tracks with audio',
  'merge.render': 'Gluing…', 'merge.done': 'Glued: “{name}”',
  'dlg.projects': 'Projects', 'dlg.projdir': 'Project folder', 'dlg.pickdir': 'Choose…',
  'proj.dirNone': 'not set', 'proj.dirSet': 'Project folder: {name}',
  'proj.name': 'Project name:', 'proj.saved': 'Saved: {file}',
  'proj.err': 'Error: {err}', 'proj.loaded': 'Project “{name}” loaded, tracks: {n}',
  'proj.overwrite': 'Replace the current project?',
  'imp.audio': 'Import audio file (new track)', 'imp.project': 'Open project (.zip)',
  'exp.project': 'Save project (.zip: per-track WAVs + chains)',
};

const DICT = { ru: RU, en: EN };

let lang = loadSettings().lang || 'en';
if (lang !== 'ru' && lang !== 'en') lang = 'en';

export const getLang = () => lang;

export function setLang(l) {
  if (l !== 'ru' && l !== 'en') return;
  if (l === lang) return;
  lang = l;
  const s = loadSettings(); s.lang = l; saveSettings(s);
  document.dispatchEvent(new CustomEvent('langchange'));
}

export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? RU[key] ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

// Подставить переводы в статичную разметку (data-i18n / data-i18n-title)
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
