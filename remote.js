/* TV link: the TV's browser shows the app, and David's laptop (or phone / iPad) shows the same thing and
   drives it, with no cable between them.

   Every linked device sends its whole screen state ("song 12, section 3, colors cream…") whenever it
   changes, and copies the state it receives from the others. Last press wins.

   The messages travel through free public relays (no account), over the internet:
     1. MQTT (EMQX, then HiveMQ if that fails): no daily limit; keeps the latest state so a device that
        joins late catches up at once; tells the remote whether the TV is connected.
     2. ntfy.sh, only when MQTT can't connect (it uses the normal web port, so it gets through strict
        Wi-Fi, but allows just 250 messages a day per internet connection).
   Messages hold only which screen, song and section is showing. Loaded after app.js and uses its globals. */

var LINK_K = { role: 'ml.link-role' };
var LINK_CODE = 'ml';   // David's fixed link name: nothing to type, every device uses it
var BROKERS = [
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt' },
  { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
];
var link = {
  role: lsGet(LINK_K.role) || '',          // '' (off), 'tv' or 'remote'
  me: Math.random().toString(36).slice(2, 10),
  seq: 0,
  seen: {},                                // newest message number applied from each other device
  applying: false,
  mqtt: null, mqttOn: false, broker: 0, retryTimer: 0,
  ntfy: null, ntfyOn: false,
  tvOnline: null,                          // remote only: is the TV connected?
  tvId: '',                                // remote only: which TV connection said it's on
  beat: 0,
  sendTimer: 0,
};
function linkCode() { return LINK_CODE; }
function linkBase() { return 'davyrockett-memory-lane/' + linkCode(); }
function ntfyTopic() { return 'davyrockett-memory-lane-' + linkCode(); }
function linked() { return link.role === 'tv' || link.role === 'remote'; }

/* ---------- What's on screen, as a small object ---------- */
function screenState() {
  var s = { screen: current, theme: document.documentElement.getAttribute('data-theme'),
            size: document.documentElement.getAttribute('data-size'), per: perScreen() };
  if (current === 'list') { s.group = group; s.seed = shuffleSeed; }
  if (current === 'card' && card.song) { s.song = card.song.id; s.cm = card.mode; s.cf = card.fact; s.cl = card.listen; }
  if (current === 'lyrics' && ly.song) { s.song = ly.song.id; s.i = st.i; }
  if (current === 'talk' && talk.song) { s.song = talk.song.id; s.ti = talk.i; }
  return s;
}
function applyState(s) {
  link.applying = true;
  try {
    if (s.theme && s.theme !== document.documentElement.getAttribute('data-theme')) { lsSet(K.theme, s.theme); applyTheme(s.theme); }
    if (s.size && s.size !== document.documentElement.getAttribute('data-size')) { lsSet(K.size, s.size); document.documentElement.setAttribute('data-size', s.size); }
    var perChanged = s.per && s.per !== perScreen();
    if (perChanged) lsSet(K.per, String(s.per));
    var song = s.song ? get(s.song) : null;
    if (s.screen === 'welcome' && current !== 'welcome') openWelcome();
    else if (s.screen === 'list') {
      if (s.group && s.group !== group) { group = s.group; lsSet(K.group, group); }
      if (s.seed != null) shuffleSeed = s.seed;   // same mixed-up order as the other device
      if (current !== 'list') openList(); else renderList();
    } else if (s.screen === 'card' && song) {
      if (current !== 'card' || !card.song || card.song.id !== song.id) openCard(song.id);
      card.mode = s.cm || 'fact'; card.fact = s.cf || 0; card.listen = s.cl || 0;
      renderPanel();
    } else if (s.screen === 'lyrics' && song) {
      var prev = current === 'lyrics' && ly.song && ly.song.id === song.id ? st.i : -1;
      if (prev < 0) { lyOpen(song); prev = 0; }
      else if (perChanged) buildScreens();
      st.i = Math.max(0, Math.min(st.screens.length - 1, s.i || 0));
      renderStep(st.i > prev ? 1 : st.i < prev ? -1 : 0);
    } else if (s.screen === 'talk' && song) {
      if (current !== 'talk' || !talk.song || talk.song.id !== song.id) openTalk(song);
      talk.i = s.ti || 0;
      renderTalk();
    }
  } finally {
    link.applying = false;
  }
}
// Linked devices always use the one-section-at-a-time view, so every screen shows the same words.
function lyOpen(song) {
  ly.song = song; ly.pos = 0; ly.travel = 1; ly.done = false;
  $('lyrics').setAttribute('data-mode', 'step');
  pause();
  openStep(song);
}

/* ---------- Sending ---------- */
function stateChanged() {
  if (!linked() || link.applying || current === 'editor') return;
  clearTimeout(link.sendTimer);
  link.sendTimer = setTimeout(sendState, 60);
}
function sendState() {
  var body = JSON.stringify({ k: 'ml1', id: link.me, n: ++link.seq, t: Date.now(), s: screenState() });
  if (link.mqttOn) {
    try {
      var m = new Paho.Message(body);
      m.destinationName = linkBase() + '/state';
      m.retained = true;   // so a device that joins later starts on the same screen
      link.mqtt.send(m);
      // If the TV isn't on the main relay (stricter Wi-Fi on its side), also send through the backup.
      if (!(link.role === 'remote' && link.tvOnline === false && link.ntfyOn)) return;
    } catch (e) {}
  }
  if (link.ntfyOn) {
    fetch('https://ntfy.sh/' + ntfyTopic(), { method: 'POST', body: body }).catch(function () {});
  }
}
// Hook into the app: whenever one of these runs, the screen changed, so tell the other devices.
['show', 'renderPanel', 'renderStep', 'renderTalk', 'renderList', 'applyTheme', 'buildScreens'].forEach(function (name) {
  var orig = window[name];
  window[name] = function () { var r = orig.apply(this, arguments); stateChanged(); return r; };
});
// While linked, lyrics always open one section at a time.
var stepModeOrig = stepMode;
stepMode = function () { return linked() || stepModeOrig(); };

/* ---------- Receiving ---------- */
function receive(text, retained) {
  var msg;
  try { msg = JSON.parse(text); } catch (e) { return; }
  if (!msg || msg.k !== 'ml1' || msg.id === link.me || !msg.s) return;
  if (link.seen[msg.id] && msg.n <= link.seen[msg.id]) return;   // old or repeated
  link.seen[msg.id] = msg.n;
  // A saved state from a long time ago (e.g. last week's visit) shouldn't move this screen.
  if (retained && Math.abs(Date.now() - msg.t) > 30 * 60 * 1000) return;
  if (current === 'editor' || $('settings').open) return;
  applyState(msg.s);
}

/* ---------- MQTT ---------- */
function mqttConnect() {
  clearTimeout(link.retryTimer);
  if (!linked() || typeof Paho === 'undefined') { ntfyStart(); return; }
  var b = BROKERS[link.broker % BROKERS.length];
  var client = new Paho.Client(b.host, b.port, b.path, 'ml-' + link.me + '-' + Date.now().toString(36));
  link.mqtt = client;
  client.onMessageArrived = function (m) {
    if (m.destinationName === linkBase() + '/tv') { tvPresence(m.payloadString); return; }
    receive(m.payloadString, m.retained);
  };
  client.onConnectionLost = function () {
    if (link.mqtt !== client) return;
    link.mqttOn = false; renderLink();
    retry();
  };
  var opts = {
    useSSL: true, timeout: 6, keepAliveInterval: 20, cleanSession: true,
    onSuccess: function () {
      if (link.mqtt !== client) return;
      link.mqttOn = true; link.fails = 0;
      client.subscribe(linkBase() + '/state');
      if (link.role === 'remote') client.subscribe(linkBase() + '/tv');
      if (link.role === 'tv') {
        // Say "on" now and every 20 seconds, signed with this connection's id.
        var sayOn = function () {
          if (!link.mqttOn || link.mqtt !== client) return;
          var on = new Paho.Message('on:' + link.me); on.destinationName = linkBase() + '/tv'; on.retained = true;
          try { client.send(on); } catch (e) {}
        };
        sayOn();
        clearInterval(link.beat);
        link.beat = setInterval(sayOn, 20000);
      }
      renderLink();
    },
    onFailure: function () {
      if (link.mqtt !== client) return;
      link.mqttOn = false; renderLink();
      retry();
    },
  };
  if (link.role === 'tv') {
    // If the TV drops off, the relay tells the remote.
    var off = new Paho.Message('off:' + link.me); off.destinationName = linkBase() + '/tv'; off.retained = true;
    opts.willMessage = off;
  }
  try { client.connect(opts); } catch (e) { retry(); }
}
function retry() {
  link.broker++;                 // try the other relay next time
  link.fails = (link.fails || 0) + 1;
  ntfyStart();                   // meanwhile, listen on the backup
  clearTimeout(link.retryTimer);
  link.retryTimer = setTimeout(mqttConnect, Math.min(30000, 4000 * link.fails));   // try less often if it keeps failing
}
// "on:<id>" / "off:<id>" from the TV. An "off" only counts if it's from the TV connection that last said "on"
// (a reloaded TV's old connection can say "off" after the new one said "on").
function tvPresence(text) {
  var parts = String(text).split(':'), state = parts[0], id = parts[1] || '';
  if (state === 'on') { link.tvId = id; link.tvOnline = true; }
  else if (state === 'off' && (!link.tvId || id === link.tvId)) link.tvOnline = false;
  if (link.tvOnline === false) ntfyStart();   // the TV may be on the backup relay
  renderLink();
}
function mqttStop() {
  clearTimeout(link.retryTimer);
  clearInterval(link.beat);
  var c = link.mqtt;
  link.mqtt = null; link.mqttOn = false;
  if (c) {
    try {
      if (link.role === 'tv' && c.isConnected()) {
        var off = new Paho.Message('off:' + link.me); off.destinationName = linkBase() + '/tv'; off.retained = true; c.send(off);
      }
      c.disconnect();
    } catch (e) {}
  }
}

/* ---------- ntfy.sh backup ---------- */
function ntfyStart() {
  if (!linked() || link.ntfy || typeof EventSource === 'undefined') return;
  var es = new EventSource('https://ntfy.sh/' + ntfyTopic() + '/sse');
  link.ntfy = es;
  es.onopen = function () { link.ntfyOn = true; renderLink(); };
  es.onerror = function () { link.ntfyOn = false; renderLink(); };   // EventSource retries by itself
  es.onmessage = function (e) {
    var d;
    try { d = JSON.parse(e.data); } catch (x) { return; }
    if (d && d.event === 'message' && d.message) receive(d.message, false);
  };
}
function ntfyStop() { if (link.ntfy) { link.ntfy.close(); link.ntfy = null; } link.ntfyOn = false; }

/* ---------- Turning it on and off ---------- */
function linkStart(role) {
  linkStop();
  link.role = role;
  lsSet(LINK_K.role, role);
  link.tvOnline = null; link.tvId = '';
  document.body.classList.toggle('tv', role === 'tv');
  renderLink();
  mqttConnect();
  // The remote waits a moment for the TV's latest screen; if none comes, it sends its own.
  setTimeout(function () { if (linked()) sendState(); }, role === 'tv' ? 2500 : 1500);
}
function linkStop() {
  mqttStop(); ntfyStop();
  link.role = '';
  lsSet(LINK_K.role, null);
  document.body.classList.remove('tv');
  renderLink();
}

/* ---------- On screen ---------- */
function renderLink() {
  var pill = $('link-pill');
  var on = link.mqttOn || link.ntfyOn;
  pill.className = 'link-pill';
  if (!linked()) { pill.hidden = true; }
  else if (link.role === 'tv') {
    // The TV stays clean: only a small red dot when it has lost the connection.
    pill.hidden = on;
    pill.textContent = '';
    pill.classList.add('dot');
  } else {
    pill.hidden = false;
    if (!on) { pill.textContent = '● Connecting…'; pill.classList.add('wait'); }
    else if (!link.mqttOn) { pill.textContent = '● Linked (backup)'; pill.classList.add('ok'); }   // the backup can't tell if the TV is there
    else if (link.tvOnline === false) { pill.textContent = '● TV not connected'; pill.classList.add('warn'); }
    else if (link.tvOnline === true) { pill.textContent = '● TV linked'; pill.classList.add('ok'); }
    else { pill.textContent = '● Linked'; pill.classList.add('ok'); }
  }
  var w = $('welcome-tv'), r = $('welcome-remote');
  w.textContent = link.role === 'tv' ? '📺 TV screen ✓' : '📺 Use as TV screen';
  r.textContent = link.role === 'remote' ? '🎛 Remote ✓' : '🎛 Control a TV';
  w.setAttribute('aria-pressed', String(link.role === 'tv'));
  r.setAttribute('aria-pressed', String(link.role === 'remote'));
  $('link-status').textContent = !linked() ? 'Off. This device works on its own.'
    : (link.role === 'tv' ? 'This device is the TV screen. ' : 'This device is a remote. ')
      + (link.mqttOn ? 'Connected.' : link.ntfyOn ? 'Connected (backup relay).' : 'Connecting…');
  $('link-off').disabled = !linked();
}
$('welcome-tv').addEventListener('click', function () { this.blur(); if (link.role === 'tv') linkStop(); else linkStart('tv'); });
$('welcome-remote').addEventListener('click', function () { this.blur(); if (link.role === 'remote') linkStop(); else linkStart('remote'); });
$('link-tv').addEventListener('click', function () { linkStart('tv'); });
$('link-remote').addEventListener('click', function () { linkStart('remote'); });
$('link-off').addEventListener('click', linkStop);
// Reconnect quickly when the screen wakes up or the Wi-Fi comes back.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && linked() && !link.mqttOn) mqttConnect();
});
window.addEventListener('online', function () { if (linked() && !link.mqttOn) mqttConnect(); });

renderLink();
if (linked()) linkStart(link.role);
