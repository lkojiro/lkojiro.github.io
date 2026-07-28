function createFallingAsciiRenderer(elementId) {
    var COLS = 100;
    var canvasEl = document.getElementById(elementId);

    // Measure the row height this browser actually renders for this
    // font, using a detached probe rather than #ascii-canvas itself:
    // that element has an explicit height (100vh), and scrollHeight on
    // an element taller than its content clamps to clientHeight instead
    // of reporting the true content size, which previously collapsed
    // this measurement down to roughly half the viewport per "row".
    var probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    var canvasStyle = getComputedStyle(canvasEl);
    probe.style.fontFamily = canvasStyle.fontFamily;
    probe.style.fontSize = canvasStyle.fontSize;
    probe.style.lineHeight = canvasStyle.lineHeight;
    probe.textContent = "X\nX";
    document.body.appendChild(probe);
    var ROW_HEIGHT_PX = probe.getBoundingClientRect().height / 2;
    document.body.removeChild(probe);

    var ROWS = Math.max(20, Math.ceil(canvasEl.clientHeight / ROW_HEIGHT_PX));
    var W = COLS;
    var H = ROWS * 2; // extra vertical resolution, halved later to correct for character-cell aspect ratio
    var RAMP = " .:-=+*#%@";

    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) {
        canvasEl.textContent = "WebGL is not available in this browser.";
        return;
    }

    function compileShader(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    var vertexSrc = [
        "attribute vec3 aPosition;",
        "attribute vec3 aNormal;",
        "uniform mat4 uModel;",
        "uniform mat4 uProjection;",
        "uniform mat3 uNormalMatrix;",
        "varying vec3 vNormal;",
        "void main() {",
        "    vNormal = uNormalMatrix * aNormal;",
        "    gl_Position = uProjection * uModel * vec4(aPosition, 1.0);",
        "}"
    ].join("\n");

    var fragmentSrc = [
        "precision mediump float;",
        "varying vec3 vNormal;",
        "uniform vec3 uLightDir;",
        "void main() {",
        "    vec3 n = normalize(vNormal);",
        "    float diff = max(dot(n, uLightDir), 0.0);",
        "    float lum = 0.15 + 0.85 * diff;",
        "    gl_FragColor = vec4(vec3(lum), 1.0);",
        "}"
    ].join("\n");

    var program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    // --- flat-shaded polyhedra ---
    // Builds one normal per face (flat shading) by duplicating vertices per
    // face and auto-orienting the normal outward from the origin, so face
    // winding order doesn't need to be worked out by hand for each shape.
    function buildFlatShaded(corners, faces) {
        var positions = [];
        var normals = [];
        var indices = [];
        var faceRanges = [];
        var vertCount = 0;
        for (var f = 0; f < faces.length; f++) {
            var face = faces[f];
            var v0 = corners[face[0]], v1 = corners[face[1]], v2 = corners[face[2]];
            var ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
            var wx = v2[0] - v0[0], wy = v2[1] - v0[1], wz = v2[2] - v0[2];
            var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
            var nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= nlen; ny /= nlen; nz /= nlen;

            var cx = 0, cy = 0, cz = 0;
            for (var p = 0; p < face.length; p++) {
                cx += corners[face[p]][0]; cy += corners[face[p]][1]; cz += corners[face[p]][2];
            }
            cx /= face.length; cy /= face.length; cz /= face.length;
            if (nx * cx + ny * cy + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; }

            var baseIndex = vertCount;
            for (var q = 0; q < face.length; q++) {
                var corner = corners[face[q]];
                positions.push(corner[0], corner[1], corner[2]);
                normals.push(nx, ny, nz);
                vertCount++;
            }
            var indexStart = indices.length;
            for (var k = 1; k < face.length - 1; k++) {
                indices.push(baseIndex, baseIndex + k, baseIndex + k + 1);
            }
            faceRanges.push({
                indexStart: indexStart,
                indexCount: indices.length - indexStart,
                normal: [nx, ny, nz]
            });
        }
        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            indices: new Uint16Array(indices),
            faceRanges: faceRanges
        };
    }

    function createTetrahedron() {
        var s = 0.8;
        var corners = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(function (p) {
            return [p[0] * s, p[1] * s, p[2] * s];
        });
        var faces = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
        return buildFlatShaded(corners, faces);
    }

    function createCube() {
        var h = 0.85;
        var corners = [
            [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h],
            [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]
        ];
        var faces = [
            [0, 1, 2, 3], [4, 5, 6, 7],
            [0, 1, 5, 4], [3, 2, 6, 7],
            [0, 3, 7, 4], [1, 2, 6, 5]
        ];
        return buildFlatShaded(corners, faces);
    }

    function createOctahedron() {
        var s = 1.3;
        var corners = [[s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]];
        var faces = [
            [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
            [1, 2, 5], [1, 5, 3], [1, 3, 4], [1, 4, 2]
        ];
        return buildFlatShaded(corners, faces);
    }

    function createIcosahedron() {
        var s = 1.3;
        var corners = [
            [0.000, 0.000, 1.000], [0.894, 0.000, 0.447], [0.276, 0.851, 0.447],
            [-0.724, 0.526, 0.447], [-0.724, -0.526, 0.447], [0.276, -0.851, 0.447],
            [0.724, 0.526, -0.447], [-0.276, 0.851, -0.447], [-0.894, 0.000, -0.447],
            [-0.276, -0.851, -0.447], [0.724, -0.526, -0.447], [0.000, 0.000, -1.000]
        ].map(function (p) { return [p[0] * s, p[1] * s, p[2] * s]; });
        var faces = [
            [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 1],
            [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4],
            [4, 8, 9], [4, 9, 5], [5, 9, 10], [5, 10, 1], [1, 10, 6],
            [6, 10, 11], [6, 11, 7], [7, 11, 8], [8, 11, 9], [9, 11, 10]
        ];
        return buildFlatShaded(corners, faces);
    }

    function createDodecahedron() {
        var s = 1.3;
        var corners = [
            [0.607, 0.000, 0.795], [0.188, 0.577, 0.795], [-0.491, 0.357, 0.795],
            [-0.491, -0.357, 0.795], [0.188, -0.577, 0.795], [0.982, 0.000, 0.188],
            [0.304, 0.934, 0.188], [-0.795, 0.577, 0.188], [-0.795, -0.577, 0.188],
            [0.304, -0.934, 0.188], [0.795, 0.577, -0.188], [-0.304, 0.934, -0.188],
            [-0.982, 0.000, -0.188], [-0.304, -0.934, -0.188], [0.795, -0.577, -0.188],
            [0.491, 0.357, -0.795], [-0.188, 0.577, -0.795], [-0.607, 0.000, -0.795],
            [-0.188, -0.577, -0.795], [0.491, -0.357, -0.795]
        ].map(function (p) { return [p[0] * s, p[1] * s, p[2] * s]; });
        var faces = [
            [0, 1, 2, 3, 4], [0, 5, 10, 6, 1], [1, 6, 11, 7, 2], [2, 7, 12, 8, 3],
            [3, 8, 13, 9, 4], [4, 9, 14, 5, 0], [15, 10, 5, 14, 19], [16, 11, 6, 10, 15],
            [17, 12, 7, 11, 16], [18, 13, 8, 12, 17], [19, 14, 9, 13, 18], [19, 18, 17, 16, 15]
        ];
        return buildFlatShaded(corners, faces);
    }

    var SHAPE_FACTORIES = [
        createTetrahedron, createCube, createOctahedron, createDodecahedron, createIcosahedron
    ];

    var aPosition = gl.getAttribLocation(program, "aPosition");
    var aNormal = gl.getAttribLocation(program, "aNormal");
    var uModel = gl.getUniformLocation(program, "uModel");
    var uProjection = gl.getUniformLocation(program, "uProjection");
    var uNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");
    var uLightDir = gl.getUniformLocation(program, "uLightDir");

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);

    // --- minimal column-major mat4/mat3 helpers ---
    function mat4Identity() {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    function mat4Multiply(a, b) {
        var out = new Float32Array(16);
        for (var col = 0; col < 4; col++) {
            for (var row = 0; row < 4; row++) {
                var sum = 0;
                for (var k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
                out[col * 4 + row] = sum;
            }
        }
        return out;
    }
    function mat4Perspective(fovy, aspect, near, far) {
        var f = 1 / Math.tan(fovy / 2);
        var nf = 1 / (near - far);
        var out = new Float32Array(16);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) * nf;
        out[11] = -1;
        out[14] = 2 * far * near * nf;
        return out;
    }
    function mat4Translate(tx, ty, tz) {
        var m = mat4Identity();
        m[12] = tx; m[13] = ty; m[14] = tz;
        return m;
    }
    // Uniform scale about the local origin, then translate -- used to shrink
    // an exploding face's own vertices toward its local (0,0,0) while flying
    // it outward along its normal.
    function mat4TranslateScale(tx, ty, tz, s) {
        var m = mat4Identity();
        m[0] = s; m[5] = s; m[10] = s;
        m[12] = tx; m[13] = ty; m[14] = tz;
        return m;
    }
    function mat3FromMat4Rotation(m) {
        return new Float32Array([
            m[0], m[1], m[2],
            m[4], m[5], m[6],
            m[8], m[9], m[10]
        ]);
    }
    // Rodrigues' rotation formula for an arbitrary unit axis
    function mat4FromAxisAngle(axis, angle) {
        var x = axis[0], y = axis[1], z = axis[2];
        var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
        var m = mat4Identity();
        m[0] = t * x * x + c;     m[1] = t * x * y + s * z; m[2] = t * x * z - s * y;
        m[4] = t * x * y - s * z; m[5] = t * y * y + c;     m[6] = t * y * z + s * x;
        m[8] = t * x * z + s * y; m[9] = t * y * z - s * x; m[10] = t * z * z + c;
        return m;
    }

    var FOV_Y = 60 * Math.PI / 180;
    var Z_DIST = 16;
    var projection = mat4Perspective(FOV_Y, W / H, 0.1, 100);
    var lightDir = normalize3([0.4, 0.6, 1.0]);

    function normalize3(v) {
        var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    // margin well beyond any shape's bounding radius (the cube's corner-to-
    // center distance, ~1.47, is the largest) so a shape is comfortably
    // fully offscreen at spawn and despawn, not just barely past the edge
    var SHAPE_MARGIN = 2.5;
    var FALL_SPEED_MIN = 0.012;
    var FALL_SPEED_MAX = 0.020;
    var NUM_SHAPES = 18;
    var Z_SPREAD = 10; // shapes spawn at depths in [Z_DIST - Z_SPREAD, Z_DIST + Z_SPREAD]
    var X_RANGE_FACTOR = 0.8; // fraction of the frustum's half-width used for x placement
    var Y_STAGGER_MAX = 35; // extra random height added above the minimum offscreen spawn point
    var HIT_TEST_RADIUS = 1.5; // approximate bounding radius used for click hit-testing
    var EXPLODE_DURATION_MS = 400;
    var EXPLODE_DISTANCE = 2.2; // world units each face flies outward along its own normal

    function halfHeightForZ(z) {
        return z * Math.tan(FOV_Y / 2);
    }
    function halfWidthForZ(z) {
        return (W / H) * halfHeightForZ(z);
    }
    function topYForZ(z) {
        return halfHeightForZ(z) + SHAPE_MARGIN;
    }

    function spawnShape(shape) {
        var factory = SHAPE_FACTORIES[Math.floor(Math.random() * SHAPE_FACTORIES.length)];
        var geom = factory();

        gl.bindBuffer(gl.ARRAY_BUFFER, shape.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);
        shape.indexCount = geom.indices.length;
        shape.faceRanges = geom.faceRanges;

        shape.z = Z_DIST - Z_SPREAD + Math.random() * (2 * Z_SPREAD);
        shape.x = (Math.random() * 2 - 1) * X_RANGE_FACTOR * halfWidthForZ(shape.z);
        shape.y = topYForZ(shape.z) + Math.random() * Y_STAGGER_MAX;

        shape.rotAxis = normalize3([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        shape.rotSpeed = (0.0075 + Math.random() * 0.0075) * (Math.random() < 0.5 ? -1 : 1);
        shape.rotAngle = 0;
        shape.fallSpeed = FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN);
        shape.exploding = false;
        shape.explodeStartTime = 0;
    }

    function startExplosion(shape) {
        shape.exploding = true;
        shape.explodeStartTime = performance.now();

        // z ranges over [Z_DIST - Z_SPREAD, Z_DIST + Z_SPREAD]; smaller z is
        // closer to the camera (rendered at world z = -shape.z), so split
        // that range into closest/middle/furthest thirds for sound choice.
        var zFrac = (shape.z - (Z_DIST - Z_SPREAD)) / (2 * Z_SPREAD);
        var sizeCategory = zFrac < 1 / 3 ? "large" : zFrac < 2 / 3 ? "medium" : "small";
        playExplosionSound(sizeCategory);
        addScore(sizeCategory);
    }

    var shapes = [];
    for (var i = 0; i < NUM_SHAPES; i++) {
        var shape = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            indexCount: 0,
            faceRanges: null,
            x: 0, y: 0, z: Z_DIST,
            rotAxis: [0, 1, 0], rotSpeed: 0, rotAngle: 0, fallSpeed: 0,
            exploding: false, explodeStartTime: 0
        };
        spawnShape(shape);
        shapes.push(shape);
    }

    // Click hit-testing uses an approximate on-screen bounding box per shape
    // (projected from its known world position/HIT_TEST_RADIUS) rather than
    // true GPU picking, since the canvas is just rendered text -- good
    // enough for a fun interaction, though clicks in a crowded overlap can
    // occasionally hit the wrong (non-topmost) shape.
    var COL_WIDTH_PX = canvasEl.clientWidth / COLS;

    function findShapeAt(clientX, clientY) {
        var rect = canvasEl.getBoundingClientRect();
        var col = (clientX - rect.left) / COL_WIDTH_PX;
        var row = (clientY - rect.top) / ROW_HEIGHT_PX;

        var hitShape = null;
        var hitZ = Infinity;
        for (var s = 0; s < shapes.length; s++) {
            var shape = shapes[s];
            if (shape.exploding) { continue; }
            var hw = halfWidthForZ(shape.z);
            var hh = halfHeightForZ(shape.z);
            var colCenter = (shape.x / hw + 1) / 2 * COLS;
            var rowCenter = (1 - shape.y / hh) / 2 * ROWS;
            var colHalfExtent = (HIT_TEST_RADIUS / hw) / 2 * COLS;
            var rowHalfExtent = (HIT_TEST_RADIUS / hh) / 2 * ROWS;

            if (Math.abs(col - colCenter) <= colHalfExtent &&
                Math.abs(row - rowCenter) <= rowHalfExtent &&
                shape.z < hitZ) {
                hitZ = shape.z;
                hitShape = shape;
            }
        }
        return hitShape;
    }

    canvasEl.style.cursor = "default";
    canvasEl.addEventListener("mousemove", function (event) {
        var hoverShape = findShapeAt(event.clientX, event.clientY);
        canvasEl.style.cursor = hoverShape ? "crosshair" : "default";
    });
    canvasEl.addEventListener("click", function (event) {
        var hitShape = findShapeAt(event.clientX, event.clientY);
        if (hitShape) {
            startExplosion(hitShape);
            canvasEl.style.cursor = "cell";
        }
    });

    var pixels = new Uint8Array(W * H * 4);
    var rowChars = new Array(ROWS);

    function render() {
        gl.viewport(0, 0, W, H);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(uProjection, false, projection);
        gl.uniform3fv(uLightDir, lightDir);

        for (var i = 0; i < shapes.length; i++) {
            var shape = shapes[i];

            if (shape.exploding) {
                var t = Math.min(1, (performance.now() - shape.explodeStartTime) / EXPLODE_DURATION_MS);
                var rot = mat4FromAxisAngle(shape.rotAxis, shape.rotAngle);
                var baseModel = mat4Multiply(mat4Translate(shape.x, shape.y, -shape.z), rot);
                var normalMatrix = mat3FromMat4Rotation(rot);
                var dist = t * EXPLODE_DISTANCE;
                var scale = 1 - t;

                gl.bindBuffer(gl.ARRAY_BUFFER, shape.positionBuffer);
                gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(aPosition);

                gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
                gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(aNormal);

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);
                gl.uniformMatrix3fv(uNormalMatrix, false, normalMatrix);

                for (var f = 0; f < shape.faceRanges.length; f++) {
                    var face = shape.faceRanges[f];
                    var pieceOffset = mat4TranslateScale(
                        face.normal[0] * dist, face.normal[1] * dist, face.normal[2] * dist, scale
                    );
                    var pieceModel = mat4Multiply(baseModel, pieceOffset);
                    gl.uniformMatrix4fv(uModel, false, pieceModel);
                    gl.drawElements(gl.TRIANGLES, face.indexCount, gl.UNSIGNED_SHORT, face.indexStart * 2);
                }

                if (t >= 1) {
                    spawnShape(shape);
                }
                continue;
            }

            shape.rotAngle += shape.rotSpeed;
            shape.y -= shape.fallSpeed;
            if (shape.y < -topYForZ(shape.z)) {
                spawnShape(shape);
            }

            var rot = mat4FromAxisAngle(shape.rotAxis, shape.rotAngle);
            var model = mat4Multiply(mat4Translate(shape.x, shape.y, -shape.z), rot);
            var normalMatrix = mat3FromMat4Rotation(rot);

            gl.bindBuffer(gl.ARRAY_BUFFER, shape.positionBuffer);
            gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(aPosition);

            gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(aNormal);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);

            gl.uniformMatrix4fv(uModel, false, model);
            gl.uniformMatrix3fv(uNormalMatrix, false, normalMatrix);

            gl.drawElements(gl.TRIANGLES, shape.indexCount, gl.UNSIGNED_SHORT, 0);
        }

        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        rasterizeToAscii();

        requestAnimationFrame(render);
    }

    function rasterizeToAscii() {
        // gl.readPixels rows are bottom-to-top; each output row averages
        // two source rows to correct for monospace cell aspect ratio.
        for (var y = 0; y < ROWS; y++) {
            var srcTop = H - 1 - (y * 2);
            var srcBottom = srcTop - 1;
            var chars = new Array(COLS);
            for (var x = 0; x < COLS; x++) {
                var iTop = (srcTop * W + x) * 4;
                var iBottom = (srcBottom * W + x) * 4;
                var lum = (pixels[iTop] + pixels[iBottom]) / (2 * 255);
                var idx = Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length));
                chars[x] = RAMP.charAt(idx);
            }
            rowChars[y] = chars.join("");
        }
        canvasEl.textContent = rowChars.join("\n");
    }

    requestAnimationFrame(render);
}

// Shared across both canvases so an explosion on either side restarts the
// same sound instead of two independent copies being able to overlap. One
// Audio object per size so, e.g., two "far" explosions in a row restart the
// same bangSmall instead of overlapping, while a near + far explosion at
// the same time can still both be heard.
var explosionSounds = {
    small: new Audio("bangSmall.wav"),
    medium: new Audio("bangMedium.wav"),
    large: new Audio("bangLarge.wav")
};
explosionSounds.small.volume = 0.05;
explosionSounds.medium.volume = 0.1;
explosionSounds.large.volume = 0.15;
function playExplosionSound(sizeCategory) {
    var audio = explosionSounds[sizeCategory];
    audio.currentTime = 0;
    audio.play();
}

// Shared across both canvases -- one running total for the whole page.
var SCORE_VALUES = { small: 100, medium: 200, large: 300 };
var score = 0;
var scoreEl = document.getElementById("score-display");
function addScore(sizeCategory) {
    score += SCORE_VALUES[sizeCategory];
    if (scoreEl) {
        scoreEl.textContent = "score: " + score.toLocaleString();
    }
}

createFallingAsciiRenderer("ascii-canvas");
createFallingAsciiRenderer("ascii-canvas-left");
