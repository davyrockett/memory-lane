"""Adds David's holiday songs (2026-11-18) to data.json, each with its chord chart.

The words are read from his chart PDFs in Resounding Joy/Elder Care/Charts/Holidays (never retyped):
red chord lines are dropped, and a bigger gap between lines on the chart starts a new section.
Each chart page becomes a 1600-px PNG in memory-lane-data/charts (tools/render-pdf.swift), with rows, trim
and one mark per section worked out from where the words sit on the page.

   python3 tools/add-holiday-songs.py      -> adds the songs that aren't in data.json yet (never overwrites)

Needs pypdf (pip3 install --user pypdf) and Pillow.
"""
import json, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

import pypdf
from PIL import Image

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parent.parent / "memory-lane-data"
DATA = DATA_DIR / "data.json"
SRC = Path.home() / "Dropbox/Local/Resounding Joy/Elder Care/Charts/Holidays"
GROUP = "Holidays"

SONGS = {
    "Blue Christmas": dict(
        id="song-blue-christmas", artist="Elvis Presley", year=1957, seconds=100, cats=[GROUP, "Elvis"],
        facts=["Elvis sang it on his first Christmas album, in 1957.",
               "Country singer Ernest Tubb had a hit with it first, in 1950.",
               "The high “oo-oo” behind Elvis was sung by Millie Kirkham."],
        listen=["Listen for the colors: blue, red, green and white.",
                "Listen for the snowflakes."],
        ask=["What colors were your Christmas decorations?",
             "Who do you most like to spend the holidays with?",
             "Did you ever have a white Christmas?"]),
    "Feliz Navidad": dict(
        id="song-feliz-navidad", artist="José Feliciano", year=1970, seconds=80, cats=[GROUP],
        facts=["José Feliciano wrote it in 1970, missing his family in Puerto Rico.",
               "“Feliz Navidad, próspero año y felicidad” means “Merry Christmas, a prosperous year and happiness.”",
               "Half of it is in Spanish and half in English, so everyone can sing along."],
        listen=["Listen for “Feliz Navidad”: it means “Merry Christmas.”",
                "Listen for “from the bottom of my heart.”"],
        ask=["Can you say Merry Christmas in another language?",
             "What special foods did your family make for the holidays?",
             "What would you wish everyone for the new year?"]),
    "Frosty": dict(
        id="song-frosty-the-snowman", title="Frosty the Snowman", artist="Gene Autry", year=1950, seconds=130,
        cats=[GROUP],
        facts=["Gene Autry, the singing cowboy, recorded it in 1950, a year after his hit with Rudolph.",
               "It was written to follow Rudolph’s success.",
               "The cartoon came out in 1969, with Jimmy Durante telling the story."],
        listen=["Listen for what Frosty’s eyes were made of.",
                "Listen for what brought Frosty to life."],
        ask=["Did you build snowmen when you were young?",
             "What did you use for the snowman’s face?",
             "What did you like to do on a snowy day?"]),
    "Here Comes Santa Claus": dict(
        id="song-here-comes-santa-claus", artist="Gene Autry", year=1947, seconds=130, cats=[GROUP],
        facts=["Gene Autry got the idea riding in a Hollywood Christmas parade, hearing children shout “Here comes Santa Claus!”",
               "He wrote it with Oakley Haldeman in 1947.",
               "That parade was called the Santa Claus Lane Parade."],
        listen=["Listen for the sleigh bells: jingle jangle!",
                "Listen for “Santa Claus Lane.”"],
        ask=["Did you ever go to a Christmas parade?",
             "Did you sit on Santa’s lap as a child?",
             "What did you leave out for Santa?"]),
    "Jingle Bell Rock": dict(
        id="song-jingle-bell-rock", artist="Bobby Helms", year=1957, seconds=110, cats=[GROUP],
        facts=["Bobby Helms recorded it in 1957.",
               "It was one of the first Christmas songs with a rock and roll beat.",
               "It comes back on the radio every December, more than 60 years later."],
        listen=["Listen for “jingle horse, pick up your feet.”",
                "Listen for “Jingle Bell Square.”"],
        ask=["Did you dance at Christmas parties?",
             "What music did you play during the holidays?",
             "Did you ever ride in a sleigh or a horse-drawn wagon?"]),
    "Jingle Bells": dict(
        id="song-jingle-bells", artist="James Lord Pierpont", year=1857, seconds=120, cats=[GROUP],
        chorus=["Oh! Jingle bells"],
        facts=["James Lord Pierpont wrote it in 1857. It was first called “One Horse Open Sleigh.”",
               "It never mentions Christmas! It’s a song about winter sleigh rides.",
               "In 1965 it was the first song played in space, on a little harmonica on the Gemini 6 spacecraft."],
        listen=["Listen for the one-horse open sleigh.",
                "Listen for “Oh, what fun!”"],
        ask=["Did you ever go sledding, or on a sleigh ride?",
             "What were winters like where you grew up?",
             "Did anyone in your family play music at Christmas?"]),
    "Let It Snow": dict(
        id="song-let-it-snow", title="Let It Snow! Let It Snow! Let It Snow!", artist="Vaughn Monroe", year=1945,
        seconds=110, cats=[GROUP],
        facts=["Sammy Cahn and Jule Styne wrote it in July 1945, during a heat wave in Hollywood.",
               "Vaughn Monroe’s record went to number one.",
               "It never mentions Christmas: it’s a song for the whole winter."],
        listen=["Listen for the popcorn.",
                "Listen for the fire."],
        ask=["What’s your favorite thing to do on a cold night?",
             "Did you have a fireplace at home?",
             "Do you like snow, or would you rather stay warm?"]),
    "Rudolph": dict(
        id="song-rudolph", title="Rudolph the Red-Nosed Reindeer", artist="Gene Autry", year=1949, seconds=120,
        cats=[GROUP],
        facts=["Rudolph started as a story booklet given away by the Montgomery Ward stores in 1939.",
               "The songwriter, Johnny Marks, was the brother-in-law of the man who made up Rudolph.",
               "The TV special with Burl Ives as the snowman came out in 1964."],
        listen=["Listen for all the reindeer names.",
                "Listen for the foggy Christmas Eve."],
        ask=["Can you name all of Santa’s reindeer?",
             "Did you ever feel left out, then find your place?",
             "Did you watch the Rudolph TV special?"]),
    "Santa Claus is Coming to Town": dict(
        id="song-santa-claus-is-coming-to-town", title="Santa Claus Is Coming to Town", artist="Eddie Cantor",
        year=1934, seconds=110, cats=[GROUP],
        facts=["Eddie Cantor first sang it on his radio show in 1934.",
               "The next day, there were orders for 100,000 copies of the sheet music.",
               "Lots of others have recorded it since, from Bing Crosby to the Jackson 5 and Bruce Springsteen."],
        listen=["Listen for who’s naughty and who’s nice.",
                "Listen for when Santa can see you."],
        ask=["Were you good all year as a child?",
             "What was the best present you ever got?",
             "Did you write letters to Santa?"]),
    "We Wish You a Merry Christmas": dict(
        id="song-we-wish-you-a-merry-christmas", artist="Traditional English carol", seconds=90, cats=[GROUP],
        facts=["It’s an old carol from the West Country of England.",
               "Carolers sang it going door to door, hoping for a treat.",
               "Figgy pudding is a steamed Christmas pudding made with figs or raisins."],
        listen=["Listen for the figgy pudding.",
                "Listen for “We won’t go until we get some!”"],
        ask=["Did you ever go caroling?",
             "What was your favorite Christmas dessert?",
             "Did your family have Christmas pudding or fruitcake?"]),
    "White Christmas": dict(
        id="song-white-christmas", artist="Bing Crosby", year=1942, seconds=100, cats=[GROUP],
        facts=["Irving Berlin wrote it, and Bing Crosby sang it in the 1942 movie Holiday Inn.",
               "Bing Crosby’s record is the best-selling single of all time.",
               "It meant a lot to soldiers far from home during World War II."],
        listen=["Listen for the treetops that glisten.",
                "Listen for the sleigh bells in the snow."],
        ask=["Where did you spend Christmas as a child?",
             "Did you see the movie White Christmas?",
             "Did you send Christmas cards?"]),
}

CHORD = re.compile(r"^[A-Ga-g][#b]?(m|maj|min|dim|aug|sus|add|M|\+)?(\d+|[#b]\d+)*(/[A-Ga-g][#b]?)?$")
LIG = {"ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬀ": "ff"}
SECTION_GAP = 28   # points between lines on the chart that start a new section (lines are ~18 apart)


def chart_lines(path):
    """Lines of the first page, top to bottom: {y (baseline, points from the top), fs, text, chord}."""
    page = pypdf.PdfReader(path).pages[0]
    H = float(page.mediabox.height)
    frags, spaces = [], []

    def v(text, cm, tm, fd, fs):
        f = (round(H - (tm[5] * cm[3] + cm[5]), 1), tm[4] * cm[0] + cm[4], text, fs * (tm[3] or 1) * (cm[3] or 1))
        if text.strip():
            frags.append(f)
        elif text in (" ",):
            spaces.append(f)   # the space before "ﬁelds" comes as its own piece
    page.extract_text(visitor_text=v)
    rows = []
    for y, x, t, fs in sorted(frags):
        if rows and abs(rows[-1]["y"] - y) < 3:
            rows[-1]["parts"].append((x, t)); rows[-1]["fs"] = max(rows[-1]["fs"], fs)
        else:
            rows.append({"y": y, "parts": [(x, t)], "fs": fs})
    for y, x, t, fs in spaces:
        for r in rows:
            if abs(r["y"] - y) < 3:
                r["parts"].append((x, t)); break
    for r in rows:
        # "snow", "ﬂ", "akes" arrive as three pieces: a ligature joins its neighbours without spaces.
        txt, glue = "", True
        for _, t in sorted(r["parts"], key=lambda p: p[0]):
            isl = t in LIG
            sp = not t.strip()
            txt += ("" if (isl or glue or sp) else " ") + t
            glue = isl or sp
        for k, s in LIG.items():
            txt = txt.replace(k, s)
        r["text"] = re.sub(r"\s+", " ", txt).strip()
        r["chord"] = all(CHORD.match(w) for w in r["text"].split())
    return [r for r in rows if r["text"]], H


def sections(path):
    rows, H = chart_lines(path)
    secs, cur, prev = [], [], None
    for r in rows:
        if prev is not None and r["y"] - prev > SECTION_GAP and cur:
            secs.append(cur); cur = []
        cur.append(r); prev = r["y"]
    if cur:
        secs.append(cur)
    out = []
    for s in secs:
        words = [r for r in s if not r["chord"]]
        if words:
            # Mark: from the top of the section's first line (chords included) to just under its last words.
            a = (s[0]["y"] - s[0]["fs"] * 0.95) / H
            b = (words[-1]["y"] + words[-1]["fs"] * 0.3) / H
            out.append({"lines": [r["text"] for r in words], "a": round(a, 4), "b": round(b, 4)})
    return out


def lum_small(img):
    W = 300
    Hs = round(img.height * W / img.width)
    g = img.convert("RGB").resize((W, Hs), Image.BILINEAR)
    px = g.load()
    lum = [[px[x, y][0] * 0.3 + px[x, y][1] * 0.59 + px[x, y][2] * 0.11 for x in range(W)] for y in range(Hs)]
    return lum, W, Hs


def find_trim(lum, W, H):
    """Same as findTrim() in chart.js."""
    dark = sum(map(sum, lum)) / (W * H) * 0.6
    cols, rows = [0] * W, [0] * H
    for y in range(H):
        for x in range(W):
            if lum[y][x] < dark:
                cols[x] += 1; rows[y] += 1
    if any(n > H * 0.5 for n in cols):
        return [0, 0, 1, 1]
    on = [i for i, n in enumerate(cols) if n >= 2]; onr = [i for i, n in enumerate(rows) if n >= 2]
    if not on or not onr:
        return [0, 0, 1, 1]
    x0, x1, y0, y1 = on[0], on[-1], onr[0], onr[-1]
    pad, r = 0.015, (lambda v: round(v * 10000) / 10000)
    l, rt = max(0, x0 / W - pad), min(1, (x1 + 1) / W + pad)
    if rt - l < 0.6:
        rt = min(1, l + 0.6); l = rt - 0.6
    return [r(l), r(max(0, y0 / H - pad)), r(rt), r(min(1, (y1 + 1) / H + pad))]


def find_rows(lum, W, H):
    """Same as findRows() in chart.js."""
    dark = sum(map(sum, lum)) / (W * H) * 0.6
    edge = [sum(1 for y in range(H) if lum[y][x] < dark) > H * 0.5 for x in range(W)]
    ink = [sum(1 for x in range(W) if not edge[x] and lum[y][x] < dark) >= 2 for y in range(H)]
    bands, start, gap = [], -1, max(2, round(H * 0.01))
    for y in range(H + 1):
        if y < H and ink[y]:
            if start < 0: start = y
            continue
        if start < 0: continue
        if bands and start - bands[-1][1] < gap: bands[-1][1] = y
        else: bands.append([start, y])
        start = -1
    return [[round(b[0] / H * 10000) / 10000, round(b[1] / H * 10000) / 10000] for b in bands if b[1] - b[0] > H * 0.004]


def main():
    d = json.loads(DATA.read_text())
    now = datetime.now(timezone.utc).isoformat()
    stamp = _b36(int(time.time() * 1000))   # like Date.now().toString(36) in chart.js: a new name per upload
    added = []
    for key, info in SONGS.items():
        pdf = SRC / f"{key} iPhone.pdf"
        sid = info["id"]
        if sid in d["items"] and not d["items"][sid].get("deleted"):
            print("already there:", key); continue
        secs = sections(pdf)
        blocks = []
        for s in secs:
            chorus = any(s["lines"][0].startswith(c) for c in info.get("chorus", []))
            blocks.append("\n".join((["[Chorus]"] if chorus else []) + s["lines"]))
        prefix = DATA_DIR / "charts" / f"{sid}-{stamp}"
        subprocess.run(["swift", str(HERE / "render-pdf.swift"), str(pdf), str(prefix)], check=True, capture_output=True)
        pages = []
        for k in range(1, 9):
            png = Path(f"{prefix}-{k}.png")
            if not png.exists(): break
            img = Image.open(png)
            lum, W, H = lum_small(img)
            pages.append({"src": f"charts/{png.name}", "w": img.width, "h": img.height,
                          "rows": find_rows(lum, W, H), "trim": find_trim(lum, W, H)})
        rec = {"type": "song", "title": info.get("title", key)}
        rec.update({k: v for k, v in info.items() if k not in ("id", "title", "chorus")})
        rec.update(lyrics="\n\n".join(blocks), updatedAt=now,
                   chart={"pages": pages, "marks": [{"a": s["a"], "b": s["b"]} for s in secs]})
        d["items"][sid] = rec
        added.append(rec["title"])
        print("added", rec["title"], [len(s["lines"]) for s in secs])
    settings = next(v for v in d["items"].values() if v.get("type") == "settings")
    if GROUP not in settings["categories"]:
        settings["categories"].append(GROUP); settings["updatedAt"] = now
    DATA.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")


def _b36(n):
    s = ""
    while n:
        n, r = divmod(n, 36); s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
    return s


if __name__ == "__main__":
    main()
