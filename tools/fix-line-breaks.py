"""One-time tidy of the line breaks in data.json (2026-10-17, David's request).

The first import broke long lines at the comma nearest the middle, which sometimes left lines starting
mid-phrase ("all I have to do is Dream…") or glued two lines together ("Blue moon, You saw me…").
This applies small, targeted fixes by matching a few words of a line, then capitalises any line that
starts in lower case. It never retypes a song: it only joins or splits existing lines.

   python3 tools/fix-line-breaks.py      (edits ../memory-lane-data/data.json in place)
"""
import json
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent.parent / "memory-lane-data" / "data.json"

# (song id, action, line fragment, extra)
#   join      : join the line containing `fragment` with the next line
#   joinexact : the same, but the whole line must equal `fragment`
#   split     : split the line containing `fragment` just before `extra`
OPS = [
    ("song-all-i-have-to-do-is-dream", "joinexact", "Whenever I want you,", None),
    ("song-all-i-have-to-do-is-dream", "split", "all I have to do is Dream", " Dream"),
    ("song-blue-moon", "split", "Blue moon, You saw", " You saw"),
    ("song-blue-moon", "split", "Blue moon, Now", " Now"),
    ("song-cant-help-falling-in-love", "split", "Shall I stay?", " Would"),
    ("song-cant-help-falling-in-love", "split", "Like a river flows,", " Surely"),
    ("song-cant-help-falling-in-love", "split", "Take my hand,", " Take my whole"),
    ("song-heartbreak-hotel", "joinexact", "Where I'll be,", None),
    ("song-heartbreak-hotel", "joinexact", "I’ll be so lonely,", None),
    ("song-heartbreak-hotel", "split", "Lonely Street at Heartbreak", " at Heartbreak"),
    ("song-heartbreak-hotel", "split", "Lonely Street To Heartbreak", " To Heartbreak"),
    ("song-here-comes-the-sun", "split", "doo-doo-doo Here", " Here comes"),
    ("song-here-comes-the-sun", "joinexact", "And I say,", None),
    ("song-hey-jude", "joinexact", "For, well,", None),
    ("song-hey-jude", "join", "a little colder (Na-na", None),
    ("song-hey-jude", "joinexact", "You have found her,", None),
    ("song-hey-jude", "split", "go and get her Remember", " Remember"),
    ("song-lean-on-me", "split", "For it won't be long,", " ’Til"),
    ("song-my-way", "joinexact", "My friend,", None),
    ("song-my-way", "joinexact", "Regrets,", None),
    ("song-my-way", "joinexact", "Yes, there were times,", None),
    ("song-over-the-rainbow", "split", "dare to dream really", " really"),
    ("song-over-the-rainbow", "split", "upon a star and wake", " and wake"),
    ("song-over-the-rainbow", "split", "lemon drops away", " away above"),
    ("song-perhaps-perhaps-perhaps", "join", "And please don't tell me", None),
    ("song-return-to-sender", "split", "take it myself and put", " and put"),
    ("song-return-to-sender", "split", "very next day then", " then I'll"),
    ("song-sittin-on-the-dock-of-the-bay", "split", "dock of the bay Wastin'", " Wastin'"),
    ("song-stand-by-me", "split", "you stand, Stand by me", " Stand by me"),
    ("song-stand-by-me", "split", "darlin’ Stand by me", " Stand by me"),
    ("song-thats-amore", "join", "and you'll sing,", None),
    ("song-the-bare-necessities", "split", "in the tree to make", " to make"),
    ("song-the-end-of-the-world", "joinexact", "I can't understand, no,", None),
    ("song-the-sound-of-silence", "joinexact", "\"Fools,\" said I,", None),
    ("song-the-sound-of-silence", "split", "in my brain still remains", " still remains"),
    ("song-the-sound-of-silence", "split", "neon light that split", " that split"),
    ("song-what-a-wonderful-world", "join", "shaking hands, saying,", None),
    ("song-ghost-riders-in-the-sky", "joinexact", "Yippie-yi-o,", None),
    ("song-ghost-riders-in-the-sky", "joinexact", "Then, cowboy,", None),
]


def cap(line):
    for i, ch in enumerate(line):
        if ch.isalpha():
            return line[:i] + ch.upper() + line[i + 1:] if ch.islower() else line
    return line


def apply(lines, action, frag, extra):
    out, i, hits = [], 0, 0
    while i < len(lines):
        l = lines[i]
        match = (l == frag) if action == "joinexact" else (frag in l)
        if match and action in ("join", "joinexact") and i + 1 < len(lines) and lines[i + 1] and lines[i + 1] != "[Chorus]":
            out.append(l + " " + lines[i + 1]); i += 2; hits += 1; continue
        if match and action == "split":
            k = l.find(extra, 1)
            if k > 0:
                out.append(l[:k].rstrip()); out.append(l[k:].strip()); i += 1; hits += 1; continue
        out.append(l); i += 1
    return out, hits


d = json.loads(DATA.read_text())
now = datetime.now(timezone.utc).isoformat()
changed = set()
for sid, action, frag, extra in OPS:
    r = d["items"][sid]
    lines, hits = apply(r["lyrics"].split("\n"), action, frag, extra)
    if not hits:
        print("NO MATCH:", sid, action, frag)
    r["lyrics"] = "\n".join(lines); changed.add(sid)
for sid, r in d["items"].items():
    if r.get("type") != "song":
        continue
    new = "\n".join(cap(l) for l in r["lyrics"].split("\n"))
    if new != r["lyrics"]:
        r["lyrics"] = new; changed.add(sid)
for sid in changed:
    d["items"][sid]["updatedAt"] = now
DATA.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
print(f"tidied {len(changed)} songs")
