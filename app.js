// app.js — часть 1/3 (Adapters · Core · Store · DB · AudioFX · KeshaVoice · Mic · Achievements)
/* Игры Попугая — app.js
   Layers: Adapters -> Core (pure) -> Store -> DB -> AudioFX / KeshaVoice / Mic
           -> Achievements -> UI -> GameRegistry -> Cabinet.
   Core never touches DOM, window or storage: only Adapters do.
   Parts 1..3 form ONE IIFE — concatenate them in order into a single app.js. */
(function () {
'use strict';

/* ==================== Adapters: the only platform boundary ==================== */
var Adapters = {
  storage: {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  },
  now: function () { return Date.now(); },
  perf: function () { return (window.performance && performance.now) ? performance.now() : Date.now(); },
  raf: function (cb) { return window.requestAnimationFrame(cb); },
  caf: function (id) { window.cancelAnimationFrame(id); },
  audioCtor: function () { return window.AudioContext || window.webkitAudioContext || null; },
  media: function () { return (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? navigator.mediaDevices : null; },
  speech: function () { return ('speechSynthesis' in window) ? window.speechSynthesis : null; },
  utter: function (t) { return new SpeechSynthesisUtterance(t); },
  audioEl: function (url) { return new Audio(url); },
  subtle: function () { return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null; },
  random: function () { return Math.random(); },
  log: function () { try { console.log.apply(console, arguments); } catch (e) {} },
  error: function () { try { console.error.apply(console, arguments); } catch (e) {} },
  assert: function (cond, msg) { try { console.assert(cond, msg); } catch (e) {} }
};

var APP = { version: '4.0.0', build: '2026-11-20', key: 'tigra-v4', legacy: ['tigra-v3', 'kesha-v4', 'tigra-v2'] };
var DEV = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/* ==================== utils ==================== */
function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
var TAU = Math.PI * 2;
function uid() { return Math.random().toString(36).slice(2, 9); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function shuffle(a, rng) {
  var r = rng || Math.random, out = a.slice(), i, j, t;
  for (i = out.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}
/* Deterministic PRNG: same seed -> same round (portable to C# System.Random). */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function starPath(c, x, y, r, rot) {
  c.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = rot + i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? r * .45 : r;
    c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
}
function plural(n, f) { var m = n % 100; if (m >= 11 && m <= 14) return f[2]; var k = n % 10; return k === 1 ? f[0] : (k >= 2 && k <= 4 ? f[1] : f[2]); }
var YEAR_MS = 31557600000, DAY_MS = 86400000;
function isoDay(d) { var x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

/* ==================== Core: pure data + rules ==================== */
var Core = {};

Core.GAMES = {
  ship: { id: 'ship', name: 'Кораблик и ветер', emoji: '⛵', color: '#0E7DC2', skill: 'речевое дыхание', desc: 'Дуй в микрофон — ветер наполнит парус. Проплывай звёздные ворота, не прерывая выдох.' },
  odd: { id: 'odd', name: 'Четвёртый лишний', emoji: '🧩', color: '#4CA818', skill: 'логика и речь', desc: 'Найди лишнюю картинку и объясни почему. 20 наборов, звуки [Р][Л][С][Ш], озвучка.' },
  balloon: { id: 'balloon', name: 'Воздушный шарик', emoji: '🎈', color: '#E84393', skill: 'плавный выдох', desc: 'Надуй шарик плавным выдохом до метки и удержи. Дунешь слишком сильно — лопнет.' },
  rhythm: { id: 'rhythm', name: 'Повтори ритм', emoji: '🥁', color: '#F5A623', skill: 'слух и ритм', desc: 'Кеша стучит: БУМ и ТИК. Послушай узор и повтори без ошибок — до 8 узоров.' },
  hard: { id: 'hard', name: 'Твёрдый или мягкий?', emoji: '🪨', color: '#7A2E5E', skill: 'фонематика', desc: 'Кеша говорит слог: [ла] или [ля]? Положи на синий камень или зелёную травку.' },
  syll: { id: 'syll', name: 'Дорожки слогов', emoji: '👏', color: '#E85D04', skill: 'слоговая структура', desc: 'Кеша хлопает: ма-ма, со-ба-ка… Повтори голосом или пробелом точно в такт.' },
  math: { id: 'math', name: 'Кеша считает', emoji: '🐛', color: '#0C8A5A', skill: 'математика и логика', desc: 'Сколько яблок? Где больше? Что дальше? Найди такой же. Для 4–5 лет, без чтения.' }
};
Core.GAME_KEYS = Object.keys(Core.GAMES);

Core.DIFF = {
  ship: { easy: { goal: 80, count: 6, gate: .18, drag: 1.5 }, norm: { goal: 120, count: 8, gate: .26, drag: 1.8 }, hard: { goal: 165, count: 10, gate: .33, drag: 2.1 } },
  balloon: { easy: { tol: 16, hold: 1.2, pop: 44, rounds: 3 }, norm: { tol: 11, hold: 1.6, pop: 34, rounds: 3 }, hard: { tol: 7, hold: 2, pop: 26, rounds: 4 } },
  odd: { easy: { rounds: 6, words: true, freeHint: true }, norm: { rounds: 8, words: true, freeHint: false }, hard: { rounds: 10, words: false, freeHint: false } },
  rhythm: { easy: { step: 640, count: 4 }, norm: { step: 520, count: 6 }, hard: { step: 420, count: 8 } },
  hard: { easy: { n: 6, rate: .7, noise: false, pool: 'syl' }, norm: { n: 8, rate: .85, noise: false, pool: 'word' }, hard: { n: 10, rate: 1, noise: true, pool: 'complex' } },
  syll: { easy: { tempo: 700, accel: 0, pool: 'easy' }, norm: { tempo: 600, accel: 0, pool: 'norm' }, hard: { tempo: 520, accel: 30, pool: 'hard' } },
  math: {
    easy: { n: 6, max: 3, rate: .7, modes: ['count', 'compare'], pattern: 'AB', twoFeatures: false },
    norm: { n: 8, max: 5, rate: .85, modes: ['count', 'compare', 'pattern', 'shape'], pattern: 'AB', twoFeatures: false },
    hard: { n: 10, max: 7, rate: 1, modes: ['count', 'compare', 'pattern', 'shape'], pattern: 'AAB', twoFeatures: true }
  }
};
Core.DIFF_NAME = { easy: 'Легко', norm: 'Норма', hard: 'Сложно' };
Core.AVATARS = ['🦜', '🦚', '🦉', '🐦', '🦆', '🦢', '🐧', '🐤', '🦅', '🦃', '🐔', '🦩', '🦤', '🕊️', '🐣', '🐦‍🔥'];
Core.COLORS = ['#FF7A1A', '#E84393', '#0E7DC2', '#4CA818', '#F5A623', '#7A2E5E', '#0C8A5A', '#E8332F'];
Core.SOUNDS = ['Р', 'Л', 'С', 'Ш', 'Ж', 'Ч', 'Щ', 'З', 'Ц', 'К', 'Г', 'Х'];

Core.INTRO = {
  ship: 'Дуй в микрофон — ветер надует парус. Проплывай через звёздные ворота и не переставай дуть.',
  odd: 'Найди картинку, которая не подходит к остальным. Нажми на неё и объясни свой выбор.',
  balloon: 'Дуй плавно и мягко. Надуй шарик до золотой метки и удерживай. Слишком сильно — лопнет.',
  rhythm: 'Слушай, как Кеша стучит: БУМ и ТИК. Потом повтори узор на кнопках.',
  hard: 'Кеша скажет слог или слово. Твёрдый звук — клади на синий камень, мягкий — на зелёную травку.',
  syll: 'Кеша прохлопает слово по слогам. Повтори голосом или нажимай на кнопку в такт.',
  math: 'Будем считать. Слушай задание и выбирай правильный ответ кнопкой.'
};
Core.HINTS = {
  ship: 'Если микрофон не работает, держи кнопку Ветер или пробел.',
  balloon: 'Без микрофона держи кнопку Ветер — шарик надуется так же.',
  odd: 'Кнопка с динамиком на картинке прочитает слово вслух.',
  rhythm: 'Играть можно клавишами 1 и 2 или стрелками.',
  hard: 'Кнопка «Повтори» повторяет слово без штрафа.',
  syll: 'Хлопать можно пробелом, кнопкой или голосом в микрофон.',
  math: 'Отвечать можно клавишами 1–7. Ошибка не штрафуется — пробуй ещё.'
};
Core.OUTRO = {
  ship: 'Кораблик доплыл до острова! Отличный выдох.',
  odd: 'Все картинки разобраны! Ты хорошо объясняешь.',
  balloon: 'Все шарики готовы и улетели к облакам!',
  rhythm: 'Ты мастер ритма! Кеша хлопает крыльями.',
  hard: 'Отличная тренировка слуха! Ты слышишь разницу.',
  syll: 'Дорожка слогов пройдена! Ритм речи становится ровнее.',
  math: 'Гусеница гордится тобой! Счёт отличный.'
};

Core.METHOD = {
  ship: { tag: 'дыхание', goal: 'Сильная целенаправленная воздушная струя, дифференциация ротового и носового выдоха.', how: 'Спокойный вдох носом и длинный выдох в микрофон. Звезда засчитывается, только если ребёнок дует у ворот.', tip: '3–5 повторов с паузами. Щёки не надуваются, губы «трубочкой». Игра напомнит отдохнуть после 6 выдохов.' },
  odd: { tag: 'речь', goal: 'Классификация, обобщающие слова, доказательная фраза «лишний …, потому что …».', how: 'Ребёнок выбирает лишнюю картинку, объясняет выбор и проговаривает фразу-образец.', tip: 'Принимайте только полный ответ с обобщающим словом. Фильтр по звуку подбирает материал под этап автоматизации.' },
  balloon: { tag: 'дыхание', goal: 'Длительный плавный выдох и дозирование силы струи.', how: 'Мягким выдохом надуваем шарик до метки и удерживаем. Перебор — хлопок, тренируется самоконтроль.', tip: 'Идеал — все шарики без хлопков. Между раундами спокойный вдох носом.' },
  rhythm: { tag: 'слух', goal: 'Слуховое внимание, память, воспроизведение ритмического рисунка.', how: 'Кеша стучит узор из БУМ и ТИК, ребёнок повторяет. Ошибка — узор играется заново.', tip: 'Параллельно отстукивайте ладонью по столу или проговаривайте «бум-бум-тик».' },
  hard: { tag: 'фонематика', goal: 'Различение твёрдых и мягких согласных, профилактика дисграфии.', how: 'Кеша произносит слог или слово, ребёнок кладёт его на камень 🪨 или травку 🌿. «Повтори» без штрафа.', tip: 'Просите объяснить: язык у зубов — твёрдый, к нёбу — мягкий. Три звезды только без ошибок.' },
  syll: { tag: 'слоги', goal: 'Слоговая структура слова и ритм речи без пропусков и перестановок.', how: 'Кеша хлопает слово по слогам, ребёнок повторяет голосом или пробелом. ±120 мс — точное попадание.', tip: 'Сначала проговорите слово вместе, затем хлопки. На сложном уровне темп ускоряется.' },
  math: { tag: 'логика', goal: 'Счёт, сравнение множеств, закономерности и соотнесение признаков для 4–5 лет.', how: 'Четыре режима без чтения: вопрос звучит голосом, ответы — крупные кнопки. Ошибка не штрафуется.', tip: 'Просите пересчитать пальцем вслух. Для сравнения используйте приём наложения: по одному предмету из каждой группы.' }
};

Core.PRAISE = {
  round: ['Молодец!', 'Отлично!', 'Так держать!', 'Супер!', 'Вот это да!', 'Здорово!', 'Умница!', 'Класс!', 'Получилось!', 'Браво!', 'Ты справился!', 'Ловко!'],
  streak: ['Три подряд — вау!', 'Кеша в восторге!', 'Ты на волне!', 'Серия из трёх!', 'Не остановить!', 'Три звезды подряд!', 'Кеша хлопает крыльями!', 'Вот это темп!', 'Ты как ракета!', 'Три из трёх!', 'Птичий восторг!', 'Так держать серию!'],
  perfect: ['Идеально! Ни одной ошибки!', 'Кеша аплодирует!', 'Безупречно!', 'Ни одного промаха!', 'Кеша танцует от радости!', 'Чистая работа!', 'Идеальный раунд!', 'Ты мастер!', 'Все ответы верные!', 'Кеша в шоке — всё верно!', 'Высший пилотаж!', 'Просто идеально!'],
  gameWin: ['Игра пройдена!', 'Кеша гордится тобой!', 'Победа!', 'Ты чемпион!', 'Ура, финиш!', 'Отличная игра!', 'Кеша поёт от радости!', 'Так играть — одно удовольствие!', 'Ты сделал это!', 'Полный успех!', 'Кеша дарит перо!', 'Игра покорена!']
};

/* ---- game content ---- */
Core.ODD_DATA = [
  { it: [['🍎', 'яблоко'], ['🍐', 'груша'], ['🍌', 'банан'], ['🥕', 'морковь']], cat: 'фрукты', snd: 'Р', why: 'Морковь — овощ, а яблоко, груша и банан — фрукты.', say: 'Лишняя морковь. Морковь — овощ, а остальные — фрукты.', hint: 'Три из них — фрукты.' },
  { it: [['🐱', 'кошка'], ['🐶', 'собака'], ['🐭', 'мышка'], ['🐦', 'птица']], cat: 'звери', snd: 'Ш', why: 'У птицы перья и крылья, а кошка, собака и мышка — звери.', say: 'Лишняя птица. У птицы перья, а кошка, собака и мышка — звери.', hint: 'У одного — перья и крылья.' },
  { it: [['🚗', 'машина'], ['🚌', 'автобус'], ['🚲', 'велосипед'], ['✈️', 'самолёт']], cat: 'наземный транспорт', snd: 'С', why: 'Самолёт летает, а остальные ездят по земле.', say: 'Лишний самолёт. Самолёт летает, а остальные ездят по земле.', hint: 'Три ездят по дороге.' },
  { it: [['🍓', 'клубника'], ['🍒', 'вишня'], ['🍇', 'виноград'], ['🍄', 'гриб']], cat: 'ягоды', snd: 'Р', why: 'Гриб — не ягода, а остальные — ягоды.', say: 'Лишний гриб. Гриб — не ягода, а остальные — ягоды.', hint: 'Из трёх варят компот.' },
  { it: [['👕', 'футболка'], ['👖', 'штаны'], ['🧢', 'кепка'], ['🥄', 'ложка']], cat: 'одежда', snd: 'Л', why: 'Ложка — посуда, а остальные — одежда.', say: 'Лишняя ложка. Ложка — посуда, а остальные — одежда.', hint: 'Три можно надеть.' },
  { it: [['🪑', 'стул'], ['🛋️', 'диван'], ['🛏️', 'кровать'], ['🌳', 'дерево']], cat: 'мебель', snd: 'Р', why: 'Дерево растёт на улице, а остальные — мебель.', say: 'Лишнее дерево. Дерево растёт на улице, а остальные — мебель.', hint: 'На трёх сидят или лежат дома.' },
  { it: [['🥁', 'барабан'], ['🎸', 'гитара'], ['🎺', 'труба'], ['🍕', 'пицца']], cat: 'инструменты', snd: 'Р', why: 'Пицца — еда, а остальные — музыкальные инструменты.', say: 'Лишняя пицца. Пицца — еда, а остальные — музыкальные инструменты.', hint: 'На трёх играют музыку.' },
  { it: [['🦋', 'бабочка'], ['🐝', 'пчела'], ['🐞', 'божья коровка'], ['🐟', 'рыба']], cat: 'насекомые', snd: 'Р', why: 'Рыба живёт в воде, а остальные — насекомые.', say: 'Лишняя рыба. Рыба живёт в воде, а остальные — насекомые.', hint: 'У трёх шесть ног.' },
  { it: [['⛄', 'снеговик'], ['🎄', 'ёлка'], ['🎿', 'лыжи'], ['🍉', 'арбуз']], cat: 'зима', snd: 'Р', why: 'Арбуз поспевает летом, а остальные — зимние.', say: 'Лишний арбуз. Арбуз летом, а остальные — зимой.', hint: 'Три бывают зимой.' },
  { it: [['🥛', 'молоко'], ['🧃', 'сок'], ['☕', 'чай'], ['🍕', 'пицца']], cat: 'напитки', snd: 'С', why: 'Пиццу едят, а молоко, сок и чай пьют.', say: 'Лишняя пицца. Пиццу едят, а остальные пьют.', hint: 'Три наливают в чашку.' },
  { it: [['🐘', 'слон'], ['🦁', 'лев'], ['🐯', 'тигр'], ['🐔', 'курица']], cat: 'дикие звери', snd: 'Р', why: 'Курица — домашняя птица, а остальные — дикие звери.', say: 'Лишняя курица. Курица домашняя, а остальные — дикие звери.', hint: 'Три живут в саванне и джунглях.' },
  { it: [['🚗', 'машина'], ['✈️', 'самолёт'], ['🚢', 'корабль'], ['🪑', 'стул']], cat: 'транспорт', snd: 'Л', why: 'Стул — мебель, а остальные — транспорт.', say: 'Лишний стул. Стул — мебель, а остальные — транспорт.', hint: 'На трёх ездят, летают и плавают.' },
  { it: [['🍅', 'помидор'], ['🥒', 'огурец'], ['🥕', 'морковь'], ['🍋', 'лимон']], cat: 'овощи', snd: 'Л', why: 'Лимон — фрукт, а остальные — овощи.', say: 'Лишний лимон. Лимон — фрукт, а остальные — овощи.', hint: 'Три растут на грядке.' },
  { it: [['🍞', 'хлеб'], ['🧀', 'сыр'], ['🍕', 'пицца'], ['🧼', 'мыло']], cat: 'еда', snd: 'Л', why: 'Мыло не едят, а остальные — еда.', say: 'Лишнее мыло. Мыло не едят, а остальные — еда.', hint: 'Три можно съесть.' },
  { it: [['🥄', 'ложка'], ['🍴', 'вилка'], ['🍽️', 'тарелка'], ['👗', 'платье']], cat: 'посуда', snd: 'Л', why: 'Платье — одежда, а остальные — посуда.', say: 'Лишнее платье. Платье — одежда, а остальные — посуда.', hint: 'Из трёх едят.' },
  { it: [['🥄', 'ложка'], ['🍴', 'вилка'], ['🔪', 'нож'], ['🧀', 'сыр']], cat: 'приборы', snd: 'С', why: 'Сыр — еда, а остальные — столовые приборы.', say: 'Лишний сыр. Сыр — еда, а остальные — приборы.', hint: 'Тремя едят.' },
  { it: [['✏️', 'карандаш'], ['🖊️', 'ручка'], ['📏', 'линейка'], ['🍎', 'яблоко']], cat: 'школьное', snd: 'Ш', why: 'Яблоко — еда, а остальные — школьные принадлежности.', say: 'Лишнее яблоко. Яблоко — еда, а карандаш, ручка и линейка — школьные принадлежности.', hint: 'Три лежат в пенале.' },
  { it: [['🎈', 'шар'], ['🧸', 'мишка'], ['🪆', 'матрёшка'], ['🥒', 'огурец']], cat: 'игрушки', snd: 'Ш', why: 'Огурец — овощ, а остальные — игрушки.', say: 'Лишний огурец. Огурец — овощ, а остальные — игрушки.', hint: 'Тремя играют.' },
  { it: [['👜', 'сумка'], ['🎒', 'рюкзак'], ['👝', 'кошелёк'], ['🧦', 'носок']], cat: 'сумки', snd: 'С', why: 'Носок — одежда, а остальные — сумки.', say: 'Лишний носок. Носок — одежда, а остальные — сумки.', hint: 'В трёх носят вещи.' },
  { it: [['🧥', 'шуба'], ['👗', 'платье'], ['👖', 'штаны'], ['🍦', 'мороженое']], cat: 'одежда', snd: 'Ш', why: 'Мороженое — еда, а остальные — одежда.', say: 'Лишнее мороженое. Мороженое — еда, а шуба, платье и штаны — одежда.', hint: 'Три надевают на себя.' }
];
Core.HARD_POOLS = {
  syl: [{ t: 'ла', soft: false, c: 'л' }, { t: 'ля', soft: true, c: 'л' }, { t: 'но', soft: false, c: 'н' }, { t: 'нё', soft: true, c: 'н' }, { t: 'ру', soft: false, c: 'р' }, { t: 'рю', soft: true, c: 'р' }, { t: 'мы', soft: false, c: 'м' }, { t: 'ми', soft: true, c: 'м' }, { t: 'та', soft: false, c: 'т' }, { t: 'тя', soft: true, c: 'т' }, { t: 'бы', soft: false, c: 'б' }, { t: 'би', soft: true, c: 'б' }, { t: 'со', soft: false, c: 'с' }, { t: 'сё', soft: true, c: 'с' }, { t: 'зу', soft: false, c: 'з' }, { t: 'зю', soft: true, c: 'з' }],
  word: [{ t: 'лук', soft: false, c: 'л' }, { t: 'люк', soft: true, c: 'л' }, { t: 'рад', soft: false, c: 'р' }, { t: 'ряд', soft: true, c: 'р' }, { t: 'выл', soft: false, c: 'л' }, { t: 'вил', soft: true, c: 'л' }, { t: 'мыл', soft: false, c: 'л' }, { t: 'мил', soft: true, c: 'л' }, { t: 'нос', soft: false, c: 'н' }, { t: 'нёс', soft: true, c: 'н' }, { t: 'вол', soft: false, c: 'л' }, { t: 'вёл', soft: true, c: 'л' }, { t: 'мал', soft: false, c: 'л' }, { t: 'мял', soft: true, c: 'л' }, { t: 'ток', soft: false, c: 'т' }, { t: 'тёк', soft: true, c: 'т' }],
  complex: [{ t: 'пыл', soft: false, c: 'л' }, { t: 'пыль', soft: true, c: 'л' }, { t: 'мол', soft: false, c: 'л' }, { t: 'моль', soft: true, c: 'л' }, { t: 'кров', soft: false, c: 'в' }, { t: 'кровь', soft: true, c: 'в' }, { t: 'угол', soft: false, c: 'л' }, { t: 'уголь', soft: true, c: 'л' }, { t: 'мел', soft: false, c: 'л' }, { t: 'мель', soft: true, c: 'л' }, { t: 'ел', soft: false, c: 'л' }, { t: 'ель', soft: true, c: 'л' }, { t: 'банка', soft: false, c: 'н' }, { t: 'банька', soft: true, c: 'н' }, { t: 'галка', soft: false, c: 'л' }, { t: 'галька', soft: true, c: 'л' }, { t: 'полка', soft: false, c: 'л' }, { t: 'полька', soft: true, c: 'л' }, { t: 'горка', soft: false, c: 'р' }, { t: 'горька', soft: true, c: 'р' }]
};
Core.SYLL_POOLS = {
  easy: [{ w: 'ма-ма', em: '👩' }, { w: 'па-па', em: '👨' }, { w: 'во-да', em: '💧' }, { w: 'ры-ба', em: '🐟' }, { w: 'ко-за', em: '🐐' }, { w: 'му-му', em: '🐄' }, { w: 'со-ба-ка', em: '🐶' }, { w: 'ко-ро-ва', em: '🐮' }, { w: 'ма-ши-на', em: '🚗' }],
  norm: [{ w: 'со-ба-ка', em: '🐶' }, { w: 'ко-ро-ва', em: '🐮' }, { w: 'ма-ши-на', em: '🚗' }, { w: 'ра-ду-га', em: '🌈' }, { w: 'ба-боч-ка', em: '🦋' }, { w: 'ка-ран-даш', em: '✏️' }, { w: 'че-ре-па-ха', em: '🐢' }, { w: 'ку-ку-ру-за', em: '🌽' }, { w: 'об-ез-ья-на', em: '🐵' }],
  hard: [{ w: 'че-ре-па-ха', em: '🐢' }, { w: 'ку-ку-ру-за', em: '🌽' }, { w: 'об-ез-ья-на', em: '🐵' }, { w: 'ве-ло-си-пед', em: '🚲' }, { w: 'би-бли-о-те-ка', em: '📚' }, { w: 'у-чи-тель-ни-ца', em: '👩‍🏫' }, { w: 'ми-ли-ци-о-нер', em: '👮' }, { w: 'а-ри-фме-ти-ка', em: '➗' }]
};
Core.RHY_PATTERNS = [[0, 0, 1], [0, 1, 0], [0, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 0, 1], [1, 0, 0, 1, 1, 0], [0, 1, 0, 1, 1, 0, 1], [1, 1, 0, 1, 0, 0, 1, 1]];
Core.MATH_OBJ = ['🍎', '🍐', '🍊', '🐛', '🌸', '⭐', '🔵', '🔺'];
Core.MATH_NAMES = { '🍎': 'яблок', '🍐': 'груш', '🍊': 'апельсинов', '🐛': 'гусениц', '🌸': 'цветов', '⭐': 'звёзд', '🔵': 'кругов', '🔺': 'треугольников' };
Core.SHAPES = [{ e: '🔵', n: 'синий круг' }, { e: '🔺', n: 'красный треугольник' }, { e: '⭐', n: 'жёлтая звезда' }, { e: '🌸', n: 'розовый цветок' }];

/* Deterministic math round: same (mode, diff, seed) -> identical round. */
Core.generateMathRound = function (mode, diff, seed) {
  var rng = mulberry32(seed), c = Core.DIFF.math[diff];
  function pick(a) { return a[Math.floor(rng() * a.length)]; }
  function int(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  var m = mode;
  if (mode === 'mix') m = c.modes[Math.floor(rng() * c.modes.length)];
  if (diff === 'easy' && (m === 'pattern' || m === 'shape')) m = rng() < .5 ? 'count' : 'compare';
  if (m === 'count') {
    var n = int(1, c.max), emoji = pick(Core.MATH_OBJ.slice(0, 6)), opts = [], i, items = [];
    for (i = 1; i <= c.max; i++) opts.push({ label: String(i), value: i });
    for (i = 0; i < n; i++) items.push(emoji);
    return { mode: 'count', icon: '🔢', prompt: 'Сколько предметов?', speak: 'Сколько ' + Core.MATH_NAMES[emoji] + '? Посчитай и нажми цифру.', items: items, options: opts, correctIndex: n - 1 };
  }
  if (m === 'compare') {
    var a = int(1, c.max), b = int(1, c.max);
    if (rng() < .28) b = a;
    var em = pick(Core.MATH_OBJ.slice(0, 6));
    return {
      mode: 'compare', icon: '⚖', prompt: 'Где больше?', speak: 'Посмотри на два облачка. Где больше: слева, справа или поровну?',
      groups: [{ emoji: em, n: a, label: 'Слева' }, { emoji: em, n: b, label: 'Справа' }],
      options: [{ label: '⬅', sub: 'Больше слева' }, { label: '➡', sub: 'Больше справа' }, { label: '🟰', sub: 'Поровну' }],
      correctIndex: a > b ? 0 : (a < b ? 1 : 2)
    };
  }
  if (m === 'pattern') {
    var pool = shuffle(Core.MATH_OBJ.slice(0, 6), rng).slice(0, 2), A = pool[0], B = pool[1];
    var unit = c.pattern === 'AAB' ? [A, A, B] : (rng() < .5 ? [A, B, B] : [A, A, B]);
    var len = diff === 'hard' ? 6 : 5, seq = [], k;
    for (k = 0; k < len; k++) seq.push(unit[k % unit.length]);
    var answer = unit[len % unit.length];
    var distr = shuffle(Core.MATH_OBJ.filter(function (e) { return e !== answer; }), rng).slice(0, 2);
    var options = shuffle([answer].concat(distr), rng).map(function (e) { return { emoji: e, label: '' }; });
    var ci = 0;
    options.forEach(function (o, i) { if (o.emoji === answer) ci = i; });
    return { mode: 'pattern', icon: '🔁', prompt: 'Что дальше?', speak: 'Посмотри на ряд. Что будет дальше? Выбери картинку.', sequence: seq, options: options, correctIndex: ci };
  }
  var sample = pick(Core.SHAPES), big = rng() < .5, variants = [];
  Core.SHAPES.forEach(function (s) { [true, false].forEach(function (bz) { variants.push({ e: s.e, big: bz, n: s.n }); }); });
  var wrong = shuffle(variants.filter(function (v) {
    if (v.e === sample.e && v.big === big) return false;
    return c.twoFeatures ? true : v.e !== sample.e;
  }), rng).slice(0, 3);
  var all = shuffle([{ e: sample.e, big: big, n: sample.n }].concat(wrong), rng), idx = 0;
  all.forEach(function (o, i) { if (o.e === sample.e && o.big === big) idx = i; });
  return {
    mode: 'shape', icon: '🔷', prompt: 'Найди такой же', speak: 'Найди такой же: ' + (big ? 'большой ' : 'маленький ') + sample.n + '.',
    sample: { emoji: sample.e, big: big }, options: all.map(function (o) { return { emoji: o.e, big: o.big, label: '' }; }), correctIndex: idx
  };
};

Core.starsFor = function (game, m) {
  if (game === 'ship') return m.collected === m.total ? 3 : (m.collected >= Math.ceil(m.total * .65) ? 2 : 1);
  if (game === 'balloon') return m.pops === 0 ? 3 : (m.pops <= 2 ? 2 : 1);
  if (game === 'odd') return m.total >= m.max * .83 ? 3 : (m.total >= m.max * .55 ? 2 : 1);
  if (game === 'rhythm') return m.first >= m.count - 1 ? 3 : (m.first >= Math.ceil(m.count / 2) ? 2 : 1);
  if (game === 'hard' || game === 'math') return m.errors === 0 ? 3 : (m.errors <= 2 ? 2 : 1);
  if (game === 'syll') return m.perfect >= 5 ? 3 : (m.perfect >= 3 ? 2 : 1);
  return 1;
};
Core.ageFromBirth = function (birthDate, fallbackAge, nowMs) {
  if (!birthDate) return fallbackAge || 5;
  var t = new Date(birthDate).getTime();
  if (isNaN(t)) return fallbackAge || 5;
  return Math.max(0, Math.floor(((nowMs || 0) - t) / YEAR_MS));
};
Core.bankTotal = function (p) { return Core.GAME_KEYS.reduce(function (a, k) { return a + ((p.best && p.best[k]) || 0); }, 0); };
Core.sessionStars = function (s) { return s.entries.reduce(function (a, e) { return a + e.stars; }, 0); };
Core.lastVisitDays = function (state, pid, nowMs) {
  var ss = state.sessions.filter(function (s) { return s.pid === pid; });
  if (!ss.length) return null;
  var last = Math.max.apply(null, ss.map(function (s) { return new Date(s.date).getTime(); }));
  return Math.floor((nowMs - last) / DAY_MS);
};
Core.sparkPoints = function (state, pid, count) {
  var ss = state.sessions.filter(function (s) { return s.pid === pid; })
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).slice(-(count || 5));
  return ss.map(function (s, i) {
    return { x: ss.length > 1 ? 4 + i * (72 / (ss.length - 1)) : 40, y: 20 - (Core.sessionStars(s) / 21) * 16, v: Core.sessionStars(s) };
  });
};
Core.metricValue = function (s, metric) {
  if (metric === 'minutes') return s.minutes;
  if (metric === 'games') return s.entries.length;
  return Core.sessionStars(s);
};
Core.filterSessions = function (state, f, nowMs) {
  var list = state.sessions.slice(), q = (f.q || '').trim().toLowerCase();
  if (f.pid && f.pid !== 'all') list = list.filter(function (s) { return s.pid === f.pid; });
  if (f.games && f.games.length) list = list.filter(function (s) { return s.entries.some(function (e) { return f.games.indexOf(e.game) >= 0; }); });
  if (f.from) list = list.filter(function (s) { return new Date(s.date) >= new Date(f.from + 'T00:00:00'); });
  if (f.to) list = list.filter(function (s) { return new Date(s.date) <= new Date(f.to + 'T23:59:59'); });
  if (f.stars) list = list.filter(function (s) { return s.entries.some(function (e) { return e.stars >= f.stars; }); });
  if (f.period && f.period !== 'all') list = list.filter(function (s) { return nowMs - new Date(s.date).getTime() <= Number(f.period) * DAY_MS; });
  if (q) list = list.filter(function (s) {
    var p = state.profiles.filter(function (x) { return x.id === s.pid; })[0];
    return (p && p.name.toLowerCase().indexOf(q) >= 0) || (s.note || '').toLowerCase().indexOf(q) >= 0 ||
      s.entries.some(function (e) { return Core.GAMES[e.game].name.toLowerCase().indexOf(q) >= 0; });
  });
  var cmp = {
    'date-desc': function (a, b) { return new Date(b.date) - new Date(a.date); },
    'date-asc': function (a, b) { return new Date(a.date) - new Date(b.date); },
    'stars-desc': function (a, b) { return Core.sessionStars(b) - Core.sessionStars(a); },
    'min-desc': function (a, b) { return b.minutes - a.minutes; }
  };
  return list.sort(cmp[f.sort] || cmp['date-desc']);
};
Core.gameAverages = function (sessions) {
  return Core.GAME_KEYS.map(function (k) {
    var vals = [];
    sessions.forEach(function (s) { s.entries.forEach(function (e) { if (e.game === k) vals.push(e.stars); }); });
    return { key: k, n: vals.length, avg: vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0 };
  }).filter(function (x) { return x.n; }).sort(function (a, b) { return b.avg - a.avg; });
};
Core.buildReport = function (state, opt, nowMs) {
  var list = Core.filterSessions(state, { pid: opt.pid, period: opt.period }, nowMs);
  var who = opt.pid === 'all' ? 'все дети' : (state.profiles.filter(function (p) { return p.id === opt.pid; })[0] || {}).name;
  var mins = list.reduce(function (a, s) { return a + s.minutes; }, 0);
  var stars = list.reduce(function (a, s) { return a + Core.sessionStars(s); }, 0);
  var byGame = Core.gameAverages(list);
  var period = opt.period === 'all' ? 'всё время' : 'последние ' + opt.period + ' дней';
  var goals = state.goals.filter(function (g) { return opt.pid === 'all' || g.pid === opt.pid; });
  var done = goals.filter(function (g) { return g.progress >= g.target; }).length;
  var praises = opt.pid === 'all' ? state.profiles.reduce(function (a, p) { return a + (p.praises || 0); }, 0)
    : ((state.profiles.filter(function (p) { return p.id === opt.pid; })[0] || {}).praises || 0);
  var lines = ['ОТЧЁТ • ' + state.settings.specialist.cabinetName, 'Специалист: ' + state.settings.specialist.name,
    'Дата: ' + new Date(nowMs).toLocaleString('ru-RU'), 'Ребёнок: ' + who, 'Период: ' + period, '',
    'За ' + period + ': ' + list.length + ' ' + plural(list.length, ['занятие', 'занятия', 'занятий']) + ', ' + mins + ' минут, ' + stars + ' звёзд.',
    byGame[0] ? 'Лучший прогресс в игре «' + Core.GAMES[byGame[0].key].name + '» — средний балл ' + byGame[0].avg.toFixed(1) + '★.' : 'Игр пока не было.',
    byGame.length > 1 ? 'Требует внимания: «' + Core.GAMES[byGame[byGame.length - 1].key].name + '» — ' + byGame[byGame.length - 1].avg.toFixed(1) + '★.' : '',
    'Похвал от Кеши: ' + praises + '.', 'Цели: ' + done + ' из ' + goals.length + ' выполнено.', '', 'По играм:'];
  byGame.forEach(function (x) { lines.push('• ' + Core.GAMES[x.key].name + ': ' + x.n + ' ' + plural(x.n, ['раунд', 'раунда', 'раундов']) + ', средний ' + x.avg.toFixed(1) + '★'); });
  lines.push('', 'Рекомендация: продолжать дыхательные упражнения с паузами, закреплять успешные игры и усложнять режим там, где 3★ стабильно.');
  return lines.filter(function (x) { return x !== ''; }).join('\n');
};

/* ---- state shape, defaults, normalization ---- */
Core.emptyBest = function () { return { ship: 0, odd: 0, balloon: 0, rhythm: 0, hard: 0, syll: 0, math: 0 }; };
Core.defaultSettings = function () {
  return {
    theme: 'jungle', cursorSize: 'normal', motion: 'full', sound: true, volume: .9,
    voice: { enabled: true, engine: 'neural', voiceId: '', rate: .85 },
    mic: { defaultSens: 1.6, airOnly: true, autoCalibrate: true },
    difficulty: { ship: 'norm', odd: 'norm', balloon: 'norm', rhythm: 'norm', hard: 'norm', syll: 'norm', math: 'norm' },
    specialist: { name: 'Мама-логопед', cabinetName: 'Кабинет Кеши', avatar: '👩‍⚕️' },
    access: { pinHash: null, autoLockMin: 5 },
    tutorial: 'once', oddSound: 'all', mathMode: 'mix', pacer: false,
    journalCols: { date: true, kid: true, games: true, stars: true, note: true }
  };
};
Core.normalizeProfile = function (p, nowMs) {
  var achievements = [];
  if (Array.isArray(p.achievements)) achievements = p.achievements.slice();
  else if (p.stickers && typeof p.stickers === 'object') achievements = Object.keys(p.stickers).filter(function (k) { return p.stickers[k]; });
  var legacyMap = { logic: 'perfect-odd', rhythm: 'rhythm-master', smooth: 'ship-smooth', quiet: 'balloon-gold', caterpillar: 'math-caterpillar', crown: 'explorer', regular: 'first', marathon: 'explorer', first: 'first' };
  achievements = achievements.map(function (a) { return legacyMap[a] || a; }).filter(function (a, i, arr) { return arr.indexOf(a) === i; });
  var streak = (p.streak && typeof p.streak === 'object') ? p.streak : { current: p.perfectStreak || 0, best: p.perfectStreak || 0 };
  return {
    id: p.id || uid(),
    name: p.name || 'Ребёнок',
    avatar: p.avatar || p.ava || '🦜',
    color: p.color || '#FF7A1A',
    birthDate: p.birthDate || p.birth || null,
    targetSounds: (p.targetSounds || p.sounds || []).slice(),
    homework: p.homework || '',
    specialistNote: p.specialistNote || p.note || '',
    favoriteReward: p.favoriteReward || p.favSticker || null,
    createdAt: p.createdAt || new Date(nowMs).toISOString(),
    lastSessionAt: p.lastSessionAt || null,
    totalMinutes: p.totalMinutes || 0,
    totalStars: p.totalStars || 0,
    achievements: achievements,
    achievementLog: p.achievementLog || [],
    streak: { current: streak.current || 0, best: streak.best || 0 },
    praises: p.praises || 0,
    best: Object.assign(Core.emptyBest(), p.best || {}),
    gamesOpened: p.gamesOpened || [],
    listened: p.listened || [],
    tutorialCounts: p.tutorialCounts || {},
    gifts: p.gifts || []
  };
};
Core.normalize = function (raw, nowMs) {
  var base = Core.seed(nowMs), d = Object.assign({}, base, raw || {});
  var s = Core.defaultSettings(), rs = (raw && raw.settings) || {};
  d.settings = Object.assign({}, s, rs);
  d.settings.voice = Object.assign({}, s.voice, rs.voice || {});
  if (rs.tts !== undefined && rs.voice === undefined) d.settings.voice.enabled = !!rs.tts;
  if (rs.ttsRate !== undefined && rs.voice === undefined) d.settings.voice.rate = rs.ttsRate;
  if (rs.ttsVoice !== undefined && rs.voice === undefined) d.settings.voice.voiceId = rs.ttsVoice || '';
  d.settings.mic = Object.assign({}, s.mic, rs.mic || {});
  if (rs.sens !== undefined && rs.mic === undefined) d.settings.mic.defaultSens = rs.sens;
  if (rs.strict !== undefined && rs.mic === undefined) d.settings.mic.airOnly = !!rs.strict;
  if (rs.autoCal !== undefined && rs.mic === undefined) d.settings.mic.autoCalibrate = !!rs.autoCal;
  d.settings.difficulty = Object.assign({}, s.difficulty, rs.difficulty || rs.diff || {});
  d.settings.specialist = Object.assign({}, s.specialist, rs.specialist || {});
  if (rs.specialist === undefined || typeof rs.specialist === 'string') {
    if (typeof rs.specialist === 'string') d.settings.specialist.name = rs.specialist;
    if (typeof rs.cabinetName === 'string') d.settings.specialist.cabinetName = rs.cabinetName;
    if (typeof rs.specialistAva === 'string') d.settings.specialist.avatar = rs.specialistAva;
  }
  d.settings.access = Object.assign({}, s.access, rs.access || {});
  if (rs.pinHash !== undefined && rs.access === undefined) d.settings.access.pinHash = rs.pinHash || null;
  d.settings.journalCols = Object.assign({}, s.journalCols, rs.journalCols || rs.jCols || {});
  d.settings.tutorial = rs.tutorial || 'once';
  d.settings.oddSound = rs.oddSound || 'all';
  d.settings.mathMode = rs.mathMode || 'mix';
  d.settings.pacer = !!rs.pacer;
  d.profiles = ((raw && raw.profiles && raw.profiles.length) ? raw.profiles : base.profiles).map(function (p) { return Core.normalizeProfile(p, nowMs); });
  d.sessions = (raw && raw.sessions) || base.sessions;
  d.schedule = (raw && raw.schedule) || [];
  d.goals = ((raw && raw.goals) || []).map(function (g) { return Object.assign({}, g, { done: g.progress >= g.target }); });
  d.session = (raw && raw.session) || null;
  if (d.session && d.session.pausedMs === undefined) d.session.pausedMs = 0;
  d.currentPid = d.profiles.some(function (p) { return p.id === d.currentPid; }) ? d.currentPid : (d.profiles[0] ? d.profiles[0].id : null);
  d.v = 4;
  return d;
};
Core.seed = function (nowMs) {
  var now = nowMs || 0;
  function birth(age) { return isoDay(now - age * YEAR_MS - 40 * DAY_MS); }
  function mk(name, age, avatar, sounds, note, color, best, ach, hw, fav, praises) {
    return Core.normalizeProfile({
      id: uid(), name: name, birthDate: birth(age), avatar: avatar, targetSounds: sounds, specialistNote: note,
      color: color, best: best, achievements: ach, homework: hw, favoriteReward: fav, praises: praises,
      createdAt: new Date(now - 30 * DAY_MS).toISOString()
    }, now);
  }
  var p = [
    mk('Мила', 5, '🦜', ['Р', 'Ш'], 'Ставим [Р], пока получается в слогах. Хвалим за плавный выдох.', '#E84393',
      { ship: 2, odd: 3, balloon: 1, rhythm: 2, hard: 2, syll: 1, math: 2 }, ['first', 'perfect-odd'], 'Дуть на вертушку 3 раза в день, слоги ра-ро-ру.', 'math-caterpillar', 34),
    mk('Артём', 6, '🦚', ['Л', 'С'], 'Автоматизация [Л] в фразах, следим за темпом речи.', '#0E7DC2',
      { ship: 3, odd: 2, balloon: 2, rhythm: 3, hard: 2, syll: 2, math: 1 }, ['first', 'ship-smooth', 'rhythm-master'], 'Лого-массаж и [л]-слоги перед сном.', 'rhythm-master', 41),
    mk('Соня', 4, '🦉', ['С'], 'Выдох короткий — работаем над длительностью струи.', '#4CA818',
      { ship: 1, odd: 2, balloon: 1, rhythm: 1, hard: 1, syll: 1, math: 1 }, ['first'], '', 'balloon-gold', 12)
  ];
  function S(days, pid, minutes, entries, note) { return { id: uid(), pid: pid, date: new Date(now - days * DAY_MS).toISOString(), minutes: minutes, entries: entries, note: note }; }
  function E(game, stars, info) { return { game: game, stars: stars, info: info }; }
  var sessions = [
    S(21, p[0].id, 11, [E('ship', 1, ['Время: 62 с', 'Ворота: 3/6']), E('balloon', 1, ['Шарики: 3/3', 'Лопнуло: 4'])], 'Первое знакомство с микрофоном, дула рывками.'),
    S(17, p[1].id, 14, [E('ship', 3, ['Время: 21 с', 'Ворота: 8/8']), E('rhythm', 2, ['Узоры: 6/6', 'С первого раза: 4/6']), E('hard', 2, ['Ошибки: 2/8'])], 'Отличная струя. Мягкие согласные путает в словах.'),
    S(14, p[0].id, 12, [E('odd', 3, ['Звёзды: 22/24']), E('ship', 2, ['Время: 38 с']), E('syll', 2, ['Точных хлопков: 80%'])], 'Обобщающие слова даёт сама. Слоги хлопает уверенно.'),
    S(10, p[2].id, 9, [E('balloon', 1, ['Лопнуло: 3']), E('odd', 2, ['Звёзды: 15/24']), E('math', 2, ['Ошибки: 2/6'])], 'Быстро устаёт, сделали 2 паузы по 10 секунд.'),
    S(6, p[1].id, 15, [E('rhythm', 3, ['С первого раза: 6/6']), E('odd', 2, ['Звёзды: 17/24']), E('balloon', 2, ['Лопнуло: 1']), E('hard', 3, ['Ошибки: 0/8'])], 'Ритм — сильный навык. [Л] в фразе чисто в 7 из 10.'),
    S(2, p[0].id, 13, [E('ship', 2, ['Ровный выдох: 2.4 с']), E('balloon', 1, ['Лопнуло: 3']), E('odd', 3, ['Звёзды: 21/24']), E('math', 3, ['Ошибки: 0/8'])], 'Появился ровный выдох! Считает до 5 без ошибок.')
  ];
  var goals = [
    { id: uid(), pid: p[0].id, text: 'Автоматизировать [Р] в слогах', sound: 'Р', target: 10, progress: 7, deadline: isoDay(now + 9 * DAY_MS), done: false },
    { id: uid(), pid: p[0].id, text: 'Плавный выдох 3 секунды', sound: '', target: 10, progress: 4, deadline: isoDay(now + 12 * DAY_MS), done: false },
    { id: uid(), pid: p[1].id, text: '[Л] в фразе без напоминания', sound: 'Л', target: 10, progress: 10, deadline: isoDay(now + 4 * DAY_MS), done: true }
  ];
  var schedule = [
    { id: uid(), pid: p[0].id, date: isoDay(now), start: '15:00', duration: 30, note: 'Дыхание + [Р]', done: false },
    { id: uid(), pid: p[1].id, date: isoDay(now + DAY_MS), start: '11:00', duration: 45, note: 'Автоматизация [Л]', done: false },
    { id: uid(), pid: p[2].id, date: isoDay(now + 2 * DAY_MS), start: '09:30', duration: 30, note: 'Первичный выдох', done: false }
  ];
  return { v: 4, profiles: p, currentPid: p[0].id, sessions: sessions, schedule: schedule, goals: goals, session: null, settings: Core.defaultSettings() };
};

/* ---- pure QR encoder (byte mode, ECC L, versions 1-5, mask 0) ---- */
Core.QR = (function () {
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256), x = 1, i;
  for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  function mul(a, b) { return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }
  function rs(data, ecc) {
    var gen = [1], i, j;
    for (i = 0; i < ecc; i++) {
      var ng = new Array(gen.length + 1);
      for (j = 0; j < ng.length; j++) ng[j] = 0;
      for (j = 0; j < gen.length; j++) { ng[j] ^= mul(gen[j], EXP[i]); ng[j + 1] ^= gen[j]; }
      gen = ng;
    }
    var msg = data.concat(new Array(ecc).fill(0));
    for (i = 0; i < data.length; i++) { var f = msg[i]; if (!f) continue; for (j = 0; j < gen.length; j++) msg[i + j] ^= mul(gen[j], f); }
    return msg.slice(data.length);
  }
  var DCW = [19, 34, 55, 80, 108], ECW = [7, 10, 15, 20, 26];
  function encode(text) {
    var bytes;
    try { bytes = Array.prototype.slice.call(new TextEncoder().encode(text)); }
    catch (e) { bytes = unescape(encodeURIComponent(text)).split('').map(function (c) { return c.charCodeAt(0); }); }
    var n = bytes.length, v = -1, i;
    for (i = 0; i < 5; i++) if (n <= DCW[i] - 2) { v = i; break; }
    if (v < 0) return null;
    var ver = v + 1, size = 17 + 4 * ver, dc = DCW[v], ec = ECW[v];
    var bits = [];
    function push(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >> k) & 1); }
    push(4, 4); push(n, 8); bytes.forEach(function (b) { push(b, 8); });
    push(0, Math.min(4, dc * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    var pads = [0xEC, 0x11], pi = 0;
    while (data.length < dc) data.push(pads[pi++ % 2]);
    var all = data.concat(rs(data, ec));
    var M = [], F = [];
    for (i = 0; i < size; i++) { M.push(new Int8Array(size)); F.push(new Uint8Array(size)); }
    function set(r, c, val) { M[r][c] = val; F[r][c] = 1; }
    function finder(r, c) {
      for (var a = -1; a < 8; a++) for (var b2 = -1; b2 < 8; b2++) {
        var rr = r + a, cc = c + b2;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        var on = (a >= 0 && a < 7 && b2 >= 0 && b2 < 7) && (a === 0 || a === 6 || b2 === 0 || b2 === 6 || (a >= 2 && a <= 4 && b2 >= 2 && b2 <= 4));
        set(rr, cc, on ? 1 : 0);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (i = 8; i < size - 8; i++) { var t = i % 2 === 0 ? 1 : 0; if (!F[6][i]) set(6, i, t); if (!F[i][6]) set(i, 6, t); }
    if (ver >= 2) { var ac = size - 7; for (var a2 = -2; a2 <= 2; a2++) for (var b3 = -2; b3 <= 2; b3++) set(ac + a2, ac + b3, Math.max(Math.abs(a2), Math.abs(b3)) !== 1 ? 1 : 0); }
    set(size - 8, 8, 1);
    var fmt = 0x77C4;
    function fb(k) { return (fmt >> (14 - k)) & 1; }
    [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]
      .forEach(function (p, k) { set(p[0], p[1], fb(k)); });
    for (i = 0; i < 7; i++) set(size - 1 - i, 8, fb(i));
    for (i = 7; i < 15; i++) set(8, size - 15 + i, fb(i));
    var bi = 0, total = all.length * 8, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var k2 = 0; k2 < size; k2++) {
        var r = up ? size - 1 - k2 : k2;
        for (var cc2 = 0; cc2 < 2; cc2++) {
          var c = col - cc2;
          if (F[r][c]) continue;
          var bit = bi < total ? (all[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
          bi++;
          if (((r + c) & 1) === 0) bit ^= 1;
          M[r][c] = bit;
        }
      }
      up = !up;
    }
    return { size: size, M: M };
  }
  return { encode: encode };
})();

/* ==================== Store ==================== */
function createStore(reducer, initial) {
  var state = initial, subs = [];
  function notify(st, action) {
    subs.forEach(function (f) { try { f(st, action); } catch (e) { Adapters.error('store subscriber', e); } });
  }
  return {
    getState: function () { return state; },
    setState: function (next) { state = next; notify(state, { type: 'state/set' }); },
    subscribe: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; },
    dispatch: function (action) {
      var next = reducer(state, action);
      if (next !== state) { state = next; notify(state, action); }
      return state;
    }
  };
}
function cloneState(s) {
  return {
    v: 4,
    profiles: s.profiles.map(function (p) {
      return Object.assign({}, p, {
        best: Object.assign({}, p.best), achievements: p.achievements.slice(), achievementLog: p.achievementLog.slice(),
        targetSounds: p.targetSounds.slice(), gamesOpened: p.gamesOpened.slice(), listened: p.listened.slice(),
        tutorialCounts: Object.assign({}, p.tutorialCounts), streak: Object.assign({}, p.streak), gifts: p.gifts.slice()
      });
    }),
    currentPid: s.currentPid,
    sessions: s.sessions.slice(),
    schedule: s.schedule.slice(),
    goals: s.goals.slice(),
    session: s.session ? Object.assign({}, s.session, { entries: s.session.entries.slice() }) : null,
    settings: Object.assign({}, s.settings, {
      voice: Object.assign({}, s.settings.voice), mic: Object.assign({}, s.settings.mic),
      difficulty: Object.assign({}, s.settings.difficulty), specialist: Object.assign({}, s.settings.specialist),
      access: Object.assign({}, s.settings.access), journalCols: Object.assign({}, s.settings.journalCols)
    })
  };
}
function findChild(s, id) { return s.profiles.filter(function (p) { return p.id === id; })[0]; }
function reducer(state, a) {
  var s = cloneState(state), p, i;
  switch (a.type) {
    case 'settings/patch':
      Object.keys(a.payload).forEach(function (k) {
        var v = a.payload[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && s.settings[k] && typeof s.settings[k] === 'object') Object.assign(s.settings[k], v);
        else s.settings[k] = v;
      });
      return s;
    case 'child/add': s.profiles.push(a.payload); s.currentPid = a.payload.id; return s;
    case 'child/update': p = findChild(s, a.payload.id); if (p) Object.assign(p, a.payload.patch); return s;
    case 'child/select': s.currentPid = a.payload; return s;
    case 'child/remove':
      s.profiles = s.profiles.filter(function (x) { return x.id !== a.payload; });
      s.sessions = s.sessions.filter(function (x) { return x.pid !== a.payload; });
      s.goals = s.goals.filter(function (x) { return x.pid !== a.payload; });
      s.schedule = s.schedule.filter(function (x) { return x.pid !== a.payload; });
      if (s.session && s.session.pid === a.payload) s.session = null;
      if (s.currentPid === a.payload) s.currentPid = s.profiles[0] ? s.profiles[0].id : null;
      return s;
    case 'child/restore':
      s.profiles.splice(Math.min(a.payload.index, s.profiles.length), 0, a.payload.profile);
      s.sessions = s.sessions.concat(a.payload.sessions);
      s.goals = s.goals.concat(a.payload.goals);
      s.schedule = s.schedule.concat(a.payload.schedule);
      if (!s.currentPid) s.currentPid = a.payload.profile.id;
      return s;
    case 'child/praise': p = findChild(s, s.currentPid); if (p) p.praises = (p.praises || 0) + 1; return s;
    case 'child/achievement':
      p = findChild(s, a.payload.pid);
      if (p && p.achievements.indexOf(a.payload.achId) < 0) {
        p.achievements.push(a.payload.achId);
        p.achievementLog.push({ id: a.payload.achId, date: new Date(Adapters.now()).toISOString(), game: a.payload.game || null, manual: !!a.payload.manual, comment: a.payload.comment || '' });
      }
      return s;
    case 'child/opened':
      p = findChild(s, a.payload.pid);
      if (p) {
        if (p.gamesOpened.indexOf(a.payload.game) < 0) p.gamesOpened.push(a.payload.game);
        p.tutorialCounts[a.payload.game] = (p.tutorialCounts[a.payload.game] || 0) + 1;
      }
      return s;
    case 'child/listened':
      p = findChild(s, a.payload.pid);
      if (p && p.listened.indexOf(a.payload.game) < 0) p.listened.push(a.payload.game);
      return s;
    case 'session/start':
      s.session = { id: uid(), pid: a.payload, start: Adapters.now(), pausedMs: 0, pausedAt: null, note: '', entries: [] };
      s.currentPid = a.payload;
      return s;
    case 'session/pause':
      if (!s.session) return state;
      if (s.session.pausedAt) { s.session.pausedMs += Adapters.now() - s.session.pausedAt; s.session.pausedAt = null; }
      else s.session.pausedAt = Adapters.now();
      return s;
    case 'session/note': if (s.session) s.session.note = a.payload; return s;
    case 'session/entry': if (s.session) s.session.entries.push(a.payload); return s;
    case 'session/finish':
      if (!s.session) return state;
      var sess = s.session;
      if (sess.pausedAt) { sess.pausedMs += Adapters.now() - sess.pausedAt; sess.pausedAt = null; }
      var mins = Math.max(1, Math.round((Adapters.now() - sess.start - sess.pausedMs) / 60000));
      s.sessions.push({ id: sess.id, pid: sess.pid, date: new Date().toISOString(), minutes: mins, entries: sess.entries, note: a.payload || sess.note || 'Без заметки' });
      p = findChild(s, sess.pid);
      if (p) {
        p.lastSessionAt = new Date().toISOString();
        p.totalMinutes = (p.totalMinutes || 0) + mins;
        p.totalStars = (p.totalStars || 0) + Core.sessionStars(sess);
      }
      s.session = null;
      return s;
    case 'session/cancel': s.session = null; return s;
    case 'sessions/add': s.sessions.push(a.payload); return s;
    case 'sessions/update':
      i = s.sessions.map(function (x) { return x.id; }).indexOf(a.payload.id);
      if (i >= 0) s.sessions[i] = Object.assign({}, s.sessions[i], a.payload.patch);
      return s;
    case 'sessions/remove': s.sessions = s.sessions.filter(function (x) { return x.id !== a.payload; }); return s;
    case 'sessions/restore': s.sessions.splice(a.payload.index, 0, a.payload.session); return s;
    case 'schedule/add': s.schedule.push(a.payload); return s;
    case 'schedule/update':
      i = s.schedule.map(function (x) { return x.id; }).indexOf(a.payload.id);
      if (i >= 0) s.schedule[i] = Object.assign({}, s.schedule[i], a.payload.patch);
      return s;
    case 'schedule/remove': s.schedule = s.schedule.filter(function (x) { return x.id !== a.payload; }); return s;
    case 'schedule/restore': s.schedule.splice(a.payload.index, 0, a.payload.item); return s;
    case 'goals/add': s.goals.push(a.payload); return s;
    case 'goals/update':
      i = s.goals.map(function (x) { return x.id; }).indexOf(a.payload.id);
      if (i >= 0) { s.goals[i] = Object.assign({}, s.goals[i], a.payload.patch); s.goals[i].done = s.goals[i].progress >= s.goals[i].target; }
      return s;
    case 'goals/remove': s.goals = s.goals.filter(function (x) { return x.id !== a.payload; }); return s;
    case 'goals/restore': s.goals.splice(a.payload.index, 0, a.payload.item); return s;
    case 'db/replace': return Core.normalize(a.payload, Adapters.now());
    default: return state;
  }
}

/* ==================== DB: versioned persistence + migration ==================== */
var DB = {
  issue: null, migratedFrom: null, pending: null,
  parse: function (raw) { try { return JSON.parse(raw); } catch (e) { return null; } },
  /* migrate(from, to) -> boolean; result lands in DB.pending, errors are logged */
  migrate: function (from, to) {
    this.pending = null;
    if (to !== 4) { Adapters.error('DB.migrate: unsupported target version', to); return false; }
    try {
      var data = (from && from.data) ? from.data : from;
      if (!data || typeof data !== 'object' || !Array.isArray(data.profiles)) { Adapters.error('DB.migrate: incompatible payload'); return false; }
      this.pending = Core.normalize(data, Adapters.now());
      return true;
    } catch (e) { Adapters.error('DB.migrate failed', e); return false; }
  },
  backup: function (key, raw) {
    var bk = key + '-backup-' + Adapters.now();
    Adapters.storage.set(bk, raw);
    return bk;
  },
  load: function () {
    var rawV4 = Adapters.storage.get(APP.key), parsed = rawV4 ? this.parse(rawV4) : null;
    if (parsed && parsed.v === 4 && parsed.data) return Core.normalize(parsed.data, Adapters.now());
    for (var i = 0; i < APP.legacy.length; i++) {
      var k = APP.legacy[i], raw = Adapters.storage.get(k);
      if (!raw) continue;
      var old = this.parse(raw);
      if (!old) continue;
      var bk = this.backup(k, raw);
      if (this.migrate(old, 4)) { this.migratedFrom = k; Adapters.log('DB migrated from', k, 'backup:', bk); return this.pending; }
    }
    if (parsed && (!parsed.v || !parsed.data)) { this.issue = parsed; return Core.seed(Adapters.now()); }
    return Core.seed(Adapters.now());
  },
  save: function (state) { Adapters.storage.set(APP.key, JSON.stringify({ v: 4, data: state })); },
  sizeKB: function (state) { try { return (JSON.stringify(state).length / 1024).toFixed(1); } catch (e) { return '0'; } },
  migrateLegacyNow: function (state) {
    var added = { profiles: 0, sessions: 0 }, next = cloneState(state), self = this;
    APP.legacy.forEach(function (k) {
      var raw = Adapters.storage.get(k);
      if (!raw) return;
      var old = self.parse(raw);
      if (!old) return;
      var data = old.data || old;
      if (!Array.isArray(data.profiles)) return;
      data.profiles.forEach(function (p) {
        if (!next.profiles.some(function (x) { return x.id === p.id; })) { next.profiles.push(Core.normalizeProfile(p, Adapters.now())); added.profiles++; }
      });
      (data.sessions || []).forEach(function (s) {
        if (!next.sessions.some(function (x) { return x.id === s.id; })) { next.sessions.push(s); added.sessions++; }
      });
    });
    return { state: Core.normalize(next, Adapters.now()), added: added };
  }
};

var Store = createStore(reducer, DB.load());
Store.subscribe(function (s) { DB.save(s); });
function S() { return Store.getState(); }
function currentChild() { var s = S(); return s.profiles.filter(function (p) { return p.id === s.currentPid; })[0] || s.profiles[0] || null; }
function childById(id) { return S().profiles.filter(function (p) { return p.id === id; })[0]; }
function cfg(game) { return Core.DIFF[game][S().settings.difficulty[game]]; }
var mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
var coarse = matchMedia('(pointer:coarse)').matches;
var finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
function reducedMotion() { return mqReduce.matches || S().settings.motion === 'reduced'; }
function buzz(p) { if (AudioFX.muted || !coarse || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (e) {} }

/* ==================== AudioFX: synthesized effects ==================== */
var AudioFX = {
  ctx: null, master: null, windGain: null, muted: !S().settings.sound, volume: S().settings.volume,
  _wind: 0, _buf: null, onchange: null,
  init: function () {
    if (this.ctx) return;
    var AC = Adapters.audioCtor();
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    var len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Adapters.random() * 2 - 1;
    this._buf = buf;
    var src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = .55;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
    src.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master); src.start();
  },
  apply: function () { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .02); },
  note: function (f, o) {
    o = o || {};
    if (!this.ctx) return;
    var now = this.ctx.currentTime + (o.t || 0), d = o.d || .22;
    var osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, now);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.slide), now + d);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(o.v || .4, now + .012);
    g.gain.exponentialRampToValueAtTime(.0001, now + d);
    osc.connect(g); g.connect(this.master); osc.start(now); osc.stop(now + d + .06);
  },
  noise: function (o) {
    o = o || {};
    if (!this.ctx || !this._buf) return;
    var now = this.ctx.currentTime + (o.t || 0), d = o.d || .1;
    var s = this.ctx.createBufferSource(); s.buffer = this._buf;
    var fl = this.ctx.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.frequency.value = o.f || 800;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(o.v || .3, now);
    g.gain.exponentialRampToValueAtTime(.0001, now + d);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(now); s.stop(now + d + .05);
  },
  click: function () { this.note(700, { type: 'triangle', d: .06, v: .16 }); },
  chime: function () { this.note(1318, { d: .3, v: .22 }); this.note(1760, { t: .07, d: .34, v: .18 }); },
  chirp: function () { this.note(2400, { d: .08, v: .22, slide: 3200 }); this.note(3200, { t: .14, d: .08, v: .2, slide: 2400 }); },
  clap: function () { this.noise({ d: .07, v: .45, f: 1600 }); this.note(340, { d: .06, v: .2, type: 'triangle' }); },
  tick: function () { this.note(660, { d: .05, v: .1, type: 'triangle' }); },
  collect: function () { this.note(988, { d: .1, v: .28, type: 'triangle' }); this.note(1319, { t: .08, d: .2, v: .26, type: 'triangle' }); buzz(12); },
  miss: function () { this.noise({ d: .22, v: .12, type: 'highpass', f: 1800 }); },
  success: function () { var self = this;[523, 659, 784, 1047].forEach(function (f, i) { self.note(f, { t: i * .09, d: .3, v: .3, type: 'triangle' }); }); buzz(18); },
  fanfare: function () {
    var self = this;
    [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { self.note(f, { t: i * .12, d: .34, v: .3, type: 'triangle' }); });
    [523, 659, 784].forEach(function (f) { self.note(f, { t: .9, d: .9, v: .15 }); });
    this.noise({ t: .9, d: .5, v: .09, type: 'highpass', f: 5000 });
    buzz([15, 50, 15]);
  },
  wrong: function () { this.note(233, { d: .18, v: .2 }); this.note(174, { t: .14, d: .26, v: .2 }); buzz(30); },
  pop: function () { this.noise({ d: .14, v: .5, f: 900 }); this.note(500, { d: .2, v: .45, slide: 70 }); buzz([20, 40, 20]); },
  drumLow: function () { this.note(150, { d: .3, v: .7, slide: 55 }); this.noise({ d: .04, v: .22, type: 'lowpass', f: 300 }); buzz(10); },
  drumHigh: function () { this.note(830, { d: .08, v: .36, type: 'triangle' }); this.noise({ d: .03, v: .16, type: 'highpass', f: 3200 }); buzz(8); },
  bird: function () { this.note(2500, { d: .08, v: .09, slide: 3200 }); this.note(2800, { t: .13, d: .09, v: .08, slide: 2300 }); },
  pad: function () { var self = this;[262, 330, 392, 523].forEach(function (f, i) { self.note(f, { t: i * .35, d: 2.6, v: .04 }); }); },
  sticker: function () { var self = this;[784, 988, 1175, 1568].forEach(function (f, i) { self.note(f, { t: i * .08, d: .4, v: .26, type: 'triangle' }); }); buzz([15, 60, 15]); },
  setWind: function (v) { if (!this.windGain) return; this._wind = lerp(this._wind, v, .18); this.windGain.gain.value = this._wind * .42; },
  toggle: function () {
    this.muted = !this.muted;
    Store.dispatch({ type: 'settings/patch', payload: { sound: !this.muted } });
    this.apply();
    if (this.muted) KeshaVoice.stop();
    if (this.onchange) this.onchange();
    return this.muted;
  }
};
function initAudioOnce() { AudioFX.init(); if (AudioFX.ctx && AudioFX.ctx.state === 'suspended') AudioFX.ctx.resume(); }
document.addEventListener('pointerdown', initAudioOnce, { capture: true });
document.addEventListener('keydown', initAudioOnce, { capture: true });

/* ==================== KeshaVoice: MP3 first, SpeechSynthesis fallback ==================== */
var KeshaVoice = {
  manifest: {
    'game.welcome': 'assets/audio/game-welcome.mp3',
    'welcome.back': 'assets/audio/welcome-back.mp3',
    'ship.intro': 'assets/audio/ship-intro.mp3', 'ship.hint': 'assets/audio/ship-hint.mp3', 'ship.outtro': 'assets/audio/ship-outtro.mp3',
    'odd.intro': 'assets/audio/odd-intro.mp3', 'odd.hint': 'assets/audio/odd-hint.mp3', 'odd.outtro': 'assets/audio/odd-outtro.mp3',
    'balloon.intro': 'assets/audio/balloon-intro.mp3', 'balloon.hint': 'assets/audio/balloon-hint.mp3', 'balloon.outtro': 'assets/audio/balloon-outtro.mp3',
    'rhythm.intro': 'assets/audio/rhythm-intro.mp3', 'rhythm.hint': 'assets/audio/rhythm-hint.mp3', 'rhythm.outtro': 'assets/audio/rhythm-outtro.mp3',
    'hard.intro': 'assets/audio/hard-intro.mp3', 'hard.hint': 'assets/audio/hard-hint.mp3', 'hard.outtro': 'assets/audio/hard-outtro.mp3',
    'syll.intro': 'assets/audio/syll-intro.mp3', 'syll.hint': 'assets/audio/syll-hint.mp3', 'syll.outtro': 'assets/audio/syll-outtro.mp3',
    'math.intro': 'assets/audio/math-intro.mp3', 'math.hint': 'assets/audio/math-hint.mp3', 'math.outtro': 'assets/audio/math-outtro.mp3',
    'praise.round.1': 'assets/audio/praise-round-1.mp3', 'praise.round.2': 'assets/audio/praise-round-2.mp3',
    'praise.round.3': 'assets/audio/praise-round-3.mp3', 'praise.round.4': 'assets/audio/praise-round-4.mp3',
    'praise.round.5': 'assets/audio/praise-round-5.mp3',
    'praise.streak': 'assets/audio/praise-streak.mp3', 'praise.perfect': 'assets/audio/praise-perfect.mp3',
    'praise.gameWin': 'assets/audio/praise-gameWin.mp3', 'praise.sticker': 'assets/audio/praise-sticker.mp3',
    'nav.backToGames': 'assets/audio/nav-backToGames.mp3', 'nav.cabinet': 'assets/audio/nav-cabinet.mp3',
    'nav.pause': 'assets/audio/nav-pause.mp3', 'nav.resume': 'assets/audio/nav-resume.mp3',
    'onboarding.step1': 'assets/audio/onboarding-step1.mp3', 'onboarding.step2': 'assets/audio/onboarding-step2.mp3',
    'onboarding.done': 'assets/audio/onboarding-done.mp3',
    'mic.requested': 'assets/audio/mic-requested.mp3', 'mic.denied': 'assets/audio/mic-denied.mp3', 'mic.ready': 'assets/audio/mic-ready.mp3',
    'session.start': 'assets/audio/session-start.mp3', 'session.end': 'assets/audio/session-end.mp3'
  },
  neuralReady: null, missing: {}, played: 0, _audio: null, _playing: false, _listeners: [],
  onChange: function (fn) { this._listeners.push(fn); },
  emit: function () { var self = this; this._listeners.forEach(function (f) { try { f(self._playing); } catch (e) {} }); },
  probe: function () {
    var self = this, url = this.manifest['game.welcome'], done = false;
    if (!url) { this.neuralReady = false; return; }
    var a = Adapters.audioEl(url);
    function finish(ok) { if (done) return; done = true; self.neuralReady = ok; if (!ok) self.missing['game.welcome'] = true; }
    a.addEventListener('canplaythrough', function () { finish(true); });
    a.addEventListener('error', function () { finish(false); });
    a.preload = 'auto';
    setTimeout(function () { finish(self.neuralReady === true); }, 2500);
    try { a.load(); } catch (e) { finish(false); }
  },
  isPlaying: function () { return this._playing; },
  stop: function () {
    if (this._audio) { try { this._audio.pause(); this._audio.currentTime = 0; } catch (e) {} this._audio = null; }
    var sp = Adapters.speech();
    if (sp) sp.cancel();
    if (this._playing) { this._playing = false; this.emit(); }
  },
  sayText: function (text, opt) {
    opt = opt || {};
    var sp = Adapters.speech(), st = S().settings, self = this;
    if (!sp || !st.voice.enabled || AudioFX.muted) return false;
    sp.cancel();
    var u = Adapters.utter(text);
    u.lang = 'ru-RU';
    u.rate = clamp(opt.rate || st.voice.rate, .6, 1.2);
    u.pitch = 1.08;
    var voices = sp.getVoices();
    var v = voices.filter(function (x) { return x.voiceURI === st.voice.voiceId; })[0] || voices.filter(function (x) { return /ru/i.test(x.lang); })[0];
    if (v) u.voice = v;
    this._playing = true; this.emit();
    u.onend = u.onerror = function () { self._playing = false; self.emit(); if (opt.onEnd) opt.onEnd(); };
    sp.speak(u);
    return true;
  },
  say: function (key, opt) {
    opt = opt || {};
    var st = S().settings, text = opt.fallbackText || '', self = this;
    this.stop();
    if (AudioFX.muted || !st.voice.enabled) { if (opt.onEnd) setTimeout(opt.onEnd, 400); return false; }
    var url = (st.voice.engine === 'neural') ? this.manifest[key] : null;
    if (url && !this.missing[key]) {
      var a = Adapters.audioEl(url);
      this._audio = a; this._playing = true; this.emit();
      a.volume = clamp(AudioFX.volume, 0, 1);
      a.onended = function () { self._playing = false; self._audio = null; self.emit(); self.played++; if (opt.onEnd) opt.onEnd(); };
      a.onerror = function () {
        self.missing[key] = true; self.neuralReady = false; self._audio = null; self._playing = false; self.emit();
        if (!self.sayText(text, opt) && opt.onEnd) setTimeout(opt.onEnd, 400);
      };
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () {
        self.missing[key] = true; self._playing = false; self.emit();
        if (!self.sayText(text, opt) && opt.onEnd) setTimeout(opt.onEnd, 400);
      });
      return true;
    }
    if (!this.sayText(text, opt)) { if (opt.onEnd) setTimeout(opt.onEnd, 400); return false; }
    return true;
  }
};
KeshaVoice.probe();
/* Legacy helper kept for call sites that only need browser speech. */
function speak(text, btn, rate) {
  var ok = KeshaVoice.sayText(text, { rate: rate });
  if (btn && ok) {
    btn.classList.add('talking');
    setTimeout(function () { btn.classList.remove('talking'); }, 1200);
  }
  return ok;
}

/* ==================== Mic: airflow-only analysis ==================== */
var Mic = {
  enabled: false, requesting: false, denied: false, cal: 0, calSum: 0, calN: 0,
  stream: null, src: null, anLow: null, anHigh: null, anRaw: null, bLow: null, bHigh: null, bRaw: null,
  level: 0, floor: .015, sens: S().settings.mic.defaultSens, voiceRatio: 0, airflow: 0, voiceOnly: false, onset: false,
  _env: 0, _armed: false, _lastOn: 0, onstate: null,
  emit: function (r) { if (this.onstate) this.onstate(r); },
  toggle: function () {
    var self = this;
    if (this.requesting) return;
    if (this.enabled) { this.stop(); this.emit('off'); return; }
    var md = Adapters.media();
    if (!md) { this.denied = true; this.emit('denied'); return; }
    this.requesting = true; this.denied = false; this.emit('req');
    md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .catch(function () { return md.getUserMedia({ audio: true }); })
      .then(function (stream) {
        AudioFX.init();
        if (!AudioFX.ctx) throw new Error('no audio context');
        var resume = AudioFX.ctx.state === 'suspended' ? AudioFX.ctx.resume() : Promise.resolve();
        return resume.then(function () {
          var ctx = AudioFX.ctx;
          self.stream = stream;
          self.src = ctx.createMediaStreamSource(stream);
          /* breath band: lowpass 1100 -> highpass 250 -> analyserLow */
          var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = .7;
          var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250; hp.Q.value = .7;
          self.anLow = ctx.createAnalyser(); self.anLow.fftSize = 1024;
          self.src.connect(lp); lp.connect(hp); hp.connect(self.anLow);
          /* voice band: highpass 1500 -> analyserHigh */
          var vhp = ctx.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 1500; vhp.Q.value = .7;
          self.anHigh = ctx.createAnalyser(); self.anHigh.fftSize = 1024;
          self.src.connect(vhp); vhp.connect(self.anHigh);
          self.anRaw = ctx.createAnalyser(); self.anRaw.fftSize = 1024; self.src.connect(self.anRaw);
          self.bLow = new Uint8Array(1024); self.bHigh = new Uint8Array(1024); self.bRaw = new Uint8Array(1024);
          self.enabled = true; self.floor = .015; self.requesting = false; self.emit('on');
        });
      })
      .catch(function (e) { Adapters.error('mic', e); self.denied = true; self.enabled = false; self.requesting = false; self.emit('denied'); });
  },
  stop: function () {
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    if (this.src) try { this.src.disconnect(); } catch (e) {}
    this.stream = null; this.src = null; this.anLow = this.anHigh = this.anRaw = null;
    this.enabled = false; this.level = 0; this.cal = 0; this.voiceOnly = false; this.emit('state');
  },
  calibrate: function () {
    if (!this.enabled) { this.emit('cal-no-mic'); return; }
    this.cal = 1; this.calSum = 0; this.calN = 0; this.emit('cal-start');
  },
  rms: function (an, buf) {
    an.getByteTimeDomainData(buf);
    var s = 0;
    for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / buf.length);
  },
  update: function (dt, now) {
    this.onset = false;
    if (!this.enabled || !this.anLow) { this.level = lerp(this.level, 0, 1 - Math.exp(-dt * 8)); this.voiceOnly = false; return; }
    var rmsLow = this.rms(this.anLow, this.bLow), rmsHigh = this.rms(this.anHigh, this.bHigh), raw = this.rms(this.anRaw, this.bRaw);
    if (this.cal > 0) {
      this.cal -= dt; this.calSum += rmsLow; this.calN++; this.level = 0;
      if (this.cal <= 0) { this.floor = clamp((this.calSum / Math.max(1, this.calN)) * 1.4, .008, .05); this.emit('cal-done'); }
      return;
    }
    this.floor += (Math.min(rmsLow, this.floor) - this.floor) * .03;
    this.floor = clamp(this.floor, .008, .05);
    var voiceRatio = rmsHigh / (rmsLow + rmsHigh + 1e-6);
    this.voiceRatio = voiceRatio;
    var airOnly = S().settings.mic.airOnly;
    var base = airOnly ? Math.max(0, rmsLow - this.floor) * this.sens * 12 : Math.max(0, raw - this.floor) * this.sens * 8;
    var airflow = clamp(base * (airOnly ? (1 - clamp(voiceRatio, 0, 1)) : 1), 0, 1);
    this.airflow = airflow;
    this.level = lerp(this.level, airflow, 1 - Math.exp(-dt * 8));
    this.voiceOnly = airOnly && voiceRatio > .6 && airflow < .1;
    /* syllable onset detector for the clap game */
    this._env = lerp(this._env, raw, 1 - Math.exp(-dt * 30));
    var th = Math.max(.05, this.floor * 3);
    if (this._env > th && !this._armed && now - this._lastOn > .22) { this.onset = true; this._armed = true; this._lastOn = now; }
    if (this._env < th * .6) this._armed = false;
  }
};

/* ==================== Achievements: pure conditions + granting ==================== */
var Achievements = {
  catalog: [
    { id: 'first', name: 'Первое занятие', emoji: '🐣', description: 'Сохранить первое занятие в журнале.', condition: function (s, c) { return s.sessions.some(function (x) { return x.pid === c.pid && x.entries.length > 0; }); } },
    { id: 'explorer', name: 'Исследователь', emoji: '🧭', description: 'Открыть все 7 игр хотя бы один раз.', condition: function (s, c) { return c.child && c.child.gamesOpened.length >= 7; } },
    { id: 'listener', name: 'Внимательный слушатель', emoji: '👂', description: 'Дослушать или прочитать инструкции всех 7 игр.', condition: function (s, c) { return c.child && c.child.listened.length >= 7; } },
    { id: 'streak-3', name: 'Серия 3', emoji: '🔥', description: 'Три игры подряд на 3 звезды.', condition: function (s, c) { return c.child && c.child.streak.current >= 3; } },
    { id: 'streak-7', name: 'Серия 7', emoji: '⚡', description: 'Семь игр подряд на 3 звезды.', condition: function (s, c) { return c.child && c.child.streak.current >= 7; } },
    { id: 'perfect-odd', name: 'Логик', emoji: '🧠', description: '«Четвёртый лишний» без единой ошибки.', condition: function (s, c) { return c.game === 'odd' && c.metric.firstTry === c.metric.rounds; } },
    { id: 'perfect-math', name: 'Юный математик', emoji: '🔢', description: '«Кеша считает» без ошибок.', condition: function (s, c) { return c.game === 'math' && c.metric.errors === 0; } },
    { id: 'perfect-hard', name: 'Чуткое ухо', emoji: '🎧', description: '«Твёрдый или мягкий» без ошибок.', condition: function (s, c) { return c.game === 'hard' && c.metric.errors === 0; } },
    { id: 'perfect-syll', name: 'Мастер слогов', emoji: '👏', description: 'Все 6 слов прохлопаны точно в такт.', condition: function (s, c) { return c.game === 'syll' && c.metric.perfect >= 6; } },
    { id: 'ship-smooth', name: 'Ровный выдох', emoji: '🌬️', description: 'Дуть ровно 3 секунды подряд в кораблике.', condition: function (s, c) { return c.game === 'ship' && c.metric.smoothMax >= 3; } },
    { id: 'balloon-gold', name: 'Золотой шарик', emoji: '🎈', description: 'Все шарики надуты без единого хлопка.', condition: function (s, c) { return c.game === 'balloon' && c.metric.pops === 0; } },
    { id: 'rhythm-master', name: 'Ритм-мастер', emoji: '🥁', description: '6 узоров повторены с первого раза.', condition: function (s, c) { return c.game === 'rhythm' && c.metric.first >= 6; } },
    { id: 'math-caterpillar', name: 'Счётная гусеница', emoji: '🐛', description: 'Идеальная математика на сложном уровне.', condition: function (s, c) { return c.game === 'math' && c.metric.errors === 0 && c.metric.diff === 'hard'; } },
    { id: 'hard-ear', name: 'Слух как у орла', emoji: '🦅', description: '10 пар без ошибок на сложном уровне.', condition: function (s, c) { return c.game === 'hard' && c.metric.errors === 0 && c.metric.rounds >= 10; } },
    { id: 'goal', name: 'Цель достигнута', emoji: '🎯', description: 'Выполнить первую цель месяца.', condition: function (s, c) { return s.goals.some(function (g) { return g.pid === c.pid && g.progress >= g.target; }); } },
    { id: 'praise-50', name: 'Любимчик Кеши', emoji: '💛', description: 'Получить 50 похвал от Кеши.', condition: function (s, c) { return c.child && c.child.praises >= 50; } }
  ],
  byId: function (id) { return this.catalog.filter(function (a) { return a.id === id; })[0]; },
  check: function (ctx) {
    var s = S(), p = currentChild();
    if (!p) return [];
    var context = Object.assign({ pid: p.id, child: p, game: null, metric: {} }, ctx || {});
    context.child = p; context.pid = p.id;
    var granted = [];
    this.catalog.forEach(function (a) {
      if (p.achievements.indexOf(a.id) >= 0) return;
      var ok = false;
      try { ok = !!a.condition(s, context); } catch (e) { Adapters.error('achievement condition', a.id, e); }
      if (ok) { Store.dispatch({ type: 'child/achievement', payload: { pid: p.id, achId: a.id, game: context.game } }); granted.push(a); }
    });
    if (granted.length) this.announce(granted);
    return granted;
  },
  grantManual: function (pid, achId, comment) {
    Store.dispatch({ type: 'child/achievement', payload: { pid: pid, achId: achId, manual: true, comment: comment || '' } });
    var a = this.byId(achId);
    if (a) this.announce([a]);
  },
  announce: function (list) {
    list.forEach(function (a, i) {
      setTimeout(function () {
        UI.toast('Новое достижение: ' + a.emoji + ' ' + a.name + '!');
        AudioFX.sticker();
        UI.confetti.burst(innerWidth / 2, innerHeight * .3, 26);
        KeshaVoice.say('praise.sticker', { fallbackText: 'Новая награда! ' + a.name });
        UI.mascot.pose('perfect');
        UI.renderShelf();
        var el = document.querySelector('.sticker[data-st="' + a.id + '"]');
        if (el) { el.classList.add('pop'); setTimeout(function () { el.classList.remove('pop'); }, 700); }
      }, 800 + i * 900);
    });
  }
};
// app.js — часть 2/3 (UI · Screens · GameRegistry: ship, balloon, odd, rhythm, hard, syll, math)
/* ==================== UI: toasts ==================== */
var UI = {};

UI.toast = function (msg, action) {
  var box = $('#toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  var t = document.createElement('div');
  t.className = 'toast' + (action ? ' act' : '');
  var sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  var timer;
  if (action) {
    var b = document.createElement('button'); b.textContent = action.label;
    b.addEventListener('click', function () { clearTimeout(timer); t.remove(); action.fn(); });
    t.appendChild(b);
  }
  box.appendChild(t);
  timer = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, action ? 6500 : 2600);
};

/* ==================== UI: confetti + feather particles ==================== */
UI.confetti = {
  cv: $('#fx'), cx: null, parts: [], dirty: false,
  colors: ['#FF7A1A', '#FFC53D', '#7ED321', '#29B6E8', '#E84393', '#FF4D5E', '#FFF6E3'],
  resize: function () {
    var d = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = innerWidth * d; this.cv.height = innerHeight * d;
    this.cx = this.cv.getContext('2d'); this.cx.setTransform(d, 0, 0, d, 0, 0);
  },
  burst: function (x, y, n) {
    n = n || 28; if (reducedMotion()) n = Math.min(n, 8);
    for (var i = 0; i < n; i++) {
      var a = Adapters.random() * TAU, sp = 140 + Adapters.random() * 420;
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 160, rot: Adapters.random() * TAU, vr: (Adapters.random() - .5) * 16, s: 5 + Adapters.random() * 6, c: this.colors[i % 7], life: .9 + Adapters.random() * .7, t: 0, sh: i % 2 });
    }
  },
  feathers: function (n) {
    n = n || 12;
    if (coarse || reducedMotion()) { this.burst(innerWidth * .7, innerHeight * .6, 14); return; }
    var ox = innerWidth - 90, oy = innerHeight - 90;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Adapters.random() - .5) * 1.6, sp = 180 + Adapters.random() * 300;
      this.parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Adapters.random() * TAU, vr: (Adapters.random() - .5) * 10, s: 8 + Adapters.random() * 8, c: this.colors[i % 7], life: 1.2, t: 0, sh: 2 });
    }
  },
  rain: function (n) {
    n = n || 80; if (reducedMotion()) n = 20;
    for (var i = 0; i < n; i++) this.parts.push({ x: Adapters.random() * innerWidth, y: -Adapters.random() * innerHeight * .3 - 10, vx: (Adapters.random() - .5) * 120, vy: 60 + Adapters.random() * 160, rot: Adapters.random() * TAU, vr: (Adapters.random() - .5) * 12, s: 6 + Adapters.random() * 6, c: this.colors[i % 7], life: 1.8 + Adapters.random() * 1.2, t: 0, sh: i % 2 });
  },
  update: function (dt) {
    if (!this.parts.length) { if (this.dirty) { this.cx.clearRect(0, 0, innerWidth, innerHeight); this.dirty = false; } return; }
    this.dirty = true;
    var c = this.cx; c.clearRect(0, 0, innerWidth, innerHeight);
    this.parts = this.parts.filter(function (p) {
      p.t += dt; if (p.t > p.life || p.y > innerHeight + 40) return false;
      p.vy += (p.sh === 2 ? 420 : 760) * dt; p.vx *= (1 - 1.2 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      c.save(); c.globalAlpha = Math.max(0, 1 - p.t / p.life); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.c;
      if (p.sh === 2) {
        c.beginPath(); c.ellipse(0, 0, p.s * .42, p.s, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(51,32,15,.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -p.s); c.lineTo(0, p.s); c.stroke();
      } else if (p.sh) c.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .66);
      else { c.beginPath(); c.arc(0, 0, p.s / 2, 0, TAU); c.fill(); }
      c.restore(); return true;
    });
  }
};
UI.confetti.resize();

/* ==================== UI: mascot ==================== */
UI.mascot = {
  sleep: false, idle: 0, _t: null, px: 0, py: 0, dirty: false,
  wrap: $('#mascotWrap'), hero: $('#parrotHero'), mini: $('#logoBtn'),
  wake: function () {
    this.idle = 0;
    if (this.sleep) { this.sleep = false; this.hero.classList.remove('sleep'); this.wrap.classList.remove('sleeping'); this.mini.classList.remove('sleep'); }
  },
  track: function (x, y) {
    var r = this.wrap.getBoundingClientRect();
    var cx = r.width ? r.left + r.width / 2 : innerWidth * .25, cy = r.height ? r.top + r.height * .4 : innerHeight * .4;
    this.px = clamp((x - cx) / Math.max(innerWidth * .5, 1), -1, 1);
    this.py = clamp((y - cy) / Math.max(innerHeight * .5, 1), -1, 1);
    this.dirty = true; this.wake();
  },
  pose: function (kind) {
    var self = this;
    clearTimeout(this._t);
    this.wrap.classList.remove('happy', 'sad', 'chirp', 'double');
    this.mini.classList.remove('happy', 'sad', 'double');
    void this.wrap.offsetWidth;
    var cls = (kind === 'perfect' || kind === 'gameWin') ? 'happy' : kind === 'streak' ? 'double' : kind === 'sad' ? 'sad' : 'chirp';
    this.wrap.classList.add(cls); this.mini.classList.add(cls === 'chirp' ? 'happy' : cls);
    this._t = setTimeout(function () { self.wrap.classList.remove(cls); self.mini.classList.remove('happy', 'sad', 'double'); }, kind === 'sad' ? 600 : 1000);
  },
  speaking: function (on) {
    this.wrap.classList.toggle('speaking', !!on);
    $('#keshaSays').classList.toggle('speaking', !!on);
    $('#tutMascot').classList.toggle('speaking', !!on);
  },
  tick: function (dt) {
    this.idle += dt;
    if (!this.sleep && this.idle > 8) { this.sleep = true; this.hero.classList.add('sleep'); this.wrap.classList.add('sleeping'); this.mini.classList.add('sleep'); }
    if (this.dirty) {
      this.dirty = false;
      var p = $('#pupils'), m = $('#miniPupils');
      if (p) p.style.transform = 'translate(' + this.px * 4 + 'px,' + this.py * 3 + 'px)';
      if (m) m.style.transform = 'translate(' + this.px * 1.6 + 'px,' + this.py * 1.2 + 'px)';
    }
  }
};
KeshaVoice.onChange(function (playing) { UI.mascot.speaking(playing); });
UI.mascot.wrap.addEventListener('pointerdown', function () {
  UI.mascot.wake(); UI.mascot.pose('chirp'); AudioFX.chirp();
  if (Adapters.random() < .5) KeshaVoice.say('game.welcome', { fallbackText: 'Чик-чирик! Привет!' });
});

/* ==================== UI: praise bubble + public praise API ==================== */
UI.praise = {
  timer: null, lastRoundAt: 0, lastText: {}, streak: 0,
  pick: function (level) {
    var arr = Core.PRAISE[level] || Core.PRAISE.round, t, guard = 0;
    do { t = arr[Math.floor(Adapters.random() * arr.length)]; guard++; } while (t === this.lastText[level] && guard < 8);
    this.lastText[level] = t; return t;
  },
  hit: function () { this.streak++; return this.streak % 3 === 0; },
  breakStreak: function () { this.streak = 0; },
  show: function (level, text, action) {
    var box = $('#keshaSays'), now = Adapters.perf();
    if (level === 'gameWin') { this.hide(); return; }
    if (level === 'round' && now - this.lastRoundAt < 1200) return;
    if (level === 'round') this.lastRoundAt = now;
    $('#ksText').textContent = text;
    var btn = $('#ksBtn');
    if (action) { btn.hidden = false; btn.textContent = action.label; btn.onclick = function () { UI.praise.hide(); action.fn(); }; }
    else { btn.hidden = true; btn.onclick = null; }
    box.hidden = false; box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { UI.praise.hide(); }, level === 'round' ? 2500 : 4000);
  },
  hide: function () {
    var box = $('#keshaSays'); box.classList.remove('show'); clearTimeout(this.timer);
    this.timer = setTimeout(function () { box.hidden = true; }, 260);
  }
};
$('#keshaSays').addEventListener('click', function (e) { if (e.target.id !== 'ksBtn') UI.praise.hide(); });

function praise(level, opt) {
  opt = opt || {};
  var text = opt.text || UI.praise.pick(level);
  Store.dispatch({ type: 'child/praise' });
  UI.mascot.wake(); UI.mascot.pose(level);
  if (level === 'round') { AudioFX.chirp(); KeshaVoice.say('praise.round.' + (1 + Math.floor(Adapters.random() * 5)), { fallbackText: text }); }
  else if (level === 'streak') { AudioFX.chirp(); setTimeout(function () { AudioFX.chirp(); }, 180); KeshaVoice.say('praise.streak', { fallbackText: text }); }
  else if (level === 'perfect') { AudioFX.fanfare(); UI.confetti.feathers(12); KeshaVoice.say('praise.perfect', { fallbackText: text }); }
  else if (level === 'gameWin') { AudioFX.fanfare(); UI.confetti.feathers(12); KeshaVoice.say('praise.gameWin', { fallbackText: text }); }
  UI.praise.show(level, text, opt.action);
  UI.refreshHeader();
  Achievements.check({});
  return text;
}

/* Single entry point: every game reports its result here. */
function award(game, stars, lines, metric) {
  var p = currentChild(); if (!p) return;
  var best = Object.assign({}, p.best);
  if (stars > (p.best[game] || 0)) best[game] = stars;
  var cur = stars === 3 ? (p.streak.current || 0) + 1 : 0;
  Store.dispatch({ type: 'child/update', payload: { id: p.id, patch: { best: best, streak: { current: cur, best: Math.max(p.streak.best || 0, cur) } } } });
  if (S().session) Store.dispatch({ type: 'session/entry', payload: { game: game, stars: stars, info: lines } });
  UI.refreshHeader();
  Achievements.check({ game: game, metric: metric || {} });
  var b = $('#bank'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
  if (S().session && typeof Cabinet !== 'undefined' && Cabinet.renderSession) Cabinet.renderSession();
}

/* ==================== UI: drawer, download, mic autocalibration ==================== */
UI.drawer = {
  open: function (title, html, onMount) {
    $('#dPanel').innerHTML = '<button class="xBtn" id="dClose" aria-label="Закрыть">✕</button><h2>' + esc(title) + '</h2>' + html;
    $('#drawer').hidden = false; $('#dPanel').scrollTop = 0;
    $('#dClose').addEventListener('click', function () { UI.drawer.close(); });
    if (onMount) onMount();
    var g = GameRegistry[Screens.cur]; if (g && g.pause) g.pause();
  },
  close: function () {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true; $('#dPanel').innerHTML = '';
    var g = GameRegistry[Screens.cur]; if (g && g.resume && !Screens.paused) g.resume();
  },
  isOpen: function () { return !$('#drawer').hidden; }
};
$('#dScrim').addEventListener('click', function () { UI.drawer.close(); });

UI.download = function (name, text, mime) {
  var b = new Blob([text], { type: mime }), u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(u); }, 1500);
};

UI.autoCalDone = false;
UI.autoCalibrate = function () {
  if (S().settings.mic.autoCalibrate && !UI.autoCalDone && Mic.enabled) {
    UI.autoCalDone = true;
    setTimeout(function () { Mic.calibrate(); }, 400);
  }
};

UI.measureDock = function () {
  var el = Screens.cur === 'ship' ? $('#screen-ship .dock') : Screens.cur === 'balloon' ? $('#screen-balloon .dock') : null;
  document.body.style.setProperty('--dockH', (el ? el.offsetHeight : 0) + 'px');
};

/* ==================== UI: header, shelf, hub grid ==================== */
UI.refreshHeader = function () {
  var s = S(), p = currentChild();
  $('#childAva').textContent = p ? p.avatar : '🦜';
  $('#childName').textContent = p ? p.name : '—';
  $('#gamesFor').textContent = 'Играем за: ' + (p ? p.name : '—');
  $('#bankVal').textContent = (p ? Core.bankTotal(p) : 0) + '/21';
  var sess = s.session;
  $('#sessChip').hidden = !sess;
  if (sess) { $('#sessTime').textContent = UI.sessionFmt(UI.sessionElapsed()); $('#sessChip').classList.toggle('paused', !!sess.pausedAt); }
  $('#appFooter').textContent = '«' + s.settings.specialist.cabinetName + '» • специалист: ' + s.settings.specialist.name + ' • Игры Попугая v' + APP.version;
  UI.renderShelf();
  $$('.best').forEach(function (el) {
    var n = p ? (p.best[el.dataset.best] || 0) : 0;
    el.innerHTML = [0, 1, 2].map(function (i) { return '<span class="' + (i < n ? 'lit' : '') + '">' + (i < n ? '★' : '☆') + '</span>'; }).join('');
  });
};

UI.renderShelf = function () {
  var p = currentChild(), row = $('#shelfRow');
  row.innerHTML = '';
  if (!p) { $('#shelfCount').textContent = '0 из ' + Achievements.catalog.length; return; }
  Achievements.catalog.forEach(function (a) {
    var on = p.achievements.indexOf(a.id) >= 0, fav = p.favoriteReward === a.id;
    var d = document.createElement('div');
    d.className = 'sticker' + (on ? ' on' : '') + (fav ? ' fav' : '');
    d.dataset.st = a.id; d.title = a.name + ' — ' + a.description;
    d.innerHTML = '<div class="disc">' + a.emoji + '</div>' + (on ? '' : '<span class="lock">🔒</span>') + '<small>' + esc(a.name) + '</small>';
    row.appendChild(d);
  });
  $('#shelfCount').textContent = p.achievements.length + ' из ' + Achievements.catalog.length + ' • ' + p.name;
};

UI.renderGrid = function () {
  var grid = $('#gameGrid'), p = currentChild();
  grid.innerHTML = '';
  GameRegistry.list().forEach(function (g, i) {
    var card = document.createElement('div');
    card.className = 'gcard'; card.setAttribute('role', 'button'); card.tabIndex = 0; card.dataset.game = g.id;
    card.style.setProperty('--ac', g.color);
    card.style.setProperty('--artbg', g.artBg);
    card.style.animationDelay = (0.06 * (i + 1)) + 's';
    var best = p ? (p.best[g.id] || 0) : 0;
    card.innerHTML = '<span class="playTag">▶ играть</span>' +
      '<button class="infoBtn" data-info="' + g.id + '" aria-label="Методика: ' + esc(g.name) + '">i</button>' +
      '<span class="gart">' + g.art() + '</span>' +
      '<span class="gbody"><h3>' + esc(g.name) + '</h3><p>' + esc(g.desc) + '</p>' +
      '<span class="gmeta"><span class="skill">' + esc(g.skill) + '</span>' +
      '<span class="best" data-best="' + g.id + '">' + [0, 1, 2].map(function (k) { return '<span class="' + (k < best ? 'lit' : '') + '">' + (k < best ? '★' : '☆') + '</span>'; }).join('') + '</span></span></span>';
    var play = function (e) { if (e.target.closest('.infoBtn')) return; AudioFX.click(); Screens.openGame(g.id); };
    card.addEventListener('click', play);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(e); } });
    card.querySelector('.infoBtn').addEventListener('click', function (e) {
      e.stopPropagation(); AudioFX.click();
      if (S().settings.access.pinHash && !(typeof Cabinet !== 'undefined' && Cabinet.unlocked)) { UI.pin.open(); return; }
      Screens.go('cabinet');
      setTimeout(function () { var el = $('#method-' + g.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 240);
    });
    grid.appendChild(card);
  });
};

/* ==================== UI: session helpers ==================== */
UI.sessionElapsed = function () {
  var s = S().session; if (!s) return 0;
  var paused = s.pausedMs + (s.pausedAt ? Adapters.now() - s.pausedAt : 0);
  return Math.max(0, Math.floor((Adapters.now() - s.start - paused) / 1000));
};
UI.sessionFmt = function (sec) { var m = Math.floor(sec / 60), s2 = sec % 60; return m + ':' + String(s2).padStart(2, '0'); };
UI.startSession = function (pid) {
  Store.dispatch({ type: 'session/start', payload: pid });
  UI.refreshHeader();
  if (typeof Cabinet !== 'undefined' && Cabinet.renderAll) Cabinet.renderAll();
  UI.toast('Занятие началось: ' + childById(pid).name + ' ▶');
  AudioFX.success();
  KeshaVoice.say('session.start', { fallbackText: 'Занятие началось!' });
  praise('round', { text: 'Начинаем занятие!' });
};
UI.finishSession = function () {
  var s = S().session; if (!s) return;
  if (!s.entries.length) { UI.toast('Сначала сыграйте хотя бы в одну игру 🎮'); return; }
  var p = childById(s.pid), stars = Core.sessionStars(s);
  var paused = s.pausedMs + (s.pausedAt ? Adapters.now() - s.pausedAt : 0);
  var mins = Math.max(1, Math.round((Adapters.now() - s.start - paused) / 60000));
  UI.drawer.open('Завершить занятие', '<p class="lead">' + esc(p.name) + ' • ' + mins + ' мин • ' + s.entries.length + ' игр • ⭐ ' + stars + '</p>' +
    '<div class="detailList">' + s.entries.map(function (e) {
      return '<div class="detailItem"><h4>' + Core.GAMES[e.game].emoji + ' ' + Core.GAMES[e.game].name + '<span>' + '★'.repeat(e.stars) + '</span></h4><ul>' + e.info.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>' +
    '<div class="field"><label for="sessNote2">Заметка к занятию</label><textarea class="inp" id="sessNote2" placeholder="Что получилось, над чем работаем дома…">' + esc(s.note || '') + '</textarea></div>' +
    '<div class="dActions"><button class="btnP green" id="sessSave">💾 Сохранить в журнал</button><button class="btnG" id="sessBack">Отмена</button></div>',
    function () {
      $('#sessSave').addEventListener('click', function () {
        Store.dispatch({ type: 'session/finish', payload: $('#sessNote2').value.trim() });
        UI.drawer.close(); UI.refreshHeader();
        if (typeof Cabinet !== 'undefined' && Cabinet.renderAll) Cabinet.renderAll();
        UI.confetti.rain(60);
        praise('perfect', { text: 'Занятие сохранено!' });
        KeshaVoice.say('session.end', { fallbackText: 'Занятие завершено. Молодец!' });
        Achievements.check({});
        UI.toast('Занятие сохранено в журнал ✅');
      });
      $('#sessBack').addEventListener('click', function () { UI.drawer.close(); });
    });
};

/* ==================== UI: result overlay ==================== */
UI.result = {
  timers: [], replayFn: null,
  show: function (o) {
    this.hide(true); this.replayFn = o.replay;
    $('#resEmoji').textContent = o.emoji; $('#resTitle').textContent = o.title;
    var slots = $$('#resStars span'); slots.forEach(function (s) { s.classList.remove('lit'); });
    var box = $('#resLines'); box.innerHTML = '';
    o.lines.forEach(function (l) { var d = document.createElement('div'); d.textContent = l; box.appendChild(d); });
    if (S().session) { var d2 = document.createElement('div'); d2.className = 'log'; d2.textContent = '✅ Записано в занятие: ' + (childById(S().session.pid) || {}).name; box.appendChild(d2); }
    $('#result').hidden = false;
    praise('gameWin');
    if (o.stars >= 2) UI.confetti.rain();
    for (var i = 0; i < o.stars; i++) {
      (function (k) {
        UI.result.timers.push(setTimeout(function () {
          slots[k].classList.add('lit');
          AudioFX.note(880 + k * 220, { d: .3, v: .3, type: 'triangle' });
          UI.confetti.burst(innerWidth / 2 + (k - 1) * 60, innerHeight * .42, 16);
        }, 420 + k * 380));
      })(i);
    }
  },
  hide: function (silent) { this.timers.forEach(clearTimeout); this.timers = []; $('#result').hidden = true; if (!silent) AudioFX.click(); },
  isOpen: function () { return !$('#result').hidden; }
};
$('#resReplay').addEventListener('click', function () { var f = UI.result.replayFn; UI.result.hide(); if (f) f(); });
$('#resHub').addEventListener('click', function () { UI.result.hide(); Screens.go('hub'); });
$('#resCab').addEventListener('click', function () { UI.result.hide(); if (typeof Cabinet !== 'undefined') Cabinet.open(); else Screens.go('cabinet'); });

/* ==================== UI: pause overlay ==================== */
UI.pause = {
  open: function () {
    var g = GameRegistry[Screens.cur];
    if (!g || Screens.paused || UI.result.isOpen()) return;
    Screens.paused = true; $('#pause').hidden = false; UI.releaseWind();
    if (g.pause) g.pause();
    AudioFX.click();
    KeshaVoice.say('nav.pause', { fallbackText: 'Пауза. Отдохни немного.' });
  },
  close: function () {
    if (!Screens.paused) return;
    Screens.paused = false; $('#pause').hidden = true;
    var g = GameRegistry[Screens.cur]; if (g && g.resume) g.resume();
    AudioFX.click();
    KeshaVoice.say('nav.resume', { fallbackText: 'Продолжаем!' });
  },
  isOpen: function () { return !$('#pause').hidden; }
};
$('#pauseResume').addEventListener('click', function () { UI.pause.close(); });
$('#pauseRestart').addEventListener('click', function () { var g = GameRegistry[Screens.cur]; UI.pause.close(); if (g) g.restart(); });
$('#pauseExit').addEventListener('click', function () { UI.pause.close(); Screens.go('hub'); });
$$('.pauseBtn').forEach(function (b) { b.addEventListener('click', function () { UI.pause.open(); }); });

/* ==================== UI: game tutorial overlay ==================== */
UI.tutorial = {
  gameId: null, shownThisRun: {}, onDone: null,
  needed: function (gameId) {
    var mode = S().settings.tutorial, p = currentChild();
    if (mode === 'never') return false;
    if (mode === 'always') return true;
    if (p && (p.tutorialCounts[gameId] || 0) < 2) return true;
    return !this.shownThisRun[gameId];
  },
  open: function (gameId, onDone) {
    var g = GameRegistry[gameId];
    this.gameId = gameId; this.onDone = onDone; this.shownThisRun[gameId] = true;
    $('#tutTitle').textContent = g.emoji + ' ' + g.name;
    $('#tutText').textContent = Core.INTRO[gameId];
    $('#tutorial').hidden = false;
    var p = currentChild();
    if (p) Store.dispatch({ type: 'child/opened', payload: { pid: p.id, game: gameId } });
    this.speak();
    Achievements.check({});
  },
  speak: function () {
    var self = this, id = this.gameId;
    if (!id) return;
    KeshaVoice.say(id + '.intro', { fallbackText: Core.INTRO[id], onEnd: function () { self.markListened(); } });
  },
  markListened: function () {
    var p = currentChild(); if (!p || !this.gameId) return;
    Store.dispatch({ type: 'child/listened', payload: { pid: p.id, game: this.gameId } });
    Achievements.check({});
  },
  finish: function (readText) {
    if ($('#tutorial').hidden) return;
    if (readText) this.markListened();
    KeshaVoice.stop();
    $('#tutorial').hidden = true;
    var f = this.onDone; this.onDone = null; this.gameId = null;
    if (f) f();
  },
  isOpen: function () { return !$('#tutorial').hidden; }
};
$('#tutPlay').addEventListener('click', function () { UI.tutorial.finish(!KeshaVoice.isPlaying()); });
$('#tutSkip').addEventListener('click', function () { UI.tutorial.finish(false); });
$('#tutRepeat').addEventListener('click', function () { AudioFX.click(); UI.tutorial.speak(); });
$$('.introBtn').forEach(function (b) {
  b.addEventListener('click', function () {
    var id = b.dataset.game; AudioFX.click();
    UI.tutorial.open(id, function () { var g = GameRegistry[id]; if (g && g.resume) g.resume(); });
  });
});

/* ==================== UI: onboarding ==================== */
UI.onboard = {
  step: 0, name: '', avatar: '🦜', age: 5, sounds: [],
  open: function () {
    this.step = 0; this.name = ''; this.avatar = '🦜'; this.age = 5; this.sounds = [];
    $('#onboard').hidden = false; this.render();
    KeshaVoice.say('onboarding.step1', { fallbackText: 'Привет! Я Кеша. Как зовут ребёнка?' });
  },
  close: function () { $('#onboard').hidden = true; },
  isOpen: function () { return !$('#onboard').hidden; },
  create: function (name, avatar, age, sounds) {
    var p = Core.normalizeProfile({
      id: uid(), name: name, avatar: avatar, birthDate: isoDay(Adapters.now() - age * YEAR_MS),
      targetSounds: sounds || [], color: '#FF7A1A', createdAt: new Date().toISOString()
    }, Adapters.now());
    Store.dispatch({ type: 'child/add', payload: p });
    this.close(); UI.refreshHeader(); UI.renderGrid();
    if (typeof Cabinet !== 'undefined' && Cabinet.renderAll) Cabinet.renderAll();
    UI.confetti.rain(50);
    praise('perfect', { text: 'Добро пожаловать, ' + name + '!' });
    KeshaVoice.say('onboarding.done', { fallbackText: 'Готово! Давай играть.' });
  },
  render: function () {
    var self = this;
    $$('#obDots i').forEach(function (d, i) { d.classList.toggle('on', i <= self.step); });
    var b = $('#obBody');
    if (this.step === 0) {
      b.innerHTML = '<div style="font-size:52px">🦜</div><h2>Привет! Я Кеша</h2><p>Как зовут ребёнка, который будет играть?</p>' +
        '<div class="field"><input class="inp" id="obName" type="text" maxlength="20" placeholder="Имя ребёнка" value="' + esc(this.name) + '" style="text-align:center;font-size:18px"></div>' +
        '<p class="err" id="obErr"></p><div class="dActions" style="justify-content:center"><button class="btnP green" id="obNext">Дальше →</button><button class="btnG" id="obSkip">Пропустить</button></div>';
      setTimeout(function () { $('#obName').focus(); }, 120);
      $('#obName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#obNext').click(); });
      $('#obSkip').addEventListener('click', function () { self.create('Ребёнок 1', '🦜', 5, []); });
      $('#obNext').addEventListener('click', function () {
        var v = $('#obName').value.trim();
        if (v.length < 2) { $('#obErr').textContent = 'Введите имя (минимум 2 буквы)'; return; }
        self.name = v; self.step = 1; AudioFX.click(); self.render();
        KeshaVoice.say('onboarding.step2', { fallbackText: 'Выбери друга и возраст.' });
      });
    } else if (this.step === 1) {
      b.innerHTML = '<h2>Выбери друга для ' + esc(this.name) + '</h2><p>Аватар можно поменять позже в кабинете.</p>' +
        '<div class="pickRow" id="obAva">' + Core.AVATARS.map(function (a) { return '<button class="pick' + (a === self.avatar ? ' on' : '') + '" data-a="' + a + '">' + a + '</button>'; }).join('') + '</div>' +
        '<div class="dActions" style="justify-content:center;margin-top:16px"><button class="btnP green" id="obNext2">Дальше →</button></div>';
      $('#obAva').addEventListener('click', function (e) {
        var t = e.target.closest('[data-a]'); if (!t) return;
        self.avatar = t.dataset.a; $$('#obAva .pick').forEach(function (x) { x.classList.toggle('on', x === t); }); AudioFX.click();
      });
      $('#obNext2').addEventListener('click', function () { self.step = 2; AudioFX.click(); self.render(); });
    } else {
      b.innerHTML = '<h2>Возраст и звуки</h2><p>Возраст: <b id="obAgeVal">' + this.age + '</b> ' + plural(this.age, ['год', 'года', 'лет']) + '</p>' +
        '<div class="field"><input type="range" id="obAge" min="3" max="12" step="1" value="' + this.age + '" style="width:100%"></div>' +
        '<p>Целевые звуки (можно пропустить):</p><div class="pickRow" id="obSnd">' + Core.SOUNDS.map(function (s) { return '<button class="pickS' + (self.sounds.indexOf(s) >= 0 ? ' on' : '') + '" data-s="' + s + '">[' + s + ']</button>'; }).join('') + '</div>' +
        '<div class="dActions" style="justify-content:center;margin-top:16px"><button class="btnP" id="obGo">🎮 Начать играть</button></div>';
      $('#obAge').addEventListener('input', function (e) { self.age = +e.target.value; $('#obAgeVal').textContent = self.age; });
      $('#obSnd').addEventListener('click', function (e) {
        var t = e.target.closest('[data-s]'); if (!t) return;
        var s = t.dataset.s;
        self.sounds = self.sounds.indexOf(s) >= 0 ? self.sounds.filter(function (x) { return x !== s; }) : self.sounds.concat([s]);
        t.classList.toggle('on'); AudioFX.click();
      });
      $('#obGo').addEventListener('click', function () { self.create(self.name, self.avatar, self.age, self.sounds); });
    }
  }
};

/* ==================== UI: cabinet PIN ==================== */
UI.pin = {
  hash: function (pin) {
    var sub = Adapters.subtle();
    if (sub) return sub.digest('SHA-256', new TextEncoder().encode('kesha:' + pin)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
    var h = 2166136261, s = 'kesha:' + pin;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Promise.resolve('fnv' + (h >>> 0).toString(16));
  },
  open: function () { $('#pin').hidden = false; $('#pinErr').textContent = ''; $('#pinInput').value = ''; setTimeout(function () { $('#pinInput').focus(); }, 120); },
  close: function () { $('#pin').hidden = true; },
  isOpen: function () { return !$('#pin').hidden; },
  try: function () {
    var v = $('#pinInput').value.trim();
    if (!/^\d{4}$/.test(v)) { $('#pinErr').textContent = 'Нужно 4 цифры'; return; }
    UI.pin.hash(v).then(function (h) {
      if (h === S().settings.access.pinHash) {
        if (typeof Cabinet !== 'undefined') { Cabinet.unlocked = true; Cabinet.idle = 0; }
        UI.pin.close(); AudioFX.success(); Screens.go('cabinet');
      } else { $('#pinErr').textContent = 'Неверный PIN'; AudioFX.wrong(); $('#pinInput').value = ''; $('#pinInput').focus(); }
    });
  }
};
$('#pinGo').addEventListener('click', function () { UI.pin.try(); });
$('#pinCancel').addEventListener('click', function () { UI.pin.close(); Screens.go('hub'); });
$('#pinInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') UI.pin.try(); });

/* ==================== UI: phone panel + local QR ==================== */
UI.phone = {
  qrDone: false,
  env: function () {
    var p = location.protocol, h = location.hostname;
    if (p === 'file:') return 'file';
    if (p === 'https:') return 'secure';
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(h)) return 'local';
    return 'insecure';
  },
  url: function () { return location.href.split('#')[0]; },
  drawQR: function () {
    var cv = $('#phQr'), note = $('#phQrNote');
    if (this.env() === 'file') { cv.hidden = true; note.textContent = 'QR появится после публикации по https-ссылке.'; return; }
    if (this.qrDone) return;
    var q = Core.QR.encode(this.url());
    if (!q) { cv.hidden = true; note.textContent = 'Ссылка слишком длинная для компактного QR — скопируй её кнопкой.'; return; }
    var quiet = 4, total = q.size + quiet * 2, css = cv.clientWidth || 210, dpr = Math.min(devicePixelRatio || 1, 3);
    var scale = Math.max(2, Math.floor(css * dpr / total));
    cv.width = cv.height = total * scale;
    var x = cv.getContext('2d');
    x.fillStyle = '#FFF6E3'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#071E18';
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) if (q.M[r][c]) x.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    cv.hidden = false; this.qrDone = true;
    note.textContent = 'Кеша построил QR прямо в браузере 🦜 Наводи камеру — и игра откроется.';
  },
  render: function () {
    if ($('#phone').hidden) return;
    var env = this.env(), st = $('#phStatus');
    var map = {
      secure: ['ok', '✅', 'Ссылка работает на телефоне', 'Адрес защищённый (https) — микрофон разрешён.'],
      local: ['info', '🧪', 'Локальный адрес компьютера', 'Мама не откроет его со своего телефона. Опубликуй папку или открой по IP в своей Wi-Fi сети.'],
      insecure: ['warn', '⚠️', 'http:// — телефон не даст микрофон', 'Игры работают кнопкой «Ветер», но для дуновения нужен https.'],
      file: ['bad', '📁', 'Файл открыт с диска', 'Так всё работает локально. Чтобы отправить маме — опубликуй папку.']
    }[env];
    st.className = 'phStatus ' + map[0];
    st.innerHTML = '<b>' + map[1] + '</b><div><strong>' + map[2] + '</strong><br>' + map[3] + '</div>';
    $('#phUrl').value = env === 'file' ? '(локальный файл)' : this.url();
    $('#phPublish').hidden = env === 'secure';
    this.drawQR();
  },
  open: function () {
    AudioFX.click(); $('#phone').hidden = false; this.render();
    var g = GameRegistry[Screens.cur]; if (g && g.pause) g.pause();
  },
  close: function () {
    if ($('#phone').hidden) return;
    $('#phone').hidden = true; AudioFX.click();
    var g = GameRegistry[Screens.cur]; if (g && g.resume && !Screens.paused) g.resume();
  },
  isOpen: function () { return !$('#phone').hidden; }
};
$('#btnPhone').addEventListener('click', function () { UI.phone.open(); });
$('#heroPhone').addEventListener('click', function () { UI.phone.open(); });
$('#cabPhone').addEventListener('click', function () { UI.phone.open(); });
$('#phClose').addEventListener('click', function () { UI.phone.close(); });
$('#phone').addEventListener('click', function (e) { if (e.target.id === 'phone') UI.phone.close(); });
$('#phCopy').addEventListener('click', function () {
  var txt = $('#phUrl').value;
  var done = function () { AudioFX.chime(); UI.toast('Ссылка скопирована 📋'); };
  var fallback = function () {
    var i = $('#phUrl'); i.removeAttribute('readonly'); i.select(); i.setSelectionRange(0, 999);
    try { document.execCommand('copy'); } catch (e) {}
    i.setAttribute('readonly', ''); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
  else fallback();
});
$('#phShare').addEventListener('click', function () {
  if (navigator.share && UI.phone.env() !== 'file') {
    navigator.share({ title: 'Игры Попугая', text: 'Логопедические игры — открой на телефоне 🦜', url: UI.phone.url() })
      .then(function () { UI.toast('Отправлено 📤'); })
      .catch(function (e) { if (e && e.name !== 'AbortError') $('#phCopy').click(); });
  } else $('#phCopy').click();
});

/* ==================== Breath pacer + fallback wind ==================== */
var Breath = {
  on: S().settings.pacer, t: 0, exhales: 0, blowing: 0, rest: 0,
  toggle: function () {
    this.on = !this.on;
    Store.dispatch({ type: 'settings/patch', payload: { pacer: this.on } });
    $$('.pacerBtn').forEach(function (b) { b.classList.toggle('on', Breath.on); });
    $('#shipPacer').hidden = !this.on; $('#balPacer').hidden = !this.on;
    UI.toast(this.on ? 'Подсказка дыхания включена 🫁' : 'Подсказка дыхания выключена');
  },
  reset: function () { this.exhales = 0; this.blowing = 0; this.rest = 0; this.hideRest(); },
  hideRest: function () { $$('.restBanner').forEach(function (e) { e.remove(); }); },
  update: function (dt, wind, active) {
    if (!active) return;
    this.t += dt;
    if (this.rest > 0) {
      this.rest -= dt;
      var b = $('.restBanner');
      if (b) b.querySelector('b').textContent = Math.ceil(Math.max(0, this.rest)) + ' с';
      if (this.rest <= 0) { this.hideRest(); this.exhales = 0; UI.toast('Отдохнули — продолжаем! 🪶'); }
      return;
    }
    if (wind > .32) this.blowing += dt;
    else if (this.blowing > .55) {
      this.blowing = 0; this.exhales++;
      if (this.exhales >= 6) {
        this.rest = 10;
        var stage = Screens.cur === 'ship' ? $('#shipStage') : $('#balStage');
        var d = document.createElement('div'); d.className = 'restBanner'; d.innerHTML = '🌿 Отдохни, подыши носом<b>10 с</b>';
        stage.appendChild(d); AudioFX.chime();
      }
    } else this.blowing = 0;
    if (this.on) {
      var cyc = this.t % 8.5, ph = cyc < 2.5 ? 'in' : cyc < 7 ? 'out' : 'rest';
      var k = ph === 'in' ? cyc / 2.5 : ph === 'out' ? 1 - (cyc - 2.5) / 4.5 * .75 : .25;
      $$('.pacer').forEach(function (p) {
        p.classList.toggle('in', ph === 'in'); p.classList.toggle('rest', ph === 'rest');
        p.querySelector('.core').style.transform = 'scale(' + (.55 + k * 1.05) + ')';
        p.querySelector('span').textContent = ph === 'in' ? 'Вдох носом 👃' : ph === 'out' ? 'Дуй-й-й 🌬️' : 'Пауза 🌿';
      });
    }
  }
};
var Input = { held: false, wind: 0, update: function (dt) { this.wind += ((this.held ? 1 : 0) - this.wind) * (1 - Math.exp(-dt * 8)); } };
UI.releaseWind = function () { Input.held = false; $$('.windBtn').forEach(function (b) { b.classList.remove('blowing'); }); };
$$('.windBtn').forEach(function (b) {
  b.addEventListener('pointerdown', function (e) { e.preventDefault(); Input.held = true; b.classList.add('blowing'); try { b.setPointerCapture(e.pointerId); } catch (err) {} });
  b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
});
window.addEventListener('pointerup', UI.releaseWind);
window.addEventListener('pointercancel', UI.releaseWind);
window.addEventListener('blur', UI.releaseWind);
document.addEventListener('visibilitychange', function () {
  UI.releaseWind();
  if (AudioFX.ctx) { if (document.hidden) AudioFX.ctx.suspend(); else AudioFX.ctx.resume(); }
});

/* ==================== Screens ==================== */
var Screens = {
  cur: null, paused: false, _t: null, _prev: null,
  titles: { cabinet: 'Кабинет специалиста' },
  flush: function () {
    if (this._t) { clearTimeout(this._t); this._t = null; }
    if (this._prev) { this._prev.hidden = true; this._prev.classList.remove('leaving'); this._prev = null; }
  },
  go: function (id) {
    if (this.cur === id) return;
    this.flush();
    var prevId = this.cur, prevEl = prevId ? $('#screen-' + prevId) : null;
    var prevGame = GameRegistry[prevId];
    if (prevGame && prevGame.cleanup) prevGame.cleanup();
    KeshaVoice.stop();
    this.paused = false; $('#pause').hidden = true;
    UI.drawer.close(); UI.phone.close(); UI.tutorial.finish(false);
    Breath.hideRest(); UI.praise.hide();
    this.cur = id;
    var hub = id === 'hub';
    $('#btnBack').hidden = hub;
    $('#hubNav').style.display = hub ? '' : 'none';
    $('#logoBtn').style.display = hub ? '' : 'none';
    $('#hdrTitle').hidden = hub;
    $('#hdrTitle').textContent = this.titles[id] || (GameRegistry[id] ? GameRegistry[id].name : '');
    $('#kidFab').style.display = id === 'cabinet' ? '' : 'none';
    var self = this;
    function showNew() {
      $$('.screen').forEach(function (s) { s.hidden = true; s.classList.remove('leaving'); });
      $('#screen-' + id).hidden = false;
      window.scrollTo(0, 0);
      if (id === 'cabinet' && typeof Cabinet !== 'undefined') Cabinet.renderAll();
      if (id === 'hub') { UI.refreshHeader(); UI.renderGrid(); }
      var g = GameRegistry[id]; if (g && g.resize) g.resize();
      self._prev = null; self._t = null;
      UI.measureDock();
    }
    if (prevEl && !reducedMotion()) { prevEl.classList.add('leaving'); this._prev = prevEl; this._t = setTimeout(showNew, 140); }
    else showNew();
  },
  openGame: function (id) {
    var g = GameRegistry[id]; if (!g) return;
    var self = this;
    var begin = function () {
      self.go(id);
      setTimeout(function () { g.start(); UI.measureDock(); }, self._t ? 160 : 0);
    };
    if (UI.tutorial.needed(id)) UI.tutorial.open(id, begin);
    else {
      var p = currentChild();
      if (p) Store.dispatch({ type: 'child/opened', payload: { pid: p.id, game: id } });
      Achievements.check({});
      begin();
    }
  }
};

/* ==================== GAME: ship ==================== */
var ShipGame = {
  id: 'ship', name: Core.GAMES.ship.name, emoji: '⛵', color: Core.GAMES.ship.color, skill: Core.GAMES.ship.skill, desc: Core.GAMES.ship.desc,
  artBg: 'linear-gradient(160deg,#7ADCF5,#29B6E8 55%,#0E7DC2)', windSound: true,
  cv: $('#shipCanvas'), cx: null, W: 0, H: 0, g: null, st: null, ppm: 26,
  art: function () { return '<span class="art-ship"><svg viewBox="0 0 160 100"><circle cx="132" cy="20" r="13" fill="#FFC53D"/><path d="M0 78q20-10 40 0t40 0 40 0 40 0V100H0Z" fill="#0A5E96"/><path d="M0 84q20-8 40 0t40 0 40 0 40 0V100H0Z" fill="#063A5C"/><g><path d="M52 72q-4 12 8 14h40q12-2 8-14z" fill="#8A4B2A" stroke="#5C3016" stroke-width="2.5"/><rect x="78" y="24" width="4" height="50" fill="#5C3016"/><path d="M82 26q26 22 0 46z" fill="#FF7A1A" stroke="#B34702" stroke-width="2"/><path d="M80 22l18 5-18 5z" fill="#E84393"/></g></svg></span>'; },
  getDifficulty: function () { return S().settings.difficulty.ship; },
  start: function () {
    $('#shipHint').textContent = coarse ? 'Дуй в нижний край телефона 📱 Проплывай звёздные ворота, не прерывая выдох!' : Core.INTRO.ship;
    this.resize(); this.restart(); UI.autoCalibrate();
  },
  restart: function () {
    var c = cfg('ship'), stars = [], i;
    for (i = 0; i < c.count; i++) stars.push({ m: c.goal * (i + 1) / (c.count + 1), got: false, miss: false, fade: 0, i: i });
    this.st = {
      goal: c.goal, gate: c.gate, drag: c.drag, dist: 0, vel: 0, time: 0, phase: 'play', phaseT: 0, collected: 0, missed: 0, shown: false,
      stars: stars, total: c.count, streaks: [], foam: [], trail: [], hist: [], smooth: false, smoothRun: 0, smoothMax: 0, toastAt: 0, missToast: false,
      clouds: [{ x: .15, y: .14, s: 1, v: 7 }, { x: .55, y: .09, s: .7, v: 10 }, { x: .85, y: .2, s: 1.2, v: 5 }],
      gulls: [{ x: .3, y: .22, p: 0 }, { x: .7, y: .16, p: 2 }], spark: []
    };
    $('#shipSmooth').classList.remove('show');
    $('#shipGateMark').style.left = (c.gate * 100) + '%';
    UI.praise.breakStreak(); Breath.reset(); this.hud(true);
  },
  pause: function () { UI.releaseWind(); },
  resume: function () {},
  cleanup: function () { UI.releaseWind(); Breath.hideRest(); this.st = null; },
  resize: function () {
    var r = $('#shipStage').getBoundingClientRect();
    this.W = Math.max(300, r.width); this.H = Math.max(200, r.height);
    var d = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = this.W * d; this.cv.height = this.H * d;
    this.cx = this.cv.getContext('2d'); this.cx.setTransform(d, 0, 0, d, 0, 0);
    var c = this.cx;
    var sky = c.createLinearGradient(0, 0, 0, this.H * .62); sky.addColorStop(0, '#6FD8F5'); sky.addColorStop(.6, '#A8E9FB'); sky.addColorStop(1, '#D8F6FF');
    var sea = c.createLinearGradient(0, this.H * .6, 0, this.H); sea.addColorStop(0, '#2BB0E8'); sea.addColorStop(.5, '#0E7DC2'); sea.addColorStop(1, '#084E80');
    this.g = { sky: sky, sea: sea };
  },
  hud: function (force) {
    var s = this.st, pct = clamp(s.dist / s.goal * 100, 0, 100);
    $('#shipProg').style.width = pct + '%'; $('#shipMark').style.left = pct + '%';
    var a = s.collected + '/' + s.total; if (force || this._ls !== a) { $('#shipStars').textContent = a; this._ls = a; }
    var b = Math.floor(s.time) + 'с'; if (force || this._lt !== b) { $('#shipTime').textContent = b; this._lt = b; }
  },
  seaY: function (t, m) { return this.H * .62 + Math.sin(t * 1.8 + m * .25) * 6; },
  update: function (dt, t, wind) {
    var s = this.st; if (!s) return;
    Breath.update(dt, wind, s.phase === 'play');
    var i, st;
    if (s.phase === 'play') {
      s.time += dt; s.vel += (wind * 30 - s.vel * s.drag) * dt;
      if (wind < .04) s.vel -= 2 * dt;
      s.vel = clamp(s.vel, -1.2, 20); s.dist = Math.max(0, s.dist + s.vel * dt);
      for (i = 0; i < s.stars.length; i++) {
        st = s.stars[i];
        if (st.got || st.miss) continue;
        if (Math.abs(st.m - s.dist) < 1.7) {
          if (wind >= s.gate) {
            st.got = true; s.collected++; AudioFX.collect();
            var sx = this.W * .32, sy = this.seaY(t, st.m) - 42;
            for (var k = 0; k < 8; k++) s.spark.push({ x: sx, y: sy, vx: (Adapters.random() - .5) * 240, vy: -40 - Adapters.random() * 180, t: 0, life: .7 });
            praise(UI.praise.hit() ? 'streak' : 'round');
          }
        } else if (s.dist > st.m + 1.7) {
          st.miss = true; s.missed++; AudioFX.miss(); UI.praise.breakStreak();
          if (!s.missToast) { s.missToast = true; UI.toast('Звезда уплыла — дуй у ворот! ⭐'); }
        }
      }
      s.hist.push(wind); if (s.hist.length > 90) s.hist.shift();
      if (s.hist.length > 60) {
        var m = s.hist.reduce(function (a, b) { return a + b; }, 0) / s.hist.length;
        var v = s.hist.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / s.hist.length;
        s.smooth = m > .3 && v < .016;
      } else s.smooth = false;
      if (s.smooth) { s.smoothRun += dt; s.smoothMax = Math.max(s.smoothMax, s.smoothRun); } else s.smoothRun = 0;
      $('#shipSmooth').classList.toggle('show', s.smooth);
      if (s.smooth && t > s.toastAt) { s.toastAt = t + 10; UI.toast('Плавно! Так держать ✨'); }
      if (s.dist >= s.goal) { s.phase = 'won'; s.phaseT = 0; AudioFX.success(); if (s.missed === 0) praise('perfect'); }
    } else {
      s.phaseT += dt; s.vel = lerp(s.vel, 2, dt * 2); s.dist = Math.min(s.goal + 2.4, s.dist + s.vel * dt);
      if (s.phaseT > 1 && !s.shown) {
        s.shown = true;
        var metric = { time: s.time, collected: s.collected, total: s.total, smoothMax: s.smoothMax };
        var stars2 = Core.starsFor('ship', metric);
        var lines = ['Время: ' + Math.floor(s.time) + ' с', 'Ворота: ' + s.collected + '/' + s.total, 'Ровный выдох: ' + s.smoothMax.toFixed(1) + ' с'];
        award('ship', stars2, lines, metric);
        var self = this;
        KeshaVoice.say('ship.outtro', { fallbackText: Core.OUTRO.ship });
        UI.result.show({ emoji: '⛵', title: s.collected === s.total ? 'Вот это ветер!' : 'До острова доплыли!', stars: stars2, lines: lines, replay: function () { self.restart(); } });
      }
    }
    if (wind > .12 && Adapters.random() < wind * .9) s.streaks.push({ x: this.W + 20, y: this.H * (.1 + Adapters.random() * .45), len: 30 + Adapters.random() * 60, v: (300 + Adapters.random() * 350) * (.5 + wind), t: 0, life: .8 });
    s.streaks = s.streaks.filter(function (p) { p.t += dt; p.x -= p.v * dt; return p.t < p.life && p.x > -120; });
    if (s.vel > 3 && Adapters.random() < .5) s.foam.push({ x: this.W * .32 - 40, y: this.seaY(t, s.dist) + 22, vx: -s.vel * this.ppm * .35, vy: -6 - Adapters.random() * 24, t: 0, life: .6, r: 2 + Adapters.random() * 3 });
    s.foam = s.foam.filter(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; return p.t < p.life; });
    s.spark = s.spark.filter(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; return p.t < p.life; });
    s.stars.forEach(function (x) { if (x.miss) x.fade = Math.min(1, x.fade + dt); });
    if (s.smooth && s.vel > 2) { s.trail.push({ m: s.dist, t: t }); if (s.trail.length > 46) s.trail.shift(); } else if (s.trail.length) s.trail.shift();
    $('#shipGaugeFill').style.transform = 'scaleX(' + wind + ')';
    $('#shipWindPct').textContent = Math.round(wind * 100) + '%';
    this.hud(); this.draw(t, wind);
  },
  draw: function (t, wind) {
    var c = this.cx, W = this.W, H = this.H, s = this.st, cam = s.dist * this.ppm - W * .32, i;
    c.fillStyle = this.g.sky; c.fillRect(0, 0, W, H * .63);
    var g = c.createRadialGradient(W * .82, H * .13, 4, W * .82, H * .13, 90);
    g.addColorStop(0, '#FFF3C4'); g.addColorStop(.35, 'rgba(255,197,61,.85)'); g.addColorStop(1, 'rgba(255,197,61,0)');
    c.fillStyle = g; c.beginPath(); c.arc(W * .82, H * .13, 90, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.92)';
    for (i = 0; i < s.clouds.length; i++) {
      var cl = s.clouds[i], x = ((cl.x * W + t * cl.v) % (W + 240)) - 120, y = cl.y * H;
      c.beginPath(); c.ellipse(x, y, 46 * cl.s, 17 * cl.s, 0, 0, TAU); c.ellipse(x - 30 * cl.s, y + 6, 28 * cl.s, 12 * cl.s, 0, 0, TAU); c.ellipse(x + 32 * cl.s, y + 7, 30 * cl.s, 13 * cl.s, 0, 0, TAU); c.fill();
    }
    c.strokeStyle = '#3A5568'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (i = 0; i < s.gulls.length; i++) {
      var gu = s.gulls[i], gx = ((gu.x * W + t * 26) % (W + 80)) - 40, gy = gu.y * H + Math.sin(t * 1.3 + gu.p) * 10, f = Math.sin(t * 7 + gu.p) * 6;
      c.beginPath(); c.moveTo(gx - 11, gy); c.quadraticCurveTo(gx - 5, gy - 6 - f, gx, gy); c.quadraticCurveTo(gx + 5, gy - 6 - f, gx + 11, gy); c.stroke();
    }
    c.fillStyle = '#1E7A52'; c.beginPath(); c.moveTo(0, H * .6);
    for (var hx = 0; hx <= W; hx += 40) c.lineTo(hx, H * .6 - 14 - Math.sin((hx + cam * .15) * .012) * 16);
    c.lineTo(W, H * .63); c.lineTo(0, H * .63); c.fill();
    c.fillStyle = this.g.sea; c.fillRect(0, H * .6, W, H * .4);
    var ix = s.goal * this.ppm - cam + 70, iy = H * .62;
    if (ix < W + 260 && ix > -260) {
      c.fillStyle = '#F5D08C'; c.strokeStyle = '#D9A85C'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(ix, iy + 16, 120, 30, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = '#8A4B2A'; c.lineWidth = 9; c.beginPath(); c.moveTo(ix + 26, iy + 8); c.quadraticCurveTo(ix + 38, iy - 52, ix + 18, iy - 84); c.stroke();
      c.strokeStyle = '#2E9E4F'; c.lineWidth = 7;
      for (i = 0; i < 5; i++) {
        var a = -Math.PI * .15 - i * Math.PI * .2;
        c.beginPath(); c.moveTo(ix + 18, iy - 84); c.quadraticCurveTo(ix + 18 + Math.cos(a) * 46, iy - 98 + Math.sin(a) * 30, ix + 18 + Math.cos(a) * 66, iy - 76 + Math.sin(a) * 44); c.stroke();
      }
      c.strokeStyle = '#5C3016'; c.lineWidth = 4; c.beginPath(); c.moveTo(ix - 52, iy + 6); c.lineTo(ix - 52, iy - 56); c.stroke();
      c.fillStyle = '#E84393'; c.beginPath(); c.moveTo(ix - 52, iy - 56); c.lineTo(ix - 14, iy - 47); c.lineTo(ix - 52, iy - 38); c.closePath(); c.fill();
      this.parrotFace(c, ix - 14, iy - 4, 15);
      c.fillStyle = '#FFF6E3'; c.font = '900 14px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('ОСТРОВ', ix, iy + 44);
    }
    for (i = 0; i < s.stars.length; i++) {
      var st = s.stars[i], sx2 = st.m * this.ppm - cam;
      if (sx2 < -60 || sx2 > W + 60 || st.got) continue;
      var sy2 = this.seaY(t, st.m) - 42 + Math.sin(t * 2.4 + st.i) * 5 - st.fade * 40;
      c.save(); c.globalAlpha = 1 - st.fade;
      var ok = wind >= s.gate;
      c.setLineDash([7, 6]); c.lineWidth = 3;
      c.strokeStyle = st.miss ? 'rgba(180,180,180,.6)' : ok ? 'rgba(126,211,33,.95)' : 'rgba(255,197,61,.75)';
      c.beginPath(); c.arc(sx2, sy2, 26, 0, TAU); c.stroke(); c.setLineDash([]);
      if (!st.miss) { c.shadowColor = '#FFC53D'; c.shadowBlur = ok ? 18 : 10; }
      c.fillStyle = st.miss ? '#B9B2A4' : '#FFC53D'; c.strokeStyle = st.miss ? '#8E8779' : '#C88A0A'; c.lineWidth = 2;
      starPath(c, sx2, sy2, 14, t * .7 + st.i); c.fill(); c.stroke(); c.restore();
    }
    if (s.trail.length > 2) {
      c.lineCap = 'round';
      for (i = 1; i < s.trail.length; i++) {
        var ta = s.trail[i - 1], tb = s.trail[i];
        c.strokeStyle = 'hsla(' + ((t * 140 + i * 9) % 360) + ',90%,62%,' + (i / s.trail.length * .6) + ')'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(ta.m * this.ppm - cam, this.seaY(ta.t, ta.m) + 18); c.lineTo(tb.m * this.ppm - cam, this.seaY(tb.t, tb.m) + 18); c.stroke();
      }
    }
    this.waveLine(c, t, cam, H * .62 + 8, 10, .02, 'rgba(255,255,255,.22)', 2.5);
    var shx = W * .32, shy = this.seaY(t, s.dist), tilt = Math.sin(t * 1.8 + s.dist * .25 + 1) * .045 + clamp(s.vel * .004, 0, .06);
    c.save(); c.translate(shx, shy); c.rotate(tilt);
    c.fillStyle = '#8A4B2A'; c.strokeStyle = '#5C3016'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-48, 2); c.quadraticCurveTo(-52, 24, -30, 27); c.lineTo(34, 27); c.quadraticCurveTo(54, 22, 48, 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#FFC53D'; c.beginPath(); c.arc(0, 15, 5, 0, TAU); c.fill();
    c.fillStyle = '#5C3016'; c.fillRect(-2, -80, 4, 84);
    var bulge = 12 + wind * 30;
    var sg = c.createLinearGradient(0, -76, 44, -10); sg.addColorStop(0, '#FFA63E'); sg.addColorStop(1, '#E85D04');
    c.fillStyle = sg; c.strokeStyle = '#B34702'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(4, -76); c.quadraticCurveTo(4 + bulge, -42, 4, -10); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#E84393'; c.beginPath(); c.moveTo(0, -82); c.lineTo(22 + Math.sin(t * 9) * 4, -75); c.lineTo(0, -68); c.closePath(); c.fill();
    this.parrotFace(c, -26, -8, 11); c.restore();
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (i = 0; i < s.foam.length; i++) { var fp = s.foam[i]; c.globalAlpha = 1 - fp.t / fp.life; c.beginPath(); c.arc(fp.x, fp.y, fp.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    for (i = 0; i < s.spark.length; i++) { var sp = s.spark[i]; c.globalAlpha = 1 - sp.t / sp.life; c.fillStyle = '#FFC53D'; starPath(c, sp.x, sp.y, 5, sp.t * 6); c.fill(); }
    c.globalAlpha = 1;
    this.waveFill(c, t, cam, H * .66, 13, .017, 'rgba(8,78,128,.55)', 1.4);
    this.waveFill(c, t, cam, H * .78, 15, .014, 'rgba(6,58,92,.7)', 1.9);
    for (i = 0; i < s.streaks.length; i++) {
      var wp = s.streaks[i];
      c.strokeStyle = 'rgba(255,255,255,' + ((1 - wp.t / wp.life) * .7) + ')'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(wp.x, wp.y); c.quadraticCurveTo(wp.x + wp.len * .5, wp.y - 6, wp.x + wp.len, wp.y); c.stroke();
    }
  },
  waveLine: function (c, t, cam, y, amp, k, style, lw) {
    c.beginPath();
    for (var x = 0; x <= this.W; x += 14) { var yy = y + Math.sin((x + cam) * k + t * 2) * amp; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); }
    c.strokeStyle = style; c.lineWidth = lw; c.stroke();
  },
  waveFill: function (c, t, cam, y, amp, k, style, sp) {
    c.beginPath(); c.moveTo(0, this.H);
    for (var x = 0; x <= this.W; x += 14) c.lineTo(x, y + Math.sin((x + cam) * k + t * 2 * sp) * amp);
    c.lineTo(this.W, this.H); c.closePath(); c.fillStyle = style; c.fill();
  },
  parrotFace: function (c, x, y, r) {
    c.save(); c.translate(x, y); c.lineWidth = Math.max(1.4, r * .13); c.strokeStyle = '#33200F';
    c.fillStyle = '#FFC53D'; c.beginPath(); c.moveTo(-r * .2, -r * .85); c.quadraticCurveTo(-r * .35, -r * 1.4, r * .05, -r * 1.5); c.quadraticCurveTo(r * .05, -r * 1.1, r * .15, -r * .85); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#E8332F'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#FFF6E3'; c.beginPath(); c.ellipse(0, r * .3, r * .6, r * .45, 0, 0, TAU); c.fill();
    c.fillStyle = '#FFF'; c.beginPath(); c.arc(-r * .35, -r * .15, r * .2, 0, TAU); c.fill(); c.beginPath(); c.arc(r * .35, -r * .15, r * .2, 0, TAU); c.fill();
    c.fillStyle = '#33200F'; c.beginPath(); c.arc(-r * .32, -r * .12, r * .1, 0, TAU); c.fill(); c.beginPath(); c.arc(r * .38, -r * .12, r * .1, 0, TAU); c.fill();
    c.fillStyle = '#E8D9B8'; c.beginPath(); c.moveTo(-r * .1, r * .1); c.quadraticCurveTo(r * .55, r * .1, r * .5, r * .6); c.quadraticCurveTo(r * .45, r * .9, r * .05, r * .95); c.quadraticCurveTo(r * .25, r * .5, -r * .1, r * .1); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
};
$('#shipRestart').addEventListener('click', function () { AudioFX.click(); ShipGame.restart(); UI.toast('Новое плавание! ⛵'); });

/* ==================== GAME: balloon (explicit round lifecycle) ==================== */
var balloonState = null, balloonRoundRaf = 0;
function balloonResetRound(i) {
  var s = balloonState, c = s.cfg;
  s.round = i;
  BalloonGame.clearCanvas();
  s.pressure = 0; s.hold = 0; s.popped = false; s.grew = 0; s.phase = 'play'; s.phaseT = 0; s.roundActive = false;
  s.targetP = BalloonGame.targets[i] * s.scale - 24;
  s.popP = s.targetP + c.pop * s.scale;
  $('#balNeedle').style.transform = 'scaleX(0)';
  $('#balPct').textContent = '0%';
  $('#balState').textContent = 'Дуй плавно…';
  var lo = (s.targetP - c.tol * s.scale) / s.popP * 100, hi = (s.targetP + c.tol * s.scale) / s.popP * 100;
  var z = $('#balZone'); z.style.left = clamp(lo, 0, 100) + '%'; z.style.width = clamp(hi - lo, 0, 100) + '%';
  $('#balRounds').textContent = s.done.map(function (d, k) { return d ? '✅' : (k === s.round ? '🎈' : '⚪'); }).join('');
  if (DEV) Adapters.assert(balloonState.pressure === 0, 'pressure reset on round start');
  if (balloonRoundRaf) Adapters.caf(balloonRoundRaf);
  balloonRoundRaf = Adapters.raf(function () {
    balloonRoundRaf = 0;
    if (balloonState === s && s.phase === 'play') s.roundActive = true;
  });
}
var BalloonGame = {
  id: 'balloon', name: Core.GAMES.balloon.name, emoji: '🎈', color: Core.GAMES.balloon.color, skill: Core.GAMES.balloon.skill, desc: Core.GAMES.balloon.desc,
  artBg: 'linear-gradient(160deg,#FF9ECF,#E84393 55%,#A61E68)', windSound: true,
  cv: $('#balCanvas'), cx: null, W: 0, H: 0, g: null, targets: [86, 112, 138, 160],
  art: function () { return '<span class="art-bal"><svg viewBox="0 0 100 120"><circle cx="50" cy="44" r="34" fill="none" stroke="#FFF6E3" stroke-width="2" stroke-dasharray="6 5" opacity=".8"/><ellipse cx="50" cy="46" rx="24" ry="27" fill="#FF6FB0" stroke="#A61E68" stroke-width="2.5"/><ellipse cx="41" cy="36" rx="7" ry="10" fill="#fff" opacity=".5"/><path d="M46 73l4 6 4-6z" fill="#A61E68"/><path d="M50 79q-8 16 2 34" fill="none" stroke="#FFF6E3" stroke-width="2"/></svg></span>'; },
  getDifficulty: function () { return S().settings.difficulty.balloon; },
  clearCanvas: function () {
    if (this.cx) this.cx.clearRect(0, 0, this.W, this.H);
    if (balloonState) { balloonState.shards.length = 0; balloonState.fly.x = 0; balloonState.fly.y = 0; }
  },
  start: function () {
    $('#balHint').textContent = coarse ? 'Дуй в нижний край телефона 📱 Ровно и мягко: до метки 🎯 и удержи!' : Core.INTRO.balloon;
    this.resize(); this.restart(); UI.autoCalibrate();
  },
  restart: function () {
    var c = cfg('balloon'), ff = [], i, done = [];
    for (i = 0; i < 12; i++) ff.push({ x: Adapters.random(), y: .1 + Adapters.random() * .6, p: Adapters.random() * TAU, s: .5 + Adapters.random() });
    for (i = 0; i < c.rounds; i++) done.push(false);
    balloonState = {
      cfg: c, round: 0, pressure: 0, hold: 0, popped: false, roundActive: false, phase: 'play', phaseT: 0, shown: false, pops: 0, grew: 0,
      shards: [], fly: { x: 0, y: 0 }, scale: clamp(Math.min(this.W || 600, this.H || 400) / 520, .6, 1.15), done: done, targetP: 1, popP: 2, ff: ff
    };
    $('#balPops').textContent = '0'; Breath.reset(); UI.praise.breakStreak();
    balloonResetRound(0);
  },
  pause: function () { UI.releaseWind(); },
  resume: function () {},
  cleanup: function () {
    UI.releaseWind(); Breath.hideRest();
    if (balloonRoundRaf) { Adapters.caf(balloonRoundRaf); balloonRoundRaf = 0; }
    balloonState = null;
  },
  resize: function () {
    var r = $('#balStage').getBoundingClientRect();
    this.W = Math.max(300, r.width); this.H = Math.max(200, r.height);
    var d = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = this.W * d; this.cv.height = this.H * d;
    this.cx = this.cv.getContext('2d'); this.cx.setTransform(d, 0, 0, d, 0, 0);
    var c = this.cx, g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#123B4A'); g.addColorStop(.5, '#3E2A56'); g.addColorStop(.82, '#7A2E5E'); g.addColorStop(1, '#241430');
    this.g = g;
    if (balloonState) balloonState.scale = clamp(Math.min(this.W, this.H) / 520, .6, 1.15);
  },
  update: function (dt, t, wind) {
    var s = balloonState; if (!s) return;
    var c = s.cfg, tol = c.tol * s.scale;
    Breath.update(dt, wind, s.phase === 'play');
    var inZone = s.pressure >= s.targetP - tol && s.pressure <= s.targetP + tol;
    if (s.phase === 'play' && s.roundActive) {
      var prev = s.pressure;
      s.pressure += wind * 54 * s.scale * dt;
      if (wind < .08) s.pressure = Math.max(0, s.pressure - 6 * s.scale * dt);
      s.grew = s.pressure - prev;
      if (inZone) {
        s.hold += dt;
        if (s.hold >= c.hold) {
          s.phase = 'fly'; s.roundActive = false; s.phaseT = 0; s.fly = { x: 0, y: 0 };
          AudioFX.success(); UI.confetti.burst(innerWidth * .56, innerHeight * .42, 22);
          praise(UI.praise.hit() ? 'streak' : 'round');
        }
      } else s.hold = Math.max(0, s.hold - dt * 1.6);
      /* Pop only when the round is live AND pressure actually grew this frame. */
      if (s.roundActive && s.grew > 0.001 && s.pressure >= s.popP) {
        s.popped = true; s.roundActive = false; s.phase = 'pop'; s.phaseT = 0; s.pops++;
        $('#balPops').textContent = s.pops; AudioFX.pop(); UI.mascot.pose('sad'); UI.praise.breakStreak();
        for (var i = 0; i < 30; i++) {
          var a = Adapters.random() * TAU, sp = 120 + Adapters.random() * 360;
          s.shards.push({ x: this.W * .56, y: this.H * .42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, rot: Adapters.random() * TAU, vr: (Adapters.random() - .5) * 18, t: 0, life: .5 + Adapters.random() * .5, sz: 4 + Adapters.random() * 6 });
        }
        UI.toast('Ой, лопнул! Дуй мягче 🌬️');
      }
      if (s.phase === 'play') $('#balState').textContent = inZone ? 'Держи! ' + (c.hold - s.hold).toFixed(1) + 'с' : (s.pressure < s.targetP - tol ? 'Дуй плавно…' : 'Чуть сдуй! 😬');
    } else if (s.phase === 'pop') {
      s.phaseT += dt; $('#balState').textContent = 'Ой! 💥';
      if (s.phaseT > 1.15) balloonResetRound(s.round);
    } else if (s.phase === 'fly') {
      s.phaseT += dt; s.fly.y -= 150 * dt; s.fly.x = Math.sin(t * 3) * 14; $('#balState').textContent = 'Улетел! 🎉';
      if (s.phaseT > 1.5) {
        s.done[s.round] = true;
        if (s.round < c.rounds - 1) { balloonResetRound(s.round + 1); AudioFX.chime(); }
        else if (!s.shown) {
          s.shown = true; s.phase = 'won'; s.roundActive = false;
          var metric = { pops: s.pops, rounds: c.rounds };
          var stars = Core.starsFor('balloon', metric);
          if (s.pops === 0) praise('perfect');
          var lines = ['Шарики: ' + c.rounds + '/' + c.rounds, 'Лопнуло: ' + s.pops, 'Режим: ' + Core.DIFF_NAME[this.getDifficulty()]];
          award('balloon', stars, lines, metric);
          var self = this;
          KeshaVoice.say('balloon.outtro', { fallbackText: Core.OUTRO.balloon });
          UI.result.show({ emoji: '🎈', title: 'Все шарики готовы!', stars: stars, lines: lines, replay: function () { self.restart(); } });
        }
      }
    }
    s.shards = s.shards.filter(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.rot += p.vr * dt; return p.t < p.life; });
    $('#balNeedle').style.transform = 'scaleX(' + clamp(s.pressure / s.popP, 0, 1) + ')';
    $('#balPct').textContent = Math.round(s.pressure / Math.max(1, s.targetP) * 100) + '%';
    this.draw(t, wind, inZone && s.phase === 'play');
  },
  draw: function (t, wind, inZone) {
    var c = this.cx, W = this.W, H = this.H, s = balloonState, i;
    c.fillStyle = this.g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,246,227,.8)';
    for (i = 0; i < 24; i++) { var x = (i * 97.3) % W, y = (i * 57.7) % (H * .4); c.globalAlpha = (.4 + .6 * Math.abs(Math.sin(t * 1.5 + i))) * .7; c.fillRect(x, y, 2, 2); }
    c.globalAlpha = 1;
    for (i = 0; i < s.ff.length; i++) {
      var f = s.ff[i], fx = f.x * W + Math.sin(t * .6 + f.p) * 30, fy = f.y * H + Math.cos(t * .5 + f.p) * 22, fa = .35 + .5 * Math.abs(Math.sin(t * 2 + f.p));
      var fg = c.createRadialGradient(fx, fy, 0, fx, fy, 7 * f.s);
      fg.addColorStop(0, 'rgba(255,220,120,' + fa + ')'); fg.addColorStop(1, 'rgba(255,220,120,0)');
      c.fillStyle = fg; c.beginPath(); c.arc(fx, fy, 7 * f.s, 0, TAU); c.fill();
    }
    c.fillStyle = '#0B2E22'; c.beginPath(); c.moveTo(0, H);
    for (var gx = 0; gx <= W; gx += 30) c.lineTo(gx, H - 26 - Math.sin(gx * .05) * 8);
    c.lineTo(W, H); c.closePath(); c.fill();
    var r = 24 + s.pressure, bx = W * .56 + s.fly.x, by = H * .42 + s.fly.y, tx = W * .17, ty = H - 58;
    c.save(); c.translate(tx, ty);
    c.strokeStyle = '#0E7DC2'; c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-38, 12); c.quadraticCurveTo(-62, 4 + Math.sin(t * 2) * 6, -58, -18); c.stroke();
    c.fillStyle = '#E8332F'; c.strokeStyle = '#33200F'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(0, 4, 42, 34, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#FFC53D'; c.beginPath(); c.ellipse(6, 14, 20, 16, 0, 0, TAU); c.fill();
    c.fillStyle = '#0E7DC2'; c.beginPath(); c.ellipse(-22, 0, 14, 22, .4, 0, TAU); c.fill(); c.stroke();
    var wv = s.phase === 'fly' ? Math.sin(t * 10) * .5 : 0;
    c.save(); c.translate(28, -10); c.rotate(-.5 + wv);
    c.fillStyle = '#0E7DC2'; c.beginPath(); c.ellipse(14, -8, 18, 9, -.5, 0, TAU); c.fill(); c.stroke(); c.restore();
    ShipGame.parrotFace(c, -4, -42, 24); c.restore();
    if (s.phase === 'play') {
      c.strokeStyle = 'rgba(255,246,227,.85)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(tx + 52, ty - 30); c.quadraticCurveTo((tx + 52 + bx) / 2 + Math.sin(t * 1.6) * 16, (ty - 30 + by + r * 1.12) / 2 + 20, bx, by + r * 1.12 + 6); c.stroke();
      c.setLineDash([10, 8]); c.strokeStyle = '#FFC53D'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(W * .56, H * .42, s.targetP + 24, 0, TAU); c.stroke();
      c.setLineDash([4, 10]); c.strokeStyle = 'rgba(255,77,94,.4)'; c.lineWidth = 2;
      c.beginPath(); c.arc(W * .56, H * .42, s.popP + 24, 0, TAU); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#FFC53D'; c.font = '900 13px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('🎯 метка', W * .56, H * .42 - s.targetP - 34);
    } else if (s.phase === 'fly') {
      c.strokeStyle = 'rgba(255,246,227,.85)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(bx, by + r * 1.12 + 6); c.quadraticCurveTo(bx + Math.sin(t * 4) * 10, by + r * 1.12 + 34, bx - 6, by + r * 1.12 + 56); c.stroke();
    }
    if (s.phase === 'play' || s.phase === 'fly') {
      var bg = c.createRadialGradient(bx - r * .32, by - r * .38, r * .1, bx, by, r * 1.2);
      bg.addColorStop(0, '#FF9ECF'); bg.addColorStop(.55, '#E84393'); bg.addColorStop(1, '#A61E68');
      c.fillStyle = bg; c.strokeStyle = inZone ? '#7ED321' : '#8F1B57'; c.lineWidth = inZone ? 4 : 3;
      c.beginPath(); c.ellipse(bx, by, r, r * 1.12, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(bx - r * .34, by - r * .42, r * .2, r * .3, -.5, 0, TAU); c.fill();
      c.fillStyle = '#8F1B57'; c.beginPath(); c.moveTo(bx - 6, by + r * 1.12); c.lineTo(bx + 6, by + r * 1.12); c.lineTo(bx, by + r * 1.12 + 8); c.closePath(); c.fill();
      if (s.hold > 0) {
        c.strokeStyle = '#7ED321'; c.lineWidth = 7; c.lineCap = 'round';
        c.beginPath(); c.arc(bx, by, r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * (s.hold / s.cfg.hold)); c.stroke();
      }
    }
    for (i = 0; i < s.shards.length; i++) {
      var p = s.shards[i];
      c.save(); c.globalAlpha = 1 - p.t / p.life; c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.sz > 7 ? '#E84393' : '#FF6FB0'; c.fillRect(-p.sz / 2, -p.sz / 3, p.sz, p.sz * .66); c.restore();
    }
    if (wind > .1 && s.phase === 'play') {
      c.strokeStyle = 'rgba(180,230,255,' + wind * .7 + ')'; c.lineWidth = 2.5; c.lineCap = 'round';
      for (i = 0; i < 3; i++) {
        var ph = (t * 2.2 + i * .33) % 1, x0 = tx + 18, y0 = ty - 52;
        var wx = x0 + ph * (bx - x0 - 30), wy = y0 + ph * (by - y0) + Math.sin(ph * 9 + i) * 8;
        c.beginPath(); c.moveTo(wx, wy); c.quadraticCurveTo(wx + 12, wy - 4, wx + 24, wy); c.stroke();
      }
    }
  }
};
$('#balRestart').addEventListener('click', function () { AudioFX.click(); BalloonGame.restart(); UI.toast('Новые шарики! 🎈'); });

/* ==================== GAME: odd one out ==================== */
var OddGame = {
  id: 'odd', name: Core.GAMES.odd.name, emoji: '🧩', color: Core.GAMES.odd.color, skill: Core.GAMES.odd.skill, desc: Core.GAMES.odd.desc,
  artBg: 'linear-gradient(160deg,#C4E86B,#7ED321 55%,#4CA818)', st: null,
  art: function () { return '<span class="art-odd"><span>🍎</span><span>🍐</span><span>🍌</span><span>🥕</span></span>'; },
  getDifficulty: function () { return S().settings.difficulty.odd; },
  start: function () { $('#oddSound').value = S().settings.oddSound; this.restart(); },
  restart: function () {
    var c = cfg('odd'), snd = S().settings.oddSound;
    var pool = snd === 'all' ? Core.ODD_DATA : Core.ODD_DATA.filter(function (r) { return r.snd === snd; });
    if (!pool.length) pool = Core.ODD_DATA;
    var n = Math.min(c.rounds, pool.length);
    var rounds = shuffle(pool).slice(0, n).map(function (r) {
      var o = shuffle([0, 1, 2, 3]);
      return Object.assign({}, r, { items: o.map(function (i) { return r.it[i]; }), oddPos: o.indexOf(3) });
    });
    this.st = { cfg: c, rounds: rounds, idx: 0, phase: 'pick', wrong: 0, hint: false, total: 0, firstTry: 0, n: n };
    UI.praise.breakStreak();
    $('#oddSub').textContent = c.words ? 'Нажми на картинку, которая не подходит к трём другим' : 'Слова спрятаны: назови картинки сам, потом выбери лишнюю';
    this.renderRound();
  },
  pause: function () { KeshaVoice.stop(); },
  resume: function () {},
  cleanup: function () { KeshaVoice.stop(); this.st = null; },
  dots: function () {
    var s = this.st, box = $('#oddDots'); box.innerHTML = '';
    s.rounds.forEach(function (_, i) { var d = document.createElement('i'); if (i < s.idx) d.className = 'done'; else if (i === s.idx) d.className = 'cur'; box.appendChild(d); });
    $('#oddRoundLabel').textContent = Math.min(s.idx + 1, s.n) + '/' + s.n;
    $('#oddStars').textContent = s.total;
  },
  renderRound: function () {
    var self = this, s = this.st, r = s.rounds[s.idx];
    s.phase = 'pick'; s.wrong = 0; s.hint = false;
    var grid = $('#oddGrid'); grid.classList.remove('revealed'); grid.innerHTML = '';
    var colors = ['#FF7A1A', '#29B6E8', '#7ED321', '#E84393'];
    r.items.forEach(function (item, i) {
      var d = document.createElement('div');
      d.className = 'ocard'; d.setAttribute('role', 'button'); d.tabIndex = 0;
      d.style.setProperty('--cc', colors[i]);
      d.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="em">' + item[0] + '</span>' +
        '<span class="wd' + (s.cfg.words ? '' : ' hidden') + '">' + (s.cfg.words ? esc(item[1]) : 'назови сам') + '</span>' +
        '<button class="say" aria-label="Послушать слово">🔊</button>';
      d.querySelector('.say').addEventListener('click', function (e) { e.stopPropagation(); KeshaVoice.sayText(item[1], {}); });
      d.addEventListener('click', function () { self.pick(i, d); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.pick(i, d); } });
      grid.appendChild(d);
    });
    $('#oddBanner').hidden = true; $('#oddHintText').textContent = ''; $('#oddHintBtn').disabled = false;
    this.dots();
  },
  pick: function (i, el) {
    var s = this.st; if (!s || s.phase !== 'pick') return;
    var r = s.rounds[s.idx];
    if (i === r.oddPos) {
      s.phase = 'reveal';
      var stars = s.hint ? (s.cfg.freeHint ? 2 : 1) : Math.max(1, 3 - s.wrong);
      s.total += stars;
      var first = s.wrong === 0 && !s.hint;
      if (first) s.firstTry++;
      $('#oddGrid').classList.add('revealed'); el.classList.add('hit'); AudioFX.collect();
      var b = el.getBoundingClientRect(); UI.confetti.burst(b.left + b.width / 2, b.top + b.height / 2, 22);
      praise(first && UI.praise.hit() ? 'streak' : 'round');
      $('#oddCat').textContent = r.cat + ' • звук [' + r.snd + ']';
      $('#oddWhy').textContent = r.why; $('#oddSay').textContent = r.say;
      $('#oddBanner').hidden = false; $('#oddHintBtn').disabled = true;
      $('#oddNext').textContent = s.idx < s.n - 1 ? 'Дальше →' : 'Результаты 🏆';
      this.dots(); $('#oddBanner').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      s.wrong++; AudioFX.wrong(); UI.mascot.pose('sad'); UI.praise.breakStreak();
      el.classList.remove('wrong'); void el.offsetWidth; el.classList.add('wrong');
      $('#oddHintText').textContent = s.wrong >= 2 ? 'Возьми подсказку 💡' : 'Не то! Попробуй ещё 🪶';
    }
  },
  next: function () {
    var s = this.st; if (!s || s.phase !== 'reveal') return;
    AudioFX.click();
    if (s.idx < s.n - 1) { s.idx++; this.renderRound(); return; }
    var max = s.n * 3, metric = { total: s.total, max: max, firstTry: s.firstTry, rounds: s.n };
    var stars = Core.starsFor('odd', metric);
    if (s.firstTry === s.n) praise('perfect');
    var lines = ['Звёзды: ' + s.total + '/' + max, 'С первого раза: ' + s.firstTry + '/' + s.n, 'Режим: ' + Core.DIFF_NAME[this.getDifficulty()]];
    award('odd', stars, lines, metric);
    var self = this;
    KeshaVoice.say('odd.outtro', { fallbackText: Core.OUTRO.odd });
    UI.result.show({ emoji: '🧠', title: 'Отличная работа!', stars: stars, lines: lines, replay: function () { self.restart(); } });
  }
};
$('#oddNext').addEventListener('click', function () { OddGame.next(); });
$('#oddRestart').addEventListener('click', function () { AudioFX.click(); OddGame.restart(); });
$('#oddHintBtn').addEventListener('click', function () {
  var s = OddGame.st; if (!s || s.phase !== 'pick' || s.hint) return;
  s.hint = true; AudioFX.click(); $('#oddHintText').textContent = '💡 ' + s.rounds[s.idx].hint; $('#oddHintBtn').disabled = true;
});
$('#oddSayBtn').addEventListener('click', function () { var s = OddGame.st; if (s) KeshaVoice.sayText(s.rounds[s.idx].say, {}); });
$('#oddSound').addEventListener('change', function (e) {
  Store.dispatch({ type: 'settings/patch', payload: { oddSound: e.target.value } });
  AudioFX.click(); OddGame.restart();
});

/* ==================== GAME: rhythm ==================== */
var RhythmGame = {
  id: 'rhythm', name: Core.GAMES.rhythm.name, emoji: '🥁', color: Core.GAMES.rhythm.color, skill: Core.GAMES.rhythm.skill, desc: Core.GAMES.rhythm.desc,
  artBg: 'linear-gradient(160deg,#FFE9A8,#FFC53D 55%,#F5A623)', st: null, timers: [],
  art: function () { return '<span class="art-rhy"><i class="d1"></i><i class="d2"></i></span>'; },
  getDifficulty: function () { return S().settings.difficulty.rhythm; },
  clear: function () { this.timers.forEach(clearTimeout); this.timers = []; },
  later: function (fn, ms) { this.timers.push(setTimeout(fn, ms)); },
  start: function () { this.restart(); },
  restart: function () {
    this.clear();
    var c = cfg('rhythm');
    this.st = { cfg: c, pats: Core.RHY_PATTERNS.slice(0, c.count), lvl: 0, phase: 'idle', input: [], attempts: 0, first: 0 };
    $('#rFirst').textContent = '0'; UI.praise.breakStreak(); this.play();
  },
  pause: function () { this.clear(); },
  resume: function () { if (this.st && this.st.phase === 'listen') this.play(); },
  cleanup: function () { this.clear(); this.st = null; },
  levelUI: function () {
    var s = this.st;
    $('#rLevel').textContent = (s.lvl + 1) + '/' + s.cfg.count;
    var box = $('#rDotsLevel'); box.innerHTML = '';
    s.pats.forEach(function (_, i) { var d = document.createElement('i'); if (i < s.lvl) d.className = 'done'; else if (i === s.lvl) d.className = 'cur'; box.appendChild(d); });
    var dots = $('#rDots'); dots.innerHTML = '';
    s.pats[s.lvl].forEach(function (v) { var d = document.createElement('i'); d.className = v ? 'high' : 'low'; dots.appendChild(d); });
  },
  flash: function (v) {
    var pad = v ? $('#padHigh') : $('#padLow'), self = this;
    pad.classList.remove('flash'); void pad.offsetWidth; pad.classList.add('flash');
    this.later(function () { pad.classList.remove('flash'); }, 280);
    if (v) AudioFX.drumHigh(); else AudioFX.drumLow();
    var tg = $('#rParrot'); tg.classList.add('hit'); this.later(function () { tg.classList.remove('hit'); }, 140);
  },
  play: function () {
    var s = this.st, self = this;
    this.clear(); s.phase = 'listen'; s.input = [];
    $('#rPads').classList.add('locked');
    var ph = $('#rPhase'); ph.textContent = 'Слушай… 👂'; ph.className = 'rPhase listen';
    $('#rMsg').textContent = s.attempts ? 'Слушай ещё раз внимательно' : 'Кеша стучит — запоминай!';
    this.levelUI();
    var pat = s.pats[s.lvl], dots = $$('#rDots i');
    pat.forEach(function (v, i) {
      self.later(function () {
        self.flash(v); dots[i].classList.add('played');
        if (i === pat.length - 1) self.later(function () {
          s.phase = 'input'; $('#rPads').classList.remove('locked');
          ph.textContent = 'Твоя очередь! 🥁'; ph.className = 'rPhase go';
          $('#rMsg').textContent = 'Повтори ритм на барабанах';
          dots.forEach(function (d) { d.classList.remove('played'); });
          dots[0].classList.add('now'); AudioFX.chime();
        }, s.cfg.step);
      }, 600 + i * s.cfg.step);
    });
  },
  tap: function (v) {
    var s = this.st; if (!s || s.phase !== 'input') return;
    var self = this;
    this.flash(v);
    var pat = s.pats[s.lvl], idx = s.input.length, dots = $$('#rDots i');
    if (pat[idx] === v) {
      s.input.push(v); dots[idx].classList.remove('now'); dots[idx].classList.add('played');
      if (s.input.length < pat.length) dots[s.input.length].classList.add('now');
      if (s.input.length === pat.length) {
        s.phase = 'wait'; $('#rPads').classList.add('locked');
        var first = s.attempts === 0;
        if (first) { s.first++; $('#rFirst').textContent = s.first; }
        AudioFX.collect(); praise(first && UI.praise.hit() ? 'streak' : 'round');
        var ph = $('#rPhase'); ph.textContent = 'Верно! 🎉'; ph.className = 'rPhase go';
        this.later(function () {
          if (s.lvl < s.cfg.count - 1) { s.lvl++; s.attempts = 0; self.play(); }
          else {
            var metric = { first: s.first, count: s.cfg.count };
            var stars = Core.starsFor('rhythm', metric);
            if (s.first === s.cfg.count) praise('perfect');
            var lines = ['Узоры: ' + s.cfg.count + '/' + s.cfg.count, 'С первого раза: ' + s.first + '/' + s.cfg.count, 'Режим: ' + Core.DIFF_NAME[self.getDifficulty()]];
            award('rhythm', stars, lines, metric);
            KeshaVoice.say('rhythm.outtro', { fallbackText: Core.OUTRO.rhythm });
            UI.result.show({ emoji: '🥁', title: 'Ты — мастер ритма!', stars: stars, lines: lines, replay: function () { self.restart(); } });
          }
        }, 950);
      }
    } else {
      s.phase = 'wait'; s.attempts++; $('#rPads').classList.add('locked');
      AudioFX.wrong(); UI.mascot.pose('sad'); UI.praise.breakStreak();
      var ph2 = $('#rPhase'); ph2.textContent = 'Ой, не так 😅'; ph2.className = 'rPhase bad';
      $('#rMsg').textContent = 'Ничего! Послушай ещё раз';
      this.later(function () { self.play(); }, 1100);
    }
  }
};
$('#padLow').addEventListener('pointerdown', function (e) { e.preventDefault(); RhythmGame.tap(0); });
$('#padHigh').addEventListener('pointerdown', function (e) { e.preventDefault(); RhythmGame.tap(1); });
$('#rRestart').addEventListener('click', function () { AudioFX.click(); RhythmGame.restart(); });

/* ==================== GAME: hard / soft ==================== */
var HardGame = {
  id: 'hard', name: Core.GAMES.hard.name, emoji: '🪨', color: Core.GAMES.hard.color, skill: Core.GAMES.hard.skill, desc: Core.GAMES.hard.desc,
  artBg: 'linear-gradient(160deg,#D9A8C9,#B0568C 55%,#7A2E5E)', st: null, _t: null,
  art: function () { return '<span class="art-hard"><span class="h1">🪨</span><span class="h2">🌿</span></span>'; },
  getDifficulty: function () { return S().settings.difficulty.hard; },
  start: function () { this.restart(); },
  restart: function () {
    clearTimeout(this._t); KeshaVoice.stop();
    var c = cfg('hard'), rounds = shuffle(Core.HARD_POOLS[c.pool]).slice(0, c.n);
    this.st = { cfg: c, rounds: rounds, idx: 0, phase: 'ask', errors: 0, n: rounds.length };
    $('#hardErr').textContent = '0'; UI.praise.breakStreak(); this.renderRound();
  },
  pause: function () { clearTimeout(this._t); KeshaVoice.stop(); $('#hardParrot').classList.remove('speaking'); },
  resume: function () { if (this.st && this.st.phase === 'ask') this.say(); },
  cleanup: function () { clearTimeout(this._t); KeshaVoice.stop(); this.st = null; },
  dots: function () {
    var s = this.st, box = $('#hardDots'); box.innerHTML = '';
    s.rounds.forEach(function (_, i) { var d = document.createElement('i'); if (i < s.idx) d.className = 'done'; else if (i === s.idx) d.className = 'cur'; box.appendChild(d); });
    $('#hardRoundLabel').textContent = Math.min(s.idx + 1, s.n) + '/' + s.n;
  },
  notice: function () {
    var n = $('#hardNotice'), tx = $('#hardNoticeText'), b = $('#hardNoticeBtn'), st = S().settings;
    if (!Adapters.speech()) { n.hidden = false; tx.textContent = 'Озвучка недоступна — читаем слово глазами.'; b.hidden = true; return; }
    if (AudioFX.muted || !st.voice.enabled) { n.hidden = false; tx.textContent = 'Звук или озвучка выключены — игра про слух!'; b.hidden = false; return; }
    n.hidden = true;
  },
  renderRound: function () {
    var s = this.st, self = this;
    s.phase = 'ask';
    $('#hardWord').innerHTML = '<span class="mystery">? ? ?</span>';
    $('#hardBanner').hidden = true; $('#hardBtns').classList.remove('locked');
    $('#hmHard').classList.remove('right', 'wrongPick'); $('#hmSoft').classList.remove('right', 'wrongPick');
    this.notice(); this.dots();
    this._t = setTimeout(function () { self.say(); }, 450);
  },
  say: function () {
    var s = this.st; if (!s || s.phase !== 'ask') return;
    this.notice();
    var item = s.rounds[s.idx];
    if (!Adapters.speech() || AudioFX.muted || !S().settings.voice.enabled) { $('#hardWord').innerHTML = this.markup(item); return; }
    var p = $('#hardParrot'); p.classList.add('speaking');
    KeshaVoice.sayText(item.t, { rate: s.cfg.rate, onEnd: function () { p.classList.remove('speaking'); } });
    setTimeout(function () { p.classList.remove('speaking'); }, 1200);
    if (s.cfg.noise) AudioFX.noise({ d: 1.1, v: .05, f: 900 });
  },
  markup: function (item) {
    var i = item.t.indexOf(item.c);
    return i < 0 ? esc(item.t) : esc(item.t.slice(0, i)) + '<b>' + esc(item.c) + '</b>' + esc(item.t.slice(i + 1));
  },
  answer: function (softPick) {
    var s = this.st; if (!s || s.phase !== 'ask') return;
    s.phase = 'reveal'; clearTimeout(this._t); KeshaVoice.stop(); $('#hardParrot').classList.remove('speaking');
    var item = s.rounds[s.idx], correct = item.soft === softPick;
    var picked = softPick ? $('#hmSoft') : $('#hmHard'), other = softPick ? $('#hmHard') : $('#hmSoft');
    $('#hardBtns').classList.add('locked'); $('#hardWord').innerHTML = this.markup(item);
    if (correct) {
      picked.classList.add('right'); AudioFX.collect();
      var b = picked.getBoundingClientRect(); UI.confetti.burst(b.left + b.width / 2, b.top + b.height / 2, 20);
      praise(UI.praise.hit() ? 'streak' : 'round');
    } else {
      s.errors++; $('#hardErr').textContent = s.errors;
      picked.classList.add('wrongPick'); other.classList.add('right');
      AudioFX.wrong(); UI.mascot.pose('sad'); UI.praise.breakStreak();
    }
    $('#hardCat').textContent = (item.soft ? 'Мягкий согласный' : 'Твёрдый согласный') + (correct ? ' • верно ✅' : ' • запомни 👇');
    $('#hardCat').style.background = item.soft ? 'var(--leaf-deep)' : 'var(--sea)';
    $('#hardExplain').textContent = item.soft
      ? 'Слышишь [' + item.c + "'] — язык поднимается к нёбу, звук мягкий. «" + item.t + '» — как травка 🌿'
      : 'Слышишь [' + item.c + '] — язык у верхних зубов, звук твёрдый. «' + item.t + '» — как камень 🪨';
    $('#hardBanner').hidden = false;
    $('#hardNext').textContent = s.idx < s.n - 1 ? 'Дальше →' : 'Результаты 🏆';
    $('#hardBanner').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  next: function () {
    var s = this.st; if (!s || s.phase !== 'reveal') return;
    AudioFX.click();
    if (s.idx < s.n - 1) { s.idx++; this.renderRound(); return; }
    var metric = { errors: s.errors, rounds: s.n, diff: this.getDifficulty() };
    var stars = Core.starsFor('hard', metric);
    if (s.errors === 0) praise('perfect');
    var lines = ['Ошибки: ' + s.errors + '/' + s.n, 'Режим: ' + Core.DIFF_NAME[this.getDifficulty()]];
    award('hard', stars, lines, metric);
    var self = this;
    KeshaVoice.say('hard.outtro', { fallbackText: Core.OUTRO.hard });
    UI.result.show({ emoji: '🪨', title: s.errors === 0 ? 'Слух как у орла!' : 'Хорошая тренировка!', stars: stars, lines: lines, replay: function () { self.restart(); } });
  }
};
$('#hmHard').addEventListener('click', function () { HardGame.answer(false); });
$('#hmSoft').addEventListener('click', function () { HardGame.answer(true); });
$('#hardRepeat').addEventListener('click', function () { AudioFX.click(); HardGame.say(); });
$('#hardNext').addEventListener('click', function () { HardGame.next(); });
$('#hardRestart').addEventListener('click', function () { AudioFX.click(); HardGame.restart(); });
$('#hardNoticeBtn').addEventListener('click', function () {
  if (AudioFX.muted) AudioFX.toggle();
  if (!S().settings.voice.enabled) Store.dispatch({ type: 'settings/patch', payload: { voice: { enabled: true } } });
  HardGame.notice(); HardGame.say();
});

/* ==================== GAME: syllable paths ==================== */
var SyllGame = {
  id: 'syll', name: Core.GAMES.syll.name, emoji: '👏', color: Core.GAMES.syll.color, skill: Core.GAMES.syll.skill, desc: Core.GAMES.syll.desc,
  artBg: 'linear-gradient(160deg,#FFC99A,#FF9243 55%,#E85D04)', st: null, timers: [],
  art: function () { return '<span class="art-syll"><i></i><i></i><i></i><i></i></span>'; },
  getDifficulty: function () { return S().settings.difficulty.syll; },
  clear: function () { this.timers.forEach(clearTimeout); this.timers = []; },
  later: function (fn, ms) { this.timers.push(setTimeout(fn, ms)); },
  start: function () { this.restart(); this.micNote(); },
  restart: function () {
    this.clear();
    var c = cfg('syll');
    this.st = { cfg: c, rounds: shuffle(Core.SYLL_POOLS[c.pool]).slice(0, 6), idx: 0, phase: 'idle', taps: [], expected: [], perfect: 0, exact: 0, total: 0, tempo: c.tempo };
    $('#syllPerfect').textContent = '0'; UI.praise.breakStreak(); this.startRound(0);
  },
  pause: function () { this.clear(); $('#syllPad').classList.remove('beat'); },
  resume: function () { if (this.st && (this.st.phase === 'listen' || this.st.phase === 'repeat')) this.startRound(this.st.idx); },
  cleanup: function () { this.clear(); this.st = null; },
  micNote: function () { $('#syllMicState').textContent = Mic.enabled ? 'ловим слоги ✅' : 'микрофон выкл'; },
  dots: function () {
    var s = this.st, box = $('#syllDots'); box.innerHTML = '';
    s.rounds.forEach(function (_, i) { var d = document.createElement('i'); if (i < s.idx) d.className = 'done'; else if (i === s.idx) d.className = 'cur'; box.appendChild(d); });
    $('#syllRoundLabel').textContent = Math.min(s.idx + 1, 6) + '/6';
  },
  startRound: function (i) {
    var s = this.st, self = this;
    this.clear(); s.idx = i; s.taps = []; s.expected = []; s.phase = 'listen';
    s.tempo = Math.max(380, s.cfg.tempo - s.cfg.accel * i);
    var word = s.rounds[i], parts = word.w.split('-'); s.parts = parts;
    $('#syllWordEm').textContent = word.em; $('#syllWordText').textContent = word.w;
    var track = $('#syllTrack'); track.innerHTML = '';
    parts.forEach(function (p) { var d = document.createElement('div'); d.className = 'stone'; d.textContent = p; track.appendChild(d); });
    var ph = $('#syllPhase'); ph.textContent = 'Слушай… 👂'; ph.className = 'rPhase listen';
    $('#syllMsg').textContent = 'Кеша хлопает: ' + word.w + '. Темп ' + s.tempo + ' мс.';
    $('#syllPad').classList.add('locked'); this.dots();
    var stones = $$('#syllTrack .stone');
    parts.forEach(function (_, k) {
      self.later(function () {
        AudioFX.clap();
        var st = stones[k]; st.classList.add('clap', 'wave');
        var p = $('#syllParrot'); p.classList.add('hit');
        self.later(function () { st.classList.remove('clap', 'wave'); p.classList.remove('hit'); }, 260);
        if (k === parts.length - 1) self.later(function () { self.beginRepeat(); }, s.tempo);
      }, 600 + k * s.tempo);
    });
  },
  beginRepeat: function () {
    var s = this.st, self = this;
    s.phase = 'repeat'; s.taps = [];
    var ph = $('#syllPhase'); ph.textContent = 'Твоя очередь! 👏'; ph.className = 'rPhase go';
    $('#syllMsg').textContent = 'Хлопай в такт: пробел, кнопка или голосом 🎤';
    $('#syllPad').classList.remove('locked');
    var t0 = Adapters.perf() + s.tempo;
    s.expected = s.parts.map(function (_, k) { return t0 + k * s.tempo; });
    var pad = $('#syllPad');
    s.expected.forEach(function (tm) {
      self.later(function () {
        if (s.phase !== 'repeat') return;
        AudioFX.tick(); pad.classList.add('beat'); self.later(function () { pad.classList.remove('beat'); }, 200);
      }, Math.max(0, tm - Adapters.perf()));
    });
    this.later(function () {
      if (s.phase !== 'repeat') return;
      var stones = $$('#syllTrack .stone');
      while (s.taps.length < s.parts.length) { stones[s.taps.length].classList.add('mid', 'wave'); s.taps.push(false); }
      self.completeRound();
    }, Math.max(0, s.expected[s.parts.length - 1] - Adapters.perf()) + s.tempo * 1.6);
  },
  tap: function () {
    var s = this.st; if (!s || s.phase !== 'repeat' || s.taps.length >= s.parts.length) return;
    var self = this, k = s.taps.length, ok = Math.abs(Adapters.perf() - s.expected[k]) <= 120;
    s.taps.push(ok);
    var st = $$('#syllTrack .stone')[k]; st.classList.add(ok ? 'ok' : 'mid', 'wave');
    AudioFX.clap(); buzz(10);
    var pad = $('#syllPad'); pad.classList.add('flash'); this.later(function () { pad.classList.remove('flash'); }, 180);
    if (s.taps.length === s.parts.length) this.later(function () { self.completeRound(); }, 260);
  },
  completeRound: function () {
    var s = this.st; if (s.phase !== 'repeat') return;
    var self = this;
    s.phase = 'done'; this.clear(); $('#syllPad').classList.add('locked');
    var allOk = s.taps.every(Boolean);
    s.exact += s.taps.filter(Boolean).length; s.total += s.taps.length;
    if (allOk) {
      s.perfect++; $('#syllPerfect').textContent = s.perfect; AudioFX.collect();
      $('#syllPhase').textContent = 'Точно в такт! 🎯'; $('#syllPhase').className = 'rPhase go';
      praise(UI.praise.hit() ? 'streak' : 'round');
    } else {
      AudioFX.chime(); UI.praise.breakStreak();
      $('#syllPhase').textContent = 'Хорошо! Жёлтые — чуть мимо такта'; $('#syllPhase').className = 'rPhase listen';
      praise('round', { text: 'Хорошо! Ещё точнее 🎯' });
    }
    this.later(function () {
      if (s.idx < 5) self.startRound(s.idx + 1);
      else {
        var metric = { perfect: s.perfect, exact: s.exact, total: s.total };
        var stars = Core.starsFor('syll', metric);
        if (s.perfect === 6) praise('perfect');
        var pct = Math.round(s.exact / Math.max(1, s.total) * 100);
        var lines = ['Слов: 6/6', 'Точных хлопков: ' + s.exact + '/' + s.total + ' (' + pct + '%)', 'Идеальных слов: ' + s.perfect + '/6'];
        award('syll', stars, lines, metric);
        KeshaVoice.say('syll.outtro', { fallbackText: Core.OUTRO.syll });
        UI.result.show({ emoji: '👏', title: 'Дорожка пройдена!', stars: stars, lines: lines, replay: function () { self.restart(); } });
      }
    }, 950);
  },
  update: function () { var s = this.st; if (s && s.phase === 'repeat' && Mic.enabled && Mic.onset) this.tap(); }
};
$('#syllPad').addEventListener('pointerdown', function (e) { e.preventDefault(); SyllGame.tap(); });
$('#syllRestart').addEventListener('click', function () { AudioFX.click(); SyllGame.restart(); });

/* ==================== GAME: math ==================== */
var MathGame = {
  id: 'math', name: Core.GAMES.math.name, emoji: '🐛', color: Core.GAMES.math.color, skill: Core.GAMES.math.skill, desc: Core.GAMES.math.desc,
  artBg: 'linear-gradient(160deg,#9FE3C4,#38B87C 55%,#0C8A5A)', st: null, _t: null,
  art: function () { return '<span class="art-math"><span class="row"><span>🍎</span><span>🍎</span><span>🍎</span></span><b>1 2 3</b></span>'; },
  getDifficulty: function () { return S().settings.difficulty.math; },
  start: function () { this.restart(); },
  restart: function () {
    clearTimeout(this._t); KeshaVoice.stop();
    var c = cfg('math'), mode = S().settings.mathMode, base = (Adapters.now() % 100000) | 0, rounds = [];
    for (var i = 0; i < c.n; i++) rounds.push(Core.generateMathRound(mode, this.getDifficulty(), base + i * 977 + 13));
    this.st = { cfg: c, rounds: rounds, idx: 0, errors: 0, phase: 'ask', n: rounds.length, firstTry: 0, wrongThis: 0 };
    $('#mathErr').textContent = '0'; UI.praise.breakStreak(); this.syncMode(); this.renderRound();
  },
  syncMode: function () {
    var easy = this.getDifficulty() === 'easy', sel = $('#mathMode');
    Array.prototype.forEach.call(sel.options, function (o) { o.disabled = easy && (o.value === 'pattern' || o.value === 'shape'); });
    if (easy && (sel.value === 'pattern' || sel.value === 'shape')) {
      sel.value = 'mix'; Store.dispatch({ type: 'settings/patch', payload: { mathMode: 'mix' } });
    }
    sel.value = S().settings.mathMode;
  },
  pause: function () { clearTimeout(this._t); KeshaVoice.stop(); $('#mathParrot').classList.remove('speaking'); },
  resume: function () { if (this.st && this.st.phase === 'ask') this.say(); },
  cleanup: function () { clearTimeout(this._t); KeshaVoice.stop(); this.st = null; },
  dots: function () {
    var s = this.st, box = $('#mathDots'); box.innerHTML = '';
    s.rounds.forEach(function (_, i) { var d = document.createElement('i'); if (i < s.idx) d.className = 'done'; else if (i === s.idx) d.className = 'cur'; box.appendChild(d); });
    $('#mathRoundLabel').textContent = Math.min(s.idx + 1, s.n) + '/' + s.n;
  },
  renderRound: function () {
    var s = this.st, self = this, r = s.rounds[s.idx];
    s.phase = 'ask'; s.wrongThis = 0;
    $('#mathIcon').textContent = r.icon; $('#mathPrompt').textContent = r.prompt;
    $('#mathFeedback').textContent = ''; $('#mathOptions').classList.remove('locked');
    var stage = $('#mathStage'); stage.innerHTML = '';
    if (r.mode === 'count') {
      var box = document.createElement('div'); box.className = 'mathItems';
      r.items.forEach(function (e, i) { var sp = document.createElement('span'); sp.textContent = e; sp.style.animationDelay = (i * .06) + 's'; box.appendChild(sp); });
      stage.appendChild(box);
    } else if (r.mode === 'compare') {
      var wrap = document.createElement('div'); wrap.className = 'mathClouds';
      r.groups.forEach(function (g) {
        var cl = document.createElement('div'); cl.className = 'mathCloud';
        var html = '<b>' + g.label + '</b>';
        for (var i = 0; i < g.n; i++) html += '<span>' + g.emoji + '</span>';
        cl.innerHTML = html; wrap.appendChild(cl);
      });
      stage.appendChild(wrap);
    } else if (r.mode === 'pattern') {
      var row = document.createElement('div'); row.className = 'mathRow';
      r.sequence.forEach(function (e) { var sp = document.createElement('span'); sp.textContent = e; row.appendChild(sp); });
      var miss = document.createElement('div'); miss.className = 'miss'; miss.textContent = '?'; row.appendChild(miss);
      stage.appendChild(row);
    } else {
      var sm = document.createElement('div'); sm.className = 'mathSample';
      sm.innerHTML = '<small>Такой же:</small><span style="font-size:' + (r.sample.big ? 54 : 34) + 'px;line-height:1">' + r.sample.emoji + '</span>';
      stage.appendChild(sm);
    }
    var opts = $('#mathOptions'); opts.innerHTML = '';
    r.options.forEach(function (o, i) {
      var b = document.createElement('button'); b.className = 'mathOpt'; b.dataset.i = i;
      if (o.emoji) b.innerHTML = '<span class="em" style="font-size:' + (o.big === undefined ? 38 : (o.big ? 46 : 28)) + 'px">' + o.emoji + '</span><small>' + (i + 1) + '</small>';
      else b.innerHTML = esc(o.label) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '<small>' + (i + 1) + '</small>');
      b.addEventListener('click', function () { self.answer(i, b); });
      opts.appendChild(b);
    });
    this.dots();
    this._t = setTimeout(function () { self.say(); }, 400);
  },
  say: function () {
    var s = this.st; if (!s || s.phase !== 'ask') return;
    var r = s.rounds[s.idx], p = $('#mathParrot');
    if (!S().settings.voice.enabled || AudioFX.muted || !Adapters.speech()) { $('#mathFeedback').textContent = '🔇 Включи звук, чтобы услышать вопрос'; return; }
    p.classList.add('speaking');
    KeshaVoice.sayText(r.speak, { rate: s.cfg.rate, onEnd: function () { p.classList.remove('speaking'); } });
    setTimeout(function () { p.classList.remove('speaking'); }, 1600);
  },
  answer: function (i, btn) {
    var s = this.st; if (!s || s.phase !== 'ask') return;
    var self = this;
    AudioFX.click();
    btn.style.transform = 'scale(.94)'; setTimeout(function () { btn.style.transform = ''; }, 160);
    var r = s.rounds[s.idx];
    if (i === r.correctIndex) {
      s.phase = 'reveal'; $('#mathOptions').classList.add('locked'); btn.classList.add('right');
      AudioFX.collect();
      var b = btn.getBoundingClientRect(); UI.confetti.burst(b.left + b.width / 2, b.top + b.height / 2, 18);
      if (s.wrongThis === 0) s.firstTry++;
      praise(UI.praise.hit() ? 'streak' : 'round');
      $('#mathFeedback').textContent = 'Верно! ✅';
      this._t = setTimeout(function () {
        if (s.idx < s.n - 1) { s.idx++; self.renderRound(); } else self.finish();
      }, 1000);
    } else {
      s.errors++; s.wrongThis++; $('#mathErr').textContent = s.errors;
      btn.classList.remove('wrong'); void btn.offsetWidth; btn.classList.add('wrong');
      AudioFX.wrong(); UI.mascot.pose('sad'); UI.praise.breakStreak();
      $('#mathFeedback').textContent = 'Попробуй ещё 🪶';
      KeshaVoice.sayText('Попробуй ещё', { rate: s.cfg.rate });
    }
  },
  finish: function () {
    var s = this.st, metric = { errors: s.errors, rounds: s.n, firstTry: s.firstTry, diff: this.getDifficulty() };
    var stars = Core.starsFor('math', metric);
    if (s.errors === 0) praise('perfect');
    var lines = ['Раундов: ' + s.n, 'Ошибок: ' + s.errors, 'С первого раза: ' + s.firstTry + '/' + s.n, 'Уровень: ' + Core.DIFF_NAME[this.getDifficulty()]];
    award('math', stars, lines, metric);
    var self = this;
    KeshaVoice.say('math.outtro', { fallbackText: Core.OUTRO.math });
    UI.result.show({ emoji: '🐛', title: s.errors === 0 ? 'Гусеница гордится!' : 'Отличный счёт!', stars: stars, lines: lines, replay: function () { self.restart(); } });
  }
};
$('#mathRepeat').addEventListener('click', function () { AudioFX.click(); MathGame.say(); });
$('#mathRestart').addEventListener('click', function () { AudioFX.click(); MathGame.restart(); });
$('#mathMode').addEventListener('change', function (e) {
  Store.dispatch({ type: 'settings/patch', payload: { mathMode: e.target.value } });
  AudioFX.click(); MathGame.restart();
});

/* ==================== GameRegistry: one interface for all games ==================== */
var GameRegistry = {
  ship: ShipGame, odd: OddGame, balloon: BalloonGame, rhythm: RhythmGame, hard: HardGame, syll: SyllGame, math: MathGame,
  list: function () { var self = this; return Core.GAME_KEYS.map(function (k) { return self[k]; }); },
  get: function (id) { return this[id] || null; }
};
// app.js — часть 3/3 (Cabinet · Settings · wiring · loop · boot)
/* ==================== Cabinet: 9 tabs ==================== */
var Cabinet = {
  unlocked: false, idle: 0, weekOffset: 0, reminderShown: false,
  filters: { q: '', pid: 'all', sort: 'date-desc', games: [], from: '', to: '', stars: 0 },
  prog: { pid: 'all', metric: 'stars', period: '30' },

  open: function () {
    if (S().settings.access.pinHash && !this.unlocked) { UI.pin.open(); return; }
    Screens.go('cabinet');
    KeshaVoice.say('nav.cabinet', { fallbackText: 'Открываю кабинет специалиста.' });
  },
  renderAll: function () {
    this.renderSession(); this.renderRecent(); this.renderSchedule(); this.renderKids();
    this.renderJournal(); this.renderProgress(); this.renderGoals(); this.renderAchievements();
    this.renderSettings(); this.renderMethod(); this.reminder();
  },
  reminder: function () {
    if (this.reminderShown) return;
    var today = isoDay(Adapters.now()), self = this;
    var ap = S().schedule.filter(function (a) { return a.date === today && !a.done; })
      .sort(function (a, b) { return a.start.localeCompare(b.start); })[0];
    if (!ap) return;
    this.reminderShown = true;
    var p = childById(ap.pid) || { name: 'ребёнка' };
    UI.toast('Сегодня занятие у ' + p.name + ' в ' + ap.start, {
      label: 'Открыть', fn: function () { self.weekOffset = 0; self.renderSchedule(); $('#cab-schedule').scrollIntoView({ behavior: 'smooth' }); }
    });
  },

  /* ---- tab 1: session ---- */
  renderSession: function () {
    var host = $('#sessionPanel'), st = S(), s = st.session, self = this;
    if (!st.profiles.length) { host.innerHTML = '<div class="sessMeta">Сначала добавьте ребёнка во вкладке «Дети» 👧</div>'; return; }
    if (!s) {
      host.innerHTML = '<div class="sessGrid"><div style="flex:1 1 250px"><div style="font-family:var(--disp);font-size:19px;margin-bottom:6px">Занятие не идёт</div>' +
        '<div class="sessMeta">Выберите ребёнка — результаты игр попадут в журнал автоматически.</div></div>' +
        '<select class="inp" id="sessPick" aria-label="Ребёнок">' + st.profiles.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === st.currentPid ? ' selected' : '') + '>' + esc(p.avatar + ' ' + p.name) + '</option>';
        }).join('') + '</select><button class="btnP green" id="sessStart">▶ Новая сессия</button></div>';
      $('#sessStart').addEventListener('click', function () { UI.startSession($('#sessPick').value); });
      return;
    }
    var p = childById(s.pid), stars = Core.sessionStars(s), age = Core.ageFromBirth(p.birthDate, 5, Adapters.now());
    host.innerHTML = '<div class="sessGrid"><div><div class="sessTimer" id="sessTimerLive">' + UI.sessionFmt(UI.sessionElapsed()) + '</div>' +
      '<div class="sessMeta">' + (s.pausedAt ? 'на паузе ⏸' : 'идёт занятие') + '</div></div>' +
      '<div style="flex:1 1 220px"><div style="font-family:var(--disp);font-size:19px">' + esc(p.avatar + ' ' + p.name) + ', ' + age + ' ' + plural(age, ['год', 'года', 'лет']) + '</div>' +
      '<div class="sessMeta">Игр: ' + s.entries.length + ' • ⭐ ' + stars + ' • похвал: ' + (p.praises || 0) + '</div>' +
      '<div class="sessEntries">' + (s.entries.length ? s.entries.map(function (e) {
        return '<span class="entryPill">' + Core.GAMES[e.game].emoji + ' ' + Core.GAMES[e.game].name + ' <b>' + '★'.repeat(e.stars) + '</b></span>';
      }).join('') : '<span class="sessMeta">Пока пусто — сыграйте в игру 🎮</span>') + '</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btnG small" id="sessPause">' + (s.pausedAt ? '▶ Продолжить' : '⏸ Пауза занятия') + '</button>' +
      '<button class="btnP green small" id="sessFinish">✅ Завершить</button>' +
      '<button class="btnG danger small" id="sessCancel">Отменить</button></div>' +
      '<div class="field sessNote"><label for="sessNote">📝 Заметка к сессии</label><textarea class="inp" id="sessNote" placeholder="Наблюдения по ходу занятия…">' + esc(s.note || '') + '</textarea></div></div>';
    $('#sessPause').addEventListener('click', function () {
      Store.dispatch({ type: 'session/pause' });
      UI.refreshHeader(); self.renderSession();
      UI.toast(S().session.pausedAt ? 'Занятие на паузе ⏸' : 'Занятие продолжается ▶');
    });
    $('#sessFinish').addEventListener('click', function () { UI.finishSession(); });
    $('#sessNote').addEventListener('input', function (e) { Store.dispatch({ type: 'session/note', payload: e.target.value }); });
    var armed = false;
    $('#sessCancel').addEventListener('click', function (e) {
      if (!armed) { armed = true; e.target.textContent = 'Точно отменить?'; setTimeout(function () { armed = false; var b = $('#sessCancel'); if (b) b.textContent = 'Отменить'; }, 3000); }
      else { Store.dispatch({ type: 'session/cancel' }); UI.refreshHeader(); self.renderAll(); UI.toast('Занятие отменено'); }
    });
  },
  renderRecent: function () {
    var host = $('#recentSessions'), self = this;
    var list = S().sessions.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 3);
    if (!list.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div style="width:100%;font-family:var(--disp);font-size:15px;color:var(--text)">Последние 3 занятия</div>' +
      list.map(function (s) {
        var p = childById(s.pid) || { name: '—', avatar: '❔' };
        return '<div class="recentCard"><h4>' + p.avatar + ' ' + esc(p.name) + ' • ' + new Date(s.date).toLocaleDateString('ru-RU') + '</h4>' +
          '<p>' + s.minutes + ' мин • ⭐ ' + Core.sessionStars(s) + ' • ' + s.entries.length + ' игр<br>' + esc((s.note || '').slice(0, 70) || 'Без заметки') + '</p>' +
          '<button class="btnG small" data-open="' + s.id + '">Открыть</button></div>';
      }).join('');
    host.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { self.sessionDetail(S().sessions.filter(function (x) { return x.id === b.dataset.open; })[0]); });
    });
  },

  /* ---- tab 2: schedule ---- */
  weekStart: function (offset) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd + offset * 7);
    return d;
  },
  renderSchedule: function () {
    var ws = this.weekStart(this.weekOffset), days = [], i, self = this;
    for (i = 0; i < 7; i++) { var d = new Date(ws); d.setDate(ws.getDate() + i); days.push(d); }
    $('#schedLabel').textContent = days[0].toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) + ' — ' + days[6].toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    var today = isoDay(Adapters.now()), grid = $('#schedGrid');
    grid.innerHTML = '<div class="hh"></div>' + days.map(function (d) {
      return '<div class="hh' + (isoDay(d) === today ? ' today' : '') + '">' + d.toLocaleDateString('ru-RU', { weekday: 'short' }) + '<br>' + d.getDate() + '</div>';
    }).join('');
    for (var h = 9; h < 18; h++) {
      for (var m = 0; m < 60; m += 30) {
        var start = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        grid.insertAdjacentHTML('beforeend', '<div class="tt">' + start + '</div>');
        days.forEach(function (d) {
          var iso = isoDay(d);
          var ap = S().schedule.filter(function (a) { return a.date === iso && a.start === start; })[0];
          var b = document.createElement('button');
          b.className = 'slot' + (ap ? ' busy' : '') + (ap && ap.done ? ' done' : '');
          if (ap) {
            var p = childById(ap.pid) || { name: '?', avatar: '❔', color: '#0E7DC2' };
            b.style.setProperty('--kc', p.color);
            b.innerHTML = '<span>' + p.avatar + ' ' + esc(p.name) + '</span><span>' + ap.duration + 'м' + (ap.done ? ' ✅' : '') + '</span>';
            b.addEventListener('click', function () { self.appointmentDrawer(ap); });
          } else {
            b.textContent = '＋';
            b.addEventListener('click', function () { self.appointmentDrawer(null, iso, start); });
          }
          grid.appendChild(b);
        });
      }
    }
    var list = $('#schedList'); list.innerHTML = '';
    days.forEach(function (d) {
      var iso = isoDay(d), items = S().schedule.filter(function (a) { return a.date === iso; }).sort(function (a, b) { return a.start.localeCompare(b.start); });
      var card = document.createElement('div'); card.className = 'schedDay';
      card.innerHTML = '<h4>' + d.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' }) + (iso === today ? ' • сегодня' : '') + '</h4>' +
        (items.length ? items.map(function (a) {
          var p = childById(a.pid) || { name: '?', avatar: '❔', color: '#0E7DC2' };
          return '<div class="schedItem" style="--kc:' + p.color + '"><b>' + a.start + '</b> ' + p.avatar + ' ' + esc(p.name) + ' • ' + a.duration + ' мин ' + (a.done ? '✅' : '') +
            '<button class="btnG small" data-ap="' + a.id + '" style="margin-left:auto">Открыть</button></div>';
        }).join('') : '<div class="sessMeta">Записей нет</div>') +
        '<button class="btnG small" data-add="' + iso + '" style="margin-top:8px">＋ Записать</button>';
      list.appendChild(card);
    });
    list.querySelectorAll('[data-ap]').forEach(function (b) {
      b.addEventListener('click', function () { self.appointmentDrawer(S().schedule.filter(function (a) { return a.id === b.dataset.ap; })[0]); });
    });
    list.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { self.appointmentDrawer(null, b.dataset.add, '10:00'); });
    });
  },
  appointmentDrawer: function (ap, date, start) {
    var st = S(), self = this;
    if (!st.profiles.length) { UI.toast('Сначала добавьте ребёнка 👧'); return; }
    var isNew = !ap;
    var data = ap ? Object.assign({}, ap) : { pid: st.currentPid || st.profiles[0].id, date: date || isoDay(Adapters.now()), start: start || '10:00', duration: 30, note: '', done: false };
    var times = '';
    for (var h = 9; h < 18; h++) for (var m = 0; m < 60; m += 30) {
      var t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      times += '<option' + (t === data.start ? ' selected' : '') + '>' + t + '</option>';
    }
    UI.drawer.open(isNew ? 'Записать ребёнка' : 'Запись занятия',
      '<p class="lead">Расписание хранится локально. Отметка «проведено» создаёт запись в журнале.</p>' +
      '<div class="field"><label for="apPid">Ребёнок</label><select class="inp" id="apPid">' + st.profiles.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === data.pid ? ' selected' : '') + '>' + esc(p.avatar + ' ' + p.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="apDate">Дата</label><input class="inp" id="apDate" type="date" value="' + data.date + '"></div>' +
      '<div class="field"><label for="apStart">Время</label><select class="inp" id="apStart">' + times + '</select></div>' +
      '<div class="field"><label for="apDur">Длительность: <span id="apDurVal">' + data.duration + '</span> мин</label><input type="range" id="apDur" min="15" max="90" step="15" value="' + data.duration + '" style="width:100%"></div>' +
      '<div class="field"><label for="apNote">Заметка</label><textarea class="inp" id="apNote" placeholder="Тема занятия…">' + esc(data.note) + '</textarea></div>' +
      '<div class="dActions"><button class="btnP green" id="apSave">💾 Сохранить</button>' +
      (isNew ? '' : '<button class="btnP sky" id="apDone">✅ Проведено</button><button class="btnG danger" id="apDel">🗑 Удалить</button>') +
      '<button class="btnG" id="apCancel">Отмена</button></div>',
      function () {
        $('#apDur').addEventListener('input', function (e) { $('#apDurVal').textContent = e.target.value; });
        $('#apCancel').addEventListener('click', function () { UI.drawer.close(); });
        $('#apSave').addEventListener('click', function () {
          var rec = { pid: $('#apPid').value, date: $('#apDate').value, start: $('#apStart').value, duration: +$('#apDur').value, note: $('#apNote').value.trim(), done: data.done };
          if (isNew) Store.dispatch({ type: 'schedule/add', payload: Object.assign({ id: uid() }, rec) });
          else Store.dispatch({ type: 'schedule/update', payload: { id: ap.id, patch: rec } });
          UI.drawer.close(); self.renderSchedule(); AudioFX.success(); UI.toast('Запись сохранена 🗓');
        });
        if (!isNew) {
          $('#apDone').addEventListener('click', function () {
            Store.dispatch({ type: 'schedule/update', payload: { id: ap.id, patch: { done: true } } });
            Store.dispatch({ type: 'sessions/add', payload: { id: uid(), pid: ap.pid, date: new Date(ap.date + 'T' + ap.start + ':00').toISOString(), minutes: ap.duration, entries: [], note: ap.note || 'Занятие по расписанию' } });
            UI.drawer.close(); self.renderAll();
            UI.toast('Отмечено проведённым ✅ Запись добавлена в журнал');
            praise('round', { text: 'Занятие проведено!' });
          });
          $('#apDel').addEventListener('click', function () {
            var i = S().schedule.indexOf(ap);
            Store.dispatch({ type: 'schedule/remove', payload: ap.id });
            UI.drawer.close(); self.renderSchedule();
            UI.toast('Запись удалена', { label: 'Отменить', fn: function () { Store.dispatch({ type: 'schedule/restore', payload: { index: i, item: ap } }); self.renderSchedule(); UI.toast('Восстановлено ✅'); } });
          });
        }
      });
  },

  /* ---- tab 3: kids ---- */
  renderKids: function () {
    var grid = $('#kidGrid'), st = S(), self = this, now = Adapters.now();
    grid.innerHTML = '';
    st.profiles.forEach(function (p, idx) {
      var age = Core.ageFromBirth(p.birthDate, 5, now);
      var days = Core.lastVisitDays(st, p.id, now);
      var last = days === null ? 'ещё не занимался(ась)' : days <= 0 ? 'был(а) сегодня' : days === 1 ? 'был(а) вчера' : 'был(а) ' + days + ' ' + plural(days, ['день', 'дня', 'дней']) + ' назад';
      var pts = Core.sparkPoints(st, p.id, 5);
      var spark = pts.length < 2
        ? '<svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true"><line x1="4" y1="12" x2="76" y2="12" stroke="#C9B896" stroke-width="2" stroke-dasharray="4 4"/></svg>'
        : '<svg width="80" height="24" viewBox="0 0 80 24" aria-label="Прогресс за ' + pts.length + ' занятий"><polyline points="' + pts.map(function (q) { return q.x + ',' + q.y; }).join(' ') + '" fill="none" stroke="' + esc(p.color) + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
          pts.map(function (q, i) { return '<circle cx="' + q.x + '" cy="' + q.y + '" r="' + (i === pts.length - 1 ? 3 : 2) + '" fill="' + (i === pts.length - 1 ? '#FFC53D' : esc(p.color)) + '"/>'; }).join('') + '</svg>';
      var last4 = p.achievements.slice(-4).reverse(), more = p.achievements.length - last4.length;
      var fav = Achievements.byId(p.favoriteReward);
      var d = document.createElement('div');
      d.className = 'kidCard' + (p.id === st.currentPid ? ' current' : '');
      d.style.setProperty('--kc', p.color); d.style.animationDelay = (idx * .04) + 's';
      d.innerHTML = (p.id === st.currentPid ? '<span class="curBadge">сейчас играет</span>' : '') +
        '<div class="kidTop"><div class="kidAva">' + p.avatar + '</div><div><h3>' + esc(p.name) +
        (p.homework ? '<span title="Домашнее задание: ' + esc(p.homework) + '">📝</span>' : '') +
        (fav ? '<span class="favEm" title="Любимая награда: ' + esc(fav.name) + '">' + fav.emoji + '</span>' : '') +
        '</h3><span>' + age + ' ' + plural(age, ['год', 'года', 'лет']) + (p.birthDate ? ' • ' + new Date(p.birthDate).toLocaleDateString('ru-RU') : '') + '</span></div></div>' +
        '<div class="kidLast">🕐 ' + last + '</div>' +
        '<div class="kidSpark">' + spark + '<small>звёзды за 5 занятий</small></div>' +
        '<div class="badges">' + (p.targetSounds.length ? p.targetSounds.map(function (s) { return '<b>[' + esc(s) + ']</b>'; }).join('') : '<b style="background:#9E8A66">звуки не выбраны</b>') +
        (p.streak.current >= 3 ? '<b class="fire">🔥 серия ' + p.streak.current + '</b>' : '') +
        '<b class="praise">🦜 ' + (p.praises || 0) + ' похвал</b></div>' +
        '<button class="kidAch" data-ach="1"><span class="ttl">🏆 Достижения</span>' +
        (last4.length ? last4.map(function (id) { var a = Achievements.byId(id); return a ? '<span class="mini" title="' + esc(a.name) + '">' + a.emoji + '</span>' : ''; }).join('') : '<span class="more">пока нет наград</span>') +
        (more > 0 ? '<span class="more">+ ещё ' + more + '</span>' : '') + '</button>' +
        '<p class="kidNote">' + esc(p.specialistNote || 'Заметок пока нет.') + '</p>' +
        '<div class="kidStars">⭐ ' + Core.bankTotal(p) + '/21 • ' + p.achievements.length + ' наград</div>' +
        '<div class="kidBtns"><button class="btnP small green" data-act="session">▶ Занятие</button>' +
        '<button class="btnG small" data-act="edit">✏ Ред.</button>' +
        '<button class="btnG small" data-act="chart">📊 Прогресс</button></div>';
      d.querySelector('[data-ach]').addEventListener('click', function () {
        self.switchChild(p, function () { $('#achChild').value = p.id; self.renderAchievements(); $('#cab-ach').scrollIntoView({ behavior: 'smooth' }); });
      });
      d.querySelector('[data-act=session]').addEventListener('click', function () {
        if (S().session) { UI.toast('Сначала завершите текущее занятие ⏱'); return; }
        self.switchChild(p, function () { UI.startSession(p.id); });
      });
      d.querySelector('[data-act=edit]').addEventListener('click', function () { self.profileForm(p); });
      d.querySelector('[data-act=chart]').addEventListener('click', function () {
        self.switchChild(p, function () { self.prog.pid = p.id; self.renderProgress(); $('#cab-progress').scrollIntoView({ behavior: 'smooth' }); });
      });
      grid.appendChild(d);
    });
    var add = document.createElement('button'); add.className = 'addCard'; add.innerHTML = '<b>＋</b>Добавить ребёнка';
    add.addEventListener('click', function () { self.profileForm(null); });
    grid.appendChild(add);
  },
  switchChild: function (p, after) {
    if (S().currentPid === p.id) { if (after) after(); return; }
    var targets = [$('#gameGrid'), $('#kidGrid'), $('#shelfRow'), $('#childChip')], self = this;
    targets.forEach(function (t) { if (t) t.classList.add('switching'); });
    setTimeout(function () {
      Store.dispatch({ type: 'child/select', payload: p.id });
      UI.refreshHeader(); UI.renderGrid(); self.renderAll();
      targets.forEach(function (t) { if (t) t.classList.remove('switching'); });
      AudioFX.chime(); UI.toast('Играем за ' + p.name);
      KeshaVoice.say('welcome.back', { fallbackText: 'Привет, ' + p.name + '!' });
      praise('round', { text: 'Привет, ' + p.name + '!' });
      if (after) after();
    }, 200);
  },
  profileForm: function (p) {
    var isNew = !p, self = this, now = Adapters.now();
    var data = p ? Object.assign({}, p, { targetSounds: p.targetSounds.slice() })
      : { name: '', birthDate: '', avatar: '🦜', targetSounds: [], specialistNote: '', homework: '', favoriteReward: null, color: '#FF7A1A' };
    if (!data.birthDate && p) data.birthDate = isoDay(now - Core.ageFromBirth(null, 5, now) * YEAR_MS);
    UI.drawer.open(isNew ? 'Новый ребёнок' : 'Профиль: ' + p.name,
      '<p class="lead">Данные хранятся только в этом браузере.</p>' +
      '<div class="field"><label for="pName">Имя *</label><input class="inp" id="pName" type="text" maxlength="20" value="' + esc(data.name) + '" placeholder="Например, Мила"></div>' +
      '<div class="field"><label for="pBirth">Дата рождения → возраст: <span id="pAgeVal">' + (data.birthDate ? Core.ageFromBirth(data.birthDate, 5, now) : '—') + '</span></label><input class="inp" id="pBirth" type="date" max="' + isoDay(now) + '" value="' + esc(data.birthDate || '') + '"></div>' +
      '<div class="field"><label>Аватар (16 вариантов)</label><div class="pickRow" id="pAva">' + Core.AVATARS.map(function (a) { return '<button class="pick' + (a === data.avatar ? ' on' : '') + '" data-a="' + a + '">' + a + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label>Цвет карточки</label><div class="pickRow" id="pColor">' + Core.COLORS.map(function (c) { return '<button class="pick' + (c === data.color ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="цвет ' + c + '"></button>'; }).join('') + '</div></div>' +
      '<div class="field"><label>Целевые звуки</label><div class="pickRow" id="pSnd"></div>' +
      '<div id="pCustomWrap" hidden style="margin-top:8px;display:flex;gap:8px"><input class="inp" id="pCustom" type="text" maxlength="3" placeholder="свой звук" style="flex:1"><button class="btnP small" id="pCustomAdd">＋</button></div></div>' +
      '<div class="field"><label for="pHw">📝 Домашнее задание</label><textarea class="inp" id="pHw" maxlength="240" placeholder="Что делать дома между занятиями…">' + esc(data.homework || '') + '</textarea></div>' +
      '<div class="field"><label>Любимая награда 👑</label><div class="pickRow" id="pFav">' + Achievements.catalog.map(function (a) { return '<button class="pick' + (a.id === data.favoriteReward ? ' on' : '') + '" data-f="' + a.id + '" title="' + esc(a.name) + '">' + a.emoji + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="pNote">Заметка специалиста</label><textarea class="inp" id="pNote" maxlength="240" placeholder="Над чем работаем, что хвалить…">' + esc(data.specialistNote) + '</textarea></div>' +
      '<p class="err" id="pErr"></p>' +
      '<div class="dActions"><button class="btnP" id="pSave">💾 Сохранить</button>' +
      (isNew ? '' : '<button class="btnP berry" id="pGift">🎁 Подарить достижение</button><button class="btnG" id="pExport">📦 Экспорт профиля</button><button class="btnG danger" id="pDel">🗑 Удалить</button>') +
      '<button class="btnG" id="pCancel">Отмена</button></div>',
      function () {
        var avatar = data.avatar, color = data.color, fav = data.favoriteReward, sounds = data.targetSounds.slice();
        function renderSnd() {
          var box = $('#pSnd'); box.innerHTML = '';
          Core.SOUNDS.concat(sounds.filter(function (s) { return Core.SOUNDS.indexOf(s) < 0; })).forEach(function (s) {
            var b = document.createElement('button');
            b.className = 'pickS' + (sounds.indexOf(s) >= 0 ? ' on' : ''); b.textContent = '[' + s + ']';
            b.addEventListener('click', function () {
              sounds = sounds.indexOf(s) >= 0 ? sounds.filter(function (x) { return x !== s; }) : sounds.concat([s]);
              AudioFX.click(); renderSnd();
            });
            box.appendChild(b);
          });
          var add = document.createElement('button'); add.className = 'pickS add'; add.textContent = '＋ свой';
          add.addEventListener('click', function () { $('#pCustomWrap').hidden = false; $('#pCustom').focus(); });
          box.appendChild(add);
        }
        renderSnd();
        $('#pCustomAdd').addEventListener('click', function () {
          var v = $('#pCustom').value.trim().toUpperCase().slice(0, 3);
          if (v && sounds.indexOf(v) < 0) { sounds.push(v); renderSnd(); AudioFX.click(); }
          $('#pCustom').value = ''; $('#pCustomWrap').hidden = true;
        });
        $('#pCustom').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#pCustomAdd').click(); } });
        $('#pBirth').addEventListener('change', function (e) { $('#pAgeVal').textContent = e.target.value ? Core.ageFromBirth(e.target.value, 5, Adapters.now()) : '—'; });
        $('#pAva').addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b) return; avatar = b.dataset.a; $$('#pAva .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); AudioFX.click(); });
        $('#pColor').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#pColor .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); AudioFX.click(); });
        $('#pFav').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (!b) return; fav = fav === b.dataset.f ? null : b.dataset.f; $$('#pFav .pick').forEach(function (x) { x.classList.toggle('on', x.dataset.f === fav); }); AudioFX.click(); });
        $('#pCancel').addEventListener('click', function () { UI.drawer.close(); });
        $('#pSave').addEventListener('click', function () {
          var name = $('#pName').value.trim();
          if (name.length < 2) { $('#pErr').textContent = 'Введите имя (минимум 2 буквы)'; $('#pName').focus(); return; }
          var patch = {
            name: name, birthDate: $('#pBirth').value || null, avatar: avatar, targetSounds: sounds,
            specialistNote: $('#pNote').value.trim(), homework: $('#pHw').value.trim(), favoriteReward: fav, color: color
          };
          if (isNew) {
            var np = Core.normalizeProfile(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, patch), Adapters.now());
            Store.dispatch({ type: 'child/add', payload: np });
          } else Store.dispatch({ type: 'child/update', payload: { id: p.id, patch: patch } });
          UI.drawer.close(); UI.refreshHeader(); UI.renderGrid(); self.renderAll(); AudioFX.success();
          UI.toast(isNew ? 'Профиль создан: ' + name + ' ' + avatar : 'Профиль обновлён ✅');
        });
        if (!isNew) {
          $('#pGift').addEventListener('click', function () { UI.drawer.close(); self.giftDrawer(p); });
          $('#pExport').addEventListener('click', function () {
            var payload = { profile: p, sessions: S().sessions.filter(function (s) { return s.pid === p.id; }), goals: S().goals.filter(function (g) { return g.pid === p.id; }) };
            UI.download('kesha-' + p.name + '-' + isoDay(Adapters.now()) + '.json', JSON.stringify(payload, null, 2), 'application/json');
            UI.toast('Профиль выгружен 📦');
          });
          $('#pDel').addEventListener('click', function () { UI.drawer.close(); self.deleteProfile(p); });
        }
      });
  },
  giftDrawer: function (p) {
    var self = this;
    UI.drawer.open('Подарить достижение: ' + p.name,
      '<p class="lead">Ручная выдача награды специалистом — с комментарием в истории.</p>' +
      '<div class="field"><label>Достижение</label><div class="pickRow" id="gPick">' + Achievements.catalog.map(function (a) {
        return '<button class="pick' + (p.achievements.indexOf(a.id) >= 0 ? ' on' : '') + '" data-g="' + a.id + '" title="' + esc(a.name) + '">' + a.emoji + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label for="gComment">Комментарий</label><textarea class="inp" id="gComment" placeholder="За старание на занятии…"></textarea></div>' +
      '<div class="dActions"><button class="btnP berry" id="gGive">🎁 Подарить</button><button class="btnG" id="gCancel">Отмена</button></div>',
      function () {
        var sel = null;
        $('#gPick').addEventListener('click', function (e) {
          var b = e.target.closest('[data-g]'); if (!b) return;
          sel = b.dataset.g; $$('#gPick .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); AudioFX.click();
        });
        $('#gCancel').addEventListener('click', function () { UI.drawer.close(); });
        $('#gGive').addEventListener('click', function () {
          if (!sel) { UI.toast('Выберите достижение 🏆'); return; }
          Achievements.grantManual(p.id, sel, $('#gComment').value.trim());
          UI.drawer.close(); UI.refreshHeader(); self.renderAll();
          UI.confetti.feathers(12);
          praise('perfect', { text: p.name + ', награда твоя!' });
        });
      });
  },
  deleteProfile: function (p) {
    var self = this;
    UI.drawer.open('Удалить профиль?',
      '<p class="lead">Профиль «' + esc(p.name) + '», его занятия, цели и записи расписания будут удалены. Можно отменить сразу после удаления.</p>' +
      '<div class="field"><label for="delName">Введи имя «' + esc(p.name) + '» для подтверждения</label><input class="inp" id="delName" type="text" autocomplete="off" placeholder="' + esc(p.name) + '"></div>' +
      '<div class="dActions"><button class="btnP red" id="delGo" disabled>🗑 Удалить</button><button class="btnG" id="delCancel">Отмена</button></div>',
      function () {
        var inp = $('#delName'), go = $('#delGo');
        inp.addEventListener('input', function () { go.disabled = inp.value.trim() !== p.name; });
        $('#delCancel').addEventListener('click', function () { UI.drawer.close(); });
        go.addEventListener('click', function () {
          if (inp.value.trim() !== p.name) return;
          UI.drawer.close();
          var st = S(), idx = st.profiles.indexOf(p);
          var backup = {
            index: idx, profile: p,
            sessions: st.sessions.filter(function (s) { return s.pid === p.id; }),
            goals: st.goals.filter(function (g) { return g.pid === p.id; }),
            schedule: st.schedule.filter(function (a) { return a.pid === p.id; })
          };
          Store.dispatch({ type: 'child/remove', payload: p.id });
          UI.refreshHeader(); UI.renderGrid(); self.renderAll(); AudioFX.wrong(); UI.mascot.pose('sad');
          if (!S().profiles.length) UI.onboard.open();
          UI.toast('Профиль «' + p.name + '» удалён', {
            label: 'Отменить', fn: function () {
              Store.dispatch({ type: 'child/restore', payload: backup });
              UI.onboard.close(); UI.refreshHeader(); UI.renderGrid(); self.renderAll(); UI.toast('Восстановлено ✅');
            }
          });
        });
      });
  },

  /* ---- tab 4: journal ---- */
  renderJournal: function () {
    var st = S(), self = this, f = this.filters;
    var sel = $('#jFilter');
    sel.innerHTML = '<option value="all">Все дети</option>' + st.profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.avatar + ' ' + p.name) + '</option>'; }).join('');
    sel.value = st.profiles.some(function (p) { return p.id === f.pid; }) ? f.pid : 'all'; f.pid = sel.value;
    var chips = $('#jGames'); chips.innerHTML = '';
    Core.GAME_KEYS.forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'fchip' + (f.games.indexOf(k) >= 0 ? ' on' : '');
      b.textContent = Core.GAMES[k].emoji + ' ' + Core.GAMES[k].name;
      b.addEventListener('click', function () {
        f.games = f.games.indexOf(k) >= 0 ? f.games.filter(function (x) { return x !== k; }) : f.games.concat([k]);
        AudioFX.click(); self.renderJournal();
      });
      chips.appendChild(b);
    });
    var cols = st.settings.journalCols, list = Core.filterSessions(st, f, Adapters.now()), host = $('#jList');
    host.innerHTML = '';
    $('#jCount').textContent = list.length + ' из ' + st.sessions.length + ' записей';
    $('#printTitle').textContent = 'Журнал занятий — ' + st.settings.specialist.cabinetName;
    $('#printMeta').textContent = 'Специалист: ' + st.settings.specialist.name + ' • распечатано ' + new Date().toLocaleString('ru-RU') + ' • записей: ' + list.length;
    if (!list.length) { host.innerHTML = '<div class="empty"><b>📒</b>Записей не найдено. Измените фильтры или проведите занятие.</div>'; return; }
    list.forEach(function (s) {
      var p = childById(s.pid) || { name: 'Удалённый профиль', avatar: '❔' }, stars = Core.sessionStars(s), dt = new Date(s.date);
      var row = document.createElement('div'); row.className = 'jRow';
      row.innerHTML = (cols.date ? '<div class="jDate">' + dt.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) + '<small>' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' • ' + s.minutes + ' мин</small></div>' : '') +
        (cols.kid ? '<div class="jKid">' + p.avatar + ' ' + esc(p.name) + '</div>' : '') +
        (cols.games ? '<div class="jGames">' + (s.entries.map(function (e) { return '<span>' + Core.GAMES[e.game].emoji + ' ' + '★'.repeat(e.stars) + '</span>'; }).join('') || '<span>без игр</span>') + '</div>' : '') +
        (cols.stars ? '<div class="jStars">⭐ ' + stars + '</div>' : '') +
        (cols.note ? '<div class="jNote">' + esc(s.note || '') + '</div>' : '') +
        '<div class="jBtns"><button class="iconSm" data-a="open" aria-label="Открыть">👁</button><button class="iconSm del" data-a="del" aria-label="Удалить">🗑</button></div>';
      row.addEventListener('click', function (e) { if (e.target.closest('.jBtns')) return; self.sessionDetail(s); });
      row.querySelector('[data-a=open]').addEventListener('click', function () { self.sessionDetail(s); });
      row.querySelector('[data-a=del]').addEventListener('click', function () {
        var i = S().sessions.indexOf(s);
        Store.dispatch({ type: 'sessions/remove', payload: s.id });
        self.renderAll(); AudioFX.wrong();
        UI.toast('Запись удалена', { label: 'Отменить', fn: function () { Store.dispatch({ type: 'sessions/restore', payload: { index: i, session: s } }); self.renderAll(); UI.toast('Восстановлено ✅'); } });
      });
      host.appendChild(row);
    });
  },
  sessionDetail: function (s) {
    if (!s) return;
    var self = this, p = childById(s.pid) || { name: 'Профиль удалён', avatar: '❔' }, stars = Core.sessionStars(s);
    UI.drawer.open('Занятие • ' + new Date(s.date).toLocaleDateString('ru-RU'),
      '<p class="lead">' + esc(p.avatar + ' ' + p.name) + ' • ' + s.minutes + ' мин • ⭐ ' + stars + '</p>' +
      '<div class="detailList">' + (s.entries.map(function (e, i) {
        return '<div class="detailItem"><h4>' + Core.GAMES[e.game].emoji + ' ' + Core.GAMES[e.game].name +
          '<span><select class="inp" data-star="' + i + '" style="min-height:40px;padding:6px 10px;font-size:13px">' +
          [1, 2, 3].map(function (v) { return '<option value="' + v + '"' + (v === e.stars ? ' selected' : '') + '>' + '★'.repeat(v) + '</option>'; }).join('') +
          '</select></span></h4><ul>' + e.info.map(function (x) { return '<li>• ' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }).join('') || '<div class="detailItem"><h4>Игр не было</h4></div>') + '</div>' +
      '<div class="field"><label for="edMin">Длительность: <span id="edMinVal">' + s.minutes + '</span> мин</label><input type="range" id="edMin" min="1" max="120" step="1" value="' + s.minutes + '" style="width:100%"></div>' +
      '<div class="field"><label for="edNote">Заметка</label><textarea class="inp" id="edNote">' + esc(s.note || '') + '</textarea></div>' +
      '<div class="dActions"><button class="btnP green" id="edSave">💾 Сохранить</button><button class="btnP sky" id="edRepeat">▶ Повторить игры</button><button class="btnG" id="edClose">Закрыть</button></div>',
      function () {
        $('#edMin').addEventListener('input', function (e) { $('#edMinVal').textContent = e.target.value; });
        $('#edClose').addEventListener('click', function () { UI.drawer.close(); });
        $('#edSave').addEventListener('click', function () {
          var entries = s.entries.map(function (e, i) {
            var sel2 = document.querySelector('#dPanel [data-star="' + i + '"]');
            return Object.assign({}, e, { stars: sel2 ? +sel2.value : e.stars });
          });
          Store.dispatch({ type: 'sessions/update', payload: { id: s.id, patch: { minutes: +$('#edMin').value, note: $('#edNote').value.trim(), entries: entries } } });
          UI.drawer.close(); self.renderAll(); AudioFX.success(); UI.toast('Запись обновлена ✅');
        });
        $('#edRepeat').addEventListener('click', function () {
          if (childById(s.pid)) {
            Store.dispatch({ type: 'child/select', payload: s.pid }); UI.refreshHeader();
            if (!S().session) UI.startSession(s.pid);
          }
          UI.drawer.close(); Screens.openGame(s.entries[0] ? s.entries[0].game : 'ship');
        });
      });
  },

  /* ---- tab 5: progress ---- */
  renderProgress: function () {
    var st = S(), self = this, sel = $('#progChild');
    sel.innerHTML = '<option value="all">Все дети</option>' + st.profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.avatar + ' ' + p.name) + '</option>'; }).join('');
    sel.value = st.profiles.some(function (p) { return p.id === self.prog.pid; }) ? self.prog.pid : 'all';
    this.prog.pid = sel.value;
    $('#progMetric').value = this.prog.metric; $('#progPeriod').value = this.prog.period;
    var list = Core.filterSessions(st, { pid: this.prog.pid, period: this.prog.period }, Adapters.now())
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var mName = { stars: 'звёзды', minutes: 'минуты', games: 'число игр' }[this.prog.metric];
    var whoName = this.prog.pid === 'all' ? 'Все дети' : (childById(this.prog.pid) || {}).name;
    $('#chartWho').textContent = whoName + ' • ' + mName + ' • ' + (this.prog.period === 'all' ? 'всё время' : this.prog.period + ' дней');
    var host = $('#chartHost');
    if (!list.length) { host.innerHTML = '<div class="empty"><b>📈</b>Нет занятий за выбранный период. Проведите занятие — график построится.</div>'; $('#heatHost').innerHTML = ''; return; }
    var W = 780, H = 290, L = 46, R = 16, T = 22, B = 52, pw = W - L - R, ph = H - T - B;
    var pats = ['<path d="M0 8 L8 0" stroke="rgba(255,255,255,.55)" stroke-width="3"/>', '<circle cx="4" cy="4" r="1.7" fill="rgba(255,255,255,.6)"/>', '<path d="M0 0 L8 8 M8 0 L0 8" stroke="rgba(255,255,255,.45)" stroke-width="1.6"/>', '<path d="M0 4 H8" stroke="rgba(255,255,255,.5)" stroke-width="2.4"/>', '<path d="M4 0 V8" stroke="rgba(255,255,255,.5)" stroke-width="2.4"/>', '<circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,.7)"/><circle cx="6" cy="6" r="1.2" fill="rgba(255,255,255,.7)"/>', '<path d="M0 2 H8 M0 6 H8" stroke="rgba(255,255,255,.4)" stroke-width="1.4"/>'];
    var series, groups, metric = this.prog.metric;
    if (this.prog.pid === 'all') {
      series = st.profiles.map(function (p) { return { key: p.id, label: p.avatar + ' ' + p.name, color: p.color }; });
      groups = list.slice(-8).map(function (s) {
        return { label: new Date(s.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), sub: s.minutes + 'м',
          values: series.map(function (se) { return s.pid === se.key ? Core.metricValue(s, metric) : 0; }) };
      });
    } else if (metric === 'stars') {
      series = Core.GAME_KEYS.map(function (k) { return { key: k, label: Core.GAMES[k].emoji + ' ' + Core.GAMES[k].name, color: Core.GAMES[k].color }; });
      groups = list.slice(-8).map(function (s) {
        return { label: new Date(s.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), sub: s.minutes + 'м',
          values: series.map(function (se) {
            var e = s.entries.filter(function (x) { return x.game === se.key; });
            return e.length ? Math.max.apply(null, e.map(function (x) { return x.stars; })) : 0;
          }) };
      });
    } else {
      var pp = childById(this.prog.pid);
      series = [{ key: 'v', label: mName, color: pp ? pp.color : '#0E7DC2' }];
      groups = list.slice(-8).map(function (s) { return { label: new Date(s.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), sub: '', values: [Core.metricValue(s, metric)] }; });
    }
    var maxV = 3;
    groups.forEach(function (g) { g.values.forEach(function (v) { if (v > maxV) maxV = v; }); });
    var gw = pw / groups.length, bw = Math.min(20, (gw - 12) / series.length);
    var defs = '', bars = '', labels = '', grid = '';
    series.forEach(function (se, i) { defs += '<pattern id="pt-' + i + '" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="' + se.color + '"/>' + pats[i % 7] + '</pattern>'; });
    for (var v = 0; v <= 4; v++) {
      var val = Math.round(maxV * v / 4), y = T + ph - (v / 4) * ph;
      grid += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" stroke="currentColor" stroke-opacity=".18" stroke-width="1.5"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" font-weight="900" fill="currentColor" opacity=".7" font-family="Nunito,sans-serif">' + val + '</text>';
    }
    groups.forEach(function (g, gi) {
      var gx = L + gi * gw;
      g.values.forEach(function (v2, si) {
        var x = gx + (gw - (bw * series.length + (series.length - 1) * 2)) / 2 + si * (bw + 2), h = (v2 / maxV) * ph, y = T + ph - h;
        if (v2 > 0) {
          bars += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="4" fill="url(#pt-' + si + ')" stroke="rgba(0,0,0,.18)" stroke-width="1"><title>' + esc(series[si].label) + ': ' + v2 + '</title></rect>';
          labels += '<text x="' + (x + bw / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="10.5" font-weight="900" fill="currentColor" font-family="Nunito,sans-serif">' + v2 + '</text>';
        } else bars += '<rect x="' + x + '" y="' + (T + ph - 4) + '" width="' + bw + '" height="4" rx="2" fill="currentColor" opacity=".2"><title>' + esc(series[si].label) + ': нет данных</title></rect>';
      });
      labels += '<text x="' + (gx + gw / 2) + '" y="' + (T + ph + 20) + '" text-anchor="middle" font-size="12" font-weight="900" fill="currentColor" opacity=".8" font-family="Nunito,sans-serif">' + g.label + '</text>';
      if (g.sub) labels += '<text x="' + (gx + gw / 2) + '" y="' + (T + ph + 36) + '" text-anchor="middle" font-size="10.5" font-weight="800" fill="currentColor" opacity=".55" font-family="Nunito,sans-serif">' + g.sub + '</text>';
    });
    var totalMin = list.reduce(function (a, s) { return a + s.minutes; }, 0);
    var totalStars = list.reduce(function (a, s) { return a + Core.sessionStars(s); }, 0);
    var avg = Core.gameAverages(list);
    var praises = this.prog.pid === 'all' ? st.profiles.reduce(function (a, p) { return a + (p.praises || 0); }, 0) : ((childById(this.prog.pid) || {}).praises || 0);
    host.innerHTML = '<div class="chartBox"><svg id="progSvgEl" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График прогресса" style="color:var(--ink)"><defs>' + defs + '</defs>' + grid + bars + labels + '</svg>' +
      '<div class="legend">' + series.map(function (se) { return '<div><i style="background:' + se.color + '"></i>' + esc(se.label) + '</div>'; }).join('') + '</div>' +
      '<div class="statRow"><div><b>' + list.length + '</b><small>занятий</small></div><div><b>' + totalMin + '</b><small>минут</small></div><div><b>' + totalStars + '</b><small>звёзд</small></div>' +
      '<div><b>' + (avg[0] ? avg[0].avg.toFixed(1) : '—') + '★</b><small>' + (avg[0] ? Core.GAMES[avg[0].key].name : 'лучшая игра') + '</small></div>' +
      '<div><b>' + praises + '</b><small>похвал</small></div></div></div>';
    this.renderHeat(list);
  },
  renderHeat: function (list) {
    var weeks = 8, now = new Date(); now.setHours(0, 0, 0, 0);
    var wd = (now.getDay() + 6) % 7, monday = new Date(now); monday.setDate(now.getDate() - wd);
    var cols = [], i;
    for (i = weeks - 1; i >= 0; i--) { var d = new Date(monday); d.setDate(monday.getDate() - i * 7); cols.push(d); }
    var counts = Core.GAME_KEYS.map(function (k) {
      return cols.map(function (ws) {
        var we = new Date(ws); we.setDate(ws.getDate() + 7);
        return list.filter(function (s) { var d2 = new Date(s.date); return d2 >= ws && d2 < we; })
          .reduce(function (a, s) { return a + s.entries.filter(function (e) { return e.game === k; }).length; }, 0);
      });
    });
    var max = 1; counts.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });
    $('#heatHost').innerHTML = '<div class="chartBox" style="border-color:var(--math)"><h3 style="font-family:var(--disp);font-size:16px;margin-bottom:10px">Тепловая карта: игры × недели</h3>' +
      '<table><thead><tr><th>Игра</th>' + cols.map(function (d) { return '<th>' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      Core.GAME_KEYS.map(function (k, ri) {
        return '<tr><td>' + Core.GAMES[k].emoji + ' ' + Core.GAMES[k].name + '</td>' + counts[ri].map(function (v) {
          var a = v / max, bg = v ? 'rgba(12,138,90,' + (.18 + a * .82) + ')' : 'rgba(150,150,150,.14)';
          return '<td><i style="background:' + bg + '" title="' + Core.GAMES[k].name + ': ' + v + ' игр"></i></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<div class="legend"><div><i style="background:rgba(150,150,150,.14)"></i>не играли</div><div><i style="background:rgba(12,138,90,.35)"></i>мало</div><div><i style="background:rgba(12,138,90,1)"></i>много</div></div></div>';
  },

  /* ---- tab 6: goals ---- */
  renderGoals: function () {
    var st = S(), sel = $('#goalChild'), self = this;
    sel.innerHTML = st.profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.avatar + ' ' + p.name) + '</option>'; }).join('') || '<option value="">нет детей</option>';
    if (!st.profiles.some(function (p) { return p.id === sel.value; })) sel.value = st.currentPid || '';
    var list = st.goals.filter(function (g) { return g.pid === sel.value; }), host = $('#goalList');
    if (!list.length) { host.innerHTML = '<div class="empty"><b>🎯</b>Целей пока нет. Добавьте первую — например, «Автоматизировать [Р] в слогах, 10 повторов».</div>'; return; }
    host.innerHTML = '';
    list.forEach(function (g) {
      var done = g.progress >= g.target, pct = clamp(g.progress / g.target * 100, 0, 100);
      var late = !done && g.deadline && new Date(g.deadline) < new Date();
      var d = document.createElement('div'); d.className = 'goalCard' + (done ? ' done' : '');
      d.innerHTML = '<div class="goalTop"><h4>' + (done ? '✅ ' : '') + esc(g.text) + '</h4>' +
        (g.sound ? '<span class="snd">[' + esc(g.sound) + ']</span>' : '') +
        '<span class="dl">' + (g.deadline ? 'до ' + new Date(g.deadline).toLocaleDateString('ru-RU') : '') + (late ? ' ⚠️ просрочено' : '') + '</span></div>' +
        '<div class="gbarWrap"><div class="gbarFill" style="width:' + pct + '%"></div></div>' +
        '<div class="goalBtns"><button class="btnG small" data-m="-1">−1</button><b>' + g.progress + ' / ' + g.target + '</b><button class="btnG small" data-m="1">+1</button>' +
        '<button class="btnG small danger" data-del="1" style="margin-left:auto">🗑</button></div>';
      d.querySelectorAll('[data-m]').forEach(function (b) {
        b.addEventListener('click', function () {
          var before = g.progress >= g.target, next = clamp(g.progress + Number(b.dataset.m), 0, g.target);
          Store.dispatch({ type: 'goals/update', payload: { id: g.id, patch: { progress: next } } });
          AudioFX.click();
          if (!before && next >= g.target) {
            UI.toast('🎯 Цель достигнута!');
            praise('perfect', { text: 'Цель достигнута!' });
            UI.confetti.feathers(12);
            Achievements.check({});
          }
          self.renderGoals();
        });
      });
      d.querySelector('[data-del]').addEventListener('click', function () {
        var i = S().goals.indexOf(g);
        Store.dispatch({ type: 'goals/remove', payload: g.id }); self.renderGoals();
        UI.toast('Цель удалена', { label: 'Отменить', fn: function () { Store.dispatch({ type: 'goals/restore', payload: { index: i, item: g } }); self.renderGoals(); } });
      });
      host.appendChild(d);
    });
  },
  goalDrawer: function () {
    var pid = $('#goalChild').value, self = this;
    if (!pid) { UI.toast('Сначала добавьте ребёнка 👧'); return; }
    UI.drawer.open('Новая цель',
      '<p class="lead">Цель на месяц. Прогресс отмечается кнопками +1 / −1.</p>' +
      '<div class="field"><label for="glText">Формулировка</label><input class="inp" id="glText" type="text" placeholder="Автоматизировать [Р] в слогах" maxlength="80"></div>' +
      '<div class="field"><label for="glSound">Звук (необязательно)</label><select class="inp" id="glSound"><option value="">—</option>' + Core.SOUNDS.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="glTarget">Целевое количество: <span id="glTargetVal">10</span></label><input type="range" id="glTarget" min="3" max="30" step="1" value="10" style="width:100%"></div>' +
      '<div class="field"><label for="glDeadline">Дедлайн</label><input class="inp" id="glDeadline" type="date" value="' + isoDay(Adapters.now() + 30 * DAY_MS) + '"></div>' +
      '<p class="err" id="glErr"></p><div class="dActions"><button class="btnP green" id="glSave">💾 Создать цель</button><button class="btnG" id="glCancel">Отмена</button></div>',
      function () {
        $('#glTarget').addEventListener('input', function (e) { $('#glTargetVal').textContent = e.target.value; });
        $('#glCancel').addEventListener('click', function () { UI.drawer.close(); });
        $('#glSave').addEventListener('click', function () {
          var text = $('#glText').value.trim();
          if (text.length < 3) { $('#glErr').textContent = 'Введите формулировку цели'; return; }
          Store.dispatch({ type: 'goals/add', payload: { id: uid(), pid: pid, text: text, sound: $('#glSound').value, target: +$('#glTarget').value, progress: 0, deadline: $('#glDeadline').value, done: false } });
          UI.drawer.close(); self.renderGoals(); AudioFX.success(); UI.toast('Цель создана 🎯');
        });
      });
  },

  /* ---- tab 7: achievements ---- */
  renderAchievements: function () {
    var st = S(), sel = $('#achChild'), self = this;
    sel.innerHTML = st.profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.avatar + ' ' + p.name) + '</option>'; }).join('') || '<option value="">нет детей</option>';
    if (!st.profiles.some(function (p) { return p.id === sel.value; })) sel.value = st.currentPid || '';
    var p = childById(sel.value), grid = $('#achGrid');
    grid.innerHTML = '';
    if (!p) { $('#achStats').textContent = ''; grid.innerHTML = '<div class="empty"><b>🏆</b>Добавьте ребёнка, чтобы видеть достижения.</div>'; return; }
    $('#achStats').textContent = 'Открыто ' + p.achievements.length + ' из ' + Achievements.catalog.length + ' • ' + p.name;
    Achievements.catalog.forEach(function (a, i) {
      var on = p.achievements.indexOf(a.id) >= 0;
      var log = p.achievementLog.filter(function (l) { return l.id === a.id; })[0];
      var b = document.createElement('button');
      b.className = 'achCard' + (on ? ' on' : ' off'); b.style.animationDelay = (i * .03) + 's';
      b.innerHTML = '<span class="em">' + a.emoji + '</span><span><h4>' + esc(a.name) + '</h4><p>' + esc(a.description) + '</p>' +
        (on && log ? '<span class="dateTag">' + new Date(log.date).toLocaleDateString('ru-RU') + (log.game ? ' • ' + Core.GAMES[log.game].name : '') + (log.manual ? ' • 🎁 вручено' : '') + '</span>' : '') +
        '</span>' + (on ? '' : '<span class="lockTag">🔒</span>');
      b.addEventListener('click', function () { self.achievementDrawer(p, a); });
      grid.appendChild(b);
    });
  },
  achievementDrawer: function (p, a) {
    var logs = p.achievementLog.filter(function (l) { return l.id === a.id; });
    var on = p.achievements.indexOf(a.id) >= 0, self = this;
    UI.drawer.open(a.emoji + ' ' + a.name,
      '<p class="lead">' + esc(a.description) + '</p>' +
      '<div class="detailList">' + (logs.length ? logs.map(function (l) {
        return '<div class="detailItem"><h4>' + (l.manual ? '🎁 Вручено специалистом' : '🏅 Получено автоматически') + '</h4><ul>' +
          '<li>Дата: ' + new Date(l.date).toLocaleString('ru-RU') + '</li>' +
          (l.game ? '<li>Игра: ' + Core.GAMES[l.game].name + '</li>' : '') +
          (l.comment ? '<li>Комментарий: ' + esc(l.comment) + '</li>' : '') + '</ul></div>';
      }).join('') : '<div class="detailItem"><h4>Пока не получено</h4><ul><li>Выполните условие — Кеша вручит награду сам.</li></ul></div>') + '</div>' +
      '<div class="dActions">' + (on ? '' : '<button class="btnP berry" id="achGive">🎁 Подарить вручную</button>') + '<button class="btnG" id="achClose">Закрыть</button></div>',
      function () {
        $('#achClose').addEventListener('click', function () { UI.drawer.close(); });
        if (!on) $('#achGive').addEventListener('click', function () {
          Achievements.grantManual(p.id, a.id, 'Вручено из вкладки достижений');
          UI.drawer.close(); UI.refreshHeader(); self.renderAchievements(); self.renderKids();
          praise('perfect', { text: p.name + ', награда твоя!' });
        });
      });
  },

  /* ---- tab 8: settings ---- */
  renderSettings: function () {
    var st = S(), s = st.settings, host = $('#settingsHost'), self = this;
    var voices = Adapters.speech() ? Adapters.speech().getVoices() : [];
    var neuralNote = KeshaVoice.neuralReady === false
      ? '<div class="setHint">Нейро-файлы не найдены. Запустите <span class="codeTag">node tools/generate-audio.mjs</span> — озвучка автоматически вернётся к MP3. Сейчас работает браузерный синтез.</div>'
      : KeshaVoice.neuralReady === true ? '<div class="setHint">Нейро-озвучка готова: ' + Object.keys(KeshaVoice.manifest).length + ' фраз в манифесте, проиграно ' + KeshaVoice.played + '.</div>' : '';
    host.innerHTML =
      '<div class="setSec"><h3>👤 Аккаунт</h3>' +
      '<div class="setRow"><label for="setName">Имя специалиста</label><input class="inp" id="setName" type="text" value="' + esc(s.specialist.name) + '" maxlength="40"></div>' +
      '<div class="setRow"><label for="setCab">Название кабинета (футер и печать)</label><input class="inp" id="setCab" type="text" value="' + esc(s.specialist.cabinetName) + '" maxlength="40"></div>' +
      '<div class="setRow"><label>Аватар специалиста</label><div class="pickRow" id="setAva">' + ['👩‍⚕️', '🧑‍⚕️', '👩‍🏫', '🦜', '🌿', '⭐'].map(function (a) { return '<button class="pick' + (a === s.specialist.avatar ? ' on' : '') + '" data-a="' + a + '">' + a + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="setSec"><h3>🎨 Интерфейс</h3>' +
      '<div class="setRow"><label for="setTheme">Тема</label><select class="inp" id="setTheme"><option value="jungle">Джунгли</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></div>' +
      '<div class="setRow"><label for="setCursor">Размер курсора</label><select class="inp" id="setCursor"><option value="normal">Обычный 36px</option><option value="large">Крупный 48px</option></select></div>' +
      '<div class="setRow"><label for="setMotion">Анимации</label><select class="inp" id="setMotion"><option value="full">Полные</option><option value="reduced">Уменьшенные</option></select></div>' +
      '<div class="setRow"><label>Звук</label><label class="switch"><input type="checkbox" id="setSound"' + (s.sound ? ' checked' : '') + '> включён</label></div>' +
      '<div class="setRow"><label for="setVol">Громкость</label><input type="range" id="setVol" min="0" max="1" step="0.05" value="' + s.volume + '"><span class="val" id="setVolVal">' + Math.round(s.volume * 100) + '%</span></div></div>' +
      '<div class="setSec"><h3>🦜 Голос Кеши</h3>' +
      '<div class="setRow"><label>Озвучка</label><label class="switch"><input type="checkbox" id="setVoice"' + (s.voice.enabled ? ' checked' : '') + '> включена</label></div>' +
      '<div class="setRow"><label for="setEngine">Движок</label><select class="inp" id="setEngine"><option value="neural">Нейро (MP3)</option><option value="speech-synthesis">Браузерный (SpeechSynthesis)</option></select></div>' +
      '<div class="setRow"><label for="setVoiceId">Голос браузера</label><select class="inp" id="setVoiceId"><option value="">Авто (русский)</option>' + voices.map(function (v) { return '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === s.voice.voiceId ? ' selected' : '') + '>' + esc(v.name) + ' (' + esc(v.lang) + ')</option>'; }).join('') + '</select></div>' +
      '<div class="setRow"><label for="setRate">Скорость речи</label><input type="range" id="setRate" min="0.6" max="1.2" step="0.05" value="' + s.voice.rate + '"><span class="val" id="setRateVal">' + s.voice.rate.toFixed(2) + '</span></div>' +
      '<div class="setRow"><label>Проверить голос</label><button class="btnG small" id="setVoiceTest">🔊 «Привет! Я Кеша»</button></div>' + neuralNote + '</div>' +
      '<div class="setSec"><h3>🎤 Микрофон</h3>' +
      '<div class="setRow"><label for="setSens">Чувствительность по умолчанию</label><input type="range" id="setSens" min="0.5" max="3" step="0.1" value="' + s.mic.defaultSens + '"><span class="val" id="setSensVal">' + s.mic.defaultSens.toFixed(1) + '</span></div>' +
      '<div class="setRow"><label>Калибровка при первом входе в игру</label><label class="switch"><input type="checkbox" id="setAutoCal"' + (s.mic.autoCalibrate ? ' checked' : '') + '> включена</label></div>' +
      '<div class="setRow"><label>Только поток воздуха (bandpass 250–1100)</label><label class="switch"><input type="checkbox" id="setAirOnly"' + (s.mic.airOnly ? ' checked' : '') + '> включено</label></div>' +
      '<div class="setRow"><label>Состояние</label><span class="val" id="setMicState">' + (Mic.enabled ? 'включён' : 'выключен') + '</span><button class="btnG small" id="setMicToggle">' + (Mic.enabled ? 'Выключить' : 'Включить') + '</button></div></div>' +
      '<div class="setSec"><h3>🎚 Сложность по умолчанию</h3>' +
      Core.GAME_KEYS.map(function (k) {
        return '<div class="setRow"><label for="df-' + k + '">' + Core.GAMES[k].emoji + ' ' + Core.GAMES[k].name + '</label><select class="inp setDiff" id="df-' + k + '" data-game="' + k + '"><option value="easy">Легко</option><option value="norm">Норма</option><option value="hard">Сложно</option></select></div>';
      }).join('') + '</div>' +
      '<div class="setSec"><h3>🦜 Обучение</h3>' +
      '<div class="setRow"><label for="setTut">Показывать инструкции Кеши</label><select class="inp" id="setTut"><option value="always">Всегда</option><option value="once">Один раз</option><option value="never">Никогда</option></select></div>' +
      '<div class="setRow"><label>Сбросить счётчики инструкций</label><button class="btnG small" id="setTutReset">↻ Показывать снова</button></div></div>' +
      '<div class="setSec"><h3>💾 Данные</h3>' +
      '<div class="setRow"><label>Размер базы</label><span class="val">' + DB.sizeKB(st) + ' KB</span><span class="sessMeta">' + st.profiles.length + ' детей • ' + st.sessions.length + ' занятий • ' + st.schedule.length + ' записей • ' + st.goals.length + ' целей</span></div>' +
      '<div class="setRow"><label>Резервная копия</label><button class="btnP small sky" id="dbExport">📦 Экспорт БД</button></div>' +
      '<div class="setRow"><label for="dbImport">Восстановление</label><input class="inp" id="dbImport" type="file" accept="application/json"></div>' +
      '<div class="setRow"><label>Миграция старых версий</label><button class="btnG small" id="dbMigrate">🔄 Перенести v2/v3 → v4</button></div>' +
      '<div class="setRow"><label>Полный сброс</label><button class="btnG small danger" id="dbReset">🗑 Сбросить всё</button></div></div>' +
      '<div class="setSec"><h3>🔒 Доступ</h3>' +
      '<div class="setRow"><label>PIN на кабинет</label><span class="val">' + (s.access.pinHash ? 'задан' : 'нет') + '</span><button class="btnG small" id="pinSet">' + (s.access.pinHash ? 'Изменить PIN' : 'Установить PIN') + '</button>' + (s.access.pinHash ? '<button class="btnG small danger" id="pinClear">Снять PIN</button>' : '') + '</div>' +
      '<div class="setRow"><label for="setLock">Автоблокировка через <span id="setLockVal">' + s.access.autoLockMin + '</span> мин</label><input type="range" id="setLock" min="1" max="30" step="1" value="' + s.access.autoLockMin + '"></div></div>' +
      '<div class="setSec"><h3>ℹ️ О приложении</h3>' +
      '<div class="setRow"><label>Версия</label><span class="val">' + APP.version + '</span></div>' +
      '<div class="setRow"><label>Дата сборки</label><span class="val">' + APP.build + '</span></div>' +
      '<div class="setRow"><label>Формат базы</label><span class="val">tigra-v4</span></div>' +
      '<div class="setRow"><label>Методика</label><button class="btnG small" id="aboutMethod">👩‍⚕️ Открыть методику</button></div></div>';
    $('#setTheme').value = s.theme; $('#setCursor').value = s.cursorSize; $('#setMotion').value = s.motion;
    $('#setEngine').value = s.voice.engine; $('#setTut').value = s.tutorial;
    $$('.setDiff').forEach(function (sel2) { sel2.value = s.difficulty[sel2.dataset.game]; });
    function save() { applySettings(); }
    $('#setName').addEventListener('input', function (e) { Store.dispatch({ type: 'settings/patch', payload: { specialist: { name: e.target.value } } }); save(); });
    $('#setCab').addEventListener('input', function (e) { Store.dispatch({ type: 'settings/patch', payload: { specialist: { cabinetName: e.target.value } } }); save(); });
    $('#setAva').addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      Store.dispatch({ type: 'settings/patch', payload: { specialist: { avatar: b.dataset.a } } });
      $$('#setAva .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); save(); AudioFX.click();
    });
    $('#setTheme').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { theme: e.target.value } }); save(); AudioFX.click(); });
    $('#setCursor').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { cursorSize: e.target.value } }); save(); });
    $('#setMotion').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { motion: e.target.value } }); save(); });
    $('#setSound').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { sound: e.target.checked } }); save(); });
    $('#setVol').addEventListener('input', function (e) {
      Store.dispatch({ type: 'settings/patch', payload: { volume: +e.target.value } });
      $('#setVolVal').textContent = Math.round(+e.target.value * 100) + '%'; save();
    });
    $('#setVoice').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { voice: { enabled: e.target.checked } } }); save(); });
    $('#setEngine').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { voice: { engine: e.target.value } } }); save(); self.renderSettings(); });
    $('#setVoiceId').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { voice: { voiceId: e.target.value } } }); save(); });
    $('#setRate').addEventListener('input', function (e) {
      Store.dispatch({ type: 'settings/patch', payload: { voice: { rate: +e.target.value } } });
      $('#setRateVal').textContent = (+e.target.value).toFixed(2); save();
    });
    $('#setVoiceTest').addEventListener('click', function () { KeshaVoice.say('game.welcome', { fallbackText: 'Привет! Я Кеша. Давай играть!' }); });
    $('#setSens').addEventListener('input', function (e) {
      Store.dispatch({ type: 'settings/patch', payload: { mic: { defaultSens: +e.target.value } } });
      $('#setSensVal').textContent = (+e.target.value).toFixed(1); save();
    });
    $('#setAutoCal').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { mic: { autoCalibrate: e.target.checked } } }); save(); });
    $('#setAirOnly').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { mic: { airOnly: e.target.checked } } }); save(); });
    $('#setMicToggle').addEventListener('click', function () { Mic.toggle(); });
    $$('.setDiff').forEach(function (sel2) {
      sel2.addEventListener('change', function (e) {
        var patch = {}; patch[e.target.dataset.game] = e.target.value;
        Store.dispatch({ type: 'settings/patch', payload: { difficulty: patch } }); save();
        var g = GameRegistry[e.target.dataset.game];
        if (g && Screens.cur === g.id) g.restart();
      });
    });
    $('#setTut').addEventListener('change', function (e) { Store.dispatch({ type: 'settings/patch', payload: { tutorial: e.target.value } }); save(); });
    $('#setTutReset').addEventListener('click', function () {
      S().profiles.forEach(function (p) { Store.dispatch({ type: 'child/update', payload: { id: p.id, patch: { tutorialCounts: {}, listened: [] } } }); });
      UI.tutorial.shownThisRun = {}; UI.toast('Инструкции будут показаны снова 🦜');
    });
    $('#dbExport').addEventListener('click', function () {
      UI.download('tigra-backup-' + isoDay(Adapters.now()) + '.json', JSON.stringify({ v: 4, data: S() }, null, 2), 'application/json');
      AudioFX.chime(); UI.toast('Резервная копия сохранена 📦');
    });
    $('#dbImport').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0]; if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        var data = null;
        try { data = JSON.parse(String(fr.result)); } catch (err) { UI.toast('Файл повреждён — не JSON'); return; }
        var payload = data && data.data ? data.data : data;
        if (!payload || !payload.profiles) { UI.toast('В файле нет профилей'); return; }
        UI.drawer.open('Заменить все данные?',
          '<p class="lead">В файле: ' + payload.profiles.length + ' детей, ' + ((payload.sessions || []).length) + ' занятий. Текущие данные будут заменены полностью.</p>' +
          '<div class="dActions"><button class="btnP red" id="impGo">📥 Заменить</button><button class="btnG" id="impNo">Отмена</button></div>',
          function () {
            $('#impNo').addEventListener('click', function () { UI.drawer.close(); });
            $('#impGo').addEventListener('click', function () {
              Store.dispatch({ type: 'db/replace', payload: payload });
              UI.drawer.close(); applySettings(); UI.renderGrid(); self.renderAll();
              AudioFX.success(); UI.toast('Данные восстановлены 📥');
            });
          });
      };
      fr.readAsText(file); e.target.value = '';
    });
    $('#dbMigrate').addEventListener('click', function () {
      var res = DB.migrateLegacyNow(S());
      Store.dispatch({ type: 'db/replace', payload: res.state });
      applySettings(); UI.renderGrid(); self.renderAll();
      UI.toast('Миграция: +' + res.added.profiles + ' детей, +' + res.added.sessions + ' занятий'); AudioFX.chime();
    });
    $('#dbReset').addEventListener('click', function () {
      UI.drawer.open('Полный сброс',
        '<p class="lead">Будут удалены все дети, занятия, расписание, цели и настройки. Введите слово <b>УДАЛИТЬ</b> для подтверждения.</p>' +
        '<div class="field"><input class="inp" id="rsWord" type="text" placeholder="УДАЛИТЬ" autocomplete="off"></div>' +
        '<div class="dActions"><button class="btnP red" id="rsGo" disabled>🗑 Сбросить</button><button class="btnG" id="rsNo">Отмена</button></div>',
        function () {
          var i = $('#rsWord'), g = $('#rsGo');
          i.addEventListener('input', function () { g.disabled = i.value.trim().toUpperCase() !== 'УДАЛИТЬ'; });
          $('#rsNo').addEventListener('click', function () { UI.drawer.close(); });
          g.addEventListener('click', function () {
            Store.dispatch({ type: 'db/replace', payload: Core.seed(Adapters.now()) });
            self.unlocked = false; UI.drawer.close(); applySettings(); UI.refreshHeader(); UI.renderGrid(); self.renderAll();
            AudioFX.wrong(); UI.toast('Данные сброшены к демо-набору');
          });
        });
    });
    $('#pinSet').addEventListener('click', function () {
      UI.drawer.open('PIN кабинета',
        '<p class="lead">4 цифры. PIN хранится как SHA-256 хеш, а не открытым текстом.</p>' +
        '<div class="field"><label for="pn1">Новый PIN</label><input class="inp" id="pn1" type="password" inputmode="numeric" maxlength="4"></div>' +
        '<div class="field"><label for="pn2">Повторите PIN</label><input class="inp" id="pn2" type="password" inputmode="numeric" maxlength="4"></div>' +
        '<p class="err" id="pnErr"></p><div class="dActions"><button class="btnP" id="pnSave">💾 Сохранить PIN</button><button class="btnG" id="pnNo">Отмена</button></div>',
        function () {
          $('#pnNo').addEventListener('click', function () { UI.drawer.close(); });
          $('#pnSave').addEventListener('click', function () {
            var a = $('#pn1').value.trim(), b = $('#pn2').value.trim();
            if (!/^\d{4}$/.test(a)) { $('#pnErr').textContent = 'PIN — ровно 4 цифры'; return; }
            if (a !== b) { $('#pnErr').textContent = 'PIN не совпадает'; return; }
            UI.pin.hash(a).then(function (h) {
              Store.dispatch({ type: 'settings/patch', payload: { access: { pinHash: h } } });
              self.unlocked = true; UI.drawer.close(); self.renderSettings(); UI.toast('PIN установлен 🔒');
            });
          });
        });
    });
    if ($('#pinClear')) $('#pinClear').addEventListener('click', function () {
      Store.dispatch({ type: 'settings/patch', payload: { access: { pinHash: null } } });
      self.renderSettings(); UI.toast('PIN снят 🔓');
    });
    $('#setLock').addEventListener('input', function (e) {
      Store.dispatch({ type: 'settings/patch', payload: { access: { autoLockMin: +e.target.value } } });
      $('#setLockVal').textContent = e.target.value; save();
    });
    $('#aboutMethod').addEventListener('click', function () { $('#cab-method').scrollIntoView({ behavior: 'smooth' }); });
  },

  /* ---- tab 9: method ---- */
  renderMethod: function () {
    $('#methodGrid').innerHTML = Core.GAME_KEYS.map(function (k) {
      var i = Core.METHOD[k], g = Core.GAMES[k];
      return '<div class="infoSec" data-cursor="eye" id="method-' + k + '" style="--sec:' + g.color + '">' +
        '<h3>' + g.emoji + ' ' + g.name + ' <span class="tag">' + i.tag + '</span></h3>' +
        '<p><b>Цель:</b> ' + i.goal + '</p><p><b>Как играть:</b> ' + i.how + '</p><p><b>Совет:</b> ' + i.tip + '</p></div>';
    }).join('');
  }
};

/* ==================== settings application + mic UI ==================== */
function applySettings() {
  var s = S().settings;
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.cursorSize = s.cursorSize;
  document.documentElement.dataset.motion = s.motion;
  AudioFX.muted = !s.sound; AudioFX.volume = s.volume; AudioFX.apply();
  Mic.sens = s.mic.defaultSens;
  $$('.sensInput').forEach(function (i) { i.value = s.mic.defaultSens; });
  $$('.diffSelect').forEach(function (sel) { sel.value = s.difficulty[sel.dataset.game]; });
  Breath.on = s.pacer;
  $$('.pacerBtn').forEach(function (b) { b.classList.toggle('on', Breath.on); });
  $('#shipPacer').hidden = !Breath.on; $('#balPacer').hidden = !Breath.on;
  updateSoundUI(); updateMicUI(); UI.refreshHeader();
}
function updateSoundUI() { var b = $('#btnSound'); b.textContent = AudioFX.muted ? '🔇' : '🔊'; b.classList.toggle('off', AudioFX.muted); }
function updateMicUI() {
  var chip = $('#micChip');
  chip.classList.remove('on', 'req', 'err');
  if (Mic.enabled) chip.classList.add('on'); else if (Mic.requesting) chip.classList.add('req'); else if (Mic.denied) chip.classList.add('err');
  $$('.micToggle').forEach(function (b) {
    b.classList.remove('on', 'req', 'err');
    var L = b.querySelector('.micLong'), Sh = b.querySelector('.micShort');
    if (Mic.enabled) { b.classList.add('on'); L.textContent = '🎤 Микрофон включён'; Sh.textContent = '🎤 ВКЛ'; }
    else if (Mic.requesting) { b.classList.add('req'); L.textContent = '⏳ Разреши доступ…'; Sh.textContent = '🎤 ЗАПРОС…'; }
    else if (Mic.denied) { b.classList.add('err'); L.textContent = '🎤 Нет доступа — жми «Ветер»'; Sh.textContent = '🎤 НЕТ ДОСТУПА'; }
    else { L.textContent = '🎤 Включить микрофон'; Sh.textContent = '🎤 ВЫКЛ'; }
  });
  $$('.calBtn').forEach(function (b) { b.classList.toggle('on', Mic.cal > 0); });
  if (Screens.cur === 'syll') SyllGame.micNote();
  var ms = $('#setMicState'); if (ms) ms.textContent = Mic.enabled ? 'включён' : 'выключен';
  var mt = $('#setMicToggle'); if (mt) mt.textContent = Mic.enabled ? 'Выключить' : 'Включить';
}

/* ==================== static wiring ==================== */
$('#btnBack').addEventListener('click', function () { AudioFX.click(); KeshaVoice.say('nav.backToGames', { fallbackText: 'Возвращаемся к играм.' }); Screens.go('hub'); });
$('#logoBtn').addEventListener('click', function () { AudioFX.click(); Screens.go('hub'); });
$('#heroStart').addEventListener('click', function () { AudioFX.click(); Cabinet.open(); });
$('#btnCabinet').addEventListener('click', function () { AudioFX.click(); Cabinet.open(); });
$('#sessChip').addEventListener('click', function () { AudioFX.click(); Cabinet.open(); });
$('#kidFab').addEventListener('click', function () { AudioFX.click(); Cabinet.profileForm(null); });
$('#childChip').addEventListener('click', function () {
  AudioFX.click();
  var st = S();
  if (!st.profiles.length) { UI.onboard.open(); return; }
  UI.drawer.open('Кто играет?', '<p class="lead">Быстрое переключение профиля.</p>' +
    '<div id="quickList">' + st.profiles.map(function (p) {
      var age = Core.ageFromBirth(p.birthDate, 5, Adapters.now());
      return '<button class="kidPickRow' + (p.id === st.currentPid ? ' on' : '') + '" data-q="' + p.id + '"><span class="av">' + p.avatar + '</span> ' + esc(p.name) +
        '<small>' + age + ' ' + plural(age, ['год', 'года', 'лет']) + ' • ⭐ ' + Core.bankTotal(p) + '</small></button>';
    }).join('') + '</div>' +
    '<div class="dActions"><button class="btnP" id="qManage">🗂 Управление</button><button class="btnG" id="qAdd">＋ Добавить</button></div>',
    function () {
      $('#quickList').addEventListener('click', function (e) {
        var b = e.target.closest('[data-q]'); if (!b) return;
        var p = childById(b.dataset.q); UI.drawer.close(); Cabinet.switchChild(p);
      });
      $('#qManage').addEventListener('click', function () { UI.drawer.close(); Cabinet.open(); setTimeout(function () { $('#cab-kids').scrollIntoView({ behavior: 'smooth' }); }, 240); });
      $('#qAdd').addEventListener('click', function () { UI.drawer.close(); Cabinet.profileForm(null); });
    });
});
$('#schedPrev').addEventListener('click', function () { Cabinet.weekOffset--; Cabinet.renderSchedule(); AudioFX.click(); });
$('#schedNext').addEventListener('click', function () { Cabinet.weekOffset++; Cabinet.renderSchedule(); AudioFX.click(); });
$('#schedToday').addEventListener('click', function () { Cabinet.weekOffset = 0; Cabinet.renderSchedule(); AudioFX.click(); $('#cab-schedule').scrollIntoView({ behavior: 'smooth' }); });
$('#jSearch').addEventListener('input', function (e) { Cabinet.filters.q = e.target.value; Cabinet.renderJournal(); });
$('#jFilter').addEventListener('change', function (e) { Cabinet.filters.pid = e.target.value; Cabinet.renderJournal(); });
$('#jSort').addEventListener('change', function (e) { Cabinet.filters.sort = e.target.value; Cabinet.renderJournal(); });
$('#jFrom').addEventListener('change', function (e) { Cabinet.filters.from = e.target.value; Cabinet.renderJournal(); });
$('#jTo').addEventListener('change', function (e) { Cabinet.filters.to = e.target.value; Cabinet.renderJournal(); });
$('#jStars').addEventListener('change', function (e) { Cabinet.filters.stars = +e.target.value; Cabinet.renderJournal(); });
$('#jPrint').addEventListener('click', function () { window.print(); });
$('#jCols').addEventListener('click', function () {
  var cols = S().settings.journalCols, names = { date: 'Дата и время', kid: 'Ребёнок', games: 'Игры', stars: 'Звёзды', note: 'Заметка' };
  UI.drawer.open('Колонки журнала', '<p class="lead">Выберите, что показывать в списке и на печати.</p>' +
    Object.keys(names).map(function (k) { return '<div class="setRow"><label class="switch"><input type="checkbox" data-col="' + k + '"' + (cols[k] ? ' checked' : '') + '> ' + names[k] + '</label></div>'; }).join('') +
    '<div class="dActions"><button class="btnP" id="colsSave">Готово</button></div>',
    function () {
      $('#colsSave').addEventListener('click', function () {
        var patch = {};
        $$('#dPanel [data-col]').forEach(function (c) { patch[c.dataset.col] = c.checked; });
        Store.dispatch({ type: 'settings/patch', payload: { journalCols: patch } });
        UI.drawer.close(); Cabinet.renderJournal(); UI.toast('Колонки обновлены ⚙️');
      });
    });
});
$('#jCsv').addEventListener('click', function () {
  var rows = [['Дата', 'Ребёнок', 'Возраст', 'Минуты', 'Игры', 'Звёзды', 'Заметка']];
  Core.filterSessions(S(), Cabinet.filters, Adapters.now()).forEach(function (s) {
    var p = childById(s.pid) || { name: '—', birthDate: null };
    rows.push([new Date(s.date).toLocaleString('ru-RU'), p.name, Core.ageFromBirth(p.birthDate, 5, Adapters.now()), s.minutes,
      s.entries.map(function (e) { return Core.GAMES[e.game].name + ' ' + e.stars + '★'; }).join('; '),
      Core.sessionStars(s), (s.note || '').replace(/\s+/g, ' ')]);
  });
  var csv = '\uFEFF' + rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
  UI.download('kesha-zhurnal.csv', csv, 'text/csv;charset=utf-8'); AudioFX.chime(); UI.toast('CSV выгружен ⬇');
});
$('#jJson').addEventListener('click', function () {
  UI.download('kesha-journal.json', JSON.stringify(Core.filterSessions(S(), Cabinet.filters, Adapters.now()), null, 2), 'application/json');
  AudioFX.chime(); UI.toast('JSON выгружен ⬇');
});
$('#progChild').addEventListener('change', function (e) { Cabinet.prog.pid = e.target.value; Cabinet.renderProgress(); });
$('#progMetric').addEventListener('change', function (e) { Cabinet.prog.metric = e.target.value; Cabinet.renderProgress(); });
$('#progPeriod').addEventListener('change', function (e) { Cabinet.prog.period = e.target.value; Cabinet.renderProgress(); });
$('#progSvg').addEventListener('click', function () {
  var svg = $('#progSvgEl'); if (!svg) { UI.toast('График пуст — нечего выгружать'); return; }
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelectorAll('[fill="currentColor"]').forEach(function (n) { n.setAttribute('fill', '#33200F'); });
  clone.querySelectorAll('[stroke="currentColor"]').forEach(function (n) { n.setAttribute('stroke', '#999999'); });
  UI.download('kesha-progress.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML, 'image/svg+xml');
  UI.toast('График сохранён ⬇');
});
$('#progReport').addEventListener('click', function () {
  var text = Core.buildReport(S(), Cabinet.prog, Adapters.now());
  UI.drawer.open('📄 Отчёт для родителей', '<p class="lead">Готовое текстовое резюме по выбранным фильтрам.</p>' +
    '<div class="field"><textarea class="inp" id="repText" style="min-height:280px;font-family:ui-monospace,monospace;font-size:12.5px">' + esc(text) + '</textarea></div>' +
    '<div class="dActions"><button class="btnP sky" id="repCopy">📋 Копировать</button><button class="btnP green" id="repDl">⬇ Скачать .txt</button><button class="btnG" id="repClose">Закрыть</button></div>',
    function () {
      $('#repClose').addEventListener('click', function () { UI.drawer.close(); });
      $('#repCopy').addEventListener('click', function () {
        var v = $('#repText').value;
        var ok = function () { UI.toast('Отчёт скопирован 📋'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, function () { $('#repText').select(); try { document.execCommand('copy'); ok(); } catch (e) { UI.toast('Скопируйте текст вручную'); } });
        else { $('#repText').select(); try { document.execCommand('copy'); ok(); } catch (e) { UI.toast('Скопируйте текст вручную'); } }
      });
      $('#repDl').addEventListener('click', function () { UI.download('kesha-report-' + isoDay(Adapters.now()) + '.txt', $('#repText').value, 'text/plain;charset=utf-8'); UI.toast('Отчёт сохранён ⬇'); });
    });
});
$('#goalChild').addEventListener('change', function () { Cabinet.renderGoals(); });
$('#goalAdd').addEventListener('click', function () { Cabinet.goalDrawer(); });
$('#achChild').addEventListener('change', function () { Cabinet.renderAchievements(); });
$('#achGift').addEventListener('click', function () {
  var p = childById($('#achChild').value);
  if (!p) { UI.toast('Сначала добавьте ребёнка 👧'); return; }
  Cabinet.giftDrawer(p);
});
AudioFX.onchange = function () {
  updateSoundUI();
  UI.toast(AudioFX.muted ? 'Звук выключен 🔇' : 'Звук включён 🔊');
  if (Screens.cur === 'hard') HardGame.notice();
  if (Screens.cur === 'cabinet') Cabinet.renderSettings();
};
$('#btnSound').addEventListener('click', function () { AudioFX.toggle(); });
var lastVoiceToast = 0;
Mic.onstate = function (r) {
  updateMicUI();
  if (r === 'on') { UI.toast('Микрофон включён — дуй! 🌬️🎤'); AudioFX.chirp(); KeshaVoice.say('mic.ready', { fallbackText: 'Микрофон готов. Дуй!' }); }
  else if (r === 'off') UI.toast('Микрофон выключен');
  else if (r === 'req') KeshaVoice.say('mic.requested', { fallbackText: 'Разреши доступ к микрофону.' });
  else if (r === 'denied') { UI.toast(UI.phone.env() === 'secure' ? 'Нет доступа к микрофону — играй кнопкой «Ветер» 🌬️' : 'Микрофон работает только по https 📲'); KeshaVoice.say('mic.denied', { fallbackText: 'Микрофон недоступен. Держи кнопку Ветер.' }); }
  else if (r === 'cal-start') UI.toast('Тс-с… слушаю тишину 1 секунду 🤫');
  else if (r === 'cal-done') { UI.toast('Калибровка готова — дуй 🌬️'); AudioFX.chime(); }
  else if (r === 'cal-no-mic') UI.toast('Сначала включи микрофон 🎤');
};
$('#micChip').addEventListener('click', function () { Mic.toggle(); });
$$('.micToggle').forEach(function (b) { b.addEventListener('click', function () { Mic.toggle(); }); });
$$('.calBtn').forEach(function (b) { b.addEventListener('click', function () { Mic.calibrate(); }); });
$$('.pacerBtn').forEach(function (b) { b.addEventListener('click', function () { Breath.toggle(); }); });
$$('.sensInput').forEach(function (inp) {
  inp.value = S().settings.mic.defaultSens;
  inp.addEventListener('input', function () {
    Store.dispatch({ type: 'settings/patch', payload: { mic: { defaultSens: parseFloat(inp.value) } } });
    Mic.sens = parseFloat(inp.value);
    $$('.sensInput').forEach(function (o) { if (o !== inp) o.value = inp.value; });
  });
});
$$('.diffSelect').forEach(function (sel) {
  var g = sel.dataset.game;
  sel.value = S().settings.difficulty[g];
  sel.addEventListener('change', function () {
    var patch = {}; patch[g] = sel.value;
    Store.dispatch({ type: 'settings/patch', payload: { difficulty: patch } });
    AudioFX.click(); GameRegistry[g].restart();
    UI.toast(Core.GAMES[g].name + ': режим «' + Core.DIFF_NAME[sel.value] + '»');
  });
});

/* ==================== keyboard ==================== */
document.addEventListener('keydown', function (e) {
  if (e.target.matches('input,textarea,select')) return;
  if (UI.onboard.isOpen() || UI.pin.isOpen()) return;
  if (UI.tutorial.isOpen()) {
    if (e.key === 'Enter') { e.preventDefault(); UI.tutorial.finish(!KeshaVoice.isPlaying()); }
    if (e.key === 'Escape') { e.preventDefault(); UI.tutorial.finish(false); }
    return;
  }
  if (e.key === 'Escape') {
    if (UI.drawer.isOpen()) { UI.drawer.close(); return; }
    if (UI.phone.isOpen()) { UI.phone.close(); return; }
    if (UI.result.isOpen()) return;
    if (GameRegistry[Screens.cur]) { if (Screens.paused) UI.pause.close(); else UI.pause.open(); }
    return;
  }
  if (UI.drawer.isOpen() || UI.result.isOpen() || Screens.paused || UI.phone.isOpen()) return;
  var cur = Screens.cur;
  if ((cur === 'ship' || cur === 'balloon') && e.code === 'Space') { e.preventDefault(); Input.held = true; $$('.windBtn').forEach(function (b) { b.classList.add('blowing'); }); return; }
  if (cur === 'syll' && e.code === 'Space') { e.preventDefault(); if (!e.repeat) SyllGame.tap(); return; }
  if (cur === 'rhythm') {
    if (e.key === '1' || e.key === 'ArrowLeft') { e.preventDefault(); RhythmGame.tap(0); }
    if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); RhythmGame.tap(1); }
  }
  if (cur === 'hard' && HardGame.st && HardGame.st.phase === 'ask') {
    if (e.key === '1') { e.preventDefault(); HardGame.answer(false); }
    if (e.key === '2') { e.preventDefault(); HardGame.answer(true); }
  }
  if (cur === 'math' && MathGame.st && MathGame.st.phase === 'ask' && /^[1-7]$/.test(e.key)) {
    var i = Number(e.key) - 1, btn = $$('#mathOptions .mathOpt')[i];
    if (btn) { e.preventDefault(); MathGame.answer(i, btn); }
  }
  if (cur === 'odd' && OddGame.st && OddGame.st.phase === 'pick' && ['1', '2', '3', '4'].indexOf(e.key) >= 0) {
    var cards = $$('#oddGrid .ocard'), k = Number(e.key) - 1;
    if (cards[k]) OddGame.pick(k, cards[k]);
  }
});
document.addEventListener('keyup', function (e) { if (e.code === 'Space') UI.releaseWind(); });

/* ==================== cursor, feathers, ambience, scrollspy ==================== */
var FEATHER_SVG = '<svg viewBox="0 0 28 28" width="28" height="28"><path d="M5 5C14 6.5 21 13 23 23 13 21 6.5 14 5 5Z" fill="#FF7A1A" stroke="#33200F" stroke-width="1.8"/><path d="M8 8L20 20" stroke="#FFF6E3" stroke-width="1.5" stroke-linecap="round"/></svg>';
var lastMove = Adapters.perf(), mmPending = false, mmX = 0, mmY = 0;
document.addEventListener('mousemove', function (e) {
  mmX = e.clientX; mmY = e.clientY; lastMove = Adapters.perf();
  document.body.classList.remove('cursor-idle');
  document.body.style.setProperty('--mx', (e.clientX - 6) + 'px');
  document.body.style.setProperty('--my', (e.clientY - 6) + 'px');
  if (!mmPending) { mmPending = true; Adapters.raf(function () { mmPending = false; UI.mascot.track(mmX, mmY); }); }
}, { passive: true });
document.addEventListener('pointerdown', function (e) {
  UI.mascot.wake(); Cabinet.idle = 0;
  if (!finePointer || reducedMotion() || coarse) return;
  if (!e.target.closest('button,a,[role=button],.gcard,.ocard,.mathOpt,.pick,.pickS,.slot,.achCard,input,select,label')) return;
  if (document.querySelectorAll('.featherFx').length > 10) return;
  var f = document.createElement('span'); f.className = 'featherFx'; f.innerHTML = FEATHER_SVG;
  f.style.left = (e.clientX - 6) + 'px'; f.style.top = (e.clientY - 6) + 'px';
  f.style.rotate = (Adapters.random() * 40 - 20) + 'deg';
  document.body.appendChild(f);
  f.addEventListener('animationend', function () { f.remove(); });
  setTimeout(function () { f.remove(); }, 1400);
}, { capture: true });
document.addEventListener('keydown', function () { Cabinet.idle = 0; UI.mascot.wake(); }, { capture: true });

var hubPhrases = ['Привет! Я Кеша 🦜', 'Чик-чирик! Во что поиграем?', 'Дуй сильнее — кораблик плывёт! ⛵', 'Найди лишнюю картинку! 🧩', 'Ла — твёрдо, ля — мягко! 🪨🌿', 'Хлопай: со-ба-ка! 👏', 'Посчитаем яблоки? 🍎', 'Собери все награды! 🏆'];
var phIdx = 0;
setInterval(function () {
  if (Screens.cur !== 'hub' || document.hidden || UI.mascot.sleep) return;
  var b = $('#bubble'); b.style.opacity = 0;
  setTimeout(function () { phIdx = (phIdx + 1) % hubPhrases.length; b.textContent = hubPhrases[phIdx]; b.style.opacity = 1; }, 320);
}, 5200);
setInterval(function () {
  if (Screens.cur !== 'hub' || document.hidden || AudioFX.muted) return;
  if (Adapters.random() < .5) AudioFX.pad();
  if (!reducedMotion() && Adapters.random() < .6) {
    var bird = document.createElement('div'); bird.className = 'bird';
    bird.style.top = (10 + Adapters.random() * 22) + 'vh'; bird.innerHTML = '<span>🦜</span>';
    $('#birdLayer').appendChild(bird); AudioFX.bird();
    bird.addEventListener('animationend', function () { bird.remove(); });
    setTimeout(function () { bird.remove(); }, 10000);
  }
}, 11000);
if (!reducedMotion()) {
  for (var li = 0; li < 6; li++) {
    var leaf = document.createElement('div'); leaf.className = 'leafP'; leaf.textContent = ['🍃', '🌿', '🪶'][li % 3];
    leaf.style.left = (4 + Adapters.random() * 88) + 'vw';
    leaf.style.animationDuration = (14 + Adapters.random() * 12) + 's';
    leaf.style.animationDelay = (-Adapters.random() * 20) + 's';
    leaf.style.fontSize = (15 + Adapters.random() * 11) + 'px';
    $('#bg').appendChild(leaf);
  }
}
var scrollTick = false;
window.addEventListener('scroll', function () {
  if (scrollTick) return;
  scrollTick = true;
  Adapters.raf(function () {
    var y = scrollY;
    if (Screens.cur === 'hub') {
      $('#sun').style.transform = 'translateY(' + y * .12 + 'px)';
      $('#leavesBack').style.transform = 'translateY(' + y * .06 + 'px)';
      $('#leavesFront').style.transform = 'translateY(' + y * .025 + 'px)';
    }
    var links = Screens.cur === 'cabinet' ? $$('.tabsIn a') : Screens.cur === 'hub' ? $$('#hubNav a') : [];
    if (links.length) {
      var best = null, bestTop = -1e9;
      links.forEach(function (a) {
        var el = document.getElementById(a.dataset.spy); if (!el) return;
        var top = el.getBoundingClientRect().top - (Screens.cur === 'cabinet' ? 140 : 100);
        if (top <= 0 && top > bestTop) { bestTop = top; best = a; }
      });
      links.forEach(function (a) { a.classList.toggle('active', a === best || (best === null && a === links[0])); });
    }
    scrollTick = false;
  });
}, { passive: true });

/* ==================== single animation loop ==================== */
window.addEventListener('resize', function () {
  UI.confetti.resize(); UI.measureDock();
  var g = GameRegistry[Screens.cur]; if (g && g.resize) g.resize();
});
if (window.visualViewport) visualViewport.addEventListener('resize', function () {
  var g = GameRegistry[Screens.cur]; if (g && g.resize) g.resize();
});
var meterFills = $$('.micMeterFill'), voiceWarns = $$('.voiceWarn');
var rafId = 0, last = Adapters.perf(), sessionAcc = 0;
function tick(now) {
  var dt = Math.min((now - last) / 1000, .05); last = now;
  var t = now / 1000;
  Mic.update(dt, t); Input.update(dt); UI.mascot.tick(dt);
  var g = GameRegistry[Screens.cur];
  var wind = Math.max(Mic.enabled ? Mic.level : 0, Input.wind);
  var blocked = Screens.paused || UI.drawer.isOpen() || UI.phone.isOpen() || UI.onboard.isOpen() || UI.pin.isOpen() || UI.tutorial.isOpen() || document.hidden;
  if (g && g.update && !blocked) g.update(dt, t, wind);
  AudioFX.setWind(g && g.windSound && !blocked ? wind : 0);
  UI.confetti.update(dt);
  if (S().session) {
    sessionAcc += dt;
    if (sessionAcc > .5) {
      sessionAcc = 0;
      var txt = UI.sessionFmt(UI.sessionElapsed());
      $('#sessTime').textContent = txt;
      var live = $('#sessTimerLive'); if (live) live.textContent = txt;
    }
  }
  var lv = Mic.level;
  meterFills.forEach(function (m) { m.style.transform = 'scaleX(' + lv + ')'; });
  voiceWarns.forEach(function (w) { w.classList.toggle('show', Mic.enabled && Mic.voiceOnly); });
  if (Mic.voiceOnly && t - lastVoiceToast > 7) { lastVoiceToast = t; UI.toast('Это голос 🗣️ А нужен выдох — подуй 🌬️'); }
  if (finePointer && !coarse && Adapters.perf() - lastMove > 6000) document.body.classList.add('cursor-idle');
  if (Screens.cur === 'cabinet') {
    Cabinet.idle += dt;
    var acc = S().settings.access;
    if (acc.pinHash && Cabinet.unlocked && Cabinet.idle > acc.autoLockMin * 60) {
      Cabinet.unlocked = false; Screens.go('hub'); UI.pin.open(); UI.toast('Кабинет заблокирован 🔒');
    }
  }
  rafId = Adapters.raf(tick);
}
function startLoop() { if (rafId) Adapters.caf(rafId); last = Adapters.perf(); rafId = Adapters.raf(tick); }

/* ==================== boot ==================== */
function boot() {
  applySettings();
  UI.renderGrid();
  UI.refreshHeader();
  Cabinet.renderMethod();
  Screens.go('hub');
  startLoop();
  UI.measureDock();
  if (DB.migratedFrom) UI.toast('Данные перенесены из ' + DB.migratedFrom + ' в формат v4 ✅');
  if (DB.issue) {
    var raw = DB.issue;
    UI.drawer.open('Несовместимый формат данных',
      '<p class="lead">В хранилище найден старый формат без версии. Перед сбросом сохраните копию — потом её можно импортировать.</p>' +
      '<div class="dActions"><button class="btnP sky" id="incExport">📦 Скачать старые данные</button><button class="btnP red" id="incReset">🗑 Начать заново</button><button class="btnG" id="incKeep">Оставить как есть</button></div>',
      function () {
        $('#incExport').addEventListener('click', function () { UI.download('tigra-legacy-' + Adapters.now() + '.json', JSON.stringify(raw, null, 2), 'application/json'); UI.toast('Старые данные сохранены 📦'); });
        $('#incReset').addEventListener('click', function () { Store.dispatch({ type: 'db/replace', payload: Core.seed(Adapters.now()) }); UI.drawer.close(); applySettings(); UI.renderGrid(); Cabinet.renderAll(); UI.toast('База создана заново'); });
        $('#incKeep').addEventListener('click', function () { UI.drawer.close(); });
      });
  }
  if (!S().profiles.length) UI.onboard.open();
  if (Adapters.speech()) Adapters.speech().onvoiceschanged = function () { if (Screens.cur === 'cabinet') Cabinet.renderSettings(); };
  Adapters.log('Игры Попугая v' + APP.version + ' — Core/Store/DB/AudioFX/KeshaVoice/Mic/Games/UI/Cabinet готовы');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* Debug + Unity-port reference handle */
window.Kesha = { Core: Core, Store: Store, DB: DB, AudioFX: AudioFX, KeshaVoice: KeshaVoice, Mic: Mic, GameRegistry: GameRegistry, Achievements: Achievements, UI: UI, Cabinet: Cabinet, Adapters: Adapters };
})();