/* Charts: David's own chord charts, shown on his iPad (the remote) while the TV shows only the words.

   A song can carry
     capo  – e.g. "4", shown next to the chart
     chart – { pages: [{ src, w, h, rows, trim }], marks: [...] }
       pages: the chart as pictures, one per page, saved in the data repo's charts/ folder. A PDF is turned
              into pictures when it's added (with pdf.js, loaded only then), a photo is just made smaller.
              rows = where the lines of music are on the page (found when it's added), as [top, bottom] fractions
              of the page height; taps while marking snap to them. trim = [left, top, right, bottom] fractions of
              the page around the music: only that part is shown, so the blank margins don't shrink the music.
       marks: one per section of words (the pages of the lyrics view, st.pages), saying which lines of the chart
              go with it: { a, b, note }. a and b count pages: 1.25 = a quarter of the way down page 2.
   The remote marks whatever is on the TV with orange corner brackets. Tap the right third of the chart for the
   next screen, the left third to go back, the middle to hide everything but the music (focus) or bring it back.
   Loaded after remote.js and uses its globals. */

var CHART_K = { view: 'ml.chart-view' };
var CHART_RAW = 'https://raw.githubusercontent.com/' + DATA_REPO + '/main/';
var CHART_WIDTH = 1600;   // pixels across for a saved chart page: sharp on an iPad, small enough to load fast
function chartOf(song) { return song && song.chart && song.chart.pages && song.chart.pages.length ? song.chart : null; }
function chartSrc(p) { return CHART_RAW + p.src; }

/* ---------- Drawing a chart and its bands ---------- */
function pageTrim(p) { return p.trim || [0, 0, 1, 1]; }
// Height over width of a page as shown (margins trimmed).
function pageRatio(p) { var t = pageTrim(p); return (p.h * (t[3] - t[1])) / (p.w * (t[2] - t[0])); }
function buildChartPages(box, ch) {
  box.textContent = '';
  ch.pages.forEach(function (p, k) {
    var t = pageTrim(p), tw = t[2] - t[0], th = t[3] - t[1];
    var w = el('div', 'cv-page');
    w.style.aspectRatio = (p.w * tw) + ' / ' + (p.h * th);
    w.dataset.k = k; w.dataset.y0 = t[1]; w.dataset.y1 = t[3];
    var img = el('img');
    img.src = chartSrc(p); img.alt = 'Chart, page ' + (k + 1); img.draggable = false;
    // The whole page, scaled and shifted so just the trimmed part shows.
    img.style.width = (100 / tw) + '%'; img.style.height = (100 / th) + '%';
    img.style.left = (-t[0] / tw * 100) + '%'; img.style.top = (-t[1] / th * 100) + '%';
    w.appendChild(img);
    box.appendChild(w);
  });
}
// The marks for a set of sections, joined where they overlap or touch (two sections on one screen,
// or verse 2 pointing at the same lines as verse 1).
function bandsFor(ch, pageIdxs) {
  var list = [];
  pageIdxs.forEach(function (pi) {
    var m = ch.marks && ch.marks[pi];
    if (m && m.b > m.a) list.push({ a: m.a, b: m.b, notes: m.note ? [m.note] : [] });
  });
  list.sort(function (x, y) { return x.a - y.a; });
  var out = [];
  list.forEach(function (m) {
    var last = out[out.length - 1];
    if (last && m.a <= last.b + 0.02) {
      last.b = Math.max(last.b, m.b);
      m.notes.forEach(function (n) { if (last.notes.indexOf(n) < 0) last.notes.push(n); });
    } else out.push(m);
  });
  return out;
}
// Draws bands ({ a, b, notes, label }) onto the page pictures; a band running over a page break is drawn on both pages.
function drawBands(box, bands, cls) {
  Array.prototype.forEach.call(box.querySelectorAll('.' + cls), function (b) { b.parentNode.removeChild(b); });
  var pages = box.querySelectorAll('.cv-page');
  bands.forEach(function (band) {
    var first = true;
    for (var k = Math.floor(band.a); k < band.b && k < pages.length; k++) {
      var y0 = Number(pages[k].dataset.y0), y1 = Number(pages[k].dataset.y1);
      var top = Math.max(0, (Math.max(band.a, k) - k - y0) / (y1 - y0));
      var bot = Math.min(1, (Math.min(band.b, k + 1) - k - y0) / (y1 - y0));
      if (bot - top < 0.002) continue;
      var d = el('div', 'cv-band ' + cls + (first ? '' : ' from-prev') + (band.b > k + 1 ? ' to-next' : ''));
      d.style.top = (top * 100) + '%';
      d.style.height = ((bot - top) * 100) + '%';
      if (first && band.notes && band.notes.length) d.appendChild(el('span', 'note', band.notes.join(' · ')));
      if (first && band.label) d.appendChild(el('span', 'num', band.label));
      pages[k].appendChild(d);
      first = false;
    }
  });
}
// Scroll so the first orange band sits near the top, with a little of the chart above it showing,
// unless the bands are already in view.
function scrollToBand(scroller, cls, bottomGap) {
  var bands = scroller.querySelectorAll('.' + cls);
  if (!bands.length) return;
  var sr = scroller.getBoundingClientRect();
  var top = bands[0].getBoundingClientRect().top - sr.top + scroller.scrollTop;
  var bot = bands[bands.length - 1].getBoundingClientRect().bottom - sr.top + scroller.scrollTop;
  var view = scroller.clientHeight - (bottomGap || 0);
  if (top >= scroller.scrollTop + 4 && bot <= scroller.scrollTop + view) return;
  scroller.scrollTop = Math.max(0, top - 44);
}

/* ---------- The chart view on the remote ----------
   Three views, picked in the control bar: 🎸 Chart (the default: every song opens on it), 📺 TV (the words, as the
   TV shows them) and ◫ Both (chart on the left, the TV's words on the right; only when the iPad is sideways).
   Kept per device in ml.chart-view; "TV" lasts until the next song, "Both" stays until changed. */
var cv = { built: '', mode: '', focus: false };   // focus: just the music (and the TV's words on ◫ Both), no bars
function sideways() { return window.innerWidth > window.innerHeight && window.innerWidth >= 900; }
function chartMode() {
  if (link.role !== 'remote' || current !== 'lyrics' || !stepOn() || !chartOf(ly.song)) return 'words';
  var v = lsGet(CHART_K.view);
  if (v === 'words') return 'words';
  if (!sideways()) return 'chart';
  // Sideways, a one-page chart leaves room for the TV's words beside it even on 🎸 Chart.
  return v === 'both' || chartOf(ly.song).pages.length === 1 ? 'both' : 'chart';
}
// The button that's lit: what David picked (Chart stays lit when a one-page chart is shown beside the words).
function pickedView() {
  var mode = chartMode();
  return mode === 'words' ? 'words' : mode === 'both' && lsGet(CHART_K.view) === 'both' ? 'both' : 'chart';
}
function chartViewOn() { return chartMode() !== 'words'; }
function renderChartView() {
  var remote = link.role === 'remote';
  var song = current === 'lyrics' ? ly.song : null, ch = chartOf(song);
  var mode = chartMode();
  $('c-view').hidden = !remote;
  [['c-v-chart', 'chart'], ['c-v-tv', 'words'], ['c-v-both', 'both']].forEach(function (b) {
    var btn = $(b[0]);
    btn.disabled = !ch || (b[1] === 'both' && !sideways());
    btn.classList.toggle('on', !!ch && pickedView() === b[1]);
    btn.setAttribute('aria-pressed', String(!!ch && pickedView() === b[1]));
  });
  $('c-v-both').title = !ch ? 'No chart for this song yet (add one in Edit songs)'
    : sideways() ? 'Your chart on the left, what the TV shows on the right' : 'Turn the iPad sideways to see your chart and the TV side by side';
  $('lyrics').setAttribute('data-chart', mode === 'words' ? '' : mode);
  $('chartview').hidden = mode === 'words';
  $('step').hidden = mode === 'chart';
  // The words were sized for the whole screen; size them again for their half (or back to the whole screen).
  if (mode !== cv.mode) { cv.mode = mode; if (mode !== 'chart' && stepOn()) fitStep(); }
  document.body.classList.toggle('cv-focus', cv.focus && mode !== 'words');
  if (mode === 'words') return;
  var key = song.id + '|' + (song.updatedAt || '');
  if (cv.built !== key) { buildChartPages($('cv-pages'), ch); cv.built = key; $('cv-box').scrollTop = 0; }
  // Sideways with the chart alone: two pages side by side, like an open book, sized so both whole pages fit.
  var twoUp = mode === 'chart' && sideways() && ch.pages.length > 1;
  $('cv-pages').classList.toggle('two-up', twoUp);
  if (twoUp) fitTwoUp(ch);
  var n = st.screens.length, nxt = st.screens[st.i + 1];
  $('cv-title').textContent = song.title + '  ·  ' + (st.i + 1) + ' of ' + n;
  $('cv-capo').hidden = !song.capo;
  $('cv-capo').textContent = 'Capo ' + (song.capo || '');
  $('cv-now').textContent = firstLine(st.screens[st.i]);
  $('cv-next').textContent = nxt ? firstLine(nxt) : 'Questions (end of the song)';
  drawBands($('cv-pages'), bandsFor(ch, st.screens[st.i]), 'cv-now-band');
  if (twoUp) { $('cv-pages').style.maxWidth = ''; showSpread(); return; }
  var gap = cv.focus ? 0 : $('cv-box').getBoundingClientRect().bottom - $('ctrl').getBoundingClientRect().top;
  fitSection(gap);
  scrollToBand($('cv-box'), 'cv-now-band', gap);
}
// One page across: if this screen's marked lines are taller than the screen, make the chart just small enough
// that they all show at once (back to full size when they fit).
function fitSection(gap) {
  var pages = $('cv-pages'), box = $('cv-box'), bands = box.querySelectorAll('.cv-now-band');
  pages.style.maxWidth = '';
  if (!bands.length) return;
  var span = bands[bands.length - 1].getBoundingClientRect().bottom - bands[0].getBoundingClientRect().top;
  var room = box.clientHeight - gap - 44 - 24;
  if (span > room) pages.style.maxWidth = Math.floor(pages.getBoundingClientRect().width * room / span) + 'px';
}
// The widest pages that still fit whole between the top of the chart and the control bar, two across.
function fitTwoUp(ch) {
  var box = $('cv-box'), br = box.getBoundingClientRect();
  var tall = (cv.focus ? br.bottom - 12 : $('ctrl').getBoundingClientRect().top) - br.top - 22, wide = (box.clientWidth - 32) / 2;
  var w = Math.floor(Math.min(wide, tall / Math.max.apply(null, ch.pages.map(pageRatio))));
  $('cv-pages').style.gridTemplateColumns = 'repeat(2, ' + w + 'px)';
}
// Two-up shows a whole spread at a time: scroll to the pair of pages the orange marks are on.
function showSpread() {
  var box = $('cv-box'), band = box.querySelector('.cv-now-band');
  var page = band ? band.parentNode : box.querySelector('.cv-page');
  if (!page) return;
  box.scrollTop = Math.max(0, page.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 10);
}
function firstLine(screen) { var p = st.pages[screen[0]]; return p ? p.lines[0] + ' …' : ''; }
// Tap the right third of the chart for the next screen, the left third to go back, the middle for focus.
// (A scroll isn't a tap.)
$('cv-box').addEventListener('click', function (e) {
  var r = this.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, fwd = x > 2 / 3;
  wake();
  if (x >= 1 / 3 && !fwd) { cv.focus = !cv.focus; renderChartView(); return; }
  if (!fwd && st.i === 0) return;
  flash(fwd);
  stepGo(fwd ? 1 : -1);
});
function flash(fwd) {
  var f = $(fwd ? 'cv-flash-r' : 'cv-flash-l');
  f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
}
function pickView(v) { lsSet(CHART_K.view, v); renderChartView(); }
ctrl('c-v-chart', function () { pickView(null); });
ctrl('c-v-tv', function () { pickView('words'); });
ctrl('c-v-both', function () { pickView('both'); });
// Every song opens on the chart (a "Both" choice stays).
var openStepOrig = openStep;
openStep = function (song) { if (lsGet(CHART_K.view) === 'words') lsSet(CHART_K.view, null); return openStepOrig.apply(this, arguments); };
$('cv-mark').addEventListener('click', function () { openMark(ly.song.id, 'lyrics'); });
// Redraw whenever the words on screen change, a screen opens, or the link is turned on or off.
['renderStep', 'show', 'renderLink'].forEach(function (name) {
  var orig = window[name];
  window[name] = function () { var r = orig.apply(this, arguments); renderChartView(); return r; };
});
window.addEventListener('resize', function () { if (link.role === 'remote' && current === 'lyrics') renderChartView(); });

// The remote loads every chart picture once, so they're ready (and saved for offline use) before the songs start.
var chartsFetched = {};
function prefetchCharts() {
  if (link.role !== 'remote') return;
  allSongs().forEach(function (s) {
    var ch = chartOf(s);
    if (ch) ch.pages.forEach(function (p) { if (!chartsFetched[p.src]) { chartsFetched[p.src] = 1; new Image().src = chartSrc(p); } });
  });
}
var replaceLocalOrig = replaceLocal;
replaceLocal = function (next) { replaceLocalOrig(next); prefetchCharts(); };

/* ---------- Adding a chart (Edit songs) ---------- */
function renderEdChart() {
  var s = edId ? get(edId) : null;
  if (!s) return;
  var ch = chartOf(s), thumb = $('f-chart-thumb');
  thumb.hidden = !ch;
  if (ch) thumb.src = chartSrc(ch.pages[0]);
  var n = stepPages(s).pages.length, marked = 0;
  if (ch) for (var i = 0; i < n; i++) if (ch.marks && ch.marks[i]) marked++;
  $('f-chart-status').textContent = !ch ? 'No chart yet. Add a PDF or a photo of your chart; it shows on your iPad when it’s the remote.'
    : ch.pages.length + (ch.pages.length === 1 ? ' page' : ' pages') + ' · ' + marked + ' of ' + n + ' sections marked'
      + (marked < n ? ' (the chart shows either way; marks add the orange band)' : '');
  $('f-chart-add').textContent = ch ? 'Replace chart' : 'Add chart (PDF or photo)';
  $('f-chart-mark').disabled = !ch;
  $('f-chart-remove').disabled = !ch;
  resetChartRemove();
}
var edPickOrig = edPick;
edPick = function (id) { edPickOrig(id); renderEdChart(); };
$('f-chart-add').addEventListener('click', function () {
  if (!sync.isOn()) { toast('First add your access key in Settings, so the chart saves for every device.'); return; }
  $('f-chart-file').value = '';
  $('f-chart-file').click();
});
$('f-chart-file').addEventListener('change', function () {
  var file = this.files && this.files[0], id = edId;
  if (!file || !id) return;
  var status = $('f-chart-status'), add = $('f-chart-add');
  add.disabled = true;
  status.textContent = 'Reading the chart…';
  chartPictures(file).then(function (pics) {
    var stamp = Date.now().toString(36), done = 0;
    status.textContent = 'Saving the chart…';
    // One page at a time, so GitHub never sees two saves at once.
    return pics.reduce(function (chain, pic, k) {
      return chain.then(function () {
        pic.src = 'charts/' + id + '-' + stamp + '-' + (k + 1) + '.' + pic.ext;
        return saveFile(pic.src, pic.data, 'Chart for ' + (get(id) || {}).title).then(function () {
          done++;
          status.textContent = 'Saving the chart… (' + done + ' of ' + pics.length + ')';
        });
      });
    }, Promise.resolve()).then(function () {
      var rec = get(id), old = chartOf(rec);
      rec.chart = { pages: pics.map(function (p) { return { src: p.src, w: p.w, h: p.h, rows: p.rows, trim: p.trim }; }), marks: [] };
      put(id, rec);
      if (old) removeFiles(old);
      if (edId === id) renderEdChart();
      toast('Chart saved. Next: “Mark the chart…” to match it to the words.');
    });
  }).catch(function (e) {
    status.textContent = (e && e.message) || 'Couldn’t add that chart.';
    status.classList.add('problem');
    setTimeout(function () { status.classList.remove('problem'); }, 6000);
  }).then(function () { add.disabled = false; });
});
function resetChartRemove() { var b = $('f-chart-remove'); b.textContent = 'Remove chart'; b.classList.remove('armed'); }
$('f-chart-remove').addEventListener('click', function () {
  var b = this;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to remove'; setTimeout(resetChartRemove, 4000); return; }
  var rec = get(edId), old = chartOf(rec);
  delete rec.chart;
  put(edId, rec);
  if (old && sync.isOn()) removeFiles(old);
  renderEdChart();
  toast('Chart removed.');
});
$('f-chart-mark').addEventListener('click', function () { edSaveNow(); openMark(edId, 'editor'); });

// Save a file (base64) in the data repo, next to data.json.
function saveFile(path, base64, message) {
  return github('/contents/' + path, { method: 'PUT', body: JSON.stringify({ message: message, content: base64 }) }).then(function (res) {
    if (!res.ok) throw new SyncError('other', 'GitHub said ' + res.status + ' when saving the chart.');
  });
}
// Tidy up a replaced chart's pictures (best effort: an old picture left behind does no harm).
function removeFiles(ch) {
  ch.pages.forEach(function (p) {
    github('/contents/' + p.src).then(function (res) { return res.ok ? res.json() : null; }).then(function (f) {
      if (f && f.sha) github('/contents/' + p.src, { method: 'DELETE', body: JSON.stringify({ message: 'Remove old chart', sha: f.sha }) });
    }).catch(function () {});
  });
}

// A PDF or photo → pictures: [{ data (base64), ext, w, h, rows }].
function chartPictures(file) {
  var pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (pdf) {
    return Promise.all([loadPdfJs(), file.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, 8), out = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= n; i++) {
        (function (num) {
          chain = chain.then(function () { return doc.getPage(num); }).then(function (page) {
            var vp = page.getViewport({ scale: 1 }), scale = CHART_WIDTH / vp.width;
            vp = page.getViewport({ scale: scale });
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            var g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            return page.render({ canvasContext: g, viewport: vp }).promise.then(function () { out.push(picture(c, 'png')); });
          });
        })(i);
      }
      return chain.then(function () { return out; });
    }).catch(function (e) {
      throw new Error(e && e.message && /pdf\.js/.test(e.message) ? e.message : 'Couldn’t read that PDF.');
    });
  }
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var scale = Math.min(1, CHART_WIDTH / img.naturalWidth);
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve([picture(c, 'jpg')]);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Couldn’t open that picture. Try a PDF, JPEG or PNG.')); };
    img.src = url;
  });
}
function picture(c, ext) {
  var data = c.toDataURL(ext === 'png' ? 'image/png' : 'image/jpeg', 0.85);
  return { data: data.slice(data.indexOf(',') + 1), ext: ext, w: c.width, h: c.height, rows: findRows(c), trim: findTrim(c) };
}
// The box around the music, with a little white kept around it: [left, top, right, bottom] fractions of the page.
// A dot of dust doesn't count (a column or row needs a few dark spots), and a page on a black backdrop isn't trimmed.
function findTrim(c) {
  var W = 300, H = Math.round(c.height * W / c.width);
  var s = document.createElement('canvas'); s.width = W; s.height = H;
  var g = s.getContext('2d');
  g.drawImage(c, 0, 0, W, H);
  var px = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H), sum = 0;
  for (var i = 0; i < W * H; i++) { lum[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11; sum += lum[i]; }
  var dark = (sum / (W * H)) * 0.6, cols = new Array(W).fill(0), rows = new Array(H).fill(0);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (lum[y * W + x] < dark) { cols[x]++; rows[y]++; }
  if (cols.some(function (n) { return n > H * 0.5; })) return [0, 0, 1, 1];
  var on = function (n) { return n >= 2; };
  var x0 = cols.findIndex(on), y0 = rows.findIndex(on);
  if (x0 < 0 || y0 < 0) return [0, 0, 1, 1];
  var x1 = W - 1 - cols.slice().reverse().findIndex(on), y1 = H - 1 - rows.slice().reverse().findIndex(on);
  var pad = 0.015, r = function (v) { return Math.round(v * 10000) / 10000; };
  var l = Math.max(0, x0 / W - pad), rt = Math.min(1, (x1 + 1) / W + pad);
  // Words-only sheets often fill just the left half: keep at least 60% of the width so they don't grow huge.
  if (rt - l < 0.6) { rt = Math.min(1, l + 0.6); l = rt - 0.6; }
  return [r(l), r(Math.max(0, y0 / H - pad)), r(rt), r(Math.min(1, (y1 + 1) / H + pad))];
}
// Where the lines of music are: rows of the page with ink on them, joined across small gaps
// (chord names, staff and words stay together; the white space between lines of music splits them).
function findRows(c) {
  var W = 300, H = Math.round(c.height * W / c.width);
  var s = document.createElement('canvas'); s.width = W; s.height = H;
  var g = s.getContext('2d');
  g.drawImage(c, 0, 0, W, H);
  var px = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H), sum = 0;
  for (var i = 0; i < W * H; i++) { lum[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11; sum += lum[i]; }
  var dark = (sum / (W * H)) * 0.6, ink = [], edge = [];
  // A black border or backdrop around a scanned page isn't ink: skip columns that are dark most of the way down.
  for (var x = 0; x < W; x++) {
    var d = 0;
    for (var y = 0; y < H; y++) if (lum[y * W + x] < dark) d++;
    edge.push(d > H * 0.5);
  }
  for (y = 0; y < H; y++) {
    var n = 0;
    for (x = 0; x < W; x++) if (!edge[x] && lum[y * W + x] < dark) n++;
    ink.push(n >= 2);
  }
  var bands = [], start = -1, gap = Math.max(2, Math.round(H * 0.01));
  for (y = 0; y <= H; y++) {
    if (y < H && ink[y]) { if (start < 0) start = y; continue; }
    if (start < 0) continue;
    var last = bands[bands.length - 1];
    if (last && start - last[1] < gap) last[1] = y; else bands.push([start, y]);
    start = -1;
  }
  return bands.filter(function (b) { return b[1] - b[0] > H * 0.004; })
    .map(function (b) { return [Math.round(b[0] / H * 10000) / 10000, Math.round(b[1] / H * 10000) / 10000]; });
}
var pdfJs = null;
function loadPdfJs() {
  if (pdfJs) return pdfJs;
  pdfJs = new Promise(function (resolve, reject) {
    var sc = document.createElement('script');
    sc.src = 'vendor/pdfjs/pdf.min.js';
    sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
    sc.onerror = function () { pdfJs = null; reject(new Error('Couldn’t load the PDF reader (pdf.js). Check the internet connection.')); };
    document.head.appendChild(sc);
  });
  return pdfJs;
}

/* ---------- Marking the chart ----------
   One section of words at a time: tap the first line of music that goes with it, then the last line
   (the same line again if it's just one), then Next. Taps snap to the lines of music found on the page. */
var cm = { id: null, pages: [], marks: [], i: 0, tapped: false, back: 'editor', at: 0, noteTimer: 0 };
function openMark(id, back) {
  var song = get(id), ch = chartOf(song);
  if (!ch) return;
  cm = { id: id, pages: stepPages(song).pages, marks: (ch.marks || []).slice(), i: 0, tapped: false, back: back,
         at: back === 'lyrics' ? st.i : 0, noteTimer: 0, first: back === 'lyrics' ? st.screens[st.i][0] : 0 };
  cm.i = cm.first || 0;
  if (back !== 'lyrics') { while (cm.i < cm.pages.length - 1 && cm.marks[cm.i]) cm.i++; if (cm.marks[cm.i]) cm.i = 0; }
  $('cm-title').textContent = 'Mark the chart: ' + song.title;
  buildChartPages($('cm-pages'), ch);
  show('chartmark');
  $('cm-box').scrollTop = 0;
  renderMark();
}
function renderMark() {
  var n = cm.pages.length, p = cm.pages[cm.i], m = cm.marks[cm.i];
  $('cm-count').textContent = 'Section ' + (cm.i + 1) + ' of ' + n;
  var w = $('cm-words');
  w.textContent = '';
  w.className = 'cm-words' + (p.chorus ? ' chorus' : '');
  if (p.chorus) w.appendChild(el('p', 'cap', 'Chorus'));
  p.lines.forEach(function (l) { w.appendChild(el('p', null, l)); });
  $('cm-help').textContent = cm.tapped ? 'Now tap the last line of music for these words (tap the same line again if it’s just one).'
    : m ? (cm.i < cm.pages.length - 1 ? 'Marked. Add a note if you like, then press Next ▸ for the next section.'
      : 'Marked. That’s the last section: press Done.') + ' (Tap the chart again to redo it.)'
    : 'Tap the first line of music that goes with these words.';
  $('cm-note').value = m && m.note ? m.note : '';
  $('cm-note').disabled = !m;
  $('cm-clear').disabled = !m;
  $('cm-prev').disabled = cm.i === 0;
  $('cm-next').disabled = cm.i >= n - 1;
  // The other sections' marks show faintly with their number; this one in orange.
  var others = [];
  cm.marks.forEach(function (mk, j) { if (mk && j !== cm.i && j < n) others.push({ a: mk.a, b: mk.b, label: String(j + 1) }); });
  drawBands($('cm-pages'), others, 'cm-other');
  drawBands($('cm-pages'), m ? [{ a: m.a, b: m.b, notes: m.note ? [m.note] : [] }] : [], 'cm-cur');
  scrollToBand($('cm-box'), 'cm-cur');
}
// Where a tap landed, snapped to a line of music: { top, bottom } in pages (1.25 = page 2, a quarter down).
function tapRow(e) {
  var pg = e.target.closest ? e.target.closest('.cv-page') : null;
  if (!pg) return null;
  var k = Number(pg.dataset.k), r = pg.getBoundingClientRect();
  var y = Number(pg.dataset.y0) + (e.clientY - r.top) / r.height * (pg.dataset.y1 - pg.dataset.y0);
  var rows = (chartOf(get(cm.id)).pages[k] || {}).rows || [], best = null, dist = 0.03;
  rows.forEach(function (row) {
    var d = y < row[0] ? row[0] - y : y > row[1] ? y - row[1] : 0;
    if (d < dist) { dist = d; best = row; }
  });
  if (!best) return { top: k + Math.max(0, y - 0.03), bottom: k + Math.min(1, y + 0.03) };
  // Chord names (or 1st/2nd ending brackets) sometimes sit a little apart from their staff: the line of music
  // starts at the top of those thin rows just above. "Thin" = clearly shorter than a typical staff with its words.
  var tall = rows.map(function (r) { return r[1] - r[0]; }).filter(function (h) { return h >= 0.03; })
    .sort(function (x, y) { return x - y; });
  var thin = (tall.length ? tall[Math.floor(tall.length / 2)] : 0.06) * 0.7;
  var top = best[0], j = rows.indexOf(best);
  while (j > 0 && top - rows[j - 1][1] < 0.015 && rows[j - 1][1] - rows[j - 1][0] < thin) { j--; top = rows[j][0]; }
  return { top: k + top, bottom: k + best[1] };
}
$('cm-box').addEventListener('click', function (e) {
  var t = tapRow(e);
  if (!t) return;
  var m = cm.marks[cm.i], note = m && m.note;
  if (!cm.tapped) {
    cm.marks[cm.i] = { a: t.top, b: t.bottom };
    if (note) cm.marks[cm.i].note = note;
    cm.tapped = true;
  } else {
    if (t.bottom > m.a) m.b = Math.max(t.bottom, m.b); else m.a = t.top;   // tapped above the first line: that's the start
    cm.tapped = false;
  }
  saveMarks();
  renderMark();
});
$('cm-note').addEventListener('input', function () {
  var m = cm.marks[cm.i];
  if (!m) return;
  var v = this.value.trim();
  if (v) m.note = v; else delete m.note;
  clearTimeout(cm.noteTimer);
  cm.noteTimer = setTimeout(function () { saveMarks(); drawBands($('cm-pages'), [{ a: m.a, b: m.b, notes: m.note ? [m.note] : [] }], 'cm-cur'); }, 500);
});
$('cm-clear').addEventListener('click', function () { cm.marks[cm.i] = null; cm.tapped = false; saveMarks(); renderMark(); });
function markGo(d) {
  var j = cm.i + d;
  if (j < 0 || j >= cm.pages.length) return;
  cm.i = j; cm.tapped = false;
  renderMark();
}
$('cm-prev').addEventListener('click', function () { this.blur(); markGo(-1); });
$('cm-next').addEventListener('click', function () { this.blur(); markGo(1); });
function saveMarks() {
  var rec = get(cm.id), ch = chartOf(rec);
  if (!ch) return;
  var marks = cm.marks.slice(0, cm.pages.length);
  while (marks.length && !marks[marks.length - 1]) marks.pop();
  rec.chart = Object.assign({}, ch, { marks: marks.map(function (m) { return m || null; }) });
  put(cm.id, rec);
}
function markDone() {
  clearTimeout(cm.noteTimer);
  saveMarks();
  var song = get(cm.id);
  if (cm.back === 'lyrics' && song) {
    // Back to the song on the same screen (and sections per screen), so the TV doesn't move.
    var per = perScreen();
    lyOpen(song);
    if (per !== perScreen()) { lsSet(K.per, String(per)); buildScreens(); }
    st.i = Math.max(0, Math.min(st.screens.length - 1, cm.at));
    renderStep(0);
  } else {
    show('editor');
    renderEdList();
    edPick(cm.id);
  }
}
$('cm-done').addEventListener('click', markDone);
document.addEventListener('keydown', function (e) {
  if (current !== 'chartmark' || typing() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); markGo(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); markGo(-1); }
  else if (e.key === 'Escape') { e.preventDefault(); markDone(); }
});

renderChartView();
prefetchCharts();
