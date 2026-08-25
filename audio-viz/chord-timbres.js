// chord-timbres.js
//
// Per-genre timbre for chord-layer.js's sustained pad -- the OTHER
// always-on, always-audible layer in every session (drum-kits.js is the
// first). Until now every session used the exact same PolySynth+sine
// pad regardless of genre; only the drum groove, melody rhythm/motion,
// bass rhythm/motion, arrangement, and tempo were genre-aware, while the
// two most foregrounded, constant textures in the mix -- this pad and
// the drum kit itself -- sounded identical across every genre. This
// file fixes the pad half of that gap.
//
// Same reasoning as instrument-archetypes.js/drum-kits.js for why this
// is hand-authored, not derived from a dataset: none of the MIDI/
// structural data used elsewhere in this project carries any
// information about actual instrument TIMBRE. Timbre design stays a
// hand-tuning exercise here, same split every other layer makes between
// "structure = real data" and "sound design = authored."
//
// -- strumPattern: guitar-genre clusters only ---------------------------
// Optional per-cluster field, consulted by chord-layer.js. Without it, a
// chord fires once per measure and rings for ~a full bar (a pad/comping
// instrument -- Rhodes, synth stab, sustained pad). With it, chord-layer.js
// re-strikes the SAME held chord multiple times within the measure, at
// the 16th-note steps this array marks non-zero (value = velocity accent,
// so a down-strum can hit harder than an up-strum) -- a real strummed
// rhythm instead of one sustained hit. Scoped to pop/rock/indie/folk
// only, the genres actually built around a strummed guitar in real
// music; every other cluster keeps the single-hit-per-measure pad
// behavior, which is the right sound for a keyboard/synth-stab/pad
// instrument, not a guitar.
//
// STRUM_CLASSIC is "D, D-U, U-D-U" -- down on 1, down on 2, up on the &
// of 2, up on the & of 3, down on 4, up on the & of 4 -- the single most
// common strum pattern in pop/rock/folk/country guitar playing (the one
// every beginner learns first). STRUM_FOLK is a steadier, simpler
// quarter-note down-strum, matching folk's plainer, more grounded
// acoustic character elsewhere in this project (see bass-timbres.js's
// folk entry) instead of the more syncopated pop/rock shape.
//
// Depends on: Tone.js being loaded on the page before this file

(function (global) {
    "use strict";

    const STRUM_CLASSIC = [1.0, 0, 0, 0, 1.0, 0, 0.8, 0, 0, 0, 0.8, 0, 1.0, 0, 0.8, 0];
    const STRUM_FOLK = [1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0, 1.0, 0, 0, 0];

    const CHORD_TIMBRES = {
        // Triangle for a little more harmonic content than a plain sine
        // (reads more like a clean strummed guitar/keys, less like a pure
        // synth pad), and a genuinely fast attack + strummed rhythm
        // instead of the 1.2s swell every session used to open with --
        // see strumPattern above. Decay/sustain pulled down to match: a
        // sustain of 0.7 would blur every strum in the pattern into one
        // wash instead of reading as distinct hits.
        pop: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.5 },
            }),
            baseCutoffHz: 1000,
            velocityMultiplier: 1.0,
            strumPattern: STRUM_CLASSIC,
        },
        // Triangle over sine (a little more harmonic content), a genuinely
        // fast attack for a real chord-CHOP feel -- the sampled-soul-loop
        // stab hip-hop production is built on -- rather than a slow swell
        // (0.6s here previously was still a swell, just a shorter one; a
        // chop needs to read as struck, not eased in), tightened release
        // to match, and a notably darker cutoff -- warmer, moodier,
        // neo-soul-adjacent.
        hiphop: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.02, decay: 0.5, sustain: 0.75, release: 1.0 },
            }),
            baseCutoffHz: 700,
            velocityMultiplier: 1.0,
        },
        // Detuned 3-voice unison sawtooth stack (Tone's built-in
        // "fatsawtooth" oscillator) -- the classic trance/house supersaw
        // pad. The single biggest timbral swing of the six real
        // clusters; nothing else here sounds remotely like it.
        electronic: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
                envelope: { attack: 1.5, decay: 0.5, sustain: 0.6, release: 2.2 },
            }),
            baseCutoffHz: 1400,
            velocityMultiplier: 1.05,
        },
        // Square wave for more edge/bite than a sine or triangle, and a
        // genuinely immediate attack -- power-chord-adjacent without
        // actually distorting, same restraint as instrument-archetypes.js's
        // rock lead and drum-kits.js's rock kit (clean, energy from
        // density/character, not grit). (0.6s here previously was still
        // a slow pad swell despite the "immediacy" the comment claimed --
        // a struck power chord doesn't ease in over half a second.)
        rock: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "square" },
                envelope: { attack: 0.03, decay: 0.3, sustain: 0.65, release: 0.8 },
            }),
            baseCutoffHz: 1100,
            velocityMultiplier: 1.05,
            strumPattern: STRUM_CLASSIC,
        },
        // FM synthesis tuned toward the classic Rhodes/electric-piano
        // bell-tone ratio (harmonicity ~3, low modulation index) instead
        // of a plain oscillator -- reads as an electric piano voicing the
        // chords, not a pad underneath them.
        jazz: {
            createInstrument: () => new Tone.PolySynth(Tone.FMSynth, {
                harmonicity: 3.01,
                modulationIndex: 1.2,
                envelope: { attack: 0.6, decay: 1.0, sustain: 0.4, release: 2.5 },
            }),
            baseCutoffHz: 900,
            velocityMultiplier: 0.9,
        },
        // Near-instant attack and a quick drop to low sustain -- reads as
        // struck/strummed rather than swelled-in, the opposite envelope
        // shape from every other cluster here (all slow-attack sustained
        // pads). The goal was an actual plucked-string voice
        // (Tone.PluckSynth's Karplus-Strong physical model would nail
        // this), but PluckSynth extends Instrument, not Monophonic, and
        // Tone.PolySynth in this Tone.js version only wraps Monophonic
        // voices -- wrapping it would throw at construction time, not a
        // safe bet for something every folk-dominant session hits. This
        // envelope-shaped triangle is the same "strummed, not sustained"
        // idea via a voice guaranteed to work inside PolySynth -- now with
        // an actual strum RHYTHM (STRUM_FOLK) instead of one hit per
        // measure, which is the last piece that was missing to make this
        // genuinely read as a strummed acoustic guitar.
        folk: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 1.2 },
            }),
            baseCutoffHz: 1600,
            velocityMultiplier: 1.0,
            strumPattern: STRUM_FOLK,
        },
        // AM synthesis -- pulled the attack way down from a 1.0s swell to
        // a strummable fast attack, decay/sustain brought down to match
        // (so individual strums stay distinct instead of blurring), and
        // added STRUM_CLASSIC. Slightly mellower harmonicity than before
        // now that it's read as a strummed instrument rather than a held
        // pad -- still the same hazy, lo-fi-adjacent aesthetic
        // instrument-archetypes.js's indie lead archetype uses, just
        // articulated as a strum instead of a swell.
        indie: {
            createInstrument: () => new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 1.3,
                envelope: { attack: 0.02, decay: 0.35, sustain: 0.3, release: 0.7 },
            }),
            baseCutoffHz: 1200,
            velocityMultiplier: 0.9,
            strumPattern: STRUM_CLASSIC,
        },
        // The four clusters added alongside genre-engine.js's 7->11 split
        // (see that file's header) -- same "hand-authored timbre" rule as
        // every other cluster in this file.
        //
        // Wider detuned unison than rock's plain square, and hit harder/
        // faster than rock's own (now-fixed) attack -- reads as a bank of
        // power chords slammed down at once, not eased in. Same
        // attack-vs-comment mismatch rock's entry had (0.4s claimed to be
        // a "sharper attack" but was still a slow pad swell); fixed here
        // too, and pushed even faster than rock's fix since metal should
        // read as more immediate, not less.
        metal: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "fatsawtooth", count: 2, spread: 15 },
                envelope: { attack: 0.015, decay: 0.3, sustain: 0.6, release: 0.6 },
            }),
            baseCutoffHz: 1300,
            velocityMultiplier: 1.1,
        },
        // Warm AM synthesis, softer/slower than jazz's FM Rhodes voicing --
        // reads as a neo-soul electric piano bed rather than a lead
        // instrument, sitting further back in the mix (darker cutoff).
        rnb: {
            createInstrument: () => new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 1.2,
                envelope: { attack: 0.8, decay: 0.8, sustain: 0.5, release: 2.2 },
            }),
            baseCutoffHz: 800,
            velocityMultiplier: 0.9,
        },
        // Short, punchy stabs instead of a sustained pad -- reads as
        // rhythm-guitar/clav chord hits, matching funk's whole "tight and
        // percussive, not sustained" character (see drum-kits.js/
        // bass-timbres.js's matching funk entries).
        funk: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "square" },
                envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: 0.3 },
            }),
            baseCutoffHz: 1500,
            velocityMultiplier: 1.0,
        },
        // Bright, punchy synth stabs -- matches the synth-hit-driven
        // production reggaeton is built around rather than a held pad.
        reggaeton: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "sawtooth" },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.35 },
            }),
            baseCutoffHz: 1700,
            velocityMultiplier: 1.0,
        },
        // Used to be `CHORD_TIMBRES.fallback = CHORD_TIMBRES.pop` -- pop
        // now has a fast attack and STRUM_CLASSIC, neither of which
        // belongs on the generic "nothing classified" fallback (there's
        // no real evidence the library is guitar music at all). Given its
        // own explicit entry instead: the ORIGINAL pop values, before any
        // of this session's changes -- plain sine, slow swell, no strum,
        // the least genre-marked pad this file has ever had.
        fallback: {
            createInstrument: () => new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "sine" },
                envelope: { attack: 1.2, decay: 0.4, sustain: 0.7, release: 2.0 },
            }),
            baseCutoffHz: 1000,
            velocityMultiplier: 1.0,
        },
    };

    function timbreFor(cluster) {
        return CHORD_TIMBRES[cluster] ?? CHORD_TIMBRES.fallback;
    }

    global.ChordTimbres = { timbreFor };
})(window);
