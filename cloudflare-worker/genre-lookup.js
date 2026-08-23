// Cloudflare Worker: genre-lookup proxy
//
// Spotify's Web API stopped returning artist `genres` data for apps at
// our tier -- confirmed by real responses coming back `genres: undefined`
// even for mainstream artists (The Strokes, etc.), not just an empty
// array for obscure ones. See audio-viz/spotify-data.js's comments for
// the full story. This Worker fills that gap using Last.fm's
// `artist.getTopTags` endpoint instead, which still returns real
// genre-like folksonomy tags per artist.
//
// Why a Worker and not a direct browser call to Last.fm: Last.fm's API
// doesn't send CORS headers (confirmed -- other client-side apps hit the
// same wall: https://github.com/jaedb/Iris/issues/287), so
// ws.audioscrobbler.com can't be called straight from a static site's JS.
// This Worker sits in between, calls Last.fm server-side (no CORS
// concerns there), and hands the browser back a CORS-safe JSON response.
// It also keeps the Last.fm API key out of public client-side code.
//
// -- Deploy --
// 1. Get a free Last.fm API key: https://www.last.fm/api/account/create
//    (instant, no approval wait).
// 2. Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker.
// 3. Paste this whole file into the editor, replacing the default code.
// 4. Settings -> Variables and Secrets -> add secret LASTFM_API_KEY with
//    the key from step 1.
// 5. Deploy. Copy the resulting https://<name>.<subdomain>.workers.dev URL.
// 6. Set PROXY_URL in audio-viz/genre-lookup.js to that URL.

const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";

// Cloudflare's free plan caps a single Worker invocation at 50 outbound
// subrequests -- a hard platform ceiling, not a Last.fm rate limit (an
// earlier version of this file added dispatch pacing to guard against
// Last.fm's documented 5 req/sec limit; that wasn't the actual problem --
// artists past the first 50 were failing at exactly the same count
// whether paced or not, which is the signature of a fixed request-count
// cap, not a rate-over-time one). The caller (audio-viz/main.js) only
// ever sends 50 names for exactly this reason, but this stays as a
// defensive floor in case that ever changes upstream.
const MAX_ARTISTS_PER_REQUEST = 50;

// Comfortably fast for a batch that's capped at 50 short requests -- no
// dispatch pacing needed at this volume; a brief few-second burst doesn't
// meaningfully touch Last.fm's 5 req/sec-averaged-over-5-minutes limit.
const LASTFM_CONCURRENCY = 6;

export default {
    async fetch(request, env, ctx) {
        // Top-level catch-all: guarantees corsify() always runs, even on
        // a totally unexpected failure. Without this, an uncaught
        // exception anywhere below returns Cloudflare's own error page
        // with NO CORS headers at all -- which the browser reports as a
        // CORS failure, masking the real error. (This is exactly what
        // happened here: caches.default, used for a nice-to-have 24h
        // cache in an earlier version of this file, isn't reliably
        // available on a *.workers.dev subdomain without a zone/custom
        // domain attached, and threw before corsify() ever ran. Removed
        // below rather than worked around -- it wasn't core to this
        // working, just an optimization.)
        try {
            return await handle(request, env);
        } catch (err) {
            return corsify(jsonResponse({ error: String(err) }, 500));
        }
    },
};

async function handle(request, env) {
    if (request.method === "OPTIONS") return corsify(new Response(null, { status: 204 }));
    if (request.method !== "POST") return corsify(jsonResponse({ error: "POST only" }, 405));

    let body;
    try {
        body = await request.json();
    } catch {
        return corsify(jsonResponse({ error: "invalid JSON body" }, 400));
    }

    const artists = Array.isArray(body.artists) ? body.artists.slice(0, MAX_ARTISTS_PER_REQUEST) : [];
    if (artists.length === 0) return corsify(jsonResponse({ tags: {} }));

    const results = {};
    let cursor = 0;
    async function worker() {
        while (cursor < artists.length) {
            const name = artists[cursor++];
            results[name] = await fetchTopTags(name, env.LASTFM_API_KEY);
        }
    }
    await Promise.all(Array.from({ length: LASTFM_CONCURRENCY }, worker));

    return corsify(jsonResponse({ tags: results }));
}

async function fetchTopTags(artistName, apiKey) {
    const url = `${LASTFM_ENDPOINT}?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const tags = data?.toptags?.tag ?? [];
        // top 10 is plenty -- genre-engine.js's classifyGenres() just
        // needs a handful of real tags to match against its keyword lists
        return tags.map((t) => t.name).filter(Boolean).slice(0, 10);
    } catch {
        return []; // one artist failing (unknown name, Last.fm hiccup) shouldn't fail the whole batch
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function corsify(response) {
    const headers = new Headers(response.headers);
    // public, read-only, no auth/cookies involved -- wide open origin is fine
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    return new Response(response.body, { status: response.status, headers });
}
