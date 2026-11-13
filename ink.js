/* Notes on a chart: David writes, draws and highlights on his chart pages, with a finger or an Apple Pencil.
   One page at a time, fitted to the screen. Tools: three pens (red, blue, black), a yellow highlighter, typed
   text (tap where it goes, type, Return), and an eraser that removes a whole line or note when rubbed over it.
   Saved with the chart (chart.pages[k].ink, described in chart.js) and shown wherever the chart is shown.
   Once an Apple Pencil has touched the page, fingers don't draw (so a resting hand doesn't) and one finger scrolls;
   otherwise one finger draws and two fingers scroll. A sideways iPad shows the page across the width and scrolls.
   Opened from ✏️ Notes on the remote's chart (comes back to the same screen) or from Edit songs.
   Loaded after chart.js. */

var INK = { hl: '#FFD400', penW: 5, hlW: 34, textS: 46, eraseR: 16, tool: 'ml.ink-tool' };
var ci = { id: null, k: 0, pages: [], undo: [], redo: [], drawing: null, edit: null, pencil: false, saveTimer: 0, touches: {}, pan: null };
(function () {
  var saved = (lsGet(INK.tool) || '').split('|');
  ci.tool = ['pen', 'hl', 'text', 'erase'].indexOf(saved[0]) >= 0 ? saved[0] : 'pen';
  ci.color = /^#[0-9A-F]{6}$/i.test(saved[1] || '') ? saved[1] : '#D93025';
})();

function openInk(id, back) {
  var song = get(id), ch = chartOf(song);
  if (!ch) return;
  // From the song: start on the page the orange marks are on.
  var k = 0, band = back === 'lyrics' ? document.querySelector('#cv-pages .cv-now-band') : null;
  if (band) k = Number(band.parentNode.dataset.k) || 0;
  ci.id = id; ci.back = back; ci.at = back === 'lyrics' ? st.i : 0;
  ci.pages = ch.pages.map(function (p) { return JSON.parse(JSON.stringify(p.ink || [])); });
  ci.undo = []; ci.redo = []; ci.drawing = null; ci.edit = null; ci.pencil = false; ci.touches = {}; ci.pan = null;
  $('ci-title').textContent = 'Notes: ' + song.title;
  show('chartink');
  inkPage(k);
}
function inkChartPage() { return chartOf(get(ci.id)).pages[ci.k]; }
function inkItems() { return ci.pages[ci.k]; }

// Show page k, as big as fits.
function inkPage(k) {
  inkCommitText();
  var ch = chartOf(get(ci.id));
  ci.k = Math.max(0, Math.min(ch.pages.length - 1, k));
  var stage = $('ci-stage'), p = ch.pages[ci.k];
  stage.textContent = '';
  var sheet = chartPage(p, ci.k, null);
  sheet.classList.add('ci-sheet');
  ci.svg = inkSvg(p, []);
  sheet.appendChild(ci.svg);
  stage.appendChild(sheet);
  ci.sheet = sheet;
  inkFit();
  inkRender();
}
// The whole page when that's big enough to write on (an upright iPad); otherwise across the width, and it scrolls.
function inkFit() {
  if (!ci.sheet) return;
  var stage = $('ci-stage'), ratio = pageRatio(inkChartPage());
  var wide = Math.min(stage.clientWidth - 24, 1000), whole = (stage.clientHeight - 24) / ratio;
  var w = whole >= wide ? wide : whole >= wide * 0.75 ? whole : wide;
  ci.sheet.style.width = Math.max(200, Math.floor(w)) + 'px';
  ci.scrolls = w > whole + 1;
}
function inkRender() {
  var svg = ci.svg, items = inkItems();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  ci.els = items.map(function (it) {
    var e = inkEl(it);
    if (ci.edit && ci.edit.item === it) e.style.display = 'none';
    svg.appendChild(e);
    return e;
  });
  var n = ci.pages.length;
  $('ci-count').textContent = n > 1 ? 'Page ' + (ci.k + 1) + ' of ' + n : '';
  $('ci-prev').hidden = $('ci-next').hidden = n < 2;
  $('ci-prev').disabled = ci.k === 0;
  $('ci-next').disabled = ci.k >= n - 1;
  $('ci-undo').disabled = !ci.undo.length;
  $('ci-redo').disabled = !ci.redo.length;
  $('ci-clear').disabled = !items.length;
  Array.prototype.forEach.call(document.querySelectorAll('#ci-tools .ci-tool'), function (b) {
    var on = b.dataset.tool === ci.tool && (ci.tool !== 'pen' || b.dataset.color === ci.color);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('ci-help').textContent = {
    pen: 'Draw with your finger or Apple Pencil.',
    hl: 'Colour over the music to highlight it.',
    text: 'Tap where the words go, type, then Return. Tap your words to change them.',
    erase: 'Rub over a line or some words to remove them.',
  }[ci.tool] + (ci.scrolls ? (ci.pencil ? ' One finger scrolls.' : ' Two fingers scroll.') : '');
  ci.sheet.style.cursor = ci.tool === 'text' ? 'text' : ci.tool === 'erase' ? 'cell' : 'crosshair';
}

/* ---------- Changes, undo and saving ---------- */
function inkBefore() { ci.undo.push({ k: ci.k, ink: JSON.stringify(inkItems()) }); ci.redo = []; }
function inkChanged() { inkRender(); inkSave(false); }
function inkUndo(from, to) {
  inkCommitText();
  var u = from.pop();
  if (!u) return;
  to.push({ k: u.k, ink: JSON.stringify(ci.pages[u.k]) });
  ci.pages[u.k] = JSON.parse(u.ink);
  if (u.k !== ci.k) inkPage(u.k);
  inkChanged();
}
// Saved shortly after a change (a pause in drawing), and straight away on Done.
function inkSave(now) {
  clearTimeout(ci.saveTimer);
  if (!now) { ci.saveTimer = setTimeout(function () { inkSave(true); }, 1500); return; }
  var rec = get(ci.id), ch = chartOf(rec);
  if (!ch) return;
  var pages = ch.pages.map(function (p, k) {
    var q = Object.assign({}, p);
    if (ci.pages[k] && ci.pages[k].length) q.ink = ci.pages[k]; else delete q.ink;
    return q;
  });
  if (JSON.stringify(pages) === JSON.stringify(ch.pages)) return;
  rec.chart = Object.assign({}, ch, { pages: JSON.parse(JSON.stringify(pages)) });
  put(ci.id, rec);
}
function inkDone() {
  inkCommitText();
  inkSave(true);
  ci.sheet = null;
  backFromChart(ci.id, ci.back, ci.at);
}

/* ---------- Drawing ---------- */
// Where the pointer is, in pixels of the saved page picture.
function inkPoint(e) {
  var r = ci.svg.getBoundingClientRect(), p = inkChartPage(), t = pageTrim(p);
  return [Math.round((t[0] + (e.clientX - r.left) / r.width * (t[2] - t[0])) * p.w),
          Math.round((t[1] + (e.clientY - r.top) / r.height * (t[3] - t[1])) * p.h)];
}
$('ci-stage').addEventListener('pointerdown', function (e) {
  if (!ci.sheet || !ci.sheet.contains(e.target) || e.target.tagName === 'INPUT') return;
  ci.skipClick = false;
  if (e.pointerType === 'pen' && !ci.pencil) { ci.pencil = true; inkRender(); }
  if (e.pointerType === 'touch') {
    ci.touches[e.pointerId] = [e.clientX, e.clientY];
    var n = Object.keys(ci.touches).length;
    // With the Pencil, fingers only scroll (a resting hand does nothing); without it, a second finger means scroll.
    if (ci.pencil || n >= 2) {
      e.preventDefault();
      if (ci.drawing && ci.drawing.touch) inkCancel();
      ci.pan = inkMid();
      return;
    }
  }
  if (ci.drawing || e.button > 0) return;
  e.preventDefault();
  if (ci.edit) { inkCommitText(); ci.skipClick = true; return; }   // a tap away from the words being typed just finishes them
  if (ci.tool === 'text') return;                               // placed on the click (iPad only opens the keyboard then)
  try { ci.sheet.setPointerCapture(e.pointerId); } catch (err) {}
  var pt = inkPoint(e);
  if (ci.tool === 'erase') {
    ci.drawing = { id: e.pointerId, touch: e.pointerType === 'touch', erase: true, before: JSON.stringify(inkItems()), hit: false, last: pt };
    inkEraseAt(pt);
    return;
  }
  var hl = ci.tool === 'hl';
  var item = { k: hl ? 'hl' : 'pen', c: hl ? INK.hl : ci.color, w: hl ? INK.hlW : INK.penW, p: pt };
  ci.drawing = { id: e.pointerId, touch: e.pointerType === 'touch', item: item, el: inkEl(item) };
  ci.svg.appendChild(ci.drawing.el);
});
$('ci-stage').addEventListener('pointermove', function (e) {
  if (ci.touches[e.pointerId]) ci.touches[e.pointerId] = [e.clientX, e.clientY];
  if (ci.pan) {
    var m = inkMid(), stage = $('ci-stage');
    if (m) { stage.scrollLeft -= m[0] - ci.pan[0]; stage.scrollTop -= m[1] - ci.pan[1]; ci.pan = m; }
    e.preventDefault();
    return;
  }
  var d = ci.drawing;
  if (!d || e.pointerId !== d.id) return;
  e.preventDefault();
  var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
  if (!evs.length) evs = [e];
  evs.forEach(function (ev) {
    var pt = inkPoint(ev);
    if (d.erase) {
      // Every few pixels along the way, so a quick rub doesn't skip over a line.
      var a = d.last, steps = Math.ceil(Math.sqrt(dist2(pt, a[0], a[1], a[0], a[1])) / (INK.eraseR / 2));
      for (var j = 1; j <= steps; j++) inkEraseAt([a[0] + (pt[0] - a[0]) * j / steps, a[1] + (pt[1] - a[1]) * j / steps]);
      d.last = pt;
      return;
    }
    var p = d.item.p, dx = pt[0] - p[p.length - 2], dy = pt[1] - p[p.length - 1];
    if (dx * dx + dy * dy >= 4) p.push(pt[0], pt[1]);
  });
  if (!d.erase) d.el.setAttribute('d', inkPath(d.item.p));
});
function inkUp(e) {
  if (ci.touches[e.pointerId]) {
    delete ci.touches[e.pointerId];
    if (ci.pan) { ci.pan = inkMid(); ci.skipClick = true; return; }
  }
  var d = ci.drawing;
  if (!d || e.pointerId !== d.id) return;
  ci.drawing = null;
  if (d.erase) {
    if (d.hit) { ci.undo.push({ k: ci.k, ink: d.before }); ci.redo = []; inkChanged(); }
    return;
  }
  d.item.p = simplify(d.item.p, 1);
  inkBefore();
  inkItems().push(d.item);
  inkChanged();
}
$('ci-stage').addEventListener('pointerup', inkUp);
$('ci-stage').addEventListener('pointercancel', inkUp);

// Where the fingers on the page are (the middle of them), for scrolling.
function inkMid() {
  var ids = Object.keys(ci.touches);
  if (!ids.length) return null;
  var x = 0, y = 0;
  ids.forEach(function (id) { x += ci.touches[id][0]; y += ci.touches[id][1]; });
  return [x / ids.length, y / ids.length];
}
// A second finger came down: the line the first finger started was really the start of a scroll.
function inkCancel() {
  var d = ci.drawing;
  ci.drawing = null;
  if (d.erase) { if (d.hit) { ci.pages[ci.k] = JSON.parse(d.before); inkRender(); } }
  else if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
}
// Rubbing out: any line or words under the eraser go (the whole line, not just the part rubbed).
function inkEraseAt(pt) {
  var items = inkItems(), gone = false;
  for (var i = items.length - 1; i >= 0; i--) {
    if (inkHit(items[i], ci.els[i], pt, INK.eraseR)) { items.splice(i, 1); ci.els[i].parentNode.removeChild(ci.els[i]); ci.els.splice(i, 1); gone = true; }
  }
  if (gone) ci.drawing.hit = true;
}
function inkHit(it, elm, pt, r) {
  if (it.k === 'text') {
    var b = elm.getBBox();
    return pt[0] >= b.x - r && pt[0] <= b.x + b.width + r && pt[1] >= b.y - r && pt[1] <= b.y + b.height + r;
  }
  var p = it.p, reach = r + it.w / 2;
  if (p.length === 2) return dist2(pt, p[0], p[1], p[0], p[1]) <= reach * reach;
  for (var i = 0; i + 3 < p.length; i += 2) if (dist2(pt, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach * reach) return true;
  return false;
}
// Squared distance from a point to the segment (ax, ay)–(bx, by).
function dist2(pt, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  var x = ax + t * dx - pt[0], y = ay + t * dy - pt[1];
  return x * x + y * y;
}
// Fewer points, same shape (Ramer–Douglas–Peucker), so the saved songs stay small.
function simplify(p, tol) {
  if (p.length <= 4) return p;
  var n = p.length / 2, keep = new Array(n), stack = [[0, n - 1]];
  keep[0] = keep[n - 1] = true;
  while (stack.length) {
    var s = stack.pop(), a = s[0], b = s[1], far = -1, best = tol * tol;
    for (var i = a + 1; i < b; i++) {
      var d = dist2([p[i * 2], p[i * 2 + 1]], p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1]);
      if (d > best) { best = d; far = i; }
    }
    if (far >= 0) { keep[far] = true; stack.push([a, far], [far, b]); }
  }
  var out = [];
  for (i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/* ---------- Typed words ---------- */
$('ci-stage').addEventListener('click', function (e) {
  if (ci.skipClick) { ci.skipClick = false; return; }
  if (ci.tool !== 'text' || ci.edit || !ci.sheet || !ci.sheet.contains(e.target) || e.target.tagName === 'INPUT') return;
  if (ci.pencil && e.pointerType === 'touch') return;
  var pt = inkPoint(e), items = inkItems(), hit = null;
  for (var i = items.length - 1; i >= 0 && !hit; i--) if (items[i].k === 'text' && inkHit(items[i], ci.els[i], pt, 8)) hit = items[i];
  inkEditText(hit || { k: 'text', c: ci.color, s: INK.textS, x: pt[0], y: Math.round(pt[1] + INK.textS * 0.35), t: '' });
});
function inkEditText(item) {
  var p = inkChartPage(), t = pageTrim(p), scale = ci.svg.getBoundingClientRect().width / ((t[2] - t[0]) * p.w);
  var size = Math.max(16, item.s * scale);   // 16 px at least, or the iPad zooms in on the box
  var input = el('input', 'ci-input');
  input.value = item.t;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', 'done');
  input.style.fontSize = size + 'px';
  input.style.color = item.c;
  input.style.left = ((item.x - t[0] * p.w) * scale - 6) + 'px';
  input.style.top = ((item.y - t[1] * p.h) * scale - size * 1.05) + 'px';
  var grow = function () { input.style.width = Math.max(4, input.value.length + 2) + 'ch'; };
  grow();
  input.addEventListener('input', grow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); inkCommitText(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inkCommitText(true); }
  });
  input.addEventListener('blur', function () { setTimeout(function () { if (ci.edit && ci.edit.input === input) inkCommitText(); }, 0); });
  ci.edit = { item: item, input: input };
  ci.sheet.appendChild(input);
  inkRender();
  input.focus();
}
// Finish typing (cancel = leave the words as they were).
function inkCommitText(cancel) {
  var ed = ci.edit;
  if (!ed) return;
  ci.edit = null;
  if (ed.input.parentNode) ed.input.parentNode.removeChild(ed.input);
  var v = ed.input.value.trim(), items = inkItems(), i = items.indexOf(ed.item);
  if (cancel || v === ed.item.t) { inkRender(); return; }
  inkBefore();
  if (i >= 0) items.splice(i, 1);
  if (v) items.push(Object.assign({}, ed.item, { t: v }));
  inkChanged();
}

/* ---------- Buttons and keys ---------- */
Array.prototype.forEach.call(document.querySelectorAll('#ci-tools .ci-tool'), function (b) {
  b.addEventListener('click', function () {
    this.blur();
    inkCommitText();
    ci.tool = b.dataset.tool;
    if (b.dataset.color) ci.color = b.dataset.color;
    lsSet(INK.tool, ci.tool + '|' + ci.color);
    inkRender();
  });
});
$('ci-prev').addEventListener('click', function () { this.blur(); inkPage(ci.k - 1); });
$('ci-next').addEventListener('click', function () { this.blur(); inkPage(ci.k + 1); });
$('ci-undo').addEventListener('click', function () { this.blur(); inkUndo(ci.undo, ci.redo); });
$('ci-redo').addEventListener('click', function () { this.blur(); inkUndo(ci.redo, ci.undo); });
function resetInkClear() { var b = $('ci-clear'); b.textContent = 'Clear page'; b.classList.remove('armed'); }
$('ci-clear').addEventListener('click', function () {
  var b = this;
  b.blur();
  inkCommitText();
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to clear'; setTimeout(resetInkClear, 4000); return; }
  resetInkClear();
  inkBefore();
  ci.pages[ci.k] = [];
  inkChanged();
});
$('ci-done').addEventListener('click', inkDone);
$('cv-ink').addEventListener('click', function () { openInk(ly.song.id, 'lyrics'); });
$('f-chart-ink').addEventListener('click', function () { edSaveNow(); openInk(edId, 'editor'); });
document.addEventListener('keydown', function (e) {
  if (current !== 'chartink' || typing()) return;
  var cmd = e.metaKey || e.ctrlKey;
  if (cmd && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) inkUndo(ci.redo, ci.undo); else inkUndo(ci.undo, ci.redo); }
  else if (cmd || e.altKey) return;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); inkPage(ci.k + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); inkPage(ci.k - 1); }
  else if (e.key === 'Escape') { e.preventDefault(); inkDone(); }
});
window.addEventListener('resize', function () {
  if (current !== 'chartink' || !ci.sheet) return;
  inkCommitText();
  inkFit();
});
