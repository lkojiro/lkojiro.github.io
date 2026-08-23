// chord-progressions.js
//
// Five 4-chord progressions per mode, 4/4 time, one chord per measure
// (4 measures per full loop). Every chord is built the same way for every
// mode -- stack scale-degree indices a third apart (root, root+2, root+4,
// wrapping into the next octave past the end of the scale array) -- so
// chord quality (major/minor/diminished/etc.) falls out automatically
// from each mode's actual interval pattern instead of being hand-typed
// per chord. That's the same trick synth-layer.js already uses for
// melodic degrees, just applied to three degrees at once.
//
// Progressions are stored as ROOT DEGREE INDICES ONLY (e.g. [0, 4, 5, 3]
// for a I-V-vi-IV loop in a 7-note mode) -- realizeProgression() below is
// what turns that into actual MIDI notes for a given session's root note.
// Nothing here is wired into the live soundscape engine yet; this is the
// data + realization helpers, ready to plug into a future chord/pad layer.
//
// Depends on: music-theory.js

(function (global) {
    "use strict";

    const { MODES, degreeToNote } = global.MusicTheory;

    // Given a chord's root scale-degree index, return the 3 degree indices
    // stacked a third apart within that mode -- e.g. in Ionian, root index
    // 0 -> [0, 2, 4], which is scale degrees 1-3-5, i.e. a plain I triad.
    function chordDegreeIndices(rootIndex, modeName) {
        return [rootIndex, rootIndex + 2, rootIndex + 4];
    }

    // Root degree index -> actual MIDI notes for one chord, given the
    // session's root note (see MusicTheory.pickRootNote).
    function realizeChord(rootIndex, modeName, sessionRoot) {
        return chordDegreeIndices(rootIndex, modeName).map((d) => degreeToNote(d, modeName, sessionRoot));
    }

    // A whole 4-chord progression -> 4 arrays of MIDI notes, one per
    // measure, in order.
    function realizeProgression(progression, modeName, sessionRoot) {
        return progression.rootDegrees.map((rootIndex) => realizeChord(rootIndex, modeName, sessionRoot));
    }

    // -- Progressions, 5 per mode -----------------------------------------
    // Root degree indices refer to position in that mode's MODES[...] array
    // (see music-theory.js). Heptatonic modes (7 degrees) get standard
    // diatonic-feeling progressions labeled with their functional roman
    // numerals in comments; the two pentatonic modes (5 degrees) naturally
    // stack into open/quartal "sus"-flavored chords instead of plain
    // triads, which is expected -- pentatonic scales don't contain a 4th
    // or 7th degree (major) / 2nd or 6th (minor) to build a full tertian
    // triad on every root, so the color is intentionally airier.
    const CHORD_PROGRESSIONS = {
        // I6-ii(sus)-iii(sus)-V6-vi(sus), all consonant -- default landing
        // mode, so every progression here is deliberately warm/open, no
        // tension tones at all (major pentatonic has none to begin with).
        majorPentatonic: [
            { label: "Open & bright", rootDegrees: [0, 3, 4, 1] },   // I-V-vi-ii
            { label: "Warm loop", rootDegrees: [0, 4, 1, 3] },       // I-vi-ii-V
            { label: "Floating pop", rootDegrees: [4, 0, 3, 1] },    // vi-I-V-ii
            { label: "Gentle rise", rootDegrees: [1, 2, 3, 0] },     // ii-iii-V-I
            { label: "Home base", rootDegrees: [0, 1, 0, 3] },       // I-ii-I-V
        ],
        // I(maj) II(maj) iii(min) V(maj) vi(min) vii(min) -- raised 4th
        // (index 3) deliberately avoided as a chord ROOT below, it's an
        // unstable "avoid" tone; still fine as a passing melody note
        // elsewhere in a layer, just not as harmonic ground.
        lydian: [
            { label: "Lydian brightness", rootDegrees: [0, 1, 4, 0] }, // I-II-V-I
            { label: "Floaty pop", rootDegrees: [0, 4, 5, 1] },        // I-V-vi-II
            { label: "Dreamy vamp", rootDegrees: [5, 1, 0, 4] },       // vi-II-I-V
            { label: "Ascending glow", rootDegrees: [2, 4, 5, 0] },    // iii-V-vi-I
            { label: "Suspended wonder", rootDegrees: [0, 1, 2, 4] },  // I-II-iii-V
        ],
        // I(maj) ii(min) iii°(dim) IV(maj) v(min) vi(min) bVII(maj) --
        // the minor v and major bVII are Mixolydian's signature colors;
        // iii° skipped as a root (only diminished triad in the mode).
        mixolydian: [
            { label: "Classic rock vamp", rootDegrees: [0, 6, 3, 0] }, // I-bVII-IV-I
            { label: "Uplifting mixolydian", rootDegrees: [0, 3, 6, 3] }, // I-IV-bVII-IV
            { label: "Floating groove", rootDegrees: [0, 4, 6, 3] },   // I-v-bVII-IV
            { label: "Anthemic", rootDegrees: [5, 6, 0, 3] },          // vi-bVII-I-IV
            { label: "Warm loop", rootDegrees: [0, 1, 3, 6] },         // I-ii-IV-bVII
        ],
        // I(maj) ii(min) iii(min) IV(maj) V(maj) vi(min) vii°(dim) --
        // plain major-key harmony, the textbook stuff.
        ionian: [
            { label: "Axis", rootDegrees: [0, 4, 5, 3] },        // I-V-vi-IV
            { label: "50s / doo-wop", rootDegrees: [0, 5, 3, 4] }, // I-vi-IV-V
            { label: "Pop-punk", rootDegrees: [5, 3, 0, 4] },    // vi-IV-I-V
            { label: "Jazzy turnaround", rootDegrees: [1, 4, 0, 5] }, // ii-V-I-vi
            { label: "Uplifting plagal", rootDegrees: [3, 0, 4, 5] }, // IV-I-V-vi
        ],
        // i(min) ii(min) bIII(maj) IV(maj) v(min) vi°(dim) bVII(maj) --
        // the major IV built on a minor tonic is Dorian's signature color.
        dorian: [
            { label: "Dorian vamp", rootDegrees: [0, 3, 0, 3] },     // i-IV-i-IV
            { label: "Modal groove", rootDegrees: [0, 6, 3, 0] },    // i-bVII-IV-i
            { label: "Floating minor", rootDegrees: [0, 2, 3, 4] },  // i-bIII-IV-v
            { label: "Santana-esque", rootDegrees: [0, 3, 6, 3] },   // i-IV-bVII-IV
            { label: "Melancholic lift", rootDegrees: [4, 6, 0, 3] }, // v-bVII-i-IV
        ],
        // i(sus/quartal) bIII6 iv(sus) v(sus) bVII6 -- riff/ostinato
        // territory rather than functional cadences, same reasoning as
        // majorPentatonic above but darker since the underlying scale is.
        minorPentatonic: [
            { label: "Blues-rock riff", rootDegrees: [0, 2, 3, 2] },  // i-iv-v-iv
            { label: "Modal drone", rootDegrees: [0, 0, 2, 3] },      // i-i-iv-v
            { label: "Uplifted minor", rootDegrees: [0, 1, 2, 3] },   // i-bIII-iv-v
            { label: "Descending vamp", rootDegrees: [3, 2, 1, 0] },  // v-iv-bIII-i
            { label: "Open riff", rootDegrees: [0, 3, 4, 2] },        // i-v-bVII-iv
        ],
        // i(min) ii°(dim) bIII(maj) iv(min) v(min) bVI(maj) bVII(maj) --
        // textbook natural-minor harmony.
        aeolian: [
            { label: "Emotional minor", rootDegrees: [0, 5, 2, 6] }, // i-bVI-bIII-bVII
            { label: "Andalusian-ish", rootDegrees: [0, 6, 5, 4] },  // i-bVII-bVI-v
            { label: "Sad pop", rootDegrees: [0, 3, 6, 2] },         // i-iv-bVII-bIII
            { label: "Rising minor", rootDegrees: [5, 6, 0, 3] },    // bVI-bVII-i-iv
            { label: "Circling", rootDegrees: [0, 3, 4, 0] },        // i-iv-v-i
        ],
        // i(min) bII(maj) bIII(maj) iv(min) v°(dim) bVI(maj) bvii(min) --
        // the major bII is THE Phrygian signature (flamenco-cadence color).
        // Reached only via Shuffle, so leaning into the tension is fine.
        phrygian: [
            { label: "Phrygian cadence", rootDegrees: [0, 1, 0, 1] },  // i-bII-i-bII
            { label: "Flamenco-esque", rootDegrees: [0, 6, 5, 1] },    // i-bVII-bVI-bII
            { label: "Dark descent", rootDegrees: [0, 5, 1, 0] },      // i-bVI-bII-i
            { label: "Tense vamp", rootDegrees: [0, 3, 1, 0] },        // i-iv-bII-i
            { label: "Exotic loop", rootDegrees: [2, 1, 0, 5] },       // bIII-bII-i-bVI
        ],
        // i°(dim) bII(maj) biii(min) iv(min) bV(maj) bVI(maj) bvii(min) --
        // the tonic triad itself is diminished, so there's no truly
        // "resolved" chord to land on -- that instability IS the mode;
        // last stop in the shuffle cycle for exactly that reason.
        locrian: [
            { label: "Unstable drift", rootDegrees: [0, 1, 5, 4] },   // i°-bII-bVI-bV
            { label: "Suspended tension", rootDegrees: [1, 3, 0, 5] }, // bII-iv-i°-bVI
            { label: "Shifting ground", rootDegrees: [6, 4, 1, 0] },  // bvii-bV-bII-i°
            { label: "Circling unease", rootDegrees: [0, 6, 5, 4] },  // i°-bvii-bVI-bV
            { label: "Distant color", rootDegrees: [2, 4, 5, 1] },    // biii-bV-bVI-bII
        ],
    };

    global.ChordProgressions = {
        CHORD_PROGRESSIONS,
        chordDegreeIndices,
        realizeChord,
        realizeProgression,
    };
})(window);
