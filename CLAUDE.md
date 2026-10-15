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
- **Flow:** Welcome (day, date, season) → song list (big tiles: title, artist · year; "All songs A–Z" + group chips,
  Tab cycles groups) → title card (fun facts, F = next fact; "Listen for…", L = reveal/next; both also clickable) →
  Enter → countdown (Settings: 3/5/8/12 s) → **slow autoscroll** (David's hands are on the guitar, so it scrolls by itself)
  → "Let's talk" questions appear automatically 4 s after the end (←/→ step, Enter = next song).
- Lyrics keys: Space pause/resume (click too), ↑ faster / ↓ slower (10% each, saved per song), ←/→ jump back/forward, Enter
  finish, Esc back. Scroll time = `seconds` for the whole song; on a device without the key, ↑/↓ tweaks are kept only on
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
