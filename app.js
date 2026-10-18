/* Memory Lane Songbook: big sing-along lyrics for the TV in memory care.

   Screens: welcome → song list → title card (facts, "Listen for…") → lyrics (slow autoscroll)
   → "Let's talk" questions → back to the list. Plus a song editor and Settings.

   Songs are records in one list ("items"), each stamped with when it last changed:
     song     – title, artist, year, cats (groups), seconds (scroll time), facts, listen, ask, lyrics
     settings – categories (the order of the group buttons)
   The list lives in the public repo davyrockett/memory-lane-data (data.json). Any device can read
   it; saving changes needs David's access key (Settings). Written for older TV browsers too, so no
   optional chaining (?.) or ??. */

var DATA_REPO = 'davyrockett/memory-lane-data';
var DATA_FILE = 'data.json';
// Published copy of the songs, on the same site as the app (works on davyrockett.github.io and davyrockett.com).
var PAGES_COPY = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'https://davyrockett.github.io/memory-lane-data/'
  : location.protocol + '//' + location.host + '/memory-lane-data/';
var K = {
  data: 'ml.data', token: 'ml.sync-token', last: 'ml.sync-last', dirty: 'ml.dirty',
  theme: 'ml.theme', size: 'ml.size', count: 'ml.countdown', speeds: 'ml.speeds', group: 'ml.group', sung: 'ml.sung', mode: 'ml.mode', per: 'ml.per',
};
var THEMES = ['light', 'dark', 'blue'];
var SIZES = ['smaller', 'normal', 'bigger'];

function $(id) { return document.getElementById(id); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function lines(text) { return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
var toastTimer;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
}

/* ---------- Data ---------- */
var items = {};
try { items = JSON.parse(lsGet(K.data) || '{}').items || {}; } catch (e) { items = {}; }
function get(id) { var r = items[id]; return r && !r.deleted ? Object.assign({ id: id }, r) : null; }
function sortKey(t) { return String(t || '').replace(/^[(‘'"“]+/, '').replace(/^the /i, '').toLowerCase(); }
function allSongs() {
  return Object.keys(items).map(get).filter(function (r) { return r && r.type === 'song'; })
    .sort(function (a, b) { return sortKey(a.title).localeCompare(sortKey(b.title)); });
}
function groups() {
  var s = get('settings');
  var list = (s && s.categories ? s.categories : []).slice();
  allSongs().forEach(function (song) { (song.cats || []).forEach(function (c) { if (list.indexOf(c) < 0) list.push(c); }); });
  return list;
}
function saveLocal() { lsSet(K.data, JSON.stringify({ items: items })); }
function put(id, rec) {
  var clean = Object.assign({}, rec);
  delete clean.id;
  clean.updatedAt = new Date().toISOString();
  items[id] = clean;
  saveLocal();
  if (!sync.isOn()) lsSet(K.dirty, '1');
  sync.soon();
}

// Scroll speed: David's tweaks on this device win over the song's saved time.
function speeds() { try { return JSON.parse(lsGet(K.speeds) || '{}'); } catch (e) { return {}; } }
function secondsFor(song) { var s = speeds()[song.id]; return s || song.seconds || 150; }
function setSeconds(song, secs) {
  secs = Math.max(30, Math.min(900, Math.round(secs)));
  var map = speeds(); map[song.id] = secs; lsSet(K.speeds, JSON.stringify(map));
  if (sync.isOn()) {
    var rec = get(song.id);
    if (rec) { rec.seconds = secs; put(song.id, rec); }
  }
  return secs;
}
// Songs sung today get a small check on the song list, so nothing gets sung twice by accident.
function today() { return new Date().toLocaleDateString('en-CA'); }
function sungToday() {
  try { var d = JSON.parse(lsGet(K.sung) || '{}'); return d.date === today() ? d.ids || [] : []; } catch (e) { return []; }
}
function markSung(id) {
  var ids = sungToday();
  if (ids.indexOf(id) < 0) ids.push(id);
  lsSet(K.sung, JSON.stringify({ date: today(), ids: ids }));
}
function mmss(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

/* ---------- Screens ---------- */
var current = 'welcome';
function show(name) {
  ['welcome', 'list', 'card', 'lyrics', 'talk', 'editor', 'slides'].forEach(function (n) { $(n).hidden = n !== name; });
  if (current === 'lyrics' && name !== 'lyrics') stopLyrics();
  current = name;
  document.body.classList.remove('hide-cursor');
}

/* ---------- Welcome ---------- */
function renderWelcome() {
  var now = new Date();
  var m = now.getMonth();
  var season = m === 11 || m < 2 ? 'Winter' : m < 5 ? 'Spring' : m < 8 ? 'Summer' : 'Fall';
  $('welcome-day').textContent = 'Today is ' + now.toLocaleDateString('en-US', { weekday: 'long' });
  $('welcome-date').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' · ' + season;
}
function openWelcome() { renderWelcome(); show('welcome'); $('welcome-go').focus(); }
$('welcome-go').addEventListener('click', function () { openList(); });
$('welcome-full').addEventListener('click', function () {
  var d = document.documentElement;
  var req = d.requestFullscreen || d.webkitRequestFullscreen;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else if (req) req.call(d);
});
setInterval(function () { if (current === 'welcome') renderWelcome(); }, 60000);

/* ---------- Song list ---------- */
var group = lsGet(K.group) || 'all';
var lastSongId = null;
// Decade buttons are worked out from each song's year, so they never need editing.
var DECADES = [
  { key: 'dec:old', label: 'Before 1940', test: function (y) { return y < 1940; } },
  { key: 'dec:4050', label: '1940s & 50s', test: function (y) { return y >= 1940 && y < 1960; } },
  { key: 'dec:60', label: '1960s', test: function (y) { return y >= 1960 && y < 1970; } },
  { key: 'dec:7080', label: '1970s & 80s', test: function (y) { return y >= 1970; } },
];
function decade(key) { return DECADES.filter(function (d) { return d.key === key; })[0]; }
// A soft colour for each group: a dot on its button, a stripe on its songs' tiles, a tint on the title card.
// Groups added later get one from the spare list. Decades share a quiet slate blue.
var GROUP_COLORS = {
  'Sing-Along Favorites': '#E8822A', 'Love Songs': '#D45D79', 'Feel-Good': '#D9A21B', 'Gentle': '#6FA36B',
  'Moon, Sun & Sky': '#4F8FC4', 'Travel & Home': '#2F9C94', 'Country & Western': '#B36A2E', 'Elvis': '#8B62B8',
  'The Beatles': '#4467B0', 'Movies & Shows': '#B04A8C', 'Old Favorites': '#8A6E52',
};
var SPARE_COLORS = ['#5E9C8A', '#C0634B', '#7A7FC2', '#A08A2E', '#4C8DA6'];
var DECADE_COLOR = '#6E819A';
function groupColor(name) {
  if (!name) return '';
  if (GROUP_COLORS[name]) return GROUP_COLORS[name];
  if (/^dec:/.test(name)) return DECADE_COLOR;
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SPARE_COLORS[h % SPARE_COLORS.length];
}
function soft(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function tint(elm, hex) {
  if (!hex) { elm.style.removeProperty('--c'); elm.style.removeProperty('--c-soft'); return; }
  elm.style.setProperty('--c', hex);
  elm.style.setProperty('--c-soft', soft(hex, 0.14));
}
// The colour a song shows: the open group's, or else the song's first group.
function songColor(song) {
  if (group !== 'all' && group !== 'az' && (decade(group) || (song.cats || []).indexOf(group) >= 0)) return groupColor(group);
  return groupColor((song.cats || [])[0]);
}
function allGroupKeys() { return ['all', 'az'].concat(groups(), DECADES.map(function (d) { return d.key; })); }
// The list is shown in a mixed-up order (residents tended to pick whatever came first, i.e. the A songs),
// reshuffled each time the song list opens, with today's songs moved to the end. "A–Z" keeps alphabetical order.
// The order comes from a number (the seed), so a linked TV can show exactly the same order.
var shuffleSeed = Math.floor(Math.random() * 1e9);
function reshuffle() { shuffleSeed = Math.floor(Math.random() * 1e9); }
function mixKey(id) {
  var h = 2166136261;
  for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Stir the song's number together with the seed thoroughly, so no song keeps landing near the top.
  h ^= shuffleSeed;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function listSongs() {
  var s = allSongs();
  if (group !== 'az') {
    var sung = sungToday();
    s = s.slice().sort(function (a, b) {
      return (sung.indexOf(a.id) >= 0) - (sung.indexOf(b.id) >= 0) || mixKey(a.id) - mixKey(b.id);
    });
  }
  if (group === 'all' || group === 'az') return s;
  var d = decade(group);
  if (d) return s.filter(function (x) { var y = Number(x.year); return y && d.test(y); });
  return s.filter(function (x) { return (x.cats || []).indexOf(group) >= 0; });
}
function renderChips() {
  var box = $('chips');
  box.textContent = '';
  if (allGroupKeys().indexOf(group) < 0) group = 'all';
  function chip(key, label, cls) {
    var b = el('button', 'chip' + (cls ? ' ' + cls : ''), label);
    b.setAttribute('aria-pressed', String(key === group));
    if (key !== 'all' && key !== 'az') { b.classList.add('has-c'); tint(b, groupColor(key)); }
    b.tabIndex = -1;
    b.addEventListener('click', function () { this.blur(); setGroup(key); });
    box.appendChild(b);
  }
  chip('all', 'All songs');
  chip('az', 'A–Z');
  groups().forEach(function (g) { chip(g, g); });
  DECADES.forEach(function (d) { chip(d.key, d.label, 'decade'); });
}
function setGroup(g) {
  group = g; lsSet(K.group, g);
  renderList();
  var first = $('grid').querySelector('.tile');
  if (first) first.focus();
}
function renderList() {
  renderChips();
  var grid = $('grid');
  grid.textContent = '';
  var sung = sungToday();
  listSongs().forEach(function (song) {
    var t = el('button', 'tile');
    t.dataset.id = song.id;
    tint(t, songColor(song));
    t.appendChild(el('span', 'tile-title', song.title));
    var meta = el('span', 'tile-meta', [song.artist, song.year].filter(Boolean).join(' · ') || ' ');
    if (sung.indexOf(song.id) >= 0) { meta.appendChild(document.createTextNode(' · ')); meta.appendChild(el('span', 'tile-sung', '✓ Sung today')); }
    t.appendChild(meta);
    t.addEventListener('click', function () { openCard(song.id); });
    grid.appendChild(t);
  });
  if (!grid.children.length) {
    grid.appendChild(el('p', 'hint', allSongs().length ? 'No songs in this group yet.' : 'Loading songs…'));
  }
}
function openList() {
  // A fresh order every time the list opens (not when a linked device is copying another one's screen).
  var copying = typeof link !== 'undefined' && link.applying;
  if (current !== 'list' && !copying) reshuffle();
  show('list');
  renderList();
  var tile = lastSongId && $('grid').querySelector('[data-id="' + lastSongId + '"]');
  (tile || $('grid').querySelector('.tile') || $('settings-open')).focus();
}
function gridColumns() {
  var cols = getComputedStyle($('grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
  return cols || 1;
}
function listKeys(e) {
  var tiles = Array.prototype.slice.call($('grid').querySelectorAll('.tile'));
  var i = tiles.indexOf(document.activeElement);
  var cols = gridColumns();
  var move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (move) {
    e.preventDefault();
    var next = i < 0 ? 0 : Math.max(0, Math.min(tiles.length - 1, i + move));
    if (tiles[next]) tiles[next].focus();
    if (tiles[next]) tiles[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Tab') {
    e.preventDefault();
    var gs = allGroupKeys();
    var j = gs.indexOf(group) + (e.shiftKey ? -1 : 1);
    setGroup(gs[(j + gs.length) % gs.length]);
  } else if (e.key === 'Home' || e.key === 'Escape') {
    e.preventDefault();
    openWelcome();
  }
}

/* ---------- Title card ---------- */
var card = { song: null, mode: 'fact', fact: 0, listen: 0 };
function openCard(id) {
  var song = get(id);
  if (!song) return;
  lastSongId = id;
  card = { song: song, mode: 'fact', fact: 0, listen: 0 };
  $('card-title').textContent = song.title;
  $('card-meta').textContent = [song.artist, song.year].filter(Boolean).join(' · ');
  tint($('card'), songColor(song));
  renderPanel();
  show('card');
  $('card-start').focus();
}
function renderPanel() {
  var s = card.song;
  var listen = card.mode === 'listen';
  var list = (listen ? s.listen : s.facts) || [];
  var i = listen ? card.listen : card.fact;
  $('card-panel').classList.toggle('listen', listen);
  $('panel-label').textContent = listen ? 'Listen for…' : 'Did you know?';
  $('panel-text').textContent = list.length ? list[i % list.length] : (listen ? 'Just enjoy the song!' : 'A song everyone knows.');
  $('panel-count').textContent = list.length > 1 ? (listen ? 'Listen for ' : 'Fact ') + (i % list.length + 1) + ' of ' + list.length : '';
  $('card-fact').disabled = !(s.facts || []).length;
  $('card-listen').disabled = !(s.listen || []).length;
  $('card-fact').setAttribute('aria-pressed', String(!listen));
  $('card-listen').setAttribute('aria-pressed', String(listen));
  $('panel-next').style.visibility = list.length > 1 ? 'visible' : 'hidden';
}
function cardFact() {
  if (card.mode === 'fact') card.fact++; else card.mode = 'fact';
  renderPanel();
}
function cardListen() {
  if (card.mode === 'listen') card.listen++; else card.mode = 'listen';
  renderPanel();
}
$('card-fact').addEventListener('click', cardFact);
$('card-listen').addEventListener('click', cardListen);
$('panel-next').addEventListener('click', function () { if (card.mode === 'listen') cardListen(); else cardFact(); });
$('card-back').addEventListener('click', openList);
$('card-start').addEventListener('click', function () { openLyrics(card.song); });
function cardKeys(e) {
  var k = e.key.toLowerCase();
  if (k === 'f') { e.preventDefault(); cardFact(); }
  else if (k === 'l') { e.preventDefault(); cardListen(); }
  else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); openList(); }
  else if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); openLyrics(card.song); }
}

/* ---------- Lyrics ----------
   Two ways to move through the words (Settings): one section at a time, where David presses a key
   (or a foot pedal / clicker that acts like one) to go on, or a slow autoscroll. */
var ly = { song: null, pos: 0, travel: 1, startY: 0, running: false, done: false, last: 0, raf: 0, count: 0, countTimer: 0, endTimer: 0, wake: null };
function stepMode() { return (lsGet(K.mode) || 'step') === 'step'; }
function stepOn() { return current === 'lyrics' && $('lyrics').getAttribute('data-mode') === 'step'; }
// Text as verses: [{ chorus: true/false, lines: [...] }]. A blank line starts a new verse; a "[Chorus]" line marks one.
function textBlocks(text) {
  var out = [];
  String(text || '').replace(/\r/g, '').split(/\n\s*\n/).forEach(function (block) {
    var ls = lines(block);
    if (!ls.length) return;
    var chorus = /^\[chorus\]$/i.test(ls[0]);
    if (chorus) ls = ls.slice(1);
    if (ls.length) out.push({ chorus: chorus, lines: ls });
  });
  return out;
}
// Songs David has laid out in the slide editor carry their own slides (one text per screen).
function customSlides(song) { return song && Array.isArray(song.slides) && song.slides.length ? song.slides : null; }
function songBlocks(song) {
  var sl = customSlides(song);
  if (!sl) return textBlocks(song.lyrics);
  var out = [];
  sl.forEach(function (t) { out = out.concat(textBlocks(t)); });
  return out;
}
function renderLyrics(song) {
  var box = $('lyrics-text');
  box.textContent = '';
  box.appendChild(el('p', 'lyrics-title', song.title));
  songBlocks(song).forEach(function (b) {
    var v = el('div', 'verse' + (b.chorus ? ' chorus' : ''));
    if (b.chorus) v.appendChild(el('p', 'chorus-label', 'Chorus'));
    b.lines.forEach(function (l) { v.appendChild(el('p', null, l)); });
    box.appendChild(v);
  });
  box.appendChild(el('p', 'lyrics-end', '♪'));
}

/* One section at a time. Long verses are split into even pages of up to 5 lines, so the words stay huge.
   The Size button switches to two sections per screen (pages 1+2, 3+4, …) for smaller text and fewer presses. */
var st = { pages: [], screens: [], i: 0, custom: null };
var STEP_SIZE = { smaller: 5.4, normal: 6.6, bigger: 8 };   // starting text size (vw); shrinks to fit
function narrow() { return window.innerWidth < 800; }        // phones and small windows: bigger start, wrapping is fine
function perScreen() { return lsGet(K.per) === '1' ? 1 : 2; }   // two sections per screen unless Bigger was pressed
function songPages(song) {
  var pages = [];
  songBlocks(song).forEach(function (b) {
    var n = b.lines.length, parts = Math.ceil(n / 5), per = Math.ceil(n / parts);
    for (var i = 0; i < n; i += per) pages.push({ chorus: b.chorus, lines: b.lines.slice(i, i + per) });
  });
  return pages.length ? pages : [{ chorus: false, lines: ['(No words for this song yet)'] }];
}
// Screens are lists of page numbers: [[0], [1], …] or, two per screen, [[0, 1], [2, 3], …].
// A song with its own slides: one screen per slide, whatever the Size button says (it only changes text size).
function buildScreens() {
  if (st.custom) { st.screens = st.custom.slice(); return; }
  var per = perScreen(), out = [];
  for (var i = 0; i < st.pages.length; i += per) out.push(st.pages.slice(i, i + per).map(function (_, j) { return i + j; }));
  st.screens = out;
}
function openStep(song) {
  lsSet(K.per, '2');   // every song starts with two sections per screen ("Aa Bigger" switches for this song)
  st = { pages: songPages(song), screens: [], i: 0, custom: null };
  var sl = customSlides(song);
  if (sl) {
    st.pages = []; st.custom = [];
    sl.forEach(function (t) {
      var idx = [];
      textBlocks(t).forEach(function (b) { idx.push(st.pages.length); st.pages.push(b); });
      if (!idx.length) { idx.push(st.pages.length); st.pages.push({ chorus: false, lines: [' '] }); }
      st.custom.push(idx);
    });
  }
  buildScreens();
  show('lyrics');
  keepAwake(true);
  $('lyrics-badge').hidden = true;
  renderStep(0);
  wake();
}
function togglePerScreen() {
  var firstPage = st.screens[st.i][0];
  lsSet(K.per, perScreen() === 2 ? '1' : '2');
  buildScreens();
  // Stay on the same words.
  st.i = st.screens.findIndex ? st.screens.findIndex(function (sc) { return sc.indexOf(firstPage) >= 0; }) : 0;
  if (st.i < 0) st.i = 0;
  renderStep(0);
  badge(st.custom ? (perScreen() === 2 ? 'Smaller words' : 'Bigger words') : perScreen() === 2 ? 'Two sections per screen' : 'One section per screen');
}
function fitStep() {
  var page = $('step-page'), stage = $('step-stage');
  var size = (STEP_SIZE[document.documentElement.getAttribute('data-size')] || STEP_SIZE.normal) * (narrow() ? 1.4 : 1)
    * (st.custom && perScreen() === 1 ? 1.35 : 1);   // a laid-out song: "Bigger" just means bigger words
  page.style.fontSize = size + 'vw';
  while (size > 2 && (page.scrollHeight > stage.clientHeight || page.scrollWidth > stage.clientWidth)) {
    size *= 0.94;
    page.style.fontSize = size + 'vw';
  }
  // Rather than break a line in the middle of a phrase, shrink a little (down to about 3/4 size).
  var floor = narrow() ? size : size * 0.75;
  while (size > floor && wrapped(page)) {
    size *= 0.95;
    page.style.fontSize = size + 'vw';
  }
}
function wrapped(page) {
  var lh = parseFloat(getComputedStyle(page).fontSize) * 1.2;
  return Array.prototype.some.call(page.querySelectorAll('p:not(.chorus-label)'), function (p) { return p.offsetHeight > lh * 1.5; });
}
function renderStep(dir) {
  var n = st.screens.length, screen = st.screens[st.i];
  var page = $('step-page');
  page.textContent = '';
  page.className = 'step-page';
  screen.forEach(function (pi) {
    var p = st.pages[pi];
    var block = el('div', 'step-block' + (p.chorus ? ' chorus' : ''));
    if (p.chorus) block.appendChild(el('p', 'chorus-label', 'Chorus'));
    p.lines.forEach(function (l) { block.appendChild(el('p', null, l)); });
    page.appendChild(block);
  });
  fitStep();
  if (dir) { void page.offsetWidth; page.classList.add(dir > 0 ? 'in-fwd' : 'in-back'); }
  $('step-head').textContent = ly.song.title + '  ·  ' + (st.i + 1) + ' of ' + n;
  var next = $('step-next');
  next.textContent = '';
  next.appendChild(el('span', 'arrow', '▼'));
  next.appendChild(document.createTextNode(st.i < n - 1 ? st.pages[st.screens[st.i + 1][0]].lines[0] : 'Questions next'));
  $('progress-fill').style.width = ((st.i + 1) / n * 100) + '%';
  $('c-page').textContent = (st.i + 1) + ' / ' + n;
  $('c-back').disabled = st.i === 0;
  $('c-next').textContent = st.i < n - 1 ? 'Next ▸' : 'Questions ▸';
  $('c-size').textContent = perScreen() === 2 ? 'Aa Bigger' : 'Aa Smaller';
  $('c-size').title = st.custom ? (perScreen() === 2 ? 'Bigger words' : 'Smaller words')
    : perScreen() === 2 ? 'One section per screen, bigger words' : 'Two sections per screen, smaller words';
}
function stepGo(d) {
  var n = st.screens.length;
  if (d > 0 && st.i >= n - 1) { openTalk(ly.song); return; }
  if (d < 0 && st.i === 0) return;
  st.i += d;
  renderStep(d);
}
function stepKeys(e) {
  if (e.repeat) { e.preventDefault(); return; }   // a held key or pedal shouldn't skip ahead
  var k = e.key;
  if (k === ' ' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); stepGo(1); }
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); stepGo(-1); }
  else if (k === 'Escape') { e.preventDefault(); openList(); }
}
$('step').addEventListener('click', function () { stepGo(1); });
// iPad / iPhone: swipe left for the next section, right to go back (a plain tap also goes on).
var swipe = null;
$('step').addEventListener('touchstart', function (e) { var t = e.touches[0]; swipe = { x: t.clientX, y: t.clientY }; }, { passive: true });
$('step').addEventListener('touchend', function (e) {
  if (!swipe) return;
  var t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); stepGo(dx < 0 ? 1 : -1); }
});
function measure() {
  var H = window.innerHeight;
  var frac = ly.travel > 1 ? ly.pos / ly.travel : 0;
  ly.startY = H * 0.30;
  // Scroll until the last lines sit in the upper-middle of the screen.
  ly.travel = Math.max(1, $('lyrics-text').offsetHeight - H * 0.30);
  ly.pos = frac * ly.travel;
  place();
}
function place() {
  $('lyrics-text').style.transform = 'translateY(' + Math.round(ly.startY - ly.pos) + 'px)';
  $('progress-fill').style.width = Math.min(100, ly.pos / ly.travel * 100) + '%';
}
function tick(t) {
  if (!ly.running) return;
  var dt = ly.last ? Math.min(0.1, (t - ly.last) / 1000) : 0;
  ly.last = t;
  ly.pos += dt * ly.travel / secondsFor(ly.song);
  if (ly.pos >= ly.travel) {
    ly.pos = ly.travel; place(); ly.running = false; ly.done = true; updateCtrl();
    ly.endTimer = setTimeout(function () { if (current === 'lyrics') openTalk(ly.song); }, 4000);
    return;
  }
  place();
  ly.raf = requestAnimationFrame(tick);
}
function play() {
  if (ly.done) return;
  ly.running = true; ly.last = 0;
  $('lyrics-badge').hidden = true;
  cancelAnimationFrame(ly.raf);
  ly.raf = requestAnimationFrame(tick);
  updateCtrl(); quietSoon();
}
function pause() { ly.running = false; cancelAnimationFrame(ly.raf); updateCtrl(); wake(); }
function counting() { return !$('countdown').hidden; }
function togglePlay() {
  if (counting()) { startNow(); return; }
  if (ly.done) { openLyrics(ly.song); return; }
  if (ly.running) { pause(); badge('Paused', true); } else play();
}
// The control bar fades back while the words scroll, and comes back on any mouse move, key or pause.
function updateCtrl() {
  var b = $('c-play');
  b.textContent = counting() ? '▶ Start now' : ly.done ? '⟲ Again' : ly.running ? '❚❚ Pause' : '▶ Play';
  b.classList.toggle('on', !ly.running && !ly.done);
  $('c-speed').textContent = mmss(secondsFor(ly.song));
}
var quietTimer;
function wake() { $('ctrl').classList.remove('quiet'); clearTimeout(quietTimer); if (ly.running || stepOn()) quietSoon(); }
function quietSoon() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(function () { if (ly.running || stepOn()) $('ctrl').classList.add('quiet'); }, 3500);
}
function badge(text, stay) {
  var b = $('lyrics-badge');
  b.textContent = text; b.hidden = false;
  clearTimeout(badge.timer);
  if (!stay) badge.timer = setTimeout(function () { b.hidden = true; }, 2200);
}
function openLyrics(song) {
  ly.song = song; ly.pos = 0; ly.travel = 1; ly.done = false;
  var step = stepMode();
  $('lyrics').setAttribute('data-mode', step ? 'step' : 'scroll');
  if (step) { pause(); openStep(song); return; }
  $('c-size').textContent = 'Aa Size'; $('c-size').title = 'Make the words bigger or smaller';
  renderLyrics(song);
  show('lyrics');
  measure();
  $('lyrics-badge').hidden = true;
  keepAwake(true);
  ly.count = Number(lsGet(K.count)) || 5;
  var c = $('countdown');
  c.textContent = ly.count; c.hidden = false; $('countdown-note').hidden = false;
  clearTimeout(ly.endTimer);
  pause();
  clearInterval(ly.countTimer);
  ly.countTimer = setInterval(function () {
    ly.count--;
    if (ly.count <= 0) { startNow(); return; }
    c.textContent = ly.count;
  }, 1000);
}
function startNow() {
  clearInterval(ly.countTimer);
  $('countdown').hidden = true; $('countdown-note').hidden = true;
  play();
}
function stopLyrics() {
  pause();
  clearInterval(ly.countTimer);
  clearTimeout(ly.endTimer);
  $('countdown').hidden = true; $('countdown-note').hidden = true;
  $('ctrl').classList.remove('quiet');
  keepAwake(false);
}
function nudge(factor) {
  var secs = setSeconds(ly.song, secondsFor(ly.song) * factor);
  badge((factor < 1 ? 'Faster ▲' : 'Slower ▼') + '  (whole song ' + mmss(secs) + ')');
  updateCtrl();
}
function cycleSize() {
  if (stepOn()) { togglePerScreen(); return; }
  var cur = document.documentElement.getAttribute('data-size') || 'normal';
  var next = SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length];
  lsSet(K.size, next);
  document.documentElement.setAttribute('data-size', next);
  markSettings();
  if (current === 'lyrics') { if (stepOn()) fitStep(); else measure(); badge('Words: ' + next); }
}
function cycleTheme() {
  var cur = document.documentElement.getAttribute('data-theme');
  var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  lsSet(K.theme, next); applyTheme(next);
}
function lyricsKeys(e) {
  if (stepOn()) { stepKeys(e); return; }
  wake();
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0.9); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(1.1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault(); ly.pos = Math.max(0, ly.pos - window.innerHeight * 0.25); place();
    if (ly.done) { ly.done = false; clearTimeout(ly.endTimer); play(); }
    place();
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault(); ly.pos = Math.min(ly.travel - 1, ly.pos + window.innerHeight * 0.25); place();
  } else if (e.key === 'Enter') { e.preventDefault(); openTalk(ly.song); }
  else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); openList(); }
}
// Control bar buttons (blur after a click, so a later Space or Enter goes to the song, not the button).
function ctrl(id, fn) { $(id).addEventListener('click', function () { this.blur(); wake(); fn(); }); }
ctrl('c-close', function () { openList(); });
ctrl('c-restart', function () { if (stepOn()) { st.i = 0; renderStep(-1); } else openLyrics(ly.song); });
ctrl('c-back', function () { stepGo(-1); });
ctrl('c-next', function () { stepGo(1); });
ctrl('c-play', togglePlay);
ctrl('c-slower', function () { nudge(1.1); });
ctrl('c-faster', function () { nudge(0.9); });
ctrl('c-size', cycleSize);
ctrl('c-colors', cycleTheme);
ctrl('c-done', function () { openTalk(ly.song); });
$('list-colors').addEventListener('click', function () { this.blur(); cycleTheme(); });
$('list-home').addEventListener('click', function () { this.blur(); openWelcome(); });
// Clicking the words pauses or resumes, for anyone with a mouse instead of a keyboard.
$('lyrics-window').addEventListener('click', function () { wake(); togglePlay(); });
window.addEventListener('resize', function () { if (current === 'lyrics') { if (stepOn()) fitStep(); else measure(); } });
var cursorTimer;
document.addEventListener('mousemove', function () {
  document.body.classList.remove('hide-cursor');
  if (current === 'lyrics') wake();
  clearTimeout(cursorTimer);
  if (current === 'lyrics') cursorTimer = setTimeout(function () { if (current === 'lyrics') document.body.classList.add('hide-cursor'); }, 2000);
});
// Stop the screen from going to sleep in the middle of a song.
function keepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  if (on && !ly.wake) navigator.wakeLock.request('screen').then(function (w) { ly.wake = w; }).catch(function () {});
  if (!on && ly.wake) { ly.wake.release().catch(function () {}); ly.wake = null; }
}

/* ---------- After the song ---------- */
var talk = { song: null, i: 0 };
function openTalk(song) {
  markSung(song.id);
  talk = { song: song, i: 0 };
  show('talk');
  renderTalk();
  $('talk-done').focus();
}
function renderTalk() {
  var qs = talk.song.ask || [];
  if (!qs.length) { $('talk-q').textContent = 'What did you think of that song?'; $('talk-count').textContent = ''; }
  else {
    $('talk-q').textContent = qs[talk.i];
    $('talk-count').textContent = qs.length > 1 ? 'Question ' + (talk.i + 1) + ' of ' + qs.length : '';
  }
  $('talk-label').textContent = 'Let’s talk about ' + talk.song.title;
  $('talk-prev').disabled = talk.i === 0;
  $('talk-next').disabled = talk.i >= qs.length - 1;
}
function talkStep(d) {
  var n = (talk.song.ask || []).length;
  talk.i = Math.max(0, Math.min(n - 1, talk.i + d));
  renderTalk();
  $('talk-done').focus();
}
$('talk-prev').addEventListener('click', function () { talkStep(-1); });
$('talk-again').addEventListener('click', function () { openLyrics(talk.song); });
$('talk-next').addEventListener('click', function () { talkStep(1); });
$('talk-done').addEventListener('click', openList);
function talkKeys(e) {
  if (e.key === 'ArrowRight') { e.preventDefault(); talkStep(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); talkStep(-1); }
  else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); openList(); }
  else if (e.key === 'Enter') { e.preventDefault(); openList(); }
}

/* ---------- Keyboard ---------- */
function typing() {
  var a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}
document.addEventListener('keydown', function (e) {
  if ($('settings').open || current === 'editor' || current === 'slides' || typing() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'c' || e.key === 'C') { cycleTheme(); return; }
  if (current === 'welcome' && e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); openList(); }
  else if (current === 'list') listKeys(e);
  else if (current === 'card') cardKeys(e);
  else if (current === 'lyrics') lyricsKeys(e);
  else if (current === 'talk') talkKeys(e);
});

/* ---------- Song editor ---------- */
var edId = null, edTimer = null;
function openEditor() {
  $('settings').close();
  show('editor');
  renderEdList();
  edPick(edId && get(edId) ? edId : null);
  renderEdSync();
}
function renderEdList() {
  var ul = $('ed-list');
  ul.textContent = '';
  allSongs().forEach(function (s) {
    var li = el('li');
    var b = el('button', null, s.title);
    b.appendChild(el('span', 'cap', [s.artist, s.year].filter(Boolean).join(' · ')));
    b.setAttribute('aria-current', String(s.id === edId));
    b.addEventListener('click', function () { edSaveNow(); edPick(s.id); });
    li.appendChild(b);
    ul.appendChild(li);
  });
}
function edPick(id) {
  edId = id;
  var s = id ? get(id) : null;
  $('ed-empty').hidden = !!s;
  $('ed-fields').hidden = !s;
  Array.prototype.forEach.call($('ed-list').querySelectorAll('button'), function (b, i) {
    b.setAttribute('aria-current', String(allSongs()[i] && allSongs()[i].id === id));
  });
  if (!s) return;
  $('f-title').value = s.title || '';
  $('f-artist').value = s.artist || '';
  $('f-year').value = s.year || '';
  $('f-seconds').value = secondsFor(s);
  $('f-facts').value = (s.facts || []).join('\n');
  $('f-listen').value = (s.listen || []).join('\n');
  $('f-ask').value = (s.ask || []).join('\n');
  $('f-lyrics').value = s.lyrics || '';
  $('f-slides-note').hidden = !customSlides(s);
  renderEdCats(s.cats || []);
  $('f-saved').textContent = '';
  resetDelete();
}
function renderEdCats(checked) {
  var box = $('f-cats');
  box.textContent = '';
  groups().forEach(function (g) {
    var l = el('label');
    var c = el('input'); c.type = 'checkbox'; c.value = g; c.checked = checked.indexOf(g) >= 0;
    c.addEventListener('change', edChanged);
    l.appendChild(c); l.appendChild(document.createTextNode(g));
    box.appendChild(l);
  });
}
function edChanged() {
  $('f-saved').textContent = 'Saving…';
  clearTimeout(edTimer);
  edTimer = setTimeout(edSaveNow, 700);
}
function edSaveNow() {
  clearTimeout(edTimer);
  if (!edId || $('ed-fields').hidden) return;
  var old = get(edId);
  if (!old) return;
  var cats = Array.prototype.filter.call($('f-cats').querySelectorAll('input'), function (c) { return c.checked; })
    .map(function (c) { return c.value; });
  var secs = Number($('f-seconds').value) || old.seconds || 150;
  var rec = Object.assign({}, old, {
    title: $('f-title').value.trim() || 'Untitled song',
    artist: $('f-artist').value.trim(),
    year: Number($('f-year').value) || $('f-year').value.trim(),
    seconds: secs,
    cats: cats,
    facts: lines($('f-facts').value),
    listen: lines($('f-listen').value),
    ask: lines($('f-ask').value),
    lyrics: $('f-lyrics').value.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(),
  });
  var same = JSON.stringify(Object.assign({}, rec, { updatedAt: 0 })) === JSON.stringify(Object.assign({}, old, { updatedAt: 0 }));
  if (secs !== secondsFor(old)) { var m = speeds(); delete m[edId]; lsSet(K.speeds, JSON.stringify(m)); }
  if (!same) put(edId, rec);
  $('f-saved').textContent = sync.isOn() ? 'Saved' : 'Saved on this device only';
  var titleChanged = rec.title !== old.title || rec.artist !== old.artist || String(rec.year) !== String(old.year);
  if (titleChanged) renderEdList();
}
['f-title', 'f-artist', 'f-year', 'f-seconds', 'f-facts', 'f-listen', 'f-ask', 'f-lyrics'].forEach(function (id) {
  $(id).addEventListener('input', edChanged);
  $(id).addEventListener('blur', edSaveNow);
});
$('ed-form').addEventListener('submit', function (e) { e.preventDefault(); edSaveNow(); });
$('f-addcat').addEventListener('click', function () {
  var name = $('f-newcat').value.trim();
  if (!name) return;
  var s = get('settings') || { type: 'settings', categories: [] };
  var cats = (s.categories || []).slice();
  if (cats.indexOf(name) < 0) { cats.push(name); put('settings', Object.assign({}, s, { type: 'settings', categories: cats })); }
  var checked = Array.prototype.filter.call($('f-cats').querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; });
  checked.push(name);
  renderEdCats(checked);
  $('f-newcat').value = '';
  edSaveNow();
});
$('ed-new').addEventListener('click', function () {
  edSaveNow();
  var id = uid('song');
  put(id, { type: 'song', title: 'New song', artist: '', year: '', cats: [], seconds: 150, facts: [], listen: [], ask: [], lyrics: '' });
  renderEdList();
  edPick(id);
  $('f-title').select();
  $('f-title').focus();
});
function resetDelete() { var b = $('f-delete'); b.textContent = 'Delete song'; b.classList.remove('armed'); }
$('f-delete').addEventListener('click', function () {
  var b = $('f-delete');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to delete'; setTimeout(resetDelete, 4000); return; }
  put(edId, { deleted: true });
  edId = null;
  renderEdList();
  edPick(null);
  toast('Song deleted.');
});
$('ed-close').addEventListener('click', function () { edSaveNow(); openList(); });
function renderEdSync() {
  var s = $('ed-sync');
  s.className = 'ed-sync';
  if (!sync.isOn()) { s.textContent = 'Changes stay on this device. Add your access key in Settings to save them for every device.'; s.classList.add('problem'); }
  else if (sync.status === 'syncing') s.textContent = 'Syncing…';
  else if (['auth', 'other', 'conflict', 'offline'].indexOf(sync.status) >= 0) { s.textContent = sync.message; s.classList.add('problem'); }
  else s.textContent = '✓ Saved for every device';
}

/* ---------- Sync with GitHub (same approach as the SOS Band editor) ----------
   On open, every few minutes, and shortly after each edit: download data.json, merge record
   by record (newest change wins), and upload the result when a key is set. Without a key,
   this device simply shows the published songs. */
function SyncError(kind, message) { this.kind = kind; this.message = message; }
function toBase64(text) {
  var bytes = new TextEncoder().encode(text), bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  var bin = atob(b64.replace(/\s/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function github(path, options, token) {
  options = options || {};
  if (token === undefined) token = lsGet(K.token);
  var headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch('https://api.github.com/repos/' + DATA_REPO + path, Object.assign({}, options, { cache: 'no-store', headers: headers }))
    .catch(function () { throw new SyncError('offline', 'No connection. Will try again shortly.'); })
    .then(function (res) {
      if (token && res.status === 401) throw new SyncError('auth', 'The access key isn’t working (expired or mistyped).');
      if (token && res.status === 403) throw new SyncError('auth', 'Your access key can read but not save. On GitHub, give it memory-lane-data with Contents set to “Read and write”.');
      if (!token && (res.status === 403 || res.status === 429)) throw new SyncError('offline', 'GitHub is busy. Will try again shortly.');
      return res;
    });
}
function download(token) {
  if (!token) {
    return fetch('https://api.github.com/repos/' + DATA_REPO + '/contents/' + DATA_FILE,
      { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } })
      .then(function (res) { if (!res.ok) throw new Error(); return res.json(); })
      .catch(function () {
        // Backup: the published copy, which can lag a few minutes behind.
        return fetch(PAGES_COPY + DATA_FILE + '?t=' + Date.now(), { cache: 'no-store' })
          .catch(function () { throw new SyncError('offline', 'No connection.'); })
          .then(function (res) { if (!res.ok) throw new SyncError('offline', 'Couldn’t load the songs.'); return res.json(); });
      })
      .then(function (data) { return { data: data, sha: null }; });
  }
  return github('/contents/' + DATA_FILE, {}, token).then(function (res) {
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw new SyncError('other', 'GitHub said ' + res.status + ' when downloading.');
    return res.json().then(function (body) { return { data: JSON.parse(fromBase64(body.content)), sha: body.sha }; });
  });
}
function upload(data, sha) {
  var body = { message: 'Song changes', content: toBase64(JSON.stringify(data, null, 2) + '\n') };
  if (sha) body.sha = sha;
  return github('/contents/' + DATA_FILE, { method: 'PUT', body: JSON.stringify(body) }).then(function (res) {
    if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'Changed on another device at the same moment.');
    if (!res.ok) throw new SyncError('other', 'GitHub said ' + res.status + ' when saving.');
  });
}
function merge(local, remote) {
  var out = Object.assign({}, local);
  Object.keys(remote).forEach(function (id) {
    var l = out[id], r = remote[id];
    if (!l || (r.updatedAt || '') >= (l.updatedAt || '')) out[id] = r;
  });
  return out;
}
function canon(s) { return JSON.stringify(Object.keys(s || {}).sort().map(function (k) { return [k, s[k]]; })); }
function replaceLocal(next) {
  items = next; saveLocal();
  if (current === 'list') renderList();
  if (current === 'editor') { renderEdList(); }
}

var sync = {
  status: 'idle', message: '', running: false, again: false, timer: 0,
  isOn: function () { return Boolean(lsGet(K.token)); },
  set: function (status, message) {
    this.status = status; this.message = message || '';
    renderSyncSettings();
    if (current === 'editor') renderEdSync();
  },
  run: function () {
    var self = this;
    if (self.running) { self.again = true; return Promise.resolve(); }
    self.running = true;
    var on = self.isOn();
    if (on) self.set('syncing');
    function attempt(n) {
      return download(on ? lsGet(K.token) : null).then(function (r) {
        var remote = r.data && r.data.items ? r.data.items : null;
        if (!on) {
          // No key: show the published songs, unless this device has edits that haven't been saved anywhere.
          if (remote && (!lsGet(K.dirty) || !Object.keys(items).length) && canon(remote) !== canon(items)) replaceLocal(remote);
          return;
        }
        var merged = merge(items, remote || {});
        if (canon(merged) !== canon(items)) replaceLocal(merged);
        if (remote && canon(merged) === canon(remote)) return;
        return upload({ app: 'memory-lane', format: 1, items: merged }, r.sha).catch(function (e) {
          if (e.kind !== 'conflict' || n >= 3) throw e;
          return attempt(n + 1);
        });
      });
    }
    return attempt(1).then(function () {
      if (on) { lsSet(K.last, new Date().toISOString()); lsSet(K.dirty, null); self.set('ok'); } else self.set('view');
    }).catch(function (e) {
      self.set(e.kind || 'other', e.message || 'Something went wrong.');
    }).then(function () {
      self.running = false;
      if (self.again) { self.again = false; self.run(); }
    });
  },
  soon: function () {
    if (!this.isOn()) return;
    var self = this;
    clearTimeout(self.timer);
    self.timer = setTimeout(function () { self.run(); }, 1500);
  },
  connect: function (token) {
    var self = this;
    return download(token).then(function () { return github('', {}, token); }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (repo) {
      if (repo && repo.permissions && !repo.permissions.push) throw new SyncError('auth', 'That key can read but not change memory-lane-data.');
      lsSet(K.token, token);
      lsSet(K.last, null);
      return self.run();
    });
  },
  disconnect: function () { lsSet(K.token, null); lsSet(K.last, null); renderSyncSettings(); },
};
function timeAgo(iso) {
  var mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.floor(mins / 60) + ' h ago';
  var days = Math.floor(mins / 1440);
  return days === 1 ? 'yesterday' : days + ' days ago';
}
function renderSyncSettings() {
  var on = sync.isOn();
  $('sync-on').hidden = !on;
  $('sync-form').hidden = on;
  $('settings-open').classList.toggle('alert', on && ['auth', 'other', 'conflict'].indexOf(sync.status) >= 0);
  if (!on) return;
  var s = $('sync-status'), last = lsGet(K.last);
  s.className = 'cap';
  if (sync.status === 'syncing') s.textContent = 'Syncing…';
  else if (sync.status === 'ok') { s.textContent = '✓ Editing on · synced ' + timeAgo(last); s.classList.add('ok'); }
  else if (['auth', 'other', 'conflict', 'offline'].indexOf(sync.status) >= 0) { s.textContent = sync.message; s.classList.add('problem'); }
  else s.textContent = last ? 'Last synced ' + timeAgo(last) : 'Not synced yet';
}
$('sync-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var err = $('sync-error'), btn = $('sync-connect'), token = $('sync-token').value.trim();
  err.hidden = true;
  if (!token) { err.textContent = 'Paste the access key.'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = 'Checking…';
  sync.connect(token).then(function () {
    $('sync-token').value = '';
    toast(sync.status === 'ok' ? 'Connected. Song changes now save for every device.' : sync.message);
  }).catch(function (ex) {
    err.textContent = ex.message || 'Couldn’t connect.'; err.hidden = false;
  }).then(function () { btn.disabled = false; btn.textContent = 'Connect'; });
});
$('sync-now').addEventListener('click', function () { sync.run(); });
$('sync-disconnect').addEventListener('click', function () {
  var b = $('sync-disconnect');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to turn off'; return; }
  b.classList.remove('armed'); b.textContent = 'Turn off editing here';
  sync.disconnect();
});
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync.run(); });
window.addEventListener('online', function () { sync.run(); });
// Check for song changes every few minutes, but never in the middle of a song.
setInterval(function () { if (document.visibilityState === 'visible' && navigator.onLine && current !== 'lyrics') sync.run(); }, 3 * 60 * 1000);

/* ---------- Settings ---------- */
function applyTheme(t) {
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  markSettings();
}
function markSettings() {
  var theme = lsGet(K.theme) || 'light', size = lsGet(K.size) || 'normal', count = lsGet(K.count) || '5', mode = lsGet(K.mode) || 'step';
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode-v]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.modeV === mode)); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme-v]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeV === theme)); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-size-v]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.sizeV === size)); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-count-v]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.countV === count)); });
}
Array.prototype.forEach.call(document.querySelectorAll('[data-theme-v]'), function (b) {
  b.addEventListener('click', function () { lsSet(K.theme, b.dataset.themeV); applyTheme(b.dataset.themeV); });
});
Array.prototype.forEach.call(document.querySelectorAll('[data-size-v]'), function (b) {
  b.addEventListener('click', function () { lsSet(K.size, b.dataset.sizeV); document.documentElement.setAttribute('data-size', b.dataset.sizeV); markSettings(); });
});
Array.prototype.forEach.call(document.querySelectorAll('[data-mode-v]'), function (b) {
  b.addEventListener('click', function () { lsSet(K.mode, b.dataset.modeV); markSettings(); });
});
Array.prototype.forEach.call(document.querySelectorAll('[data-count-v]'), function (b) {
  b.addEventListener('click', function () { lsSet(K.count, b.dataset.countV); markSettings(); });
});
matchMedia('(prefers-color-scheme: dark)').addListener(function () { if (lsGet(K.theme) === 'auto') applyTheme('auto'); });
$('settings-open').addEventListener('click', function () {
  markSettings();
  renderSyncSettings();
  $('ver-line').textContent = 'You’re on ' + window.APP_VERSION + '.';
  $('set-update').disabled = false;
  $('settings').showModal();
});
$('settings-close').addEventListener('click', function () { $('settings').close(); });
$('open-editor').addEventListener('click', openEditor);
$('set-update').addEventListener('click', function () {
  var ver = $('ver-line'), ub = $('set-update'), reg = window.SW_REG;
  if (!reg || !navigator.onLine) { ver.textContent = 'Connect to the internet, then try again.'; return; }
  ub.disabled = true; ver.textContent = 'Checking…';
  reg.update().catch(function () {}).then(function () {
    var w = reg.waiting || reg.installing;
    if (w) {
      ver.textContent = 'Updating now…';
      var go = function () { w.postMessage('skipWaiting'); };
      if (w.state === 'installed') go();
      else w.addEventListener('statechange', function () { if (w.state === 'installed') go(); });
    } else {
      ver.textContent = 'You’re on the latest version (' + window.APP_VERSION + ').';
      ub.disabled = false;
    }
  });
});

/* ---------- Offline + updates ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      window.SW_REG = reg;
      function offer(w) {
        if (!w || !navigator.serviceWorker.controller) return;
        $('update-banner').hidden = false;
        $('update-go').onclick = function () { w.postMessage('skipWaiting'); };
      }
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        w.addEventListener('statechange', function () { if (w.state === 'installed') offer(w); });
      });
    }).catch(function () {});
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloaded || current === 'lyrics') return;   // never reload in the middle of a song
      reloaded = true; location.reload();
    });
  }
}

markSettings();
openWelcome();
sync.run();
