<!-- shared-preferences:start -->
## David's preferences (shared across all of David's apps)

This section is the same in every one of David's app repos. If David states a new general preference
(not specific to this app), add it here, in this file, and commit it. David's Mac copies it to the other repos.

**Who David is.** A guitar teacher and gigging guitarist (he/him) who builds personal and teaching apps with Claude.
Comfortable with tech but not a programmer: explain in plain words, skip jargon, keep replies short and
concrete. Likes to see things working: verify before saying "done".

**How the apps are built and hosted**
- Public web apps on GitHub Pages under the **davyrockett** GitHub account (never an Artifact or a hosted
  service). Live at `https://davyrockett.github.io/<repo>/`.
- Each app: `index.html` (+ `app.js` / `styles.css` when bigger), `sw.js` service worker for offline use
  with an update banner, `manifest.webmanifest`, `icons/` drawn by `tools/make-icons.py`, a
  `Start <App>.command` for local testing on the Mac, and a README written for David.
- **Every change must bump the version** (`tools/bump.sh` where it exists, otherwise `VERSION` in `sw.js`
  and the matching app version). Without it, installed copies on phones never update.
- Settings (gear icon) always has **Appearance: Light / Dark / Auto** and **Check for updates**.
  Apps open in **Light** unless changed in Settings.
- Design follows David's First Frets app: warm off-white / dark-brown palette, bright orange accent (#F57C14; dark mode #FF9433; David tried his logo orange #E27039, too red) and
  davyrockett grey secondary text (#676767; dark mode #A3A3A3),
  Big Shoulders Display headings, Atkinson Hyperlegible body text, works well on a phone.
- Data lives on the device (localStorage / IndexedDB). Apps whose data must sync between phone and Mac
  use a separate `davyrockett/<app>-data` repo (`data.json`) and an access key pasted into Settings.
  Never commit keys, tokens or anything in `private/`.
- **Publish when done:** commit, push to `main`, and confirm the live site shows the new version.
  End with a brief summary of what changed. David's Mac pulls GitHub changes into its Dropbox copy
  automatically, so pushing is all that's needed.

**Taste**
- Labels and descriptions plain and descriptive. Jokes belong in names (e.g. "Page Fright"), not taglines.
- Keep screens uncluttered: show extra controls only when they're relevant.
- Nothing should jump around: when a control doesn't apply, grey it out in place rather than hiding it, and
  reserve space for things that appear, so other controls never shift.
- **No AI voices, ever:** no text-to-speech or synthesised singing in any app. Use written instructions on
  screen, and instrument or synth sounds for audio.
- Commit messages: a short, plain description of the change.
- When renaming or moving an app, keep the old address working with a redirect repo.

**New apps:** create the repo under davyrockett and turn on GitHub Pages; David's Mac downloads new
davyrockett repos into `~/Dropbox/Local/Claude Apps/` automatically. Give each new app its own CLAUDE.md
with this section (copy it from any other app) plus an "## This app" section.
<!-- shared-preferences:end -->

## This app

**Memory Lane Songbook**: David puts it on the TV in memory-care homes when he performs (guitar, live; the app makes
no sound). Residents choose a song from a list; the lyrics then scroll by in huge text. Live: https://davyrockett.github.io/memory-lane/
Local test: port 8774 (`memory-lane` in daily-practice's launch.json, or `Start Memory Lane.command`).

- **Set-up David chose (2026-10-15):** the TV's own web browser with a keyboard (sometimes a mouse), reliable Wi-Fi,
  medium TV with people sitting close. Several facilities, no per-group tracking. Public GitHub Pages is fine for the lyrics.
- **Flow:** Welcome (day, date, season, "Hello! My name is David."; ⌂ button or Home/Esc on the song list returns here) → song list (no heading; big tiles: title, artist · year; "All songs A–Z" + group chips, then a second row of automatic decade chips from each song's year (`DECADES` in app.js),
  Tab cycles groups) → title card (fun facts, F = next fact; "Listen for…", L = reveal/next; both also clickable) →
  Enter → countdown (Settings: 3/5/8/12 s) → **slow autoscroll** (David's hands are on the guitar, so it scrolls by itself)
  → "Let's talk" questions appear automatically 4 s after the end (←/→ step, Enter = next song).
- Lyrics: small clickable control bar at the bottom (Songs, Restart, Pause/Play, Slower/time/Faster, Size, Colors,
  Questions) that fades to 28% while scrolling and comes back on mouse move/key/pause; thin progress line at the very bottom.
  Keys: Space pause/resume (click on the words too), ↑ faster / ↓ slower (10% each, saved per song), ←/→ jump, Enter
  questions, Esc back to the song list. Talk screen: Enter always = next song; "Sing it again". Songs sung today get
  "✓ Sung today" on their tile (`ml.sung`, resets each day). Scroll time = `seconds` for the whole song; on a device without the key, ↑/↓ tweaks are kept only on
  that device (`ml.speeds`). David said he'll adjust the speeds himself; the starting values were Claude's guesses.
- Colors: Cream / White on black / Yellow on blue / Auto; **C** cycles them anywhere. Lyrics size Smaller/Normal/Bigger.
- Choruses: a section whose first line is `[Chorus]` is drawn in the chorus color with a small "Chorus" label. "(CHORUS)"
  shorthand from David's file was written out in full.
- **Data:** public repo davyrockett/memory-lane-data, `data.json` (`{app, format, items}`; `song` records + one `settings`
  record with the group order; newest `updatedAt` wins; deletions `{deleted:true}`). Edit songs in the app (Settings →
  Edit songs); saving for every device needs David's access key (memory-lane-data, Contents read+write) in Settings. Without
  a key, devices just show the published list (a device with unsaved local edits keeps them).
- **Lyrics source:** `~/Dropbox/Local/Resounding Joy/Elder Care/Classic Songs Lyrics.pages`; facts and conversation starters
  from `Classic Song Facts.pdf` there (a few PDF facts were corrected). `tools/import-lyrics.py` + `tools/song_info.py`
  built the starting list; don't rerun it (it would overwrite edits made in the app). Never retype song lyrics by hand:
  read them from David's files with a script.
- Written for older smart-TV browsers: plain `var`/functions in app.js, no `?.` or `??`.
- **Lyrics: one section at a time (default since v6, 2026-10).** At his first gig David found autoscroll hard to follow,
  so now each verse/chorus fills the screen and he presses to go on (he plays from a MacBook on HDMI, mirrored, so he
  sees the same screen; a foot pedal or presenter clicker works because they send keys). Forward: Space, →, ↓, Page Down,
  Enter, a click or tap, swipe left; back: ←, ↑, Page Up, Backspace, swipe right; Esc = song list. Held keys don't repeat.
  Verses over 5 lines are split into even pages; text starts at `STEP_SIZE` vw and shrinks to fit, and shrinks up to 25%
  more rather than break a line mid-phrase (not on phones). The faded line at the bottom previews the next section.
  Past the last section → questions. Autoscroll is still there: Settings → "Moving through the words" (`ml.mode`).
- iPad/iPhone (v6): usable, not the main target. Phones get one swipeable row of group buttons, a wrapping control bar,
  and the bar never fades on touch screens.
- Song list by width (v8): over 1100px 3 columns; 560–1100px 2 columns with wrapping group buttons; under 560px 1 column
  with the group buttons in 2 rows that swipe sideways. Group buttons always show at least 2 rows.
- **Size button in the section view (v7):** toggles one ↔ two sections per screen (pages 1+2, 3+4…; `ml.per`), labelled
  "Aa Smaller" / "Aa Bigger"; keeps your place when switched. In autoscroll it still cycles the text size.
- **TV link (v12, `remote.js`):** the TV's own browser shows the app ("📺 Use as TV screen" on the welcome screen) while
  David's laptop/phone/iPad ("🎛 Control a TV") shows the same screen and drives it, no cable. No code to type
  (v14, David's request): every device uses the fixed link name `ml` (`LINK_CODE` in remote.js); role `ml.link-role` is remembered. Every linked device
  sends its whole screen state on each change and copies what it receives (last press wins; TV keys work too).
  Relays (free, no account): MQTT over WebSocket, EMQX `broker.emqx.io:8084` then HiveMQ `broker.hivemq.com:8884`
  (no daily limit; state is retained so late joiners catch up, ignored if over 30 min old; the TV publishes signed
  `on:<id>`/`off:<id>` presence + last will so the remote shows "TV linked"). Backup when MQTT can't connect: ntfy.sh
  over port 443 (only 250 messages/day per IP, checked 2026-10-16 at ntfy.sh/v1/account). Library: `vendor/paho-mqtt.min.js`
  (Paho 1.1.0, cdnjs). Linked devices always use the section view. On the TV the control bar hides and only a small red
  dot shows if the link drops. Topics: `davyrockett-memory-lane/<code>/state|tv`, ntfy `davyrockett-memory-lane-<code>`.
  Messages carry only screen/song/section/colors. Tested with two browser tabs (both directions, late join, backup,
  mixed relays); not yet on a real smart TV.
- **Two sections per screen is the default (v14, David's request):** every song opens with two per screen; "Aa Bigger"
  switches to one for that song only (`openStep` resets `ml.per` to 2).
- **Shuffled song list (v15, David's request: residents always picked the A songs because they came first):** "All songs"
  and every group show a mixed-up order, reshuffled each time the list opens from another screen; songs sung today
  go to the end. The "A–Z" chip keeps alphabetical order for finding a requested song. Order = `mixKey(id)` from
  `shuffleSeed`; the seed travels in the TV-link state so a linked TV shows the same order.
- **A touch of colour (v17, David: "super tasteful and neat"):** each group has a soft colour (`GROUP_COLORS` in app.js;
  new groups get a spare one; decades slate blue): a dot on its button (pale tint when selected), a stripe down the left
  of its songs' tiles (the open group's colour, else the song's first group), a pale tint on the title-card panel
  (Listen for… is always soft blue); a small six-colour stripe under the app name on the welcome screen; the progress
  line is a gentle gradient. Lyrics stay plain. Yellow on blue keeps its own high-contrast text colours.
  The selected tile (v18) is framed inside the tile in its own colour (the orange outside outline clashed and got clipped).

