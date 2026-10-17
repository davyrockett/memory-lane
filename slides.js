/* Slide editor: David lays out a song's screens himself (line breaks, page breaks, repeats).

   A song's slides are saved as `slides`: a list of texts, one per screen, in the lyrics format (a blank line
   = a gap between verses, a "[Chorus]" line marks a chorus). Songs without slides keep the automatic layout.
   The big slide is a plain textarea over a "mirror" that draws the same text with the chorus colour: the
   textarea's own text is invisible, so typing, selecting, copy and paste all work as usual. The slide is
   drawn at the size it will have on the TV (small mode), in the same 16:9 frame.
   Opened from ✎ Edit in the song's control bar. Loaded after app.js and uses its globals. */

var sl = { song: null, slides: [], i: 0, history: [], saveTimer: 0, dragFrom: -1, back: 0 };

// The automatic layout as slide texts: the screens the song shows in small mode (two sections each).
function autoSlides(song) {
  var pages = songPages(Object.assign({}, song, { slides: null })), out = [];
  for (var i = 0; i < pages.length; i += 2) {
    out.push(pages.slice(i, i + 2).map(function (p) { return (p.chorus ? '[Chorus]\n' : '') + p.lines.join('\n'); }).join('\n\n'));
  }
  return out;
}

function openSlideEditor(song, atScreen) {
  song = get(song.id) || song;
  var own = customSlides(song);
  sl.song = song;
  sl.slides = own ? own.slice() : autoSlides(song);
  // Start on the slide that was showing. (With the automatic layout in "Bigger", one screen = half a slide.)
  var i = atScreen || 0;
  if (!own && perScreen() === 1 && st.screens[i]) i = Math.floor(st.screens[i][0] / 2);
  sl.i = Math.max(0, Math.min(sl.slides.length - 1, i));
  sl.history = [];
  $('sl-title').textContent = song.title;
  $('sl-status').textContent = own ? '' : 'Automatic layout. Your changes save as you type.';
  show('slides');
  renderStrip();
  selectSlide(sl.i, 0);
}

/* ---------- Drawing ---------- */
function renderStrip() {
  var box = $('sl-strip');
  box.textContent = '';
  sl.slides.forEach(function (text, n) {
    var li = el('li');
    var b = el('button', 'sl-thumb');
    b.setAttribute('aria-current', String(n === sl.i));
    b.draggable = true;
    b.appendChild(el('span', 'n', String(n + 1)));
    var blocks = textBlocks(text);
    if (!blocks.length) { b.classList.add('empty'); b.appendChild(el('div', null, '(empty)')); }
    blocks.forEach(function (bl, k) {
      if (k) b.appendChild(el('div', 'gap'));
      bl.lines.forEach(function (l) { b.appendChild(el('div', bl.chorus ? 'chorus' : null, l)); });
    });
    b.addEventListener('click', function () { selectSlide(n, 0); });
    b.addEventListener('dragstart', function (e) { sl.dragFrom = n; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(n)); } catch (x) {} });
    b.addEventListener('dragover', function (e) { e.preventDefault(); b.classList.add('drop-before'); });
    b.addEventListener('dragleave', function () { b.classList.remove('drop-before'); });
    b.addEventListener('drop', function (e) {
      e.preventDefault(); b.classList.remove('drop-before');
      var from = sl.dragFrom; sl.dragFrom = -1;
      if (from < 0 || from === n) return;
      snapshot();
      var moved = sl.slides.splice(from, 1)[0];
      var to = from < n ? n - 1 : n;
      sl.slides.splice(to, 0, moved);
      changed(); selectSlide(to, 0);
    });
    li.appendChild(b);
    box.appendChild(li);
  });
}
function updateThumb(n) {
  var li = $('sl-strip').children[n];
  if (!li) return;
  renderStrip();
  var cur = $('sl-strip').children[sl.i];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
}
// The visible copy of the slide: same text, same wrapping, with choruses coloured and "[Chorus]" drawn as a small label.
function renderMirror() {
  var m = $('sl-mirror'), text = $('sl-text').value;
  m.textContent = '';
  var inChorus = false;
  text.split('\n').forEach(function (line) {
    var d = el('div');
    if (!line.trim()) { inChorus = false; d.textContent = '​'; }
    else if (/^\s*\[chorus\]\s*$/i.test(line)) { inChorus = true; d.appendChild(el('span', 'tag', '♪ Chorus')); }
    else { d.textContent = line; if (inChorus) d.className = 'chorus'; }
    m.appendChild(d);
  });
  if (!text) m.appendChild(el('div', null, '​'));
}
// Same sizing as the sing view: start at the small-mode size (in "frame widths" instead of screen widths), shrink to
// fit, and shrink up to a quarter more rather than break a line mid-phrase. Then centre it vertically.
function fitSlide() {
  var frame = $('sl-frame'), stage = $('sl-stage'), m = $('sl-mirror'), t = $('sl-text');
  var F = frame.clientWidth, H = stage.clientHeight;
  $('sl-count').style.fontSize = (F * 0.02) + 'px';
  $('sl-next').style.fontSize = (F * 0.026) + 'px';
  var size = F * (STEP_SIZE[document.documentElement.getAttribute('data-size')] || STEP_SIZE.normal) / 100;
  function setSize(px) { m.style.fontSize = t.style.fontSize = px + 'px'; }
  m.style.paddingTop = t.style.paddingTop = '0px';
  setSize(size);
  while (size > F * 0.02 && m.scrollHeight > H) { size *= 0.94; setSize(size); }
  var floor = size * 0.75;
  while (size > floor && mirrorWrapped(size)) { size *= 0.95; setSize(size); }
  var pad = Math.max(0, (H - m.scrollHeight) / 2);
  m.style.paddingTop = t.style.paddingTop = pad + 'px';
}
function mirrorWrapped(px) {
  var lh = px * 1.2;
  return Array.prototype.some.call($('sl-mirror').children, function (d) { return d.offsetHeight > lh * 1.5; });
}
function renderFrame() {
  var n = sl.slides.length;
  $('sl-count').textContent = sl.song.title + '  ·  ' + (sl.i + 1) + ' of ' + n;
  var next = sl.i < n - 1 ? (textBlocks(sl.slides[sl.i + 1])[0] || { lines: [''] }).lines[0] : 'Questions next';
  $('sl-next').textContent = '▼ ' + next;
  $('sl-up').disabled = sl.i === 0;
  $('sl-down').disabled = sl.i >= n - 1;
  $('sl-join').disabled = sl.i >= n - 1;
  $('sl-delete').disabled = n <= 1;
  $('sl-undo').disabled = !sl.history.length;
  renderMirror();
  fitSlide();
}
function selectSlide(n, caret) {
  sl.i = Math.max(0, Math.min(sl.slides.length - 1, n));
  var t = $('sl-text');
  t.value = sl.slides[sl.i];
  Array.prototype.forEach.call($('sl-strip').querySelectorAll('.sl-thumb'), function (b, k) { b.setAttribute('aria-current', String(k === sl.i)); });
  var cur = $('sl-strip').children[sl.i];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  renderFrame();
  t.focus();
  var pos = caret === 'end' ? t.value.length : (caret || 0);
  t.setSelectionRange(pos, pos);
}

/* ---------- Editing ---------- */
function snapshot() {
  sl.history.push({ slides: sl.slides.slice(), i: sl.i });
  if (sl.history.length > 100) sl.history.shift();
}
function changed() {
  renderStrip();
  renderFrame();
  $('sl-status').textContent = 'Saving…';
  clearTimeout(sl.saveTimer);
  sl.saveTimer = setTimeout(saveSlides, 800);
}
function saveSlides() {
  clearTimeout(sl.saveTimer);
  var rec = get(sl.song.id);
  if (!rec) return;
  var slides = sl.slides.map(function (t) { return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); });
  rec.slides = slides;
  // Keep the plain lyrics in step too (used by autoscroll and the Edit songs page).
  rec.lyrics = slides.filter(Boolean).join('\n\n');
  put(sl.song.id, rec);
  sl.song = get(sl.song.id);
  $('sl-status').textContent = sync.isOn() ? '✓ Saved for every device' : 'Saved on this device only (add your access key in Settings to save for every device)';
}
$('sl-text').addEventListener('input', function () {
  sl.slides[sl.i] = this.value;
  renderMirror(); fitSlide();
  clearTimeout(sl.thumbTimer);
  sl.thumbTimer = setTimeout(function () { updateThumb(sl.i); renderFrame(); }, 300);
  $('sl-status').textContent = 'Saving…';
  clearTimeout(sl.saveTimer);
  sl.saveTimer = setTimeout(saveSlides, 800);
});
// The paragraph (verse) around the cursor: [start, end) positions in the text.
function paragraphAt(text, pos) {
  var start = text.lastIndexOf('\n\n', pos - 1);
  start = start < 0 ? 0 : start + 2;
  var end = text.indexOf('\n\n', pos);
  return [start, end < 0 ? text.length : end];
}
$('sl-text').addEventListener('keydown', function (e) {
  var t = this, a = t.selectionStart, b = t.selectionEnd, v = t.value;
  if (e.key === 'Enter' && e.shiftKey) {
    // New slide from the cursor. If the cursor was inside a chorus, the new slide's verse stays a chorus.
    e.preventDefault();
    snapshot();
    var before = v.slice(0, a).replace(/\s+$/, ''), after = v.slice(b).replace(/^\s+/, '');
    var para = v.slice(paragraphAt(v, a)[0], a);
    if (/^\s*\[chorus\]\s*\n/i.test(para) && after && !/^\s*\[chorus\]/i.test(after)) after = '[Chorus]\n' + after;
    sl.slides[sl.i] = before;
    sl.slides.splice(sl.i + 1, 0, after);
    changed();
    selectSlide(sl.i + 1, 0);
  } else if (e.key === 'Backspace' && a === 0 && b === 0 && sl.i > 0) {
    // Join this slide onto the end of the one before.
    e.preventDefault();
    snapshot();
    var prev = sl.slides[sl.i - 1], joinAt = prev.length + (prev && v ? 1 : 0);
    sl.slides[sl.i - 1] = prev + (prev && v ? '\n' : '') + v;
    sl.slides.splice(sl.i, 1);
    changed();
    selectSlide(sl.i - 1, joinAt);
  } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    selectSlide(sl.i + (e.key === 'ArrowUp' ? -1 : 1), 0);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    slidesDone();
  }
});
$('sl-new').addEventListener('click', function () { snapshot(); sl.slides.splice(sl.i + 1, 0, ''); changed(); selectSlide(sl.i + 1, 0); });
$('sl-repeat').addEventListener('click', function () { snapshot(); sl.slides.splice(sl.i + 1, 0, sl.slides[sl.i]); changed(); selectSlide(sl.i + 1, 0); });
$('sl-chorus').addEventListener('click', function () {
  var t = $('sl-text'), v = t.value, pos = t.selectionStart;
  var p = paragraphAt(v, pos), para = v.slice(p[0], p[1]);
  snapshot();
  var m = para.match(/^\s*\[chorus\]\s*\n?/i);
  if (m) { v = v.slice(0, p[0]) + para.slice(m[0].length) + v.slice(p[1]); pos = Math.max(p[0], pos - m[0].length); }
  else { v = v.slice(0, p[0]) + '[Chorus]\n' + para + v.slice(p[1]); pos += 9; }
  sl.slides[sl.i] = v;
  changed();
  selectSlide(sl.i, pos);
});
$('sl-up').addEventListener('click', function () {
  if (sl.i === 0) return;
  snapshot(); var x = sl.slides.splice(sl.i, 1)[0]; sl.slides.splice(sl.i - 1, 0, x); changed(); selectSlide(sl.i - 1, 0);
});
$('sl-down').addEventListener('click', function () {
  if (sl.i >= sl.slides.length - 1) return;
  snapshot(); var x = sl.slides.splice(sl.i, 1)[0]; sl.slides.splice(sl.i + 1, 0, x); changed(); selectSlide(sl.i + 1, 0);
});
$('sl-join').addEventListener('click', function () {
  if (sl.i >= sl.slides.length - 1) return;
  snapshot();
  var cur = sl.slides[sl.i], joinAt = cur.length;
  sl.slides[sl.i] = cur + (cur && sl.slides[sl.i + 1] ? '\n' : '') + sl.slides[sl.i + 1];
  sl.slides.splice(sl.i + 1, 1);
  changed(); selectSlide(sl.i, joinAt);
});
$('sl-delete').addEventListener('click', function () {
  if (sl.slides.length <= 1) return;
  snapshot(); sl.slides.splice(sl.i, 1); changed(); selectSlide(Math.min(sl.i, sl.slides.length - 1), 0);
});
$('sl-undo').addEventListener('click', function () {
  var h = sl.history.pop();
  if (!h) return;
  sl.slides = h.slides; changed(); selectSlide(h.i, 0);
});
$('sl-reset').addEventListener('click', function () {
  var b = this;
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'Click again to reset';
    setTimeout(function () { b.classList.remove('armed'); b.textContent = 'Reset to automatic'; }, 4000);
    return;
  }
  b.classList.remove('armed'); b.textContent = 'Reset to automatic';
  clearTimeout(sl.saveTimer);
  var rec = get(sl.song.id);
  snapshot();
  delete rec.slides;
  put(sl.song.id, rec);
  sl.song = get(sl.song.id);
  sl.slides = autoSlides(sl.song);
  renderStrip(); selectSlide(0, 0);
  $('sl-status').textContent = 'Back to the automatic layout.';
});
// Back to singing, on the slide that was being edited.
function slidesDone() {
  if ($('sl-status').textContent === 'Saving…') saveSlides();
  var song = get(sl.song.id), at = sl.i;
  ly.song = song; ly.pos = 0; ly.travel = 1; ly.done = false;
  $('lyrics').setAttribute('data-mode', 'step');
  openStep(song);
  st.i = Math.max(0, Math.min(st.screens.length - 1, customSlides(song) ? at : 0));
  renderStep(0);
}
$('sl-done').addEventListener('click', slidesDone);
window.addEventListener('resize', function () { if (current === 'slides') fitSlide(); });

ctrl('c-edit', function () { openSlideEditor(ly.song, st.i); });
