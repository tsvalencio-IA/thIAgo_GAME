// =============================================================================
// KART LEGENDS: MARIO GP EDITION (FULL PHYSICS EVOLUTION & GRAPHICS RESTORE)
// ENGENHARIA DE SISTEMAS: ESPECIALISTA SÊNIOR *177
// ARQUIVO: game_kart.js (INTEGRAL)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES (SINCRONIZADO COM V18)
    // -----------------------------------------------------------------
    
    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', speedInfo: 1.00, turnInfo: 1.00, weight: 1.0, accel: 0.040 },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', speedInfo: 1.05, turnInfo: 0.90, weight: 1.0, accel: 0.038 },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', speedInfo: 0.95, turnInfo: 1.15, weight: 0.8, accel: 0.055 },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', speedInfo: 1.10, turnInfo: 0.70, weight: 1.4, accel: 0.025 },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', speedInfo: 0.90, turnInfo: 1.25, weight: 0.6, accel: 0.070 }
    ];

    const TRACKS = [
        { id: 0, name: 'COGUMELO CUP', theme: 'grass', sky: 0, curveMult: 1.0 },
        { id: 1, name: 'DESERTO KALIMARI', theme: 'sand', sky: 1, curveMult: 0.8 },
        { id: 2, name: 'MONTANHA GELADA', theme: 'snow', sky: 2, curveMult: 1.3 }
    ];

    const CONF = {
        SPEED: 120,
        MAX_SPEED: 220,
        TURBO_MAX_SPEED: 330,
        FRICTION: 0.99,            // Ajustado para manter momento
        OFFROAD_DECEL: 0.94,
        CAMERA_DEPTH: 0.84,
        CAMERA_HEIGHT: 1000,
        ROAD_WIDTH: 2000,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 200, 
        RUMBLE_LENGTH: 3
    };

    const PHYSICS_TUNING = {
        gripAsphalt: 0.98,
        gripZebra: 0.85,
        gripOffroad: 0.35,
        centrifugalForce: 0.22,
        momentumTransfer: 1.6,     // Força real em colisões
        lateralInertiaDecay: 0.92  // Mantém o deslize lateral
    };

    let segments = [];
    let trackLength = 0;
    let minimapPath = [];
    let minimapBounds = {minX:0, maxX:0, minZ:0, maxZ:0, w:1, h:1};
    let particles = []; 
    let hudMessages = [];
    let nitroBtn = null;
    
    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    function buildMiniMap(segments) {
        minimapPath = [];
        let x = 0, z = 0, angle = 0;
        segments.forEach(seg => {
            angle += seg.curve * 0.003; 
            x += Math.sin(angle) * 10;
            z -= Math.cos(angle) * 10;
            minimapPath.push({ x, z });
        });
        let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
        minimapPath.forEach(p => {
            if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
            if(p.z < minZ) minZ = p.z; if(p.z > maxZ) maxZ = p.z;
        });
        minimapBounds = { minX, maxX, minZ, maxZ, w: maxX-minX || 1, h: maxZ-minZ || 1 };
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'mario_arena_v23',
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        dbRef: null,
        lastSync: 0,
        autoStartTimer: null,

        // Física e Estados de Movimento
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, turboLock: false, boostTimer: 0,
        spinAngle: 0, spinSpeed: 0, spinTimer: 0,
        lateralInertia: 0, vibration: 0,
        
        lap: 1, totalLaps: 3, time: 0, rank: 1, score: 0, finishTimer: 0,
        visualTilt: 0, bounce: 0, skyColor: 0, 
        
        inputState: 0, gestureTimer: 0,
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        rivals: [], 

        init: function() { 
            this.cleanup(); 
            this.state = 'MODE_SELECT';
            this.setupUI();
            this.resetPhysics();
            particles = []; hudMessages = [];
            window.System.msg("ESCOLHA O MODO");
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players').off(); } catch(e){}
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        pushMsg: function(text, color='#fff', size=40) {
            hudMessages.push({ text, color, size, life: 60, scale: 0.1 });
        },

        setupUI: function() {
            const old = document.getElementById('nitro-btn-kart');
            if(old) old.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '35%', right: '20px', width: '85px', height: '85px',
                borderRadius: '50%', background: 'radial-gradient(#ffcc00, #ff6600)', border: '4px solid #fff',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontWeight: "bold", fontSize: '16px', zIndex: '100',
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.6)', cursor: 'pointer', userSelect: 'none',
                textShadow: '0 2px 0 rgba(0,0,0,0.5)'
            });

            const toggleTurbo = (e) => {
                if(e && e.cancelable) { e.preventDefault(); e.stopPropagation(); }
                if(this.state !== 'RACE') return;
                if(this.nitro > 10) {
                    this.turboLock = !this.turboLock;
                    if(this.turboLock) {
                        this.pushMsg("TURBO!", "#00ffff", 50);
                        window.Sfx.play(600, 'square', 0.1, 0.1);
                    }
                }
            };
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);

            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const y = (e.clientY - rect.top) / rect.height;
                if (this.state === 'MODE_SELECT') {
                    if (y < 0.5) this.selectMode('OFFLINE'); else this.selectMode('ONLINE');
                    window.Sfx.click();
                } else if (this.state === 'LOBBY') {
                    if (y > 0.7) this.toggleReady(); 
                    else if (y < 0.35) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                    } else {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                    }
                    if(this.isOnline) this.syncLobby();
                }
            };
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.lap = 1; this.score = 0; this.nitro = 100;
            this.spinAngle = 0; this.spinSpeed = 0; this.spinTimer = 0;
            this.lateralInertia = 0; this.vibration = 0;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
            particles = []; hudMessages = [];
        },

        buildTrack: function(trackId) {
            segments = [];
            const trkConfig = TRACKS[trackId];
            this.skyColor = trkConfig.sky;
            const mult = trkConfig.curveMult;
            const addRoad = (enter, curve, y) => {
                for(let i = 0; i < enter; i++) {
                    const isDark = Math.floor(segments.length / CONF.RUMBLE_LENGTH) % 2;
                    segments.push({ curve: curve * mult, y: y, color: isDark ? 'dark' : 'light', obs: [], theme: trkConfig.theme });
                }
            };
            addRoad(50, 0, 0); addRoad(40, 2, 0); addRoad(20, 0, 0); addRoad(50, -1.5, 0); 
            addRoad(30, -3.0, 0); addRoad(60, 0, 0); addRoad(30, 1.5, 0); addRoad(80, 4.0, 0); addRoad(50, 0, 0);
            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            buildMiniMap(segments);
        },

        selectMode: function(mode) {
            this.resetPhysics();
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if (!this.isOnline) {
                this.rivals = [
                    { id:'cpu1', charId:3, pos: 1100, x:-0.6, speed:0, color: CHARACTERS[3].color, name:'Bowser', aggro: 0.04 },
                    { id:'cpu2', charId:4, pos: 550, x:0.6, speed:0, color: CHARACTERS[4].color, name:'Toad', aggro: 0.06 }
                ];
            } else {
                this.connectMultiplayer();
            }
            this.state = 'LOBBY';
        },

        connectMultiplayer: function() {
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ name: 'Player', charId: this.selectedChar, ready: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val(); if (!data) return;
                const now = Date.now();
                this.rivals = Object.keys(data)
                    .filter(id => id !== window.System.playerId && (now - data[id].lastSeen < 15000))
                    .map(id => ({ id, ...data[id], isRemote: true, color: CHARACTERS[data[id].charId]?.color || '#fff' }));
                if(this.state === 'WAITING' && Object.values(data).every(p => p.ready)) this.startRace(this.selectedTrack);
            });
        },

        toggleReady: function() {
            this.isReady = !this.isReady;
            window.Sfx.click();
            if(!this.isOnline) { this.startRace(this.selectedTrack); return; }
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        syncLobby: function() {
            if(this.dbRef) this.dbRef.child('players/' + window.System.playerId).update({
                charId: this.selectedChar, ready: this.isReady, lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        },

        startRace: function(trackId) {
            this.state = 'RACE';
            this.buildTrack(trackId); 
            nitroBtn.style.display = 'flex';
            this.pushMsg("LARGADA!", "#0f0", 60);
            window.Sfx.play(600, 'square', 0.5, 0.2);
        },

        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
            
            this.updatePhysics(w, h, pose);
            this.renderWorld(ctx, w, h);
            this.renderUI(ctx, w, h);
            
            if (this.isOnline) this.syncMultiplayer();
            return Math.floor(this.score);
        },

        syncMultiplayer: function() {
            if (Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.pos), x: this.playerX, speed: this.speed,
                    steer: this.steer, charId: this.selectedChar, lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },

        // =================================================================
        // FÍSICA SÊNIOR: INÉRCIA, MOMENTO E GESTO TURBO
        // =================================================================
        updatePhysics: function(w, h, pose) {
            const d = Logic;
            const char = CHARACTERS[this.selectedChar];

            // 1. INPUT E GESTO TURBO (RESTAURADO)
            let detected = 0;
            let lw = null, rw = null, nose = null;

            if (d.state === 'RACE' && pose && pose.keypoints) {
                const map = (pt) => ({ x: (1 - pt.x/640)*w, y: (pt.y/480)*h });
                lw = pose.keypoints.find(k => k.name === 'left_wrist');
                rw = pose.keypoints.find(k => k.name === 'right_wrist');
                nose = pose.keypoints.find(k => k.name === 'nose');

                if (lw?.score > 0.2 && rw?.score > 0.2) {
                    const pl = map(lw); const pr = map(rw);
                    const dx = pr.x - pl.x; const dy = pr.y - pl.y;
                    const angle = Math.atan2(dy, dx);
                    
                    d.targetSteer = angle * 3.0;
                    d.virtualWheel = { x: (pl.x+pr.x)/2, y: (pl.y+pr.y)/2, r: Math.hypot(dx, dy)/2, opacity: 1 };
                    detected = 2;

                    // Lógica Turbo Gestual (Original V18)
                    const isHandsHigh = (lw.y < nose.y && rw.y < nose.y);
                    d.virtualWheel.isHigh = isHandsHigh;
                    if (isHandsHigh) {
                         d.gestureTimer++;
                         if (d.gestureTimer > 25 && d.nitro > 15 && !d.turboLock) { 
                             d.turboLock = true; d.pushMsg("TURBO GESTURE!", "#00ffff");
                             window.Sfx.play(800, 'square', 0.1, 0.1);
                         }
                    } else { d.gestureTimer = 0; }
                }
            }

            if (detected < 2) { 
                d.targetSteer = 0; d.virtualWheel.opacity *= 0.9; d.gestureTimer = 0; 
            }
            
            const sensitivity = 0.12 / Math.sqrt(char.weight);
            d.steer += (d.targetSteer - d.steer) * sensitivity;

            // 2. TERRENO E GRIP (SEM AUTO-ALINHAMENTO)
            const absX = Math.abs(d.playerX);
            let currentGrip = PHYSICS_TUNING.gripAsphalt;
            let currentDrag = CONF.FRICTION;

            if (absX > 1.0) { 
                const isZebra = absX < 1.35;
                currentGrip = isZebra ? PHYSICS_TUNING.gripZebra : PHYSICS_TUNING.gripOffroad;
                currentDrag = isZebra ? 0.97 : CONF.OFFROAD_DECEL;
                d.vibration = isZebra ? 2 : 5;
                if(!isZebra && d.speed > 50) d.speed *= 0.98;
            } else { d.vibration = 0; }

            // 3. VELOCIDADE
            let max = CONF.MAX_SPEED * char.speedInfo;
            if (d.turboLock && d.nitro > 0) { 
                max = CONF.TURBO_MAX_SPEED; d.nitro -= 0.6; 
                if(d.nitro <= 0) d.turboLock = false;
            } else { d.nitro = Math.min(100, d.nitro + 0.15); }

            if (d.state === 'RACE' && d.spinTimer <= 0) {
                d.speed += (max - d.speed) * char.accel;
            }
            d.speed *= currentDrag;

            // 4. FÍSICA DE INÉRCIA LATERAL (SOBERANA)
            const seg = getSegment(d.pos / CONF.SEGMENT_LENGTH);
            const ratio = d.speed / CONF.MAX_SPEED;
            
            const centrifugal = -(seg.curve * (ratio ** 2)) * PHYSICS_TUNING.centrifugalForce * char.weight;
            const turnForce = d.steer * char.turnInfo * currentGrip * ratio;

            // O kart não volta sozinho (Zero Auto-Steer)
            const deltaX = turnForce + centrifugal;
            d.lateralInertia = (d.lateralInertia * PHYSICS_TUNING.lateralInertiaDecay) + (deltaX * (1 - PHYSICS_TUNING.lateralInertiaDecay));
            d.playerX += d.lateralInertia;

            // 5. SPIN E COLISÃO (TRANSFERÊNCIA DE MOMENTO)
            if (d.spinTimer > 0) {
                d.spinTimer--; d.spinAngle += 0.4; d.speed *= 0.95;
            } else if (absX > 1.5 && ratio > 0.8 && Math.abs(d.lateralInertia) > 0.15) {
                d.spinTimer = 45; window.Sfx.play(200, 'sawtooth', 0.2, 0.1); d.pushMsg("RODOU!");
            }

            d.rivals.forEach(r => {
                let distZ = Math.abs(r.pos - d.pos);
                let distX = Math.abs(r.x - d.playerX);
                if (distZ < 160 && distX < 0.7) {
                    const impact = (d.speed / 100) * PHYSICS_TUNING.momentumTransfer;
                    const rChar = CHARACTERS[r.charId] || char;
                    d.lateralInertia += (d.playerX > r.x ? 0.15 : -0.15) * impact * (rChar.weight / char.weight);
                    d.speed *= 0.9; window.Sfx.crash();
                }
            });

            d.playerX = Math.max(-3.5, Math.min(3.5, d.playerX));
            d.pos += d.speed;
            if (d.pos >= trackLength) { d.pos -= trackLength; d.lap++; }
            
            d.visualTilt += ((d.steer * 15) - d.visualTilt) * 0.1;
            d.bounce = (Math.random() - 0.5) * d.vibration;
            d.score += d.speed * 0.01;
        },

        // =================================================================
        // RENDERIZAÇÃO (EXTRAÍDO 1:1 DO V18 ORIGINAL DO ZIP)
        // =================================================================

        renderWorld: function(ctx, w, h) {
            const d = Logic; const cx = w / 2; const horizon = h * 0.40 + d.bounce;
            const currentSegIndex = Math.floor(d.pos / CONF.SEGMENT_LENGTH);
            const isOffRoad = Math.abs(d.playerX) > 1.2;

            // Céu Gradiente Original
            const skyGrads = [['#3388ff', '#88ccff'], ['#e67e22', '#f1c40f'], ['#0984e3', '#74b9ff']];
            const currentSky = skyGrads[d.skyColor] || skyGrads[0];
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, currentSky[0]); gradSky.addColorStop(1, currentSky[1]);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas Original
            const bgOffset = (getSegment(currentSegIndex).curve * 30) + (d.steer * 20);
            ctx.fillStyle = d.skyColor === 0 ? '#44aa44' : (d.skyColor===1 ? '#d35400' : '#fff'); 
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) { ctx.lineTo((w/12 * i) - (bgOffset * 0.5), horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40); }
            ctx.lineTo(w, horizon); ctx.fill();

            const themes = {
                'grass': { light: '#55aa44', dark: '#448833', off: '#336622' },
                'sand':  { light: '#f1c40f', dark: '#e67e22', off: '#d35400' },
                'snow':  { light: '#ffffff', dark: '#dfe6e9', off: '#b2bec3' }
            };
            const theme = themes[getSegment(currentSegIndex).theme || 'grass'];
            ctx.fillStyle = isOffRoad ? theme.off : theme.dark; ctx.fillRect(0, horizon, w, h-horizon);

            let dx = 0; let camX = d.playerX * (w * 0.4);
            let segmentCoords = [];

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = currentSegIndex + n;
                const seg = getSegment(segIdx);
                const segTheme = themes[seg.theme || 'grass'];

                dx += (seg.curve * 0.8);
                const z = n * 20; const scale = 1 / (1 + (z * 0.05));
                const scaleNext = 1 / (1 + ((z+20) * 0.05));
                const screenY = horizon + ((h - horizon) * scale);
                const screenYNext = horizon + ((h - horizon) * scaleNext);
                const screenX = cx - (camX * scale) - (dx * z * scale * 2);
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*0.8) * (z+20) * scaleNext * 2);
                
                segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx });

                ctx.fillStyle = (seg.color === 'dark') ? (isOffRoad?segTheme.off:segTheme.dark) : (isOffRoad?segTheme.off:segTheme.light);
                ctx.fillRect(0, screenYNext, w, screenY - screenYNext);
                
                // Zebra Trapezoidal Original
                ctx.fillStyle = (seg.color === 'dark') ? '#c0392b' : '#ecf0f1'; 
                ctx.beginPath(); 
                ctx.moveTo(screenX - (w*3*scale)/2 - (w*3*scale)*0.1, screenY); 
                ctx.lineTo(screenX + (w*3*scale)/2 + (w*3*scale)*0.1, screenY); 
                ctx.lineTo(screenXNext + (w*3*scaleNext)/2 + (w*3*scaleNext)*0.1, screenYNext); 
                ctx.lineTo(screenXNext - (w*3*scaleNext)/2 - (w*3*scaleNext)*0.1, screenYNext); 
                ctx.fill();
                
                // Pista Original
                ctx.fillStyle = (seg.color === 'dark') ? '#444' : '#494949'; 
                ctx.beginPath(); 
                ctx.moveTo(screenX - (w*3*scale)/2, screenY); 
                ctx.lineTo(screenX + (w*3*scale)/2, screenY); 
                ctx.lineTo(screenXNext + (w*3*scaleNext)/2, screenYNext); 
                ctx.lineTo(screenXNext - (w*3*scaleNext)/2, screenYNext); 
                ctx.fill();
            }

            // Rivais e Player
            for(let n = CONF.DRAW_DISTANCE - 1; n >= 0; n--) {
                const coord = segmentCoords[n]; if (!coord) continue;
                d.rivals.forEach(r => {
                    let rRelPos = r.pos - d.pos; 
                    if(rRelPos < -trackLength/2) rRelPos += trackLength; 
                    if (Math.abs(Math.floor(rRelPos / CONF.SEGMENT_LENGTH) - n) < 2.0 && n > 0) {
                        const rx = coord.x + (r.x * (w * 3) * coord.scale / 2);
                        this.drawKartSprite(ctx, rx, coord.y, coord.scale * w * 0.0055, 0, 0, r.spinAngle || 0, r.color, r.charId, true);
                    }
                });
            }
            const pColor = CHARACTERS[d.selectedChar].color;
            this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, w * 0.0055, d.steer, d.visualTilt, d.spinAngle, pColor, d.selectedChar, false);
        },

        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, spinAngle, color, charId, isRival) {
            ctx.save(); ctx.translate(cx, y); ctx.scale(carScale, carScale); ctx.rotate(tilt * 0.02 + spinAngle);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            
            const stats = CHARACTERS[charId] || CHARACTERS[0];
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0); 
            gradBody.addColorStop(0, color); gradBody.addColorStop(0.5, '#fff'); gradBody.addColorStop(1, color);
            ctx.fillStyle = gradBody; 
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();
            
            const wheelAngle = steer * 0.8; 
            const dw = (wx, wy) => { 
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); 
                ctx.fillStyle = '#111'; ctx.fillRect(-12, -15, 24, 30); ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); ctx.restore(); 
            };
            dw(-45, 15); dw(45, 15); ctx.fillStyle='#111'; ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);
            
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3); 
            ctx.fillStyle = '#ffccaa'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = stats.hat; ctx.beginPath(); ctx.arc(0, -25, 18, Math.PI, 0); ctx.fill();
            ctx.fillRect(-22, -25, 44, 8); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -32, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font='bold 8px Arial'; ctx.textAlign='center'; ctx.fillText(stats.name[0], 0, -30);
            ctx.restore(); ctx.restore(); 
        },

        renderUI: function(ctx, w, h) {
            const d = Logic;
            // JUICE MESSAGES ORIGINAL V18
            hudMessages = hudMessages.filter(m => m.life > 0);
            hudMessages.forEach((m, i) => {
                ctx.save(); ctx.translate(w/2, h/2 - (i*40));
                let s = 1 + Math.sin(Date.now() * 0.02) * 0.1; if(m.scale < 1) m.scale += 0.2;
                ctx.scale(m.scale * s, m.scale * s); ctx.shadowColor = "black"; ctx.shadowBlur = 10;
                ctx.fillStyle = m.color; ctx.font = `italic bold ${m.size}px 'Russo One'`; 
                ctx.textAlign = 'center'; ctx.globalAlpha = Math.min(1, m.life / 20);
                ctx.fillText(m.text, 0, 0); ctx.lineWidth = 2; ctx.strokeStyle = "black"; ctx.strokeText(m.text, 0, 0);
                ctx.restore(); m.life--;
            });

            // HUD ORIGINAL
            const hudX = w - 80; const hudY = h - 60; 
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI * 2); ctx.fill();
            const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED); 
            ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + Math.PI * rpm); 
            ctx.lineWidth = 6; ctx.strokeStyle = d.turboLock ? '#00ffff' : '#ff3300'; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = "bold 36px 'Russo One'"; ctx.textAlign = 'center'; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);

            // NITRO BAR
            const nW = 220; ctx.fillStyle = '#111'; ctx.fillRect(w/2 - nW/2, 20, nW, 20); 
            ctx.fillStyle = d.turboLock ? '#0ff' : '#f90'; ctx.fillRect(w/2 - nW/2 + 2, 22, (nW-4) * (d.nitro/100), 16);

            // MINIMAPA ORIGINAL
            if (minimapPath.length > 0) {
                const mapX = 25, mapY = 95, mapSize = 130;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(mapX, mapY, mapSize, mapSize);
                ctx.save(); ctx.translate(mapX + mapSize/2, mapY + mapSize/2);
                const scale = Math.min((mapSize-20)/minimapBounds.w, (mapSize-20)/minimapBounds.h);
                ctx.scale(scale, scale); ctx.translate(-(minimapBounds.minX+minimapBounds.maxX)/2, -(minimapBounds.minZ+minimapBounds.maxZ)/2);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 15; ctx.beginPath();
                minimapPath.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.z); else ctx.lineTo(p.x, p.z); });
                ctx.closePath(); ctx.stroke();
                const drawDot = (pos, c, r) => {
                    const idx = Math.floor((pos/trackLength)*minimapPath.length)%minimapPath.length;
                    const pt = minimapPath[idx]; if(pt){ctx.fillStyle=c; ctx.beginPath(); ctx.arc(pt.x, pt.z, r, 0, Math.PI*2); ctx.fill();}
                };
                d.rivals.forEach(r => drawDot(r.pos, r.color, 8)); drawDot(d.pos, '#f00', 12);
                ctx.restore();
            }

            // VOLANTE ORIGINAL
            if (d.virtualWheel.opacity > 0.01) {
                ctx.save(); ctx.globalAlpha = d.virtualWheel.opacity; ctx.translate(d.virtualWheel.x, d.virtualWheel.y);
                if (d.virtualWheel.isHigh) { ctx.shadowBlur = 25; ctx.shadowColor = '#00ffff'; }
                ctx.lineWidth = 8; ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, d.virtualWheel.r, 0, Math.PI * 2); ctx.stroke();
                ctx.rotate(d.steer * 1.4); ctx.fillStyle = '#ff3300'; ctx.fillRect(-4, -d.virtualWheel.r + 10, 8, 22);
                ctx.restore();
            }
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("KART LEGENDS", w/2, h * 0.3);
            ctx.fillStyle = "#e67e22"; ctx.fillRect(w/2 - 160, h * 0.45, 320, 65);
            ctx.fillStyle = "#27ae60"; ctx.fillRect(w/2 - 160, h * 0.6, 320, 65);
            ctx.fillStyle = "white"; ctx.font = "bold 20px 'Russo One'";
            ctx.fillText("ARCADE (SOLO)", w/2, h * 0.45 + 40);
            ctx.fillText("ONLINE (P2P)", w/2, h * 0.6 + 40);
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 32px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.3 + 100);
            ctx.font = "20px 'Russo One'"; ctx.fillText("PISTA: " + TRACKS[this.selectedTrack].name, w/2, h*0.55);
            ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.8, 320, 70);
            ctx.fillStyle = "white"; ctx.fillText(this.isReady ? "AGUARDANDO..." : "PRONTO!", w/2, h*0.8 + 45);
        }
    };

    if(window.System) window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, { camOpacity: 0.1 });

})();