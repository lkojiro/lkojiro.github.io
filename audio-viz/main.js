// main.js
//
// Orchestrates the whole page: three states (hero -> analyzing -> result),
// wires the Connect/Shuffle buttons, and glues Spotify data into the
// genre engine -> instrument pool -> soundscape engine pipeline built up
// across the other files in this folder.
//
// Load order matters -- see soundscapeify.html:
//   Tone.js, music-theory, chord-progressions, genre-engine,
//   instrument-archetypes, synth-layer, chord-layer, drum-patterns,
//   drum-layer, soundscape-engine, spotify-auth, spotify-data,
//   genre-lookup, visualizer, main (this file, last)

(function () {
    "use strict";

    const POOL_SIZE = 10; // total candidate layers built at generation time;
                           // only a few are active at once, see soundscape-engine.js

    // -- DOM state machine ------------------------------------------------
    // Three top-level sections in the HTML; only one visible at a time.
    const states = {
        hero: document.getElementById("av-state-hero"),
        analyzing: document.getElementById("av-state-analyzing"),
        result: document.getElementById("av-state-result"),
    };
    function showState(name) {
        for (const key of Object.keys(states)) {
            states[key].classList.toggle("av-hidden", key !== name);
        }
    }

    let engine = null; // the active SoundscapeEngine, once running
    let pendingAudioSetup = null; // { pool, root, genreDiversity } -- data is ready, audio isn't started yet
    let stopVisualizerFn = null; // teardown returned by startVisualizer(), or null while stopped
    let audioChain = null; // { masterBus, compressor, limiter, analyser } -- nodes owned by main.js, not the engine

    async function init() {
        const alreadyConnected = await SpotifyAuth.handleAuthRedirect();

        document.getElementById("av-connect-btn").addEventListener("click", () => {
            SpotifyAuth.connectSpotify(); // full-page redirect to Spotify
        });

        // IMPORTANT: this whole init() path runs from a `DOMContentLoaded`
        // callback after the redirect back from Spotify -- NOT from a live
        // click. Browsers only allow starting/resuming an AudioContext
        // synchronously inside a real user-gesture event handler, so
        // Tone.start() can NOT happen here even though a click (Connect)
        // is what kicked off the whole flow, a page-load ago. That's why
        // this only fetches data and renders the receipt; actual audio
        // doesn't start until the visitor clicks the Play button below,
        // which IS a live gesture. See wirePlayButton().
        if (alreadyConnected) {
            await prepareData();
        } else {
            showState("hero");
        }
    }

    async function prepareData() {
        showState("analyzing");
        setAnalyzingMessage("Reading your top artists and library…");
        const { user, topArtists, savedTracks } = await SpotifyData.fetchLibrarySnapshot();

        // Spotify stopped returning `.genres` for apps at our tier
        // (confirmed -- comes back `undefined` even for mainstream
        // artists, not just sparsely populated). GenreLookup.fetchGenreTags
        // asks a Last.fm-backed proxy for real tags instead, per artist
        // NAME (Spotify's own IDs are useless to a service that isn't
        // Spotify). Spotify's own genres win when present, in case the
        // field ever comes back -- this is a fallback source, not a
        // replacement for the authoritative one.
        //
        // Scoped to just these 50 top artists, not a wider sample -- the
        // Worker doing the actual Last.fm lookups hits Cloudflare's
        // free-tier cap of 50 subrequests per invocation regardless, so a
        // bigger batch here would just silently fail past that point. 50
        // ranked artists is a good enough sample to be interesting anyway.
        setAnalyzingMessage("Looking up genre data…");
        const uniqueNames = [...new Set(topArtists.map((a) => a.name))];
        const genreTagsByName = await GenreLookup.fetchGenreTags(uniqueNames);
        const artistsWithGenres = topArtists.map((a) => ({
            ...a,
            genres: a.genres && a.genres.length > 0 ? a.genres : genreTagsByName[a.name] ?? [],
        }));

        setAnalyzingMessage("Sorting your genres…");
        console.debug("Genre classification input:", artistsWithGenres.map((a) => ({ name: a.name, genres: a.genres })));
        const { proportions, slots } = GenreEngine.buildGenreAllocation(artistsWithGenres, POOL_SIZE);

        // expand [ [cluster, count], ... ] into POOL_SIZE individual
        // { cluster } descriptors -- one per instrument-pool slot
        const pool = slots.flatMap(([cluster, count]) => Array.from({ length: count }, () => ({ cluster })));
        const genreDiversity = slots.length;

        setAnalyzingMessage("Picking your key…");
        const root = MusicTheory.pickRootNote(user.id);

        // highest-weighted cluster -- also what DrumLayer uses to choose a kit
        const dominantCluster = Object.entries(proportions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? GenreEngine.FALLBACK_CLUSTER;

        pendingAudioSetup = { pool, root, genreDiversity, spotifyUserId: user.id, dominantCluster };
        renderReceipt({ proportions, topArtists, savedTracks, root });
        wirePlayButton();

        showState("result");
    }

    // Only ever called directly from the Play button's click handler --
    // Tone.start() must be the first async thing that happens after the
    // gesture, or some browsers will still refuse to unlock audio.
    async function startAudio() {
        const { pool, root, genreDiversity, spotifyUserId, dominantCluster } = pendingAudioSetup;

        await Tone.start();

        // --- audio output chain --------------------------------------
        // Every layer connects into masterBus. Up to ~13 voices can be
        // sounding at once (5 melodic layers + a 4-note chord + a 4-voice
        // drum kit), and every one of those layers fades in from silence
        // over the same 30s window (see soundscape-engine.js's
        // FADE_SECONDS) -- so total loudness climbs continuously through
        // that whole fade-in, not just once at the start. A flat gain and
        // a single brickwall limiter isn't enough headroom for that: the
        // limiter ends up doing many dB of reduction on every busy
        // downbeat, which is audible as pumping/distortion, not a clean
        // ceiling. A compressor ahead of the limiter does the bulk of the
        // gain-taming gently and continuously, so the limiter is only
        // ever catching occasional peaks rather than doing all the work.
        const masterBus = new Tone.Gain(0.5); // real headroom, not just a mild trim
        const compressor = new Tone.Compressor({ threshold: -18, ratio: 4, attack: 0.02, release: 0.25 });
        const limiter = new Tone.Limiter(-1).toDestination();
        const analyser = new Tone.Analyser("waveform", 1024);
        masterBus.chain(compressor, limiter);
        compressor.connect(analyser); // tapped post-compression so the visual matches what's audible, pre-limiter so it isn't flattened
        audioChain = { masterBus, compressor, limiter, analyser };

        engine = new SoundscapeEngine({
            pool, root, genreDiversity, spotifyUserId, dominantCluster, outputBus: masterBus,
            ...engineChangeCallbacks(),
        });
        engine.start();

        stopVisualizerFn = startVisualizer(document.getElementById("av-visualizer"), analyser);
        wireShuffleButton();
        wireStopButton();
        wireRandomizeButton();
    }

    // Shared between startAudio() and the debug randomize rebuild below --
    // both need the same UI-label wiring, just for different engine instances.
    function engineChangeCallbacks() {
        return {
            onProgressionChange: (progression) => {
                document.getElementById("av-progression-label").textContent = `Progression: ${progression.label}`;
            },
            onDrumPatternChange: (pattern) => {
                document.getElementById("av-drum-label").textContent = `Drums: ${pattern.label}`;
            },
        };
    }

    // Tears down everything startAudio() built -- transport, layers, the
    // gain/limiter/analyser chain, and the visualizer's animation loop --
    // and puts the Play button back so the visitor can restart without
    // reloading the page or re-fetching Spotify data (pendingAudioSetup
    // is still sitting there from prepareData()).
    function stopAudio() {
        if (engine) {
            engine.stop();
            engine = null;
        }
        if (stopVisualizerFn) {
            stopVisualizerFn();
            stopVisualizerFn = null;
        }
        if (audioChain) {
            audioChain.masterBus.dispose();
            audioChain.compressor.dispose();
            audioChain.limiter.dispose();
            audioChain.analyser.dispose();
            audioChain = null;
        }

        document.getElementById("av-shuffle-btn").classList.add("av-hidden");
        document.getElementById("av-stop-btn").classList.add("av-hidden");
        document.getElementById("av-randomize-btn").classList.add("av-hidden");
        document.getElementById("av-mode-label").textContent = "";
        document.getElementById("av-progression-label").textContent = "";
        document.getElementById("av-drum-label").textContent = "";

        wirePlayButton(); // re-arm Play for a fresh start
    }

    function wirePlayButton() {
        const btn = document.getElementById("av-play-btn");
        btn.textContent = "▶ Start Soundscape";
        btn.disabled = false;
        btn.classList.remove("av-hidden");
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "Starting…";
            await startAudio();
            btn.classList.add("av-hidden"); // audio's running now, no need for this anymore
        };
    }

    function wireStopButton() {
        const btn = document.getElementById("av-stop-btn");
        btn.classList.remove("av-hidden");
        btn.onclick = () => stopAudio();
    }

    function wireRandomizeButton() {
        const btn = document.getElementById("av-randomize-btn");
        btn.classList.remove("av-hidden");
        btn.onclick = () => debugRandomizeAll();
    }

    // Debug tool: rolls fresh random values for everything a session
    // normally derives from Spotify data or a hash of your user ID --
    // instrument pool (via random genre proportions, not your real
    // library), root note, mode, tempo, and drum kit -- then tears down
    // the current engine and builds a new one with them, on the SAME
    // audio output chain (no need to rebuild masterBus/compressor/
    // limiter/analyser, or touch the Sound Receipt panel, which stays
    // showing your actual library -- this only changes what's playing,
    // not the "here's your real data" story on the page).
    //
    // A full engine rebuild, rather than patching a dozen live nodes'
    // parameters individually, is the only way to change root/pool/
    // tempo/mode all atomically -- those are baked into each layer at
    // construction time (see soundscape-engine.js), not live-adjustable
    // AudioParams.
    function debugRandomizeAll() {
        if (!engine || !audioChain) return; // only meaningful once something's actually playing

        const weights = {};
        for (const cluster of GenreEngine.CLUSTER_NAMES) weights[cluster] = Math.random();
        const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
        for (const cluster of Object.keys(weights)) weights[cluster] /= total;

        const slots = GenreEngine.allocateSlots(weights, POOL_SIZE); // sorted biggest-first
        const pool = slots.flatMap(([cluster, count]) => Array.from({ length: count }, () => ({ cluster })));
        const genreDiversity = slots.length;
        const dominantCluster = slots[0]?.[0] ?? GenreEngine.FALLBACK_CLUSTER;

        // a fresh fake ID re-rolls root note AND (inside ChordLayer) chord
        // progression choice, since both are hashed from this same string
        const fakeUserId = `debug-${Math.random().toString(36).slice(2)}`;
        const root = MusicTheory.pickRootNote(fakeUserId);
        const initialMode = MusicTheory.MODE_NAMES[Math.floor(Math.random() * MusicTheory.MODE_NAMES.length)];
        const bpm = 100 + Math.floor(Math.random() * 11); // full safe-zone range, inclusive of both ends

        engine.stop();
        engine = new SoundscapeEngine({
            pool, root, genreDiversity, spotifyUserId: fakeUserId, dominantCluster, bpm, initialMode,
            outputBus: audioChain.masterBus,
            ...engineChangeCallbacks(),
        });
        engine.start();

        document.getElementById("av-mode-label").textContent = `Now playing in: ${engine.currentMode}`;
    }

    function setAnalyzingMessage(text) {
        document.getElementById("av-analyzing-message").textContent = text;
    }

    function wireShuffleButton() {
        const btn = document.getElementById("av-shuffle-btn");
        const label = document.getElementById("av-mode-label");
        btn.classList.remove("av-hidden");
        btn.onclick = () => {
            label.textContent = `Now playing in: ${engine.shuffle()}`;
            // the progression label updates itself via onProgressionChange
            // above, once ChordLayer actually notices the mode change on
            // its next Transport tick -- not guessed at with a timer here
        };
        label.textContent = `Now playing in: ${engine.currentMode}`;
    }

    // "Sound receipt" panel: top genre clusters by weight, plus a couple
    // of fun derived stats. Good-faith, human-readable summary of the
    // same numbers driving the audio, for the "how this works" story.
    function renderReceipt({ proportions, topArtists, savedTracks, root }) {
        const list = document.getElementById("av-genre-list");
        list.innerHTML = "";
        Object.entries(proportions)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cluster, weight]) => {
                const li = document.createElement("li");
                li.textContent = `${cluster} — ${Math.round(weight * 100)}%`;
                list.appendChild(li);
            });

        const rootNoteName = Tone.Frequency(root, "midi").toNote();
        document.getElementById("av-root-note").textContent = rootNoteName;

        const avgYear = averageReleaseYear(savedTracks);
        document.getElementById("av-avg-year").textContent = avgYear ?? "unknown";
    }

    function averageReleaseYear(savedTracks) {
        const years = savedTracks
            .map((item) => item.track?.album?.release_date)
            .filter(Boolean)
            .map((date) => parseInt(date.slice(0, 4), 10))
            .filter((year) => !Number.isNaN(year));
        if (years.length === 0) return null;
        return Math.round(years.reduce((a, b) => a + b, 0) / years.length);
    }

    document.addEventListener("DOMContentLoaded", init);
})();
