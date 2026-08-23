// synth-layer.js
//
// One GenerativeLayer = one instrument voice from the pool, plus all the
// per-step variation logic that keeps a SINGLE layer interesting over a
// long listening session without it drifting into a different layer.
//
// Variation mechanisms, each on a different/non-aligned timescale so their
// combination never audibly loops (see design notes -- this is the same
// trick Reich-style phasing / Eno generative patches use):
//   - degree-pattern "wander": small random walk that's gravity-pulled
//     back toward the original seed pattern every step
//   - velocity "breathing" LFO (~70-90s period, phase offset per layer)
//   - filter cutoff LFO (~40-55s period, deliberately NOT a clean multiple
//     of the velocity LFO period, so they drift in and out of phase)
//   - rare octave accents
//   - tiny per-note timing jitter (humanization)
//
// Depends on: Tone.js, music-theory.js, instrument-archetypes.js

(function (global) {
    "use strict";

    const MAX_JITTER_SEC = 0.012; // +/- 12ms of humanized timing
    const OCTAVE_ACCENT_CHANCE = 0.1;
    const WANDER_CHANCE = 0.18;
    const WANDER_GRAVITY = 0.6; // 0 = never returns to seed, 1 = snaps back instantly

    let nextLayerId = 0;

    class GenerativeLayer {
        // cluster: genre cluster name, e.g. "indie" (see genre-engine.js)
        // root: MIDI root note for the whole soundscape (see music-theory.js)
        // outputBus: a Tone.js node to connect this layer's output into
        //   (main.js wires this to a shared limiter -> analyser -> destination
        //   chain, so every layer feeds the same visualizer/limiter)
        constructor({ cluster, root, outputBus }) {
            this.id = nextLayerId++;
            this.cluster = cluster;
            this.root = root;

            const archetype = global.InstrumentArchetypes[cluster] ?? global.InstrumentArchetypes.fallback;
            this.archetype = archetype;

            this.instrument = archetype.createInstrument();
            this.filter = new Tone.Filter(archetype.baseCutoffHz, "lowpass");
            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up
            this.instrument.chain(this.filter, this.gainNode, outputBus);

            // seed pattern is never mutated in place -- `wanderedDegrees` is
            // the live, drifting copy; `degreePatternSeed` is gravity's target
            this.degreePatternSeed = archetype.degreePatternSeed;
            this.wanderedDegrees = archetype.degreePatternSeed.slice();
            this.rhythmGrid = archetype.rhythmGrid;
            this.stepIndex = 0;

            // random (not hash-derived -- this only needs to decorrelate
            // layers from each other, it's not part of anyone's "signature")
            // phase offsets so layers don't all breathe/filter-sweep in sync
            this.velocityPhase = Math.random() * Math.PI * 2;
            this.filterPhase = Math.random() * Math.PI * 2;

            this.active = false;
        }

        // Ramp gain 0 -> 1 over `seconds`. Called by the scheduler when this
        // layer is chosen to enter the mix.
        fadeIn(seconds) {
            this.active = true;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(1, seconds);
        }

        // Ramp gain 1 -> 0 over `seconds`; caller is responsible for marking
        // the layer inactive/disposable once the ramp has finished.
        fadeOut(seconds) {
            this.active = false;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(0, seconds);
        }

        dispose() {
            this.instrument.dispose();
            this.filter.dispose();
            this.gainNode.dispose();
        }

        // Slow sine LFO, 0..1 range, independent period/phase per layer.
        _lfo(time, periodSec, phase) {
            return 0.5 + 0.5 * Math.sin((time / periodSec) * Math.PI * 2 + phase);
        }

        // Called once per 16th-note step by the scheduler (see
        // soundscape-engine.js). `time` is the Tone.js audio-clock time to
        // schedule this step's note at; `modeName` is the CURRENT mode,
        // which may have changed since the layer was created (shuffle only
        // ever changes this -- everything else about the layer is untouched).
        scheduleStep(time, modeName) {
            const step = this.stepIndex % this.rhythmGrid.length;
            this.stepIndex++;

            if (this.rhythmGrid[step] !== 1) return; // rest step, nothing to trigger

            const seedDegree = this.degreePatternSeed[step % this.degreePatternSeed.length];
            const priorDegree = this.wanderedDegrees[step % this.wanderedDegrees.length];

            // random walk, gravity-biased back toward the seed so the layer
            // never drifts into being unrecognizable over a long session
            let degree = priorDegree;
            if (Math.random() < WANDER_CHANCE) {
                const nudge = Math.random() < 0.5 ? -1 : 1;
                const wandered = priorDegree + nudge;
                // blend the wandered value with the seed by gravity -- keeps
                // the walk bounded without a hard clamp
                degree = Math.round(wandered * (1 - WANDER_GRAVITY) + seedDegree * WANDER_GRAVITY);
            }
            this.wanderedDegrees[step % this.wanderedDegrees.length] = degree;

            const octaveAccent = Math.random() < OCTAVE_ACCENT_CHANCE ? (Math.random() < 0.5 ? 12 : -12) : 0;
            const layerRoot = this.root + this.archetype.octaveOffset * 12;
            const midiNote = global.MusicTheory.degreeToNote(degree, modeName, layerRoot) + octaveAccent;
            const noteName = Tone.Frequency(midiNote, "midi").toNote();

            // breathing velocity + drifting filter cutoff, decorrelated
            // periods/phases so the two never lock into an obvious cycle
            const velocity = this.archetype.baseVelocity * (0.6 + 0.4 * this._lfo(time, 80, this.velocityPhase));
            const cutoff = this.archetype.baseCutoffHz * (0.7 + 0.6 * this._lfo(time, 47, this.filterPhase));
            this.filter.frequency.rampTo(cutoff, 0.5);

            const jitter = (Math.random() * 2 - 1) * MAX_JITTER_SEC;
            this.instrument.triggerAttackRelease(noteName, "8n", time + jitter, velocity);
        }
    }

    global.GenerativeLayer = GenerativeLayer;
})(window);
