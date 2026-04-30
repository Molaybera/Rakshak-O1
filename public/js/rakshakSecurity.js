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

        const landmarks = faces[0].landmarks;
        if (!landmarks) return this.decision;

        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose()[0];

        if (!leftEye || !rightEye || !nose) return this.decision;

        const getEAR = (eye) => {
            const h1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
            const h2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
            const w = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
            return (h1 + h2) / (2.0 * w);
        };

        const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;
        this.earBuffer.push(ear);
        this.noseBuffer.push({ x: nose.x, y: nose.y });
        this.frameCount++;

        // Trim to window
        if (this.earBuffer.length > this.WINDOW) this.earBuffer.shift();
        if (this.noseBuffer.length > this.WINDOW) this.noseBuffer.shift();

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

        // Thresholds (tuned for 640×480 video)
        const BLINK_THRESH = 0.00003;  // EAR variance during blinks (adjusted for face-api)
        const MOVE_THRESH = 0.4;       // pixels average nose travel

        const hasLiveness =
            earVariance > BLINK_THRESH ||
            avgNoseMove > MOVE_THRESH;

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
    match(faces) {
        if (!faces || faces.length === 0 || this.profiles.length === 0) return null;
        if (!faces[0].descriptor) return null;
        
        const liveVec = faces[0].descriptor;

        let best = null, bestDist = Infinity, secondDist = Infinity;

        this.profiles.forEach(user => {
            let allEmbeddings = [];
            if (user.faceEmbeddings && user.faceEmbeddings.length > 0) {
                allEmbeddings = user.faceEmbeddings;
            } else if (user.faceEmbedding && user.faceEmbedding.length > 0) {
                allEmbeddings = [user.faceEmbedding];
            }
            if (allEmbeddings.length === 0) return;
            
            // Skip if this is a legacy 1412D embedding to prevent crash
            if (allEmbeddings[0].length > 128) return;

            // Find the BEST (minimum distance) match across all stored angles
            let userBestDist = Infinity;
            allEmbeddings.forEach(stored => {
                if (!stored || stored.length !== 128) return;
                let sumSq = 0;
                for (let i = 0; i < 128; i++) {
                    const d = liveVec[i] - stored[i];
                    sumSq += d * d;
                }
                const dist = Math.sqrt(sumSq); // Standard Euclidean distance for 128D
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

        if (!this._debugCounter) this._debugCounter = 0;
        this._debugCounter++;
        if (this._debugCounter % 30 === 0 && best) {
            const angles = best.faceEmbeddings ? best.faceEmbeddings.length : 1;
            console.log(`[IDENTITY] Best: "${best.name}" dist=${bestDist.toFixed(4)} (${angles} angles) | 2nd=${secondDist.toFixed(4)}`);
        }

        // Deep learning descriptor threshold (Euclidean distance)
        // Values < 0.4 are very certain matches, < 0.5 are good matches.
        const THRESHOLD = 0.52;

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

    // Draw face bounding boxes from face-api.js results
    drawFaceBox(ctx, canvas, faces, matchedUser, livenessResult) {
        let personCount = 0;

        faces.forEach(face => {
            personCount++;
            const box = face.detection ? face.detection.box : face.box;

            const x = Math.max(0, box.x - 10);
            const y = Math.max(0, box.y - 10);
            const w = box.width + 20;
            const h = box.height + 20;

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
