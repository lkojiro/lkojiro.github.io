// music-theory.js
//
// Pure, dependency-free helpers for turning "scale degree" numbers into
// actual MIDI note numbers. Nothing in here touches Tone.js or the DOM —
// it's the one module every other piece (layers, scheduler, shuffle
// button) calls through, so pitch logic lives in exactly one place.

(function (global) {
    "use strict";

    // Modes ordered light -> dark. Shuffle steps through this order so
    // repeated clicks read as a legible journey instead of pure noise.
    // Values are semitone offsets from the root.
    const MODES = {
        majorPentatonic: [0, 2, 4, 7, 9],       // default landing mode (safe zone)
        lydian:          [0, 2, 4, 6, 7, 9, 11],
        mixolydian:      [0, 2, 4, 5, 7, 9, 10],
        ionian:          [0, 2, 4, 5, 7, 9, 11], // plain major
        dorian:          [0, 2, 3, 5, 7, 9, 10],
        minorPentatonic: [0, 3, 5, 7, 10],
        aeolian:         [0, 2, 3, 5, 7, 8, 10], // natural minor
        phrygian:        [0, 1, 3, 5, 7, 8, 10],
        locrian:         [0, 1, 3, 5, 6, 8, 10], // most unstable, last in the cycle
    };

    const MODE_NAMES = Object.keys(MODES);
    const DEFAULT_MODE = "majorPentatonic";

    // Deterministic 32-bit string hash (FNV-1a). Same input -> same output,
    // every time, on every visit -- that's what lets us give a visitor a
    // "signature" root note without storing anything server-side.
    function fnv1aHash(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            // 32-bit FNV prime multiply, done via shifts to avoid overflow
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return hash >>> 0; // force unsigned
    }

    // Root note is chosen once per Spotify user ID and never changes again
    // for that user (shuffle only ever touches mode, never root). Centered
    // on C3 (MIDI 48) per the "not important for timbre, just nice to have
    // two people land on different notes" goal -- full chromatic spread,
    // no curated subset needed since the mode/tempo safe-zone already does
    // the work of keeping things pleasant.
    function pickRootNote(spotifyUserId) {
        const semitoneOffset = fnv1aHash(spotifyUserId) % 12; // 0-11
        return 48 + semitoneOffset; // MIDI note, C3-B3
    }

    // Map a scale-degree index (0, 1, 2, 3, ...) to a concrete MIDI note.
    // Degree indices are allowed to run past the length of the scale --
    // they just wrap into the next octave -- which is what lets the same
    // fixed degree *pattern* sound sensible across scales of different
    // lengths (pentatonic = 5 notes, heptatonic modes = 7).
    function degreeToNote(degreeIndex, modeName, root) {
        const scale = MODES[modeName] ?? MODES[DEFAULT_MODE];
        const octaveShift = Math.floor(degreeIndex / scale.length);
        const step = scale[((degreeIndex % scale.length) + scale.length) % scale.length];
        return root + step + 12 * octaveShift;
    }

    // Picks the next mode for the Shuffle button. Steps forward through
    // MODE_NAMES (light -> dark) rather than pure random, so hammering the
    // button feels like a directed journey; wraps back to the start after
    // Locrian.
    function nextMode(currentModeName) {
        const i = MODE_NAMES.indexOf(currentModeName);
        return MODE_NAMES[(i + 1) % MODE_NAMES.length];
    }

    global.MusicTheory = {
        MODES,
        MODE_NAMES,
        DEFAULT_MODE,
        fnv1aHash,
        pickRootNote,
        degreeToNote,
        nextMode,
    };
})(window);
