// drum-kits.js
//
// Per-genre drum SYNTHESIS -- as opposed to drum-patterns.js, which is
// per-genre RHYTHM. Until now every session used the exact same seven
// Tone.js voices (identical envelopes, pitches, filters) regardless of
// dominant genre; only WHEN they hit differed. An electronic session and
// a folk session were playing different grooves on a physically
// identical kit. This file gives each cluster its own kit instead, the
// other half of "characteristic of the genre" alongside chord-timbres.js.
//
// Same reasoning as instrument-archetypes.js/chord-timbres.js for why
// this is hand-authored rather than derived from a dataset: Groove MIDI
// Dataset (the real data behind drum-patterns.js) captures note/velocity/
// timing, not the actual drum SOUND -- there's no acoustic model or
// soundfont attached to any of this project's data sources. Timbre stays
// a hand-tuning exercise, same split every other layer in this project
// makes between "structure = real data" and "sound design = authored."
//
// -- The one structural fix bundled in here: real cymbal data got a real
//    cymbal voice ------------------------------------------------------
// drum-patterns.js's NOTE_TO_VOICE routes any GM drum note it doesn't
// recognize (ride, crash, cowbell, tambourine...) into "perc" -- for the
// six GMD-derived clusters (pop/hiphop/rock/jazz/funk/rnb), that's real
// drummers' actual cymbal/percussion playing, not a hand-authored accent.
// Checking the extracted data confirms it: pop/hiphop/rock/funk/rnb's
// perc patterns are dense, continuous 8th-note grids, essentially the
// same shape as jazz's ride -- not sparse occasional hits. All six kits
// give perc `type: "metal"` (a second MetalSynth, warmer/washier than
// the hihats, tuned per kit -- crashier for rock, tighter for funk,
// smoother for rnb) instead of filtered noise, which is the right
// character for a pitched, ringing cymbal, not a shaker/rim-click.
// Every hand-authored kit (electronic/indie/folk/fallback/metal/
// reggaeton) keeps perc as filtered noise -- for those, perc genuinely
// IS meant as a sparse accent, no data mismatch to fix.
//
// Depends on: nothing (pure data). Read by drum-layer.js, which builds
// the actual Tone.js voices from whichever kit dominantCluster picks.

(function (global) {
    "use strict";

    const DRUM_KITS = {
        // Baseline kit -- the values every voice used unconditionally
        // before this file existed. Kept as pop's kit essentially
        // unchanged (clean, radio-ready, the least genre-marked choice)
        // and reused verbatim for fallback below.
        pop: {
            kick: { note: "C1", pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 1800, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.15, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.3, release: 0.1 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 },
            tomLow: { note: "G2", pitchDecay: 0.08, octaves: 4, envelope: { attack: 0.001, decay: 0.25, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.08, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            // real crash/cymbal content (see file header), not a
            // noise-filtered accent -- a genuine MetalSynth, same fix
            // jazz's ride got, tuned brighter/tighter to match pop's
            // clean overall character
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.5, release: 0.2 }, harmonicity: 5, modulationIndex: 20, resonance: 3800, octaves: 1.5, triggerDuration: "8n" },
            velocities: { kick: 0.9, snare: 0.75, hihatClosed: 0.35, hihatOpen: 0.3, tomLow: 0.7, tomHigh: 0.6, perc: 0.45 },
        },
        // Deep, sustained low end (longer pitchDecay/more octaves = more
        // 808-style glide, longer decay = more boom) and a tight, snappy
        // snare/hats -- trap/boom-bap's low end carries the track, so it
        // sits louder (kick velocity 1.0) than any other kit here.
        hiphop: {
            kick: { note: "A0", pitchDecay: 0.12, octaves: 8, envelope: { attack: 0.001, decay: 0.45, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2200, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.12, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.04, release: 0.01 }, harmonicity: 5.1, modulationIndex: 28, resonance: 4200, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.18, release: 0.08 }, harmonicity: 5.1, modulationIndex: 28, resonance: 4200, octaves: 1.5 },
            tomLow: { note: "F2", pitchDecay: 0.09, octaves: 5, envelope: { attack: 0.001, decay: 0.28, sustain: 0 } },
            tomHigh: { note: "A2", pitchDecay: 0.09, octaves: 5, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } },
            // real cymbal content, not a noise-filtered accent -- same
            // fix as pop/jazz, tuned darker/moodier to match the rest of
            // this kit
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.5, release: 0.2 }, harmonicity: 4.5, modulationIndex: 18, resonance: 3500, octaves: 1.5, triggerDuration: "8n" },
            velocities: { kick: 1.0, snare: 0.8, hihatClosed: 0.3, hihatOpen: 0.25, tomLow: 0.6, tomHigh: 0.5, perc: 0.4 },
        },
        // 909-style: fast pitchDecay for a clicky attack transient, fewer
        // octaves for tightness over boom (a club kick needs to sit in a
        // narrow band, not sprawl), bright/higher-resonance hats for that
        // digital edge.
        electronic: {
            kick: { note: "C1", pitchDecay: 0.035, octaves: 5, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2400, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.1, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.045, release: 0.01 }, harmonicity: 6.5, modulationIndex: 40, resonance: 4500, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.28, release: 0.1 }, harmonicity: 6.5, modulationIndex: 40, resonance: 4500, octaves: 1.5 },
            tomLow: { note: "G2", pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } },
            perc: { type: "noise", noiseType: "white", filterFreq: 3500, filterType: "highpass", envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, triggerDuration: "32n" },
            velocities: { kick: 1.0, snare: 0.8, hihatClosed: 0.4, hihatOpen: 0.35, tomLow: 0.6, tomHigh: 0.55, perc: 0.5 },
        },
        // Bigger and longer across the board -- more low-end sustain on
        // the kick, more resonant crack on the snare, punchier toms (rock
        // arrangements lean on toms harder in buildup/bSection than most
        // other genres here) -- everything hits harder (highest snare
        // velocity of any kit) without adding actual distortion, matching
        // instrument-archetypes.js's rock entry's own "clean, not
        // distorted -- energy from density not grit" restraint.
        rock: {
            kick: { note: "B0", pitchDecay: 0.06, octaves: 7, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2000, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.055, release: 0.015 }, harmonicity: 5.5, modulationIndex: 34, resonance: 4100, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.32, release: 0.12 }, harmonicity: 5.5, modulationIndex: 34, resonance: 4100, octaves: 1.5 },
            tomLow: { note: "F2", pitchDecay: 0.09, octaves: 5, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } },
            tomHigh: { note: "B2", pitchDecay: 0.09, octaves: 5, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } },
            // real cymbal content, not a noise-filtered accent -- same
            // fix as pop/hiphop/jazz, tuned for a bigger, longer
            // crash-like wash to match this kit's "bigger and longer
            // across the board" character
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.6, release: 0.25 }, harmonicity: 5, modulationIndex: 22, resonance: 3900, octaves: 1.6, triggerDuration: "8n" },
            velocities: { kick: 0.95, snare: 0.85, hihatClosed: 0.4, hihatOpen: 0.35, tomLow: 0.75, tomHigh: 0.65, perc: 0.4 },
        },
        // Softer and shorter across the board (a brushed kit sits back,
        // it doesn't punch), pink noise instead of white for the snare
        // (warmer, less harsh -- reads as brushes, not a hard hit) --
        // and perc becomes a genuine ride cymbal, see file header.
        jazz: {
            kick: { note: "C1", pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } },
            snare: { noiseType: "pink", filterFreq: 1200, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.1, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.06, release: 0.03 }, harmonicity: 4.5, modulationIndex: 20, resonance: 3600, octaves: 1.2 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.3, release: 0.15 }, harmonicity: 4.5, modulationIndex: 20, resonance: 3600, octaves: 1.2 },
            tomLow: { note: "G2", pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } },
            // ride cymbal, not a noise-filtered accent -- warmer/washier
            // than the hihats (lower harmonicity/modulationIndex), long
            // decay+release so it genuinely rings and overlaps the next
            // hit, the way a real ride does
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.8, release: 0.3 }, harmonicity: 3.5, modulationIndex: 12, resonance: 3000, octaves: 2, triggerDuration: "8n" },
            velocities: { kick: 0.55, snare: 0.5, hihatClosed: 0.3, hihatOpen: 0.25, tomLow: 0.5, tomHigh: 0.45, perc: 0.55 },
        },
        // Woody and organic: kick reads more like a foot-stomp (short,
        // less low-end sweep) than a boomy kick drum, snare reads more
        // like a hand-clap (pink noise, narrow low-mid band) than a
        // snare drum -- matches drum-patterns.js's own hand-authored folk
        // seeds, which were already built around stomp/clap in the
        // pattern data; this just makes the SOUND match that intent too.
        folk: {
            kick: { note: "D1", pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            snare: { noiseType: "pink", filterFreq: 1500, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.09, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.05, release: 0.02 }, harmonicity: 4.0, modulationIndex: 18, resonance: 3400, octaves: 1.2 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.22, release: 0.08 }, harmonicity: 4.0, modulationIndex: 18, resonance: 3400, octaves: 1.2 },
            tomLow: { note: "A2", pitchDecay: 0.05, octaves: 3, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            tomHigh: { note: "D3", pitchDecay: 0.05, octaves: 3, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } },
            perc: { type: "noise", noiseType: "pink", filterFreq: 2600, filterType: "highpass", envelope: { attack: 0.001, decay: 0.07, sustain: 0 }, triggerDuration: "32n" },
            velocities: { kick: 0.75, snare: 0.6, hihatClosed: 0.3, hihatOpen: 0.25, tomLow: 0.55, tomHigh: 0.5, perc: 0.4 },
        },
        // A notch duller/softer than pop everywhere (lower snare/perc
        // filter cutoffs, gentler velocities) -- reads as a slightly
        // hazier, more bedroom-recorded kit without reaching for an
        // actual lo-fi/bitcrush effect (out of scope here, see
        // instrument-archetypes.js's matching indie entry for the same
        // "one notch softer, not a different effect chain" restraint).
        indie: {
            kick: { note: "C1", pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.28, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 1400, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.14, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.05, release: 0.015 }, harmonicity: 4.5, modulationIndex: 26, resonance: 3800, octaves: 1.4 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.26, release: 0.1 }, harmonicity: 4.5, modulationIndex: 26, resonance: 3800, octaves: 1.4 },
            tomLow: { note: "G2", pitchDecay: 0.07, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.07, octaves: 4, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } },
            perc: { type: "noise", noiseType: "white", filterFreq: 2600, filterType: "highpass", envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, triggerDuration: "32n" },
            velocities: { kick: 0.8, snare: 0.65, hihatClosed: 0.3, hihatOpen: 0.25, tomLow: 0.6, tomHigh: 0.55, perc: 0.4 },
        },
        // The four clusters added alongside genre-engine.js's 7->11 split
        // (see that file's header). Timbre here is hand-authored the same
        // way every other kit in this file is -- see file header -- real
        // per-genre data only ever drives drum-patterns.js's RHYTHM.
        //
        // Hardest-hitting kit here: fast pitchDecay for a sharp click
        // transient layered over real low-end (metal kicks are almost
        // always sample-triggered for exactly this attack+sub combo),
        // the highest snare velocity of any kit, and the widest/most
        // resonant snare band for maximum crack.
        metal: {
            kick: { note: "B0", pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2200, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.16, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.045, release: 0.01 }, harmonicity: 6, modulationIndex: 36, resonance: 4300, octaves: 1.6 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.28, release: 0.1 }, harmonicity: 6, modulationIndex: 36, resonance: 4300, octaves: 1.6 },
            tomLow: { note: "E2", pitchDecay: 0.08, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } },
            tomHigh: { note: "A2", pitchDecay: 0.08, octaves: 6, envelope: { attack: 0.001, decay: 0.24, sustain: 0 } },
            perc: { type: "noise", noiseType: "white", filterFreq: 3000, filterType: "highpass", envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, triggerDuration: "32n" },
            velocities: { kick: 1.0, snare: 0.9, hihatClosed: 0.4, hihatOpen: 0.35, tomLow: 0.75, tomHigh: 0.65, perc: 0.4 },
        },
        // Softest, smoothest kit -- rounder kick (fewer octaves, no sharp
        // click), pink noise snare with a low, narrow band for a snap
        // that stays warm rather than cracking, gentle hats.
        rnb: {
            kick: { note: "C1", pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } },
            snare: { noiseType: "pink", filterFreq: 1600, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.13, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.055, release: 0.02 }, harmonicity: 4.2, modulationIndex: 22, resonance: 3600, octaves: 1.3 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.26, release: 0.1 }, harmonicity: 4.2, modulationIndex: 22, resonance: 3600, octaves: 1.3 },
            tomLow: { note: "F2", pitchDecay: 0.07, octaves: 4, envelope: { attack: 0.001, decay: 0.24, sustain: 0 } },
            tomHigh: { note: "A2", pitchDecay: 0.07, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            // real cymbal content, not a noise-filtered accent -- same
            // fix as pop/hiphop/rock/jazz, tuned warm/soft to match this
            // kit's smoother overall character
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.5, release: 0.2 }, harmonicity: 4, modulationIndex: 16, resonance: 3200, octaves: 1.3, triggerDuration: "8n" },
            velocities: { kick: 0.75, snare: 0.65, hihatClosed: 0.3, hihatOpen: 0.25, tomLow: 0.55, tomHigh: 0.5, perc: 0.4 },
        },
        // Tight and punchy -- short, snappy kick and snare (funk lives on
        // tight, dry hits, not sustain), bright hats for that "chick"
        // texture funk rhythm guitar/hats are known for.
        funk: {
            kick: { note: "C1", pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2000, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.1, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.04, release: 0.01 }, harmonicity: 5.5, modulationIndex: 30, resonance: 4200, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.2, release: 0.08 }, harmonicity: 5.5, modulationIndex: 30, resonance: 4200, octaves: 1.5 },
            tomLow: { note: "G2", pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } },
            // real cymbal content, not a noise-filtered accent -- same
            // fix as pop/hiphop/rock/jazz, kept tighter/shorter than the
            // others to match this kit's "tight and punchy, not
            // sustained" character
            perc: { type: "metal", envelope: { attack: 0.001, decay: 0.35, release: 0.15 }, harmonicity: 5.5, modulationIndex: 24, resonance: 4000, octaves: 1.4, triggerDuration: "8n" },
            velocities: { kick: 0.85, snare: 0.75, hihatClosed: 0.4, hihatOpen: 0.35, tomLow: 0.6, tomHigh: 0.55, perc: 0.45 },
        },
        // Kick decay kept SHORT on purpose -- the dembow pattern
        // (drum-patterns.js) fires the kick in fast triplet-ish clusters
        // (3+3+2), and a longer decay would blur those hits into mud.
        // Snare/rim bright and short for the "chk" accent that
        // punctuates the riddim.
        reggaeton: {
            kick: { note: "C1", pitchDecay: 0.03, octaves: 5, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } },
            snare: { noiseType: "white", filterFreq: 2400, filterType: "bandpass", envelope: { attack: 0.001, decay: 0.09, sustain: 0 } },
            hihatClosed: { envelope: { attack: 0.001, decay: 0.045, release: 0.01 }, harmonicity: 5.8, modulationIndex: 34, resonance: 4300, octaves: 1.5 },
            hihatOpen: { envelope: { attack: 0.001, decay: 0.22, release: 0.09 }, harmonicity: 5.8, modulationIndex: 34, resonance: 4300, octaves: 1.5 },
            tomLow: { note: "G2", pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } },
            tomHigh: { note: "C3", pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } },
            perc: { type: "noise", noiseType: "white", filterFreq: 3300, filterType: "highpass", envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, triggerDuration: "32n" },
            velocities: { kick: 0.95, snare: 0.75, hihatClosed: 0.4, hihatOpen: 0.35, tomLow: 0.55, tomHigh: 0.5, perc: 0.45 },
        },
    };

    // used when a dominant cluster doesn't classify into any named kit --
    // identical to pop's, the least genre-marked/safest option, same
    // reasoning as every other fallback in this project
    DRUM_KITS.fallback = DRUM_KITS.pop;

    function kitFor(cluster) {
        return DRUM_KITS[cluster] ?? DRUM_KITS.fallback;
    }

    global.DrumKits = { kitFor };
})(window);
