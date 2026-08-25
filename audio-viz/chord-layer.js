// chord-layer.js
//
// The one layer that's always present: voices the current mode's chord
// progression (chord-progressions.js), one CHORD per measure, four
// measures per loop -- WHICH chord never changes faster than once a
// measure. How that chord actually gets played, though, depends on
// chord-timbres.js's strumPattern: most clusters hold it once, like a
// sustained pad/comping keyboard; pop/rock/indie/folk re-strike it in a
// real strummed rhythm within the measure, like a guitar (see
// scheduleStep()/chord-timbres.js's header for the actual shapes). Every
// melodic layer from the genre pool (synth-layer.js) sits on top of this --
// it's the harmonic anchor, playing the same role a sustained pad plays
// under Eno-style generative pieces. Two deliberate differences from
// GenerativeLayer, both composed choices rather than oversights:
//
//   1. It's excluded from the scheduler's random add/remove cycle (see
//      soundscape-engine.js) -- losing the harmonic anchor mid-session
//      would leave the wandering melodic layers with no tonal center to
//      wander around, so it fades in once at the start and stays.
//   2. Its CHORD CHOICE is never wandered/mutated the way melodic degrees
//      are. A chord progression IS the piece's harmonic structure;
//      randomizing chord tones risks accidental dissonance against every
//      layer built in the same mode. The 4-bar loop itself, plus slow
//      filter/velocity drift and (for strummed clusters) the strum
//      rhythm itself, is enough movement for this layer.
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
// Depends on: Tone.js, music-theory.js, chord-progressions.js, chord-timbres.js

(function (global) {
    "use strict";

    const BASE_VELOCITY = 0.25;  // quieter than lead layers -- a bed, not a focal point
                                  // (0.4 * 10^(-4/20) ~= 0.25 -- pulled back ~4dB after listening)
                                  // multiplied by the timbre's own velocityMultiplier below, see chord-timbres.js
    const STEPS_PER_MEASURE = 16; // 16th-note steps per 4/4 measure, matches the "16n" scheduler tick
    const STRUM_HIT_DURATION = "8n"; // each individual strum's trigger duration -- see file header
    const MAX_STRUM_JITTER_SEC = 0.012; // a touch of per-strum timing humanization, same idea as bass/drum layers' jitter

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
        // onChordChange(rootDegreeIndex, modeName), if given, fires every
        // measure at the exact moment a new chord triggers -- lets
        // BassLayer stay harmonically locked to whatever chord is
        // currently sounding without this class needing to know BassLayer
        // exists (same decoupled-callback pattern as onKick in
        // drum-layer.js).
        // dominantCluster: picks WHICH genre's pad timbre this layer
        //   plays -- see chord-timbres.js. Same param DrumLayer already
        //   uses to pick its kit/pattern.
        constructor({ root, spotifyUserId, outputBus, onProgressionChange, onChordChange, dominantCluster }) {
            this.root = root;
            this.spotifyUserId = spotifyUserId;
            this.onProgressionChange = onProgressionChange;
            this.onChordChange = onChordChange;

            this.timbre = global.ChordTimbres.timbreFor(dominantCluster);
            this.instrument = this.timbre.createInstrument();
            this.filter = new Tone.Filter(this.timbre.baseCutoffHz, "lowpass");
            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up
            this.duckGain = new Tone.Gain(1); // sidechain duck lives here, kept separate from gainNode's fade automation
            this.instrument.chain(this.filter, this.gainNode, this.duckGain, outputBus);

            this.stepIndex = 0; // NEVER reset after this -- see file header
            this.measureIndex = 0; // which of the current progression's 4 chords we're on
            this.progression = null;
            this.appliedMode = null; // the mode actually governing what's playing right now
            this.pendingMode = null; // queued by scheduleStep noticing a mode change; applied at the next downbeat
            this.currentChordNotes = null; // this measure's voiced chord, computed once at the downbeat, reused by every strum hit within it (if this timbre strums at all)
            this.measureVelocity = 0;      // ditto -- the slow-drift base velocity for this measure, strum accents multiply on top of it
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

        // Fires one strike of the current measure's chord -- either the
        // single once-per-measure hold (accentMultiplier 1, duration ~a
        // full bar) or one hit of a strummed rhythm (accentMultiplier from
        // strumPattern, duration STRUM_HIT_DURATION). A little timing
        // jitter on strums only -- a single sustained pad hit doesn't need
        // humanizing, but a strum with none reads as a sequenced loop
        // instead of a played instrument.
        _triggerChord(time, accentMultiplier, duration, jitter) {
            const velocity = this.measureVelocity * accentMultiplier;
            this.instrument.triggerAttackRelease(this.currentChordNotes, duration, time + jitter, velocity);
        }

        // Called every 16th note by the scheduler, same call site as
        // GenerativeLayer.scheduleStep. The chord itself (which notes,
        // which root) is only ever decided on the measure downbeat (step
        // 0) -- what happens on every OTHER step within the measure
        // depends on this.timbre.strumPattern (chord-timbres.js):
        //   - no strumPattern (most clusters): nothing else happens, the
        //     one downbeat hit rings out under its own envelope release
        //     for the rest of the measure, same as this layer always did.
        //   - strumPattern set (pop/rock/indie/folk): every non-zero step
        //     in that 16-step array re-strikes the SAME held chord at that
        //     step's accent, so the measure plays as an actual strummed
        //     rhythm instead of one sustained hit -- see chord-timbres.js's
        //     header for the actual strum shapes.
        scheduleStep(time, modeName) {
            // mode changed (Shuffle) -- QUEUE it. Do not apply yet: see
            // file header for why this has to wait for a real downbeat.
            if (modeName !== this.appliedMode) {
                this.pendingMode = modeName;
            }

            const step = this.stepIndex % STEPS_PER_MEASURE;
            this.stepIndex++;

            if (step === 0) {
                if (this.pendingMode !== null) {
                    this._applyMode(this.pendingMode); // lands exactly on this real downbeat
                    this.pendingMode = null;
                }

                const rootDegreeIndex = this.progression.rootDegrees[this.measureIndex];
                this.currentChordNotes = this._voiceChord(rootDegreeIndex, this.appliedMode);
                this.onChordChange?.(rootDegreeIndex, this.appliedMode);

                this.measureVelocity = BASE_VELOCITY * this.timbre.velocityMultiplier * (0.7 + 0.3 * this._lfo(time, 65, this.phaseOffset));
                const cutoff = this.timbre.baseCutoffHz * (0.8 + 0.4 * this._lfo(time, 53, this.phaseOffset * 1.4));
                this.filter.frequency.rampTo(cutoff, 1.0);

                this.measureIndex = (this.measureIndex + 1) % this.progression.rootDegrees.length; // loop every 4 measures
            }

            const strumPattern = this.timbre.strumPattern;
            if (strumPattern) {
                const accent = strumPattern[step];
                if (!accent) return; // rest -- no strum on this 16th step
                const jitter = (Math.random() * 2 - 1) * MAX_STRUM_JITTER_SEC;
                this._triggerChord(time, accent, STRUM_HIT_DURATION, jitter);
            } else if (step === 0) {
                // no strum pattern for this cluster -- the original
                // behavior, one hold per measure, held just under a full
                // measure so there's a hair of space before the next
                // chord instead of a fully legato blur
                const chordDuration = Tone.Time("1m").toSeconds() * 0.92;
                this._triggerChord(time, 1, chordDuration, 0);
            }
        }
    }

    global.ChordLayer = ChordLayer;
})(window);
