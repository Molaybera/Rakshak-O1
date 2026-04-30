/**
 * RAKSHAK FIRE — Pixel-color fire detection engine
 * Detects orange/red/yellow flame colors from camera feed
 */
const RakshakFire = {
    frameSkip: 0,
    scanCanvas: null,
    scanCtx: null,
    lastPct: 0,
    alertCooldown: 0,
    buffer: [],     // rolling average over 10 readings

    detect(videoEl, drawCtx, drawCanvas) {
        // Run every 3rd frame for performance
        this.frameSkip++;
        if (this.frameSkip % 3 !== 0) {
            this._updateUI(this.lastPct, drawCtx, drawCanvas);
            return;
        }

        // Create scan canvas once (downscaled for speed)
        if (!this.scanCanvas) {
            this.scanCanvas = document.createElement('canvas');
            this.scanCtx = this.scanCanvas.getContext('2d', { willReadFrequently: true });
        }
        const SW = 160, SH = 120; // scan at 160x120 for speed
        this.scanCanvas.width = SW;
        this.scanCanvas.height = SH;
        this.scanCtx.drawImage(videoEl, 0, 0, SW, SH);

        const imgData = this.scanCtx.getImageData(0, 0, SW, SH);
        const px = imgData.data;
        const totalPixels = SW * SH;
        let firePixels = 0;
        let minX = SW, minY = SH, maxX = 0, maxY = 0;

        for (let i = 0; i < px.length; i += 4) {
            const r = px[i], g = px[i + 1], b = px[i + 2];

            // Fire color detection in RGB space:
            // Fire pixels are red-dominant with high brightness
            // Rule: R > 200, G between 50-180, B < 100, R > G, R > B*2
            const isFireBright = (r > 200 && g > 50 && g < 180 && b < 100 && r > g && r > b * 2);

            // Also catch orange-yellow flames:
            // R > 180, G > 100, G < 220, B < 80
            const isOrangeFlame = (r > 180 && g > 100 && g < 220 && b < 80 && r > g);

            // Catch lighter/white-hot fire center:
            // Very bright warm white: R > 240, G > 200, B > 150, B < 220
            const isWhiteHot = (r > 240 && g > 200 && b > 150 && b < 220 && r >= g);

            if (isFireBright || isOrangeFlame || isWhiteHot) {
                firePixels++;
                const pixIdx = (i / 4);
                const px_x = pixIdx % SW;
                const px_y = Math.floor(pixIdx / SW);
                minX = Math.min(minX, px_x);
                minY = Math.min(minY, px_y);
                maxX = Math.max(maxX, px_x);
                maxY = Math.max(maxY, px_y);
            }
        }

        const rawPct = Math.round((firePixels / totalPixels) * 100);

        // Rolling average (smooth out flicker)
        this.buffer.push(rawPct);
        if (this.buffer.length > 10) this.buffer.shift();
        const avgPct = Math.round(this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length);

        this.lastPct = avgPct;

        // Store bounding box for drawing (scale up to full canvas)
        if (avgPct >= 3 && firePixels > 20) {
            const scX = drawCanvas.width / SW;
            const scY = drawCanvas.height / SH;
            this._fireBox = {
                x: minX * scX - 10,
                y: minY * scY - 10,
                w: (maxX - minX) * scX + 20,
                h: (maxY - minY) * scY + 20
            };
        } else {
            this._fireBox = null;
        }

        this._updateUI(avgPct, drawCtx, drawCanvas);

        // Debug: log fire percentage to browser console
        if (avgPct >= 1) console.log(`[FIRE SCAN] ${avgPct}% coverage (raw: ${rawPct}%, pixels: ${firePixels})`);

        // Alert on fire detection — send email at ≥5% coverage
        if (avgPct >= 5) {
            this._fireAlert(avgPct);
        }
    },

    _updateUI(pct, ctx, canvas) {
        const el = document.getElementById('fire-val');
        el.innerText = pct + '%';
        if (pct >= 15) {
            el.className = 'text-xl font-mono font-black text-rose-500 animate-pulse';
        } else if (pct >= 5) {
            el.className = 'text-xl font-mono font-black text-amber-400';
        } else {
            el.className = 'text-xl font-mono font-black text-slate-400';
        }

        // Draw fire bounding box
        if (this._fireBox && pct >= 3) {
            const { x, y, w, h } = this._fireBox;
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 13px Inter, monospace';
            const label = `🔥 FIRE ${pct}%`;
            const textW = ctx.measureText(label).width;
            const ly = y > 28 ? y - 8 : y + h + 22;
            ctx.beginPath();
            ctx.roundRect(x, ly - 16, textW + 16, 24, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, x + 8, ly);
        }
    },

    async _fireAlert(pct) {
        const now = Date.now();
        if (now - this.alertCooldown < 60000) return; // 1 minute cooldown
        this.alertCooldown = now;
        RakshakLogger.add(`🔥 FIRE DETECTED: ${pct}% coverage. Sending alert email...`, 'alert');

        try {
            const tempCanvas = document.createElement('canvas');
            const tCtx = tempCanvas.getContext('2d');
            tempCanvas.width = RakshakApp.ui.canvas.width;
            tempCanvas.height = RakshakApp.ui.canvas.height;
            tCtx.drawImage(RakshakApp.ui.boostCanvas, 0, 0);
            tCtx.drawImage(RakshakApp.ui.canvas, 0, 0);
            const snapshot = tempCanvas.toDataURL('image/jpeg', 0.7);

            const resp = await fetch('/api/alerts/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'fire', personCount: 0, image: snapshot, firePct: pct })
            });
            const result = await resp.json();
            if (result.success) {
                RakshakLogger.add(`✉️ Fire alert email sent successfully.`, 'system');
            } else {
                RakshakLogger.add(`⚠ Fire alert email failed.`, 'alert');
            }
        } catch (e) {
            console.error('Fire alert error:', e);
            RakshakLogger.add(`⚠ Fire alert dispatch failed: ${e.message}`, 'alert');
        }
    }
};
