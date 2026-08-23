// chord-layer.js
//
// The one layer that's always present: a slow pad voicing the current
// mode's chord progression (chord-progressions.js), one chord per
// measure, four measures per loop. Every melodic layer from the genre
// pool (synth-layer.js) sits on top of this -- it's the harmonic anchor,
// playing the same role a sustained pad plays under Eno-style generative
// pieces. Two deliberate differences from GenerativeLayer, both composed
// choices rather than oversights:
//
//   1. It's excluded from the scheduler's random add/remove cycle (see
//      soundscape-engine.js) -- losing the harmonic anchor mid-session
//      would leave the wandering melodic layers with no tonal center to
//      wander around, so it fades in once at the start and stays.
//   2. Its notes are never wandered/mutated the way melodic degrees are.
//      A chord progression IS the piece's harmonic structure; randomizing
//      chord tones risks accidental dissonance against every layer built
//      in the same mode. The 4-bar loop itself, plus slow filter/velocity
//      drift, is enough movement for a background pad.
//
// Sidechain-ducks off the kick (see duck()): the Web Audio API has no
// real sidechain/key-input on its native compressor, so the classic
// "pump" is emulated instead -- a dedicated gain stage (separate from the
// fade in/out gainNode, so the two automations never fight over the same
// AudioParam) that dips fast and recovers on a timed envelope every time
// DrumLayer's kick actually fires. DrumLayer has no idea this layer
// exists; SoundscapeEngine wires its onKick callback to this.duck().
//
// Progression choice is deterministic per (user, mode) -- same hashing
// trick as MusicTheory.pickRootNote -- so a given visitor always hears
// the same progression for a given mode, but Shuffle-ing to a new mode
// reveals a genuinely different one, still "theirs."
//
// A mode change from Shuffle is QUEUED and only actually applied at this
// layer's own next real downbeat -- `stepIndex` below is never reset, so
// it stays anchored to the actual Transport bar grid for the entire
// session. That's what keeps this in sync with DrumLayer, which uses the
// identical never-reset-stepIndex + deferred-swap pattern for the same
// reason (see drum-layer.js): both layers' downbeats land on the exact
// same real bar boundary, forever, since neither one's counter ever jumps.
// Earlier versions reset stepIndex to 0 on a mode change and treated that
// as an immediate downbeat -- which fired the chord change on whatever
// arbitrary tick Shuffle was clicked on, then permanently offset this
// layer's downbeat grid from DrumLayer's. Don't reintroduce that.
//
// Depends on: Tone.js, music-theory.js, chord-progressions.js

(function (global) {
    "use strict";

    const BASE_CUTOFF_HZ = 1000; // darker than lead archetypes (1400-2200Hz) -- sits underneath, not on top
    const BASE_VELOCITY = 0.4;   // quieter than lead layers -- a bed, not a focal point
    const STEPS_PER_MEASURE = 16; // 16th-note steps per 4/4 measure, matches the "16n" scheduler tick

    // Sidechain duck shape -- the three knobs to tune later.
    const DUCK_DEPTH = 0.35;      // fraction of gain pulled out at full kick velocity (0 = no duck, 1 = full mute)
    const DUCK_ATTACK_SEC = 0.02; // fast -- the dip should read as tight to the kick, not a slow fade
    const DUCK_RELEASE_SEC = 0.28; // recovery back to unity; on closely-spaced kicks the next hit retriggers before full recovery, which is expected

    class ChordLayer {
        // onProgressionChange(progression), if given, fires every time the
        // active progression changes (initial pick AND every mode change
        // from Shuffle) -- the correct way to sync a UI label to this
        // without guessing at timing: this only actually changes on a real
        // Transport tick, up to a 16th note after Shuffle is clicked, so
        // a fixed setTimeout in the caller would be a race. An event isn't.
        constructor({ root, spotifyUserId, outputBus, onProgressionChange }) {
            this.root = root;
            this.spotifyUserId = spotifyUserId;
            this.onProgressionChange = onProgressionChange;

            this.instrument = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "sine" },
                envelope: { attack: 1.2, decay: 0.4, sustain: 0.7, release: 2.0 }, // slow pad envelope
            });
            this.filter = new Tone.Filter(BASE_CUTOFF_HZ, "lowpass");
            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up
            this.duckGain = new Tone.Gain(1); // sidechain duck lives here, kept separate from gainNode's fade automation
            this.instrument.chain(this.filter, this.gainNode, this.duckGain, outputBus);

            this.stepIndex = 0; // NEVER reset after this -- see file header
            this.measureIndex = 0; // which of the current progression's 4 chords we're on
            this.progression = null;
            this.appliedMode = null; // the mode actually governing what's playing right now
            this.pendingMode = null; // queued by scheduleStep noticing a mode change; applied at the next downbeat
            this._applyMode(global.MusicTheory.DEFAULT_MODE); // initial pick, safe to apply immediately -- Transport hasn't started yet

            // random, not hash-derived -- only needs to decorrelate this
            // layer's slow filter/velocity drift from the melodic layers',
            // not part of anyone's "signature"
            this.phaseOffset = Math.random() * Math.PI * 2;

            this.active = false;
        }

        fadeIn(seconds) {
            this.active = true;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(1, seconds);
        }

        fadeOut(seconds) {
            this.active = false;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(0, seconds);
        }

        dispose() {
            this.instrument.dispose();
            this.filter.dispose();
            this.gainNode.dispose();
            this.duckGain.dispose();
        }

        _lfo(time, periodSec, phase) {
            return 0.5 + 0.5 * Math.sin((time / periodSec) * Math.PI * 2 + phase);
        }

        // Sidechain duck. Called by SoundscapeEngine at the exact scheduled
        // time of every kick hit (see soundscape-engine.js's onKick wiring).
        // `cancelAndHoldAtTime` (not a plain cancelScheduledValues) is what
        // makes this safe to retrigger on closely-spaced kicks -- it grabs
        // whatever the gain curve's actual value is at `time` and starts
        // the new ramp from there, instead of jumping discontinuously back
        // to 1 first, which would click.
        duck(time, kickVelocity = 1) {
            const gain = this.duckGain.gain;
            const dipTo = 1 - DUCK_DEPTH * Math.min(1, kickVelocity);
            gain.cancelAndHoldAtTime(time);
            gain.linearRampToValueAtTime(dipTo, time + DUCK_ATTACK_SEC);
            gain.linearRampToValueAtTime(1, time + DUCK_ATTACK_SEC + DUCK_RELEASE_SEC);
        }

        // Picks that mode's deterministic progression and restarts it from
        // its first chord. Only ever called from scheduleStep() at a real
        // downbeat (step 0) -- see there -- except the very first call from
        // the constructor, which is fine since Transport hasn't started yet.
        _applyMode(modeName) {
            const progressions = global.ChordProgressions.CHORD_PROGRESSIONS[modeName];
            const pick = global.MusicTheory.fnv1aHash(this.spotifyUserId + modeName) % progressions.length;
            this.progression = progressions[pick];
            this.appliedMode = modeName;
            this.measureIndex = 0;
            this.onProgressionChange?.(this.progression);
        }

        // Turns the 3 stacked chord tones from ChordProgressions.realizeChord
        // into a 4-note open-position pad voicing: the lowest tone dropped
        // an octave for a clear bass anchor, the root doubled an octave up
        // on top for shimmer/fullness. Spreads every chord over ~2.5
        // octaves regardless of which scale degree it's rooted on, which
        // is what keeps close-position stacked thirds from turning into mud
        // once they're sustained under everything else for a full measure.
        _voiceChord(rootDegreeIndex, modeName) {
            const raw = global.ChordProgressions.realizeChord(rootDegreeIndex, modeName, this.root);
            const bass = raw[0] - 12;
            const topDouble = raw[0] + 12;
            return [bass, raw[1], raw[2], topDouble].map((midi) => Tone.Frequency(midi, "midi").toNote());
        }

        // Called every 16th note by the scheduler, same call site as
        // GenerativeLayer.scheduleStep -- but this layer only actually
        // triggers a note on measure downbeats (every 16 steps); the rest
        // of the time the current chord is simply still ringing out under
        // its own envelope release.
        scheduleStep(time, modeName) {
            // mode changed (Shuffle) -- QUEUE it. Do not apply yet: see
            // file header for why this has to wait for a real downbeat.
            if (modeName !== this.appliedMode) {
                this.pendingMode = modeName;
            }

            const step = this.stepIndex % STEPS_PER_MEASURE;
            this.stepIndex++;
            if (step !== 0) return; // not a downbeat -- current chord just keeps ringing

            if (this.pendingMode !== null) {
                this._applyMode(this.pendingMode); // lands exactly on this real downbeat
                this.pendingMode = null;
            }

            const rootDegreeIndex = this.progression.rootDegrees[this.measureIndex];
            const notes = this._voiceChord(rootDegreeIndex, this.appliedMode);

            const velocity = BASE_VELOCITY * (0.7 + 0.3 * this._lfo(time, 65, this.phaseOffset));
            const cutoff = BASE_CUTOFF_HZ * (0.8 + 0.4 * this._lfo(time, 53, this.phaseOffset * 1.4));
            this.filter.frequency.rampTo(cutoff, 1.0);

            // held just under a full measure so there's a hair of space
            // before the next chord instead of a fully legato blur
            const chordDuration = Tone.Time("1m").toSeconds() * 0.92;
            this.instrument.triggerAttackRelease(notes, chordDuration, time, velocity);

            this.measureIndex = (this.measureIndex + 1) % this.progression.rootDegrees.length; // loop every 4 measures
        }
    }

    global.ChordLayer = ChordLayer;
})(window);
