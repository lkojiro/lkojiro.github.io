// spotify-data.js
//
// Thin wrappers around the Spotify Web API endpoints this project actually
// needs. Deliberately small -- see project notes on why /audio-features
// and /audio-analysis are NOT used here: Spotify deprecated both for new
// apps in Nov 2024, so all of this project's "sound" comes from genre tags
// and listening-history metadata instead, not pre-computed audio DNA.
//
// Depends on: spotify-auth.js for the access token (and for
// refreshAccessToken(), used below to self-heal an expired one).

(function (global) {
    "use strict";

    const API_BASE = "https://api.spotify.com/v1";

    // fetchLibrarySnapshot() below fires several requests in parallel, so
    // if the access token expires mid-batch, more than one can hit a 401
    // at once. Without this, each would independently call
    // refreshAccessToken(), racing to use the same refresh token -- if
    // Spotify rotates it on use (common for refresh tokens), the second
    // caller's refresh could fail using an already-invalidated token even
    // though the first one just succeeded. Sharing one in-flight promise
    // means concurrent 401s all await the SAME refresh instead of each
    // starting their own.
    let refreshPromise = null;

    // A 401 here specifically means "this access token is no good" (as
    // opposed to a 403, which means the token's fine but isn't allowed to
    // do this) -- access tokens expire after ~1 hour, and this project
    // stays open/playing far longer than that in normal use. On a 401,
    // silently refresh once via the stored refresh token and retry the
    // SAME request; only surface an error if that retry also fails (or if
    // there was no refresh token to use, which means a real reconnect is
    // needed -- see spotify-auth.js's refreshAccessToken).
    async function apiGet(path, { isRetry = false } = {}) {
        const token = global.SpotifyAuth.getAccessToken();
        if (!token) throw new Error("Not connected to Spotify yet.");

        const response = await fetch(`${API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401 && !isRetry) {
            if (!refreshPromise) {
                refreshPromise = global.SpotifyAuth.refreshAccessToken().finally(() => {
                    refreshPromise = null;
                });
            }
            const refreshed = await refreshPromise;
            if (refreshed) return apiGet(path, { isRetry: true });
            throw new Error("Spotify session expired and couldn't be refreshed -- reconnect needed.");
        }

        if (!response.ok) {
            throw new Error(`Spotify API error ${response.status} on ${path}: ${await response.text()}`);
        }
        return response.json();
    }

    // Current user's profile -- mainly used for `.id`, which feeds
    // MusicTheory.pickRootNote() so the root note is stable across visits.
    function getCurrentUser() {
        return apiGet("/me");
    }

    // Top artists, in rank order, over the given time_range:
    //   short_term (~4 weeks) | medium_term (~6 months) | long_term (years)
    // medium_term is the default here -- long enough to reflect "your
    // library" rather than this week's mood, short enough to feel current.
    async function getTopArtists(timeRange = "medium_term", limit = 50) {
        const data = await apiGet(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);
        return data.items; // each has .id, .name, .popularity -- .genres is NOT reliable, see genre-lookup.js
    }

    // Saved ("liked") tracks, most-recently-added first. Each item has
    // `.added_at`, which is what drives the layer-introduction pacing in
    // soundscape-engine.js (an actively growing library churns faster).
    async function getSavedTracks(limit = 50) {
        const data = await apiGet(`/me/tracks?limit=${limit}`);
        return data.items; // each has .added_at and .track
    }

    // Spotify's per-artist `genres` field has long been sparse (reliably
    // populated for major-label/mainstream artists, frequently empty for
    // independent ones -- https://github.com/spotify/web-api/issues/312),
    // and as of the app's current tier it's often just gone entirely --
    // real responses come back `genres: undefined`, not `genres: []`,
    // even for mainstream artists (The Strokes, etc.). See genre-lookup.js
    // for the actual fix (a Last.fm-backed proxy, looked up by artist
    // name for exactly these 50 top artists).
    //
    // An earlier version of this file also fetched up to 30 more artists
    // from the saved-tracks library (one Spotify request per artist, no
    // batch endpoint anymore) to widen the genre-lookup sample beyond the
    // top 50. Removed: the Cloudflare Worker doing the actual Last.fm
    // lookups hits Cloudflare's free-tier cap of 50 subrequests per
    // invocation regardless, so anything past the first 50 names sent to
    // it was silently failing anyway -- the top 50 was always the real
    // ceiling here, just not an obvious one until we hit it twice.

    // Convenience bundle: everything main.js needs to build a soundscape,
    // fetched in parallel.
    async function fetchLibrarySnapshot() {
        const [user, topArtists, savedTracks] = await Promise.all([
            getCurrentUser(),
            getTopArtists(),
            getSavedTracks(),
        ]);
        return { user, topArtists, savedTracks };
    }

    global.SpotifyData = {
        getCurrentUser,
        getTopArtists,
        getSavedTracks,
        fetchLibrarySnapshot,
    };
})(window);
