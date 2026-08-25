# extract-melody-bass.py
#
# Offline tool (not shipped to the site) that derives the pop/hiphop/rock/
# jazz/electronic/folk melody and bass data in audio-viz/melodic-data.js
# from the Lakh MIDI Dataset (LMD), genre-labeled via the Tagtraum MSD
# genre annotations. See melodic-data.js's file header for the full
# rationale, methodology, and licensing discussion (LMD's individual
# files are fan transcriptions of commercial songs, not an original
# CC-released work the way Groove MIDI Dataset was -- the mitigation is
# that every number shipped is a statistical aggregate across hundreds of
# songs, never one song's actual riff).
#
# This script's OUTPUT is already baked into melodic-data.js -- you don't
# need to run this to use the project. Kept for reproducibility.
#
# -- Usage --
# 1. pip install mido
# 2. Download the MIDI archive (~1.4GB) and genre labels (~2.5MB), unzip
#    both next to this script:
#      curl -o lmd_matched.tar.gz http://hog.ee.columbia.edu/craffel/lmd/lmd_matched.tar.gz
#      tar xzf lmd_matched.tar.gz   # -> lmd_matched/<letter>/<letter>/<letter>/<MSD track ID>/<hash>.mid
#      curl -o msd_tagtraum_cd2.cls.zip https://www.tagtraum.com/genres/msd_tagtraum_cd2.cls.zip
#      unzip msd_tagtraum_cd2.cls.zip
#    (LMD's host has an expired/broken HTTPS cert as of writing -- use
#    plain http:// for that one, not a bug in this script.)
# 3. python3 extract-melody-bass.py
#    Prints per-cluster sample-size diagnostics, writes
#    melody_bass_result.json. Hand-transcribe/round the numbers from
#    there into melodic-data.js's CLUSTER_DATA -- intentionally manual,
#    same reasoning as the drums script: a human should sanity-check
#    sample sizes before they land in the shipped file. In this run,
#    every one of the 6 mapped clusters had 267-400 files after
#    deduplication, comfortably over the drums script's 10-file bar, so
#    all 6 made it in; electronic/indie/folk needed hand-authored
#    fallbacks for DRUMS (Groove MIDI Dataset's coverage), but here
#    electronic actually has strong data (real EDM/house exists as MIDI
#    transcriptions even though it's rarely performed live) -- only
#    indie has no equivalent tag in Tagtraum's taxonomy at all.
#
# -- Known limitations --
# - Melody-track identification is a heuristic (monophony + register +
#   activity score, see find_bass_and_melody() below) -- there's no fixed
#   GM program for "melody" the way there is for bass (32-39). It will
#   misfire on some fraction of files; aggregating across hundreds of
#   files per genre is what makes individual misfires wash out.
# - bucket_interval() approximates a chromatic semitone interval as a
#   scale-degree step by dividing by ~2 and rounding -- not real
#   per-file key detection, which we don't have. A reasonable
#   approximation, not a precise one.

import csv
import glob
import json
from collections import defaultdict, Counter

import mido

BASS_PROGRAMS = set(range(32, 40))  # GM: Acoustic/Electric/Fretless/Slap/Synth Bass
MIN_NOTES_FOR_A_VOICE = 30           # tracks sparser than this are too thin to be a meaningful bass/melody candidate
MIN_FILES_TO_TRUST_A_CLUSTER = 10    # same bar the drums script uses

STYLE_TO_CLUSTER = {
    "Rock": "rock", "Punk": "rock",
    "Metal": "metal",   # split into its own cluster once genre-engine.js grew to 11 clusters
    "Electronic": "electronic",
    "Pop": "pop",
    "Jazz": "jazz",
    "Rap": "hiphop",
    "RnB": "rnb",       # ditto -- split from what used to be a merged Rap+RnB "hiphop" bucket
    "Country": "folk", "Folk": "folk",
}
# NOTE: metal's sample needed widening beyond available_track_ids.txt's
# original pull (which only caught 13 Metal-tagged tracks, since at the
# time Metal was just feeding "rock" and wasn't specifically sought out)
# -- re-extracting every Metal-tagged track ID from lmd_matched.tar.gz
# directly brought it to 197 files. funk and reggaeton (added alongside
# metal/rnb) have no Tagtraum tag at all and aren't in this map -- their
# melody/bass stays hand-authored in instrument-archetypes.js.


def track_notes(track):
    """Returns [(abs_tick, note, velocity, duration_ticks), ...] from paired note_on/note_off events."""
    notes = []
    active = {}
    t = 0
    for msg in track:
        t += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            active[msg.note] = (t, msg.velocity)
        elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
            if msg.note in active:
                start, vel = active.pop(msg.note)
                notes.append((start, msg.note, vel, t - start))
    return notes


def track_info(track):
    program, channel = None, None
    for msg in track:
        if msg.type == "program_change" and program is None:
            program, channel = msg.program, msg.channel
    is_drum = any(getattr(msg, "channel", None) == 9 for msg in track if msg.type in ("note_on", "program_change"))
    return program, channel, is_drum


def monophony_ratio(notes):
    """Fraction of notes that do NOT overlap another note in the same track --
    melody tracks read as mostly one-note-at-a-time, chordal/pad tracks don't."""
    if not notes:
        return 0
    notes = sorted(notes, key=lambda n: n[0])
    overlaps = sum(
        1 for i in range(1, len(notes))
        if notes[i][0] < notes[i - 1][0] + notes[i - 1][3]
    )
    return 1 - (overlaps / len(notes))


def find_bass_and_melody(mid):
    """Returns (bass_notes, melody_notes), either possibly None if no
    qualifying track was found."""
    bass_notes, bass_note_count = None, 0
    melody_candidates = []  # (notes, avg_pitch, mono_ratio)

    for track in mid.tracks:
        program, channel, is_drum = track_info(track)
        if is_drum:
            continue
        notes = track_notes(track)
        if len(notes) < MIN_NOTES_FOR_A_VOICE:
            continue

        if program in BASS_PROGRAMS:
            if len(notes) > bass_note_count:
                bass_notes, bass_note_count = notes, len(notes)
            continue

        avg_pitch = sum(n[1] for n in notes) / len(notes)
        melody_candidates.append((notes, avg_pitch, monophony_ratio(notes)))

    melody_notes = None
    if melody_candidates:
        def score(c):
            notes, avg_pitch, mono = c
            return mono * 2 + (avg_pitch / 127) + min(1, len(notes) / 500)
        melody_notes, _, _ = max(melody_candidates, key=score)

    return bass_notes, melody_notes


def bucket_interval(semitones):
    """See file header 'Known limitations' -- approximates a chromatic
    interval as a signed scale-degree-ish step, capped at +-3."""
    if semitones == 0:
        return 0
    step = max(1, min(3, round(abs(semitones) / 2)))
    return step if semitones > 0 else -step


def extract_rhythm_and_markov(notes, ticks_per_beat):
    """notes: [(abs_tick, pitch, velocity, duration), ...]. Returns
    (hit_count[16], n_bars, markov_counts) -- markov_counts[prev_bucket] is
    a Counter of next_bucket occurrences."""
    ticks_per_16th = ticks_per_beat / 4
    ticks_per_bar = ticks_per_beat * 4

    hit_count = [0] * 16
    bars_seen = set()
    markov = defaultdict(Counter)

    prev_pitch, prev_bucket = None, 0
    for abs_tick, pitch, vel, dur in sorted(notes, key=lambda n: n[0]):
        bars_seen.add(int(abs_tick // ticks_per_bar))
        step = int(round((abs_tick % ticks_per_bar) / ticks_per_16th)) % 16
        hit_count[step] += 1

        if prev_pitch is not None:
            bucket = bucket_interval(pitch - prev_pitch)
            markov[prev_bucket][bucket] += 1
            prev_bucket = bucket
        prev_pitch = pitch

    return hit_count, len(bars_seen), markov


def normalize_markov(markov_counts):
    out = {}
    for prev, counter in markov_counts.items():
        total = sum(counter.values())
        out[str(prev)] = {str(k): round(v / total, 3) for k, v in counter.items()}
    return out


def main():
    available = set(l.strip() for l in open("available_track_ids.txt")) if _has("available_track_ids.txt") else None
    genre_map = {}
    with open("msd_tagtraum_cd2.cls") as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split("\t")
            if len(parts) < 2:
                continue
            if available is not None and parts[0] not in available:
                continue
            cluster = STYLE_TO_CLUSTER.get(parts[1])
            if cluster:
                genre_map[parts[0]] = cluster

    all_files = glob.glob("lmd_matched/**/*.mid", recursive=True)
    # one file per track ID, so a song with many fan transcriptions
    # doesn't get counted (and weighted) many times over
    seen, files = set(), []
    for path in sorted(all_files):
        tid = path.split("/")[-2]
        if tid in seen:
            continue
        seen.add(tid)
        files.append(path)
    print(f"{len(all_files)} files on disk, {len(files)} unique track IDs after dedup")

    bass_hits, bass_bars, bass_markov = defaultdict(lambda: [0] * 16), defaultdict(int), defaultdict(lambda: defaultdict(Counter))
    melody_hits, melody_bars, melody_markov = defaultdict(lambda: [0] * 16), defaultdict(int), defaultdict(lambda: defaultdict(Counter))
    files_used = defaultdict(int)
    parse_errors = 0

    for path in files:
        track_id = path.split("/")[-2]
        cluster = genre_map.get(track_id)
        if not cluster:
            continue
        try:
            mid = mido.MidiFile(path)
        except Exception:
            parse_errors += 1
            continue
        if mid.type == 2:  # type 2 = independent, non-simultaneous tracks -- not what we want
            continue

        bass_notes, melody_notes = find_bass_and_melody(mid)
        tpb = mid.ticks_per_beat

        if bass_notes:
            hits, bars, markov = extract_rhythm_and_markov(bass_notes, tpb)
            for i in range(16):
                bass_hits[cluster][i] += hits[i]
            bass_bars[cluster] += bars
            for prev, counter in markov.items():
                bass_markov[cluster][prev].update(counter)

        if melody_notes:
            hits, bars, markov = extract_rhythm_and_markov(melody_notes, tpb)
            for i in range(16):
                melody_hits[cluster][i] += hits[i]
            melody_bars[cluster] += bars
            for prev, counter in markov.items():
                melody_markov[cluster][prev].update(counter)

        files_used[cluster] += 1

    print(f"\n=== files used per cluster (parse errors: {parse_errors}) ===")
    for c, n in files_used.items():
        print(f"{c}: {n}")

    result = {}
    for cluster, n in files_used.items():
        if n < MIN_FILES_TO_TRUST_A_CLUSTER:
            continue
        bars_b, bars_m = max(1, bass_bars[cluster]), max(1, melody_bars[cluster])
        result[cluster] = {
            "files_used": n,
            "bass": {
                "rhythm": [round(min(1.0, bass_hits[cluster][i] / bars_b), 2) for i in range(16)],
                "markov": normalize_markov(bass_markov[cluster]),
                "n_bars": bars_b,
            },
            "melody": {
                "rhythm": [round(min(1.0, melody_hits[cluster][i] / bars_m), 2) for i in range(16)],
                "markov": normalize_markov(melody_markov[cluster]),
                "n_bars": bars_m,
            },
        }

    with open("melody_bass_result.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\nwrote melody_bass_result.json")


def _has(path):
    import os
    return os.path.exists(path)


if __name__ == "__main__":
    main()
