// =============================================================================
// KART DO OTTO – HORIZON EDITION (FÍSICA CORRIGIDA & VISUAL MELHORADO)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E CONFIGURAÇÕES
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO', color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0 },
        { id: 1, name: 'Thiago', color: '#f1c40f', speedInfo: 1.08, turnInfo: 0.85 },
        { id: 2, name: 'Thamis', color: '#3498db', speedInfo: 0.92, turnInfo: 1.15 }
    ];

    // Configurações visuais estilo Horizon Chase
    const TRACKS = [
        { id: 0, name: 'GP CIRCUITO', theme: 'grass', sky: 0, curveMult: 1.0, colors: { grassLight: '#55aa44', grassDark: '#448833', roadLight: '#666', roadDark: '#555' } },
        { id: 1, name: 'DESERTO SECO', theme: 'sand', sky: 1, curveMult: 0.8, colors: { grassLight: '#f1c40f', grassDark: '#e67e22', roadLight: '#7f8c8d', roadDark: '#707b7c' } },
        { id: 2, name: 'PICO NEVADO', theme: 'snow', sky: 2, curveMult: 1.3, colors: { grassLight: '#ffffff', grassDark: '#dfe6e9', roadLight: '#95a5a6', roadDark: '#7f8c8d' } }
    ];

    const CONF = {
        SPEED: 120,
        MAX_SPEED: 240, // Aumentado para sensação de velocidade
        TURBO_MAX_SPEED: 340,
        FRICTION: 0.96,
        OFFROAD_DECEL: 0.92, // Punição mais forte no offroad
        CENTRIFUGAL_FORCE: 0.32, // Ajustado para jogar para fora nas curvas

        // Câmera estilo Horizon (Mais alta e longe)
        CAMERA_DEPTH: 0.7, 
        CAMERA_HEIGHT: 2000, 
        
        ROAD_WIDTH: 2200,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 300, // Ver mais longe
        RUMBLE_LENGTH: 3
    };

    let minimapPoints = [];
    let particles = []; 
    let nitroBtn = null;
    let lapPopupTimer = 0;
    let lapPopupText = "";
    
    let segments = [];
    let trackLength = 0;

    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    function buildMiniMap(segments) {
        minimapPoints = [];
        let x = 0; let y = 0; let dir = -Math.PI / 2;
        segments.forEach(seg => {
            dir += seg.curve * 0.002;
            x += Math.cos(dir) * 4; y += Math.sin(dir) * 4;
            minimapPoints.push({ x, y });
        });
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'room_01',
        
        selectedChar: 0,
        selectedTrack: 0,
        isReady: false,
        isOnline: false,
        
        dbRef: null,
        lastSync: 0,
        autoStartTimer: null,

        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, turboLock: false,
        
        // Spin Mechanic
        spinTimer: 0,
        spinAngle: 0,

        driftState: 0, boostTimer: 0,    
        
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
            particles = []; 
            window.System.msg("SELECIONE O MODO");
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players').off(); } catch(e){}
            }
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        setupUI: function() {
            const old = document.getElementById('nitro-btn-kart');
            if(old) old.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '40%', right: '20px', width: '85px', height: '85px',
                borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
                color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontWeight: "bold", fontSize: '16px', zIndex: '100',
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', cursor: 'pointer', userSelect: 'none'
            });

            const toggleTurbo = (e) => {
                if(e) { if(e.cancelable) e.preventDefault(); e.stopPropagation(); }
                if(this.state !== 'RACE') return;
                
                if(this.nitro > 25) {
                    this.turboLock = true;
                    this.nitro -= 25;
                    this.boostTimer = 60; // 1 segundo de boost
                    window.Sfx.play(600, 'square', 0.1, 0.1);
                    setTimeout(() => this.turboLock = false, 1000);
                }
            };
            
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);

            // Handler de Clique Genérico para Menus
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const h = window.System.canvas.height;

                if (this.state === 'MODE_SELECT') {
                    if (y < h * 0.5) this.selectMode('OFFLINE');
                    else this.selectMode('ONLINE');
                    window.Sfx.click();
                    return;
                }

                if (this.state === 'LOBBY') {
                    if (y > h * 0.7) this.toggleReady(); 
                    else if (y < h * 0.3) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    } else {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    }
                }
            };
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.lap = 1; this.score = 0; this.driftState = 0; this.nitro = 100;
            this.spinTimer = 0; this.spinAngle = 0;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
            particles = [];
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
            const addProp = (index, type, offset) => { if (segments[index]) segments[index].obs.push({ type: type, x: offset }); };

            // Pista mais longa e suave
            addRoad(50, 0, 0); 
            addRoad(50, 2.0, 0); // Curva suave direita
            addRoad(50, 0, 0); 
            addRoad(80, -2.0, 0); // Curva longa esquerda
            addRoad(50, 0, 0);
            
            let sApex = segments.length; 
            addRoad(60, 4.0, 0); // Curva forte direita
            addProp(sApex + 20, 'cone', 0.9);
            
            addRoad(100, 0, 0); // Retao
            addRoad(40, -1.0, 0); 
            
            let sHazards = segments.length; 
            addRoad(70, -3.0, 0); 
            addProp(sHazards + 15, 'cone', 0); addProp(sHazards + 35, 'cone', -0.6); 
            
            addRoad(40, 1.2, 0);

            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            if(trackLength === 0) trackLength = 2000;
            buildMiniMap(segments);
        },

        selectMode: function(mode) {
            this.resetPhysics();
            if (mode === 'OFFLINE') {
                this.isOnline = false;
                window.System.msg("MODO SOLO");
                this.rivals = [
                    { pos: 1000, lap: 1, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.03 },
                    { pos: 800,  lap: 1, x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.025 }
                ];
                this.state = 'LOBBY';
            } else {
                if (!window.DB) {
                    window.System.msg("SEM NET! INDO P/ SOLO");
                    this.selectMode('OFFLINE');
                    return;
                }
                this.isOnline = true;
                window.System.msg("CONECTANDO...");
                this.connectMultiplayer();
                this.state = 'LOBBY';
            }
        },

        connectMultiplayer: function() {
            if (this.dbRef) this.dbRef.child('players').off(); 

            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ name: 'Player', charId: 0, ready: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val();
                if (!data) return;
                
                const now = Date.now();
                const newRivals = Object.keys(data)
                    .filter(id => id !== window.System.playerId)
                    .filter(id => (now - (data[id].lastSeen || 0)) < 15000)
                    .map(id => ({
                        id: id,
                        ...data[id],
                        isRemote: true,
                        speed: data[id].speed || 0,
                        pos: data[id].pos || 0,
                        x: data[id].x || 0,
                        spinAngle: data[id].spinAngle || 0,
                        color: (data[id].charId !== undefined) ? CHARACTERS[data[id].charId].color : '#fff'
                    }));
                
                this.rivals = newRivals;
                this.checkAutoStart(data);
            });
        },

        checkAutoStart: function(allPlayers) {
            if (this.state !== 'WAITING' && this.state !== 'LOBBY') return;
            
            let readyCount = (this.isReady ? 1 : 0);
            this.rivals.forEach(r => { if(r.ready) readyCount++; });
            const totalPlayers = this.rivals.length + 1;

            if (totalPlayers >= 2 && readyCount === totalPlayers) {
                this.startRace(this.selectedTrack);
            }
            else if (totalPlayers >= 2 && readyCount >= 2) {
                 if (!this.autoStartTimer) this.autoStartTimer = Date.now() + 15000;
                 if (Date.now() > this.autoStartTimer) this.startRace(this.selectedTrack);
            } else {
                this.autoStartTimer = null;
            }
        },

        toggleReady: function() {
            if (this.state !== 'LOBBY') return;
            if (!this.isOnline) { this.startRace(this.selectedTrack); return; }

            this.isReady = !this.isReady;
            window.Sfx.click();
            
            if (this.isReady) { this.state = 'WAITING'; window.System.msg("AGUARDANDO..."); } 
            else { this.state = 'LOBBY'; this.autoStartTimer = null; }
            this.syncLobby();
        },

        syncLobby: function() {
            if (this.dbRef) {
                this.dbRef.child('players/' + window.System.playerId).update({
                    charId: this.selectedChar,
                    trackId: this.selectedTrack,
                    ready: this.isReady,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },

        startRace: function(trackId) {
            if (this.state === 'RACE') return;
            this.state = 'RACE';
            this.buildTrack(trackId); 
            nitroBtn.style.display = 'flex';
            window.System.msg("VAI! VAI! VAI!");
            window.Sfx.play(600, 'square', 0.5, 0.2);
            window.System.canvas.onclick = null;
        },

        update: function(ctx, w, h, pose) {
            try {
                if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
                if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
                if (!segments || segments.length === 0) return 0;
                
                this.updatePhysics(w, h, pose);
                this.renderWorld(ctx, w, h);
                this.renderUI(ctx, w, h);
                
                if (this.isOnline) this.syncMultiplayer();
                return Math.floor(this.score);
            } catch (err) {
                console.error("Erro recuperado:", err);
                return 0;
            }
        },

        syncMultiplayer: function() {
            if (Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.pos),
                    x: this.playerX,
                    lap: this.lap,
                    steer: this.steer,
                    spinAngle: this.spinAngle, // Sincroniza o giro
                    charId: this.selectedChar,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },

        updatePhysics: function(w, h, pose) {
            const d = Logic;
            const charStats = CHARACTERS[this.selectedChar];

            if (!Number.isFinite(d.speed)) d.speed = 0;
            if (!Number.isFinite(d.pos)) d.pos = 0;
            
            // --- DETECÇÃO DE MÃOS ---
            let detected = 0;
            let pLeft = null, pRight = null;
            let nose = null;

            if (d.state === 'RACE' && pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const n  = pose.keypoints.find(k => k.name === 'nose');

                // Mapeamento simples
                const mapPoint = (pt) => {
                    let nx = pt.x;
                    let ny = pt.y;
                    if (nx > 1) nx = nx / 640; 
                    if (ny > 1) ny = ny / 480;
                    return { x: (1 - nx) * w, y: ny * h };
                };

                if (lw && lw.score > 0.15) { pLeft = mapPoint(lw); detected++; }
                if (rw && rw.score > 0.15) { pRight = mapPoint(rw); detected++; }
                if (n && n.score > 0.15) { nose = mapPoint(n); }

                // TURBO GESTUAL
                if (detected === 2 && nose) {
                    const isHandsHigh = (pLeft.y < nose.y && pRight.y < nose.y);
                    d.virtualWheel.isHigh = isHandsHigh;

                    if (isHandsHigh) {
                         d.gestureTimer++;
                         if (d.gestureTimer > 15 && d.nitro > 5) { 
                             d.turboLock = true; 
                             d.boostTimer = 60;
                             window.System.msg("TURBO GESTUAL!"); 
                         }
                    } else { 
                        d.gestureTimer = 0; 
                    }
                } else {
                    d.virtualWheel.isHigh = false;
                }
            }

            // VOLANTE E INPUT
            if (detected === 2) {
                d.inputState = 2; // DETECTOU MÃOS!
                const dx = pRight.x - pLeft.x; 
                const dy = pRight.y - pLeft.y;
                const rawAngle = Math.atan2(dy, dx);
                d.targetSteer = (Math.abs(rawAngle) > 0.05) ? rawAngle * 2.5 : 0;
                
                d.virtualWheel.x = (pLeft.x + pRight.x) / 2; 
                d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                d.virtualWheel.r = Math.max(40, Math.hypot(dx, dy) / 2); 
                d.virtualWheel.opacity = 1.0; 
            } else {
                d.inputState = 0; // SEM MÃOS
                d.targetSteer = 0; 
                d.virtualWheel.isHigh = false;
                
                d.virtualWheel.x += ((w / 2) - d.virtualWheel.x) * 0.1;
                d.virtualWheel.y += ((h * 0.75) - d.virtualWheel.y) * 0.1;
                d.virtualWheel.r = 60;
                d.virtualWheel.opacity += (0.3 - d.virtualWheel.opacity) * 0.1;
            }
            
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // Se estiver rodando, perde controle
            if (d.spinTimer > 0) {
                d.targetSteer = 0;
                d.steer = 0;
            }

            d.steer += (d.targetSteer - d.steer) * CONF.FRICTION;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            // --- LÓGICA DE ACELERAÇÃO ---
            let currentMax = CONF.MAX_SPEED * charStats.speedInfo;
            if (d.boostTimer > 0) { 
                currentMax = CONF.TURBO_MAX_SPEED; 
                d.boostTimer--; 
                d.nitro = Math.max(0, d.nitro - 0.2);
            } else { 
                d.nitro = Math.min(100, d.nitro + 0.08); 
                d.turboLock = false;
            }

            const hasGas = (d.inputState > 0 || d.boostTimer > 0 || d.state === 'RACE'); 
            
            if (hasGas && d.state === 'RACE' && d.spinTimer <= 0) {
                d.speed += (currentMax - d.speed) * 0.05;
            } else {
                d.speed *= CONF.FRICTION; // FREIA SE SOLTAR
            }

            const absX = Math.abs(d.playerX);

            // === OFF-ROAD (Punição severa) ===
            if (absX > 2.0) {
                d.speed *= CONF.OFFROAD_DECEL; // Reduz velocidade rápido
                d.playerX += (Math.random() - 0.5) * 0.1; // Trepida
                d.bounce = (Math.random() - 0.5) * 10;
            } else {
                d.bounce *= 0.5;
            }

            // Movimento Lateral & Curvas
            const segIdx = Math.floor(d.pos / CONF.SEGMENT_LENGTH);
            const seg = getSegment(segIdx);
            
            // Força centrífuga: Joga para fora da curva
            // Para não cair, o player tem que virar PARA a curva
            const centrifugal = -seg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL_FORCE;
            const steerPower = 0.18 * charStats.turnInfo;

            d.playerX += (d.steer * steerPower * speedRatio) + centrifugal;

            // Limite da pista (Muros invisíveis com perda de velocidade)
            if(d.playerX < -3.5) { d.playerX = -3.5; d.speed *= 0.9; }
            if(d.playerX > 3.5)  { d.playerX = 3.5;  d.speed *= 0.9; }

            // COLISÕES COM OBSTÁCULOS
            seg.obs.forEach(o => {
                if(o.x < 10 && Math.abs(d.playerX - o.x) < 0.6 && Math.abs(d.playerX) < 3.0) {
                    // Batida!
                    d.speed *= 0.4; // Perde muita velocidade
                    o.x = 999; 
                    d.spinTimer = 40; // Gira por 40 frames
                    window.Sfx.crash(); 
                    window.Gfx.shakeScreen(20);
                }
            });

            // SPIN LOGIC
            if (d.spinTimer > 0) {
                d.spinTimer--;
                d.spinAngle += 30;
                d.speed *= 0.95; // Freia enquanto gira
                if (d.spinTimer <= 0) d.spinAngle = 0;
            }

            d.pos += d.speed;
            if (d.pos >= trackLength) {
                d.pos -= trackLength; d.lap++;
                if (d.lap <= d.totalLaps) { lapPopupText = `VOLTA ${d.lap}/${d.totalLaps}`; lapPopupTimer = 120; window.System.msg(lapPopupText); }
                if(d.lap > d.totalLaps && d.state === 'RACE') { d.state = 'FINISHED'; window.System.msg(d.rank === 1 ? "VITÓRIA!" : "FIM!"); }
            }
            if (d.pos < 0) d.pos += trackLength;

            // RIVAIS
            let pAhead = 0;
            d.rivals.forEach(r => {
                if (r.isRemote) {
                    r.pos += r.speed; 
                    if(r.pos >= trackLength) { r.pos -= trackLength; r.lap++; }
                } else {
                    let dist = r.pos - d.pos;
                    if(dist > trackLength/2) dist -= trackLength; if(dist < -trackLength/2) dist += trackLength;
                    let targetS = CONF.MAX_SPEED * 0.9;
                    if (r.spinTimer > 0) {
                        r.speed *= 0.9; r.spinTimer--; r.spinAngle = (r.spinAngle||0) + 30;
                    } else {
                        r.speed += (targetS - r.speed) * (r.aggro || 0.05);
                        r.spinAngle = 0;
                    }
                    r.pos += r.speed;
                    if(r.pos >= trackLength) { r.pos -= trackLength; r.lap++; }
                    
                    const rSeg = getSegment(Math.floor(r.pos/CONF.SEGMENT_LENGTH));
                    r.x += (-(rSeg.curve * 0.4) - r.x) * 0.05;
                }
                
                let playerTotalDist = d.pos + (d.lap * trackLength);
                let rivalTotalDist = r.pos + ((r.lap||1) * trackLength);
                if (rivalTotalDist > playerTotalDist) pAhead++;
            });
            d.rank = 1 + pAhead;

            d.time++; d.score += d.speed * 0.01;
            
            // Visual Tilt (Câmera) - Clampado para não tombar
            let targetTilt = (d.steer * 10) + (seg.curve * 5);
            targetTilt = Math.max(-20, Math.min(20, targetTilt)); // Limita inclinação visual
            d.visualTilt += (targetTilt - d.visualTilt) * 0.1;

            if (d.state === 'FINISHED') {
                d.speed *= 0.95;
                if(d.speed < 2 && d.finishTimer === 0) { d.finishTimer = 1; setTimeout(()=> window.System.gameOver(Math.floor(d.score)), 2000); }
            }
        },

        renderWorld: function(ctx, w, h) {
            const d = Logic; const cx = w / 2; const horizon = h * 0.45; // Horizonte mais alto (estilo Horizon)
            const currentSegIndex = Math.floor(d.pos / CONF.SEGMENT_LENGTH);
            const isOffRoad = Math.abs(d.playerX) > 2.0;

            const skyGrads = [['#3388ff', '#88ccff'], ['#e67e22', '#f1c40f'], ['#0984e3', '#74b9ff']];
            const currentSky = skyGrads[d.skyColor] || skyGrads[0];
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, currentSky[0]); gradSky.addColorStop(1, currentSky[1]);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            const bgOffset = (getSegment(currentSegIndex).curve * 30) + (d.steer * 20);
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; 
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) { ctx.lineTo((w/12 * i) - (bgOffset * 0.5), horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40); }
            ctx.lineTo(w, horizon); ctx.fill();

            const trackTheme = TRACKS[d.selectedTrack].colors || { grassLight:'#55aa44', grassDark:'#448833', roadLight:'#666', roadDark:'#555' };
            ctx.fillStyle = isOffRoad ? trackTheme.grassDark : trackTheme.grassLight; 
            ctx.fillRect(0, horizon, w, h-horizon);

            let dx = 0; let camX = d.playerX * (CONF.ROAD_WIDTH); // Usando largura real
            let camH = CONF.CAMERA_HEIGHT + d.bounce;
            let segmentCoords = [];

            // 1. DESENHA A ESTRADA (FUNDO P/ FRENTE)
            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = currentSegIndex + n;
                const seg = getSegment(segIdx);
                
                dx += (seg.curve * 1.5); // Curvas mais acentuadas visualmente
                const z = n * CONF.SEGMENT_LENGTH;
                
                // Projeção 3D Clássica
                const scale = CONF.CAMERA_DEPTH / (z || 1); // Evita div/0
                const scaleNext = CONF.CAMERA_DEPTH / ((z + CONF.SEGMENT_LENGTH) || 1);
                
                const screenY = horizon + (scale * camH);
                const screenYNext = horizon + (scaleNext * camH);
                
                // X position
                const screenX = cx - (camX * scale) - (dx * scale * z * 0.001); // Curva baseada em Z
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*1.5) * scaleNext * (z+200) * 0.001);
                
                // Oclusão
                if (screenY >= screenYNext) {
                    segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx });

                    const isDark = (Math.floor(segIdx / CONF.RUMBLE_LENGTH) % 2) === 0;
                    const roadW = CONF.ROAD_WIDTH * scale;
                    const roadWNext = CONF.ROAD_WIDTH * scaleNext;

                    // Grama
                    ctx.fillStyle = isDark ? trackTheme.grassDark : trackTheme.grassLight;
                    ctx.fillRect(0, screenYNext, w, screenY - screenYNext);

                    // Zebra (Rumble)
                    const rumbleW = roadW * 1.2;
                    const rumbleWNext = roadWNext * 1.2;
                    ctx.fillStyle = isDark ? '#fff' : '#c0392b';
                    ctx.beginPath();
                    ctx.moveTo(screenX - rumbleW, screenY); ctx.lineTo(screenX + rumbleW, screenY);
                    ctx.lineTo(screenXNext + rumbleWNext, screenYNext); ctx.lineTo(screenXNext - rumbleWNext, screenYNext);
                    ctx.fill();

                    // Estrada
                    ctx.fillStyle = isDark ? trackTheme.roadDark : trackTheme.roadLight;
                    ctx.beginPath();
                    ctx.moveTo(screenX - roadW, screenY); ctx.lineTo(screenX + roadW, screenY);
                    ctx.lineTo(screenXNext + roadWNext, screenYNext); ctx.lineTo(screenXNext - roadWNext, screenYNext);
                    ctx.fill();
                    
                    // Faixa
                    if (isDark) {
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(screenX - roadW*0.02, screenYNext, roadW*0.04, screenY - screenYNext);
                    }
                }
            }

            // 2. DESENHA OBJETOS E RIVAIS (TRAS P/ FRENTE)
            for(let n = CONF.DRAW_DISTANCE - 1; n >= 0; n--) {
                const coord = segmentCoords[n]; 
                if (!coord) continue;
                const seg = getSegment(coord.index);

                d.rivals.forEach(r => {
                    let rRelPos = r.pos - d.pos; 
                    if(rRelPos < -trackLength/2) rRelPos += trackLength; 
                    if(rRelPos > trackLength/2) rRelPos -= trackLength;

                    if (Math.abs(Math.floor(rRelPos / CONF.SEGMENT_LENGTH) - n) < 2.0 && n > 0) {
                        const rScale = coord.scale * w * 0.003;
                        const rx = coord.x + (r.x * CONF.ROAD_WIDTH * coord.scale);
                        this.drawKartSprite(ctx, rx, coord.y, rScale, 0, 0, r, r.color, true);
                    }
                });

                seg.obs.forEach(o => {
                    if (o.x > 500) return;
                    const sX = coord.x + (o.x * CONF.ROAD_WIDTH * coord.scale); 
                    const size = (w * 0.15) * coord.scale * 1000; // Normalizando escala
                    if (o.type === 'cone') { 
                        ctx.fillStyle = '#ff5500'; ctx.beginPath(); 
                        ctx.moveTo(sX, coord.y - size); ctx.lineTo(sX - size*0.3, coord.y); ctx.lineTo(sX + size*0.3, coord.y); 
                        ctx.fill(); 
                    }
                });
            }
            
            const playerColor = CHARACTERS[d.selectedChar].color;
            // Desenha Player com Spin
            const playerSpin = d.spinAngle * (Math.PI / 180);
            this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, w * 0.003, d.steer, d.visualTilt + playerSpin, d, playerColor, false);
            
            particles.forEach((p, i) => { 
                p.x += p.vx; p.y += p.vy; p.l--; 
                if(p.l<=0) particles.splice(i,1); 
                else { ctx.fillStyle=p.c; ctx.globalAlpha = p.l / 50; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; } 
            });
        },

        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, d, color, isRival) {
            ctx.save(); 
            ctx.translate(cx, y); 
            ctx.scale(carScale * 250, carScale * 250); // Ajuste de escala para o novo sistema
            
            // Limitando o Tilt visual para não "tombar"
            const limitedTilt = Math.max(-0.5, Math.min(0.5, tilt * 0.05));
            ctx.rotate(limitedTilt);
            
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0); 
            gradBody.addColorStop(0, color); gradBody.addColorStop(0.5, '#fff'); gradBody.addColorStop(1, color);
            ctx.fillStyle = gradBody; 
            // Carro mais robusto
            ctx.beginPath(); ctx.moveTo(-30, -25); ctx.lineTo(30, -25); ctx.lineTo(45, 15); ctx.lineTo(15, 40); ctx.lineTo(-15, 40); ctx.lineTo(-45, 15); ctx.fill();
            
            if (d.boostTimer > 0) { 
                ctx.fillStyle = '#00ffff'; 
                ctx.beginPath(); ctx.arc(-20, -30, 15, 0, Math.PI*2); 
                ctx.arc(20, -30, 15, 0, Math.PI*2); ctx.fill(); 
            }
            
            const wheelAngle = steer * 0.8; 
            const dw = (wx, wy) => { 
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); 
                ctx.fillStyle = '#111'; ctx.fillRect(-12, -15, 24, 30); 
                ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); 
                ctx.restore(); 
            };
            dw(-50, 20); dw(50, 20); ctx.fillStyle='#111'; ctx.fillRect(-55, -25, 22, 35); ctx.fillRect(33, -25, 22, 35);
            
            // Capacete
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 20, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = '#333'; ctx.fillRect(-15, -25, 30, 8); 
            
            if (isRival) {
                ctx.fillStyle = '#0f0'; ctx.font='bold 14px Arial'; ctx.textAlign='center'; ctx.fillText(d.name || 'P2', 0, -45);
            }
            ctx.restore(); 
            
            ctx.restore(); 
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("ESCOLHA O MODO DE JOGO", w/2, h * 0.2);

            ctx.fillStyle = "#e67e22"; ctx.fillRect(w/2 - 200, h * 0.35, 400, 80);
            ctx.fillStyle = "white"; ctx.font = "bold 30px sans-serif";
            ctx.fillText("JOGAR SOZINHO (OFFLINE)", w/2, h * 0.35 + 50);

            ctx.fillStyle = "#27ae60"; ctx.fillRect(w/2 - 200, h * 0.55, 400, 80);
            ctx.fillStyle = "white";
            ctx.fillText("MULTIPLAYER (ONLINE)", w/2, h * 0.55 + 50);
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("LOBBY DA CORRIDA", w/2, 60);

            const c = CHARACTERS[this.selectedChar];
            ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "white"; ctx.font = "bold 30px sans-serif";
            ctx.fillText(c.name, w/2, h*0.3 + 100);
            
            const t = TRACKS[this.selectedTrack];
            ctx.fillStyle = "#34495e"; ctx.fillRect(w/2 - 150, h*0.55, 300, 60);
            ctx.fillStyle = "#ecf0f1"; ctx.fillText("PISTA: " + t.name, w/2, h*0.55 + 40);

            let btnText = "PRONTO (TOQUE P/ INICIAR)";
            let btnColor = "#e67e22";

            if (this.state === 'WAITING') {
                btnText = "AGUARDANDO...";
                if (this.autoStartTimer) {
                    const timeLeft = Math.ceil((this.autoStartTimer - Date.now()) / 1000);
                    btnText = `INICIANDO EM ${timeLeft}s...`;
                }
            } else if (this.state === 'LOBBY') {
                btnColor = "#27ae60";
            }

            ctx.fillStyle = btnColor; ctx.fillRect(w/2 - 200, h*0.8, 400, 70);
            ctx.fillStyle = "white"; ctx.font = "bold 25px 'Russo One'"; ctx.fillText(btnText, w/2, h*0.8 + 45);

            ctx.textAlign = "left"; ctx.font = "14px monospace"; ctx.fillStyle = "#bdc3c7";
            const onlineStatus = this.isOnline ? `Online (${this.rivals.length + 1})` : "Offline (Local)";
            ctx.fillText(`Jogadores: ${onlineStatus}`, 20, h - 20);
        },

        renderUI: function(ctx, w, h) {
            const d = Logic;
            if (d.state === 'RACE') {
                if (lapPopupTimer > 0) { 
                    ctx.save(); ctx.globalAlpha = Math.min(1, lapPopupTimer / 30); 
                    ctx.fillStyle = '#00ffff'; ctx.font = "bold 48px 'Russo One'"; ctx.textAlign = 'center'; 
                    ctx.fillText(lapPopupText, w / 2, h * 0.45); ctx.restore(); lapPopupTimer--; 
                }
                
                const hudX = w - 80; const hudY = h - 60; 
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI * 2); ctx.fill();
                const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED); 
                ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + Math.PI * rpm); 
                ctx.lineWidth = 6; ctx.strokeStyle = (d.turboLock || d.boostTimer > 0) ? '#00ffff' : '#ff3300'; ctx.stroke();
                
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
                ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
                ctx.font = "bold 18px 'Russo One'"; ctx.fillText(`${d.rank} / ${d.rivals.length + 1}`, hudX, hudY + 42);
                
                const nW = 220; ctx.fillStyle = '#111'; ctx.fillRect(w / 2 - nW / 2, 20, nW, 20); 
                ctx.fillStyle = d.boostTimer > 0 ? '#00ffff' : (d.nitro > 20 ? '#00aa00' : '#ff3300'); 
                ctx.fillRect(w / 2 - nW / 2 + 2, 22, (nW - 4) * (d.nitro / 100), 16);

                if (minimapPoints.length > 0) {
                    const mapSize = 130; const mapX = 25; const mapY = 95; ctx.save();
                    ctx.fillStyle = 'rgba(10, 25, 40, 0.8)'; ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; 
                    ctx.fillRect(mapX - 5, mapY - 5, mapSize + 10, mapSize + 10); 
                    ctx.strokeRect(mapX - 5, mapY - 5, mapSize + 10, mapSize + 10);
                    
                    ctx.beginPath(); ctx.rect(mapX, mapY, mapSize, mapSize); ctx.clip();
                    const b = minimapPoints.reduce((acc, p) => ({ minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x), minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
                    const s = Math.min(mapSize / (b.maxX - b.minX), mapSize / (b.maxY - b.minY)) * 0.85;
                    
                    ctx.translate(mapX + mapSize / 2, mapY + mapSize / 2); ctx.scale(s, s); 
                    ctx.rotate(-getSegment(Math.floor(d.pos / CONF.SEGMENT_LENGTH)).curve * 0.7);
                    ctx.translate(-(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2); 
                    
                    ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 4; ctx.beginPath();
                    minimapPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
                    
                    const pi = Math.floor((d.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(minimapPoints[pi].x, minimapPoints[pi].y, 6, 0, Math.PI * 2); ctx.fill();
                    
                    d.rivals.forEach(r => { 
                        let rIdx = Math.floor((r.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                        if(minimapPoints[rIdx]) {
                            ctx.fillStyle = r.color; ctx.beginPath(); 
                            ctx.arc(minimapPoints[rIdx].x, minimapPoints[rIdx].y, 4, 0, Math.PI * 2); ctx.fill(); 
                        }
                    });
                    ctx.restore();
                }

                if (d.virtualWheel.opacity > 0.01) {
                    const vw = d.virtualWheel; 
                    ctx.save(); 
                    ctx.globalAlpha = vw.opacity; 
                    ctx.translate(vw.x, vw.y);
                    
                    if (vw.isHigh) {
                        ctx.shadowBlur = 25;
                        ctx.shadowColor = '#00ffff';
                    } else {
                        ctx.shadowBlur = 0;
                    }

                    // FIX CRÍTICO AQUI: Garantir que o raio nunca seja negativo
                    const safeR = Math.max(0, vw.r);
                    const safeInnerR = Math.max(0, vw.r - 8);

                    ctx.lineWidth = 8; ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, safeR, 0, Math.PI * 2); ctx.stroke();
                    ctx.lineWidth = 4; ctx.strokeStyle = '#00ffff'; ctx.beginPath(); ctx.arc(0, 0, safeInnerR, 0, Math.PI * 2); ctx.stroke();
                    ctx.rotate(d.steer * 1.4); 
                    ctx.fillStyle = '#ff3300'; ctx.beginPath(); ctx.fillRect(-4, -safeR + 10, 8, 22);
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); 
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                ctx.fillText(d.rank === 1 ? "VITÓRIA!" : `${d.rank}º LUGAR`, w / 2, h * 0.3);
            }
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart GP', '🏎️', Logic, {
            camOpacity: 0.1, 
            showWheel: true 
        });
    }
})()
