# extract-groove-patterns.py
#
# Offline tool (not shipped to the site) that derives the pop/hiphop/rock/
# jazz drum seed patterns in audio-viz/drum-patterns.js from Google
# Magenta's Groove MIDI Dataset (GMD) -- real, genre-tagged drummer
# performances, licensed CC BY 4.0. See drum-patterns.js's file header for
# the full rationale (why real drummer data instead of hand-guessing, and
# why MIDI instead of downloaded audio -- the audio would be copyrighted
# commercial recordings, MIDI performances released for exactly this use
# aren't).
#
# This script's OUTPUT is already baked into drum-patterns.js -- you don't
# need to run this to use the project. It's kept for reproducibility and
# as a starting point if the thresholds/mapping below get revisited.
#
# -- Usage --
# 1. pip install mido
# 2. Download the MIDI-only dataset (~3MB, no audio) and unzip next to
#    this script:
#      curl -o groove.zip https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip
#      unzip groove.zip   # produces a `groove/` folder with info.csv + MIDI files
# 3. python3 extract-groove-patterns.py
#    Prints per-cluster sample-size diagnostics to stdout, writes the
#    aggregated patterns to result.json. Hand-transcribe/round the numbers
#    from there into drum-patterns.js's SEED_PATTERNS (this step is
#    intentionally manual -- a human should look at the sample sizes and
#    sanity-check the output before it lands in the shipped file, which is
#    exactly what happened: electronic (7 files) and folk/country (2
#    files) were judged too thin and excluded, see FILE_COUNT_THRESHOLD).
#
# -- Known limitation --
# estimate_swing() below does NOT reliably detect real swing timing --
# GMD's note-on ticks didn't show a clean-enough systematic offset on the
# off-beat 16ths with this simple averaging approach, and it returned ~0
# for every cluster including jazz (which we know has real swing). The
# swing values actually shipped in drum-patterns.js were set by hand
# using genre convention instead (jazz ~0.25-0.3, hip-hop/funk ~0.15,
# pop/rock 0), not derived from this function. Left in as a starting
# point for a better approach (e.g. isolating hi-hat/ride-only onsets
# specifically) rather than deleted, but don't trust its current output.

import csv
import json
import statistics
from collections import defaultdict

import mido

BASE = "groove/"
FILE_COUNT_THRESHOLD = 10   # minimum distinct performances to trust a cluster
BAR_COUNT_THRESHOLD = 15    # minimum total bars to trust a cluster
HIT_PROBABILITY_THRESHOLD = 0.22  # a step must appear in this fraction of bars to count as a real hit

# Map GMD's drummer-provided style tags to our genre clusters (11, not
# the original 7 -- see genre-engine.js). Multiple GMD styles can still
# feed one cluster (e.g. gospel informs "hiphop"'s groove-heavy feel
# alongside its own tag). Styles with no reasonable home (latin,
# afrocuban, afrobeat, highlife, reggae, middleeastern) are left out
# entirely rather than force-fit.
STYLE_TO_CLUSTER = {
    "rock": "rock", "punk": "rock",
    "jazz": "jazz", "neworleans": "jazz",
    "hiphop": "hiphop", "gospel": "hiphop",
    "funk": "funk",   # split into its own cluster once genre-engine.js grew to 11 clusters
    "soul": "rnb",    # ditto -- soul reads closer to rnb's groove than hiphop's
    "pop": "pop",
    "country": "folk",       # ended up excluded (only 2 files) -- see FILE_COUNT_THRESHOLD
    "dance": "electronic",   # ended up excluded (only 7 files) -- see FILE_COUNT_THRESHOLD
}

# General MIDI drum map -> our 7 voices (see audio-viz/drum-layer.js).
# Unmapped notes (ride/crash/cowbell/tambourine/etc.) fall through to
# "perc" -- which is how jazz's ride-cymbal pattern, the genre's actual
# rhythmic signature, ends up captured at all.
NOTE_TO_VOICE = {
    35: "kick", 36: "kick",
    38: "snare", 40: "snare",
    42: "hihatClosed", 44: "hihatClosed",
    46: "hihatOpen",
    41: "tomLow", 43: "tomLow", 45: "tomLow",
    47: "tomHigh", 48: "tomHigh", 50: "tomHigh",
}
VOICES = ["kick", "snare", "hihatClosed", "hihatOpen", "tomLow", "tomHigh", "perc"]


def voice_for_note(note):
    return NOTE_TO_VOICE.get(note, "perc")


def extract_bars(path):
    """Returns (bars, offsets): bars is {bar_index: {voice: [(step, velocity), ...]}},
    offsets is a flat list of raw-step fractional offsets (for swing estimation)."""
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    ticks_per_bar = tpb * 4       # assumes 4/4, already filtered by caller
    ticks_per_16th = tpb / 4

    events = []  # (abs_tick, note, velocity)
    for track in mid.tracks:
        t = 0
        for msg in track:
            t += msg.time
            if msg.type == "note_on" and msg.velocity > 0:
                events.append((t, msg.note, msg.velocity))

    bars = defaultdict(lambda: defaultdict(list))
    offsets = []
    for abs_tick, note, vel in events:
        bar_idx = int(abs_tick // ticks_per_bar)
        tick_in_bar = abs_tick % ticks_per_bar
        raw_step = tick_in_bar / ticks_per_16th
        step = int(round(raw_step)) % 16
        offsets.append(raw_step - round(raw_step))
        bars[bar_idx][voice_for_note(note)].append((step, vel))
    return bars, offsets


def density_of(bar):
    return sum(len(v) for v in bar.values())


def aggregate(bars):
    """bars: list of {voice: [(step, vel), ...]}. Returns per-voice 16-step
    velocity arrays (0 = rest), using hit-probability across all bars
    thresholded at HIT_PROBABILITY_THRESHOLD, velocity = mean when hit."""
    n = len(bars)
    result = {}
    for voice in VOICES:
        hit_count = [0] * 16
        vel_sum = [0.0] * 16
        for bar in bars:
            seen_steps = set()
            for step, vel in bar.get(voice, []):
                if step in seen_steps:  # a step only counts once per bar
                    continue
                seen_steps.add(step)
                hit_count[step] += 1
                vel_sum[step] += vel
        grid = []
        for i in range(16):
            prob = hit_count[i] / n if n else 0
            if prob >= HIT_PROBABILITY_THRESHOLD:
                mean_vel = vel_sum[i] / hit_count[i]
                grid.append(round(min(1.0, mean_vel / 100), 2))
            else:
                grid.append(0)
        result[voice] = grid
    return result


def estimate_swing(offsets):
    # See "Known limitation" in the file header -- this doesn't currently
    # produce trustworthy results.
    if not offsets:
        return 0
    mean_offset = statistics.mean(offsets)
    return round(max(0, min(0.35, mean_offset * 1.4)), 2)


def build_output(cluster_bars, cluster_offsets, file_counts):
    out = {}
    for cluster, bars in cluster_bars.items():
        # gate on FILE count (distinct performances/drummers), not just bar
        # count -- a few long performances can produce plenty of bars while
        # still only reflecting 1-2 individual drummers' idiosyncrasies,
        # not a genre-general tendency
        if file_counts.get(cluster, 0) < FILE_COUNT_THRESHOLD or len(bars) < BAR_COUNT_THRESHOLD:
            continue
        densities = sorted(density_of(b) for b in bars)
        median = densities[len(densities) // 2]
        low_bars = [b for b in bars if density_of(b) <= median]
        high_bars = [b for b in bars if density_of(b) > median]
        out[cluster] = {
            "n_bars": len(bars),
            "low": aggregate(low_bars) if len(low_bars) >= 8 else None,
            "high": aggregate(high_bars) if len(high_bars) >= 8 else None,
            "swing": estimate_swing(cluster_offsets[cluster]),
        }
    return out


def main():
    by_cluster = defaultdict(list)
    with open(BASE + "info.csv") as f:
        for row in csv.DictReader(f):
            style = row["style"].split("/")[0]
            cluster = STYLE_TO_CLUSTER.get(style)
            if not cluster or row["beat_type"] != "beat" or row["time_signature"] != "4-4":
                continue
            by_cluster[cluster].append(row)

    print("=== sample counts (qualifying files) ===")
    for c, rs in by_cluster.items():
        print(f"{c}: {len(rs)} files")

    cluster_bars = defaultdict(list)
    cluster_offsets = defaultdict(list)
    for cluster, rows in by_cluster.items():
        for row in rows:
            try:
                bars, offsets = extract_bars(BASE + row["midi_filename"])
            except Exception:
                continue
            cluster_offsets[cluster].extend(offsets)
            for voices in bars.values():
                total_hits = sum(len(v) for v in voices.values())
                if 2 <= total_hits <= 40:  # drop empty/garbage bars
                    cluster_bars[cluster].append(voices)

    print("\n=== bar counts after quality filter ===")
    for c, bars in cluster_bars.items():
        print(f"{c}: {len(bars)} bars")

    file_counts = {c: len(rs) for c, rs in by_cluster.items()}
    result = build_output(cluster_bars, cluster_offsets, file_counts)
    with open("result.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\n=== wrote result.json ===")


if __name__ == "__main__":
    main()
