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
// basic / buildup (low-energy first half, high-energy second half) /
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
// -- Data-driven, per genre, via arrangement-data.js --------------------
// Both WHICH section comes next and HOW LONG it runs are sampled from
// real per-genre section-sequencing statistics (Harmonix Set, see
// arrangement-data.js's header) whenever the dominant cluster has data --
// pop/hiphop/electronic/rock/indie/folk all do. This replaced an earlier
// version of this file with one hand-picked transition graph shared by
// every genre; the whole point of swapping it out was that a fixed graph
// "feels set in stone" regardless of what's actually in the user's
// library (direct user feedback). The graph below is now ONLY what jazz
// and fallback fall back to -- Harmonix has zero jazz songs, so those two
// clusters keep the original hand-authored rules:
//
//   SILENCE (4 bars) -> BASIC
//   BASIC (4 or 8 bars) -> BUILDUP, unless it was entered from MAIN's
//                          wind-down branch, in which case -> SILENCE
//   BUILDUP (ALWAYS 4 bars) -> MAIN
//   MAIN (8 or 12 bars -- always >=2 trips through the 4-bar chord
//         progression, so it actually gets to sit once it arrives) ->
//         60% B_SECTION (keep the energy going), 40% BASIC, heading
//         toward SILENCE (wind down)
//   B_SECTION (4 bars) -> BUILDUP
//
// SILENCE -> BASIC and BASIC's fork are the two rules added on top of
// what was asked for (always-main-after-buildup, main loops 2-4x, main
// exits to b-section+build or basic+nothing) -- something has to bring
// the piece back to life after "nothing." MAIN's minimum was bumped from
// 4 to 8 bars after listening -- one 4-bar pass felt like a quick
// pass-through rather than a real arrival. BASIC stays shorter (4 or 8):
// it's the stripped-down section, not the destination. 60/40 favors
// continuing over winding down, matching the "positive, engaging" brief
// the rest of this project was built around.
//
// That same "MAIN needs to actually arrive" reasoning is why _enterSection()
// floors a data-sampled MAIN duration at 8 bars even for the data-driven
// clusters -- real songs do sometimes sit in a chorus for only 4 bars,
// but that specific tuning came from direct listening feedback on THIS
// piece and is kept as a hard floor rather than overridden by the data.
// Every other section (including BUILDUP, which stays coupled to its own
// low/high split -- see buildupTotalBars below) uses the sampled duration
// as-is.
//
// It's also reactive to Shuffle: toggles to the dominant genre's OTHER
// seed pattern (drums have no pitch, so mode itself means nothing here)
// AND resets the arrangement back to BASIC, so the new pattern's groove
// introduces cleanly instead of picking up mid-arc with a stale section.
// Both are queued and applied together at the next real downbeat, not
// mid-bar -- same "land the change on a sensible musical boundary"
// reasoning as ChordLayer restarting its progression on a mode change.
//
// -- Starting section ---------------------------------------------------
// A coin flip (STARTS_SILENT_PROBABILITY) decides whether the session
// opens in SILENCE (4 quiet bars before BASIC's real content) or straight
// into BASIC (drums audible from the first bar). This used to always be
// SILENCE, via a separate mute-until-first-fill mechanism -- removed
// because it always read as the same slow open regardless of genre, and
// because fills (see below) no longer exist to trigger the reveal.
//
// It's ONE shared probability across every genre, not per-cluster, on
// purpose: Harmonix's segment files DO tag a "silence" section at
// literally every song's t=0, which looked at first like real per-genre
// signal (rock: silence-first 82% of the time!) until checking its
// duration -- median 2-5 seconds, never past ~10, across every genre
// alike. That's an annotation convention marking the pre-song count-in/
// room tone, not a real "this genre opens quiet" fact, so it would have
// been dishonest to ship it as genre-differentiated data. This project's
// rule throughout has been: real data where it's real, and an honest
// hand-picked default where it isn't -- see melodic-data.js/
// arrangement-data.js's own headers for the same principle applied
// elsewhere.
//
// -- Fills: removed -------------------------------------------------
// This layer used to substitute a one-bar fill on the last bar before any
// section change, to announce the turnover. Removed once the transitions
// themselves became genre-data-driven (arrangement-data.js): a fill's
// whole job was announcing an otherwise-arbitrary hand-picked change, and
// once the transitions are already a real, differentiated per-genre
// event, a fill on top of it read as redundant rather than additive.
//
// -- Humanization --------------------------------------------------
// The "soul" doesn't come from the programmed grids alone -- per-hit
// micro-timing jitter, per-hit velocity jitter, and (for patterns that
// ask for it) a swing delay on the off-beat 8th-note steps. See
// _swingOffset / _triggerVoice.
//
// Depends on: Tone.js, drum-patterns.js, arrangement-data.js, drum-kits.js

(function (global) {
    "use strict";

    const STEPS_PER_MEASURE = 16;
    const MAX_TIMING_JITTER_SEC = 0.008; // subtler than melodic layers' jitter -- drums need to stay tight
    const VELOCITY_JITTER = 0.1;         // +/- 10%, per hit

    const STARTS_SILENT_PROBABILITY = 0.4; // chance the session opens in SILENCE vs. straight into BASIC; see file header

    const MAIN_CONTINUE_PROBABILITY = 0.6; // jazz/fallback only: MAIN -> B_SECTION (continue) vs. -> BASIC (wind down); see file header
    const BUILDUP_BARS = 4; // jazz/fallback only -- always; half low-energy, half high-energy; see file header for why 4, not 2
    const MAIN_MIN_BARS = 8; // floor applied even to data-sampled MAIN durations -- see file header

    const SECTION = {
        SILENCE: "silence",
        BASIC: "basic",
        BUILDUP: "buildup",
        MAIN: "main",
        B_SECTION: "bSection",
    };

    // Bridges this file's section constants and arrangement-data.js's
    // Harmonix-derived state keys.
    const SECTION_TO_STATE_KEY = {
        [SECTION.SILENCE]: "SILENCE",
        [SECTION.BASIC]: "BASIC",
        [SECTION.BUILDUP]: "BUILDUP",
        [SECTION.MAIN]: "MAIN",
        [SECTION.B_SECTION]: "B_SECTION",
    };
    const STATE_KEY_TO_SECTION = {
        SILENCE: SECTION.SILENCE,
        BASIC: SECTION.BASIC,
        BUILDUP: SECTION.BUILDUP,
        MAIN: SECTION.MAIN,
        B_SECTION: SECTION.B_SECTION,
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
        // forceAudibleStart: optional, defaults to false -- skips the
        //   SILENCE coin flip entirely and always opens on BASIC. Used by
        //   soundscape-engine.js's "drumIntro" opening style, where the
        //   drums ARE the cold open and a session-opening silent stretch
        //   would undercut the whole point. See that file's INTRO_STYLES.
        constructor({ dominantCluster, bpm, outputBus, onPatternChange, onKick, forceAudibleStart = false }) {
            this.onPatternChange = onPatternChange;
            this.onKick = onKick;
            this.dominantCluster = dominantCluster; // picks WHICH genre's arrangement-data.js stats drive the state machine below
            this.kit = global.DrumKits.kitFor(dominantCluster); // and which genre's drum SYNTHESIS this layer builds below, see drum-kits.js

            // the two seed patterns Shuffle toggles between -- always the
            // dominant genre's own patterns, so shuffling drums never
            // wanders away from "this is still built from your library"
            this.patternOptions = global.DrumPatterns.DRUM_PATTERNS[dominantCluster] ?? global.DrumPatterns.DRUM_PATTERNS.fallback;
            this.patternIndex = this.patternOptions.indexOf(global.DrumPatterns.pickPattern(dominantCluster, bpm));
            this.pattern = this.patternOptions[this.patternIndex];
            this.pendingPatternIndex = null;    // set by shuffle(), applied at the next downbeat
            this.pendingArrangementReset = false; // set by shuffle(), applied at the next downbeat
            this.onPatternChange?.(this.pattern);

            // opens in SILENCE or straight into BASIC, see file header for
            // why this is one flat coin flip rather than per-genre data --
            // unless forceAudibleStart overrides it to always BASIC
            const opensSilent = !forceAudibleStart && Math.random() < STARTS_SILENT_PROBABILITY;
            this._enterSection(opensSilent ? SECTION.SILENCE : SECTION.BASIC);
            this.basicExit = SECTION.BUILDUP;
            this.activeGrid = this._gridForCurrentSection();

            this.sixteenthSec = Tone.Time("16n").toSeconds();

            this.gainNode = new Tone.Gain(0); // starts silent; fadeIn() brings it up
            this.gainNode.connect(outputBus);

            // Every voice below is built from this.kit (drum-kits.js) --
            // pitch/envelope/filter values that used to be hardcoded
            // constants here, identical for every genre. See that file's
            // header for what varies per cluster and why.

            // kick: pitched membrane synthesis, no filter needed -- its
            // own pitch envelope does the tone-shaping
            this.kick = new Tone.MembraneSynth({
                pitchDecay: this.kit.kick.pitchDecay, octaves: this.kit.kick.octaves,
                envelope: this.kit.kick.envelope,
            }).connect(this.gainNode);

            // snare: noise burst through a bandpass filter for that
            // characteristic crack instead of a raw white-noise thump
            this.snare = new Tone.NoiseSynth({
                noise: { type: this.kit.snare.noiseType },
                envelope: this.kit.snare.envelope,
            });
            this.snareFilter = new Tone.Filter(this.kit.snare.filterFreq, this.kit.snare.filterType);
            this.snare.chain(this.snareFilter, this.gainNode);

            // closed/open hihat are separate voices (not one voice with a
            // variable envelope) since they need genuinely different decay
            // times and can, in principle, ring independently -- a real
            // kit's closed hat choking an open hat is a nice future
            // refinement, not implemented here
            this.hihatClosed = new Tone.MetalSynth({
                envelope: this.kit.hihatClosed.envelope,
                harmonicity: this.kit.hihatClosed.harmonicity, modulationIndex: this.kit.hihatClosed.modulationIndex,
                resonance: this.kit.hihatClosed.resonance, octaves: this.kit.hihatClosed.octaves,
            }).connect(this.gainNode);

            this.hihatOpen = new Tone.MetalSynth({
                envelope: this.kit.hihatOpen.envelope,
                harmonicity: this.kit.hihatOpen.harmonicity, modulationIndex: this.kit.hihatOpen.modulationIndex,
                resonance: this.kit.hihatOpen.resonance, octaves: this.kit.hihatOpen.octaves,
            }).connect(this.gainNode);

            // toms: two more membrane voices (same synthesis as kick, just
            // higher-pitched notes + a shorter, more resonant decay) --
            // used sparingly, mostly in buildup/bSection, so they read as
            // an arrangement device rather than part of the core groove
            // (see drum-patterns.js's section derivation)
            this.tomLow = new Tone.MembraneSynth({
                pitchDecay: this.kit.tomLow.pitchDecay, octaves: this.kit.tomLow.octaves,
                envelope: this.kit.tomLow.envelope,
            }).connect(this.gainNode);
            this.tomHigh = new Tone.MembraneSynth({
                pitchDecay: this.kit.tomHigh.pitchDecay, octaves: this.kit.tomHigh.octaves,
                envelope: this.kit.tomHigh.envelope,
            }).connect(this.gainNode);

            // perc: EITHER a second noise voice (brighter/clickier than
            // the snare -- shaker/rim-click color, used as connective
            // texture in buildup/bSection) OR, for jazz specifically, a
            // genuine ride cymbal (a second, warmer MetalSynth) -- see
            // drum-kits.js's header for why jazz is the one cluster where
            // this voice isn't a noise burst at all.
            if (this.kit.perc.type === "metal") {
                this.perc = new Tone.MetalSynth({
                    envelope: this.kit.perc.envelope,
                    harmonicity: this.kit.perc.harmonicity, modulationIndex: this.kit.perc.modulationIndex,
                    resonance: this.kit.perc.resonance, octaves: this.kit.perc.octaves,
                }).connect(this.gainNode);
                this.percFilter = null; // no separate filter node for this voice -- nothing to dispose()
            } else {
                this.perc = new Tone.NoiseSynth({
                    noise: { type: this.kit.perc.noiseType },
                    envelope: this.kit.perc.envelope,
                });
                this.percFilter = new Tone.Filter(this.kit.perc.filterFreq, this.kit.perc.filterType);
                this.perc.chain(this.percFilter, this.gainNode);
            }

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
            this.kick.dispose();
            this.snare.dispose();
            this.snareFilter.dispose();
            this.hihatClosed.dispose();
            this.hihatOpen.dispose();
            this.tomLow.dispose();
            this.tomHigh.dispose();
            this.perc.dispose();
            this.percFilter?.dispose(); // null for jazz's ride-cymbal perc -- see constructor
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

        // How many bars the section that's about to start should occupy.
        // Every value is a multiple of 4 -- never shorter -- so a section
        // boundary always lands on a bar where ChordLayer's 4-bar
        // progression is also looping back to its first chord (see file
        // header).
        //
        // Sampled from arrangement-data.js's real per-genre duration
        // histogram when the dominant cluster has data; jazz/fallback (no
        // data) use the original hand-authored ranges. MAIN gets a hard
        // floor at MAIN_MIN_BARS either way -- see file header for why.
        // BUILDUP's sampled length becomes buildupTotalBars, which
        // _gridForCurrentSection() uses to still land its low/high split
        // exactly halfway through regardless of how long BUILDUP ran.
        _enterSection(section) {
            this.section = section;
            const stateKey = SECTION_TO_STATE_KEY[section];
            let dataBars = global.ArrangementData.durationFor(this.dominantCluster, stateKey);
            if (section === SECTION.MAIN && dataBars !== null) {
                dataBars = Math.max(MAIN_MIN_BARS, dataBars);
            }
            switch (section) {
                case SECTION.SILENCE:   this.barsRemaining = dataBars ?? 4; break;
                case SECTION.BASIC:     this.barsRemaining = dataBars ?? (Math.random() < 0.5 ? 4 : 8); break;
                case SECTION.BUILDUP:   this.barsRemaining = dataBars ?? BUILDUP_BARS; break;
                case SECTION.MAIN:      this.barsRemaining = dataBars ?? (Math.random() < 0.5 ? 8 : 12); break; // >=2 chord-progression cycles
                case SECTION.B_SECTION: this.barsRemaining = dataBars ?? 4; break;
            }
            if (section === SECTION.BUILDUP) this.buildupTotalBars = this.barsRemaining;
        }

        // Called when the current section's bars have run out -- decides
        // and enters whatever comes next. Weighted-random per
        // arrangement-data.js's real per-genre transition table when the
        // dominant cluster has data; jazz/fallback (no data) fall through
        // to the original hand-authored graph. See file header for both.
        _exitSection() {
            const stateKey = SECTION_TO_STATE_KEY[this.section];
            const nextStateKey = global.ArrangementData.nextSection(this.dominantCluster, stateKey);
            if (nextStateKey) {
                this._enterSection(STATE_KEY_TO_SECTION[nextStateKey]);
                return;
            }

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
        // BUILDUP spans buildupTotalBars bars from the _enterSection()
        // call that started it -- the first half plays the low-energy
        // bar, the second half plays the high-energy one, so the
        // escalation still lands its high point on the bar right before
        // MAIN drops regardless of how long that BUILDUP happened to run.
        _gridForCurrentSection() {
            const sections = this.pattern.sections;
            switch (this.section) {
                case SECTION.SILENCE:   return global.DrumPatterns.SILENT_GRID;
                case SECTION.BASIC:     return sections.basic;
                case SECTION.BUILDUP:   return this.barsRemaining > this.buildupTotalBars / 2 ? sections.buildupLow : sections.buildupHigh;
                case SECTION.MAIN:      return sections.main;
                case SECTION.B_SECTION: return sections.bSection;
            }
        }

        // Runs once per bar, at step 0 -- see scheduleStep(). Advances the
        // state machine and picks this bar's grid.
        _advanceBar() {
            if (this.barsRemaining === 0) this._exitSection();
            this.activeGrid = this._gridForCurrentSection();
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
                this._advanceBar(); // may transition sections for the bar that's about to start
            }

            this.stepIndex++;

            const grid = this.activeGrid;
            const vel = this.kit.velocities;
            this._triggerVoice(this.kick, grid.kick, vel.kick, step, time,
                (inst, t, v) => inst.triggerAttackRelease(this.kit.kick.note, "8n", t, v),
                // SILENCE's grid has no kick hits at all (SILENT_GRID is
                // all zeros), so this naturally never fires during it --
                // no separate mute check needed
                (t, v) => this.onKick?.(t, v));
            this._triggerVoice(this.snare, grid.snare, vel.snare, step, time,
                (inst, t, v) => inst.triggerAttackRelease("16n", t, v));
            this._triggerVoice(this.hihatClosed, grid.hihatClosed, vel.hihatClosed, step, time,
                (inst, t, v) => inst.triggerAttackRelease("32n", t, v));
            this._triggerVoice(this.hihatOpen, grid.hihatOpen, vel.hihatOpen, step, time,
                (inst, t, v) => inst.triggerAttackRelease("8n", t, v));
            this._triggerVoice(this.tomLow, grid.tomLow, vel.tomLow, step, time,
                (inst, t, v) => inst.triggerAttackRelease(this.kit.tomLow.note, "8n", t, v));
            this._triggerVoice(this.tomHigh, grid.tomHigh, vel.tomHigh, step, time,
                (inst, t, v) => inst.triggerAttackRelease(this.kit.tomHigh.note, "8n", t, v));
            this._triggerVoice(this.perc, grid.perc, vel.perc, step, time,
                (inst, t, v) => inst.triggerAttackRelease(this.kit.perc.triggerDuration, t, v));
        }
    }

    global.DrumLayer = DrumLayer;
})(window);
