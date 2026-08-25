// soundscape-engine.js
//
// The continuous, never-really-stops generative engine. Distinct from
// synth-layer.js's per-layer variation: this module decides WHICH layers
// from the pool are currently sounding, adding/removing/mutating them on
// a slow clock for as long as the page is open. There is no "end" state --
// it just keeps going until the user leaves or hits Shuffle.
//
// Shuffle does NOT reset this engine or crossfade anything special -- it
// just advances `currentMode` (see music-theory.js). Layers are already
// fading in/out constantly as part of normal operation, so the next
// scheduled notes simply land in the new mode; within a tick or two the
// whole texture has organically rotated over. No extra transition logic
// needed, which is the whole point of building it this way.
//
// Depends on: Tone.js, music-theory.js, genre-engine.js, genre-modes.js,
// synth-layer.js, chord-layer.js, chord-timbres.js, drum-layer.js,
// drum-kits.js, bass-layer.js, tempo-data.js

(function (global) {
    "use strict";

    // This project's tempo range -- widened from an original fixed
    // 100-110 (a narrow "safe zone" picked before tempo was data-driven
    // at all) once real per-genre BPM data (tempo-data.js, Harmonix Set)
    // made a wider, genre-differentiated range meaningful instead of
    // arbitrary. Still bounded, not "anything goes": these are the outer
    // edges tempo-data.js's real data and this file's own jazz/fallback
    // default both respect.
    const MIN_BPM = 60;
    const MAX_BPM = 140;
    const TICK_INTERVAL = "8m"; // scheduler decision cadence: every 8 bars
    const FADE_SECONDS = 30;    // layer fade in/out duration -- this IS the
                                 // "crossfade", just baked into every layer's
                                 // own lifecycle instead of being shuffle's job
    const MIN_ACTIVE_LAYERS = 1;

    // -- Opening styles -----------------------------------------------------
    // Every session used to open the exact same way: everything fading in
    // together over FADE_SECONDS (30s) -- a slow ambient wash regardless of
    // genre or what's actually driving the piece. That's a deliberate,
    // pleasant choice for some material, but it's also the ONLY choice
    // there was, and a 30-second fade-in never grabs attention -- some
    // sessions should open with a hook instead. Three styles, picked once
    // per session (in the constructor, since drumIntro needs to reach
    // DrumLayer's own constructor -- see forceAudibleStart there):
    //
    //   ambientSwell (the original, unchanged behavior): every layer fades
    //     in together over FADE_SECONDS. Still the right choice plenty of
    //     the time -- kept as one of three, not replaced.
    //   drumIntro: drums snap in near-instantly (QUICK_FADE_SECONDS) and
    //     ALONE, forced audible (forceAudibleStart, bypassing the usual
    //     SILENCE coin flip -- a cold open into silence would defeat the
    //     point) -- everything else waits INTRO_DELAY_BARS before its own
    //     entrance.
    //   bassIntro: same idea, bass first -- a moodier, harmonic-led
    //     opening instead of a rhythmic one. Drums follow shortly after,
    //     also snapped in rather than swelled, to keep the "this has
    //     something to say immediately" energy; everything else waits.
    //
    // Delays land on bar boundaries (Tone.js "Nm" transport-time strings,
    // scheduled before Transport.start() -- Tone.js resolves them relative
    // to transport position 0 once it actually starts), same "always land
    // on a musical boundary" discipline used everywhere else in this
    // project's arrangement logic.
    const INTRO_STYLES = ["ambientSwell", "drumIntro", "bassIntro"];
    const QUICK_FADE_SECONDS = 0.3;  // near-instant but still click-free
    const INTRO_DELAY_BARS = 4;      // how long the cold-open instrument plays alone
    const REST_DELAY_BARS = 8;       // when the rest of the mix (chords + pool) enters

    class SoundscapeEngine {
        // pool: array of { cluster } descriptors from GenreEngine.allocateSlots,
        //   expanded 1 entry per slot (see main.js)
        // root: MIDI root note from MusicTheory.pickRootNote()
        // genreDiversity: number of distinct clusters present in the pool --
        //   drives how many layers are typically active at once
        // spotifyUserId: feeds ChordLayer's deterministic progression pick
        // dominantCluster: genre cluster with the highest weight -- picks
        //   which kit DrumLayer plays (see drum-patterns.js)
        // outputBus: shared Tone.js node all layers connect into
        // onProgressionChange: optional, forwarded to ChordLayer -- see
        //   its header for why this is event-driven rather than timer-based
        // onDrumPatternChange: optional, forwarded to DrumLayer, same reasoning
        // initialMode: optional -- defaults to a deterministic pick from
        //   dominantCluster's own idiomatic mode set (genre-modes.js),
        //   not a single global default. Lets a caller (e.g. main.js's
        //   debug randomize) pin a specific value instead of rolling one.
        // bpm: optional override of the computed tempo, same reasoning
        // introStyle: optional override of the randomly-picked opening
        //   style (see INTRO_STYLES above) -- same reasoning as bpm/
        //   initialMode, lets a caller pin a specific value instead of
        //   rolling one
        constructor({
            pool, root, genreDiversity, spotifyUserId, dominantCluster, outputBus,
            onProgressionChange, onDrumPatternChange,
            initialMode, bpm, introStyle,
        }) {
            this.root = root;
            this.dominantCluster = dominantCluster; // shuffle() needs this to stay within the genre's own idiomatic mode set
            // Deterministic per (user, cluster) -- same "consistently
            // yours" hashing as root note -- rather than always the same
            // global default (majorPentatonic) regardless of genre. See
            // genre-modes.js for the per-cluster idiomatic sets and the
            // reasoning behind each one.
            this.currentMode = initialMode ?? global.GenreModes.pickInitialMode(dominantCluster, spotifyUserId);
            this.genreDiversity = Math.max(1, genreDiversity);

            // Picked here, not in start(), because drumIntro needs to
            // reach DrumLayer's own constructor below (forceAudibleStart) --
            // see INTRO_STYLES above for what each style actually does.
            this.introStyle = introStyle ?? INTRO_STYLES[Math.floor(Math.random() * INTRO_STYLES.length)];

            // Real per-genre BPM (tempo-data.js, see there for the
            // Harmonix Set methodology) when the dominant cluster has
            // data; jazz/fallback don't, so they keep the ORIGINAL
            // deterministic-ish formula this whole computation used to
            // be, just stretched to span the now-wider MIN_BPM-MAX_BPM
            // range instead of a narrow fixed one. Computed here (not in
            // start()) so DrumLayer can pick its tempo-matched pattern at
            // construction time.
            this.bpm = bpm ?? global.TempoData.pickBpm(dominantCluster)
                ?? (MIN_BPM + Math.round((this.genreDiversity % 5) / 4 * (MAX_BPM - MIN_BPM)));

            this.layers = pool.map(
                (slot) => new global.GenerativeLayer({ cluster: slot.cluster, root, outputBus })
            );

            // harmonic + rhythmic anchors -- deliberately NOT part of
            // `this.layers`, see their file headers for why each is
            // excluded from the scheduler's add/remove/mutate cycle below
            this.bassLayer = new global.BassLayer({ root, dominantCluster, outputBus });
            this.chordLayer = new global.ChordLayer({
                root, spotifyUserId, outputBus, onProgressionChange, dominantCluster,
                // keeps BassLayer harmonically locked to whatever chord is
                // currently sounding -- see bass-layer.js's setChordRoot()
                onChordChange: (rootDegreeIndex, modeName) => this.bassLayer.setChordRoot(rootDegreeIndex, modeName),
            });
            this.drumLayer = new global.DrumLayer({
                dominantCluster, bpm: this.bpm, outputBus,
                onPatternChange: onDrumPatternChange,
                // sidechain: duck the chord pad off every real kick hit --
                // see chord-layer.js's duck() and drum-layer.js's onKick
                onKick: (time, velocity) => this.chordLayer.duck(time, velocity),
                // drumIntro needs drums immediately audible, not a coin
                // flip that might open on silence -- see INTRO_STYLES above
                forceAudibleStart: this.introStyle === "drumIntro",
            });

            // more distinct genres in your library -> more layers active at
            // once on average (richer texture), capped so it never gets
            // muddy regardless of how eclectic someone's taste is
            this.targetActiveCount = Math.min(5, Math.max(2, Math.round(this.genreDiversity * 0.8)));

            this._stepEventId = null;
            this._tickEventId = null;
            this._pendingIntroEventIds = []; // scheduleOnce() IDs from a staggered intro -- cleared in stop()
        }

        // Schedules `layer.fadeIn(fadeSeconds)` either right now
        // (delayBars === 0) or delayBars measures into the session --
        // Tone.js "Nm" transport-time strings resolve relative to
        // Transport position 0, which is where we are right now (called
        // before Transport.start() below), so this always lands on a real
        // bar boundary rather than an arbitrary wall-clock offset.
        _scheduleFadeIn(layer, delayBars, fadeSeconds) {
            if (delayBars === 0) {
                layer.fadeIn(fadeSeconds);
                return;
            }
            const id = Tone.Transport.scheduleOnce(() => layer.fadeIn(fadeSeconds), `${delayBars}m`);
            this._pendingIntroEventIds.push(id);
        }

        start() {
            Tone.Transport.bpm.value = this.bpm;

            // the pool layers that'll be active once everything's settled
            // in -- WHEN each one actually fades in depends on introStyle
            const initial = this._pickInactiveLayers(this.targetActiveCount);

            // See INTRO_STYLES above for what each style means musically.
            if (this.introStyle === "drumIntro") {
                this.drumLayer.fadeIn(QUICK_FADE_SECONDS); // alone, immediately, at full confidence
                this._scheduleFadeIn(this.bassLayer, INTRO_DELAY_BARS, QUICK_FADE_SECONDS);
                this._scheduleFadeIn(this.chordLayer, REST_DELAY_BARS, FADE_SECONDS);
                initial.forEach((layer) => this._scheduleFadeIn(layer, REST_DELAY_BARS, FADE_SECONDS));
            } else if (this.introStyle === "bassIntro") {
                this.bassLayer.fadeIn(QUICK_FADE_SECONDS); // alone, immediately -- moodier, harmonic-led open
                this._scheduleFadeIn(this.drumLayer, INTRO_DELAY_BARS, QUICK_FADE_SECONDS); // snapped in, not swelled
                this._scheduleFadeIn(this.chordLayer, REST_DELAY_BARS, FADE_SECONDS);
                initial.forEach((layer) => this._scheduleFadeIn(layer, REST_DELAY_BARS, FADE_SECONDS));
            } else {
                // ambientSwell -- the original behavior, everything together
                initial.forEach((layer) => layer.fadeIn(FADE_SECONDS));
                this.chordLayer.fadeIn(FADE_SECONDS);
                this.drumLayer.fadeIn(FADE_SECONDS);
                this.bassLayer.fadeIn(FADE_SECONDS);
            }

            this._stepEventId = Tone.Transport.scheduleRepeat((time) => {
                this.chordLayer.scheduleStep(time, this.currentMode);
                this.drumLayer.scheduleStep(time); // no mode arg -- rhythm is pitch/mode-independent
                this.bassLayer.scheduleStep(time);  // no mode arg -- follows ChordLayer's onChordChange instead
                for (const layer of this.layers) {
                    if (layer.active) layer.scheduleStep(time, this.currentMode);
                }
            }, "16n");

            this._tickEventId = Tone.Transport.scheduleRepeat(() => this._tick(), TICK_INTERVAL);

            Tone.Transport.start();
        }

        stop() {
            if (this._stepEventId !== null) Tone.Transport.clear(this._stepEventId);
            if (this._tickEventId !== null) Tone.Transport.clear(this._tickEventId);
            // a staggered intro (drumIntro/bassIntro) can still have a
            // delayed fadeIn() pending if Stop is hit in the first few
            // bars -- without this, it'd fire later on an already-disposed
            // layer
            this._pendingIntroEventIds.forEach((id) => Tone.Transport.clear(id));
            Tone.Transport.stop();
            this.layers.forEach((layer) => layer.dispose());
            this.chordLayer.dispose();
            this.drumLayer.dispose();
            this.bassLayer.dispose();
        }

        // Shuffle: advance to the next mode WITHIN dominantCluster's own
        // idiomatic set (genre-modes.js), not the old global 9-mode
        // cycle -- so shuffling a jazz session explores jazz's real
        // harmonic range instead of occasionally landing on something
        // that has nothing to do with how jazz actually sounds. Also
        // toggles the drum layer to its other pattern. Nothing else
        // changes -- see file header for why. ChordLayer notices the
        // mode change on its own next scheduleStep() call and swaps in
        // that mode's progression; DrumLayer queues its own pattern swap
        // for the next downbeat (see chord-layer.js / drum-layer.js).
        shuffle() {
            this.currentMode = global.GenreModes.nextMode(this.dominantCluster, this.currentMode);
            this.drumLayer.shuffle();
            return this.currentMode;
        }

        // Scheduler decision point, called every TICK_INTERVAL. Randomly
        // adds, removes, or mutates a layer, biased toward keeping the
        // active count near `targetActiveCount`.
        _tick() {
            const activeLayers = this.layers.filter((l) => l.active);
            const inactiveLayers = this.layers.filter((l) => !l.active);

            const roll = Math.random();
            const wantMoreLayers = activeLayers.length < this.targetActiveCount;
            const wantFewerLayers = activeLayers.length > this.targetActiveCount;

            if ((wantMoreLayers || roll < 0.33) && inactiveLayers.length > 0) {
                const layer = inactiveLayers[Math.floor(Math.random() * inactiveLayers.length)];
                layer.fadeIn(FADE_SECONDS);
            } else if ((wantFewerLayers || roll < 0.66) && activeLayers.length > MIN_ACTIVE_LAYERS) {
                const layer = activeLayers[Math.floor(Math.random() * activeLayers.length)];
                layer.fadeOut(FADE_SECONDS);
            } else if (activeLayers.length > 0) {
                // mutate: reseed one active layer's wander back to its seed
                // pattern plus a fresh random nudge, so it feels new without
                // a layer ever fully disappearing/reappearing. Only
                // meaningful for hand-authored (non-Markov) layers -- the
                // data-backed ones (see synth-layer.js) already get fresh
                // variation every single step from the Markov walk itself,
                // have no wanderedDegrees/degreePatternSeed to reseed, and
                // don't need this nudge.
                const mutable = activeLayers.filter((l) => !l.archetype.intervalMarkov);
                if (mutable.length > 0) {
                    const layer = mutable[Math.floor(Math.random() * mutable.length)];
                    layer.wanderedDegrees = layer.degreePatternSeed.map(
                        (d) => d + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0)
                    );
                }
            }
        }

        _pickInactiveLayers(count) {
            const inactive = this.layers.filter((l) => !l.active);
            // shuffle-sample without replacement
            for (let i = inactive.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [inactive[i], inactive[j]] = [inactive[j], inactive[i]];
            }
            return inactive.slice(0, count);
        }
    }

    global.SoundscapeEngine = SoundscapeEngine;
})(window);
