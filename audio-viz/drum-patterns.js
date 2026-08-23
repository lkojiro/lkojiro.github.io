// drum-patterns.js
//
// Two "seed" grooves per genre cluster (16 total) -- each a 16-step (one
// 4/4 measure) pattern for kick/snare/hihatClosed/hihatOpen, tagged with
// a tempoRange so together the two span the project's fixed 100-110 BPM
// safe zone. This is unchanged from the original version of this file.
//
// What's new: every seed groove is expanded into a full SECTION SET --
// basic / buildup (a low-energy 1-bar grid and a high-energy 1-bar grid;
// drum-layer.js plays each for multiple bars, see there for exactly how
// long) / main / bSection -- via generic derivation rules applied to the
// seed, not hand-typed per genre. With 16 seeds x
// (basic + 2 buildup bars + main + bSection) x 7 voices x 16 steps, hand
// authoring this would be ~9,000 numbers to keep consistent; a small set
// of clear transformation rules (same philosophy as chord-progressions.js
// deriving chords from a stacking formula, or the fill archetypes below)
// keeps it maintainable and means every genre's sections follow the same
// arranging logic instead of drifting inconsistent from each other.
//
// Voices: kick, snare, hihatClosed, hihatOpen (original 4) plus tomLow,
// tomHigh, perc (new). Toms/perc are deliberately near-silent in `main`
// (keep the recognizable groove uncluttered) and do most of their work in
// `buildup`/`bSection`/fills -- classic arranging practice: save the ear
// candy for transitions, not the part that's supposed to feel steady.
//
// See drum-layer.js for the state machine that decides which section
// plays when, and for how/when fills (generated per-section below) get
// substituted in.
//
// Depends on: nothing (pure data + lookup helpers)

(function (global) {
    "use strict";

    const STEPS = 16;
    const silence = () => Array(STEPS).fill(0);

    const SEED_PATTERNS = {
        pop: [
            {
                label: "Laid-back pop backbeat", tempoRange: [100, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .8, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.6, 0, .5, 0, .6, 0, .5, 0, .6, 0, .5, 0, .6, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .4, 0],
            },
            {
                label: "Driving pop", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // four-on-the-floor
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, 0],
            },
        ],
        hiphop: [
            {
                label: "Boom-bap", tempoRange: [100, 104], swing: 0.15,
                kick:        [1, 0, 0, 0, 0, 0, .8, 0, 1, 0, .7, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .4, 0],
            },
            {
                // half-time snare (hits once, on beat 3, not 2-and-4) +
                // continuous 16th hats -- modern trap-leaning feel, still
                // inside the safe-zone tempo (no true trap hi-hat rolls)
                label: "Modern trap-lite", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, .7, 1, 0, 0, 0, 0, 0, .7, 0],
                snare:       [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                hihatClosed: [.5, .3, .5, .3, .5, .3, .5, .3, .5, .3, .5, .3, .5, .3, .5, .3],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .4, 0],
            },
        ],
        electronic: [
            {
                label: "Chill downtempo", tempoRange: [100, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0], // half-time
                snare:       [0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, .3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "House four-on-the-floor", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // clap layered on kick
                hihatClosed: [0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0, 0, 0, 0, 0], // classic offbeat house hats
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0],
            },
        ],
        indie: [
            {
                label: "Bedroom pop shuffle", tempoRange: [100, 104], swing: 0.2,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
            {
                label: "Indie pop groove", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .7, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
        ],
        rock: [
            {
                label: "Half-time anthemic", tempoRange: [100, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .9, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // big spacious backbeat on 3 only
                hihatClosed: [.6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, 0],
            },
            {
                label: "Rock driving beat", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .8, 0, 1, 0, .7, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // kept tight, no lift
            },
        ],
        jazz: [
            {
                // sparse syncopated kick/snare "comping" instead of a fixed
                // backbeat, swung ride-like closed-hat pattern, pedal
                // hihat (open voice, soft) on 2 & 4
                label: "Swung, laid-back", tempoRange: [100, 104], swing: 0.3,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 0, 0, .4, 0, 0, 0, 0, 0, 0, 0, 0, 0], // ghost comp
                hihatClosed: [.6, 0, 0, 0, .5, 0, .4, 0, .6, 0, 0, 0, .5, 0, .4, 0], // ride outline
                hihatOpen:   [0, 0, 0, 0, .3, 0, 0, 0, 0, 0, 0, 0, .3, 0, 0, 0], // pedal chick, 2 & 4
            },
            {
                label: "Uptempo swing", tempoRange: [105, 110], swing: 0.25,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 0, 0, .4, 0, 0, 0, 0, 0, 0, 0, .4, 0],
                hihatClosed: [.6, 0, 0, .4, .6, 0, 0, .4, .6, 0, 0, .4, .6, 0, 0, .4], // busier ride
                hihatOpen:   [0, 0, 0, 0, .3, 0, 0, 0, 0, 0, 0, 0, .3, 0, 0, 0],
            },
        ],
        folk: [
            {
                label: "Folk stomp & clap", tempoRange: [100, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0], // foot stomp, beats 1 & 3
                snare:       [0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0], // hand clap
                hihatClosed: [.3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0], // light shaker texture
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "Acoustic driving", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .7, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
        ],
        // used when a library's dominant genre doesn't classify into any
        // named cluster -- deliberately the plainest, safest patterns
        fallback: [
            {
                label: "Gentle pulse", tempoRange: [100, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, .6, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
                hihatClosed: [.4, 0, 0, 0, .4, 0, 0, 0, .4, 0, 0, 0, .4, 0, 0, 0], // quarter notes only
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "Steady ambient groove", tempoRange: [105, 110], swing: 0,
                kick:        [1, 0, 0, 0, .7, 0, 0, 0, 1, 0, 0, 0, .7, 0, 0, 0],
                snare:       [0, 0, 0, 0, .6, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
        ],
    };

    // Picks whichever of a cluster's 2 seeds has a tempoRange containing
    // `bpm`; falls back to the cluster's first seed (and then to
    // `fallback`) if the cluster isn't recognized -- should never
    // actually miss given the two ranges are contiguous across 100-110.
    // Returns the seed's ALREADY-BUILT section set (see bottom of file).
    function pickPattern(cluster, bpm) {
        const patterns = SEED_PATTERNS[cluster] ?? SEED_PATTERNS.fallback;
        return patterns.find((p) => bpm >= p.tempoRange[0] && bpm <= p.tempoRange[1]) ?? patterns[0];
    }

    // -- Section derivation ---------------------------------------------
    // All four take a "base" grid (kick/snare/hihatClosed/hihatOpen/swing)
    // and return a full 7-voice grid. `main` is the seed itself, lightly
    // wrapped; the other three apply a clear, generic arranging rule --
    // the same rule for every genre, so genre character survives (it's
    // baked into the seed's own kick/snare/hihat shapes) while the
    // arrangement logic itself stays consistent and easy to reason about.

    function deriveMain(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick, snare: seed.snare,
            hihatClosed: seed.hihatClosed, hihatOpen: seed.hihatOpen,
            tomLow: silence(), tomHigh: silence(), perc: silence(), // main stays uncluttered -- see file header
        };
    }

    // Verse-energy: only the strong-beat kicks survive, snare drops out
    // entirely, hats thin to soft quarter notes, no toms/perc. The most
    // stripped-down a pattern ever gets.
    function deriveBasic(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick.map((v, i) => (i % 8 === 0 ? v : 0)), // keep only beat-1/beat-3 hits, if the seed has them
            snare: silence(),
            hihatClosed: seed.hihatClosed.map((v, i) => (i % 4 === 0 ? v * 0.6 : 0)), // quarter notes, pulled back
            hihatOpen: silence(),
            tomLow: silence(), tomHigh: silence(), perc: silence(),
        };
    }

    // Escalating build, low-energy and high-energy halves (drum-layer.js
    // plays buildupLow for the first half of BUILDUP's length and
    // buildupHigh for the second half). Kick drops out almost entirely
    // (the classic "pull the low end so the rise reads clearly" trick)
    // until a pickup hit right before the drop; hats rise in density via
    // a velocity ramp baked into the grid; toms enter and climb
    // low -> high, arriving at their highest/densest exactly where MAIN
    // is about to land.
    function deriveBuildupLow(seed) {
        return {
            swing: seed.swing,
            kick: silence(),
            snare: silence(),
            hihatClosed: Array.from({ length: STEPS }, (_, i) => 0.35 + (i / (STEPS - 1)) * 0.15),
            hihatOpen: silence(),
            tomLow: [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0],
            tomHigh: silence(),
            perc: [0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .3, 0],
        };
    }

    function deriveBuildupHigh(seed) {
        return {
            swing: seed.swing,
            kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .9, 0], // pickup hit right before the drop
            snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6], // pickup snare alongside it, driving into the downbeat
            hihatClosed: Array.from({ length: STEPS }, (_, i) => 0.5 + (i / (STEPS - 1)) * 0.4),
            hihatOpen: silence(),
            tomLow: [1, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tomHigh: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, .8, 0, .9, 0], // ascending -- toms climb from low to high across the build
            perc: [0, 0, .4, 0, .4, 0, .4, 0, 0, 0, .4, 0, .4, 0, .4, 0],
        };
    }

    // A genuine variation on the seed, not a copy: kick stays (same
    // groove family) but snare emphasis moves off the plain backbeat onto
    // beat 3 plus a pickup ghost note, hats pull back to make room for a
    // steady perc texture -- the B section's own signature color -- plus
    // a light tom accent. Reads as "same song, different part."
    function deriveBSection(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick,
            snare: seed.snare.map((v, i) => (i === 8 ? Math.max(v, 0.8) : i === 14 ? 0.5 : 0)),
            hihatClosed: seed.hihatClosed.map((v) => v * 0.7),
            hihatOpen: seed.hihatOpen,
            tomLow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
            tomHigh: silence(),
            perc: [0, 0, .5, 0, 0, 0, .5, 0, 0, 0, .5, 0, 0, 0, .5, 0],
        };
    }

    // All-zero, shared by every pattern (silence has no genre) -- the
    // arrangement's SILENCE state plays this. Fills are never attempted
    // against it (see drum-layer.js): a fill into intentional silence
    // defeats the point of the silence.
    const SILENT_GRID = {
        swing: 0,
        kick: silence(), snare: silence(), hihatClosed: silence(), hihatOpen: silence(),
        tomLow: silence(), tomHigh: silence(), perc: silence(),
    };

    // -- Fills --------------------------------------------------------
    // Two one-bar fill archetypes, applied to EVERY section (main, basic,
    // both buildup bars, bSection) individually -- generated
    // algorithmically rather than hand-typed, same reasoning as the
    // section derivation above. Both keep a section's own groove through
    // the first half-bar (steps 0-7) so a fill still sounds like it
    // belongs, then break from it in the back half (steps 8-15) --
    // standard drumming practice: a fill signals "something's about to
    // change" by departing from the groove right before the phrase turns
    // over, not by replacing it outright. See drum-layer.js for when a
    // fill actually gets substituted in (the last bar before any section
    // change).

    // "Roll build": back half becomes an ascending-density snare roll
    // with low->high toms underneath it for extra drama, hats drop out to
    // let it breathe, and an open-hihat "crash" lands on the last 16th to
    // punctuate the turnover.
    function makeRollBuildFill(base) {
        const rollSteps = { 8: 0.5, 10: 0.55, 12: 0.65, 13: 0.75, 14: 0.85, 15: 0.95 };
        return {
            swing: base.swing,
            kick: base.kick.map((v, i) => (i < 8 ? v : 0)),
            snare: base.snare.map((v, i) => (i < 8 ? v : rollSteps[i] ?? 0)),
            hihatClosed: base.hihatClosed.map((v, i) => (i < 8 ? v : 0)),
            hihatOpen: Array.from({ length: STEPS }, (_, i) => (i === 15 ? 0.8 : 0)),
            tomLow: Array.from({ length: STEPS }, (_, i) => (i === 8 || i === 10 ? 0.6 : 0)),
            tomHigh: Array.from({ length: STEPS }, (_, i) => (i === 12 || i === 14 ? 0.7 : 0)),
            perc: silence(),
        };
    }

    // "Syncopated break": back half displaces kick/snare onto offbeat
    // 16th-note subdivisions instead of a steady roll, with a couple of
    // tom/perc accents woven through, ending in a unison kick+snare hit
    // on the last 16th for a hard stop rather than a crash-into-next-bar
    // lift -- a genuinely different flavor of fill, not a variation.
    function makeSyncopatedBreakFill(base) {
        return {
            swing: base.swing,
            kick: base.kick.map((v, i) => (i < 8 ? v : [9, 13, 15].includes(i) ? 0.8 : 0)),
            snare: base.snare.map((v, i) => (i < 8 ? v : [11, 13, 15].includes(i) ? 0.7 : 0)),
            hihatClosed: base.hihatClosed.map((v, i) => (i < 8 ? v * 0.6 : 0)),
            hihatOpen: silence(),
            tomLow: Array.from({ length: STEPS }, (_, i) => (i === 9 ? 0.7 : 0)),
            tomHigh: Array.from({ length: STEPS }, (_, i) => (i === 13 ? 0.7 : 0)),
            perc: Array.from({ length: STEPS }, (_, i) => (i === 11 ? 0.6 : 0)),
        };
    }

    function withFills(grid) {
        grid.fills = [makeRollBuildFill(grid), makeSyncopatedBreakFill(grid)];
        return grid;
    }

    // Build the full section set for one seed, run once at load time so
    // drum-layer.js can just read `pattern.sections.main`, etc. directly.
    function buildSections(seed) {
        return {
            main: withFills(deriveMain(seed)),
            basic: withFills(deriveBasic(seed)),
            buildupLow: withFills(deriveBuildupLow(seed)),
            buildupHigh: withFills(deriveBuildupHigh(seed)),
            bSection: withFills(deriveBSection(seed)),
        };
    }

    for (const seeds of Object.values(SEED_PATTERNS)) {
        for (const seed of seeds) {
            seed.sections = buildSections(seed);
        }
    }

    global.DrumPatterns = { DRUM_PATTERNS: SEED_PATTERNS, pickPattern, SILENT_GRID };
})(window);
