// instrument-archetypes.js
//
// One archetype per genre cluster: which Tone.js instrument to build, and
// the fixed "seed" pattern (rhythm grid + scale-degree sequence) it plays.
// This is the ONLY place genre is allowed to influence timbre/instrumentation
// -- it never touches tempo, mode, or harmony (see music-theory.js), which
// is what keeps every possible output inside the "positive, mid-tempo"
// safe zone regardless of what's actually in someone's library.
//
// Depends on Tone.js being loaded on the page before this file.

(function (global) {
    "use strict";

    // Rhythm grids are 16th-note step patterns (1 = note on, 0 = rest)
    // over a 2-bar (32-step) loop at whatever tempo the Transport is set
    // to -- see soundscape-engine.js for the fixed 100-110 BPM range.
    const ARCHETYPES = {
        pop: {
            createInstrument: () =>
                new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.4 },
                }),
            degreePatternSeed: [0, 2, 4, 2, 0, 4, 2, 0], // bright, bouncy pluck line
            rhythmGrid: [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,0],
            baseVelocity: 0.6,
            baseCutoffHz: 2200,
            octaveOffset: 1, // sits an octave above root for a "lead" feel
        },
        hiphop: {
            createInstrument: () =>
                new Tone.FMSynth({
                    harmonicity: 1.5,
                    modulationIndex: 3,
                    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
                }),
            degreePatternSeed: [0, 0, 4, 3, 0, 0, 2, 0], // warm Rhodes-ish, laid back
            rhythmGrid: [1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,0,0],
            baseVelocity: 0.55,
            baseCutoffHz: 1400,
            octaveOffset: 0,
        },
        electronic: {
            createInstrument: () =>
                new Tone.Synth({
                    oscillator: { type: "sawtooth" },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 },
                }),
            degreePatternSeed: [0, 4, 7, 4, 2, 4, 7, 4], // filtered arp, needs the lowpass to tame the saw
            rhythmGrid: [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,0,1, 1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,0,1],
            baseVelocity: 0.45,
            baseCutoffHz: 1000, // starts dark, LFO in synth-layer.js opens it up gradually
            octaveOffset: 1,
        },
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
        rock: {
            createInstrument: () =>
                new Tone.Synth({
                    // deliberately CLEAN, not distorted -- energy comes from
                    // note density, not grit, per the "safe zone" design
                    oscillator: { type: "square" },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.3 },
                }),
            degreePatternSeed: [0, 0, 3, 0, 4, 0, 3, 0], // muted "power chord" root motion
            rhythmGrid: [1,0,1,0, 1,0,1,0, 1,0,1,1, 0,1,0,0, 1,0,1,0, 1,0,1,0, 1,0,1,1, 0,1,0,0],
            baseVelocity: 0.55,
            baseCutoffHz: 1600,
            octaveOffset: -1,
        },
        jazz: {
            createInstrument: () =>
                new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.4, decay: 0.6, sustain: 0.5, release: 2.0 },
                }),
            degreePatternSeed: [0, 4, 7, 9], // slow, spacious, string-pad-like
            rhythmGrid: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            baseVelocity: 0.4,
            baseCutoffHz: 2000,
            octaveOffset: 1,
        },
        folk: {
            createInstrument: () =>
                new Tone.AMSynth({
                    harmonicity: 1,
                    envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.6 },
                }),
            degreePatternSeed: [0, 2, 0, 4, 2, 0], // sparse, intimate, plucked
            rhythmGrid: [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
            baseVelocity: 0.45,
            baseCutoffHz: 1700,
            octaveOffset: 0,
        },
        fallback: {
            // used when a genre matches nothing we recognize -- generic warm
            // pad so the pool never ends up short an instrument
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
