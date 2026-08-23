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
// Depends on: Tone.js, music-theory.js, genre-engine.js, synth-layer.js,
// chord-layer.js, drum-layer.js

(function (global) {
    "use strict";

    const MIN_BPM = 100;
    const MAX_BPM = 110;
    const TICK_INTERVAL = "8m"; // scheduler decision cadence: every 8 bars
    const FADE_SECONDS = 30;    // layer fade in/out duration -- this IS the
                                 // "crossfade", just baked into every layer's
                                 // own lifecycle instead of being shuffle's job
    const MIN_ACTIVE_LAYERS = 1;

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
        // initialMode: optional, defaults to MusicTheory.DEFAULT_MODE -- lets
        //   a caller (e.g. main.js's debug randomize) start somewhere other
        //   than the safe-zone default without needing to call shuffle()
        //   repeatedly after construction
        // bpm: optional override of the computed tempo, same reasoning
        constructor({
            pool, root, genreDiversity, spotifyUserId, dominantCluster, outputBus,
            onProgressionChange, onDrumPatternChange,
            initialMode = global.MusicTheory.DEFAULT_MODE, bpm,
        }) {
            this.root = root;
            this.currentMode = initialMode;
            this.genreDiversity = Math.max(1, genreDiversity);

            // deterministic-ish tempo pick within the fixed safe-zone range;
            // fine to make this data-driven later (e.g. nudge by diversity),
            // kept as a flat midpoint-ish value for now to keep the scaffold
            // simple. Computed here (not in start()) so DrumLayer can pick
            // its tempo-matched pattern at construction time.
            this.bpm = bpm ?? (MIN_BPM + Math.round((this.genreDiversity % 5) / 4 * (MAX_BPM - MIN_BPM)));

            this.layers = pool.map(
                (slot) => new global.GenerativeLayer({ cluster: slot.cluster, root, outputBus })
            );

            // harmonic + rhythmic anchors -- deliberately NOT part of
            // `this.layers`, see their file headers for why each is
            // excluded from the scheduler's add/remove/mutate cycle below
            this.chordLayer = new global.ChordLayer({ root, spotifyUserId, outputBus, onProgressionChange });
            this.drumLayer = new global.DrumLayer({
                dominantCluster, bpm: this.bpm, outputBus,
                onPatternChange: onDrumPatternChange,
                // sidechain: duck the chord pad off every real kick hit --
                // see chord-layer.js's duck() and drum-layer.js's onKick
                onKick: (time, velocity) => this.chordLayer.duck(time, velocity),
            });

            // more distinct genres in your library -> more layers active at
            // once on average (richer texture), capped so it never gets
            // muddy regardless of how eclectic someone's taste is
            this.targetActiveCount = Math.min(5, Math.max(2, Math.round(this.genreDiversity * 0.8)));

            this._stepEventId = null;
            this._tickEventId = null;
        }

        start() {
            Tone.Transport.bpm.value = this.bpm;

            // bring in the first few layers immediately so the page doesn't
            // open in silence, plus the chord/drum layers -- which, unlike
            // the pool, fade in once here and are never faded out again
            const initial = this._pickInactiveLayers(this.targetActiveCount);
            initial.forEach((layer) => layer.fadeIn(FADE_SECONDS));
            this.chordLayer.fadeIn(FADE_SECONDS);
            this.drumLayer.fadeIn(FADE_SECONDS);

            this._stepEventId = Tone.Transport.scheduleRepeat((time) => {
                this.chordLayer.scheduleStep(time, this.currentMode);
                this.drumLayer.scheduleStep(time); // no mode arg -- rhythm is pitch/mode-independent
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
            Tone.Transport.stop();
            this.layers.forEach((layer) => layer.dispose());
            this.chordLayer.dispose();
            this.drumLayer.dispose();
        }

        // Shuffle: advance to the next mode, and toggle the drum layer to
        // its other pattern. Nothing else changes -- see file header for
        // why. ChordLayer notices the mode change on its own next
        // scheduleStep() call and swaps in that mode's progression;
        // DrumLayer queues its own pattern swap for the next downbeat
        // (see chord-layer.js / drum-layer.js).
        shuffle() {
            this.currentMode = global.MusicTheory.nextMode(this.currentMode);
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
                // a layer ever fully disappearing/reappearing
                const layer = activeLayers[Math.floor(Math.random() * activeLayers.length)];
                layer.wanderedDegrees = layer.degreePatternSeed.map(
                    (d) => d + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0)
                );
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
