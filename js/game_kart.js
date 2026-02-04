// =============================================================================
// KART LEGENDS: MARIO GP EDITION - PHYSICS & DYNAMICS EVOLUTION (V22)
// ENGENHARIA SÊNIOR: FIDELIDADE GRÁFICA ORIGINAL + FÍSICA DE MOMENTO REAL
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES DE TUNING (FÍSICA & PERSONAGENS)
    // -----------------------------------------------------------------
    
    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', speedInfo: 1.00, turnInfo: 1.00, weight: 1.0, accel: 0.040 },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', speedInfo: 1.05, turnInfo: 0.95, weight: 1.1, accel: 0.038 },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', speedInfo: 0.95, turnInfo: 1.15, weight: 0.7, accel: 0.055 },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', speedInfo: 1.12, turnInfo: 0.65, weight: 1.8, accel: 0.025 },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', speedInfo: 0.90, turnInfo: 1.25, weight: 0.6, accel: 0.070 }
    ];

    const TRACKS = [
        { id: 0, name: 'COGUMELO CUP', theme: 'grass', sky: 0, curveMult: 1.0 },
        { id: 1, name: 'DESERTO KALIMARI', theme: 'sand', sky: 1, curveMult: 0.85 },
        { id: 2, name: 'MONTANHA GELADA', theme: 'snow', sky: 2, curveMult: 1.30 }
    ];

    const CONF = {
        MAX_SPEED: 230,
        TURBO_MAX_SPEED: 340,
        FRICTION_AIR: 0.99,
        ROAD_WIDTH: 2000,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 250,
        RUMBLE_LENGTH: 3
    };

    const PHYSICS = {
        gripAsphalt: 0.98,
        gripZebra: 0.85,
        gripOffroad: 0.40,
        centrifugalForce: 0.22,
        momentumTransfer: 1.6,
        offroadDecel: 0.94,
        steeringSensitivity: 0.12
    };

    let segments = [];
    let trackLength = 0;
    let minimapPath = [];
    let minimapBounds = {minX:0, maxX:0, minZ:0, maxZ:0, w:1, h:1};
    let hudMessages = [];
    let nitroBtn = null;
    let particles = [];

    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO (ARQUITETURA CORE.JS COMPATÍVEL)
    // -----------------------------------------------------------------

    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'mario_arena_v22',
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        dbRef: null,
        lastSync: 0,

        // Estado Físico de Alta Precisão
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, turboLock: false,
        spinAngle: 0, spinTimer: 0, lateralInertia: 0, vibration: 0,
        
        lap: 1, totalLaps: 3, score: 0, rank: 1,
        visualTilt: 0, bounce: 0,
        
        virtualWheel: { x:0, y:0, r:60, opacity:0 },
        rivals: [],

        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.setupUI();
            this.resetPhysics();
            window.System.msg("SELECIONE O MODO");
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players').off(); } catch(e){}
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.lap = 1; this.score = 0; this.nitro = 100;
            this.spinTimer = 0; this.lateralInertia = 0; this.spinAngle = 0;
            this.rivals = []; hudMessages = []; particles = [];
        },

        setupUI: function() {
            if(nitroBtn) nitroBtn.remove();
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', bottom: '15%', right: '30px', width: '85px', height: '85px',
                borderRadius: '50%', background: 'radial-gradient(#ffcc00, #ff6600)', border: '4px solid #fff',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontWeight: "bold", fontSize: '14px', zIndex: '100', cursor: 'pointer'
            });

            const toggleTurbo = (e) => {
                if(e && e.cancelable) e.preventDefault();
                if(this.state === 'RACE' && this.nitro > 10) {
                    this.turboLock = !this.turboLock;
                    window.Sfx.play(600, 'square', 0.1, 0.1);
                    this.pushMsg(this.turboLock ? "TURBO!" : "NORMAL");
                }
            };
            nitroBtn.addEventListener('touchstart', toggleTurbo);
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
                    else if (y < 0.35) { this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length; window.Sfx.hover(); }
                    else { this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length; window.Sfx.hover(); }
                    if(this.isOnline) this.syncLobby();
                }
            };
        },

        pushMsg: function(text, color='#fff', size=40) {
            hudMessages.push({ text, color, size, life: 60, scale: 0.1 });
        },

        buildTrack: function(trackId) {
            segments = [];
            const trk = TRACKS[trackId];
            const m = trk.curveMult;
            const addRoad = (len, curve) => {
                for(let i=0; i<len; i++) segments.push({ 
                    curve: curve * m, 
                    color: Math.floor(segments.length / CONF.RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
                    theme: trk.theme, obs: []
                });
            };
            addRoad(60, 0); addRoad(50, 2); addRoad(40, 0); addRoad(70, -3); 
            addRoad(50, 1.5); addRoad(90, 0); addRoad(60, 4); addRoad(50, -1.5);
            addRoad(100, 0);
            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            this.generateMinimap();
        },

        generateMinimap: function() {
            minimapPath = [];
            let x=0, z=0, angle=0;
            segments.forEach(seg => {
                angle += seg.curve * 0.003; x += Math.sin(angle) * 10; z -= Math.cos(angle) * 10;
                minimapPath.push({x, z});
            });
            let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
            minimapPath.forEach(p => { 
                minX=Math.min(minX, p.x); maxX=Math.max(maxX, p.x); 
                minZ=Math.min(minZ, p.z); maxZ=Math.max(maxZ, p.z); 
            });
            minimapBounds = {minX, maxX, minZ, maxZ, w:maxX-minX || 1, h:maxZ-minZ || 1};
        },

        selectMode: function(mode) {
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if(this.isOnline) this.connectMultiplayer();
            else {
                this.rivals = [
                    { id:'cpu1', charId:3, pos: 1100, x:-0.6, speed:0, color: CHARACTERS[3].color, name:'Bowser' },
                    { id:'cpu2', charId:4, pos: 550, x:0.6, speed:0, color: CHARACTERS[4].color, name:'Toad' }
                ];
            }
            this.state = 'LOBBY';
        },

        connectMultiplayer: function() {
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ name: 'Player', charId: this.selectedChar, ready: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val(); if(!data) return;
                const now = Date.now();
                this.rivals = Object.keys(data)
                    .filter(id => id !== window.System.playerId && (now - data[id].lastSeen < 10000))
                    .map(id => ({ id, ...data[id], isRemote: true, color: CHARACTERS[data[id].charId]?.color || '#fff' }));
                
                if(this.state === 'WAITING' && Object.values(data).every(p => p.ready)) this.startRace();
            });
        },

        toggleReady: function() {
            this.isReady = !this.isReady;
            if(!this.isOnline) { this.startRace(); return; }
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        syncLobby: function() {
            if(this.dbRef) this.dbRef.child('players/' + window.System.playerId).update({
                charId: this.selectedChar, ready: this.isReady, lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        },

        startRace: function() {
            this.state = 'RACE';
            this.buildTrack(this.selectedTrack);
            nitroBtn.style.display = 'flex';
            this.pushMsg("LARGADA!", "#0f0", 60);
            window.Sfx.play(600, 'square', 0.5, 0.2);
        },

        // =================================================================
        // CICLO DE UPDATE (FÍSICA SÊNIOR)
        // =================================================================

        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderMenu(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }

            this.applyInput(w, h, pose);
            this.applyPhysics();
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if (this.isOnline && Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.pos), x: this.playerX, speed: this.speed,
                    charId: this.selectedChar, lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
            return Math.floor(this.score);
        },

        applyInput: function(w, h, pose) {
            let detected = false;
            if(pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                if(lw?.score > 0.2 && rw?.score > 0.2) {
                    const lpx = (1 - lw.x/640) * w; const lpy = (lw.y/480) * h;
                    const rpx = (1 - rw.x/640) * w; const rpy = (rw.y/480) * h;
                    const angle = Math.atan2(rpy - lpy, rpx - lpx);
                    this.targetSteer = angle * 2.8; 
                    this.virtualWheel = { x: (lpx+rpx)/2, y: (lpy+rpy)/2, r: Math.hypot(rpx-lpx, rpy-lpy)/2, opacity: 1 };
                    detected = true;
                }
            }
            if(!detected) { this.targetSteer = 0; this.virtualWheel.opacity *= 0.9; }

            const char = CHARACTERS[this.selectedChar];
            const sens = PHYSICS.steeringSensitivity / Math.sqrt(char.weight);
            this.steer += (this.targetSteer - this.steer) * sens;
        },

        applyPhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const absX = Math.abs(this.playerX);
            
            // 1. Detecção de Terreno e Grip Real
            let currentGrip = PHYSICS.gripAsphalt;
            let currentDrag = CONF.FRICTION_AIR;
            this.vibration = 0;

            if (absX > 1.45) { // Offroad
                currentGrip = PHYSICS.gripOffroad;
                currentDrag = PHYSICS.offroadDecel;
                this.vibration = 5;
                if(this.speed > 55) this.speed *= 0.985;
            } else if (absX > 1.0) { // Zebra
                currentGrip = PHYSICS.gripZebra;
                this.vibration = 2;
            }

            // 2. Aceleração e Velocidade
            let max = CONF.MAX_SPEED * char.speedInfo;
            if(this.turboLock && this.nitro > 0) { 
                max = CONF.TURBO_MAX_SPEED; this.nitro -= 0.6; 
                if(this.nitro <= 0) this.turboLock = false;
            } else { 
                this.nitro = Math.min(100, this.nitro + 0.15); 
            }

            if(this.state === 'RACE' && this.spinTimer <= 0) {
                this.speed += (max - this.speed) * char.accel;
            }
            this.speed *= currentDrag;

            // 3. Inércia Lateral (ZERO AUTO-STEER)
            const seg = getSegment(this.pos / CONF.SEGMENT_LENGTH);
            const ratio = this.speed / CONF.MAX_SPEED;
            
            const centrifugal = -(seg.curve * (ratio ** 2)) * PHYSICS.centrifugalForce * char.weight;
            const turnForce = this.steer * char.turnInfo * currentGrip * ratio;

            // Inércia acumulada (O kart não volta sozinho)
            const forceTotal = turnForce + centrifugal;
            this.lateralInertia = (this.lateralInertia * 0.91) + (forceTotal * 0.09);
            this.playerX += this.lateralInertia;

            // 4. Mecânica de Spin (Rodada)
            if(this.spinTimer > 0) {
                this.spinTimer--; this.spinAngle += 0.4; this.speed *= 0.96;
            } else if(absX > 1.6 && ratio > 0.82 && Math.abs(this.lateralInertia) > 0.16) {
                this.spinTimer = 45; window.Sfx.play(200, 'sawtooth', 0.2, 0.1); this.pushMsg("RODOU!");
            }

            // 5. Colisão Dinâmica (Transferência de Momento)
            this.rivals.forEach(r => {
                let distZ = r.pos - this.pos;
                if(distZ > trackLength/2) distZ -= trackLength;
                if(distZ < -trackLength/2) distZ += trackLength;
                let distX = r.x - this.playerX;

                if(Math.abs(distZ) < 160 && Math.abs(distX) < 0.65) {
                    const impact = (this.speed / 100) * PHYSICS.momentumTransfer;
                    const rChar = CHARACTERS[r.charId] || char;
                    const weightFactor = rChar.weight / char.weight;
                    
                    const push = (distX > 0 ? -0.12 : 0.12) * impact * weightFactor;
                    this.lateralInertia += push;
                    this.speed *= 0.9;
                    if(window.Gfx) window.Gfx.shakeScreen(this.speed * 0.05);
                    window.Sfx.crash();
                }
            });

            this.playerX = Math.max(-3.6, Math.min(3.6, this.playerX));
            this.pos += this.speed;
            if(this.pos >= trackLength) { this.pos -= trackLength; this.lap++; }
            if(this.pos < 0) this.pos += trackLength;

            this.visualTilt += ((this.steer * 16) - this.visualTilt) * 0.1;
            this.bounce = (Math.random() - 0.5) * this.vibration;
            this.score += this.speed * 0.01;
        },

        // =================================================================
        // RENDERIZAÇÃO (RESTAURAÇÃO TOTAL DO ESTILO ORIGINAL)
        // =================================================================

        renderWorld: function(ctx, w, h) {
            const cx = w/2; const horizon = h * 0.4 + this.bounce;
            const startIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const trk = TRACKS[this.selectedTrack];
            const theme = { grass: ['#5a4', '#483'], sand: ['#ec1', '#d90'], snow: ['#fff', '#dee'] }[trk.theme] || ['#5a4', '#483'];

            // Céu e Terreno
            ctx.fillStyle = "#8cf"; ctx.fillRect(0,0,w,horizon);
            ctx.fillStyle = theme[1]; ctx.fillRect(0,horizon,w,h-horizon);

            let dx = 0; let camX = this.playerX * (w*0.4);
            let segmentCoords = [];

            for(let n=0; n<CONF.DRAW_DISTANCE; n++) {
                const seg = getSegment(startIdx + n);
                const scale = 1 / (1 + n * 0.05);
                const nextScale = 1 / (1 + (n+1) * 0.05);
                const sy = horizon + (h - horizon) * scale;
                const nsy = horizon + (h - horizon) * nextScale;

                dx += seg.curve;
                const x = cx - (camX * scale) - (dx * n * scale * 2);
                const nx = cx - (camX * nextScale) - ((dx + seg.curve) * (n+1) * nextScale * 2);
                const rw = (w*3) * scale;
                const nrw = (w*3) * nextScale;

                segmentCoords.push({ x, y: sy, scale });

                // Zebra Original (Trapezoidal)
                ctx.fillStyle = seg.color === 'dark' ? '#f33' : '#fff';
                ctx.beginPath(); ctx.moveTo(x - rw*0.6, sy); ctx.lineTo(x + rw*0.6, sy);
                ctx.lineTo(nx + nrw*0.6, nsy); ctx.lineTo(nx - nrw*0.6, nsy); ctx.fill();

                // Pista Original
                ctx.fillStyle = seg.color === 'dark' ? '#444' : '#494949';
                ctx.beginPath(); ctx.moveTo(x - rw*0.5, sy); ctx.lineTo(x + rw*0.5, sy);
                ctx.lineTo(nx + nrw*0.5, nsy); ctx.lineTo(nx - nrw*0.5, nsy); ctx.fill();
            }

            // Rivais
            this.rivals.forEach(r => {
                let relPos = r.pos - this.pos;
                if(relPos < -trackLength/2) relPos += trackLength;
                if(relPos > 0 && relPos < 4000) {
                    const n = relPos / CONF.SEGMENT_LENGTH;
                    const coord = segmentCoords[Math.floor(n)];
                    if(coord) {
                        const rx = coord.x + (r.x * (w * 1.5) * coord.scale);
                        this.drawKartSprite(ctx, rx, coord.y, w*0.0055*coord.scale, 0, 0, 0, r.color, r.charId, true);
                    }
                }
            });

            // Player Kart (Render Original 1:1)
            this.drawKartSprite(ctx, cx, h*0.85 + this.bounce, w*0.0055, this.steer, this.visualTilt, this.spinAngle, CHARACTERS[this.selectedChar].color, this.selectedChar, false);
        },

        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, spinAngle, color, charId, isRival) {
            ctx.save(); 
            ctx.translate(cx, y); 
            ctx.scale(carScale, carScale);
            ctx.rotate(tilt * 0.02 + spinAngle);
            
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            
            const stats = CHARACTERS[charId] || CHARACTERS[0];
            const hatColor = stats.hat;
            
            // Corpo (Gradiente Original)
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0); 
            gradBody.addColorStop(0, color); gradBody.addColorStop(0.5, '#fff'); gradBody.addColorStop(1, color);
            ctx.fillStyle = gradBody; 
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();
            
            // Rodas (Rotação Original)
            const wheelAngle = steer * 0.8; 
            const dw = (wx, wy) => { 
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); 
                ctx.fillStyle = '#111'; ctx.fillRect(-12, -15, 24, 30); 
                ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); 
                ctx.restore(); 
            };
            dw(-45, 15); dw(45, 15); ctx.fillStyle='#111'; ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);
            
            // Motorista (Estilo Nintendo Original)
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3); 
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = hatColor; // Chapéu
            ctx.beginPath(); ctx.arc(0, -25, 18, Math.PI, 0); ctx.fill();
            ctx.fillRect(-22, -25, 44, 8);
            
            // Símbolo no Boné (Círculo Branco + Letra)
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -32, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font='bold 8px Arial'; ctx.textAlign='center'; 
            ctx.fillText(stats.name[0], 0, -29);
            
            if (isRival) {
                ctx.fillStyle = '#0f0'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('CPU', 0, -50);
            } else {
                ctx.fillStyle = 'red'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('EU', 0, -50);
            }
            ctx.restore(); 
            ctx.restore(); 
        },

        renderHUD: function(ctx, w, h) {
            // Velocímetro Estilo Russo One
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(w-75, h-75, 55, 0, 7); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 30px Russo One"; ctx.fillText(Math.floor(this.speed), w-75, h-70);
            ctx.font="10px Arial"; ctx.fillText("KM/H", w-75, h-50);
            
            // Nitro
            ctx.fillStyle = '#111'; ctx.fillRect(w/2 - 100, 20, 200, 15);
            ctx.fillStyle = this.turboLock ? '#0ff' : '#f90'; ctx.fillRect(w/2 - 98, 22, 196 * (this.nitro/100), 11);

            // Minimapa Original
            if (minimapPath.length > 0) {
                const ms = 110; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(20, 80, ms, ms);
                ctx.save(); ctx.translate(20 + ms/2, 80 + ms/2); ctx.scale(0.35, 0.35);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath();
                minimapPath.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.z) : ctx.lineTo(p.x, p.z)); ctx.closePath(); ctx.stroke();
                const drawDot = (pos, c) => {
                    const idx = Math.floor((pos/trackLength)*minimapPath.length) % minimapPath.length;
                    const pt = minimapPath[idx]; if(pt) { ctx.fillStyle=c; ctx.beginPath(); ctx.arc(pt.x, pt.z, 12, 0, 7); ctx.fill(); }
                };
                this.rivals.forEach(r => drawDot(r.pos, r.color)); drawDot(this.pos, '#f00');
                ctx.restore();
            }

            // Mensagens
            hudMessages = hudMessages.filter(m => m.life > 0);
            hudMessages.forEach((m, i) => {
                ctx.fillStyle = m.color; ctx.font = `bold ${m.size}px Russo One`; ctx.textAlign = 'center';
                ctx.fillText(m.text, w/2, h/2 - i*45); m.life--;
            });

            // Volante Original
            if (this.virtualWheel.opacity > 0.05) {
                ctx.save(); ctx.globalAlpha = this.virtualWheel.opacity; ctx.translate(this.virtualWheel.x, this.virtualWheel.y);
                ctx.rotate(this.steer * 1.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(0,0, this.virtualWheel.r, 0, 7); ctx.stroke();
                ctx.fillStyle = '#f00'; ctx.fillRect(-5, -this.virtualWheel.r, 10, 15);
                ctx.restore();
            }
        },

        renderMenu: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px Russo One";
            ctx.fillText("KART LEGENDS", w/2, h * 0.3);
            ctx.fillStyle = "#e67e22"; ctx.fillRect(w/2 - 160, h * 0.45, 320, 65);
            ctx.fillStyle = "#27ae60"; ctx.fillRect(w/2 - 160, h * 0.6, 320, 65);
            ctx.fillStyle = "white"; ctx.font = "bold 20px Russo One";
            ctx.fillText("ARCADE (SOLO)", w/2, h * 0.45 + 40);
            ctx.fillText("ONLINE (P2P)", w/2, h * 0.6 + 40);
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 55, 0, 7); ctx.fill();
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 32px Russo One";
            ctx.fillText(char.name, w/2, h*0.3 + 90);
            ctx.font = "20px Russo One"; ctx.fillText("PISTA: " + TRACKS[this.selectedTrack].name, w/2, h*0.55);
            ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.75, 320, 65);
            ctx.fillStyle = "white"; ctx.fillText(this.isReady ? "AGUARDANDO..." : "PRONTO!", w/2, h*0.75 + 40);
        }
    };

    // REGISTRO NO ENGINE CORE (ID 'drive' para compatibilidade com core.js)
    if(window.System) {
        window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, { camOpacity: 0.1 });
    }

})();