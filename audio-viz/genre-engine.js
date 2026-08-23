// genre-engine.js
//
// Turns Spotify's raw, extremely granular genre tags ("pov: indie",
// "bedroom pop", "german death metal") into a small set of clusters we
// actually have instrument archetypes for, then turns a user's cluster
// mix into a weighted instrument-layer pool.
//
// No Tone.js or DOM dependency here on purpose -- this is pure data
// transformation and is unit-testable on its own.

(function (global) {
    "use strict";

    // Keyword -> cluster lookup. A genre tag matches a cluster if it
    // *contains* any of these substrings. Order doesn't matter; a tag can
    // match multiple clusters (e.g. "indie pop" hits both indie and pop).
    // Extend this list over time as you see real Spotify tags come through
    // that aren't landing anywhere useful.
    const GENRE_KEYWORDS = {
        pop:        ["pop", "dance pop", "electropop"],
        hiphop:     ["hip hop", "rap", "trap", "r&b", "soul"],
        electronic: ["edm", "house", "techno", "electronic", "dubstep", "dnb", "drum and bass"],
        indie:      ["indie", "bedroom", "alternative", "alt "],
        rock:       ["rock", "metal", "punk", "grunge", "hardcore"],
        jazz:       ["jazz", "classical", "orchestral", "instrumental", "piano"],
        folk:       ["folk", "acoustic", "singer-songwriter", "americana"],
    };

    const CLUSTER_NAMES = Object.keys(GENRE_KEYWORDS);
    const FALLBACK_CLUSTER = "fallback"; // used when a genre tag (or an artist with no tags) matches nothing

    // Given an artist's raw `genres` array from the Spotify API, return the
    // list of clusters it belongs to. Falls back to a generic bucket so no
    // artist is ever silently dropped from the weighting.
    function classifyGenres(genreTags) {
        if (!genreTags || genreTags.length === 0) return [FALLBACK_CLUSTER];

        const matched = new Set();
        for (const tag of genreTags) {
            const lower = tag.toLowerCase();
            for (const cluster of CLUSTER_NAMES) {
                if (GENRE_KEYWORDS[cluster].some((kw) => lower.includes(kw))) {
                    matched.add(cluster);
                }
            }
        }
        return matched.size > 0 ? Array.from(matched) : [FALLBACK_CLUSTER];
    }

    // Rank-decayed genre-cluster weighting: a user's #1 artist should count
    // for a lot more than their #50, so weight by 1/sqrt(rank) rather than
    // a flat count. Returns proportions that sum to 1.
    //
    // topArtists: array of Spotify artist objects, IN RANK ORDER, each with
    // a `.genres` string array (as returned by GET /v1/me/top/artists).
    function computeGenreWeights(topArtists) {
        const clusterWeights = {};

        topArtists.forEach((artist, i) => {
            const rankWeight = 1 / Math.sqrt(i + 1); // #1 counts ~7x more than #50
            const clusters = classifyGenres(artist.genres);
            for (const cluster of clusters) {
                // split the artist's weight evenly across every cluster it matched
                clusterWeights[cluster] = (clusterWeights[cluster] ?? 0) + rankWeight / clusters.length;
            }
        });

        const total = Object.values(clusterWeights).reduce((a, b) => a + b, 0) || 1;
        const proportions = {};
        for (const [cluster, w] of Object.entries(clusterWeights)) {
            proportions[cluster] = w / total;
        }
        return proportions;
    }

    // Largest-remainder (Hamilton) apportionment: turns fractional
    // proportions into integer slot counts that sum EXACTLY to poolSize,
    // without the drift naive Math.round() would introduce.
    //
    // Returns an array of [clusterName, slotCount] pairs, biggest first,
    // clusters with 0 slots omitted.
    function allocateSlots(proportions, poolSize) {
        const entries = Object.entries(proportions).map(([cluster, p]) => {
            const exact = p * poolSize;
            return { cluster, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
        });

        // guard: a brand-new Spotify account with no listening history yet
        // has zero top artists, so `proportions` can legitimately be empty
        if (entries.length === 0) return [[FALLBACK_CLUSTER, poolSize]];

        let allocated = entries.reduce((sum, e) => sum + e.floor, 0);

        // hand out the leftover slots to whoever has the largest fractional
        // remainder, until we've allocated exactly poolSize slots total
        entries.sort((a, b) => b.remainder - a.remainder);
        for (let i = 0; allocated < poolSize; i++, allocated++) {
            entries[i % entries.length].floor += 1;
        }

        return entries
            .filter((e) => e.floor > 0)
            .sort((a, b) => b.floor - a.floor)
            .map((e) => [e.cluster, e.floor]);
    }

    // Convenience wrapper: top artists in, weighted instrument-slot
    // allocation out. This is the thing main.js actually calls.
    function buildGenreAllocation(topArtists, poolSize) {
        const proportions = computeGenreWeights(topArtists);
        return {
            proportions,                              // useful for the "sound receipt" UI panel
            slots: allocateSlots(proportions, poolSize), // useful for building the layer pool
        };
    }

    global.GenreEngine = {
        GENRE_KEYWORDS,
        CLUSTER_NAMES,
        FALLBACK_CLUSTER,
        classifyGenres,
        computeGenreWeights,
        allocateSlots,
        buildGenreAllocation,
    };
})(window);
