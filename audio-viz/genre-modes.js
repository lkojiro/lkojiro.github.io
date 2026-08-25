// genre-modes.js
//
// Per-genre idiomatic mode sets -- until now, mode was completely
// mode-agnostic with respect to genre: every session started on the same
// majorPentatonic default and Shuffle cycled through the identical
// light->dark 9-mode list (music-theory.js's MODE_NAMES) regardless of
// dominant cluster. Real genres are not mode-agnostic -- pop leans hard
// major/Ionian, rock riffs lean pentatonic, tech house basslines lean
// Phrygian, modal jazz IS Dorian, neo-soul leans Dorian, folk has its own
// well-known "folk modes" (Mixolydian, Dorian) -- so a global one-size
// cycle was always going to occasionally land a cluster on a mode that
// has nothing to do with how that genre actually sounds (see: Dorian
// landing under jazz's melodic-data.js content and reading as
// harmonically aimless, since jazz's real melodic-motion data has no
// idea Dorian's characteristic natural-6th color tone even exists).
//
// -- Why hand-authored, not derived from a dataset --------------------
// Same split every other timbre/design file in this project makes.
// Genuine MODE identification (Dorian vs Aeolian, Mixolydian vs Ionian --
// distinctions beyond a basic major/minor key signature) requires real
// pitch-content analysis this project's datasets don't support: GMD is
// drums-only (no pitch content at all), Harmonix Set has no key/mode
// info, and while LMD's MIDI files CAN carry a key_signature meta-event,
// that only encodes major-vs-relative-minor -- standard MIDI key
// signatures don't distinguish a mode from its relative major/minor at
// all, so it couldn't tell Dorian from Aeolian even if every file
// reliably had one (most crowd-sourced LMD files don't). This is a
// genre-convention judgment call, grounded in real, well-established
// music theory per genre, not a guess -- same footing as this project's
// hand-authored timbre files.
//
// -- What changes, what doesn't --------------------------------------
// Chord progressions (chord-progressions.js) and the Markov melodic walk
// (melodic-data.js) are UNCHANGED -- still one progression set and one
// statistical shape per mode/cluster respectively, reused as before.
// What's new: WHICH modes a session is allowed to land on in the first
// place, so the underlying content always gets reinterpreted through a
// mode that's actually idiomatic for that genre.
//
// fallback keeps the ORIGINAL global 9-mode cycle (music-theory.js's
// MODE_NAMES) unrestricted -- there's no real genre signal to narrow it
// with when nothing classified, so narrowing it would just be another
// guess layered on top of an already-unclassified library.
//
// Depends on: music-theory.js (MODES/MODE_NAMES, fnv1aHash)

(function (global) {
    "use strict";

    // cluster -> ordered array of MODES keys (music-theory.js) this
    // genre is actually idiomatic in. Order matters for Shuffle's cycle
    // (still roughly light -> dark within each list, same spirit as the
    // original global cycle) but not for the initial pick, which is
    // hashed, not sequential.
    const GENRE_MODES = {
        // Bright, major-leaning -- the classic pop hook sound, with
        // mixolydian for a little pop-rock edge at the darker end.
        pop: ["majorPentatonic", "ionian", "mixolydian"],
        // Minor-pentatonic and Aeolian trap/boom-bap convention, Dorian
        // for a neo-soul-adjacent lift, Phrygian for the darker/trap end.
        hiphop: ["minorPentatonic", "aeolian", "dorian", "phrygian"],
        // The user's own example: tech house/techno basslines lean
        // Phrygian; house/techno more broadly leans minor-key (Aeolian,
        // Dorian for melodic techno/deep house).
        electronic: ["phrygian", "aeolian", "dorian", "minorPentatonic"],
        // Eclectic by nature -- kept lighter-leaning and open rather than
        // pinned to one strong convention, the way indie's other
        // hand-authored data (instrument-archetypes.js, etc.) already is.
        indie: ["majorPentatonic", "ionian", "mixolydian", "dorian"],
        // Pentatonic riffs (major and minor) are rock's own core
        // vocabulary; Mixolydian for blues-rock, Aeolian for rock in a
        // minor key.
        rock: ["majorPentatonic", "minorPentatonic", "mixolydian", "aeolian"],
        // The widest palette here, deliberately -- reflects jazz's real
        // harmonic range rather than picking one "jazz mode." Dorian
        // (modal jazz, ii chords), Mixolydian (dominant/V7), Lydian
        // (major 7 chords), Aeolian/Ionian, Phrygian (altered dominants),
        // Locrian (half-diminished ii in a minor key) are all genuinely
        // idiomatic. The two pentatonics are left out -- not because
        // they never appear in jazz, but because they read as more
        // blues/rock-flavored than jazz-specific.
        jazz: ["dorian", "mixolydian", "lydian", "aeolian", "ionian", "phrygian", "locrian"],
        // Mixolydian and Dorian are literally called "the folk modes" in
        // a lot of music-theory writing (Celtic/Appalachian/British folk
        // tunes lean on both constantly); Aeolian and major pentatonic
        // (old-time/bluegrass) round it out.
        folk: ["mixolydian", "dorian", "aeolian", "majorPentatonic"],
        // Dark and aggressive: natural minor is metal's home base,
        // Phrygian (and its "Spanish"/neoclassical cousin) is THE
        // classic metal exotic-and-aggressive sound, Locrian for the
        // most unstable/dissonant end, minor pentatonic for riffing.
        metal: ["aeolian", "phrygian", "locrian", "minorPentatonic"],
        // Dorian is neo-soul's signature color (that "smooth but not
        // quite major or minor" quality); Aeolian and Mixolydian for
        // more classic R&B, major pentatonic for the smoothest end.
        rnb: ["dorian", "aeolian", "mixolydian", "majorPentatonic"],
        // Funk lives on dominant-7 one-chord vamps (James Brown-style
        // Mixolydian) and minor vamps (Herbie Hancock's "Chameleon" is
        // Dorian) -- both are core funk vocabulary, plus minor
        // pentatonic for riffing.
        funk: ["mixolydian", "dorian", "minorPentatonic"],
        // Latin urban's minor-key/"Spanish" Phrygian-flavored harmonic
        // language, plus straightforward Aeolian/minor pentatonic.
        reggaeton: ["minorPentatonic", "aeolian", "phrygian"],
    };

    function modesFor(cluster) {
        // fallback (or anything unrecognized) gets the full, unrestricted
        // original cycle -- see file header for why.
        return GENRE_MODES[cluster] ?? global.MusicTheory.MODE_NAMES;
    }

    // Deterministic per (user, cluster) -- same hashing trick as
    // MusicTheory.pickRootNote/ChordLayer's progression pick, so a given
    // visitor always lands on the same starting mode for their real
    // dominant genre, consistently "theirs" across visits, same as root
    // note already is.
    function pickInitialMode(cluster, spotifyUserId) {
        const modes = modesFor(cluster);
        const index = global.MusicTheory.fnv1aHash(spotifyUserId + cluster) % modes.length;
        return modes[index];
    }

    // Shuffle's cycle, scoped to this cluster's idiomatic set instead of
    // the global 9-mode list -- wraps back to the start after the last
    // one, same "journey" spirit as MusicTheory.nextMode(), just over a
    // genre-appropriate subset instead of everything. If currentModeName
    // isn't actually in this cluster's list for some reason, indexOf's
    // -1 lands on modes[0] (( -1 + 1 ) % length === 0) -- a graceful
    // restart rather than a crash.
    function nextMode(cluster, currentModeName) {
        const modes = modesFor(cluster);
        const i = modes.indexOf(currentModeName);
        return modes[(i + 1) % modes.length];
    }

    global.GenreModes = { modesFor, pickInitialMode, nextMode };
})(window);
