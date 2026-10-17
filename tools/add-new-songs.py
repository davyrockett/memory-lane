"""Adds David's new songs (2026-10-17) to data.json.

- Home on the Range (1870s) and La Bamba (traditional Mexican folk song) are typed here.
- Hound Dog, In the Still of the Night and Edelweiss are still under copyright, so their words are read
  from the text file David pasted them into ("New Songs.txt" in Resounding Joy/Elder Care), never retyped.

   python3 tools/add-new-songs.py           -> adds whatever it can; says which songs are still waiting
"""
import json, re
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent.parent / "memory-lane-data" / "data.json"
PASTED = Path.home() / "Dropbox/Local/Resounding Joy/Elder Care/New Songs.txt"

HOME_ON_THE_RANGE = """Oh, give me a home where the buffalo roam,
Where the deer and the antelope play,
Where seldom is heard a discouraging word
And the skies are not cloudy all day.

[Chorus]
Home, home on the range,
Where the deer and the antelope play;
Where seldom is heard a discouraging word
And the skies are not cloudy all day."""

LA_BAMBA = """Para bailar La Bamba
Para bailar La Bamba
Se necesita una poca de gracia
Una poca de gracia
Para mí, para ti
Y arriba, y arriba
Y arriba, y arriba
Por ti seré, por ti seré, por ti seré

Yo no soy marinero
Yo no soy marinero, soy capitán
Soy capitán, soy capitán
Bamba, bamba
Bamba, bamba
Bamba, bamba, bam"""

NEW = {
    "song-hound-dog": dict(
        title="Hound Dog", artist="Elvis Presley", year=1956, seconds=110,
        cats=["Elvis", "Feel-Good", "Sing-Along Favorites"],
        facts=["Big Mama Thornton recorded it first, in 1953, three years before Elvis.",
               "It was written by two 19-year-olds, Jerry Leiber and Mike Stoller.",
               "Elvis once sang it on TV to a real basset hound wearing a little top hat."],
        listen=["Listen for the rabbit. Did the hound dog ever catch one?",
                "Listen for “cryin’ all the time.”"],
        ask=["Did you ever have a dog? What was its name?",
             "Do you remember seeing Elvis on TV?",
             "What dances did you do to rock and roll?"]),
    "song-la-bamba": dict(
        title="La Bamba", artist="Ritchie Valens", year=1958, seconds=110,
        cats=["Feel-Good", "Sing-Along Favorites"], lyrics=LA_BAMBA,
        facts=["It’s a traditional folk song from Veracruz, Mexico, long played at weddings.",
               "Ritchie Valens was only 17 when he recorded it. He didn’t speak much Spanish and learned the words by sound.",
               "A 1987 movie about his life brought it back, and the band Los Lobos took it to number one."],
        listen=["Listen for “arriba!” It means “up!”",
                "Listen for “Yo no soy marinero”: “I’m not a sailor, I’m a captain!”"],
        ask=["Do you know any songs in Spanish, or in another language?",
             "Did you ever dance at a wedding? What song was playing?",
             "Have you ever been to Mexico?"]),
    "song-in-the-still-of-the-night": dict(
        title="In the Still of the Night", artist="The Five Satins", year=1956, seconds=130,
        cats=["Love Songs", "Gentle"],
        facts=["Fred Parris wrote it while on night guard duty in the Army.",
               "It was recorded in the basement of a church in New Haven, Connecticut.",
               "It’s one of the best-loved doo-wop love songs of all time."],
        listen=["Listen for the month. When did this happen?",
                "Listen for the stars."],
        ask=["Do you remember a special night, or a special date?",
             "Did you ever slow dance to a song like this?",
             "What do you like to see in the night sky?"]),
    "song-edelweiss": dict(
        title="Edelweiss", artist="The Sound of Music", year=1959, seconds=110,
        cats=["Movies & Shows", "Gentle", "Old Favorites"],
        facts=["It was the last song Rodgers and Hammerstein wrote together.",
               "Many people think it’s an old Austrian folk song, but it was written for the musical.",
               "Edelweiss is a real small white flower that grows high in the Alps."],
        listen=["Listen for the colors: small and white, clean and bright.",
                "Listen for the word “forever.”"],
        ask=["Did you have a favorite flower, or a garden?",
             "Where did your family come from?",
             "Did you see The Sound of Music?"]),
}


def pasted_songs():
    """Splits David's pasted text into songs by title and verses by blank lines."""
    if not PASTED.exists():
        return {}
    text = PASTED.read_text().replace("\r", "")
    titles = {NEW[k]["title"].lower(): k for k in NEW}
    found, cur, buf = {}, None, []
    for line in text.split("\n"):
        key = titles.get(line.strip().lower())
        if key or line.strip().lower() in ("home on the range", "lyrics"):
            if cur: found[cur] = buf
            cur, buf = key, []
            continue
        if cur: buf.append(line.strip())
    if cur: found[cur] = buf
    out = {}
    for k, lines in found.items():
        verses, v = [], []
        for l in lines + [""]:
            if l: v.append(l)
            elif v: verses.append(v); v = []
        # A long verse with no blank lines (Hound Dog, Edelweiss) is two verses: split it in half.
        tidy = []
        for v in verses:
            if len(v) > 8:
                h = (len(v) + 1) // 2
                tidy += [v[:h], v[h:]]
            else:
                tidy.append(v)
        out[k] = "\n\n".join("\n".join(v) for v in tidy)
    return out


d = json.loads(DATA.read_text())
now = datetime.now(timezone.utc).isoformat()
home = d["items"]["song-home-on-the-range"]
if home["lyrics"] != HOME_ON_THE_RANGE:
    home["lyrics"] = HOME_ON_THE_RANGE; home["updatedAt"] = now; print("fixed Home on the Range")
pasted = pasted_songs()
waiting = []
for sid, info in NEW.items():
    lyrics = info.get("lyrics") or pasted.get(sid)
    if not lyrics:
        waiting.append(info["title"]); continue
    rec = {k: v for k, v in info.items() if k != "lyrics"}
    rec.update(type="song", lyrics=lyrics, updatedAt=now)
    old = d["items"].get(sid)
    if old and old.get("lyrics") == lyrics:
        continue
    d["items"][sid] = rec
    print("added", info["title"])
DATA.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
if waiting:
    print("still waiting for the words to:", ", ".join(waiting))
