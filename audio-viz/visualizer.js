// visualizer.js
//
// Minimal waveform visualizer, decoupled from the audio engine -- it just
// reads whatever's on `analyser` every frame and draws it. Ties back to
// the falling-ascii.js aesthetic already on the main page (simple,
// monospace-adjacent, theme-aware) rather than introducing a flashy new
// visual language for one page.

(function (global) {
    "use strict";

    function startVisualizer(canvas, analyser) {
        const ctx = canvas.getContext("2d");
        let rafId = null;

        function resize() {
            canvas.width = canvas.clientWidth * window.devicePixelRatio;
            canvas.height = canvas.clientHeight * window.devicePixelRatio;
        }
        window.addEventListener("resize", resize);
        resize();

        function draw() {
            rafId = requestAnimationFrame(draw);

            const values = analyser.getValue(); // Float32Array, -1..1
            const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#1a1a1a";

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.strokeStyle = fg;
            ctx.lineWidth = 2 * window.devicePixelRatio;

            const sliceWidth = canvas.width / values.length;
            let x = 0;
            for (let i = 0; i < values.length; i++) {
                const y = (0.5 + values[i] * 0.4) * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.stroke();
        }
        draw();

        return function stopVisualizer() {
            if (rafId !== null) cancelAnimationFrame(rafId);
            window.removeEventListener("resize", resize);
        };
    }

    global.startVisualizer = startVisualizer;
})(window);
