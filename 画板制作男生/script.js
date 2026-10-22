/* =========================================================
   小小涂色家 · 无文字卡通画板
   底层：卡通背景 + 女孩线稿（固定）
   上层：透明 Canvas（自由涂色）
   ========================================================= */
(function () {
    'use strict';

    /* ---------- 基础常量 ---------- */
    var W = 720;
    var H = 1280;
    var TAU = Math.PI * 2;
    var MAX_HISTORY = 24;

    /* ---------- DOM ---------- */
    var stage = document.querySelector('.stage');
    var wrapper = document.getElementById('wrapper');
    var sceneCanvas = document.getElementById('sceneCanvas');
    var drawCanvas = document.getElementById('drawCanvas');
    var sceneCtx = sceneCanvas.getContext('2d');
    var drawCtx = drawCanvas.getContext('2d');
    var undoBtn = document.getElementById('undoBtn');
    var eraserBtn = document.getElementById('eraserTool');
    var saveBtn = document.getElementById('saveBtn');
    var colorPanel = document.querySelector('.panel-colors');

    sceneCanvas.width = W;
    sceneCanvas.height = H;
    drawCanvas.width = W;
    drawCanvas.height = H;

    /* ---------- 状态 ---------- */
    var state = {
        color: '#E74C3C',
        size: 16,
        eraser: false,
        drawing: false,
        pointerId: null,
        last: { x: 0, y: 0 },
        mid: { x: 0, y: 0 },
        history: []
    };
    var seq = 0;

    /* =========================================================
       一、背景 + 线稿
       ========================================================= */
    var character = new Image();
    var imageFailed = false;

    function paintScene() {
        var c = sceneCtx;
        c.save();
        c.clearRect(0, 0, W, H);

        /* 画布底色：淡纯色 */
        c.fillStyle = '#FFFBF2';
        c.fillRect(0, 0, W, H);

        if (character.complete && character.naturalWidth > 0) {
            var gs = Math.min(1, W / 720);
            var gw = 720 * gs;
            var gh = 1280 * gs;
            c.drawImage(character, (W - gw) / 2, (H - gh) / 2, gw, gh);
        } else if (imageFailed) {
            c.fillStyle = '#F4E6CF';
            c.beginPath();
            c.arc(W / 2, H / 2, 70, 0, TAU);
            c.fill();
        }

        c.restore();
    }

    /* =========================================================
       二、画布尺寸：铺满左右面板之间的空间
       ========================================================= */
    function fitCanvas() {
        var cw = wrapper.clientWidth;
        var ch = wrapper.clientHeight;
        if (cw < 20 || ch < 20) return;

        var newW = Math.round(H * (cw / ch));
        newW = Math.max(360, Math.min(2400, newW));
        if (Math.abs(newW - W) < 2) return;

        applyCanvasWidth(newW);
    }

    function applyCanvasWidth(newW) {
        var oldW = W;
        var oldScale = Math.min(1, oldW / 720);
        var snapshot = null;

        if (!isCanvasEmpty()) {
            snapshot = document.createElement('canvas');
            snapshot.width = oldW;
            snapshot.height = H;
            snapshot.getContext('2d').drawImage(drawCanvas, 0, 0);
        }

        W = newW;
        sceneCanvas.width = W;
        sceneCanvas.height = H;
        drawCanvas.width = W;
        drawCanvas.height = H;

        paintScene();

        if (snapshot) {
            var newScale = Math.min(1, W / 720);
            var ratio = newScale / oldScale;
            drawCtx.save();
            drawCtx.translate(W / 2, H / 2);
            drawCtx.scale(ratio, ratio);
            drawCtx.drawImage(snapshot, -oldW / 2, -H / 2);
            drawCtx.restore();
        }

        state.history = [];
        syncUndoButton();
    }

    window.addEventListener('resize', fitCanvas);
    window.addEventListener('orientationchange', function () {
        setTimeout(fitCanvas, 200);
    });
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(fitCanvas).observe(stage);
    }

    /* =========================================================
       三、颜色 / 笔刷粗细
       ========================================================= */
    var swatches = Array.prototype.slice.call(document.querySelectorAll('.swatch'));
    var sizeButtons = Array.prototype.slice.call(document.querySelectorAll('.size'));

    function selectColor(btn) {
        swatches.forEach(function (s) { s.classList.remove('active'); });
        btn.classList.add('active');
        state.color = btn.dataset.color;
        state.eraser = false;
        syncToolButtons();
    }

    swatches.forEach(function (btn) {
        btn.addEventListener('click', function () { selectColor(btn); });
    });

    sizeButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            sizeButtons.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.size = parseInt(btn.dataset.size, 10) || 16;
        });
    });

    /* 右下角重置（可撤销） */
    document.getElementById('resetBtn').addEventListener('click', function () {
        clearWithHistory();
    });

    /* =========================================================
       四、工具切换（橡皮按钮再次点击回到画笔）
       ========================================================= */
    function syncToolButtons() {
        eraserBtn.classList.toggle('active', state.eraser);
        drawCanvas.style.cursor = state.eraser ? 'cell' : 'crosshair';
    }

    eraserBtn.addEventListener('click', function () {
        state.eraser = !state.eraser;
        syncToolButtons();
    });

    undoBtn.addEventListener('click', undo);

    saveBtn.addEventListener('click', saveArtwork);

    /* =========================================================
       五、绘制逻辑（Pointer 事件，兼容鼠标 / 触屏 / 手写笔）
       ========================================================= */
    function toCanvasPoint(e) {
        var r = drawCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (W / r.width),
            y: (e.clientY - r.top) * (H / r.height)
        };
    }

    function prepareStroke(ctx) {
        var eraser = state.eraser;
        ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
        ctx.lineWidth = eraser ? state.size * 1.8 : state.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = eraser ? 'rgba(0, 0, 0, 1)' : state.color;
    }

    function paintDot(p) {
        var ctx = drawCtx;
        ctx.save();
        prepareStroke(ctx);
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, TAU);
        ctx.fillStyle = state.eraser ? 'rgba(0, 0, 0, 1)' : state.color;
        ctx.fill();
        ctx.restore();
    }

    function shakeColors() {
        colorPanel.classList.remove('shake');
        void colorPanel.offsetWidth;
        colorPanel.classList.add('shake');
        setTimeout(function () {
            colorPanel.classList.remove('shake');
        }, 450);
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (!state.eraser && !state.color) {
            shakeColors();
            return;
        }
        e.preventDefault();

        state.drawing = true;
        state.pointerId = e.pointerId;
        var p = toCanvasPoint(e);
        state.last = p;
        state.mid = p;

        pushHistory();
        paintDot(p);

        if (drawCanvas.setPointerCapture) {
            try { drawCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
    }

    function onPointerMove(e) {
        if (!state.drawing || e.pointerId !== state.pointerId) return;
        e.preventDefault();

        var p = toCanvasPoint(e);
        var mid = {
            x: (state.last.x + p.x) / 2,
            y: (state.last.y + p.y) / 2
        };

        var ctx = drawCtx;
        ctx.save();
        prepareStroke(ctx);
        ctx.beginPath();
        ctx.moveTo(state.mid.x, state.mid.y);
        ctx.quadraticCurveTo(state.last.x, state.last.y, mid.x, mid.y);
        ctx.stroke();
        ctx.restore();

        state.mid = mid;
        state.last = p;
    }

    function onPointerUp(e) {
        if (!state.drawing) return;
        state.drawing = false;

        var ctx = drawCtx;
        ctx.save();
        prepareStroke(ctx);
        ctx.beginPath();
        ctx.moveTo(state.mid.x, state.mid.y);
        ctx.lineTo(state.last.x, state.last.y);
        ctx.stroke();
        ctx.restore();

        if (drawCanvas.releasePointerCapture && state.pointerId !== null) {
            try { drawCanvas.releasePointerCapture(state.pointerId); } catch (err) { /* ignore */ }
        }
        state.pointerId = null;
    }

    drawCanvas.addEventListener('pointerdown', onPointerDown);
    drawCanvas.addEventListener('pointermove', onPointerMove);
    drawCanvas.addEventListener('pointerup', onPointerUp);
    drawCanvas.addEventListener('pointercancel', onPointerUp);
    drawCanvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* =========================================================
       六、撤销 / 清空（清空也可撤销，避免误触丢失作品）
       ========================================================= */
    function pushHistory() {
        try {
            state.history.push(drawCanvas.toDataURL('image/png'));
            while (state.history.length > MAX_HISTORY) state.history.shift();
            seq++;
            syncUndoButton();
        } catch (err) {
            console.warn('history failed', err);
        }
    }

    function syncUndoButton() {
        undoBtn.disabled = state.history.length === 0;
    }

    function undo() {
        if (state.history.length === 0) return;
        var data = state.history.pop();
        var token = ++seq;
        syncUndoButton();

        var img = new Image();
        img.onload = function () {
            if (token !== seq) return;
            drawCtx.clearRect(0, 0, W, H);
            drawCtx.drawImage(img, 0, 0, W, H);
        };
        img.src = data;
    }

    function clearWithHistory() {
        if (isCanvasEmpty()) return;
        pushHistory();
        drawCtx.clearRect(0, 0, W, H);
        syncUndoButton();
    }

    function isCanvasEmpty() {
        var data = drawCtx.getImageData(0, 0, W, H).data;
        for (var i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) return false;
        }
        return true;
    }

    /* =========================================================
       七、保存作品（星星按钮）
       ========================================================= */
    function saveArtwork() {
        var scale = 2;
        var out = document.createElement('canvas');
        out.width = W * scale;
        out.height = H * scale;
        var ctx = out.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sceneCanvas, 0, 0, out.width, out.height);
        ctx.drawImage(drawCanvas, 0, 0, out.width, out.height);

        var name = buildFileName();

        if (out.toBlob) {
            out.toBlob(function (blob) {
                if (!blob) return;
                downloadBlob(blob, name);
            }, 'image/png');
        } else {
            downloadUrl(out.toDataURL('image/png'), name);
        }

        saveBtn.classList.remove('save-done');
        void saveBtn.offsetWidth;
        saveBtn.classList.add('save-done');
        setTimeout(function () {
            saveBtn.classList.remove('save-done');
        }, 700);
    }

    function buildFileName() {
        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return '小小画家-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.png';
    }

    function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        downloadUrl(url, name, function () {
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        });
    }

    function downloadUrl(url, name, done) {
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (done) done();
    }

    /* =========================================================
       八、键盘快捷键（无界面文字）
       ========================================================= */
    window.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                undo();
            }
            return;
        }
        if (e.key === 'b' || e.key === 'B') {
            state.eraser = false;
            syncToolButtons();
        } else if (e.key === 'e' || e.key === 'E') {
            state.eraser = true;
            syncToolButtons();
        }
    });

    /* =========================================================
       九、启动
       ========================================================= */
    character.onload = paintScene;
    character.onerror = function () {
        imageFailed = true;
        paintScene();
    };
    character.src = (typeof window.LINEART_IMAGE === 'string' && window.LINEART_IMAGE.indexOf('base64') !== -1)
        ? window.LINEART_IMAGE
        : 'assets/lineart-720.png';

    paintScene();
    selectColor(swatches[0]);
    syncUndoButton();

    requestAnimationFrame(fitCanvas);
    setTimeout(fitCanvas, 250);
    window.addEventListener('load', fitCanvas);
})();
