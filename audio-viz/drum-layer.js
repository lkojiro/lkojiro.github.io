// drum-layer.js
//
// Synthesized (no samples, matching the rest of this project) drum kit --
// seven voices (kick, snare, hihatClosed, hihatOpen, tomLow, tomHigh,
// perc) built from Tone.js's noise/membrane/metal synths, playing
// whichever of the dominant genre's two drum-patterns.js seed patterns
// best matches the session's fixed tempo.
//
// Same "always-on" reasoning as chord-layer.js: this is the rhythmic
// backbone everything else locks to, so it's excluded from the
// scheduler's add/remove/mutate cycle in soundscape-engine.js.
//
// -- Arrangement -----------------------------------------------------
// Each seed pattern expands into 5 sections (drum-patterns.js):
// basic / buildup (4 bars: low for the first 2, high for the last 2) /
// main / bSection. This layer runs a small state machine deciding which
// section plays when, so the drums build and release tension over the
// course of the whole session instead of looping one groove forever.
//
// EVERY section length is a multiple of 4 bars, never shorter -- that's
// deliberate, not just a round number: ChordLayer's progression is
// exactly 4 bars and simply loops (see chord-layer.js), so a running bar
// count that's always a multiple of 4 at every section boundary means a
// drum section change never lands mid-progression -- it always coincides
// with the chord progression looping back to its first chord too.
//
//   SILENCE (4 bars) -> BASIC
//   BASIC (4 or 8 bars) -> BUILDUP, unless it was entered from MAIN's
//                          wind-down branch, in which case -> SILENCE
//   BUILDUP (ALWAYS 4 bars) -> MAIN
//   MAIN (4 or 8 bars) -> 60% B_SECTION (keep the energy going),
//                          40% BASIC, heading toward SILENCE (wind down)
//   B_SECTION (4 bars) -> BUILDUP
//
// SILENCE -> BASIC and BASIC's fork are the two rules added on top of
// what was asked for (always-main-after-buildup, main loops 2-4x, main
// exits to b-section+build or basic+nothing) -- something has to bring
// the piece back to life after "nothing," and BASIC's own length
// mirrors MAIN's own variability so the two "steady" sections feel like
// part of the same structural family. 60/40 favors continuing over
// winding down, matching the "positive, engaging" brief the rest of this
// project was built around.
//
// Fills happen on the LAST bar before ANY section change (not just
// buildup->main) -- a fill's job is to announce a transition, so this
// generalizes cleanly to every transition point using the exact same
// fillProbability roll. SILENCE is excluded: a fill into silence defeats
// the point of the silence.
//
// It's also reactive to Shuffle: toggles to the dominant genre's OTHER
// seed pattern (drums have no pitch, so mode itself means nothing here)
// AND resets the arrangement back to BASIC, so the new pattern's groove
// introduces cleanly instead of picking up mid-arc with a stale section.
// Both are queued and applied together at the next real downbeat, not
// mid-bar -- same "land the change on a sensible musical boundary"
// reasoning as ChordLayer restarting its progression on a mode change.
//
// -- Muted / reveal ----------------------------------------------------
// `muted` (constructor param, single on/off switch): while true, the
// layer still runs everything above normally -- stepping, arranging,
// choosing fills -- it's just silent. The current behavior built on that
// switch: start muted, and the first fill that plays (on ANY section
// transition, arrangement runs the whole time underneath) unmutes and
// stays unmuted for the rest of the session. Flip DEFAULT_MUTED to false
// to bypass this and have drums audible from the start instead.
//
// -- Humanization --------------------------------------------------
// The "soul" doesn't come from the programmed grids alone -- per-hit
// micro-timing jitter, per-hit velocity jitter, and (for patterns that
// ask for it) a swing delay on the off-beat 8th-note steps. See
// _swingOffset / _triggerVoice.
//
// Depends on: Tone.js, drum-patterns.js

(function (global) {
    "use strict";

    const STEPS_PER_MEASURE = 16;
    const MAX_TIMING_JITTER_SEC = 0.008; // subtler than melodic layers' jitter -- drums need to stay tight
    const VELOCITY_JITTER = 0.1;         // +/- 10%, per hit

    const DEFAULT_FILL_PROBABILITY = 0.5; // chance a fill plays on any section's last bar. The one knob to tune.
    const DEFAULT_MUTED = true;   // start silent; see file header for the reveal-on-first-fill behavior
    const UNMUTE_FADE_SEC = 1.5;  // how fast the drums ramp in once revealed -- a quick swell, not instant, not a slow fade

    const MAIN_CONTINUE_PROBABILITY = 0.6; // MAIN -> B_SECTION (continue) vs. -> BASIC (wind down); see file header
    const BUILDUP_BARS = 4; // always -- half low-energy, half high-energy; see file header for why 4, not 2

    const SECTION = {
        SILENCE: "silence",
        BASIC: "basic",
        BUILDUP: "buildup",
        MAIN: "main",
        B_SECTION: "bSection",
    };

    class DrumLayer {
        // dominantCluster: genre cluster with the highest weight in the
        //   user's library (see genre-engine.js) -- picks WHICH seed pattern
        // bpm: the session's fixed tempo -- picks WHICH TEMPO VARIANT of
        //   that seed (see drum-patterns.js's tempoRange)
        // outputBus: shared Tone.js node this layer's mix connects into
        // onPatternChange(pattern): optional, fires on the initial pick AND
        //   every time Shuffle actually applies a swap -- same event-driven
        //   reasoning as ChordLayer's onProgressionChange, see there for why
        // onKick(time, velocity): optional, fires at the exact scheduled
        //   time of every actual kick hit (rests don't fire it) -- lets
        //   another layer sidechain-duck off the kick without this class
        //   needing to know anything about who's listening.
        // fillProbability: optional override of DEFAULT_FILL_PROBABILITY
        // muted: optional override of DEFAULT_MUTED
        constructor({
            dominantCluster, bpm, outputBus, onPatternChange, onKick,
            fillProbability = DEFAULT_FILL_PROBABILITY, muted = DEFAULT_MUTED,
        }) {
            this.onPatternChange = onPatternChange;
            this.onKick = onKick;
            this.fillProbability = fillProbability;
            this.muted = muted;

            // the two seed patterns Shuffle toggles between -- always the
            // dominant genre's own patterns, so shuffling drums never
            // wanders away from "this is still built from your library"
            this.patternOptions = global.DrumPatterns.DRUM_PATTERNS[dominantCluster] ?? global.DrumPatterns.DRUM_PATTERNS.fallback;
            this.patternIndex = this.patternOptions.indexOf(global.DrumPatterns.pickPattern(dominantCluster, bpm));
            this.pattern = this.patternOptions[this.patternIndex];
            this.pendingPatternIndex = null;    // set by shuffle(), applied at the next downbeat
            this.pendingArrangementReset = false; // set by shuffle(), applied at the next downbeat
            this.onPatternChange?.(this.pattern);

            this._enterSection(SECTION.BASIC); // arrangement starts here, see file header for why not SILENCE
            this.basicExit = SECTION.BUILDUP;
            this.activeGrid = this._gridForCurrentSection();

            this.sixteenthSec = Tone.Time("16n").toSeconds();

            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up (subject to `muted`, see below)
            this.gainNode.connect(outputBus);

            // kick: pitched membrane synthesis, no filter needed -- its
            // own pitch envelope does the tone-shaping
            this.kick = new Tone.MembraneSynth({
                pitchDecay: 0.05, octaves: 6,
                envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
            }).connect(this.gainNode);

            // snare: noise burst through a bandpass filter for that
            // characteristic crack instead of a raw white-noise thump
            this.snare = new Tone.NoiseSynth({
                noise: { type: "white" },
                envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
            });
            this.snareFilter = new Tone.Filter(1800, "bandpass");
            this.snare.chain(this.snareFilter, this.gainNode);

            // closed/open hihat are separate voices (not one voice with a
            // variable envelope) since they need genuinely different decay
            // times and can, in principle, ring independently -- a real
            // kit's closed hat choking an open hat is a nice future
            // refinement, not implemented here
            this.hihatClosed = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
                harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
            }).connect(this.gainNode);

            this.hihatOpen = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
                harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
            }).connect(this.gainNode);

            // toms: two more membrane voices (same synthesis as kick, just
            // higher-pitched notes + a shorter, more resonant decay) --
            // used sparingly, mostly in buildup/bSection/fills, so they
            // read as an arrangement device rather than part of the core
            // groove (see drum-patterns.js's section derivation)
            this.tomLow = new Tone.MembraneSynth({
                pitchDecay: 0.08, octaves: 4,
                envelope: { attack: 0.001, decay: 0.25, sustain: 0 },
            }).connect(this.gainNode);
            this.tomHigh = new Tone.MembraneSynth({
                pitchDecay: 0.08, octaves: 4,
                envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
            }).connect(this.gainNode);

            // perc: a second noise voice, brighter/clickier than the snare
            // (highpass instead of bandpass) -- shaker/rim-click color,
            // used as connective texture in buildup/bSection
            this.perc = new Tone.NoiseSynth({
                noise: { type: "white" },
                envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
            });
            this.percFilter = new Tone.Filter(3000, "highpass");
            this.perc.chain(this.percFilter, this.gainNode);

            this.stepIndex = 0;
            this.active = false;
        }

        // While muted, still goes "active" (stepping/arranging continues
        // normally underneath) but the gain ramp is skipped -- silence is
        // held until the first fill lifts `muted`. See file header.
        fadeIn(seconds) {
            this.active = true;
            if (this.muted) return;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(1, seconds);
        }

        fadeOut(seconds) {
            this.active = false;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(0, seconds);
        }

        dispose() {
            this.kick.dispose();
            this.snare.dispose();
            this.snareFilter.dispose();
            this.hihatClosed.dispose();
            this.hihatOpen.dispose();
            this.tomLow.dispose();
            this.tomHigh.dispose();
            this.perc.dispose();
            this.percFilter.dispose();
            this.gainNode.dispose();
        }

        // Off-beat 8th-note steps (the "and" of each beat: 2, 6, 10, 14)
        // land late by the ACTIVE grid's swing fraction of a 16th note. A
        // simplified, single-tier approximation of swing -- real swing is
        // a continuous triplet feel -- but enough to tell a boom-bap or
        // jazz pattern apart from a straight one without a separate
        // triplet-grid representation.
        _swingOffset(step) {
            const isOffBeat8th = step % 4 === 2;
            return isOffBeat8th ? this.activeGrid.swing * this.sixteenthSec : 0;
        }

        // onTriggered(time, velocity), if given, fires right after a real
        // (non-rest) hit -- currently only wired for the kick, to drive
        // ChordLayer's sidechain duck at the exact same scheduled time.
        _triggerVoice(instrument, stepVelocities, baseVelocity, step, time, triggerFn, onTriggered) {
            const stepVelocity = stepVelocities[step];
            if (!stepVelocity) return; // 0 = rest

            const jitteredTime = time + this._swingOffset(step) + (Math.random() * 2 - 1) * MAX_TIMING_JITTER_SEC;
            const velocity = stepVelocity * baseVelocity * (1 + (Math.random() * 2 - 1) * VELOCITY_JITTER);
            triggerFn(instrument, jitteredTime, velocity);
            onTriggered?.(jitteredTime, velocity);
        }

        // Queues a swap to the dominant genre's OTHER seed pattern, AND a
        // reset of the arrangement back to BASIC -- both picked up by
        // scheduleStep() at the next measure downbeat, not applied
        // immediately (see file header).
        shuffle() {
            this.pendingPatternIndex = (this.patternIndex + 1) % this.patternOptions.length;
            this.pendingArrangementReset = true;
        }

        _reveal() {
            this.muted = false;
            this.gainNode.gain.cancelScheduledValues(Tone.now());
            this.gainNode.gain.rampTo(1, UNMUTE_FADE_SEC);
        }

        // How many bars the section that's about to start should occupy.
        // Every value is a multiple of 4 -- never shorter -- so a section
        // boundary always lands on a bar where ChordLayer's 4-bar
        // progression is also looping back to its first chord (see file
        // header). BUILDUP is always exactly BUILDUP_BARS (the one hard
        // rule); everything else that isn't a fixed 4-bar transitional
        // section (SILENCE, B_SECTION) varies 4 or 8, matching MAIN's own
        // variability.
        _enterSection(section) {
            this.section = section;
            switch (section) {
                case SECTION.SILENCE:   this.barsRemaining = 4; break;
                case SECTION.BASIC:     this.barsRemaining = Math.random() < 0.5 ? 4 : 8; break;
                case SECTION.BUILDUP:   this.barsRemaining = BUILDUP_BARS; break; // always -- see file header
                case SECTION.MAIN:      this.barsRemaining = Math.random() < 0.5 ? 4 : 8; break;
                case SECTION.B_SECTION: this.barsRemaining = 4; break;
            }
        }

        // Called when the current section's bars have run out -- decides
        // and enters whatever comes next. See file header for the graph.
        _exitSection() {
            switch (this.section) {
                case SECTION.SILENCE:
                    this._enterSection(SECTION.BASIC);
                    this.basicExit = SECTION.BUILDUP; // coming back to life -> build back up
                    break;
                case SECTION.BASIC:
                    this._enterSection(this.basicExit); // decided when THIS basic was entered -- see below
                    break;
                case SECTION.BUILDUP:
                    this._enterSection(SECTION.MAIN); // always -- the one hard rule this all started from
                    break;
                case SECTION.MAIN:
                    if (Math.random() < MAIN_CONTINUE_PROBABILITY) {
                        this._enterSection(SECTION.B_SECTION);
                    } else {
                        this._enterSection(SECTION.BASIC);
                        this.basicExit = SECTION.SILENCE; // winding down -> this basic leads to silence, not another build
                    }
                    break;
                case SECTION.B_SECTION:
                    this._enterSection(SECTION.BUILDUP); // always -- keeps the energy propulsive
                    break;
            }
        }

        // The section-appropriate grid for the bar that's about to play.
        // BUILDUP spans BUILDUP_BARS bars from one _enterSection() call
        // (barsRemaining starts at BUILDUP_BARS) -- the first half plays
        // the low-energy bar, the second half plays the high-energy one,
        // so the escalation still lands its high point on the bar right
        // before MAIN drops regardless of how long BUILDUP_BARS is.
        _gridForCurrentSection() {
            const sections = this.pattern.sections;
            switch (this.section) {
                case SECTION.SILENCE:   return global.DrumPatterns.SILENT_GRID;
                case SECTION.BASIC:     return sections.basic;
                case SECTION.BUILDUP:   return this.barsRemaining > BUILDUP_BARS / 2 ? sections.buildupLow : sections.buildupHigh;
                case SECTION.MAIN:      return sections.main;
                case SECTION.B_SECTION: return sections.bSection;
            }
        }

        // Runs once per bar, at step 0 -- see scheduleStep(). Advances the
        // state machine, picks this bar's grid, and rolls for a fill on
        // the last bar of any (non-silent) section.
        _advanceBar() {
            if (this.barsRemaining === 0) this._exitSection();

            const grid = this._gridForCurrentSection();
            const isLastBarOfSection = this.barsRemaining === 1;
            const fillEligible = isLastBarOfSection && this.section !== SECTION.SILENCE;

            if (fillEligible && Math.random() < this.fillProbability) {
                this.activeGrid = grid.fills[Math.floor(Math.random() * grid.fills.length)];
                if (this.muted) this._reveal();
            } else {
                this.activeGrid = grid;
            }

            this.barsRemaining--;
        }

        // Called every 16th note by the scheduler, same cadence as the
        // other layers -- but unlike them, doesn't take a `modeName`
        // argument. Rhythm has no pitch, so mode itself means nothing here;
        // Shuffle reaches this layer through shuffle() above instead.
        scheduleStep(time) {
            const step = this.stepIndex % STEPS_PER_MEASURE;

            if (step === 0) {
                if (this.pendingPatternIndex !== null) {
                    this.patternIndex = this.pendingPatternIndex;
                    this.pattern = this.patternOptions[this.patternIndex];
                    this.pendingPatternIndex = null;
                    this.onPatternChange?.(this.pattern);
                }
                if (this.pendingArrangementReset) {
                    this._enterSection(SECTION.BASIC);
                    this.basicExit = SECTION.BUILDUP;
                    this.pendingArrangementReset = false;
                }
                this._advanceBar(); // may pick a fill for the bar that's about to start, may transition sections
            }

            this.stepIndex++;

            const grid = this.activeGrid;
            this._triggerVoice(this.kick, grid.kick, 0.9, step, time,
                (inst, t, v) => inst.triggerAttackRelease("C1", "8n", t, v),
                // don't sidechain-duck the chords off a kick nobody can
                // hear yet -- that'd read as an unexplained rhythmic dip
                (t, v) => { if (!this.muted) this.onKick?.(t, v); });
            this._triggerVoice(this.snare, grid.snare, 0.75, step, time,
                (inst, t, v) => inst.triggerAttackRelease("16n", t, v));
            this._triggerVoice(this.hihatClosed, grid.hihatClosed, 0.35, step, time,
                (inst, t, v) => inst.triggerAttackRelease("32n", t, v));
            this._triggerVoice(this.hihatOpen, grid.hihatOpen, 0.3, step, time,
                (inst, t, v) => inst.triggerAttackRelease("8n", t, v));
            this._triggerVoice(this.tomLow, grid.tomLow, 0.7, step, time,
                (inst, t, v) => inst.triggerAttackRelease("G2", "8n", t, v));
            this._triggerVoice(this.tomHigh, grid.tomHigh, 0.6, step, time,
                (inst, t, v) => inst.triggerAttackRelease("C3", "8n", t, v));
            this._triggerVoice(this.perc, grid.perc, 0.45, step, time,
                (inst, t, v) => inst.triggerAttackRelease("32n", t, v));
        }
    }

    global.DrumLayer = DrumLayer;
})(window);
