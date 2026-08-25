// instrument-archetypes.js
//
// One archetype per genre cluster: which Tone.js instrument to build, and
// the pattern it plays. Genre is only ever allowed to influence
// TIMBRE/INSTRUMENTATION here -- it never touches mode or harmony (see
// music-theory.js), which is what keeps every possible output inside a
// consistent, pleasant harmonic/modal palette regardless of what's
// actually in someone's library. Tempo is the one exception to "genre
// never reaches outside this file" -- see soundscape-engine.js and
// tempo-data.js -- but even there it's bounded to a fixed 60-140 BPM
// range, not fully open.
//
// -- Rhythm & melodic motion: two different sources -------------------
// For pop, hiphop, rock, jazz, electronic, folk, metal, and rnb,
// `rhythmGrid` and `intervalMarkov` come from melodic-data.js -- real
// per-genre statistics derived from hundreds of songs' worth of MIDI
// data (see that file's header for the full methodology and licensing
// discussion). indie, fallback, funk, and reggaeton don't have real data
// behind them (no equivalent tag exists in the source dataset's genre
// taxonomy), so they keep a hand-authored fixed `degreePatternSeed` +
// boolean `rhythmGrid` -- the same mechanism this whole file used before
// melodic-data.js existed.
//
// synth-layer.js branches on whether `archetype.intervalMarkov` is
// present: if it is, notes come from a live Markov random walk (see
// melodic-data.js's stepMarkov()) instead of the fixed
// seed-pattern-plus-wander mechanism used for indie/fallback/funk/
// reggaeton. Also note `rhythmGrid` for the eight data-backed clusters
// holds PROBABILITIES (0-1), not just 0/1 -- synth-layer.js treats a
// step's value as "chance this step plays," so 1/0 hand-authored
// patterns keep working unchanged (a plain boolean is just a probability
// of 0 or 1) while the real data gets to add its own natural
// per-repetition variation.
//
// Depends on: Tone.js being loaded on the page before this file, and
// melodic-data.js for the eight data-backed clusters' rhythm/motion data.

(function (global) {
    "use strict";

    // Builds a data-backed archetype: everything about TIMBRE stays
    // hand-authored (createInstrument, envelope, cutoff, octave, base
    // velocity -- melodic-data.js has no opinion on any of that, it's
    // rhythm/pitch data only), while rhythmGrid/intervalMarkov come from
    // the real per-genre statistics.
    function withMelodicData(cluster, timbre) {
        const data = global.MelodicData.dataFor(cluster, "melody");
        return {
            ...timbre,
            rhythmGrid: data.rhythm,
            intervalMarkov: data.markov,
        };
    }

    const ARCHETYPES = {
        pop: withMelodicData("pop", {
            createInstrument: () =>
                new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.4 },
                }),
            baseVelocity: 0.6,
            baseCutoffHz: 2200,
            octaveOffset: 1, // sits an octave above root for a "lead" feel
        }),
        hiphop: withMelodicData("hiphop", {
            createInstrument: () =>
                new Tone.FMSynth({
                    harmonicity: 1.5,
                    modulationIndex: 3,
                    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
                }),
            baseVelocity: 0.55,
            baseCutoffHz: 1400,
            octaveOffset: 0,
        }),
        electronic: withMelodicData("electronic", {
            createInstrument: () =>
                new Tone.Synth({
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 },
                }),
            baseVelocity: 0.45,
            baseCutoffHz: 1000, // starts dark, LFO in synth-layer.js opens it up gradually
            octaveOffset: 1,
        }),
        rock: withMelodicData("rock", {
            createInstrument: () =>
                new Tone.Synth({
                    // deliberately CLEAN, not distorted -- energy comes from
                    // note density, not grit, per the "safe zone" design
                    oscillator: { type: "square" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.3 },
                }),
            baseVelocity: 0.55,
            baseCutoffHz: 1600,
            octaveOffset: -1,
        }),
        jazz: withMelodicData("jazz", {
            // FM synthesis tuned toward a Rhodes-ish bell tone, same
            // family as chord-timbres.js's jazz pad (slightly brighter
            // harmonicity/modulationIndex here so the lead still reads as
            // a distinct voice from the pad underneath it) -- was a plain
            // sine PolySynth with a slow attack and a long, sustained
            // release, which read as a breathy flute/pipe ensemble
            // instead of a struck keyboard. Envelope tightened to match:
            // fast attack (the mallet strike), decay down to a LOW
            // sustain (a Rhodes note fades hard after the initial hit,
            // it doesn't hold), short release -- not the airy hold the
            // old envelope had.
            createInstrument: () =>
                new Tone.FMSynth({
                    harmonicity: 3.5,
                    modulationIndex: 1.5,
                    envelope: { attack: 0.01, decay: 0.35, sustain: 0.15, release: 0.4 },
                }),
            baseVelocity: 0.4,
            baseCutoffHz: 1800, // pulled down slightly from 2000 -- warmer, rounder, less airy
            octaveOffset: 0, // was 1 (an octave above root) -- dropped an octave, see above
        }),
        folk: withMelodicData("folk", {
            createInstrument: () =>
                new Tone.AMSynth({
                    harmonicity: 1,
                    envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.6 },
                }),
            baseVelocity: 0.45,
            baseCutoffHz: 1700,
            octaveOffset: 0,
        }),
        // metal and rnb, added alongside funk/reggaeton once genre-engine.js
        // grew from 7 clusters to 11 -- see that file's header. Both have
        // real melodic-data.js coverage (metal: 197 LMD files, rnb: 323),
        // same footing as the six clusters above.
        metal: withMelodicData("metal", {
            createInstrument: () =>
                new Tone.Synth({
                    // clean, not distorted -- same "safe zone" restraint as
                    // the rock archetype above, just sharper/more aggressive
                    // in register and attack
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.005, decay: 0.12, sustain: 0.25, release: 0.25 },
                }),
            baseVelocity: 0.55,
            baseCutoffHz: 1900,
            octaveOffset: 1,
        }),
        rnb: withMelodicData("rnb", {
            createInstrument: () =>
                new Tone.AMSynth({
                    harmonicity: 1.5,
                    envelope: { attack: 0.05, decay: 0.4, sustain: 0.35, release: 1.2 },
                }),
            baseVelocity: 0.45,
            baseCutoffHz: 1500, // warmer/darker than the baseline -- smooth over bright
            octaveOffset: 0,
        }),
        // no equivalent genre tag in melodic-data.js's source taxonomy
        // (Tagtraum has no Funk or Reggaeton category) -- hand-authored,
        // same footing as indie/fallback below.
        //
        // funk: short, punchy, syncopated hits -- reads as a clav/rhythm-
        // guitar stab rather than a sustained lead, the same "percussive
        // lead" idea drum-kits.js/bass-timbres.js use elsewhere for funk.
        funk: {
            createInstrument: () =>
                new Tone.Synth({
                    oscillator: { type: "square" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.15 },
                }),
            degreePatternSeed: [0, 4, 7, 4, 0, 7, 4, 0], // pentatonic-ish bounce, "the one" emphasis
            rhythmGrid: [1,0,1,0, 0,1,0,1, 1,0,0,1, 0,1,0,0, 1,0,1,0, 0,1,0,1, 1,0,0,1, 0,1,0,0],
            baseVelocity: 0.5,
            baseCutoffHz: 2000,
            octaveOffset: 0,
        },
        // reggaeton: brighter, synth-stab character -- matches the
        // synth-lead/vocal-chop production reggaeton is built around, and
        // a rhythmGrid loosely echoing the dembow kick's 3+3+2 grouping
        // (see drum-patterns.js's reggaeton seeds) rather than a generic
        // on-the-beat pattern.
        reggaeton: {
            createInstrument: () =>
                new Tone.Synth({
                    oscillator: { type: "square" },
                    envelope: { attack: 0.01, decay: 0.15, sustain: 0.15, release: 0.2 },
                }),
            degreePatternSeed: [0, 2, 4, 0, 4, 2, 0, 4],
            rhythmGrid: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
            baseVelocity: 0.5,
            baseCutoffHz: 2100,
            octaveOffset: 1,
        },
        // no equivalent genre tag in melodic-data.js's source taxonomy --
        // kept hand-authored, unchanged from before that file existed
        indie: {
            createInstrument: () =>
                new Tone.AMSynth({
                    harmonicity: 2,
                    envelope: { attack: 0.02, decay: 0.4, sustain: 0.15, release: 1.0 },
                }),
            degreePatternSeed: [0, 2, 4, 7, 4, 2, 0, 4], // airy, felt-piano-ish
            rhythmGrid: [1,0,0,0, 1,0,1,0, 0,0,1,0, 1,0,0,0, 1,0,0,0, 1,0,1,0, 0,0,1,0, 1,0,0,0],
            baseVelocity: 0.5,
            baseCutoffHz: 1800,
            octaveOffset: 0,
        },
        // used when a genre matches nothing we recognize -- generic warm
        // pad so the pool never ends up short an instrument
        fallback: {
            createInstrument: () =>
                new Tone.Synth({
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.6, decay: 0.4, sustain: 0.6, release: 1.5 },
                }),
            degreePatternSeed: [0, 4, 7],
            rhythmGrid: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            baseVelocity: 0.4,
            baseCutoffHz: 1800,
            octaveOffset: 0,
        },
    };

    global.InstrumentArchetypes = ARCHETYPES;
})(window);
