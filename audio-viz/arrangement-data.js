// arrangement-data.js
//
// Real per-genre song-structure statistics -- feeds drum-layer.js's
// SILENCE/BASIC/BUILDUP/MAIN/B_SECTION arrangement state machine so
// section sequencing and durations reflect actual genre convention
// instead of one hand-picked graph applying to every user. Derived from
// the Harmonix Set (MIT licensed -- Nieto et al., 912 songs' worth of
// human-annotated song-structure timestamps + genre + BPM metadata; see
// https://github.com/urinieto/harmonixset). Unlike the drum/melody/bass
// data, there's no musical-content copyright question here at all: this
// is pure structural metadata (timestamps and section labels like
// "chorus"/"verse"), not audio or a MIDI transcription of one.
//
// -- Methodology --
// Harmonix's ~60 raw section labels (chorus, verse, prechorus, bridge,
// break, solo, silence, ...) are collapsed onto our 5 states by
// substring keyword match (see data-extraction/extract-arrangement.py's
// classify_label() for the exact rules): "silence" -> SILENCE,
// prechorus/build/transition -> BUILDUP, chorus/hook/drop (and variants
// like postchorus/altchorus) -> MAIN, bridge/break/solo/inst/section/
// stutter/gtr -> B_SECTION, verse/intro/outro -> BASIC. Consecutive
// segment boundaries give a (state, duration) sequence per song;
// duration in seconds converts to bars via that song's own BPM, rounded
// to the nearest multiple of 4 (this project's fixed section-length
// unit, same as drum-patterns.js) and clamped to [4, 32]. Adjacent
// (state -> next_state) pairs accumulate into a per-cluster transition
// table; per-state bar-lengths accumulate into a per-cluster duration
// histogram. Both are raw relative weights, not forced to sum to 1 --
// melodic-data.js's weightedChoice() (reused here, see stepFor() below)
// normalizes by total at use time -- so entries below 0.03 are simply
// dropped rather than kept and renormalized, which would overstate a
// near-noise branch for no benefit.
//
// -- Genre mapping --
// Harmonix's genre tags collapse onto our clusters the same way
// classify_genres() does elsewhere in this project: Pop/Pop-Rock->pop,
// Hip-Hop->hiphop, R&B->rnb, Funk/Disco->funk, Reggaeton->reggaeton,
// Dance/Electronic->electronic, Country->folk, Rock/Classic Rock/Grunge/
// Punk->rock, Metal->metal, Alternative/Indie Rock->indie. Only songs
// tagged >=90% 4/4 time are used (this project's whole rhythmic
// architecture assumes 4/4).
//
// -- Coverage --
// jazz and fallback have zero usable Harmonix songs (jazz isn't
// represented in the dataset's source playlists at all) -- both
// clusters keep drum-layer.js's original hand-authored transition graph
// instead of consulting this file. All 10 other clusters cleared a
// >=10-file trust bar, though funk (14) and reggaeton (15) are thin --
// still real per-genre signal, just a smaller sample than the 22-415
// files backing everything else here.
//
// This file's data is already baked in -- see
// data-extraction/extract-arrangement.py for the reproducible extraction
// script (not shipped to the site, kept for reproducibility only).
//
// Depends on: melodic-data.js (reuses its weightedChoice() helper)

(function (global) {
    "use strict";

    // cluster -> { transitions: { STATE: { NEXT_STATE: weight, ... } },
    //              durations:   { STATE: { barsAsString: weight, ... } } }
    const ARRANGEMENT_DATA = {
        electronic: {
            transitions: {
                SILENCE: { BASIC: 0.842, MAIN: 0.158 },
                BASIC: { BUILDUP: 0.229, MAIN: 0.413, BASIC: 0.245, B_SECTION: 0.113 },
                BUILDUP: { MAIN: 0.732, B_SECTION: 0.116, BUILDUP: 0.087, BASIC: 0.065 },
                MAIN: { B_SECTION: 0.329, BASIC: 0.273, MAIN: 0.36, BUILDUP: 0.038 },
                B_SECTION: { BASIC: 0.259, MAIN: 0.316, B_SECTION: 0.354, BUILDUP: 0.07 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.126, 8: 0.443, 12: 0.053, 16: 0.301, 24: 0.039 },
                BUILDUP: { 4: 0.171, 8: 0.679, 12: 0.05, 16: 0.086 },
                MAIN: { 4: 0.056, 8: 0.644, 12: 0.036, 16: 0.219 },
                B_SECTION: { 4: 0.142, 8: 0.478, 12: 0.056, 16: 0.24, 32: 0.036 },
            },
        },
        hiphop: {
            transitions: {
                SILENCE: { BASIC: 0.843, MAIN: 0.118 },
                BASIC: { MAIN: 0.58, BUILDUP: 0.15, B_SECTION: 0.042, BASIC: 0.227 },
                BUILDUP: { MAIN: 0.857, BASIC: 0.056, BUILDUP: 0.032, B_SECTION: 0.056 },
                MAIN: { BASIC: 0.587, B_SECTION: 0.182, MAIN: 0.216 },
                B_SECTION: { MAIN: 0.462, BASIC: 0.296, B_SECTION: 0.166, BUILDUP: 0.077 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.208, 8: 0.454, 12: 0.112, 16: 0.189 },
                BUILDUP: { 4: 0.37, 8: 0.606 },
                MAIN: { 4: 0.138, 8: 0.692, 12: 0.063, 16: 0.096 },
                B_SECTION: { 4: 0.192, 8: 0.571, 12: 0.077, 16: 0.121 },
            },
        },
        pop: {
            transitions: {
                SILENCE: { BASIC: 0.952, MAIN: 0.048 },
                BASIC: { BASIC: 0.308, BUILDUP: 0.259, MAIN: 0.4, B_SECTION: 0.032 },
                BUILDUP: { MAIN: 0.881, BASIC: 0.051, B_SECTION: 0.037, BUILDUP: 0.03 },
                MAIN: { BASIC: 0.374, B_SECTION: 0.277, MAIN: 0.326 },
                B_SECTION: { MAIN: 0.478, BASIC: 0.268, B_SECTION: 0.194, BUILDUP: 0.06 },
            },
            durations: {
                SILENCE: { 4: 0.984 },
                BASIC: { 4: 0.214, 8: 0.504, 12: 0.074, 16: 0.186 },
                BUILDUP: { 4: 0.368, 8: 0.609 },
                MAIN: { 4: 0.097, 8: 0.607, 12: 0.07, 16: 0.201 },
                B_SECTION: { 4: 0.148, 8: 0.555, 12: 0.096, 16: 0.162 },
            },
        },
        rock: {
            transitions: {
                SILENCE: { BASIC: 0.98 },
                BASIC: { BASIC: 0.328, MAIN: 0.398, BUILDUP: 0.135, B_SECTION: 0.139 },
                BUILDUP: { MAIN: 0.757, BASIC: 0.216 },
                MAIN: { BASIC: 0.38, MAIN: 0.257, B_SECTION: 0.364 },
                B_SECTION: { MAIN: 0.178, BASIC: 0.447, B_SECTION: 0.362 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.128, 8: 0.478, 12: 0.135, 16: 0.173, 32: 0.042 },
                BUILDUP: { 4: 0.243, 8: 0.622, 16: 0.108 },
                MAIN: { 4: 0.091, 8: 0.596, 12: 0.12, 16: 0.149 },
                B_SECTION: { 4: 0.075, 8: 0.429, 12: 0.081, 16: 0.199, 20: 0.037, 24: 0.093, 32: 0.075 },
            },
        },
        indie: {
            transitions: {
                SILENCE: { BASIC: 1.0 },
                BASIC: { BASIC: 0.274, MAIN: 0.432, BUILDUP: 0.242, B_SECTION: 0.053 },
                BUILDUP: { BUILDUP: 0.071, MAIN: 0.929 },
                MAIN: { BASIC: 0.313, MAIN: 0.323, B_SECTION: 0.364 },
                B_SECTION: { MAIN: 0.286, BASIC: 0.449, B_SECTION: 0.204, BUILDUP: 0.061 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.114, 8: 0.581, 12: 0.124, 16: 0.152 },
                BUILDUP: { 4: 0.679, 8: 0.286, 12: 0.036 },
                MAIN: { 4: 0.114, 8: 0.667, 12: 0.044, 16: 0.149 },
                B_SECTION: { 4: 0.288, 8: 0.462, 12: 0.077, 16: 0.135 },
            },
        },
        folk: {
            transitions: {
                SILENCE: { BASIC: 1.0 },
                BASIC: { BASIC: 0.393, BUILDUP: 0.089, MAIN: 0.496 },
                BUILDUP: { MAIN: 1.0 },
                MAIN: { BASIC: 0.438, MAIN: 0.231, B_SECTION: 0.331 },
                B_SECTION: { MAIN: 0.588, B_SECTION: 0.118, BASIC: 0.255, BUILDUP: 0.039 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.236, 8: 0.64, 12: 0.056, 16: 0.062 },
                BUILDUP: { 4: 0.5, 8: 0.5 },
                MAIN: { 4: 0.099, 8: 0.567, 12: 0.135, 16: 0.191 },
                B_SECTION: { 4: 0.385, 8: 0.442, 12: 0.077, 16: 0.077 },
            },
        },
        metal: {
            transitions: {
                SILENCE: { BASIC: 0.955, B_SECTION: 0.045 },
                BASIC: { BASIC: 0.268, MAIN: 0.351, B_SECTION: 0.227, BUILDUP: 0.155 },
                BUILDUP: { BASIC: 0.4, MAIN: 0.6 },
                MAIN: { B_SECTION: 0.5, BASIC: 0.293, MAIN: 0.207 },
                B_SECTION: { B_SECTION: 0.438, BASIC: 0.449, MAIN: 0.112 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.155, 8: 0.382, 12: 0.127, 16: 0.191, 24: 0.064, 32: 0.073 },
                BUILDUP: { 4: 0.267, 8: 0.533, 16: 0.2 },
                MAIN: { 4: 0.092, 8: 0.631, 12: 0.046, 16: 0.185, 20: 0.031 },
                B_SECTION: { 4: 0.055, 8: 0.462, 12: 0.066, 16: 0.198, 20: 0.044, 24: 0.099, 32: 0.066 },
            },
        },
        rnb: {
            transitions: {
                SILENCE: { BASIC: 1.0 },
                BASIC: { MAIN: 0.353, BUILDUP: 0.309, BASIC: 0.294, B_SECTION: 0.044 },
                BUILDUP: { MAIN: 0.962, B_SECTION: 0.038 },
                MAIN: { BASIC: 0.5, B_SECTION: 0.186, MAIN: 0.3 },
                B_SECTION: { MAIN: 0.524, BASIC: 0.048, BUILDUP: 0.238, B_SECTION: 0.19 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.278, 8: 0.494, 12: 0.063, 16: 0.165 },
                BUILDUP: { 4: 0.111, 8: 0.815, 16: 0.074 },
                MAIN: { 4: 0.098, 8: 0.549, 12: 0.073, 16: 0.28 },
                B_SECTION: { 4: 0.095, 8: 0.571, 12: 0.095, 16: 0.19, 20: 0.048 },
            },
        },
        funk: {
            transitions: {
                SILENCE: { BASIC: 0.8, B_SECTION: 0.2 },
                BASIC: { BASIC: 0.1, MAIN: 0.6, BUILDUP: 0.175, B_SECTION: 0.125 },
                BUILDUP: { B_SECTION: 0.25, MAIN: 0.75 },
                MAIN: { B_SECTION: 0.28, BASIC: 0.32, MAIN: 0.38 },
                B_SECTION: { MAIN: 0.478, BASIC: 0.435, B_SECTION: 0.087 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.14, 8: 0.628, 12: 0.047, 16: 0.163 },
                BUILDUP: { 4: 0.25, 8: 0.75 },
                MAIN: { 4: 0.067, 8: 0.783, 12: 0.1, 16: 0.05 },
                B_SECTION: { 4: 0.25, 8: 0.625, 16: 0.083, 20: 0.042 },
            },
        },
        reggaeton: {
            transitions: {
                SILENCE: { MAIN: 0.25, BASIC: 0.75 },
                BASIC: { MAIN: 0.644, BUILDUP: 0.133, BASIC: 0.178, B_SECTION: 0.044 },
                BUILDUP: { BASIC: 0.125, MAIN: 0.875 },
                MAIN: { BASIC: 0.553, B_SECTION: 0.255, MAIN: 0.17 },
                B_SECTION: { B_SECTION: 0.143, BASIC: 0.429, MAIN: 0.357, BUILDUP: 0.071 },
            },
            durations: {
                SILENCE: { 4: 1.0 },
                BASIC: { 4: 0.278, 8: 0.537, 12: 0.13, 16: 0.056 },
                BUILDUP: { 4: 0.5, 8: 0.5 },
                MAIN: { 4: 0.059, 8: 0.902, 16: 0.039 },
                B_SECTION: { 4: 0.188, 8: 0.812 },
            },
        },
    };

    function hasData(cluster) {
        return Object.prototype.hasOwnProperty.call(ARRANGEMENT_DATA, cluster);
    }

    // Picks the next section for `fromState`, weighted-random per the
    // dataset's real transition frequencies. Returns null if this
    // cluster/state combo has no data (caller falls back to its own
    // hand-authored rule).
    function nextSection(cluster, fromState) {
        const dist = ARRANGEMENT_DATA[cluster]?.transitions?.[fromState];
        if (!dist) return null;
        return global.MelodicData.weightedChoice(dist);
    }

    // Picks a bar-length for `state`, weighted-random per the dataset's
    // real duration histogram. Returns null if no data (caller falls
    // back to its own hand-authored {4,8}/{8,12}-style random choice).
    function durationFor(cluster, state) {
        const dist = ARRANGEMENT_DATA[cluster]?.durations?.[state];
        if (!dist) return null;
        return parseInt(global.MelodicData.weightedChoice(dist), 10);
    }

    global.ArrangementData = { hasData, nextSection, durationFor };
})(window);
