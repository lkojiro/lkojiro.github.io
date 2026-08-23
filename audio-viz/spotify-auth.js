// spotify-auth.js
//
// Spotify's PKCE OAuth flow, entirely client-side (no server, no client
// secret -- PKCE exists specifically so a public single-page app can do
// this safely). Flow:
//   1. connectSpotify() generates a code verifier/challenge, stashes the
//      verifier, and redirects the browser to Spotify's authorize page
//   2. Spotify redirects back to REDIRECT_URI with ?code=...
//   3. handleAuthRedirect() exchanges that code (+ the stashed verifier)
//      for an access token AND a refresh token, storing both for
//      spotify-data.js to use
//
// Access tokens expire after ~1 hour. The authorization_code grant (step
// 3) also returns a refresh_token, which doesn't expire on a fixed
// schedule the way the access token does -- refreshAccessToken() trades
// it for a new access token (no re-consent, no redirect) whenever
// spotify-data.js hits a 401. That's what keeps a long session (this
// project runs indefinitely once playing) from just dying after an hour
// with every API call failing.
//
// TODO before this works: register an app at
// https://developer.spotify.com/dashboard, set CLIENT_ID below, and add
// REDIRECT_URI as an exact-match redirect URI in the app settings.
// Remember Development Mode currently caps you at 5 authorized users
// until Spotify grants Extended Quota Mode (see project notes).

(function (global) {
    "use strict";

    const CLIENT_ID = "506bf1eca383472ba4ee67ac5e1b93a8";
    const REDIRECT_URI = window.location.origin + window.location.pathname; // this page, reused as the callback
    const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
    const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

    // Only what we actually need: read top artists/tracks and saved
    // library items. No playback/write scopes requested.
    const SCOPES = ["user-top-read", "user-library-read"].join(" ");

    const STORAGE_KEY_VERIFIER = "spotify_pkce_verifier";
    const STORAGE_KEY_TOKEN = "spotify_access_token";
    const STORAGE_KEY_REFRESH_TOKEN = "spotify_refresh_token";

    // --- PKCE helpers -------------------------------------------------

    function randomString(length) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const bytes = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(bytes, (b) => chars[b % chars.length]).join("");
    }

    async function sha256Base64Url(input) {
        const data = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest("SHA-256", data);
        const bytes = new Uint8Array(digest);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    // --- Public flow ----------------------------------------------------

    // Kick off login: redirects the whole page to Spotify. Call this from
    // the "Connect with Spotify" button's click handler.
    async function connectSpotify() {
        const verifier = randomString(64);
        const challenge = await sha256Base64Url(verifier);
        sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: "code",
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            code_challenge_method: "S256",
            code_challenge: challenge,
        });

        window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
    }

    // Call this once on page load. If the URL has an OAuth `code` param
    // (i.e. we just got redirected back from Spotify), exchanges it for an
    // access token and cleans the URL up. Returns true if a token is
    // available afterward (either freshly exchanged or already stored),
    // false if the user still needs to connect.
    async function handleAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (!code) {
            return !!sessionStorage.getItem(STORAGE_KEY_TOKEN);
        }

        const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
        if (!verifier) {
            console.error("Missing PKCE verifier -- restart the login flow.");
            return false;
        }

        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });

        if (!response.ok) {
            console.error("Spotify token exchange failed:", await response.text());
            return false;
        }

        const { access_token, refresh_token } = await response.json();
        sessionStorage.setItem(STORAGE_KEY_TOKEN, access_token);
        if (refresh_token) sessionStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refresh_token);

        // strip ?code=...&state=... from the visible URL so a page
        // refresh doesn't try to redeem an already-used code
        window.history.replaceState({}, document.title, REDIRECT_URI);
        return true;
    }

    // Trades the stored refresh token for a new access token -- no
    // redirect, no re-consent, the user never sees this happen. Spotify
    // sometimes rotates the refresh token itself in the response; when it
    // does, the new one replaces the stored one, otherwise the original
    // keeps working. Returns true on success; on failure (refresh token
    // itself expired/revoked -- happens if a session goes untouched for a
    // very long time, or access was revoked from Spotify's side) clears
    // both stored tokens and returns false, so the caller knows a full
    // reconnect is needed rather than retrying forever.
    async function refreshAccessToken() {
        const refreshToken = sessionStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
        if (!refreshToken) return false;

        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });

        if (!response.ok) {
            console.error("Spotify token refresh failed -- reconnect needed:", await response.text());
            disconnectSpotify();
            return false;
        }

        const { access_token, refresh_token } = await response.json();
        sessionStorage.setItem(STORAGE_KEY_TOKEN, access_token);
        if (refresh_token) sessionStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refresh_token);
        return true;
    }

    function getAccessToken() {
        return sessionStorage.getItem(STORAGE_KEY_TOKEN);
    }

    function disconnectSpotify() {
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
    }

    global.SpotifyAuth = {
        connectSpotify,
        handleAuthRedirect,
        refreshAccessToken,
        getAccessToken,
        disconnectSpotify,
    };
})(window);
