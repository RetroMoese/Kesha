// kesha-extra.js — drop-in enhancement module for the single-file "Игры Попугая" build.
// Adds: neural voice (edge-tts MP3 layer), neural ASR pronunciation check, optional LLM connector,
// specialist gift cards (real rewards), achievements tab, coupon printing, cabinet polish.
// Load AFTER the main inline script: <script src="kesha-extra.js"></script> before </body>.
(function () {
'use strict';
if (typeof DB === 'undefined' || typeof Screens === 'undefined') { console.warn('kesha-extra: base app not found'); return; }

/* ================= storage ================= */
var XKEY = 'kesha-extra-v1';
var X = {
  cfg: { neuralVoice: true, asr: true, suggestGift: true, llm: { enabled: false, endpoint: 'https://api.openai.com/v1', key: '', model: 'gpt-4o-mini' } },
  gifts: [
    { id: 'candy', name: 'Конфетка', emoji: '🍬', color: '#E84393', desc: 'Маленькая сладость за старание', stock: -1 },
    { id: 'scratch', name: 'Скретч-карточка', emoji: '🌟', color: '#FFC53D', desc: 'Скребику-сюрприз от мамы', stock: 5 },
    { id: 'sticker', name: 'Наклейка', emoji: '🎈', color: '#0E7DC2', desc: 'Блестящая наклейка в дневник', stock: -1 },
    { id: 'cookie', name: 'Печенька', emoji: '🍪', color: '#E85D04', desc: 'Домашняя печенька', stock: 3 },
    { id: 'toy', name: 'Мини-игрушка', emoji: '🧸', color: '#4CA818', desc: 'Главный приз месяца', stock: 1 },
    { id: 'coloring', name: 'Раскраска', emoji: '🖍️', color: '#7A2E5E', desc: 'Раскраска с попугаями', stock: -1 }
  ],
  issued: [], achLog: [], asrGood: 0, intros: {}
};
function xload() { try { var r = JSON.parse(localStorage.getItem(XKEY) || 'null'); if (r) { X.cfg = Object.assign(X.cfg, r.cfg || {}); X.cfg.llm = Object.assign(X.cfg.llm, (r.cfg && r.cfg.llm) || {}); X.gifts = r.gifts || X.gifts; X.issued = r.issued || []; X.achLog = r.achLog || []; X.asrGood = r.asrGood || 0; X.intros = r.intros || {}; } } catch (e) {} }
function xsave() { try { localStorage.setItem(XKEY, JSON.stringify({ cfg: X.cfg, gifts: X.gifts, issued: X.issued, achLog: X.achLog, asrGood: X.asrGood, intros: X.intros })); } catch (e) {} }
xload();

/* ================= injected styles ================= */
var css = document.createElement('style');
css.textContent = [
  '.xq{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}',
  '#cab-gifts .giftGrid,#cab-ach .achGrid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}',
  '.giftCard{position:relative;background:var(--surface);color:var(--ink);border:3px solid var(--gc,var(--tiger));border-radius:20px;padding:14px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.26);transition:transform .3s var(--ease),box-shadow .3s var(--ease)}',
  '.giftCard::before{content:"";position:absolute;top:-60%;left:-80%;width:60%;height:220%;transform:rotate(20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);transition:left .6s var(--ease)}',
  '.giftCard:hover{transform:translateY(-3px) rotate(-.4deg)}.giftCard:hover::before{left:130%}',
  '.giftCard .em{font-size:40px;line-height:1;display:block;margin-bottom:6px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.25))}',
  '.giftCard h4{font-family:var(--disp);font-size:15px;margin-bottom:3px}',
  '.giftCard p{font-size:12px;font-weight:700;color:var(--ink-soft);line-height:1.4;min-height:32px}',
  '.giftCard .stock{position:absolute;top:10px;right:10px;font-size:11px;font-weight:900;background:var(--gc);color:#fff;border-radius:999px;padding:3px 9px}',
  '.giftCard .btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
  '.achItem{display:flex;gap:11px;align-items:flex-start;background:var(--surface);border:2.5px solid var(--line);border-radius:16px;padding:12px;color:var(--ink)}',
  '.achItem.on{border-color:var(--gold);box-shadow:0 0 0 3px rgba(255,197,61,.18)}',
  '.achItem.off{opacity:.7}.achItem.off .em{filter:grayscale(1)}',
  '.achItem .em{width:46px;height:46px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;background:radial-gradient(circle at 34% 28%,#FFF3C4,var(--gold));border:2px solid #C88A0A}',
  '.achItem h4{font-family:var(--disp);font-size:14px;margin-bottom:3px}.achItem p{font-size:11.5px;font-weight:700;color:var(--ink-soft);line-height:1.35}',
  '.achItem .dt{display:block;margin-top:5px;font-size:10.5px;font-weight:900;color:var(--star-ink)}',
  '#giftScrim{position:fixed;inset:0;z-index:96;background:var(--scrim);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px}',
  '.flipWrap{width:min(380px,92vw);perspective:1200px}',
  '.flipCard{position:relative;width:100%;min-height:420px;transform-style:preserve-3d;transition:transform .7s var(--ease)}',
  '.flipWrap.flipped .flipCard{transform:rotateY(180deg)}',
  '.flipFace{position:absolute;inset:0;backface-visibility:hidden;border-radius:26px;border:4px solid var(--ink);padding:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;box-shadow:0 26px 70px rgba(0,0,0,.55)}',
  '.flipFace.front{background:linear-gradient(160deg,var(--gc,#FFC53D),#FFF6E3 70%);color:var(--ink)}',
  '.flipFace.front::after{content:"";position:absolute;inset:0;border-radius:22px;background:repeating-linear-gradient(115deg,transparent 0 26px,rgba(255,255,255,.35) 26px 34px);pointer-events:none;animation:holo 2.6s linear infinite}',
  '@keyframes holo{to{background-position:68px 0}}',
  '.flipFace.back{background:var(--surface);color:var(--ink);transform:rotateY(180deg)}',
  '.flipFace .big{font-size:76px;line-height:1;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));animation:giftBob 2.2s var(--ease) infinite}',
  '@keyframes giftBob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-9px) rotate(4deg)}}',
  '.flipFace h3{font-family:var(--disp);font-size:22px}.flipFace p{font-size:13.5px;font-weight:700;color:var(--ink-soft);line-height:1.45}',
  '.flipFace .hold{font-size:12px;font-weight:900;color:#fff;background:var(--gc);border-radius:999px;padding:5px 12px}',
  '.asrPill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:900;border-radius:999px;padding:7px 12px;background:rgba(55,196,240,.16);border:2px solid var(--sky);color:var(--sky);min-height:40px}',
  '.asrPill.rec{background:rgba(255,77,94,.2);border-color:var(--coral);color:var(--coral);animation:micPulse 1s linear infinite alternate}',
  '#couponSheet{display:none}',
  '@media print{body.print-coupons #couponSheet{display:block}body.print-coupons main,body.print-coupons #hdr,body.print-coupons #toasts,body.print-coupons #fx{display:none!important}}',
  '.coupon{border:2px dashed #666;border-radius:14px;padding:14px;margin:0 0 12px;break-inside:avoid;color:#000;background:#fff}',
  '.coupon b{font-size:15px}.coupon span{display:block;font-size:12px;margin-top:4px}',
  '.panelCream{position:relative;overflow:hidden}.panelCream::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--scarlet),var(--gold),var(--leaf),var(--sea));opacity:.85}'
].join('\n');
document.head.appendChild(css);

/* ================= neural voice layer (edge-tts MP3 -> SpeechSynthesis fallback) ================= */
var NV = {
  manifest: {
    'ui.hello': 'assets/audio/game-welcome.mp3',
    'intro.ship': 'assets/audio/ship-intro.mp3', 'intro.balloon': 'assets/audio/balloon-intro.mp3',
    'intro.odd': 'assets/audio/odd-intro.mp3', 'intro.rhythm': 'assets/audio/rhythm-intro.mp3',
    'intro.hard': 'assets/audio/hard-intro.mp3', 'intro.syll': 'assets/audio/syll-intro.mp3', 'intro.math': 'assets/audio/math-intro.mp3',
    'gift.issue': 'assets/audio/praise-perfect.mp3', 'asr.listen': 'assets/audio/mic-ready.mp3',
    'asr.good': 'assets/audio/praise-round-1.mp3', 'asr.try': 'assets/audio/praise-round-4.mp3'
  },
  missing: {}, audio: null,
  speakOn: function (on) { var w = $('#mascotWrap'), k = $('#keshaSays'); if (w) w.classList.toggle('speaking', on); if (k) k.classList.toggle('speaking', on); },
  say: function (key, fallback, opt) {
    opt = opt || {};
    if (AudioFX.muted || !DB.d.settings.tts) return false;
    var url = X.cfg.neuralVoice ? this.manifest[key] : null;
    var self = this;
    if (url && !this.missing[key]) {
      var a = new Audio(url); a.volume = clamp(AudioFX.volume, 0, 1);
      this.audio = a; this.speakOn(true);
      var died = function () { self.missing[key] = true; self.speakOn(false); self.audio = null; Speech.say(fallback, opt); };
      a.onerror = died;
      a.onended = function () { self.speakOn(false); self.audio = null; if (opt.onEnd) opt.onEnd(); };
      var p = a.play();
      if (p && p.catch) p.catch(died);
      return true;
    }
    return Speech.say(fallback, opt);
  },
  stop: function () { if (this.audio) { try { this.audio.pause(); } catch (e) {} this.audio = null; } this.speakOn(false); }
};
var INTRO_TEXT = {
  ship: 'Дуй в микрофон — ветер надует парус. Проплывай звёздные ворота и не переставай дуть.',
  balloon: 'Дуй плавно и мягко. Надуй шарик до золотой метки и удерживай.',
  odd: 'Найди картинку, которая не подходит к остальным, и объясни почему.',
  rhythm: 'Слушай, как Кеша стучит: БУМ и ТИК. Потом повтори узор.',
  hard: 'Кеша скажет слог. Твёрдый звук — на синий камень, мягкий — на зелёную травку.',
  syll: 'Кеша прохлопает слово по слогам. Повтори голосом или пробелом в такт.',
  math: 'Будем считать. Слушай задание и выбирай правильный ответ.'
};
var _go = Screens.go.bind(Screens);
Screens.go = function (id) {
  _go(id);
  if (INTRO_TEXT[id] && !X.intros[id]) {
    X.intros[id] = 1; xsave();
    setTimeout(function () { NV.say('intro.' + id, INTRO_TEXT[id]); }, 500);
  }
};

/* ================= neural ASR: pronunciation check ================= */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function norm(s) { return String(s).toLowerCase().replace(/[^a-zа-яё0-9]/gi, ''); }
function lev(a, b) { var m = a.length, n = b.length; if (!m) return n; if (!n) return m; var prev = [], cur = [], i, j; for (j = 0; j <= n; j++) prev[j] = j; for (i = 1; i <= m; i++) { cur[0] = i; for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur.slice(); } return prev[n]; }
function recognize(ms) {
  return new Promise(function (res, rej) {
    if (!SR) return rej(new Error('no-asr'));
    var r = new SR(); r.lang = 'ru-RU'; r.interimResults = false; r.maxAlternatives = 1;
    var done = false;
    r.onresult = function (e) { done = true; res(e.results[0][0].transcript); };
    r.onerror = function (e) { if (!done) rej(new Error(e.error)); };
    r.onend = function () { if (!done) rej(new Error('empty')); };
    r.start(); setTimeout(function () { try { r.stop(); } catch (e) {} }, ms || 4200);
  });
}
function asrButton(hostSel, getTarget, label) {
  var host = $(hostSel); if (!host || !SR || !X.cfg.asr) return;
  if (host.querySelector('.asrPill')) return;
  var b = document.createElement('button');
  b.className = 'asrPill'; b.type = 'button'; b.innerHTML = '🎙 ' + label;
  b.title = 'Нейросеть проверит произношение (нужен Chrome и https)';
  b.addEventListener('click', function () {
    var target = norm(getTarget()); if (!target) return;
    b.classList.add('rec'); b.textContent = '🎙 Слушаю…';
    NV.say('asr.listen', 'Слушаю! Скажи слово громко и четко.');
    setTimeout(function () {
      recognize(4500).then(function (text) {
        var got = norm(text), d = lev(got, target), ratio = 1 - d / Math.max(1, Math.max(got.length, target.length));
        b.classList.remove('rec'); b.innerHTML = '🎙 ' + label;
        if (ratio >= 0.8) {
          X.asrGood++; xsave();
          NV.say('asr.good', 'Вот это произношение! Всё верно.');
          praise('round', { text: '🎙 ' + Math.round(ratio * 100) + '% совпадение!' });
          Confetti.burst(innerWidth / 2, innerHeight * .4, 20);
          checkStickers({ game: 'asr', metric: { ratio: ratio } });
          toast('🎙 «' + text + '» — совпадение ' + Math.round(ratio * 100) + '% ✅', 'ok');
        } else {
          NV.say('asr.try', 'Почти! Попробуй ещё раз, медленнее.');
          toast('🎙 «' + (text || '…') + '» — совпадение ' + Math.round(ratio * 100) + '%. Попробуй ещё 🪶');
          Mascot.pose('sad');
        }
      }).catch(function () { b.classList.remove('rec'); b.innerHTML = '🎙 ' + label; toast('Не расслышал 🙉 Скажи громче или проверь микрофон'); });
    }, 900);
  });
  host.appendChild(b);
}

/* ================= optional LLM connector ================= */
function llm(prompt) {
  var c = X.cfg.llm;
  if (!c.enabled || !c.key) return Promise.reject(new Error('llm-off'));
  return fetch(c.endpoint.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
    body: JSON.stringify({ model: c.model, temperature: .8, max_tokens: 320, messages: [
      { role: 'system', content: 'Ты дружелюбный ассистент детского логопеда. Пиши по-русски, тепло, коротко, без медицинских терминов.' },
      { role: 'user', content: prompt } ] })
  }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) { return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : ''; });
}

/* ================= gift cards ================= */
function giftById(id) { return X.gifts.filter(function (g) { return g.id === id; })[0]; }
function buildGiftDom() {
  if ($('#cab-gifts')) return;
  var tabs = $('.tabsIn');
  var a = document.createElement('a'); a.href = '#cab-gifts'; a.dataset.spy = 'cab-gifts'; a.textContent = '🎁 Подарки';
  tabs.insertBefore(a, tabs.querySelector('[data-spy="cab-settings"]'));
  var a2 = document.createElement('a'); a2.href = '#cab-ach'; a2.dataset.spy = 'cab-ach'; a2.textContent = '🏆 Достижения';
  tabs.insertBefore(a2, a);
  var sec = document.createElement('div'); sec.className = 'cabSec'; sec.id = 'cab-gifts';
  sec.innerHTML = '<div class="cabHead"><h2>🎁 Подарки от специалиста</h2><span class="sub">Реальные призы: конфетки, скребики, наклейки</span>' +
    '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><button class="btnP small berry" id="gAdd">＋ Подарок</button><button class="btnG small" id="gPrint">🖨 Лист купонов</button></div></div>' +
    '<div class="giftGrid" id="giftGrid"></div><div style="margin-top:16px"><h3 style="font-family:var(--disp);font-size:16px;margin-bottom:10px">История вручения</h3><div id="giftHist"></div></div>';
  $('#cab-goals').after(sec);
  var sec2 = document.createElement('div'); sec2.className = 'cabSec'; sec2.id = 'cab-ach';
  sec2.innerHTML = '<div class="cabHead"><h2>🏆 Достижения</h2><span class="sub" id="achStats2"></span></div><div class="achGrid2" id="achGrid2"></div>';
  $('#cab-gifts').after(sec2);
  var scrim = document.createElement('div'); scrim.id = 'giftScrim'; scrim.hidden = true;
  scrim.innerHTML = '<div class="flipWrap" id="flipWrap"><div class="flipCard">' +
    '<div class="flipFace front"><span class="hold" id="gfHold">Кеша держит подарок</span><span class="big" id="gfEmoji">🍬</span><h3 id="gfName">Конфетка</h3><p id="gfDesc"></p><p style="font-weight:900;color:var(--ink)" id="gfChild"></p></div>' +
    '<div class="flipFace back"><h3>🎁 Вручить сейчас?</h3><p id="gfComment"></p><p id="gfMeta" style="font-size:12px"></p>' +
    '<div class="dActions" style="justify-content:center"><button class="btnP green" id="gfGive">✅ Мама даёт подарок</button><button class="btnG" id="gfFlip">↩ Перевернуть</button><button class="btnG" id="gfLater">Позже</button></div></div>' +
    '</div></div>';
  document.body.appendChild(scrim);
  var sheet = document.createElement('div'); sheet.id = 'couponSheet'; document.body.appendChild(sheet);
  $('#gfFlip').addEventListener('click', function () { $('#flipWrap').classList.remove('flipped'); AudioFX.click(); });
  $('#gfLater').addEventListener('click', function () { closeGift(); });
  $('#gfGive').addEventListener('click', function () {
    var rec = pendingGift; if (!rec) return closeGift();
    rec.given = true; rec.givenAt = new Date().toISOString(); xsave();
    closeGift(); renderGifts();
    Confetti.rain(70); AudioFX.fanfare(); Mascot.pose('perfect');
    toast('Подарок вручён! ' + (giftById(rec.giftId) || {}).emoji + ' ' + (giftById(rec.giftId) || {}).name, 'ok');
  });
  $('#gAdd').addEventListener('click', giftForm);
  $('#gPrint').addEventListener('click', printCoupons);
}
var pendingGift = null;
function openGift(rec) {
  pendingGift = rec;
  var g = giftById(rec.giftId) || { name: 'Подарок', emoji: '🎁', desc: '', color: '#FFC53D' };
  var p = DB.byId(rec.pid) || { name: '—', avatar: '🦜' };
  var w = $('#flipWrap');
  w.style.setProperty('--gc', g.color);
  w.querySelector('.front').style.setProperty('--gc', g.color);
  $('#gfEmoji').textContent = g.emoji; $('#gfName').textContent = g.name; $('#gfDesc').textContent = g.desc;
  $('#gfChild').textContent = p.avatar + ' ' + p.name + ' заслужил(а)!';
  $('#gfComment').textContent = rec.comment || 'Кеша очень гордится тобой!';
  $('#gfMeta').textContent = 'Выдал: ' + DB.d.settings.specialist + ' • ' + new Date(rec.date).toLocaleString('ru-RU');
  w.classList.remove('flipped');
  $('#giftScrim').hidden = false;
  NV.say('gift.issue', p.name + ', это тебе! Кеша держит подарок, а мама сейчас вручит его по-настоящему.');
  setTimeout(function () { w.classList.add('flipped'); }, 2100);
}
function closeGift() { $('#giftScrim').hidden = true; pendingGift = null; NV.stop(); }
function issueGift(pid, giftId, comment, via) {
  var g = giftById(giftId); if (!g) return;
  if (g.stock > 0) { g.stock--; }
  var rec = { id: uid(), giftId: giftId, pid: pid, date: new Date().toISOString(), comment: comment || '', via: via || 'manual', given: false };
  X.issued.unshift(rec); xsave();
  openGift(rec);
  return rec;
}
function giftForm(edit) {
  var g = edit || { name: '', emoji: '🎁', color: '#FFC53D', desc: '', stock: -1 };
  Drawer.open(edit ? 'Изменить подарок' : 'Новый подарок',
    '<p class="lead">Это реальный приз, который мама держит в кабинете: конфетка, скребику, наклейка.</p>' +
    '<div class="field"><label for="ggName">Название</label><input class="inp" id="ggName" type="text" maxlength="30" value="' + esc(g.name) + '" placeholder="Скретч-карточка"></div>' +
    '<div class="field"><label for="ggEmoji">Эмодзи</label><input class="inp" id="ggEmoji" type="text" maxlength="4" value="' + esc(g.emoji) + '"></div>' +
    '<div class="field"><label for="ggDesc">Описание (за что даём)</label><textarea class="inp" id="ggDesc" maxlength="120">' + esc(g.desc) + '</textarea></div>' +
    '<div class="field"><label for="ggStock">Остаток: <span id="ggStockVal">' + (g.stock < 0 ? '∞' : g.stock) + '</span></label><input type="range" id="ggStock" min="-1" max="50" step="1" value="' + g.stock + '" style="width:100%"></div>' +
    '<div class="field"><label>Цвет карточки</label><div class="pickRow" id="ggColor">' + ['#FF7A1A', '#E84393', '#0E7DC2', '#4CA818', '#F5A623', '#7A2E5E', '#0C8A5A', '#E8332F'].map(function (c) { return '<button class="pick' + (c === g.color ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div></div>' +
    '<div class="dActions"><button class="btnP green" id="ggSave">💾 Сохранить</button><button class="btnG" id="ggNo">Отмена</button></div>',
    function () {
      var color = g.color;
      $('#ggStock').addEventListener('input', function (e) { $('#ggStockVal').textContent = e.target.value < 0 ? '∞' : e.target.value; });
      $('#ggColor').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#ggColor .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); });
      $('#ggNo').addEventListener('click', function () { Drawer.close(); });
      $('#ggSave').addEventListener('click', function () {
        var name = $('#ggName').value.trim(); if (name.length < 2) { toast('Введите название', 'bad'); return; }
        var rec = { name: name, emoji: $('#ggEmoji').value.trim() || '🎁', desc: $('#ggDesc').value.trim(), stock: +$('#ggStock').value, color: color };
        if (edit) Object.assign(edit, rec); else X.gifts.push(Object.assign({ id: uid() }, rec));
        xsave(); Drawer.close(); renderGifts(); AudioFX.success(); toast('Подарок сохранён 🎁', 'ok');
      });
    });
}
function renderGifts() {
  var grid = $('#giftGrid'); if (!grid) return;
  grid.innerHTML = '';
  X.gifts.forEach(function (g) {
    var d = document.createElement('div');
    d.className = 'giftCard'; d.style.setProperty('--gc', g.color);
    d.innerHTML = '<span class="stock">' + (g.stock < 0 ? '∞' : 'осталось ' + g.stock) + '</span><span class="em">' + g.emoji + '</span><h4>' + esc(g.name) + '</h4><p>' + esc(g.desc || '—') + '</p>' +
      '<div class="btns"><button class="btnP small" data-issue="' + g.id + '">🎁 Выдать</button><button class="btnG small" data-edit="' + g.id + '">✏</button><button class="btnG small danger" data-del="' + g.id + '">🗑</button></div>';
    d.querySelector('[data-issue]').addEventListener('click', function () {
      var p = DB.child(); if (!p) { toast('Сначала выберите ребёнка', 'bad'); return; }
      if (g.stock === 0) { toast('Подарки закончились — пополните остаток', 'bad'); return; }
      issueGift(p.id, g.id, '', 'manual');
    });
    d.querySelector('[data-edit]').addEventListener('click', function () { giftForm(g); });
    d.querySelector('[data-del]').addEventListener('click', function () {
      var i = X.gifts.indexOf(g); X.gifts.splice(i, 1); xsave(); renderGifts();
      toast('Подарок удалён', 'bad', { label: 'Отменить', fn: function () { X.gifts.splice(i, 0, g); xsave(); renderGifts(); } });
    });
    grid.appendChild(d);
  });
  var hist = $('#giftHist');
  var list = X.issued.slice(0, 12);
  hist.innerHTML = list.length ? list.map(function (r) {
    var g = giftById(r.giftId) || { emoji: '🎁', name: '—' }, p = DB.byId(r.pid) || { name: '—', avatar: '❔' };
    return '<div class="jRow" style="cursor:default"><div class="jKid">' + p.avatar + ' ' + esc(p.name) + '</div><div class="jGames"><span>' + g.emoji + ' ' + esc(g.name) + '</span></div>' +
      '<div class="jDate">' + new Date(r.date).toLocaleDateString('ru-RU') + '<small>' + (r.via === 'auto' ? 'подсказка Кеши' : 'вручную') + '</small></div>' +
      '<div class="jBtns"><label class="switch" style="font-size:12px"><input type="checkbox" data-given="' + r.id + '"' + (r.given ? ' checked' : '') + '> вручён</label></div></div>';
  }).join('') : '<div class="empty"><b>🎁</b>Пока никто не получил подарок. Выдайте первый — Кеша покажет карточку.</div>';
  hist.querySelectorAll('[data-given]').forEach(function (c) {
    c.addEventListener('change', function () {
      var r = X.issued.filter(function (x) { return x.id === c.dataset.given; })[0]; if (!r) return;
      r.given = c.checked; r.givenAt = c.checked ? new Date().toISOString() : null; xsave();
      toast(c.checked ? 'Отмечено как вручённый ✅' : 'Отметка снята');
    });
  });
}
function renderAch() {
  var host = $('#achGrid2'); if (!host) return;
  var p = DB.child();
  $('#achStats2').textContent = p ? ('Открыто ' + Object.keys(p.stickers).length + ' из ' + STICKERS.length + ' • ' + p.name) : '';
  host.innerHTML = '';
  if (!p) { host.innerHTML = '<div class="empty"><b>🏆</b>Выберите ребёнка</div>'; return; }
  STICKERS.forEach(function (s) {
    var on = !!p.stickers[s.id];
    var log = X.achLog.filter(function (l) { return l.id === s.id && l.pid === p.id; })[0];
    var d = document.createElement('div');
    d.className = 'achItem ' + (on ? 'on' : 'off');
    d.innerHTML = '<span class="em">' + s.em + '</span><div><h4>' + esc(s.name) + (on ? '' : ' 🔒') + '</h4><p>' + esc(s.desc) + '</p>' +
      (on && log ? '<span class="dt">получено ' + new Date(log.date).toLocaleDateString('ru-RU') + (log.game && GAMES[log.game] ? ' • ' + GAMES[log.game].n : '') + '</span>' : '') + '</div>';
    host.appendChild(d);
  });
}
function printCoupons() {
  var p = DB.child(); if (!p) { toast('Сначала выберите ребёнка', 'bad'); return; }
  var rows = X.issued.filter(function (r) { return r.pid === p.id && !r.given; }).slice(0, 6);
  if (!rows.length) rows = X.issued.filter(function (r) { return r.pid === p.id; }).slice(0, 6);
  if (!rows.length) { toast('Нет выданных подарков для купонов', 'bad'); return; }
  $('#couponSheet').innerHTML = '<h1 style="font-size:20px;margin-bottom:4px">Купоны подарков — ' + esc(p.name) + '</h1>' +
    '<p style="font-size:12px;margin-bottom:14px">' + esc(DB.d.settings.cabinetName) + ' • ' + new Date().toLocaleDateString('ru-RU') + ' • вырезать по пунктиру</p>' +
    rows.map(function (r) { var g = giftById(r.giftId) || { emoji: '🎁', name: '—' };
      return '<div class="coupon"><b>' + g.emoji + ' ' + esc(g.name) + '</b><span>Для: ' + esc(p.name) + ' • от ' + esc(DB.d.settings.specialist) + '</span><span>Дата: ' + new Date(r.date).toLocaleDateString('ru-RU') + ' • подпись: ____________</span></div>'; }).join('');
  document.body.classList.add('print-coupons');
  var done = function () { document.body.classList.remove('print-coupons'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/* ================= wrap base renderers ================= */
var _rc = window.renderCabinet;
window.renderCabinet = function () { _rc(); buildGiftDom(); renderGifts(); renderAch(); };
var _cs = window.checkStickers;
window.checkStickers = function (ctx) {
  var p = DB.child(), before = p ? Object.keys(p.stickers).length : 0;
  var res = _cs(ctx);
  var after = p ? Object.keys(p.stickers).length : 0;
  if (p && after > before) {
    STICKERS.forEach(function (s) {
      if (p.stickers[s.id] && !X.achLog.some(function (l) { return l.id === s.id && l.pid === p.id; })) {
        X.achLog.push({ id: s.id, pid: p.id, date: new Date().toISOString(), game: (ctx && ctx.game) || null });
      }
    });
    xsave();
  }
  return res;
};
var _award = window.award;
window.award = function (game, stars, lines, metric) {
  _award(game, stars, lines, metric);
  if (stars === 3 && X.cfg.suggestGift && Session.active()) {
    var avail = X.gifts.filter(function (g) { return g.stock !== 0; });
    if (avail.length) {
      var g = avail[Math.floor(Math.random() * avail.length)];
      toast('🎁 Идеальный раунд! Дать ' + g.emoji + ' ' + g.name + '?', 'ok', {
        label: 'Выдать', fn: function () { var p = DB.child(); if (p) issueGift(p.id, g.id, 'За идеальный раунд в игре «' + GAMES[game].n + '»', 'auto'); }
      });
    }
  }
};
var _rs = window.renderSettings;
window.renderSettings = function () {
  _rs();
  var host = $('#settingsHost'); if (!host || host.querySelector('#xSetSec')) return;
  var sec = document.createElement('div'); sec.className = 'setSec'; sec.id = 'xSetSec';
  sec.innerHTML = '<h3>🤖 Нейросети</h3>' +
    '<div class="setRow"><label>Нейро-голос Кеши (MP3 из assets/audio)</label><label class="switch"><input type="checkbox" id="xNv"' + (X.cfg.neuralVoice ? ' checked' : '') + '> включён</label></div>' +
    '<div class="setRow"><label>Проверка произношения (Web Speech ASR)</label><label class="switch"><input type="checkbox" id="xAsr"' + (X.cfg.asr ? ' checked' : '') + '> включена</label></div>' +
    '<div class="setRow"><label>Предлагать подарок за 3★</label><label class="switch"><input type="checkbox" id="xSug"' + (X.cfg.suggestGift ? ' checked' : '') + '> включено</label></div>' +
    '<div class="setRow"><label for="xLlmOn">LLM-отчёты и подсказки (OpenAI-совместимый API)</label><label class="switch"><input type="checkbox" id="xLlmOn"' + (X.cfg.llm.enabled ? ' checked' : '') + '> включён</label></div>' +
    '<div class="setRow"><label for="xLlmEp">Endpoint</label><input class="inp" id="xLlmEp" type="text" value="' + esc(X.cfg.llm.endpoint) + '"></div>' +
    '<div class="setRow"><label for="xLlmKey">API-ключ (хранится только локально)</label><input class="inp" id="xLlmKey" type="password" value="' + esc(X.cfg.llm.key) + '" placeholder="sk-…"></div>' +
    '<div class="setRow"><label for="xLlmModel">Модель</label><input class="inp" id="xLlmModel" type="text" value="' + esc(X.cfg.llm.model) + '"></div>' +
    '<div class="setRow"><label>Проверка связи</label><button class="btnG small" id="xLlmTest">🤖 Сказать «привет»</button><span class="val" id="xLlmState"></span></div>';
  host.appendChild(sec);
  $('#xNv').addEventListener('change', function (e) { X.cfg.neuralVoice = e.target.checked; xsave(); });
  $('#xAsr').addEventListener('change', function (e) { X.cfg.asr = e.target.checked; xsave(); location.reload(); });
  $('#xSug').addEventListener('change', function (e) { X.cfg.suggestGift = e.target.checked; xsave(); });
  $('#xLlmOn').addEventListener('change', function (e) { X.cfg.llm.enabled = e.target.checked; xsave(); });
  $('#xLlmEp').addEventListener('input', function (e) { X.cfg.llm.endpoint = e.target.value; xsave(); });
  $('#xLlmKey').addEventListener('input', function (e) { X.cfg.llm.key = e.target.value.trim(); xsave(); });
  $('#xLlmModel').addEventListener('input', function (e) { X.cfg.llm.model = e.target.value; xsave(); });
  $('#xLlmTest').addEventListener('click', function () {
    $('#xLlmState').textContent = '…';
    llm('Ответь одним коротким приветствием для ребёнка от попугая Кеши.').then(function (t) {
      $('#xLlmState').textContent = '✅'; toast('🤖 ' + t.slice(0, 90), 'ok');
    }).catch(function (e) { $('#xLlmState').textContent = '❌'; toast('LLM недоступен: ' + e.message + '. Работаем без него.', 'bad'); });
  });
};

/* ================= cabinet quick bar + progress LLM + help ================= */
function buildQuickBar() {
  if ($('#xQuick')) return;
  var sec = $('#cab-session'); if (!sec) return;
  var bar = document.createElement('div'); bar.className = 'xq'; bar.id = 'xQuick';
  bar.innerHTML = '<button class="btnP small berry" id="xqGift">🎁 Выдать подарок</button>' +
    '<button class="btnG small" id="xqHint">🤖 Подсказка Кеши</button>' +
    '<button class="btnG small" id="xqHelp">🤖 Как устроены нейросети</button>';
  sec.insertBefore(bar, $('#sessionPanel'));
  $('#xqGift').addEventListener('click', function () {
    var p = DB.child(); if (!p) { toast('Сначала выберите ребёнка', 'bad'); return; }
    var avail = X.gifts.filter(function (g) { return g.stock !== 0; });
    if (!avail.length) { toast('Подарки закончились', 'bad'); return; }
    Drawer.open('Кому и что дарим?', '<p class="lead">Кеша покажет карточку, а мама вручит настоящий приз.</p>' +
      '<div class="field"><label for="xqPid">Ребёнок</label><select class="inp" id="xqPid">' + DB.d.profiles.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.ava + ' ' + x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Подарок</label><div class="pickRow" id="xqPick">' + avail.map(function (g) { return '<button class="pick" data-g="' + g.id + '" title="' + esc(g.name) + '">' + g.emoji + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="xqCom">Комментарий</label><textarea class="inp" id="xqCom" placeholder="За ровный выдох на кораблике…"></textarea></div>' +
      '<div class="dActions"><button class="btnP berry" id="xqGo">🎁 Показать карточку</button><button class="btnG" id="xqNo">Отмена</button></div>',
      function () {
        var sel = null;
        $('#xqPick').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (!b) return; sel = b.dataset.g; $$('#xqPick .pick').forEach(function (x) { x.classList.toggle('on', x === b); }); AudioFX.click(); });
        $('#xqNo').addEventListener('click', function () { Drawer.close(); });
        $('#xqGo').addEventListener('click', function () {
          if (!sel) { toast('Выберите подарок', 'bad'); return; }
          var pid = $('#xqPid').value, com = $('#xqCom').value.trim();
          Drawer.close(); issueGift(pid, sel, com, 'manual');
        });
      });
  });
  $('#xqHint').addEventListener('click', function () {
    var p = DB.child(); if (!p) return;
    var stats = 'звёзд всего ' + bankTotal(p) + ', похвал ' + (p.praises || 0) + ', последняя игра: ' + ((DB.d.sessions.filter(function (s) { return s.pid === p.id; })[0] || {}).entries || []).map(function (e) { return GAMES[e.game].n; }).slice(0, 2).join(', ');
    var local = 'Кеша советует: потренируй ' + (p.sounds[0] ? 'звук [' + p.sounds[0] + '] в слогах' : 'длинный выдох на кораблике') + '. ' + stats + '.';
    toast('🤖 Думаю…');
    llm('Ребёнок ' + p.name + ', ' + DB.age(p) + ' лет. Целевые звуки: ' + (p.sounds.join(', ') || 'не указаны') + '. Статистика: ' + stats + '. Дай одну короткую дружелюбную подсказку, во что поиграть сейчас и почему.')
      .then(function (t) { toast('🤖 ' + t.slice(0, 160), 'info'); NV.say('ui.hello', t.slice(0, 160)); })
      .catch(function () { toast('🤖 ' + local, 'info'); });
  });
  $('#xqHelp').addEventListener('click', helpDrawer);
}
function helpDrawer() {
  Drawer.open('🤖 Нейросети в «Играх Попугая»',
    '<p class="lead">Три слоя ИИ, каждый включается отдельно и безопасно деградирует, если недоступен.</p>' +
    '<div class="detailList">' +
    '<div class="detailItem"><h4>🗣 Нейро-голос Кеши</h4><ul><li>MP3 генерируются офлайн: <b>pip install edge-tts</b>, затем <b>node tools/generate-audio.mjs</b>.</li><li>Файлы кладутся в assets/audio/, ключи — в манифесте модуля.</li><li>Нет файла — Кеша говорит браузерным синтезом, текст всегда в облачке.</li></ul></div>' +
    '<div class="detailItem"><h4>🎙 Нейро-распознавание речи</h4><ul><li>Встроенный в Chrome Web Speech API (ru-RU), ключ не нужен.</li><li>Кнопка «🎙 Скажи» в играх «Слоги» и «Твёрдо/мягко»: ребёнок повторяет слово, Кеша сверяет произношение и ставит процент совпадения.</li><li>Работает только по https или localhost.</li></ul></div>' +
    '<div class="detailItem"><h4>🧠 LLM (по желанию)</h4><ul><li>Настройки → Нейросети: endpoint + ключ любого OpenAI-совместимого API.</li><li>Используется для тёплого отчёта родителям и персональной подсказки «во что поиграть».</li><li>Без ключа всё работает как раньше. Ключ хранится только в этом браузере.</li></ul></div>' +
    '<div class="detailItem"><h4>💡 Что улучшить дальше</h4><ul><li>Фото-аватар ребёнка и печать индивидуального листа занятий.</li><li>Экспорт занятий в PDF-отчёт с графиком за месяц.</li><li>Напоминания о ДЗ в браузере (Notification API) по расписанию.</li><li>Режим «зеркало артикуляции»: сравнение видео-положения губ через getUserMedia.</li><li>Синхронизация между устройствами через файл-бэкап или WebDAV.</li></ul></div>' +
    '</div><div class="dActions"><button class="btnG" id="hClose">Понятно</button></div>',
    function () { $('#hClose').addEventListener('click', function () { Drawer.close(); }); });
}
function buildProgressLlm() {
  if ($('#xRepLlm')) return;
  var tools = $('#cab-progress .jTools'); if (!tools) return;
  var b = document.createElement('button'); b.className = 'btnP small berry'; b.id = 'xRepLlm'; b.textContent = '🤖 Нейро-отчёт';
  tools.appendChild(b);
  b.addEventListener('click', function () {
    var base = buildReport();
    Drawer.open('🤖 Отчёт для родителей', '<p class="lead">Сначала черновик цифрами, затем нейросеть переписывает его тёплым языком.</p>' +
      '<div class="field"><textarea class="inp" id="xRepBase" style="min-height:180px;font-family:ui-monospace,monospace;font-size:12px">' + esc(base) + '</textarea></div>' +
      '<div class="field"><label>Нейро-версия</label><textarea class="inp" id="xRepAi" style="min-height:160px" placeholder="Нажми «Сгенерировать»…"></textarea></div>' +
      '<div class="dActions"><button class="btnP berry" id="xRepGo">✨ Сгенерировать</button><button class="btnP sky" id="xRepCopy">📋 Копировать нейро</button><button class="btnG" id="xRepClose">Закрыть</button></div>',
      function () {
        $('#xRepClose').addEventListener('click', function () { Drawer.close(); });
        $('#xRepCopy').addEventListener('click', function () {
          var v = $('#xRepAi').value || $('#xRepBase').value;
          if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { toast('Скопировано 📋', 'ok'); });
          else { $('#xRepAi').select(); document.execCommand('copy'); toast('Скопировано 📋', 'ok'); }
        });
        $('#xRepGo').addEventListener('click', function () {
          $('#xRepAi').value = 'Думаю…';
          llm('Перепиши этот логопедический отчёт тёплым, ободряющим языком для родителей. Сохрани факты и цифры, добавь 1 совет для домашних занятий. Текст:\n' + base)
            .then(function (t) { $('#xRepAi').value = t; AudioFX.chime(); })
            .catch(function (e) { $('#xRepAi').value = ''; toast('LLM недоступен: ' + e.message + '. Включи его в Настройки → Нейросети.', 'bad'); });
        });
      });
  });
}

/* ================= boot hooks ================= */
function initExtra() {
  buildGiftDom(); buildQuickBar(); buildProgressLlm();
  // ASR buttons inside games
  asrButton('#screen-syll .oddTools', function () { var s = Syll.st; return s && s.rounds[s.idx] ? s.rounds[s.idx].w.replace(/-/g, '') : ''; }, 'Скажи слово');
  asrButton('#screen-hard .oddTools', function () { var s = Hard.st; return s && s.rounds[s.idx] ? s.rounds[s.idx].t : ''; }, 'Повтори слог');
  // help chip in header
  if (!$('#btnHelpX')) {
    var c = document.createElement('button'); c.className = 'chip'; c.id = 'btnHelpX'; c.title = 'Нейросети и подарки: справка'; c.textContent = '🤖';
    $('#btnCabinet').before(c);
    c.addEventListener('click', function () { AudioFX.click(); helpDrawer(); });
  }
  // extra achievement for clear speech
  if (!STICKERS.some(function (s) { return s.id === 'voice-clear'; })) {
    STICKERS.push({ id: 'voice-clear', em: '🎙', name: 'Чистый голос', desc: '5 раз произнести слово с совпадением 80%+', test: function () { return X.asrGood >= 5; } });
  }
  if (Screens.cur === 'cabinet') { renderGifts(); renderAch(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initExtra);
else initExtra();
window.KeshaExtra = { X: X, NV: NV, issueGift: issueGift, giftForm: giftForm, printCoupons: printCoupons, llm: llm, help: helpDrawer };
})();