// tempo-data.js
//
// Real per-genre BPM histograms -- lets soundscape-engine.js pick a
// session's tempo from what the dominant genre's tempo actually looks
// like, instead of one narrow fixed range for every user. Same source,
// license, and reproducibility story as arrangement-data.js (Harmonix
// Set, MIT licensed, 912 songs' worth of metadata) -- see that file's
// header for the dataset/genre-mapping rationale in full; this file
// exists separately because tempo isn't a drum-arrangement concept,
// even though both are extracted by the same script (metadata.csv has
// both a Genre and a BPM column, so one pass over the CSV produces both
// data files -- see data-extraction/extract-arrangement.py).
//
// -- Widened range: 60-140 BPM ------------------------------------------
// The original scaffold fixed tempo to a narrow 100-110 "safe zone,"
// picked to keep the whole soundscape mid-tempo/upbeat for a recruiter
// audience regardless of genre. Widened to 60-140 (still nowhere near
// the full musical range, but wide enough for folk/jazz's real
// laid-back tempos and electronic/uptempo rock's real fast ones to
// actually read as different) once tempo became something this project
// could pull from real data rather than fake.
//
// -- Methodology --
// Per song: Harmonix's own annotated BPM, octave-corrected into [60,140]
// by halving/doubling (automated tempo estimation is prone to reporting
// exactly double or half the true tempo -- e.g. a few songs came back
// tagged past 200 BPM, almost certainly a doubled eighth-note read, not
// an genuinely-that-fast song), then bucketed to the nearest 5 BPM.
// Buckets accumulate into a per-cluster histogram; buckets under 2% of a
// cluster's total are dropped as noise (melodic-data.js's weightedChoice
// normalizes by total at use time, so this doesn't need renormalizing --
// same reasoning as arrangement-data.js).
//
// -- Coverage --
// Same 10 clusters as arrangement-data.js have real data; jazz/fallback
// don't (zero Harmonix jazz songs) and fall back to soundscape-engine.js's
// own hand-picked default -- see that file for what "no data" means for
// tempo specifically.
//
// This file's data is already baked in -- see
// data-extraction/extract-arrangement.py for the reproducible extraction
// script (not shipped to the site, kept for reproducibility only).
//
// Depends on: melodic-data.js (reuses its weightedChoice() helper)

(function (global) {
    "use strict";

    // cluster -> { "bpmBucket": weight, ... }
    const TEMPO_DATA = {
        electronic: {
            70: 0.023, 100: 0.023, 115: 0.039, 120: 0.093,
            125: 0.194, 130: 0.481, 135: 0.062, 140: 0.039,
        },
        hiphop: {
            70: 0.036, 75: 0.067, 80: 0.073, 85: 0.088, 90: 0.078, 95: 0.041,
            100: 0.109, 105: 0.073, 110: 0.073, 115: 0.036, 120: 0.041, 125: 0.114, 130: 0.13,
        },
        pop: {
            70: 0.048, 75: 0.06, 80: 0.055, 85: 0.065, 90: 0.06, 95: 0.06,
            100: 0.031, 105: 0.053, 110: 0.036, 115: 0.07, 120: 0.087, 125: 0.118, 130: 0.205, 140: 0.024,
        },
        rock: {
            70: 0.083, 75: 0.117, 80: 0.1, 85: 0.067, 90: 0.117, 95: 0.083,
            100: 0.1, 105: 0.033, 120: 0.1, 125: 0.05, 130: 0.033, 135: 0.033, 140: 0.033,
        },
        indie: {
            65: 0.036, 75: 0.036, 80: 0.143, 85: 0.071, 90: 0.071, 95: 0.179,
            105: 0.107, 115: 0.036, 125: 0.036, 130: 0.214, 135: 0.071,
        },
        folk: {
            65: 0.079, 70: 0.053, 75: 0.105, 80: 0.184, 85: 0.079, 90: 0.053,
            95: 0.105, 100: 0.026, 105: 0.053, 110: 0.105, 115: 0.079, 120: 0.026, 125: 0.026, 135: 0.026,
        },
        metal: {
            75: 0.136, 80: 0.091, 85: 0.091, 90: 0.091, 100: 0.136, 105: 0.091, 110: 0.045, 120: 0.227, 125: 0.045, 135: 0.045,
        },
        rnb: {
            80: 0.083, 85: 0.083, 90: 0.042, 100: 0.042, 105: 0.125, 110: 0.167, 115: 0.083, 120: 0.083, 125: 0.167, 130: 0.125,
        },
        funk: {
            105: 0.071, 110: 0.286, 115: 0.071, 120: 0.143, 125: 0.143, 130: 0.286,
        },
        reggaeton: {
            95: 0.133, 100: 0.333, 105: 0.133, 110: 0.067, 125: 0.333,
        },
    };

    const BUCKET_WIDTH = 5; // matches the extraction script's BPM_BIN -- see file header

    function hasData(cluster) {
        return Object.prototype.hasOwnProperty.call(TEMPO_DATA, cluster);
    }

    // Weighted-random BPM for `cluster`, plus a small +-jitter across the
    // bucket width so sessions don't only ever land on multiples of 5 --
    // real songs don't quantize that way, and this project's whole
    // Markov-walk/wander philosophy elsewhere avoids landing on the exact
    // same handful of values every time. Returns null (caller falls back
    // to its own default) if this cluster has no data.
    function pickBpm(cluster) {
        const dist = TEMPO_DATA[cluster];
        if (!dist) return null;
        const bucket = parseInt(global.MelodicData.weightedChoice(dist), 10);
        const jitter = (Math.random() * 2 - 1) * (BUCKET_WIDTH / 2);
        return Math.round(bucket + jitter);
    }

    global.TempoData = { hasData, pickBpm };
})(window);
