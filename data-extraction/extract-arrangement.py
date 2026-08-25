# extract-arrangement.py
#
# Offline tool (not shipped to the site) that derives two things from the
# Harmonix Set (Nieto et al., MIT licensed --
# https://github.com/urinieto/harmonixset): the per-genre section-
# transition/section-duration statistics in audio-viz/arrangement-data.js,
# and the per-genre BPM histograms in audio-viz/tempo-data.js. Both come
# from the same metadata.csv + genre mapping, so one script covers both
# rather than parsing the same file twice. See arrangement-data.js's
# header for the full rationale, genre mapping, and label-classification
# rules, and tempo-data.js's header for the BPM-specific methodology
# (octave correction, bucket width). Unlike the drum/melody/bass
# extraction scripts, there's no copyright nuance to mitigate here: this
# dataset is pure structural metadata (segment timestamps + labels like
# "chorus"/"verse" + song BPM), not audio or a transcription of one.
#
# This script's OUTPUT is already baked into arrangement-data.js and
# tempo-data.js -- you don't need to run this to use the project. Kept
# for reproducibility.
#
# -- Usage --
# 1. Download metadata.csv and the segments/ directory, in this folder:
#      curl -o metadata.csv https://raw.githubusercontent.com/urinieto/harmonixset/main/dataset/metadata.csv
#      curl -L -o repo.zip https://github.com/urinieto/harmonixset/archive/refs/heads/main.zip
#      unzip repo.zip   # -> harmonixset-main/dataset/segments/*.txt
# 2. python3 extract-arrangement.py
#    Prints per-cluster file-count diagnostics, writes
#    arrangement_result.json and bpm_result.json. Hand-transcribe/trim
#    the numbers from there into arrangement-data.js's ARRANGEMENT_DATA
#    and tempo-data.js's TEMPO_DATA -- same intentionally-manual
#    reasoning as the other extraction scripts: a human should
#    sanity-check sample sizes and drop noise-level branches before they
#    land in the shipped files. In this run, all 6 mapped clusters
#    cleared a comfortable margin (28-415 files each); jazz has zero
#    Harmonix songs and isn't in GENRE_TO_CLUSTER at all.
#
# -- Known limitations --
# - classify_label() is a substring keyword match over Harmonix's ~60
#   raw section labels, not a lookup against a fixed vocabulary --
#   reasonable coverage (verified against the full label-frequency list
#   across all 912 segment files) but will misclassify some rare/
#   idiosyncratic labels. Aggregating across hundreds of songs per genre
#   is what makes individual misclassifications wash out.
# - Duration is derived from each song's own annotated BPM assuming a
#   constant tempo across the whole song (true for the vast majority of
#   pop/rock/hiphop/electronic but an approximation for anything with a
#   tempo change) and a fixed 4/4 time signature -- filtered to songs
#   Harmonix itself tags as >=90% in 4/4 ("Ratio Bars in 4") to keep this
#   valid for this project's fixed-4/4 architecture.
# - Some of Harmonix's own annotated BPM values are themselves off by an
#   octave (a well-known failure mode of automated tempo estimation --
#   e.g. a handful of songs came back tagged 200+ BPM, almost certainly
#   double-counted eighth notes) -- corrected by halving/doubling into
#   this project's [60,140] range rather than trusting the raw value or
#   discarding it outright. See bpm_histogram()'s octave_correct().

import csv
import glob
import json
from collections import defaultdict, Counter

GENRE_TO_CLUSTER = {
    "Pop": "pop", "Pop-Rock": "pop",
    "Hip-Hop": "hiphop",
    "R&B": "rnb",
    "Funk/Disco": "funk",
    "Reggaeton": "reggaeton",
    "Dance/Electronic": "electronic",
    "Country": "folk",
    "Rock": "rock", "Classic Rock": "rock", "Grunge": "rock", "Punk": "rock",
    "Metal": "metal",
    "Alternative": "indie", "Indie Rock": "indie",
}
# R&B/Funk-Disco/Reggaeton/Metal used to feed hiphop/rock; split into
# their own clusters once genre-engine.js grew from 7 to 11. All 4
# clear the >=10-file trust bar used everywhere in this project, though
# funk (14) and reggaeton (15) are thin -- see arrangement-data.js's
# header for the full accounting.

STATES = ["SILENCE", "BASIC", "BUILDUP", "MAIN", "B_SECTION"]

BPM_MIN, BPM_MAX, BPM_BIN = 60, 140, 5  # this project's widened tempo safe zone; see tempo-data.js


def octave_correct(bpm, lo=BPM_MIN, hi=BPM_MAX):
    """Folds a raw BPM into [lo, hi] by halving/doubling -- corrects the
    octave errors automated tempo estimation is prone to (see file
    header) instead of clamping, which would bunch every fast/slow song
    at the boundary and erase the genre's real shape."""
    while bpm > hi:
        bpm /= 2
    while bpm < lo:
        bpm *= 2
    return bpm


def bpm_histogram(songs):
    """songs: {file_id: (cluster, bpm)}. Returns {cluster: {bucket: weight}},
    bucketed to the nearest BPM_BIN after octave correction."""
    hist = defaultdict(Counter)
    for cluster, bpm in songs.values():
        bucket = BPM_MIN + BPM_BIN * round((octave_correct(bpm) - BPM_MIN) / BPM_BIN)
        bucket = max(BPM_MIN, min(BPM_MAX, bucket))
        hist[cluster][bucket] += 1

    result = {}
    for cluster, counter in hist.items():
        total = sum(counter.values())
        # weightedChoice() normalizes by total at use time (see
        # tempo-data.js), so noise-level buckets are dropped outright
        # rather than kept and renormalized -- same reasoning as
        # arrangement-data.js's transitions/durations.
        result[cluster] = {str(k): round(v / total, 3) for k, v in sorted(counter.items()) if v / total >= 0.02}
    return result


def classify_label(label):
    """Maps one Harmonix section label onto our 5 arrangement states.
    Order matters: more specific substrings (prechorus/postchorus, which
    both contain "chorus") are checked before the generic ones they'd
    otherwise be swallowed by."""
    l = label.lower()
    if "silence" in l:
        return "SILENCE"
    if "prechorus" in l or "build" in l or "transition" in l:
        return "BUILDUP"
    if "chorus" in l or "hook" in l or "mainriff" in l or "drop" in l:
        return "MAIN"  # catches postchorus/altchorus/quietchorus/chorusinst/instchorus too -- still functionally chorus
    if "bridge" in l or "break" in l or "solo" in l or "inst" in l or "section" in l or "stutter" in l or "gtr" in l:
        return "B_SECTION"
    if "verse" in l or "intro" in l or "outro" in l:
        return "BASIC"
    if l == "end":
        return None  # terminal marker, not a real section
    return "BASIC"  # safe default for anything unrecognized


def main():
    songs = {}  # file -> (cluster, bpm)
    with open("metadata.csv") as f:
        for row in csv.DictReader(f):
            cluster = GENRE_TO_CLUSTER.get(row["Genre"])
            if not cluster:
                continue
            try:
                ratio4 = float(row["Ratio Bars in 4"])
                bpm = float(row["BPM"])
            except ValueError:
                continue
            if ratio4 < 90 or bpm <= 0:
                continue
            songs[row["File"]] = (cluster, bpm)

    transitions = defaultdict(lambda: defaultdict(Counter))  # cluster -> from_state -> Counter(to_state)
    durations = defaultdict(lambda: defaultdict(Counter))    # cluster -> state -> Counter(bar_length)
    files_used = Counter()

    for path in glob.glob("harmonixset-main/dataset/segments/*.txt"):
        file_id = path.split("/")[-1].replace(".txt", "")
        if file_id not in songs:
            continue
        cluster, bpm = songs[file_id]

        rows = []
        for line in open(path):
            parts = line.strip().split(" ", 1)
            if len(parts) != 2:
                continue
            t, label = float(parts[0]), parts[1]
            state = classify_label(label)
            rows.append((t, state))

        # build (state, duration_seconds) pairs from consecutive boundaries,
        # dropping the trailing "end" marker
        segments = []
        for i in range(len(rows) - 1):
            t, state = rows[i]
            t_next, _ = rows[i + 1]
            if state is None:
                continue
            segments.append((state, t_next - t))

        if len(segments) < 2:
            continue

        files_used[cluster] += 1
        for i, (state, dur_sec) in enumerate(segments):
            bars = round(dur_sec * bpm / 60 / 4)
            bars = max(4, min(32, round(bars / 4) * 4))  # round to nearest multiple of 4, clamp [4,32]
            durations[cluster][state][bars] += 1

            if i + 1 < len(segments):
                next_state = segments[i + 1][0]
                transitions[cluster][state][next_state] += 1

    print("=== files used per cluster ===")
    for c, n in files_used.items():
        print(f"{c}: {n}")

    result = {}
    for cluster in files_used:
        result[cluster] = {"transitions": {}, "durations": {}}
        for state in STATES:
            trans = transitions[cluster].get(state)
            if trans:
                total = sum(trans.values())
                result[cluster]["transitions"][state] = {k: round(v / total, 3) for k, v in trans.items()}
            dur = durations[cluster].get(state)
            if dur:
                total = sum(dur.values())
                result[cluster]["durations"][state] = {str(k): round(v / total, 3) for k, v in sorted(dur.items())}

    with open("arrangement_result.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\nwrote arrangement_result.json")

    bpm_result = bpm_histogram(songs)
    with open("bpm_result.json", "w") as f:
        json.dump(bpm_result, f, indent=2)
    print("wrote bpm_result.json")


if __name__ == "__main__":
    main()
