(function () {
    var PHRASES = [
        "software engineer", "verification engineer", "musician", "dj",
        "urban hiker", "(slow) runner", "sharks fan", "music producer",
        "swimmer", "eagle scout", "karaoke enthusiast",
        "very qualified candidate", "beginner birder"
    ];
    var typedEl = document.getElementById("typed-text");

    function randomDelay(min, max) {
        return min + Math.random() * (max - min);
    }

    function typeText(text, i, callback) {
        typedEl.textContent = text.slice(0, i);
        if (i >= text.length) { callback(); return; }
        setTimeout(function () { typeText(text, i + 1, callback); }, randomDelay(60, 170));
    }

    function backspaceText(text, i, callback) {
        typedEl.textContent = text.slice(0, i);
        if (i <= 0) { callback(); return; }
        setTimeout(function () { backspaceText(text, i - 1, callback); }, 35);
    }

    var isFirstCycle = true;
    var bag = [];
    var lastPhrase = null;

    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    // Draws phrases from a shuffled "bag" that's refilled once emptied,
    // so every option is shown before any of them repeat.
    function nextPhrase() {
        if (bag.length === 0) {
            bag = shuffle(PHRASES);
            if (bag.length > 1 && bag[bag.length - 1] === lastPhrase) {
                var swapWith = Math.floor(Math.random() * (bag.length - 1));
                var tmp = bag[bag.length - 1];
                bag[bag.length - 1] = bag[swapWith];
                bag[swapWith] = tmp;
            }
        }
        lastPhrase = bag.pop();
        return lastPhrase;
    }

    function runCycle() {
        var phrase;
        if (isFirstCycle) {
            phrase = "software engineer";
            lastPhrase = phrase;
            isFirstCycle = false;
        } else {
            phrase = nextPhrase();
        }
        typeText(phrase, 0, function () {
            setTimeout(function () {
                backspaceText(phrase, phrase.length, function () {
                    setTimeout(runCycle, 800);
                });
            }, 2500);
        });
    }

    setTimeout(runCycle, 1000);
})();
