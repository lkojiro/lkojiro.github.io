// genre-lookup.js
//
// Client for the Cloudflare Worker proxy (cloudflare-worker/genre-lookup.js)
// that stands in for Spotify's own artist `genres` field, which stopped
// coming back populated for apps at our tier sometime in 2025/2026 --
// confirmed by real API responses showing `genres: undefined` even for
// mainstream artists. The Worker exists specifically because Last.fm
// (the actual source of the tag data) doesn't send CORS headers, so it
// can't be called directly from this static site's JS -- see the
// Worker's own file header for that story and for deploy steps.
//
// TODO: deploy the Worker and set PROXY_URL below to its address.

(function (global) {
    "use strict";

    const PROXY_URL = "https://purple-math-5765.lkojiro.workers.dev/"; // e.g. https://genre-lookup.yoursubdomain.workers.dev

    // artistNames: array of strings. Returns { [name]: string[] } -- every
    // requested name gets a key, empty array if nothing was found, so
    // callers never need an extra "did this artist come back" check.
    //
    // Fails soft: an unconfigured PROXY_URL, a network error, or the
    // Worker being down all resolve to an all-empty map rather than
    // throwing -- this project worked (falling back to the generic
    // instrument archetype) before this file existed, so a broken proxy
    // should degrade back to that, not break the whole page.
    async function fetchGenreTags(artistNames) {
        const empty = Object.fromEntries(artistNames.map((name) => [name, []]));
        if (!PROXY_URL || PROXY_URL.startsWith("REPLACE_")) {
            console.warn("genre-lookup: PROXY_URL not configured yet -- skipping third-party genre lookup. See cloudflare-worker/genre-lookup.js.");
            return empty;
        }

        try {
            const response = await fetch(PROXY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ artists: artistNames }),
            });
            if (!response.ok) throw new Error(`genre-lookup proxy returned ${response.status}`);
            const { tags } = await response.json();
            return { ...empty, ...tags };
        } catch (err) {
            console.warn("genre-lookup: proxy call failed, continuing without third-party genre data --", err);
            return empty;
        }
    }

    global.GenreLookup = { fetchGenreTags };
})(window);
