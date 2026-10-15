"""Builds the starting song list from David's lyrics file and tools/song_info.py.

   python3 tools/import-lyrics.py            -> writes ../memory-lane-data/data.json

Reads the text straight out of "Classic Songs Lyrics.pages" (a Pages file is a zip of
snappy-compressed chunks), splits it into songs by title, breaks long run-on lines at
", Capital", writes out every "(CHORUS)", and adds the facts/questions from song_info.py.
Run once to start the list; after that, edit songs in the app (running this again would
overwrite those edits)."""
import json, re, sys, zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from song_info import SONGS, CATEGORIES

PAGES = Path.home() / "Dropbox/Local/Resounding Joy/Elder Care/Classic Songs Lyrics.pages"
OUT = Path(__file__).resolve().parent.parent.parent / "memory-lane-data" / "data.json"

# Small typo fixes in the lyrics file (wrong -> right).
FIXES = {
    "she's goes away": "she goes away",
    "Bright early next morning": "Bright and early next morning",
    "than I'll never know": "than I'll ever know",
    "from these prison walls have flown": "from prison bars has flown",
    "′": "’",
}


def snappy(d):
    i = n = s = 0
    while True:
        b = d[i]; i += 1; n |= (b & 0x7F) << s; s += 7
        if b < 0x80:
            break
    out = bytearray()
    while i < len(d):
        t = d[i]; i += 1; k = t & 3
        if k == 0:
            ln = t >> 2
            if ln >= 60:
                nb = ln - 59; ln = int.from_bytes(d[i:i + nb], "little"); i += nb
            ln += 1; out += d[i:i + ln]; i += ln
        else:
            if k == 1: ln = ((t >> 2) & 7) + 4; o = ((t >> 5) << 8) | d[i]; i += 1
            elif k == 2: ln = (t >> 2) + 1; o = int.from_bytes(d[i:i + 2], "little"); i += 2
            else: ln = (t >> 2) + 1; o = int.from_bytes(d[i:i + 4], "little"); i += 4
            for _ in range(ln):
                out.append(out[-o])
    return bytes(out)


def pages_text():
    raw = zipfile.ZipFile(PAGES).read("Index/Document.iwa")
    i, res = 0, b""
    while i < len(raw):
        ln = int.from_bytes(raw[i + 1:i + 4], "little")
        res += snappy(raw[i + 4:i + 4 + ln]); i += 4 + ln
    # The document text is the longest run of readable characters.
    runs = re.findall(rb"[\x20-\x7e\xc2-\xf4\x80-\xbf\n\r\t]{40,}", res)
    return max((r.decode("utf-8", "ignore") for r in runs), key=len)


def split_line(line):
    """'Ain't no…gone, Anytime she goes away' -> two lines, so huge text breaks in natural places."""
    parts = [line]
    for sep in (", ", "? ", ". ", "! "):
        nxt = []
        for p in parts:
            if len(p) > 38:
                bits = re.split(rf"(?<={re.escape(sep[0])}) (?=[A-Z‘“'\"])", p)
                nxt += [b.strip() for b in bits if b.strip()]
            else:
                nxt.append(p)
        parts = nxt
    # Still long: break at the comma nearest the middle.
    done = []
    for p in parts:
        while len(p) > 50 and ", " in p:
            cuts = [m.end() for m in re.finditer(", ", p)]
            c = min(cuts, key=lambda x: abs(x - len(p) / 2))
            done.append(p[:c].strip()); p = p[c:].strip()
        done.append(p)
    return done


def sections_of(block):
    secs, cur = [], []
    for l in block.split("\n"):
        l = l.strip().rstrip("*$").strip()
        if not l:
            if cur: secs.append(cur); cur = []
        else:
            cur.append(l)
    if cur: secs.append(cur)
    return secs


def build():
    text = pages_text()
    text = text.replace("\u00a0", " ").replace("\u2028", "\n")
    for a, b in FIXES.items():
        text = text.replace(a, b)
    lines = text.split("\n")
    keys = [s["key"] for s in SONGS]
    starts = []
    for k in keys:
        hits = [i for i, l in enumerate(lines) if l.strip() == k]
        if not hits:
            sys.exit(f"Couldn't find the title: {k}")
        starts.append(hits[0])
    # The list of titles after the last song marks its end.
    end_all = next((i for i in range(starts[-1] + 1, len(lines)) if lines[i].strip() == keys[0] or lines[i].startswith("uuuu")), len(lines))

    now = datetime.now(timezone.utc).isoformat()
    items = {}
    for n, info in enumerate(SONGS):
        s = starts[n]; e = starts[n + 1] if n + 1 < len(starts) else end_all
        block = "\n".join(lines[s + 1:e])
        secs = sections_of(block)
        key = info["key"]
        if key == "Home On The Range":  # verse and chorus on two lines, chorus starts "Chorus "
            secs = [[secs[0][0]], [secs[0][1].replace("Chorus ", "", 1)]]
        if key == "L O V E":
            secs = [[l for l in sec if l != "[Chorus]"] for sec in secs]

        # Break run-on lines, find "(CHORUS)" markers.
        out, wants = [], []
        for sec in secs:
            want = any("(CHORUS)" in l for l in sec)
            sec = [re.sub(r"\s*\(CHORUS\)\s*", " ", l).strip() for l in sec]
            out.append([p for l in sec if l for p in split_line(l)])
            wants.append(want)
        ch = info.get("chorus")
        if key in ("L O V E", "Home On The Range"):
            ch = 1
        final = []
        for i, sec in enumerate(out):
            final.append((["[Chorus]"] if i == ch else []) + sec)
            if wants[i] and ch is not None and i != ch:
                final.append(["[Chorus]"] + out[ch])
        lyrics = "\n\n".join("\n".join(sec) for sec in final)

        sid = "song-" + re.sub(r"[^a-z0-9]+", "-", (info.get("title") or key).lower().replace("’", "")).strip("-")
        items[sid] = {
            "type": "song",
            "title": info.get("title") or key,
            "artist": info["artist"],
            "year": info["year"],
            "cats": info["cats"],
            "seconds": info["seconds"],
            "facts": info["facts"],
            "listen": info["listen"],
            "ask": info["ask"],
            "lyrics": lyrics,
            "updatedAt": now,
        }
    items["settings"] = {"type": "settings", "categories": CATEGORIES, "updatedAt": now}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"app": "memory-lane", "format": 1, "items": items}, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(items) - 1} songs to {OUT}")


build()
