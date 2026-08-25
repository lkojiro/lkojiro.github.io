// bass-layer.js
//
// The harmonic anchor's foundation: a bass voice locked to whatever chord
// ChordLayer is currently sounding, not to the wandering melodic mode the
// way GenerativeLayer is. This didn't exist at all before -- there was no
// dedicated bass voice anywhere in this project. Genre-authentic rhythm
// and motion come from melodic-data.js's real per-genre statistics (see
// that file's header for the full methodology/licensing story), the same
// data source and Markov-walk mechanism synth-layer.js's data-backed
// clusters use, applied here to the "bass" half of that data instead of
// "melody."
//
// -- Always-on, like ChordLayer and DrumLayer --------------------------
// Excluded from soundscape-engine.js's pool add/remove/mutate cycle:
// losing the bass mid-session would pull the floor out from under
// whatever's still playing. Fades in once at start(), stays.
//
// -- Chord-locked, not mode-wandering -----------------------------------
// ChordLayer fires onChordChange(rootDegreeIndex, modeName) at the exact
// moment a new chord triggers, every measure. This layer re-anchors to
// that root right then: its own Markov walk resets to degree-offset 0
// (pure root) and restarts fresh for the new measure, rather than
// carrying an unbounded drift across chord changes -- basslines
// conventionally restart their motion relative to each new harmony, they
// don't wander independently of it. This is also how bass automatically
// stays in sync with Shuffle: onChordChange already carries the current
// mode every time it fires (ChordLayer handles the mode-change-on-
// Shuffle timing once, centrally), so this layer never needs its own
// separate Shuffle handling.
//
// -- indie/fallback: no data, simple default ---------------------------
// melodic-data.js has no entry for indie/fallback (same gap as melody --
// see that file's header). Rather than force a Markov table onto nothing,
// those two clusters get a plain, sensible default: root on the strong
// beats, no motion. A generic, safe bass line, not an attempt to fake
// data that doesn't exist.
//
// Depends on: Tone.js, music-theory.js, melodic-data.js, bass-timbres.js

(function (global) {
    "use strict";

    const STEPS_PER_MEASURE = 16;
    const BASE_VELOCITY = 0.55; // multiplied by the timbre's own velocityMultiplier below, see bass-timbres.js
    const MAX_JITTER_SEC = 0.01;
    const BASS_MIN_OFFSET = -2; // scale-degree offset range from the current chord root --
    const BASS_MAX_OFFSET = 4;  // narrower than melody's, bass stays closer to home

    // Root on beats 1 and 3 only, no motion -- see file header on why
    // indie/fallback get this instead of a Markov table.
    const FALLBACK_RHYTHM = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];

    class BassLayer {
        // root: MIDI root note for the whole soundscape (see music-theory.js) --
        //   this layer sits two octaves below it, see constructor
        // dominantCluster: picks which genre's bass rhythm/motion data to
        //   use (melodic-data.js) AND which genre's bass TIMBRE to play
        //   (bass-timbres.js) -- an 808-style sub, an acid-squelch saw, a
        //   plucked upright-ish voice, etc. are genuinely different Tone.js
        //   instruments now, not just different notes on the same one.
        constructor({ root, dominantCluster, outputBus }) {
            this.bassRoot = root - 24; // two octaves down -- a real bass register
            const data = global.MelodicData.hasData(dominantCluster)
                ? global.MelodicData.dataFor(dominantCluster, "bass")
                : null;
            this.rhythmGrid = data ? data.rhythm : FALLBACK_RHYTHM;
            this.markov = data ? data.markov : null;

            this.timbre = global.BassTimbres.timbreFor(dominantCluster);
            this.instrument = this.timbre.createInstrument();
            this.filter = new Tone.Filter({ frequency: this.timbre.baseCutoffHz, type: "lowpass", Q: this.timbre.filterQ });
            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up
            this.instrument.chain(this.filter, this.gainNode, outputBus);

            this.currentMode = global.MusicTheory.DEFAULT_MODE;
            // Defaults to 0 (the tonic) rather than waiting for
            // ChordLayer's first onChordChange call, which doesn't fire
            // until the first real downbeat -- this is safe because every
            // progression in chord-progressions.js starts on the tonic by
            // design (rootDegrees[0] === 0 for all of them), so the
            // default already matches what that first call would set
            // anyway. If that convention ever changes, this needs an
            // explicit initial sync instead.
            this.chordRootDegreeIndex = 0;
            this.currentOffset = 0; // Markov-walked degree offset from the chord root, reset every measure
            this.prevBucket = 0;

            this.phaseOffset = Math.random() * Math.PI * 2; // decorrelates filter drift from other layers
            this.stepIndex = 0;
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
        }

        _lfo(time, periodSec, phase) {
            return 0.5 + 0.5 * Math.sin((time / periodSec) * Math.PI * 2 + phase);
        }

        // Called by SoundscapeEngine every time ChordLayer's onChordChange
        // fires -- i.e. every measure, at the exact moment the new chord
        // triggers. Re-anchors this layer to that chord's root and resets
        // the walk, see file header.
        setChordRoot(rootDegreeIndex, modeName) {
            this.chordRootDegreeIndex = rootDegreeIndex;
            this.currentMode = modeName;
            this.currentOffset = 0;
            this.prevBucket = 0;
        }

        // Called every 16th note by the scheduler, same cadence as every
        // other layer.
        scheduleStep(time) {
            const step = this.stepIndex % STEPS_PER_MEASURE;
            this.stepIndex++;

            if (Math.random() > this.rhythmGrid[step]) return; // rest step, nothing to trigger

            if (this.markov) {
                const stepped = global.MelodicData.stepMarkov(
                    this.markov, this.prevBucket, this.currentOffset, BASS_MIN_OFFSET, BASS_MAX_OFFSET
                );
                this.currentOffset = stepped.degree;
                this.prevBucket = stepped.bucket;
            } // else: indie/fallback -- currentOffset stays 0, pure root every hit

            const degree = this.chordRootDegreeIndex + this.currentOffset;
            const midiNote = global.MusicTheory.degreeToNote(degree, this.currentMode, this.bassRoot);
            const noteName = Tone.Frequency(midiNote, "midi").toNote();

            const velocity = BASE_VELOCITY * this.timbre.velocityMultiplier * (0.75 + 0.25 * this._lfo(time, 70, this.phaseOffset));
            const cutoff = this.timbre.baseCutoffHz * (0.8 + 0.4 * this._lfo(time, 45, this.phaseOffset * 1.3));
            this.filter.frequency.rampTo(cutoff, 0.3);

            const jitter = (Math.random() * 2 - 1) * MAX_JITTER_SEC;
            this.instrument.triggerAttackRelease(noteName, "8n", time + jitter, velocity);
        }
    }

    global.BassLayer = BassLayer;
})(window);
