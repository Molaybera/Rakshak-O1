        // RakshakLogger, RakshakLiveness, RakshakIdentity, RakshakSecurity
        // loaded from external file: js/rakshakSecurity.js

        // ============================================================
        // MAIN APP CONTROLLER
        // ============================================================
        const RakshakApp = {
            active: false,
            models: { coco: null, face: null },
            ui: {
                video: document.getElementById('webcam'),
                canvas: document.getElementById('overlay'),
                boostCanvas: document.getElementById('boostCanvas'),
                ctx: null,
                bCtx: null,
                loader: document.getElementById('loader'),
                spinner: document.getElementById('spinner'),
                pMsg: document.getElementById('loader-msg'),
                toggleBtn: document.getElementById('main-toggle')
            },

            async toggle() {
                if (this.active) { location.reload(); return; }
                this.ui.ctx = this.ui.canvas.getContext('2d');
                this.ui.bCtx = this.ui.boostCanvas.getContext('2d');
                this.ui.toggleBtn.disabled = true;
                this.ui.spinner.classList.remove('hidden');
                this.ui.pMsg.innerText = "Syncing Biometric Database...";

                try {
                    await RakshakIdentity.init();

                    this.ui.pMsg.innerText = "Opening Camera...";
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                    this.ui.video.srcObject = stream;
                    await this.ui.video.play();

                    this.ui.pMsg.innerText = "Loading AI Core (COCO + face-api)...";
                    this.models.coco = await cocoSsd.load();
                    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
                    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                    this.models.face = true;

                    this.ui.canvas.width = this.ui.video.videoWidth;
                    this.ui.canvas.height = this.ui.video.videoHeight;
                    this.ui.boostCanvas.width = this.ui.video.videoWidth;
                    this.ui.boostCanvas.height = this.ui.video.videoHeight;

                    this.active = true;
                    this.ui.loader.classList.add('hidden');
                    this.ui.toggleBtn.disabled = false;
                    this.ui.toggleBtn.innerText = "Disarm System";
                    document.getElementById('status-text').innerText = "SYSTEM LIVE";
                    document.getElementById('status-dot').className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";

                    RakshakLogger.add('System armed. All sensors online.', 'system');
                    this.loop();
                } catch (err) {
                    this.ui.pMsg.innerText = err.message;
                    console.error(err);
                }
            },

            async loop() {
                if (!this.active) return;

                // ── Adaptive exposure: sample brightness and adjust filter ──
                if (!this._exposureCanvas) {
                    this._exposureCanvas = document.createElement('canvas');
                    this._exposureCtx = this._exposureCanvas.getContext('2d', { willReadFrequently: true });
                    this._exposureCanvas.width = 80;
                    this._exposureCanvas.height = 60;
                    this._frameIdx = 0;
                    this._currentFilter = 'brightness(1.0) contrast(1.1)';
                }
                this._frameIdx++;
                // Re-calculate exposure every 10 frames for performance
                if (this._frameIdx % 10 === 0) {
                    this._exposureCtx.drawImage(this.ui.video, 0, 0, 80, 60);
                    const d = this._exposureCtx.getImageData(0, 0, 80, 60).data;
                    let sum = 0;
                    for (let i = 0; i < d.length; i += 16) { // sample every 4th pixel
                        sum += (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114); // luminance
                    }
                    const avgLum = sum / (d.length / 16);
                    // avgLum: 0-255. Ideal range for face detection: 80-160
                    if (avgLum > 200) {
                        // Very bright — darken significantly
                        this._currentFilter = 'brightness(0.55) contrast(1.5)';
                    } else if (avgLum > 170) {
                        // Bright — moderate darken
                        this._currentFilter = 'brightness(0.7) contrast(1.3)';
                    } else if (avgLum > 130) {
                        // Slightly bright — mild adjust
                        this._currentFilter = 'brightness(0.85) contrast(1.15)';
                    } else if (avgLum < 50) {
                        // Very dark — brighten a lot
                        this._currentFilter = 'brightness(2.0) contrast(1.3)';
                    } else if (avgLum < 80) {
                        // Dark — brighten
                        this._currentFilter = 'brightness(1.5) contrast(1.2)';
                    } else {
                        // Ideal range — minimal processing
                        this._currentFilter = 'brightness(1.0) contrast(1.1)';
                    }
                }

                // Apply adaptive filter to boost canvas
                this.ui.bCtx.filter = this._currentFilter;
                this.ui.bCtx.drawImage(this.ui.video, 0, 0);
                this.ui.bCtx.filter = 'none';

                const [objects, faces] = await Promise.all([
                    this.models.coco.detect(this.ui.video),
                    faceapi.detectAllFaces(this.ui.boostCanvas).withFaceLandmarks().withFaceDescriptors()
                ]);

                this.ui.ctx.clearRect(0, 0, this.ui.canvas.width, this.ui.canvas.height);

                // Liveness decision (2-second rolling window)
                const livenessResult = RakshakLiveness.process(faces);

                // Identity match (raw single-frame result)
                const rawMatch = RakshakIdentity.match(faces);

                // ── Temporal Consistency Tracker (Smoothing) ──
                // Smooths out single-frame match failures (flickering)
                if (!this._idTracker) this._idTracker = { currentMatch: null, streak: 0, displayUser: null, graceFrames: 0 };
                
                const rawName = rawMatch ? rawMatch.name : null;
                
                if (rawName) {
                    if (rawName === this._idTracker.currentMatch) {
                        this._idTracker.streak++;
                    } else {
                        this._idTracker.currentMatch = rawName;
                        this._idTracker.streak = 1;
                    }
                } else {
                    this._idTracker.streak = 0;
                    this._idTracker.currentMatch = null;
                }

                // Lock on after 3 consecutive frames
                if (this._idTracker.streak >= 3 && rawMatch) {
                    this._idTracker.displayUser = rawMatch;
                    this._idTracker.graceFrames = 15; // Hold this identity for 15 frames even if lost
                } else if (this._idTracker.graceFrames > 0) {
                    this._idTracker.graceFrames--;
                } else {
                    this._idTracker.displayUser = null; // Drop to unknown
                }

                const confirmedUser = this._idTracker.displayUser;

                // Draw face bounding boxes (green / yellow / red)
                const faceCount = RakshakSecurity.drawFaceBox(
                    this.ui.ctx, this.ui.canvas, faces, confirmedUser, livenessResult
                );

                // COCO-SSD: person count from body detection
                RakshakSecurity.processCoco(objects);

                // Fire detection via pixel color analysis (every 3rd frame)
                RakshakFire.detect(this.ui.video, this.ui.ctx, this.ui.canvas);

                // Person count
                document.getElementById('count-val').innerText = faceCount;

                if (faceCount === 0) {
                    document.getElementById('identity-val').innerText = 'NO FACE';
                    document.getElementById('identity-val').className = 'text-[10px] font-black uppercase text-slate-500';
                    RakshakLiveness.reset();
                    this._idTracker = { name: null, count: 0, confirmed: null };
                }

                requestAnimationFrame(() => this.loop());
            }
        };
