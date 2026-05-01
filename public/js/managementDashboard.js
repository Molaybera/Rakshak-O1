        // ── State ──────────────────────────────────────────────────
        let detector;
        let mode = 'camera';         // 'camera' | 'upload'
        let capturedFrame = null;    // DataURL of captured still frame
        let isCaptured = false;      // true after snapshot taken
        let faceDetectedLive = false;
        let uploadedFiles = [];      // Track all selected files
        
        // Multi-angle camera state
        const CAPTURE_POSES = ['Front', 'Left', 'Right', 'Up', 'Down'];
        let captureStep = 0;
        let cameraEmbeddings = [];

        // Zoom / pan state (upload mode only)
        let imgZoom = 1;     // 1.0 – 4.0
        let panX = 0, panY = 0;  // translation in CSS px
        let isPanning = false, panStart = { x: 0, y: 0 };

        const video = document.getElementById('webcam');
        const previewImg = document.getElementById('previewImg');
        const imageUpload = document.getElementById('imageUpload');
        const canvas = document.getElementById('overlay');
        const boostCanvas = document.getElementById('boostCanvas');
        const bCtx = boostCanvas.getContext('2d');
        const ctx = canvas.getContext('2d');
        const guide = document.getElementById('guide');
        const faceBadge = document.getElementById('faceBadge');
        const enrollBtn = document.getElementById('enrollBtn');
        const modeTag = document.getElementById('modeTag');
        const mediaContainer = document.getElementById('mediaContainer');

        // ── Zoom / Pan helpers ──────────────────────────────────────
        function applyZoom() {
            previewImg.style.transform = `scale(${imgZoom}) translate(${panX / imgZoom}px, ${panY / imgZoom}px)`;
            document.getElementById('zoomLabel').innerText = imgZoom.toFixed(1) + '×';
            document.getElementById('zoomSlider').value = Math.round(imgZoom * 100);
        }

        function resetZoom() {
            imgZoom = 1; panX = 0; panY = 0;
            applyZoom();
            // Re-run face detection on reset view
            if (isCaptured) analyzeAndHighlight(previewImg);
        }

        // Mouse-wheel zoom on the container
        mediaContainer.addEventListener('wheel', (e) => {
            if (mode !== 'upload' || !isCaptured) return;
            e.preventDefault();
            imgZoom = Math.max(1, Math.min(4, imgZoom - e.deltaY * 0.004));
            applyZoom();
        }, { passive: false });

        // Drag-to-pan on the preview image
        previewImg.addEventListener('mousedown', (e) => {
            if (mode !== 'upload' || !isCaptured || imgZoom <= 1) return;
            isPanning = true;
            panStart = { x: e.clientX - panX, y: e.clientY - panY };
            mediaContainer.classList.add('dragging');
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            panX = e.clientX - panStart.x;
            panY = e.clientY - panStart.y;
            applyZoom();
        });
        document.addEventListener('mouseup', () => {
            if (isPanning) { isPanning = false; mediaContainer.classList.remove('dragging'); }
        });

        // Zoom slider
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            imgZoom = parseInt(e.target.value) / 100;
            applyZoom();
        });

        // Returns a 640x480 canvas of the currently visible (zoomed/panned) image region
        // Used by processEnrollment so face detection works on the cropped view
        function getEnrollTarget() {
            if (!isCaptured || !previewImg.naturalWidth) return previewImg;
            const iw = previewImg.naturalWidth, ih = previewImg.naturalHeight;
            const dispW = previewImg.clientWidth, dispH = previewImg.clientHeight;

            // Visible region in image coordinates
            const visW = iw / imgZoom, visH = ih / imgZoom;
            // panX/Y are in CSS px relative to displayed image; convert to image coords
            const offX = -(panX / dispW) * iw;
            const offY = -(panY / dispH) * ih;
            const srcX = Math.max(0, (iw - visW) / 2 + offX);
            const srcY = Math.max(0, (ih - visH) / 2 + offY);
            const srcW = Math.min(visW, iw - srcX);
            const srcH = Math.min(visH, ih - srcY);

            const crop = document.createElement('canvas');
            crop.width = 640; crop.height = 480;
            crop.getContext('2d').drawImage(previewImg, srcX, srcY, srcW, srcH, 0, 0, 640, 480);
            return crop;
        }

        // ── Init ───────────────────────────────────────────────────
        let cameraReady = false;
        async function init() {
            // 1. Load AI model FIRST (works without camera)
            try {
                document.getElementById('loader-text').innerText = 'Loading AI Engine...';
                await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
                await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                detector = true; // Set flag when ready
            } catch (err) {
                console.error('Model load error:', err);
                document.getElementById('loader-text').innerText = 'AI Engine failed to load.';
                return;
            }

            // 2. Try camera (optional — upload still works without it)
            try {
                document.getElementById('loader-text').innerText = 'Opening Camera...';
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                video.srcObject = stream;
                await video.play();
                video.onloadedmetadata = () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    boostCanvas.width = video.videoWidth;
                    boostCanvas.height = video.videoHeight;
                };
                cameraReady = true;
                document.getElementById('loader').classList.add('hidden');
                drawLoop();
            } catch (err) {
                console.warn('Camera unavailable, upload mode available.', err);
                document.getElementById('loader').classList.add('hidden');
                switchMode('upload');
            }
        }

        // ── Mode Switcher ──────────────────────────────────────────
        function switchMode(m) {
            mode = m;
            isCaptured = false;
            capturedFrame = null;

            document.getElementById('tab-camera').className = `tab-btn ${m === 'camera' ? 'active' : 'inactive'}`;
            document.getElementById('tab-upload').className = `tab-btn ${m === 'upload' ? 'active' : 'inactive'}`;
            document.getElementById('uploadSection').classList.toggle('hidden', m !== 'upload');
            document.getElementById('captureSection').classList.toggle('hidden', m !== 'camera');
            document.getElementById('guide').style.display = m === 'camera' ? 'block' : 'none';

            if (m === 'camera') {
                previewImg.classList.add('hidden');
                video.classList.remove('hidden');
                modeTag.innerText = 'LIVE CAMERA';
                modeTag.className = 'vision-tag bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                
                // Reset multi-angle state
                captureStep = 0;
                cameraEmbeddings = [];
                document.getElementById('captureGuideText').innerHTML = `Angle 1/5: <span class="text-emerald-400">Front</span>`;
                document.getElementById('captureBtn').innerText = '📸 Capture Front Angle';
                enrollBtn.innerText = 'Capture 5 Angles to Authorize';
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setBadge('scanning');
                // Hide zoom panel when leaving upload mode
                document.getElementById('zoomPanel').classList.add('hidden');
            } else {
                modeTag.innerText = 'PHOTO UPLOAD';
                modeTag.className = 'vision-tag bg-amber-500/20 text-amber-400 border border-amber-500/30';
                enrollBtn.innerText = 'Analyze & Authorize';
                setBadge('scanning');
                // Reset zoom state for new upload session
                imgZoom = 1; panX = 0; panY = 0; applyZoom();
            }
        }

        function setBadge(state, text) {
            faceBadge.className = `face-badge badge-${state}`;
            faceBadge.innerText = text || { scanning: 'Scanning...', detected: '✓ Face Detected', none: '✗ No Face' }[state];
        }

        // ── Capture Photo from camera (Multi-angle) ────────────────
        async function captureNextAngle() {
            if (!video.videoWidth || !detector) return;
            if (captureStep >= 5) return;

            // Flash effect
            modeTag.innerText = 'CAPTURING...';
            
            // Draw current video frame to a temp canvas
            const snap = document.createElement('canvas');
            snap.width = video.videoWidth;
            snap.height = video.videoHeight;
            const sCtx = snap.getContext('2d');
            sCtx.save();
            sCtx.scale(-1, 1);
            sCtx.drawImage(video, -snap.width, 0);
            sCtx.restore();

            // Extract embedding immediately
            const img = document.createElement('img');
            img.src = snap.toDataURL('image/jpeg', 0.95);
            await new Promise(r => { img.onload = r; });
            
            const faces = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
            if (!faces || faces.length === 0) {
                alert('No face detected. Please ensure your face is clearly visible.');
                modeTag.innerText = 'LIVE CAMERA';
                return;
            }
            
            cameraEmbeddings.push(Array.from(faces[0].descriptor));
            captureStep++;
            showToast(`✓ ${CAPTURE_POSES[captureStep-1]} angle captured!`, 'success');

            if (captureStep < 5) {
                // Prepare next angle
                document.getElementById('captureGuideText').innerHTML = `Angle ${captureStep+1}/5: <span class="text-emerald-400">${CAPTURE_POSES[captureStep]}</span>`;
                document.getElementById('captureBtn').innerText = `📸 Capture ${CAPTURE_POSES[captureStep]} Angle`;
                modeTag.innerText = 'LIVE CAMERA';
            } else {
                // All 5 captured
                document.getElementById('captureSection').classList.add('hidden');
                enrollBtn.innerText = 'Authorize Identity (5 Angles)';
                
                // Show final snap in preview
                previewImg.src = img.src;
                previewImg.classList.remove('hidden');
                video.classList.add('hidden');
                guide.style.display = 'none';
                isCaptured = true;
                
                modeTag.innerText = 'ALL ANGLES CAPTURED';
                modeTag.className = 'vision-tag bg-sky-500/20 text-sky-400 border border-sky-500/30';
                
                // Highlight face on final image
                analyzeStill(previewImg).then(found => {
                    setBadge(found ? 'detected' : 'none');
                    drawFaceHighlight(previewImg, found);
                });
            }
        }

        // ── Upload handler ─────────────────────────────────────────
        imageUpload.onchange = (e) => {
            uploadedFiles = Array.from(e.target.files);
            if (uploadedFiles.length === 0) return;
            
            const label = document.getElementById('uploadLabel');
            if (label) label.innerText = `Selected ${uploadedFiles.length} Photo(s)`;

            const file = uploadedFiles[0]; // Preview first file
            const reader = new FileReader();
            reader.onload = event => {
                previewImg.src = event.target.result;
                previewImg.classList.remove('hidden');
                video.classList.add('hidden');
                isCaptured = true;
                capturedFrame = null;
                // Reset zoom for fresh image
                imgZoom = 1; panX = 0; panY = 0; applyZoom();
                setBadge('scanning');

                previewImg.onload = () => {
                    canvas.width = previewImg.clientWidth || 640;
                    canvas.height = previewImg.clientHeight || 480;
                    // Show zoom controls
                    document.getElementById('zoomPanel').classList.remove('hidden');
                    analyzeStill(previewImg).then(found => {
                        setBadge(found ? 'detected' : 'none');
                        drawFaceHighlight(previewImg, found);
                    });
                };
            };
            reader.readAsDataURL(file);
        };

        // ── Still image face analysis ──────────────────────────────
        async function analyzeStill(imgEl) {
            if (!detector) return false;
            try {
                const faces = await faceapi.detectAllFaces(imgEl);
                return faces && faces.length > 0;
            } catch { return false; }
        }

        async function drawFaceHighlight(imgEl, found) {
            if (!detector) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!found) return;
            try {
                const faces = await faceapi.detectAllFaces(imgEl);
                if (!faces || faces.length === 0) return;
                const box = faces[0].box;
                const x = box.x - 12;
                const y = box.y - 12;
                const w = box.width + 24;
                const h = box.height + 24;

                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = 'rgba(16,185,129,0.08)';
                ctx.fillRect(x, y, w, h);

                // Corner accents
                const cs = 14;
                ctx.lineWidth = 4;
                [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy], i) => {
                    ctx.beginPath();
                    ctx.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
                    ctx.lineTo(cx, cy);
                    ctx.lineTo(cx, cy + (i < 2 ? cs : -cs));
                    ctx.stroke();
                });
            } catch { }
        }

        // ── Live draw loop ─────────────────────────────────────────
        async function drawLoop() {
            if (mode !== 'camera' || isCaptured) { requestAnimationFrame(drawLoop); return; }
            if (!detector) { requestAnimationFrame(drawLoop); return; }
            try {
                bCtx.filter = 'brightness(1.5) contrast(1.2)';
                bCtx.drawImage(video, 0, 0);
                bCtx.filter = 'none';

                const faces = await faceapi.detectAllFaces(boostCanvas);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (faces && faces.length > 0) {
                    guide.classList.add('active');
                    faceDetectedLive = true;
                    setBadge('detected');

                    // Draw a soft green outline around detected face
                    const box = faces[0].box;
                    const x = box.x - 10;
                    const y = box.y - 10;
                    const w = box.width + 20;
                    const h = box.height + 20;
                    ctx.strokeStyle = 'rgba(16,185,129,0.7)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, w, h);
                } else {
                    guide.classList.remove('active');
                    faceDetectedLive = false;
                    setBadge('none', '✗ No Face');
                }
            } catch { }
            requestAnimationFrame(drawLoop);
        }

        // ── Enrollment ─────────────────────────────────────────────
        async function processEnrollment() {
            const name = document.getElementById('userName').value.trim();
            if (!name) return alert('Please enter a personnel name.');
            if (!detector) return alert('AI Engine not ready. Please wait.');

            enrollBtn.disabled = true;
            enrollBtn.innerText = 'Extracting Biometrics...';

            try {
                if (mode === 'camera') {
                    if (cameraEmbeddings.length < 5) {
                        enrollBtn.disabled = false;
                        enrollBtn.innerText = 'Capture 5 Angles to Authorize';
                        return alert('Please capture all 5 angles before authorizing.');
                    }
                    allEmbeddings = cameraEmbeddings;
                } else if (mode === 'upload' && uploadedFiles.length > 0) {
                    // Multi-file upload mode
                    for (let i = 0; i < uploadedFiles.length; i++) {
                        enrollBtn.innerText = `Analyzing Photo ${i + 1}/${uploadedFiles.length}...`;
                        const img = document.createElement('img');
                        img.src = URL.createObjectURL(uploadedFiles[i]);
                        await new Promise(r => { img.onload = r; });
                        const faces = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
                        if (faces && faces.length > 0) {
                            allEmbeddings.push(Array.from(faces[0].descriptor));
                        }
                    }
                    if (allEmbeddings.length === 0) {
                        enrollBtn.disabled = false;
                        enrollBtn.innerText = 'Analyze & Authorize';
                        return alert('No faces detected in any of the uploaded photos.');
                    }
                } else {
                    // Single file upload fallback
                    if (!previewImg.src || previewImg.classList.contains('hidden')) {
                        enrollBtn.disabled = false;
                        enrollBtn.innerText = 'Analyze & Authorize';
                        return alert('No image available. Upload a photo.');
                    }

                    const enrollTarget = (imgZoom > 1) ? getEnrollTarget() : previewImg;
                    const faces = await faceapi.detectAllFaces(enrollTarget).withFaceLandmarks().withFaceDescriptors();
                    if (!faces || faces.length === 0) {
                        enrollBtn.disabled = false;
                        enrollBtn.innerText = 'Analyze & Authorize';
                        return alert('No face detected. Ensure the face is clearly visible and try again.');
                    }
                    allEmbeddings.push(Array.from(faces[0].descriptor));
                }

                enrollBtn.innerText = 'Authorizing...';

                const res = await fetch('/api/users/enroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, faceEmbeddings: allEmbeddings })
                });
                const data = await res.json();

                if (data.success) {
                    showToast(`✓ ${name} authorized successfully.`, 'success');
                    document.getElementById('userName').value = '';
                    isCaptured = false;
                    capturedFrame = null;
                    if (mode === 'camera') {
                        // Reset camera flow
                        captureStep = 0;
                        cameraEmbeddings = [];
                        document.getElementById('captureSection').classList.remove('hidden');
                        document.getElementById('captureGuideText').innerHTML = `Angle 1/5: <span class="text-emerald-400">Front</span>`;
                        document.getElementById('captureBtn').innerText = '📸 Capture Front Angle';
                        
                        previewImg.classList.add('hidden');
                        video.classList.remove('hidden');
                        guide.style.display = 'block';
                        modeTag.innerText = 'LIVE CAMERA';
                        modeTag.className = 'vision-tag bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                    fetchUsers();
                } else {
                    alert('Enrollment failed: ' + data.message);
                }
            } catch (err) {
                alert('Database sync failed. Check server connection.');
                console.error(err);
            } finally {
                enrollBtn.disabled = false;
                enrollBtn.innerText = mode === 'camera' ? 'Capture & Authorize' : 'Analyze & Authorize';
            }
        }

        // ── Delete user ────────────────────────────────────────────
        async function deleteUser(id, name) {
            if (!confirm(`Remove "${name}" from authorized personnel?`)) return;
            try {
                const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    showToast(`✓ ${name} deauthorized.`, 'warning');
                    fetchUsers();
                } else {
                    alert('Delete failed: ' + data.message);
                }
            } catch {
                alert('Server error during deletion.');
            }
        }

        // ── Fetch & render user list ───────────────────────────────
        async function fetchUsers() {
            const list = document.getElementById('userList');
            const countBadge = document.getElementById('user-count');
            try {
                const res = await fetch('/api/users/list');
                const users = await res.json();
                list.innerHTML = '';
                countBadge.innerText = users.length;

                if (users.length === 0) {
                    list.innerHTML = '<div class="text-slate-600 text-xs italic text-center py-10">No profiles found.</div>';
                    return;
                }

                users.forEach(u => {
                    const d = document.createElement('div');
                    d.className = 'bg-slate-800/40 p-4 rounded-xl border border-white/5 flex justify-between items-center fade-in';
                    const enrolled = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
                    d.innerHTML = `
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-sm font-bold border border-emerald-500/20">
                                ${u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p class="text-sm font-semibold">${u.name}</p>
                                <p class="text-[9px] text-slate-600 uppercase">Enrolled ${enrolled}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[7px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 uppercase font-black tracking-widest">Authorized</span>
                            <button onclick="deleteUser('${u._id}', '${u.name.replace(/'/g, "\\'")}')"
                                class="text-[9px] font-bold uppercase text-rose-500 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-full transition-all">
                                ✕ Remove
                            </button>
                        </div>`;
                    list.appendChild(d);
                });
            } catch {
                list.innerHTML = '<div class="text-rose-500 text-[10px] text-center italic py-4">Database Offline</div>';
            }
        }

        // ── Toast notification ─────────────────────────────────────
        function showToast(msg, type = 'success') {
            const t = document.createElement('div');
            const colors = { success: 'bg-emerald-600', warning: 'bg-amber-600', error: 'bg-rose-600' };
            t.className = `fixed bottom-6 left-1/2 -translate-x-1/2 ${colors[type]} text-white text-xs font-bold px-5 py-3 rounded-xl shadow-xl z-50 transition-all`;
            t.innerText = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        }

        // ── Bootstrap ──────────────────────────────────────────────
        window.onload = () => { init(); fetchUsers(); };
