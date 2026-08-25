// bass-timbres.js
//
// Per-genre timbre for bass-layer.js -- the third and last always-on,
// always-audible layer to get this treatment (drum-kits.js and
// chord-timbres.js were the first two). Until now every session used
// the exact same Tone.MonoSynth+triangle bass regardless of genre; only
// the RHYTHM/MOTION (melodic-data.js's real per-genre bass statistics)
// was genre-aware, while the actual bass SOUND -- arguably the single
// most identity-defining voice in a mix after drums -- was identical
// whether the dominant genre was electronic or folk.
//
// Same reasoning as the other two timbre files for why this is
// hand-authored rather than derived from a dataset: none of this
// project's data sources carry instrument-timbre information, only
// note/velocity/timing (melody, bass) or timestamp/label (arrangement)
// or BPM (tempo). Timbre design stays a hand-tuning exercise.
//
// Unlike chord-timbres.js, there's no PolySynth-compatibility question
// here -- BassLayer is a single monophonic voice playing one note at a
// time (no chord to voice), so every cluster below is free to pick
// whichever monophonic Tone.js instrument class actually fits: MonoSynth
// (built-in filterEnvelope, good for anything that wants an audible
// filter sweep per note -- 808 glide, acid squelch), or a plain Synth/
// FMSynth where a static filter is enough and a simpler voice reads more
// "upright"/plucked.
//
// Depends on: Tone.js being loaded on the page before this file

(function (global) {
    "use strict";

    const BASS_TIMBRES = {
        // Baseline -- exactly what every session used before this file
        // existed. Kept as the least genre-marked choice, reused
        // verbatim for fallback below.
        pop: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 },
                filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.3, baseFrequency: 200, octaves: 2 },
            }),
            baseCutoffHz: 500,
            filterQ: 1,
            velocityMultiplier: 1.0,
        },
        // Deep 808-style sub: sine core (rounder, less harmonic content
        // than triangle -- more low-end weight, less "buzz"), a slow
        // portamento so consecutive notes glide into each other instead
        // of stepping cleanly (the classic 808 slide), longer release so
        // the sub keeps ringing under the next hit.
        hiphop: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.6 },
                filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5, baseFrequency: 120, octaves: 1.5 },
                portamento: 0.05,
            }),
            baseCutoffHz: 350, // darker than the baseline -- sub-weight over presence
            filterQ: 1,
            velocityMultiplier: 1.05,
        },
        // Acid-house bass: sawtooth core (more harmonic content for the
        // filter to carve into) plus a resonant external filter (Q
        // pushed well above the baseline's 1) and an aggressive
        // filterEnvelope sweep -- the classic 303 squelch.
        electronic: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "sawtooth" },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2 },
                filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.2, release: 0.2, baseFrequency: 150, octaves: 4 },
                portamento: 0.02,
            }),
            baseCutoffHz: 450,
            filterQ: 5, // resonant peak -- the squelch
            velocityMultiplier: 1.0,
        },
        // Sawtooth/square-adjacent brightness and a fast attack for a
        // pick-like snap -- more midrange presence than any other kit
        // here, matching a real picked bass guitar over a fingerstyle or
        // synth one.
        rock: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "square" },
                envelope: { attack: 0.005, decay: 0.15, sustain: 0.35, release: 0.25 },
                filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.35, release: 0.25, baseFrequency: 250, octaves: 2.5 },
            }),
            baseCutoffHz: 750, // brighter -- more pick attack cuts through
            filterQ: 1.5,
            velocityMultiplier: 1.05,
        },
        // Plucked, not sustained: a plain sine Synth (no filterEnvelope
        // sweep to chase, just a static warm filter) with a short decay
        // straight down to near-zero sustain -- reads as an upright
        // bass's pluck-and-decay rather than a held synth note, the
        // opposite envelope shape from every sustained/glide-y kit above.
        jazz: {
            createInstrument: () => new Tone.Synth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.01, decay: 0.35, sustain: 0.05, release: 0.4 },
            }),
            baseCutoffHz: 400,
            filterQ: 1,
            velocityMultiplier: 0.85,
        },
        // Same plucked family as jazz (short decay, low sustain) but a
        // triangle core instead of sine -- a little more definition/pick
        // presence, reading as acoustic/fingerstyle bass guitar rather
        // than upright.
        folk: {
            createInstrument: () => new Tone.Synth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.35 },
            }),
            baseCutoffHz: 550,
            filterQ: 1,
            velocityMultiplier: 0.9,
        },
        // A notch softer/rounder than the baseline -- lower cutoff,
        // gentler velocity -- same "one notch mellower, not a different
        // voice" restraint indie gets in drum-kits.js/chord-timbres.js.
        indie: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.02, decay: 0.25, sustain: 0.35, release: 0.4 },
                filterEnvelope: { attack: 0.02, decay: 0.18, sustain: 0.25, release: 0.35, baseFrequency: 180, octaves: 1.8 },
            }),
            baseCutoffHz: 400,
            filterQ: 1,
            velocityMultiplier: 0.9,
        },
        // The four clusters added alongside genre-engine.js's 7->11 split
        // (see that file's header) -- same "hand-authored timbre" rule as
        // every other cluster in this file.
        //
        // Sawtooth for more harmonic content than the baseline triangle
        // (needs to cut through a dense mix), fast attack, brighter cutoff
        // than any other kit here -- a driving, present bass rather than
        // one that sits back.
        metal: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "sawtooth" },
                envelope: { attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.2 },
                filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.2, baseFrequency: 220, octaves: 2 },
            }),
            baseCutoffHz: 650,
            filterQ: 1.5,
            velocityMultiplier: 1.05,
        },
        // Smooth and round -- sine core with a slow portamento (notes
        // glide into each other, same idea as hiphop's 808 slide but
        // gentler), warm and sustained rather than punchy. (portamento
        // was 0.06 -- actually LONGER than hiphop's 0.05, the opposite of
        // "gentler" as claimed, though the gap was small enough to be
        // inaudible; 0.04 now genuinely undercuts hiphop's glide.)
        rnb: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.03, decay: 0.3, sustain: 0.6, release: 0.5 },
                filterEnvelope: { attack: 0.03, decay: 0.2, sustain: 0.5, release: 0.4, baseFrequency: 150, octaves: 1.5 },
                portamento: 0.04,
            }),
            baseCutoffHz: 380,
            filterQ: 1,
            velocityMultiplier: 0.95,
        },
        // The genre's signature: a bright, snappy filterEnvelope sweep on
        // a fast attack reads as the "pop" transient of slap bass, decaying
        // quick to a low sustain -- punchy and percussive, not sustained.
        funk: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.002, decay: 0.18, sustain: 0.15, release: 0.15 },
                filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.15, baseFrequency: 300, octaves: 3 },
            }),
            baseCutoffHz: 700,
            filterQ: 2,
            velocityMultiplier: 1.05,
        },
        // Deep sub, locked tight to the dembow kick pattern -- sine core
        // like hiphop's 808 but a faster attack/shorter release so
        // successive hits in the kick's fast 3+3+2 clusters stay
        // distinct instead of smearing together.
        reggaeton: {
            createInstrument: () => new Tone.MonoSynth({
                oscillator: { type: "sine" },
                envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.25 },
                filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.25, baseFrequency: 130, octaves: 1.5 },
            }),
            baseCutoffHz: 340,
            filterQ: 1,
            velocityMultiplier: 1.0,
        },
    };

    BASS_TIMBRES.fallback = BASS_TIMBRES.pop;

    function timbreFor(cluster) {
        return BASS_TIMBRES[cluster] ?? BASS_TIMBRES.fallback;
    }

    global.BassTimbres = { timbreFor };
})(window);
