/**
 * RAKSHAK SECURITY — Person detection, identity matching, liveness, and alert dispatch
 * 
 * Contains:
 *   - RakshakLiveness:  Anti-spoofing engine (EAR blinks + nose displacement + Z-depth)
 *   - RakshakIdentity:  Face matching against DB embeddings (1412-feature vector)
 *   - RakshakSecurity:  Drawing bounding boxes + dispatching intrusion/spoofing alerts
 *   - RakshakLogger:    Security event log panel
 *
 */

// ============================================================
// RAKSHAK LOGGER
// ============================================================
const RakshakLogger = {
    add(msg, type) {
        const logs = document.getElementById('logs');
        if (logs.innerText.includes("Arm system")) logs.innerHTML = '';
        const div = document.createElement('div');
        const colorMap = { system: 'emerald', alert: 'rose', warning: 'amber' };
        const c = colorMap[type] || 'slate';
        div.className = `p-2 border-l-4 bg-white/5 border-${c}-500`;
        div.innerHTML = `<span class="text-slate-500">[${new Date().toLocaleTimeString()}]</span><br>${msg}`;
        logs.prepend(div);
    }
};

// ============================================================
// RAKSHAK LIVENESS ENGINE
// Multi-factor anti-spoofing: EAR blinks + nose displacement + Z-depth
// Decision made after 2 seconds (≈60 frames at 30fps)
// ============================================================
const RakshakLiveness = {
    // Rolling buffers (max 60 frames = ~2 seconds)
    WINDOW: 60,
    earBuffer: [],       // Eye Aspect Ratio per frame
    noseBuffer: [],      // Nose tip (x,y) per frame
    zBuffer: [],         // Nose tip Z depth per frame
    frameCount: 0,
    decision: null,      // null | 'live' | 'spoof'
    scanProgress: 0,     // 0–1

    reset() {
        this.earBuffer = [];
        this.noseBuffer = [];
        this.zBuffer = [];
        this.frameCount = 0;
        this.decision = null;
        this.scanProgress = 0;
        this._updateRing(0, '#f59e0b');
        document.getElementById('liveness-ring').style.display = 'none';
    },

    // Compute Eye Aspect Ratio from 6 eye landmarks
    _ear(p1, p2, p3, p4, p5, p6) {
        const h1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
        const h2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
        const w = Math.hypot(p1.x - p4.x, p1.y - p4.y);
        return (h1 + h2) / (2.0 * w + 1e-6);
    },

    // MediaPipe face mesh landmark indices for eyes
    // Left eye: 33,160,158,133,153,144
    // Right eye: 362,385,387,263,373,380
    _getEAR(kps) {
        const g = (i) => kps[i] || { x: 0, y: 0, z: 0 };
        const leftEAR = this._ear(g(33), g(160), g(158), g(133), g(153), g(144));
        const rightEAR = this._ear(g(362), g(385), g(387), g(263), g(373), g(380));
        return (leftEAR + rightEAR) / 2;
    },

    _updateRing(progress, color) {
        const circ = 138.23;
        const fill = document.getElementById('liveness-fill');
        const label = document.getElementById('liveness-label');
        if (!fill) return;
        fill.style.strokeDashoffset = circ - (circ * progress);
        fill.setAttribute('stroke', color);
        label.style.color = color;
        label.innerText = Math.round(progress * 100) + '%';
    },

    process(faces) {
        if (!faces || faces.length === 0) {
            this.reset();
            return null;
        }

        document.getElementById('liveness-ring').style.display = 'block';

        const kps = faces[0].keypoints;
        const nose = kps.find(k => k.name === 'noseTip') || kps[1];
        if (!nose) return this.decision;

        // Collect metrics
        const ear = this._getEAR(kps);
        this.earBuffer.push(ear);
        this.noseBuffer.push({ x: nose.x, y: nose.y });
        this.zBuffer.push(nose.z || 0);
        this.frameCount++;

        // Trim to window
        if (this.earBuffer.length > this.WINDOW) this.earBuffer.shift();
        if (this.noseBuffer.length > this.WINDOW) this.noseBuffer.shift();
        if (this.zBuffer.length > this.WINDOW) this.zBuffer.shift();

        // Update progress
        this.scanProgress = Math.min(this.frameCount / this.WINDOW, 1.0);

        // Don't make a final decision until window is full
        if (this.frameCount < this.WINDOW) {
            this._updateRing(this.scanProgress, '#f59e0b');
            document.getElementById('activity-val').innerText = 'SCAN';
            document.getElementById('activity-val').className = 'text-xl font-mono font-black text-amber-400';
            return this.decision; // still scanning
        }

        // ── FACTOR 1: EAR variance (blink detection) ──
        const earMean = this.earBuffer.reduce((a, b) => a + b, 0) / this.earBuffer.length;
        const earVariance = this.earBuffer.reduce((s, v) => s + (v - earMean) ** 2, 0) / this.earBuffer.length;

        // ── FACTOR 2: Nose displacement (head movement) ──
        let noseTravel = 0;
        for (let i = 1; i < this.noseBuffer.length; i++) {
            noseTravel += Math.hypot(
                this.noseBuffer[i].x - this.noseBuffer[i - 1].x,
                this.noseBuffer[i].y - this.noseBuffer[i - 1].y
            );
        }
        const avgNoseMove = noseTravel / (this.noseBuffer.length - 1);

        // ── FACTOR 3: Z-depth variance ──
        const zMean = this.zBuffer.reduce((a, b) => a + b, 0) / this.zBuffer.length;
        const zVar = this.zBuffer.reduce((s, v) => s + (v - zMean) ** 2, 0) / this.zBuffer.length;

        // Thresholds (tuned for 640×480 video)
        const BLINK_THRESH = 0.00006;  // EAR variance during blinks
        const MOVE_THRESH = 0.4;       // pixels average nose travel
        const Z_THRESH = 0.00001;   // Z depth variance

        const hasLiveness =
            earVariance > BLINK_THRESH ||
            avgNoseMove > MOVE_THRESH ||
            zVar > Z_THRESH;

        this.decision = hasLiveness ? 'live' : 'spoof';

        if (this.decision === 'live') {
            this._updateRing(1, '#10b981');
            document.getElementById('activity-val').innerText = 'LIVE';
            document.getElementById('activity-val').className = 'text-xl font-mono font-black text-emerald-400';
        } else {
            this._updateRing(1, '#f43f5e');
            document.getElementById('activity-val').innerText = 'SPOOF';
            document.getElementById('activity-val').className = 'text-xl font-mono font-black text-rose-500';
        }

        // Reset window so we keep re-evaluating every 2 seconds
        this.frameCount = 0;

        return this.decision;
    }
};

// ============================================================
// RAKSHAK IDENTITY — Face matching against DB embeddings
// ============================================================
const RakshakIdentity = {
    profiles: [],
    async init() {
        try {
            const res = await fetch('/api/users/list');
            this.profiles = await res.json();
            RakshakLogger.add(`Identity DB synced — ${this.profiles.length} profile(s) loaded.`, 'system');
        } catch (e) {
            console.error("Identity sync error");
            RakshakLogger.add('Identity DB offline. Matching disabled.', 'alert');
        }
    },
    // Build a rich feature vector from face keypoints:
    // 936 spatial (x,y) + 468 depth (z) + 8 geometric ratios = 1412 values
    _buildVector(points, nose, lEye, rEye) {
        const eyeDist = Math.hypot(lEye.x - rEye.x, lEye.y - rEye.y) || 1;
        const g = i => points[i] || { x: nose.x, y: nose.y, z: 0 };

        // Spatial: all 468 landmarks normalized by eye-distance
        const spatial = points.map(kp => [
            (kp.x - nose.x) / eyeDist,
            (kp.y - nose.y) / eyeDist
        ]).flat();

        // Depth: Z coordinates amplified (3D face shape discriminator)
        const depth = points.map(kp => ((kp.z || 0) / eyeDist) * 8);

        // Geometric ratios — highly discriminative for similar-looking people
        const chin = g(152);   // chin tip
        const leftJaw = g(234);   // left jaw
        const rightJaw = g(454);   // right jaw
        const noseBase = g(2);     // nose base
        const upperLip = g(13);    // upper lip
        const leftBrow = g(70);    // left brow peak
        const rightBrow = g(300);   // right brow peak
        const leftOuter = g(33);    // left eye outer
        const rightOuter = g(263);   // right eye outer

        const faceW = Math.hypot(leftJaw.x - rightJaw.x, leftJaw.y - rightJaw.y);
        const faceH = Math.hypot(nose.x - chin.x, nose.y - chin.y);
        const browW = Math.hypot(leftBrow.x - rightBrow.x, leftBrow.y - rightBrow.y);
        const noseH = Math.hypot(nose.x - noseBase.x, nose.y - noseBase.y);
        const lipY = Math.hypot(nose.x - upperLip.x, nose.y - upperLip.y);
        const eyeW = Math.hypot(leftOuter.x - rightOuter.x, leftOuter.y - rightOuter.y);
        const browH = Math.abs(((leftBrow.y + rightBrow.y) / 2) - ((lEye.y + rEye.y) / 2)) / (eyeDist || 1);
        const jawRatio = faceW / (faceH || 1);

        // Scale ratios so they have similar magnitude to spatial features
        const ratios = [
            (faceW / eyeDist) * 5,
            (faceH / eyeDist) * 5,
            (browW / eyeDist) * 5,
            (noseH / eyeDist) * 5,
            (lipY / eyeDist) * 5,
            (eyeW / eyeDist) * 5,
            browH * 10,
            jawRatio * 5
        ];

        return [...spatial, ...depth, ...ratios];
    },

    match(faces) {
        if (!faces || faces.length === 0 || this.profiles.length === 0) return null;
        const points = faces[0].keypoints;
        const nose = points.find(k => k.name === 'noseTip') || points[1];
        const lEye = points.find(k => k.name === 'leftEye');
        const rEye = points.find(k => k.name === 'rightEye');
        if (!nose || !lEye || !rEye) return null;

        const eyeDist = Math.hypot(lEye.x - rEye.x, lEye.y - rEye.y);
        if (eyeDist < 5) return null;  // face too small / too far

        const liveVec = this._buildVector(points, nose, lEye, rEye);

        let best = null, bestDist = Infinity, secondDist = Infinity;

        this.profiles.forEach(user => {
            // Support both new multi-angle (faceEmbeddings) and legacy single (faceEmbedding)
            let allEmbeddings = [];
            if (user.faceEmbeddings && user.faceEmbeddings.length > 0) {
                allEmbeddings = user.faceEmbeddings;
            } else if (user.faceEmbedding && user.faceEmbedding.length > 0) {
                allEmbeddings = [user.faceEmbedding]; // legacy single embedding
            }
            if (allEmbeddings.length === 0) return;

            // Find the BEST (minimum distance) match across all stored angles
            let userBestDist = Infinity;
            allEmbeddings.forEach(stored => {
                if (!stored || stored.length === 0) return;
                const len = Math.min(liveVec.length, stored.length);
                let sumSq = 0;
                for (let i = 0; i < len; i++) {
                    const d = liveVec[i] - stored[i];
                    sumSq += d * d;
                }
                const dist = Math.sqrt(sumSq / len);
                if (dist < userBestDist) userBestDist = dist;
            });

            if (userBestDist < bestDist) {
                secondDist = bestDist;
                bestDist = userBestDist;
                best = user;
            } else if (userBestDist < secondDist) {
                secondDist = userBestDist;
            }
        });

        // Debug: log match distances every 30 frames
        if (!this._debugCounter) this._debugCounter = 0;
        this._debugCounter++;
        if (this._debugCounter % 30 === 0 && best) {
            const angles = best.faceEmbeddings ? best.faceEmbeddings.length : 1;
            console.log(`[IDENTITY] Best: "${best.name}" dist=${bestDist.toFixed(4)} (${angles} angles) | 2nd=${secondDist.toFixed(4)}`);
        }

        // Threshold: multi-angle enrollment makes matching more reliable
        // Same person best-angle ≈ 0.02–0.06 | Different person ≈ 0.10+
        const THRESHOLD = 0.09;

        // Margin check: winner must be ≥20% better than runner-up
        const MARGIN = 0.20;
        const marginOk = this.profiles.length < 2 ||
            (secondDist - bestDist) >= bestDist * MARGIN;

        return (bestDist < THRESHOLD && marginOk) ? best : null;
    }
};

// ============================================================
// RAKSHAK SECURITY — Drawing boxes + dispatching alerts
// ============================================================
const RakshakSecurity = {
    lastCount: 0,
    alertCooldown: 0,

    // Draw face bounding boxes from MediaPipe keypoints
    drawFaceBox(ctx, canvas, faces, matchedUser, livenessResult) {
        let personCount = 0;

        faces.forEach(face => {
            personCount++;
            const kps = face.keypoints;

            // Compute face bounding box from landmark extents
            const xs = kps.map(k => k.x);
            const ys = kps.map(k => k.y);
            const x = Math.max(0, Math.min(...xs) - 10);
            const y = Math.max(0, Math.min(...ys) - 10);
            const w = Math.min(canvas.width - x, Math.max(...xs) - Math.min(...xs) + 20);
            const h = Math.min(canvas.height - y, Math.max(...ys) - Math.min(...ys) + 20);

            // Determine state
            const isSpoof = livenessResult === 'spoof';
            let label, color, glowColor;

            if (isSpoof) {
                label = '⚠ SPOOF DETECTED';
                color = '#f43f5e';
                glowColor = 'rgba(244,63,94,0.35)';
            } else if (matchedUser) {
                label = `✓ ${matchedUser.name.toUpperCase()}`;
                color = '#10b981';
                glowColor = 'rgba(16,185,129,0.3)';
            } else {
                label = '? UNKNOWN PERSON';
                color = '#f59e0b';
                glowColor = 'rgba(245,158,11,0.3)';
            }

            // Glow fill
            ctx.fillStyle = glowColor;
            ctx.fillRect(x, y, w, h);

            // Crisp border box
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);

            // Corner accents
            const cs = 16; // corner size
            ctx.lineWidth = 5;
            [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy], i) => {
                ctx.beginPath();
                ctx.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
                ctx.lineTo(cx, cy);
                ctx.lineTo(cx, cy + (i < 2 ? cs : -cs));
                ctx.stroke();
            });

            // Label background pill
            ctx.font = 'bold 13px Inter, monospace';
            const textW = ctx.measureText(label).width;
            const labelY = y > 28 ? y - 8 : y + h + 22;
            const padX = 10, padY = 6;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x - 1, labelY - 16, textW + padX * 2, 20 + padY, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, x + padX - 1, labelY);

            // Update identity status bar
            if (isSpoof) {
                document.getElementById('identity-val').innerText = 'SPOOF';
                document.getElementById('identity-val').className = 'text-[10px] font-black uppercase text-rose-500';
            } else if (matchedUser) {
                document.getElementById('identity-val').innerText = 'AUTHORIZED';
                document.getElementById('identity-val').className = 'text-[10px] font-black uppercase text-emerald-500';
            } else {
                document.getElementById('identity-val').innerText = 'UNKNOWN';
                document.getElementById('identity-val').className = 'text-[10px] font-black uppercase text-amber-500';
            }

            // Alert dispatch
            if (isSpoof) {
                this.dispatchAlert('spoofing', personCount);
            } else if (!matchedUser) {
                this.dispatchAlert('intrusion', personCount);
            }
        });

        return personCount;
    },

    // COCO-SSD person count only (no fire class in COCO-SSD)
    processCoco(objects) {
        let personCount = 0;
        objects.forEach(obj => {
            if (obj.class === 'person') personCount++;
        });
        return personCount;
    },

    async dispatchAlert(type, count) {
        const now = Date.now();
        if (now - this.alertCooldown < 25000) return;
        this.alertCooldown = now;

        const tempCanvas = document.createElement('canvas');
        const tCtx = tempCanvas.getContext('2d');
        tempCanvas.width = RakshakApp.ui.canvas.width;
        tempCanvas.height = RakshakApp.ui.canvas.height;
        tCtx.drawImage(RakshakApp.ui.boostCanvas, 0, 0);
        tCtx.drawImage(RakshakApp.ui.canvas, 0, 0);
        const snapshot = tempCanvas.toDataURL('image/jpeg', 0.7);

        try {
            const resp = await fetch('/api/alerts/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, personCount: count, image: snapshot })
            });
            const result = await resp.json();
            if (result.success) {
                RakshakLogger.add(`ALERT: ${type.toUpperCase()} recorded. Email sent.`, 'alert');
            } else {
                RakshakLogger.add(`⚠ ${type.toUpperCase()} alert email failed.`, 'alert');
            }
        } catch (e) {
            console.error("Alert Error:", e);
            RakshakLogger.add(`⚠ Alert dispatch failed: ${e.message}`, 'alert');
        }
    }
};
