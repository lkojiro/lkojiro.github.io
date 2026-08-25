// drum-patterns.js
//
// Two "seed" grooves per genre cluster (16 total) -- each a 16-step (one
// 4/4 measure) pattern for kick/snare/hihatClosed/hihatOpen(/perc), tagged
// with a tempoRange so together the two span the project's 60-140 BPM
// range (see tempo-data.js). Each seed's tempoRange was originally a
// tight 5-bar window centered on 100-110 (this project's old fixed
// tempo); widened to [60,104]/[105,140] once tempo itself became
// genre-data-driven rather than fixed -- the split point (104/105)
// carries over unchanged, only the outer edges moved.
//
// -- Provenance: dataset-derived vs. hand-authored --------------------
// pop, hiphop, rock, jazz, funk, and rnb's seeds are DERIVED FROM REAL
// DRUMMER DATA: Google Magenta's Groove MIDI Dataset (GMD) -- 1,150
// human-performed MIDI drum takes, genre-tagged by the drummer, licensed
// CC BY 4.0 (https://magenta.withgoogle.com/datasets/groove, attribution:
// Google LLC). funk and rnb were split out of what used to be one merged
// "hiphop" bucket (GMD's own "funk"/"soul" style tags, previously folded
// in rather than given their own cluster) once genre-engine.js grew from
// 7 clusters to 11 -- see that file's header for the fuller story.
// electronic, indie, folk, and fallback stay HAND-AUTHORED, because GMD's
// coverage of them wasn't trustworthy enough to replace a guess with:
// only 7 "dance"-tagged files for electronic (electronic/EDM rhythm
// sections are programmed, not played on an acoustic kit, so a
// human-drummer dataset is inherently thin here), only 2 files for
// country (our stand-in for folk), and no "indie"/"alternative" tag at
// all. metal and reggaeton, the other two clusters added alongside
// funk/rnb, are ALSO hand-authored -- GMD has no "metal" tag and no
// reggaeton-adjacent tag either (reggae/latin/afrocuban are real but
// genuinely different rhythms, not safe stand-ins). Rather than trust a
// pattern derived from a couple of individual drummers' idiosyncrasies as
// "the genre," or force-fit an unrelated real dataset, those clusters
// keep hand-authored patterns. This is a real, principled line, not an
// oversight -- see the per-cluster comments below for exactly which is which.
//
// Why downloaded AUDIO wasn't the source (the original idea): actual
// commercial recordings are copyrighted: downloading and shipping them
// -- even just for internal analysis, never played back -- is
// redistributing unlicensed audio, not something to build a public repo
// around. GMD sidesteps this entirely: it's original performances
// released specifically for this kind of use, and it's MIDI (note/
// velocity/timing), not audio -- which is actually a better fit anyway,
// since our whole architecture already runs on 16-step note grids, not
// waveforms.
//
// Methodology: for each cluster, GMD performances tagged with a mapped
// style (see STYLE_TO_CLUSTER in data-extraction/extract-groove-patterns.py)
// and beat_type=="beat" (fills excluded) were sliced into
// 1-bar windows, each onset quantized to the nearest 16th-note step and
// mapped to one of our voices via the General MIDI drum map. Per
// (voice, step), hit-probability and mean velocity were aggregated
// across ALL bars, then thresholded (probability >= 0.22) into a single
// representative pattern -- effectively "what a typical bar of this
// genre's groove looks like," not any one specific real bar. Bars were
// split into below/above-median note-density halves to produce the two
// tempoRange tiers, mirroring the laid-back/driving split the
// hand-authored patterns already used. A pleasant side effect: toms came
// back essentially silent in every derived pattern, which matches reality
// (toms are fill vocabulary) and confirms the beat/fill filtering worked
// -- not a gap in the data.
//
// What's new since the original hand-authored-only version: every seed
// groove is expanded into a full SECTION SET -- basic / buildup (a
// low-energy 1-bar grid and a high-energy 1-bar grid; drum-layer.js plays
// each for multiple bars, see there for exactly how long) / main /
// bSection -- via generic derivation rules applied to the seed, not
// hand-typed per genre. With 16 seeds x (basic + 2 buildup bars + main +
// bSection) x 7 voices x 16 steps, hand authoring this would be ~9,000
// numbers to keep consistent; a small set of clear transformation rules
// (same philosophy as chord-progressions.js deriving chords from a
// stacking formula) keeps it maintainable and means every genre's
// sections follow the same arranging logic instead of drifting
// inconsistent from each other.
//
// Voices: kick, snare, hihatClosed, hihatOpen (original 4) plus tomLow,
// tomHigh, perc (new). For the hand-authored genres, toms/perc are
// deliberately near-silent in `main` and do most of their work in
// buildup/bSection -- classic arranging practice, save the ear candy
// for transitions. For the dataset-derived genres, `perc` is
// different: it's real ride/crash cymbal content the drummers played as
// part of the core groove (jazz's ride pattern especially -- see
// deriveMain()), so it stays in `main` rather than being treated as a
// sparse accent.
//
// See drum-layer.js for the state machine that decides which section
// plays when.
//
// Depends on: nothing (pure data + lookup helpers)

(function (global) {
    "use strict";

    const STEPS = 16;
    const silence = () => Array(STEPS).fill(0);

    const SEED_PATTERNS = {
        // pop/hiphop derived from Google Magenta's Groove MIDI Dataset (CC
        // BY 4.0 -- https://magenta.withgoogle.com/datasets/groove) -- see
        // the file header for methodology. `perc` here carries real
        // ride/crash cymbal content the drummers played as part of the
        // core groove, not the sparse hand-authored "occasional accent"
        // role perc plays in electronic/indie/folk below.
        pop: [
            {
                label: "Pop groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0,
                kick:        [.61, 0, 0, 0, 0, 0, .39, 0, .63, 0, .46, 0, .59, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.85, 0, .39, 0, .86, 0, .39, 0, .85, 0, .4, 0, .87, 0, .39, 0],
                hihatOpen:   silence(),
                perc:        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            },
            {
                label: "Pop groove, driving (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0,
                kick:        [.54, 0, .45, 0, .57, 0, .37, 0, .59, 0, .4, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, .93, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.56, 0, .23, 0, .63, 0, 0, 0, .6, 0, .26, 0, .6, 0, 0, 0],
                hihatOpen:   silence(),
                perc:        [.89, 0, .5, 0, .96, 0, .41, 0, .88, 0, .49, 0, .95, 0, .56, 0],
            },
        ],
        hiphop: [
            {
                label: "Hip-hop/funk groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0.15,
                kick:        [.72, 0, 0, 0, 0, 0, 0, .52, .68, 0, .68, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, .48, 0, .44, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.64, 0, .45, 0, .75, 0, .46, 0, .57, 0, .49, 0, .67, 0, .5, 0],
                hihatOpen:   silence(),
                perc:        [.87, 0, .83, 0, 1, 0, .8, 0, .84, 0, .93, 0, .99, 0, .89, 0],
            },
            {
                label: "Hip-hop/funk groove, driving (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0.15,
                kick:        [.7, 0, .68, .49, 0, .56, .58, .46, .63, .45, .65, .46, 0, .5, 0, 0],
                snare:       [0, .43, 0, 0, 1, .51, .53, .56, .52, .57, .65, .69, 1, .61, .86, .53],
                hihatClosed: [.56, .36, .51, .31, .63, .38, .51, .4, .55, .4, .52, .37, .61, .39, .51, 0],
                hihatOpen:   silence(),
                perc:        [.94, 0, .87, 0, 1, 0, .83, 0, .86, 0, .92, 0, .96, 0, .93, 0],
            },
        ],
        electronic: [
            {
                label: "Chill downtempo", tempoRange: [60, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0], // half-time
                snare:       [0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, .3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "House four-on-the-floor", tempoRange: [105, 140], swing: 0,
                kick:        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // clap layered on kick
                hihatClosed: [0, 0, .6, 0, 0, 0, .6, 0, 0, 0, .6, 0, 0, 0, 0, 0], // classic offbeat house hats
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0],
            },
        ],
        indie: [
            {
                label: "Bedroom pop shuffle", tempoRange: [60, 104], swing: 0.2,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
            {
                label: "Indie pop groove", tempoRange: [105, 140], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .7, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
        ],
        // rock/jazz also derived from the Groove MIDI Dataset -- see note
        // above pop/hiphop. Jazz's `perc` is literally the ride cymbal
        // pattern (ride notes fall into our "perc" voice, see
        // NOTE_TO_VOICE in the extraction script) -- the swung ride
        // outline that IS the genre's rhythmic signature, previously only
        // approximated by hand in hihatClosed.
        rock: [
            {
                label: "Rock groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0,
                kick:        [.83, 0, 0, 0, .81, 0, 0, 0, .83, 0, .78, 0, 0, 0, .7, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, .71, 0, 1, 0, 0, 0],
                hihatClosed: [.79, 0, 0, 0, .78, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0],
                hihatOpen:   silence(),
                perc:        [.95, 0, .72, 0, 1, 0, .7, 0, .91, 0, .84, 0, .97, 0, .81, 0],
            },
            {
                label: "Rock groove, driving (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0,
                kick:        [.78, 0, .69, .57, .73, 0, .64, .53, .79, 0, .64, 0, .75, 0, 0, 0],
                snare:       [0, .46, .71, 0, 1, 0, 0, .49, .7, .54, .76, .64, 1, .64, .86, .62],
                hihatClosed: [.71, 0, .66, 0, .69, 0, .73, 0, .66, 0, .74, 0, .73, 0, .71, 0],
                hihatOpen:   silence(),
                perc:        [.86, .63, .72, 0, .92, 0, .78, 0, .77, .68, .75, .65, .9, 0, .77, 0],
            },
        ],
        jazz: [
            {
                label: "Jazz groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0.3,
                kick:        [.82, 0, 0, 0, 0, 0, 0, 0, .81, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, .87, 0, 0, 0, 0, 0, 0, 0, .84, 0, 0, 0], // comping, not a fixed backbeat
                hihatClosed: [0, 0, 0, 0, .77, 0, 0, 0, 0, 0, 0, 0, .77, 0, 0, 0], // pedal chick, 2 & 4
                hihatOpen:   silence(),
                perc:        [.77, 0, 0, 0, .85, 0, .76, .72, .72, 0, 0, 0, .87, 0, 0, .67], // swung ride pattern
            },
            {
                label: "Jazz groove, uptempo (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0.25,
                kick:        [.61, 0, 0, .46, .62, 0, .51, .45, .61, 0, .63, .44, .61, 0, .48, 0],
                snare:       [.74, .42, .51, .73, .64, .52, .8, .5, .54, .64, .56, .6, .87, .58, .71, .54],
                hihatClosed: [.47, 0, .65, 0, .61, 0, .64, 0, .51, 0, .66, 0, .58, 0, .68, 0],
                hihatOpen:   silence(),
                perc:        [.77, 0, .78, 0, .77, 0, .84, 0, .75, 0, .84, 0, .85, 0, .87, 0],
            },
        ],
        folk: [
            {
                label: "Folk stomp & clap", tempoRange: [60, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0], // foot stomp, beats 1 & 3
                snare:       [0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0], // hand clap
                hihatClosed: [.3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0, .3, 0], // light shaker texture
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "Acoustic driving", tempoRange: [105, 140], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, .7, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .3, 0],
            },
        ],
        funk: [
            {
                label: "Funk groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0,
                kick:        [.77, 0, .59, .54, 0, .64, 0, .58, .72, 0, .72, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, 1, 0, 0, .55, 0, .49, 0, 0, 1, 0, 1, .5],
                hihatClosed: [.59, 0, .4, 0, .68, 0, .4, 0, .54, 0, .44, 0, .63, 0, .43, 0],
                hihatOpen:   silence(),
                perc:        [.95, 0, .9, 0, 1, 0, .83, 0, .89, 0, 1, 0, 1, 0, .96, 0],
            },
            {
                label: "Funk groove, driving (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0,
                kick:        [.7, 0, .69, .48, 0, 0, 0, .44, .63, 0, .66, .45, 0, .49, 0, 0],
                snare:       [.31, .45, 0, 0, 1, .51, .43, .58, .45, .59, .57, .76, 1, .62, .84, .54],
                hihatClosed: [.52, .34, .49, .28, .61, .35, .49, .38, .52, .36, .5, .35, .58, 0, .51, 0],
                hihatOpen:   silence(),
                perc:        [.91, 0, .82, 0, 1, 0, .75, 0, .8, 0, .86, 0, .92, 0, .89, 0],
            },
        ],
        rnb: [
            {
                label: "R&B groove, laid-back (Groove MIDI Dataset)", tempoRange: [60, 104], swing: 0,
                kick:        [.52, 0, 0, 0, 0, 0, 0, 0, .43, 0, .57, 0, 0, 0, 0, .31],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.74, 0, .63, 0, .81, 0, .72, 0, .73, 0, .62, 0, .81, 0, .7, 0],
                hihatOpen:   silence(),
                perc:        [.7, 0, .66, 0, .85, 0, .59, 0, .65, 0, .72, 0, .85, 0, .7, 0],
            },
            {
                label: "R&B groove, driving (Groove MIDI Dataset)", tempoRange: [105, 140], swing: 0,
                kick:        [.52, 0, 0, .44, .48, 0, 0, 0, .47, .33, .48, 0, .49, .47, 0, .29],
                snare:       [.6, .24, 0, 0, 1, 0, .59, .44, .83, .38, 0, 0, 1, .57, .65, .43],
                hihatClosed: [.67, 0, .53, .45, .73, 0, .57, .5, .59, 0, .57, .56, .7, 0, .57, .51],
                hihatOpen:   silence(),
                perc:        [.78, 0, .78, 0, .89, 0, .8, 0, .68, 0, .83, 0, .89, 0, .81, 0],
            },
        ],
        // metal has real GMD drummer-tagged coverage neither for its own
        // "metal" style tag (GMD's style vocabulary doesn't have one) nor
        // any close proxy, so this stays hand-authored -- same footing as
        // electronic/indie/folk/fallback. The "gallop" (hit-rest-hit-hit
        // per beat) is metal's most recognizable drum-writing trope
        // (NWOBHM/thrash palm-muted rhythm guitar tracks the same shape);
        // kept to a driving straight-8th double-kick feel rather than a
        // literal blast beat, matching this project's "positive, mid-tempo,
        // recruiter-friendly" brief even for the most aggressive cluster.
        metal: [
            {
                label: "Metal gallop, mid-tempo", tempoRange: [60, 104], swing: 0,
                kick:        [1, 0, .8, .8, 1, 0, .8, .8, 1, 0, .8, .8, 1, 0, .8, .8],
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, .4], // hard backbeat + a ghost pickup into the next bar
                hihatClosed: [.7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0],
                hihatOpen:   silence(),
            },
            {
                label: "Metal double-kick drive", tempoRange: [105, 140], swing: 0,
                kick:        [1, .6, 1, .6, 1, .6, 1, .6, 1, .6, 1, .6, 1, .6, 1, .6], // straight 8th-note double bass
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                hihatClosed: [.7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0, .7, 0],
                hihatOpen:   silence(),
            },
        ],
        // reggaeton has no GMD tag either (closest neighbors -- reggae,
        // latin, afrocuban -- are genuinely different rhythms, not a safe
        // stand-in), so this is hand-authored around the dembow riddim:
        // the syncopated 3+3+2 kick grouping repeated twice per bar that
        // IS reggaeton's entire rhythmic identity, independent of tempo or
        // any other production choice. Every reggaeton seed pattern in
        // real music is a variation on this one shape.
        reggaeton: [
            {
                label: "Dembow riddim, laid-back", tempoRange: [60, 104], swing: 0,
                kick:        [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], // 3+3+2, twice per bar
                snare:       [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, .5],
                hihatClosed: [.5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0, .5, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, 0],
            },
            {
                label: "Dembow riddim, driving", tempoRange: [105, 140], swing: 0,
                kick:        [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
                snare:       [0, 0, 0, .3, 1, 0, 0, .3, 0, 0, 0, .3, 1, 0, 0, .6],
                hihatClosed: [.6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0, .6, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0],
            },
        ],
        // used when a library's dominant genre doesn't classify into any
        // named cluster -- deliberately the plainest, safest patterns
        fallback: [
            {
                label: "Gentle pulse", tempoRange: [60, 104], swing: 0,
                kick:        [1, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 0, 0, 0, 0, 0],
                snare:       [0, 0, 0, 0, .6, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
                hihatClosed: [.4, 0, 0, 0, .4, 0, 0, 0, .4, 0, 0, 0, .4, 0, 0, 0], // quarter notes only
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            {
                label: "Steady ambient groove", tempoRange: [105, 140], swing: 0,
                kick:        [1, 0, 0, 0, .7, 0, 0, 0, 1, 0, 0, 0, .7, 0, 0, 0],
                snare:       [0, 0, 0, 0, .6, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
                hihatClosed: [.4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0, .4, 0],
                hihatOpen:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
        ],
    };

    // Picks whichever of a cluster's 2 seeds has a tempoRange containing
    // `bpm`; falls back to the cluster's first seed (and then to
    // `fallback`) if the cluster isn't recognized -- should never
    // actually miss given the two ranges are contiguous across 100-110.
    // Returns the seed's ALREADY-BUILT section set (see bottom of file).
    function pickPattern(cluster, bpm) {
        const patterns = SEED_PATTERNS[cluster] ?? SEED_PATTERNS.fallback;
        return patterns.find((p) => bpm >= p.tempoRange[0] && bpm <= p.tempoRange[1]) ?? patterns[0];
    }

    // -- Section derivation ---------------------------------------------
    // All four take a "base" grid (kick/snare/hihatClosed/hihatOpen/swing)
    // and return a full 7-voice grid. `main` is the seed itself, lightly
    // wrapped; the other three apply a clear, generic arranging rule --
    // the same rule for every genre, so genre character survives (it's
    // baked into the seed's own kick/snare/hihat shapes) while the
    // arrangement logic itself stays consistent and easy to reason about.

    function deriveMain(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick, snare: seed.snare,
            hihatClosed: seed.hihatClosed, hihatOpen: seed.hihatOpen,
            // seed.perc carries real ride/cymbal data for the six
            // dataset-derived genres (see file header) -- that's core
            // groove content, not ear-candy, so it belongs in `main`.
            // Hand-authored seeds don't define .perc, so they fall
            // through to silence exactly as before.
            tomLow: silence(), tomHigh: silence(), perc: seed.perc ?? silence(),
        };
    }

    // Every derive function below takes a `percFor(fallbackPattern)` helper
    // instead of hardcoding perc directly. For the six GMD-derived clusters
    // (pop/hiphop/rock/jazz/funk/rnb), seed.perc is REAL drummer cymbal
    // data -- core groove content, per deriveMain()'s comment, not an
    // occasional accent -- so it should keep playing (thinned to match
    // each section's energy) in every section, not just main. This
    // mattered most for jazz specifically: its ride cymbal is the genre's
    // continuous timekeeper, not ear candy, so silencing it outside main
    // (the ORIGINAL behavior below, before this fix) made every non-main
    // section of a jazz session play without its most identifying sound.
    // Hand-authored seeds (electronic/indie/folk/fallback/metal/reggaeton)
    // don't define .perc at all, so they fall through to `fallbackPattern`
    // unchanged -- their perc genuinely IS meant as a sparse per-section
    // accent, and this preserves that exactly as it was.
    function percFor(seed, fallbackPattern, scale) {
        return seed.perc ? seed.perc.map((v) => Math.min(1, v * scale)) : fallbackPattern;
    }

    // Verse-energy: only the strong-beat kicks survive, snare drops out
    // entirely, hats thin to soft quarter notes, no toms. The most
    // stripped-down a pattern ever gets -- except perc, which (for the
    // dataset-derived clusters) keeps going, just thinned down; see
    // percFor() above.
    function deriveBasic(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick.map((v, i) => (i % 8 === 0 ? v : 0)), // keep only beat-1/beat-3 hits, if the seed has them
            snare: silence(),
            hihatClosed: seed.hihatClosed.map((v, i) => (i % 4 === 0 ? v * 0.6 : 0)), // quarter notes, pulled back
            hihatOpen: silence(),
            tomLow: silence(), tomHigh: silence(),
            perc: percFor(seed, silence(), 0.5),
        };
    }

    // Escalating build, low-energy and high-energy halves (drum-layer.js
    // plays buildupLow for the first half of BUILDUP's length and
    // buildupHigh for the second half). Kick drops out almost entirely
    // (the classic "pull the low end so the rise reads clearly" trick)
    // until a pickup hit right before the drop; hats rise in density via
    // a velocity ramp baked into the grid; toms enter and climb
    // low -> high, arriving at their highest/densest exactly where MAIN
    // is about to land. perc: see percFor() above.
    function deriveBuildupLow(seed) {
        return {
            swing: seed.swing,
            kick: silence(),
            snare: silence(),
            hihatClosed: Array.from({ length: STEPS }, (_, i) => 0.35 + (i / (STEPS - 1)) * 0.15),
            hihatOpen: silence(),
            tomLow: [1, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0],
            tomHigh: silence(),
            perc: percFor(seed, [0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .3, 0], 0.6),
        };
    }

    function deriveBuildupHigh(seed) {
        return {
            swing: seed.swing,
            kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .9, 0], // pickup hit right before the drop
            snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6], // pickup snare alongside it, driving into the downbeat
            hihatClosed: Array.from({ length: STEPS }, (_, i) => 0.5 + (i / (STEPS - 1)) * 0.4),
            hihatOpen: silence(),
            tomLow: [1, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tomHigh: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, .8, 0, .9, 0], // ascending -- toms climb from low to high across the build
            perc: percFor(seed, [0, 0, .4, 0, .4, 0, .4, 0, 0, 0, .4, 0, .4, 0, .4, 0], 0.9),
        };
    }

    // A genuine variation on the seed, not a copy: kick stays (same
    // groove family), snare keeps every hit the seed already has (its
    // backbeat, or -- for house's four-on-the-floor seed specifically --
    // the beats-2-and-4 clap that IS the genre, not a detail to
    // overwrite) and gains extra emphasis on beat 3 plus a pickup ghost
    // note layered on top, hats pull back to make room for a steady perc
    // texture -- the B section's own signature color -- plus a light tom
    // accent. Reads as "same song, different part," not "different
    // song": ADDING accents, never erasing the seed's own hits, is what
    // keeps it that way. (Used to zero out every step except 8 and 14,
    // silently deleting whatever backbeat the seed had there -- fixed
    // after it made house's B_SECTION lose its clap entirely.) perc: see
    // percFor() above -- runs at full strength here, same as main.
    function deriveBSection(seed) {
        return {
            swing: seed.swing,
            kick: seed.kick,
            snare: seed.snare.map((v, i) => (i === 8 ? Math.max(v, 0.8) : i === 14 ? Math.max(v, 0.5) : v)),
            hihatClosed: seed.hihatClosed.map((v) => v * 0.7),
            hihatOpen: seed.hihatOpen,
            tomLow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 0],
            tomHigh: silence(),
            perc: percFor(seed, [0, 0, .5, 0, 0, 0, .5, 0, 0, 0, .5, 0, 0, 0, .5, 0], 1.0),
        };
    }

    // All-zero, shared by every pattern (silence has no genre) -- the
    // arrangement's SILENCE state plays this.
    const SILENT_GRID = {
        swing: 0,
        kick: silence(), snare: silence(), hihatClosed: silence(), hihatOpen: silence(),
        tomLow: silence(), tomHigh: silence(), perc: silence(),
    };

    // Build the full section set for one seed, run once at load time so
    // drum-layer.js can just read `pattern.sections.main`, etc. directly.
    //
    // Used to also generate two fill variants per section (see git
    // history) -- removed once drum-layer.js's arrangement transitions
    // became genre-data-driven (arrangement-data.js): a fill's whole job
    // was announcing "something's about to change" ahead of a somewhat
    // arbitrary hand-picked transition, but now that the transition
    // itself is a real, differentiated per-genre event, a generic
    // one-size-fits-all fill on top of it read as redundant noise rather
    // than added drama.
    function buildSections(seed) {
        return {
            main: deriveMain(seed),
            basic: deriveBasic(seed),
            buildupLow: deriveBuildupLow(seed),
            buildupHigh: deriveBuildupHigh(seed),
            bSection: deriveBSection(seed),
        };
    }

    for (const seeds of Object.values(SEED_PATTERNS)) {
        for (const seed of seeds) {
            seed.sections = buildSections(seed);
        }
    }

    global.DrumPatterns = { DRUM_PATTERNS: SEED_PATTERNS, pickPattern, SILENT_GRID };
})(window);
