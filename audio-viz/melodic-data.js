// melodic-data.js
//
// Per-genre RHYTHM and MELODIC-MOTION data for melody and bass, derived
// from real songs -- same philosophy and same discipline as
// drum-patterns.js's Groove MIDI Dataset work, extended to the two
// voices GMD couldn't help with (it's drums-only).
//
// -- Source & license --------------------------------------------------
// Derived from the Lakh MIDI Dataset (LMD) "matched" subset -- ~45k
// community-transcribed MIDI files linked to Million Song Dataset (MSD)
// track IDs (http://colinraffel.com/projects/lmd/, compilation licensed
// CC BY 4.0), genre-labeled via the Tagtraum MSD genre annotations
// (https://www.tagtraum.com/msd_genre_datasets.html). Unlike Groove MIDI
// Dataset, LMD's individual files are fan transcriptions of existing
// commercial recordings, not an original work released for open use --
// see project notes for the fuller legal discussion. The mitigation is
// the same discipline used for drums: nothing here reproduces any single
// song's actual melody or bassline. Every number below is a STATISTICAL
// AGGREGATE across ~270-400 different songs per genre (rhythm:
// hit-probability per 16th-note step; motion: a Markov transition table
// over interval "buckets," see below) -- a genuinely different, much
// smaller-footprint kind of information than any one recognizable riff.
//
// -- Why MIDI, not downloaded audio -----------------------------------
// Same reasoning as drums: shipping actual copyrighted recordings (even
// unplayed, even just for internal analysis) is redistributing
// unlicensed audio. MIDI note/timing data, sourced from a compilation
// under an open license, aggregated into statistics before it ever
// reaches this file, is a fundamentally different and much safer thing
// to build a public repo around.
//
// -- Methodology --------------------------------------------------------
// For each cluster, LMD files matched to a Tagtraum-labeled MSD track ID
// (Rock/Punk -> rock, Metal -> metal, Electronic -> electronic,
// Pop -> pop, Jazz -> jazz, Rap -> hiphop, RnB -> rnb, Country/Folk ->
// folk; one MIDI file per track ID, to avoid a song with many fan
// transcriptions being counted many times) were scanned for:
//   - a BASS track: General MIDI program 32-39 (the GM bass range),
//     whichever such track has the most notes
//   - a MELODY track: excluding the drum channel and bass-range tracks,
//     whichever remaining track scores highest on (monophony + register +
//     activity) -- melody tracks tend to be mostly one-note-at-a-time,
//     sit higher than pads/bass, and stay continuously active. This is a
//     heuristic (there's no fixed GM program for "melody" the way there
//     is for bass), not a certainty -- it'll misfire on some fraction of
//     files, which is exactly why aggregating across hundreds of files
//     per genre matters: individual misfires wash out in the average.
//
// Per matched track: note onsets quantized to a 16-step grid -> per-step
// hit-probability across all bars -> `rhythm`. Consecutive note pitch
// intervals bucketed into a signed "scale-degree-ish step" (-3..3) via
// `bucket(semitones) = sign * clamp(round(|semitones|/2), 1, 3)` -- an
// approximation, not real key detection (we don't have a key label per
// file), trading precision for not needing per-file key analysis. Bucket
// sequences become a first-order MARKOV TRANSITION TABLE per genre:
// `markov[prevBucket][nextBucket]` = probability of the next interval
// given the previous one. See music-theory.js's degreeToNote() and
// synth-layer.js / bass-layer.js for how this actually generates notes
// at runtime: a live random walk through the table, not a fixed lick --
// every layer's melody is genuinely generated, never repeats verbatim,
// and stays statistically genre-shaped for as long as it plays.
//
// electronic/indie/folk had the thinnest Groove MIDI coverage for DRUMS;
// here electronic is actually one of the stronger clusters (real
// EDM/house tracks exist as MIDI transcriptions even though they're
// rarely performed live) -- indie has no equivalent in the Tagtraum
// taxonomy either, so indie and fallback still fall through to
// instrument-archetypes.js's hand-authored degreePatternSeed/rhythmGrid,
// same as they do for drums. funk and reggaeton (added later, alongside
// metal/rnb -- see genre-engine.js for the fuller 7->11 cluster story)
// have no Tagtraum tag at all and fall through the same way; metal and
// rnb DO have real Tagtraum tags (197 and 323 files respectively, after
// widening the sampled LMD subset specifically to get metal a real
// count -- the original sample happened to only catch 13) and are
// included below like every other real-data cluster.
//
// Depends on: nothing (pure data + the weightedChoice/markov-walk helpers)

(function (global) {
    "use strict";

    const CLUSTER_DATA = {
    pop: {
        melody: {
            rhythm: [0.81, 0.16, 0.51, 0.24, 0.61, 0.17, 0.57, 0.25, 0.62, 0.17, 0.51, 0.22, 0.62, 0.19, 0.55, 0.23],
            markov: {
            "-3": { "-3": 0.064, "-2": 0.049, "-1": 0.02, "0": 0.092, "1": 0.048, "2": 0.195, "3": 0.533 },
            "-2": { "-3": 0.071, "-2": 0.123, "-1": 0.104, "0": 0.143, "1": 0.079, "2": 0.342, "3": 0.139 },
            "-1": { "-3": 0.031, "-2": 0.105, "-1": 0.301, "0": 0.169, "1": 0.231, "2": 0.096, "3": 0.067 },
            "0": { "-3": 0.032, "-2": 0.079, "-1": 0.105, "0": 0.569, "1": 0.1, "2": 0.081, "3": 0.035 },
            "1": { "-3": 0.067, "-2": 0.13, "-1": 0.297, "0": 0.168, "1": 0.222, "2": 0.099, "3": 0.016 },
            "2": { "-3": 0.109, "-2": 0.365, "-1": 0.103, "0": 0.157, "1": 0.089, "2": 0.141, "3": 0.036 },
            "3": { "-3": 0.382, "-2": 0.2, "-1": 0.101, "0": 0.106, "1": 0.033, "2": 0.11, "3": 0.068 },
        },
        },
        bass: {
            rhythm: [0.88, 0.04, 0.32, 0.11, 0.43, 0.05, 0.51, 0.15, 0.69, 0.05, 0.39, 0.1, 0.5, 0.09, 0.47, 0.15],
            markov: {
            "-3": { "-3": 0.007, "-2": 0.018, "-1": 0.016, "0": 0.267, "1": 0.058, "2": 0.057, "3": 0.578 },
            "-2": { "-3": 0.041, "-2": 0.043, "-1": 0.097, "0": 0.281, "1": 0.147, "2": 0.319, "3": 0.073 },
            "-1": { "-3": 0.077, "-2": 0.113, "-1": 0.235, "0": 0.298, "1": 0.165, "2": 0.072, "3": 0.04 },
            "0": { "-3": 0.044, "-2": 0.081, "-1": 0.057, "0": 0.623, "1": 0.073, "2": 0.064, "3": 0.058 },
            "1": { "-3": 0.075, "-2": 0.082, "-1": 0.088, "0": 0.353, "1": 0.248, "2": 0.13, "3": 0.023 },
            "2": { "-3": 0.098, "-2": 0.256, "-1": 0.071, "0": 0.35, "1": 0.131, "2": 0.074, "3": 0.02 },
            "3": { "-3": 0.62, "-2": 0.05, "-1": 0.077, "0": 0.185, "1": 0.032, "2": 0.031, "3": 0.005 },
        },
        },
    },
    hiphop: {
        melody: {
            rhythm: [0.9, 0.22, 0.54, 0.29, 0.67, 0.22, 0.63, 0.33, 0.74, 0.25, 0.55, 0.29, 0.67, 0.22, 0.61, 0.27],
            markov: {
            "-3": { "-3": 0.042, "-2": 0.022, "-1": 0.029, "0": 0.132, "1": 0.05, "2": 0.316, "3": 0.409 },
            "-2": { "-3": 0.048, "-2": 0.166, "-1": 0.109, "0": 0.122, "1": 0.098, "2": 0.303, "3": 0.153 },
            "-1": { "-3": 0.027, "-2": 0.123, "-1": 0.219, "0": 0.159, "1": 0.254, "2": 0.177, "3": 0.04 },
            "0": { "-3": 0.048, "-2": 0.085, "-1": 0.1, "0": 0.558, "1": 0.077, "2": 0.078, "3": 0.054 },
            "1": { "-3": 0.054, "-2": 0.123, "-1": 0.294, "0": 0.18, "1": 0.214, "2": 0.116, "3": 0.02 },
            "2": { "-3": 0.199, "-2": 0.209, "-1": 0.157, "0": 0.128, "1": 0.098, "2": 0.191, "3": 0.018 },
            "3": { "-3": 0.323, "-2": 0.25, "-1": 0.098, "0": 0.132, "1": 0.059, "2": 0.085, "3": 0.053 },
        },
        },
        bass: {
            rhythm: [0.85, 0.06, 0.3, 0.14, 0.39, 0.08, 0.49, 0.22, 0.59, 0.11, 0.37, 0.14, 0.5, 0.12, 0.51, 0.17],
            markov: {
            "-3": { "-3": 0.014, "-2": 0.017, "-1": 0.038, "0": 0.237, "1": 0.072, "2": 0.155, "3": 0.467 },
            "-2": { "-3": 0.062, "-2": 0.068, "-1": 0.102, "0": 0.224, "1": 0.108, "2": 0.378, "3": 0.057 },
            "-1": { "-3": 0.038, "-2": 0.133, "-1": 0.247, "0": 0.249, "1": 0.189, "2": 0.082, "3": 0.061 },
            "0": { "-3": 0.077, "-2": 0.11, "-1": 0.087, "0": 0.477, "1": 0.079, "2": 0.101, "3": 0.069 },
            "1": { "-3": 0.1, "-2": 0.059, "-1": 0.129, "0": 0.288, "1": 0.272, "2": 0.103, "3": 0.048 },
            "2": { "-3": 0.121, "-2": 0.181, "-1": 0.101, "0": 0.254, "1": 0.191, "2": 0.125, "3": 0.026 },
            "3": { "-3": 0.538, "-2": 0.076, "-1": 0.049, "0": 0.242, "1": 0.028, "2": 0.052, "3": 0.015 },
        },
        },
    },
    rock: {
        melody: {
            rhythm: [0.9, 0.15, 0.5, 0.21, 0.73, 0.16, 0.62, 0.22, 0.72, 0.17, 0.55, 0.22, 0.73, 0.18, 0.6, 0.2],
            markov: {
            "-3": { "-3": 0.045, "-2": 0.045, "-1": 0.019, "0": 0.141, "1": 0.057, "2": 0.174, "3": 0.519 },
            "-2": { "-3": 0.135, "-2": 0.183, "-1": 0.064, "0": 0.127, "1": 0.066, "2": 0.237, "3": 0.188 },
            "-1": { "-3": 0.049, "-2": 0.145, "-1": 0.295, "0": 0.164, "1": 0.22, "2": 0.076, "3": 0.051 },
            "0": { "-3": 0.049, "-2": 0.068, "-1": 0.092, "0": 0.556, "1": 0.072, "2": 0.083, "3": 0.08 },
            "1": { "-3": 0.073, "-2": 0.124, "-1": 0.26, "0": 0.172, "1": 0.213, "2": 0.114, "3": 0.044 },
            "2": { "-3": 0.211, "-2": 0.244, "-1": 0.078, "0": 0.133, "1": 0.074, "2": 0.21, "3": 0.05 },
            "3": { "-3": 0.413, "-2": 0.251, "-1": 0.066, "0": 0.097, "1": 0.033, "2": 0.096, "3": 0.044 },
        },
        },
        bass: {
            rhythm: [0.88, 0.07, 0.39, 0.11, 0.52, 0.09, 0.57, 0.14, 0.72, 0.08, 0.46, 0.13, 0.6, 0.1, 0.54, 0.14],
            markov: {
            "-3": { "-3": 0.019, "-2": 0.02, "-1": 0.021, "0": 0.334, "1": 0.091, "2": 0.136, "3": 0.379 },
            "-2": { "-3": 0.05, "-2": 0.096, "-1": 0.102, "0": 0.31, "1": 0.067, "2": 0.251, "3": 0.123 },
            "-1": { "-3": 0.052, "-2": 0.144, "-1": 0.218, "0": 0.279, "1": 0.181, "2": 0.074, "3": 0.052 },
            "0": { "-3": 0.035, "-2": 0.063, "-1": 0.048, "0": 0.695, "1": 0.052, "2": 0.051, "3": 0.056 },
            "1": { "-3": 0.085, "-2": 0.07, "-1": 0.141, "0": 0.37, "1": 0.183, "2": 0.11, "3": 0.043 },
            "2": { "-3": 0.136, "-2": 0.181, "-1": 0.069, "0": 0.341, "1": 0.134, "2": 0.107, "3": 0.032 },
            "3": { "-3": 0.477, "-2": 0.119, "-1": 0.068, "0": 0.215, "1": 0.031, "2": 0.065, "3": 0.026 },
        },
        },
    },
    jazz: {
        melody: {
            rhythm: [1, 0.39, 0.72, 0.52, 1, 0.42, 0.84, 0.51, 1, 0.37, 0.78, 0.5, 1, 0.42, 0.79, 0.48],
            markov: {
            "-3": { "-3": 0.145, "-2": 0.069, "-1": 0.027, "0": 0.026, "1": 0.039, "2": 0.147, "3": 0.547 },
            "-2": { "-3": 0.178, "-2": 0.187, "-1": 0.077, "0": 0.052, "1": 0.091, "2": 0.179, "3": 0.235 },
            "-1": { "-3": 0.114, "-2": 0.162, "-1": 0.251, "0": 0.103, "1": 0.156, "2": 0.102, "3": 0.112 },
            "0": { "-3": 0.072, "-2": 0.083, "-1": 0.085, "0": 0.506, "1": 0.091, "2": 0.092, "3": 0.073 },
            "1": { "-3": 0.162, "-2": 0.143, "-1": 0.165, "0": 0.074, "1": 0.269, "2": 0.112, "3": 0.076 },
            "2": { "-3": 0.318, "-2": 0.179, "-1": 0.074, "0": 0.051, "1": 0.068, "2": 0.205, "3": 0.105 },
            "3": { "-3": 0.421, "-2": 0.175, "-1": 0.06, "0": 0.031, "1": 0.055, "2": 0.123, "3": 0.135 },
        },
        },
        bass: {
            rhythm: [0.77, 0.04, 0.21, 0.11, 0.38, 0.07, 0.4, 0.14, 0.6, 0.06, 0.23, 0.13, 0.47, 0.08, 0.41, 0.13],
            markov: {
            "-3": { "-3": 0.02, "-2": 0.036, "-1": 0.048, "0": 0.231, "1": 0.103, "2": 0.143, "3": 0.419 },
            "-2": { "-3": 0.114, "-2": 0.074, "-1": 0.11, "0": 0.196, "1": 0.162, "2": 0.249, "3": 0.096 },
            "-1": { "-3": 0.097, "-2": 0.145, "-1": 0.235, "0": 0.224, "1": 0.09, "2": 0.086, "3": 0.123 },
            "0": { "-3": 0.091, "-2": 0.114, "-1": 0.068, "0": 0.512, "1": 0.057, "2": 0.076, "3": 0.082 },
            "1": { "-3": 0.102, "-2": 0.093, "-1": 0.111, "0": 0.204, "1": 0.289, "2": 0.153, "3": 0.05 },
            "2": { "-3": 0.175, "-2": 0.162, "-1": 0.082, "0": 0.283, "1": 0.172, "2": 0.066, "3": 0.06 },
            "3": { "-3": 0.367, "-2": 0.096, "-1": 0.129, "0": 0.21, "1": 0.069, "2": 0.106, "3": 0.022 },
        },
        },
    },
    electronic: {
        melody: {
            rhythm: [0.98, 0.21, 0.64, 0.24, 0.77, 0.23, 0.71, 0.3, 0.78, 0.21, 0.67, 0.25, 0.76, 0.23, 0.79, 0.25],
            markov: {
            "-3": { "-3": 0.056, "-2": 0.019, "-1": 0.013, "0": 0.175, "1": 0.032, "2": 0.131, "3": 0.574 },
            "-2": { "-3": 0.087, "-2": 0.144, "-1": 0.061, "0": 0.197, "1": 0.063, "2": 0.302, "3": 0.146 },
            "-1": { "-3": 0.058, "-2": 0.124, "-1": 0.269, "0": 0.177, "1": 0.225, "2": 0.114, "3": 0.032 },
            "0": { "-3": 0.044, "-2": 0.054, "-1": 0.068, "0": 0.618, "1": 0.053, "2": 0.082, "3": 0.08 },
            "1": { "-3": 0.075, "-2": 0.156, "-1": 0.279, "0": 0.188, "1": 0.178, "2": 0.087, "3": 0.038 },
            "2": { "-3": 0.164, "-2": 0.317, "-1": 0.097, "0": 0.142, "1": 0.071, "2": 0.167, "3": 0.042 },
            "3": { "-3": 0.491, "-2": 0.162, "-1": 0.068, "0": 0.114, "1": 0.025, "2": 0.088, "3": 0.052 },
        },
        },
        bass: {
            rhythm: [0.89, 0.15, 0.61, 0.31, 0.69, 0.15, 0.71, 0.26, 0.74, 0.16, 0.67, 0.27, 0.66, 0.15, 0.76, 0.2],
            markov: {
            "-3": { "-3": 0.021, "-2": 0.029, "-1": 0.006, "0": 0.206, "1": 0.022, "2": 0.053, "3": 0.662 },
            "-2": { "-3": 0.07, "-2": 0.177, "-1": 0.042, "0": 0.25, "1": 0.065, "2": 0.166, "3": 0.23 },
            "-1": { "-3": 0.016, "-2": 0.229, "-1": 0.177, "0": 0.245, "1": 0.217, "2": 0.066, "3": 0.049 },
            "0": { "-3": 0.079, "-2": 0.053, "-1": 0.04, "0": 0.665, "1": 0.052, "2": 0.04, "3": 0.072 },
            "1": { "-3": 0.053, "-2": 0.068, "-1": 0.143, "0": 0.423, "1": 0.16, "2": 0.133, "3": 0.02 },
            "2": { "-3": 0.093, "-2": 0.278, "-1": 0.07, "0": 0.317, "1": 0.105, "2": 0.09, "3": 0.047 },
            "3": { "-3": 0.589, "-2": 0.071, "-1": 0.068, "0": 0.225, "1": 0.005, "2": 0.023, "3": 0.02 },
        },
        },
    },
    folk: {
        melody: {
            rhythm: [0.81, 0.1, 0.41, 0.15, 0.63, 0.1, 0.48, 0.17, 0.67, 0.1, 0.44, 0.15, 0.67, 0.12, 0.53, 0.18],
            markov: {
            "-3": { "-3": 0.044, "-2": 0.06, "-1": 0.026, "0": 0.096, "1": 0.06, "2": 0.291, "3": 0.423 },
            "-2": { "-3": 0.068, "-2": 0.19, "-1": 0.099, "0": 0.123, "1": 0.086, "2": 0.268, "3": 0.166 },
            "-1": { "-3": 0.035, "-2": 0.116, "-1": 0.28, "0": 0.203, "1": 0.22, "2": 0.101, "3": 0.046 },
            "0": { "-3": 0.046, "-2": 0.101, "-1": 0.144, "0": 0.456, "1": 0.115, "2": 0.085, "3": 0.053 },
            "1": { "-3": 0.075, "-2": 0.113, "-1": 0.309, "0": 0.15, "1": 0.244, "2": 0.086, "3": 0.023 },
            "2": { "-3": 0.202, "-2": 0.201, "-1": 0.086, "0": 0.149, "1": 0.086, "2": 0.242, "3": 0.033 },
            "3": { "-3": 0.284, "-2": 0.262, "-1": 0.086, "0": 0.14, "1": 0.068, "2": 0.1, "3": 0.059 },
        },
        },
        bass: {
            rhythm: [0.93, 0.01, 0.14, 0.04, 0.3, 0.02, 0.43, 0.09, 0.75, 0.03, 0.18, 0.04, 0.45, 0.04, 0.33, 0.08],
            markov: {
            "-3": { "-3": 0.014, "-2": 0.043, "-1": 0.024, "0": 0.327, "1": 0.094, "2": 0.172, "3": 0.327 },
            "-2": { "-3": 0.062, "-2": 0.082, "-1": 0.124, "0": 0.246, "1": 0.06, "2": 0.335, "3": 0.09 },
            "-1": { "-3": 0.055, "-2": 0.121, "-1": 0.265, "0": 0.287, "1": 0.098, "2": 0.085, "3": 0.088 },
            "0": { "-3": 0.056, "-2": 0.12, "-1": 0.063, "0": 0.49, "1": 0.084, "2": 0.107, "3": 0.081 },
            "1": { "-3": 0.092, "-2": 0.09, "-1": 0.091, "0": 0.254, "1": 0.331, "2": 0.107, "3": 0.034 },
            "2": { "-3": 0.099, "-2": 0.265, "-1": 0.051, "0": 0.283, "1": 0.124, "2": 0.146, "3": 0.032 },
            "3": { "-3": 0.435, "-2": 0.129, "-1": 0.086, "0": 0.208, "1": 0.031, "2": 0.094, "3": 0.017 },
        },
        },
    },
    metal: {
        melody: {
            rhythm: [0.97, 0.21, 0.62, 0.26, 0.74, 0.23, 0.71, 0.28, 0.8, 0.21, 0.61, 0.25, 0.76, 0.24, 0.65, 0.23],
            markov: {
            "-3": { "-3": 0.036, "-2": 0.034, "-1": 0.035, "0": 0.161, "1": 0.05, "2": 0.102, "3": 0.584 },
            "-2": { "-3": 0.155, "-2": 0.197, "-1": 0.066, "0": 0.092, "1": 0.087, "2": 0.248, "3": 0.155 },
            "-1": { "-3": 0.048, "-2": 0.123, "-1": 0.33, "0": 0.125, "1": 0.253, "2": 0.066, "3": 0.056 },
            "0": { "-3": 0.034, "-2": 0.041, "-1": 0.083, "0": 0.614, "1": 0.068, "2": 0.055, "3": 0.106 },
            "1": { "-3": 0.089, "-2": 0.105, "-1": 0.249, "0": 0.174, "1": 0.26, "2": 0.087, "3": 0.036 },
            "2": { "-3": 0.167, "-2": 0.318, "-1": 0.098, "0": 0.088, "1": 0.088, "2": 0.21, "3": 0.03 },
            "3": { "-3": 0.522, "-2": 0.199, "-1": 0.072, "0": 0.055, "1": 0.045, "2": 0.077, "3": 0.029 },
        },
        },
        bass: {
            rhythm: [0.89, 0.16, 0.53, 0.23, 0.69, 0.17, 0.6, 0.23, 0.77, 0.17, 0.55, 0.23, 0.72, 0.17, 0.59, 0.21],
            markov: {
            "-3": { "-3": 0.005, "-2": 0.024, "-1": 0.025, "0": 0.432, "1": 0.053, "2": 0.054, "3": 0.407 },
            "-2": { "-3": 0.039, "-2": 0.058, "-1": 0.09, "0": 0.45, "1": 0.13, "2": 0.146, "3": 0.087 },
            "-1": { "-3": 0.046, "-2": 0.09, "-1": 0.238, "0": 0.336, "1": 0.204, "2": 0.048, "3": 0.039 },
            "0": { "-3": 0.019, "-2": 0.028, "-1": 0.038, "0": 0.804, "1": 0.038, "2": 0.035, "3": 0.038 },
            "1": { "-3": 0.087, "-2": 0.078, "-1": 0.165, "0": 0.39, "1": 0.189, "2": 0.065, "3": 0.026 },
            "2": { "-3": 0.05, "-2": 0.23, "-1": 0.144, "0": 0.392, "1": 0.125, "2": 0.037, "3": 0.022 },
            "3": { "-3": 0.487, "-2": 0.061, "-1": 0.135, "0": 0.238, "1": 0.056, "2": 0.02, "3": 0.004 },
        },
        },
    },
    rnb: {
        melody: {
            rhythm: [0.95, 0.24, 0.53, 0.29, 0.66, 0.24, 0.62, 0.32, 0.74, 0.25, 0.55, 0.29, 0.69, 0.24, 0.63, 0.28],
            markov: {
            "-3": { "-3": 0.046, "-2": 0.024, "-1": 0.03, "0": 0.112, "1": 0.046, "2": 0.343, "3": 0.4 },
            "-2": { "-3": 0.054, "-2": 0.168, "-1": 0.106, "0": 0.111, "1": 0.099, "2": 0.301, "3": 0.162 },
            "-1": { "-3": 0.028, "-2": 0.121, "-1": 0.214, "0": 0.154, "1": 0.242, "2": 0.197, "3": 0.044 },
            "0": { "-3": 0.05, "-2": 0.097, "-1": 0.105, "0": 0.523, "1": 0.086, "2": 0.082, "3": 0.056 },
            "1": { "-3": 0.056, "-2": 0.124, "-1": 0.304, "0": 0.164, "1": 0.208, "2": 0.123, "3": 0.021 },
            "2": { "-3": 0.21, "-2": 0.203, "-1": 0.164, "0": 0.114, "1": 0.089, "2": 0.201, "3": 0.02 },
            "3": { "-3": 0.312, "-2": 0.265, "-1": 0.091, "0": 0.134, "1": 0.054, "2": 0.087, "3": 0.058 },
        },
        },
        bass: {
            rhythm: [0.85, 0.05, 0.27, 0.12, 0.39, 0.08, 0.49, 0.24, 0.61, 0.1, 0.36, 0.13, 0.5, 0.13, 0.51, 0.16],
            markov: {
            "-3": { "-3": 0.017, "-2": 0.017, "-1": 0.037, "0": 0.244, "1": 0.086, "2": 0.188, "3": 0.411 },
            "-2": { "-3": 0.061, "-2": 0.075, "-1": 0.108, "0": 0.212, "1": 0.115, "2": 0.372, "3": 0.057 },
            "-1": { "-3": 0.039, "-2": 0.109, "-1": 0.232, "0": 0.27, "1": 0.195, "2": 0.089, "3": 0.065 },
            "0": { "-3": 0.068, "-2": 0.113, "-1": 0.092, "0": 0.47, "1": 0.086, "2": 0.099, "3": 0.071 },
            "1": { "-3": 0.083, "-2": 0.061, "-1": 0.133, "0": 0.283, "1": 0.275, "2": 0.11, "3": 0.054 },
            "2": { "-3": 0.136, "-2": 0.196, "-1": 0.103, "0": 0.237, "1": 0.169, "2": 0.131, "3": 0.029 },
            "3": { "-3": 0.524, "-2": 0.084, "-1": 0.06, "0": 0.234, "1": 0.025, "2": 0.055, "3": 0.019 },
        },
        },
    },
    };

    // Clusters this file has real data for -- indie/fallback are
    // deliberately absent (see file header); callers should check
    // `hasData(cluster)` and fall back to instrument-archetypes.js's
    // hand-authored degreePatternSeed/rhythmGrid when it's false.
    function hasData(cluster) {
        return Object.prototype.hasOwnProperty.call(CLUSTER_DATA, cluster);
    }

    function dataFor(cluster, part) {
        // part: "melody" | "bass"
        return CLUSTER_DATA[cluster]?.[part] ?? null;
    }

    // Weighted random pick from a { key: probability, ... } distribution
    // (probabilities need not sum to exactly 1 -- e.g. rounding in the
    // extracted data -- this normalizes against the running total rather
    // than assuming that, so a slightly-off table still picks correctly).
    function weightedChoice(distribution) {
        const entries = Object.entries(distribution);
        const total = entries.reduce((sum, [, p]) => sum + p, 0);
        let roll = Math.random() * total;
        for (const [key, p] of entries) {
            roll -= p;
            if (roll <= 0) return key;
        }
        return entries[entries.length - 1][0]; // floating-point fallback
    }

    // One step of the Markov walk: given the interval bucket that led to
    // the current degree, samples the next bucket from `markov`, applies
    // it to `currentDegree`, and reflects off [minDegree, maxDegree]
    // rather than hard-clamping -- clamping would let the walk get stuck
    // repeating the boundary value; reflecting keeps it musically bounded
    // while still reading as continuous motion. Returns
    // { degree, bucket } -- feed `bucket` back in as `prevBucket` next call.
    function stepMarkov(markov, prevBucket, currentDegree, minDegree, maxDegree) {
        const row = markov[String(prevBucket)] ?? markov["0"];
        const bucket = parseInt(weightedChoice(row), 10);
        let degree = currentDegree + bucket;
        if (degree > maxDegree) degree = maxDegree - (degree - maxDegree);
        if (degree < minDegree) degree = minDegree + (minDegree - degree);
        degree = Math.max(minDegree, Math.min(maxDegree, degree)); // guard against a reflection overshoot on a big jump
        return { degree, bucket };
    }

    global.MelodicData = { hasData, dataFor, weightedChoice, stepMarkov };
})(window);
