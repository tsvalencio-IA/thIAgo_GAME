// =============================================================================
// KART LEGENDS: MARIO GP EDITION (STABLE PHYSICS PATCH V20)
// ENGENHARIA DE JOGO: IMPLEMENTAÇÃO SÊNIOR (FÍSICA EVOLUÍDA / HUD ORIGINAL)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES E ATRIBUTOS (GAME TUNING)
    // -----------------------------------------------------------------
    
    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', speedMult: 1.00, turnMult: 1.00, weight: 1.0, accel: 0.040 },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', speedMult: 1.05, turnMult: 0.95, weight: 1.1, accel: 0.038 },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', speedMult: 0.95, turnMult: 1.20, weight: 0.7, accel: 0.055 },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', speedMult: 1.15, turnMult: 0.65, weight: 1.8, accel: 0.025 },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', speedMult: 0.90, turnMult: 1.35, weight: 0.5, accel: 0.070 }
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

    const PHYSICS_TUNING = {
        gripAsphalt: 0.98,
        gripZebra: 0.75,
        gripOffroad: 0.40,
        centrifugalMult: 0.18,   // Força G nas curvas
        collisionMomentum: 1.5,  // Transferência de impacto
        offroadDecel: 0.94,      // Fricção do terreno
        steeringSensitivity: 0.12
    };

    let segments = [];
    let trackLength = 0;
    let minimapPath = [];
    let minimapBounds = {minX:0, maxX:0, minZ:0, maxZ:0, w:1, h:1};
    let hudMessages = [];
    let nitroBtn = null;

    // Fallback para evitar crashes caso segments ainda não tenha sido gerado
    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO (OBJETO PRINCIPAL)
    // -----------------------------------------------------------------

    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'mario_kart_v20',
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        dbRef: null,
        lastSync: 0,

        // Estado Físico
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
            this.lap = 1; this.score = 0; this.nitro = 100; this.spinTimer = 0;
            this.lateralInertia = 0; this.spinAngle = 0; this.bounce = 0;
            hudMessages = [];
        },

        setupUI: function() {
            if(nitroBtn) nitroBtn.remove();
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', bottom: '15%', right: '30px', width: '80px', height: '80px',
                borderRadius: '50%', background: 'radial-gradient(#ffcc00, #ff6600)', border: '4px solid #fff',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontWeight: "bold", zIndex: '100', cursor: 'pointer'
            });

            const toggleTurbo = (e) => {
                if(e && e.cancelable) e.preventDefault();
                if(this.state === 'RACE' && this.nitro > 10) {
                    this.turboLock = !this.turboLock;
                    window.Sfx.play(600, 'square', 0.1, 0.1);
                    this.pushMsg(this.turboLock ? "TURBO ON" : "TURBO OFF");
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
                    if (y > 0.75) this.toggleReady();
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
            addRoad(50, 0); addRoad(60, 2); addRoad(40, 0); addRoad(80, -3); 
            addRoad(50, 1.5); addRoad(100, 0); addRoad(60, 4); addRoad(40, -1);
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
            minimapPath.forEach(p => { minX=Math.min(minX, p.x); maxX=Math.max(maxX, p.x); minZ=Math.min(minZ, p.z); maxZ=Math.max(maxZ, p.z); });
            minimapBounds = {minX, maxX, minZ, maxZ, w:maxX-minX, h:maxZ-minZ};
        },

        selectMode: function(mode) {
            this.isOnline = (mode === 'ONLINE' && !!window.DB);
            if(this.isOnline) this.connectMultiplayer();
            else {
                this.rivals = [
                    { id:'cpu1', charId:3, pos: 1000, x:-0.5, speed:0, color: CHARACTERS[3].color, name:'Bowser' },
                    { id:'cpu2', charId:4, pos: 500, x:0.5, speed:0, color: CHARACTERS[4].color, name:'Toad' }
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
                    .map(id => ({ id, ...data[id], isRemote: true, color: CHARACTERS[data[id].charId].color }));
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
            window.Sfx.play(800, 'square', 0.5, 0.2);
        },

        // --- CORE DE ATUALIZAÇÃO ---

        update: function(ctx, w, h, pose) {
            if(this.state === 'MODE_SELECT') { this.renderMenu(ctx, w, h); return; }
            if(this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }

            this.applyInput(w, h, pose);
            this.applyPhysics();
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline && Date.now() - this.lastSync > 100) {
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
            const sens = PHYSICS_TUNING.steeringSensitivity / Math.sqrt(char.weight);
            this.steer += (this.targetSteer - this.steer) * sens;
        },

        applyPhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const absX = Math.abs(this.playerX);
            
            // 1. Atrito e Grip Real
            let currentGrip = PHYSICS_TUNING.gripAsphalt;
            let currentDrag = CONF.FRICTION_AIR;
            this.vibration = 0;

            if (absX > 1.45) { // Offroad
                currentGrip = PHYSICS_TUNING.gripOffroad;
                currentDrag = PHYSICS_TUNING.offroadDecel;
                this.vibration = 6;
                if(this.speed > 60) this.speed *= 0.98;
            } else if (absX > 1.0) { // Zebra
                currentGrip = PHYSICS_TUNING.gripZebra;
                this.vibration = 3;
            }

            // 2. Velocidade
            let max = CONF.MAX_SPEED * char.speedMult;
            if(this.turboLock && this.nitro > 0) { max = CONF.TURBO_MAX_SPEED; this.nitro -= 0.6; }
            else { this.nitro = Math.min(100, this.nitro + 0.15); if(this.nitro < 5) this.turboLock = false; }

            if(this.state === 'RACE' && this.spinTimer <= 0) {
                this.speed += (max - this.speed) * char.accel;
            }
            this.speed *= currentDrag;

            // 3. Inércia Lateral e Centrífuga (Mundo Estável, Kart desliza)
            const seg = getSegment(this.pos / CONF.SEGMENT_LENGTH);
            const ratio = this.speed / CONF.MAX_SPEED;
            
            // Força Centrífuga: curva te expulsa baseado na velocidade e peso
            const centrifugal = -(seg.curve * (ratio ** 2)) * PHYSICS_TUNING.centrifugalMult * char.weight;
            // Virada: depende do grip do terreno e do status de curva do personagem
            const turnForce = this.steer * char.turnMult * currentGrip * ratio;

            const forceTotal = turnForce + centrifugal;
            this.lateralInertia = (this.lateralInertia * 0.92) + (forceTotal * 0.08);
            this.playerX += this.lateralInertia;

            // 4. Spin (Rodada)
            if(this.spinTimer > 0) {
                this.spinTimer--; this.spinAngle += 0.4; this.speed *= 0.96;
            } else if(absX > 1.5 && ratio > 0.8 && Math.abs(this.lateralInertia) > 0.15) {
                this.spinTimer = 45; window.Sfx.play(200, 'sawtooth', 0.2, 0.1); this.pushMsg("RODOU!");
            }

            // 5. Colisão entre Karts
            this.rivals.forEach(r => {
                let distZ = r.pos - this.pos;
                if(distZ > trackLength/2) distZ -= trackLength;
                if(distZ < -trackLength/2) distZ += trackLength;
                let distX = r.x - this.playerX;

                if(Math.abs(distZ) < 160 && Math.abs(distX) < 0.6) {
                    const impact = (this.speed / 100) * PHYSICS_TUNING.collisionMomentum;
                    const rChar = CHARACTERS[r.charId] || char;
                    const weightFactor = rChar.weight / char.weight;
                    const push = (distX > 0 ? -0.1 : 0.1) * impact * weightFactor;
                    this.lateralInertia += push;
                    this.speed *= 0.9;
                    if(window.Gfx) window.Gfx.shakeScreen(this.speed * 0.05);
                    window.Sfx.crash();
                }
            });

            this.playerX = Math.max(-3.5, Math.min(3.5, this.playerX));
            this.pos += this.speed;
            if(this.pos >= trackLength) { this.pos -= trackLength; this.lap++; }
            if(this.pos < 0) this.pos += trackLength;

            this.visualTilt += ((this.steer * 15) - this.visualTilt) * 0.1;
            this.bounce = (Math.random() - 0.5) * this.vibration;
            this.score += this.speed * 0.01;
        },

        // --- RENDERIZADORES ---

        renderWorld: function(ctx, w, h) {
            const cx = w/2; const horizon = h * 0.4 + this.bounce;
            const startIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const trk = TRACKS[this.selectedTrack];
            const themes = { grass: ['#5a4', '#483'], sand: ['#ec1', '#d90'], snow: ['#fff', '#dee'] };
            const theme = themes[trk.theme] || themes.grass;

            // Céu e Chão
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

                // Zebra
                ctx.fillStyle = seg.color === 'dark' ? '#f33' : '#fff';
                ctx.beginPath(); ctx.moveTo(x - rw*0.6, sy); ctx.lineTo(x + rw*0.6, sy);
                ctx.lineTo(nx + nrw*0.6, nsy); ctx.lineTo(nx - nrw*0.6, nsy); ctx.fill();

                // Pista
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
                        const rx = coord.x + ((r.x - this.playerX) * (w*1.5) * coord.scale);
                        this.drawKart(ctx, rx, coord.y, w*0.0055*coord.scale, 0, 0, 0, r.color, r.charId);
                    }
                }
            });

            // Player
            this.drawKart(ctx, cx, h*0.85 + this.bounce, w*0.0055, this.steer, this.visualTilt, this.spinAngle, CHARACTERS[this.selectedChar].color, this.selectedChar);
        },

        drawKart: function(ctx, x, y, s, steer, tilt, spin, color, charId) {
            ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(tilt * 0.02 + spin);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 30, 55, 15, 0, 0, 7); ctx.fill(); // Sombra
            ctx.fillStyle = color; ctx.fillRect(-30, -25, 60, 45); // Corpo
            ctx.fillStyle = '#111'; ctx.fillRect(-45, -20, 15, 30); ctx.fillRect(30, -20, 15, 30); // Rodas
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -15, 18, 0, 7); ctx.fill(); // Cabeça
            ctx.fillStyle = '#000'; ctx.font='bold 10px Arial'; ctx.textAlign='center'; 
            ctx.fillText(CHARACTERS[charId]?.name[0] || 'M', 0, -12);
            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            // Velocímetro Original
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(w-70, h-70, 55, 0, 7); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 30px Arial"; ctx.fillText(Math.floor(this.speed), w-70, h-65);
            ctx.font="12px Arial"; ctx.fillText("KM/H", w-70, h-45);
            
            // Nitro
            ctx.fillStyle = '#222'; ctx.fillRect(w/2 - 100, 20, 200, 15);
            ctx.fillStyle = this.turboLock ? '#0ff' : '#f90'; ctx.fillRect(w/2 - 98, 22, 196 * (this.nitro/100), 11);

            // Minimapa
            if (minimapPath.length > 0) {
                const ms = 120; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(20, 80, ms, ms);
                ctx.save(); ctx.translate(20 + ms/2, 80 + ms/2); ctx.scale(0.4, 0.4);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath();
                minimapPath.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.z) : ctx.lineTo(p.x, p.z)); ctx.closePath(); ctx.stroke();
                const drawDot = (pos, c) => {
                    const idx = Math.floor((pos/trackLength)*minimapPath.length) % minimapPath.length;
                    const pt = minimapPath[idx]; if(pt) { ctx.fillStyle=c; ctx.beginPath(); ctx.arc(pt.x, pt.z, 10, 0, 7); ctx.fill(); }
                };
                this.rivals.forEach(r => drawDot(r.pos, r.color)); drawDot(this.pos, '#f00');
                ctx.restore();
            }

            // Mensagens
            hudMessages = hudMessages.filter(m => m.life > 0);
            hudMessages.forEach((m, i) => {
                ctx.fillStyle = m.color; ctx.font = `bold ${m.size}px Arial`; ctx.textAlign = 'center';
                ctx.fillText(m.text, w/2, h/2 - i*40); m.life--;
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
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px Arial";
            ctx.fillText("KART LEGENDS", w/2, h * 0.3);
            ctx.fillStyle = "#e67e22"; ctx.fillRect(w/2 - 150, h * 0.45, 300, 60);
            ctx.fillStyle = "#27ae60"; ctx.fillRect(w/2 - 150, h * 0.6, 300, 60);
            ctx.fillStyle = "white"; ctx.font = "bold 20px Arial";
            ctx.fillText("ARCADE (SOLO)", w/2, h * 0.45 + 38);
            ctx.fillText("ONLINE (P2P)", w/2, h * 0.6 + 38);
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 50, 0, 7); ctx.fill();
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 30px Arial";
            ctx.fillText(char.name, w/2, h*0.3 + 80);
            ctx.font = "20px Arial"; ctx.fillText("PISTA: " + TRACKS[this.selectedTrack].name, w/2, h*0.55);
            ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 150, h*0.75, 300, 60);
            ctx.fillStyle = "white"; ctx.fillText(this.isReady ? "AGUARDANDO..." : "PRONTO!", w/2, h*0.75 + 38);
        }
    };

    if(window.System) window.System.registerGame('kart', 'Kart Legends', '🏎️', Logic);

})();