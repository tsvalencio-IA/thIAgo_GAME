// =============================================================================
// KART DO OTTO – HORIZON ARCADE EDITION (V21)
// ARQUITETO: ESPECIALISTA 177
// DATA: 2025 - VISUAL "HORIZON", FÍSICA DE GRIP, CÂMERA ESTÁVEL
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES VISUAIS E DE GAMEPLAY
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO', color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0, grip: 1.0 },     // Vermelho Ferrari
        { id: 1, name: 'THIAGO', color: '#f1c40f', speedInfo: 1.08, turnInfo: 0.85, grip: 0.95 }, // Amarelo Lambo
        { id: 2, name: 'THAMIS', color: '#3498db', speedInfo: 0.95, turnInfo: 1.15, grip: 1.05 }  // Azul Subaru
    ];

    // Temas estilo Horizon Chase
    const TRACKS = [
        { 
            id: 0, name: 'CALIFORNIA SUNSET', theme: 'california', 
            colors: { sky: ['#00B4DB', '#0083B0'], grass: '#6ab04c', grassDark: '#569e3d', road: '#555', roadDark: '#4e4e4e', rumble: '#c0392b', rumble2: '#ecf0f1' },
            curveMult: 1.0 
        },
        { 
            id: 1, name: 'DESERTO DO ATACAMA', theme: 'desert', 
            colors: { sky: ['#F2994A', '#F2C94C'], grass: '#e67e22', grassDark: '#d35400', road: '#7f8c8d', roadDark: '#707b7c', rumble: '#8e44ad', rumble2: '#f1c40f' },
            curveMult: 0.8 
        },
        { 
            id: 2, name: 'NEO TOKYO NIGHT', theme: 'city', 
            colors: { sky: ['#0f0c29', '#302b63'], grass: '#240b36', grassDark: '#1a0526', road: '#2c3e50', roadDark: '#1a252f', rumble: '#00d2ff', rumble2: '#3a7bd5' },
            curveMult: 1.3 
        }
    ];

    const CONF = {
        // Física Arcade (Grip > Realismo)
        ACCEL: 2.0,            // Aceleração mais rápida
        BRAKING: 4.0,
        MAX_SPEED: 260,        // Sensação de velocidade maior
        TURBO_MAX_SPEED: 360,
        DECEL_OFFROAD: 0.92,   // Punição suave, não para o carro
        DECEL_FREE: 0.98,
        
        // Curvas
        CENTRIFUGAL: 0.18,     // Reduzido (era 0.35) para o carro não "escorregar" tanto
        TURN_SPEED: 2.2,       // O carro vira mais rápido

        // Câmera (Horizon Style)
        CAMERA_HEIGHT: 1800,   // Mais alta para ver a pista
        CAMERA_DEPTH: 0.7,     // FOV ajustado
        ROAD_WIDTH: 2200,      // Pista mais larga
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 500,    // Ver longe no horizonte
        RUMBLE_LENGTH: 3
    };

    // Estado Global
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, RACE, FINISHED
        roomId: 'room_kart_horizon',
        
        selectedChar: 0,
        selectedTrack: 0,
        
        // Multiplayer
        isOnline: false,
        isReady: false,
        dbRef: null,
        lastSync: 0,
        rivals: [],

        // Física
        speed: 0,
        pos: 0,
        playerX: 0,       
        steer: 0,         
        targetSteer: 0,
        
        // Mecânicas
        nitro: 100,
        boostTimer: 0,
        spinTimer: 0,     
        spinAngle: 0,
        
        // Progressão
        lap: 1, totalLaps: 3, time: 0, rank: 1, score: 0, combo: 1,
        
        // Visual
        visualTilt: 0,    
        bounce: 0,
        
        // Input
        inputState: 0,    
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        
        // Pista
        segments: [],
        trackLength: 0,
        buttons: [],

        // =================================================================
        // CICLO DE VIDA
        // =================================================================
        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.setupInput();
            this.resetPhysics();
            window.System.msg("HORIZON KART");
        },

        cleanup: function() {
            if(this.dbRef) try { this.dbRef.off(); } catch(e){}
            const btn = document.getElementById('nitro-btn-kart');
            if(btn) btn.remove();
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.nitro = 100; this.boostTimer = 0; this.spinTimer = 0; this.spinAngle = 0;
            this.lap = 1; this.score = 0; this.combo = 1;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        setupInput: function() {
            let nBtn = document.getElementById('nitro-btn-kart');
            if(!nBtn) {
                nBtn = document.createElement('div');
                nBtn.id = 'nitro-btn-kart';
                nBtn.innerText = "N";
                Object.assign(nBtn.style, {
                    position: 'absolute', top: '45%', right: '20px', width: '80px', height: '80px',
                    borderRadius: '12px', background: 'linear-gradient(to bottom, #f1c40f, #e67e22)', 
                    borderBottom: '6px solid #d35400', color: '#fff', display: 'none', 
                    alignItems: 'center', justifyContent: 'center', fontFamily: 'Russo One', 
                    fontSize: '30px', zIndex: '100', cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)', userSelect: 'none', transform: 'scale(1)'
                });
                document.getElementById('game-ui').appendChild(nBtn);
                
                const activateNitro = (e) => {
                    if(e) { e.preventDefault(); e.stopPropagation(); }
                    if(this.state === 'RACE' && this.nitro > 25) {
                        this.activateBoost(60); 
                        this.nitro -= 25;
                        window.Sfx.play(800, 'sawtooth', 0.3, 0.2);
                        // Animação do botão
                        nBtn.style.transform = 'scale(0.9)';
                        setTimeout(()=>nBtn.style.transform = 'scale(1)', 100);
                    }
                };
                nBtn.addEventListener('mousedown', activateNitro);
                nBtn.addEventListener('touchstart', activateNitro, {passive:false});
            }

            // Handler de Clique (Corrigido para todas as resoluções)
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const scaleX = window.System.canvas.width / rect.width;
                const scaleY = window.System.canvas.height / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;
                this.handleClick(clickX, clickY);
            };
        },

        handleClick: function(x, y) {
            // UI Buttons
            for(let b of this.buttons) {
                if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                    window.Sfx.click();
                    b.action();
                    return;
                }
            }
            // Mobile Steering Fallback
            if (this.state === 'RACE') {
                const w = window.System.canvas.width;
                if (x < w * 0.4) this.targetSteer = -1;
                else if (x > w * 0.6) this.targetSteer = 1;
                else this.targetSteer = 0;
            }
        },

        // =================================================================
        // LÓGICA DE JOGO
        // =================================================================
        update: function(ctx, w, h, pose) {
            this.buttons = []; // Reset UI hitboxes

            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            if (this.segments.length === 0) return 0;

            this.processInput(w, h, pose);
            this.updatePhysics();
            this.updateAI();
            
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline) this.syncNetwork();

            return Math.floor(this.score);
        },

        processInput: function(w, h, pose) {
            if (this.spinTimer > 0) return; // Sem controle durante crash

            let handsFound = false;
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    handsFound = true;
                    // Mapeamento corrigido
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;
                    
                    const dx = rx - lx;
                    const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = Math.max(-1.5, Math.min(1.5, angle * 2.5)); // Mais sensível
                    if (Math.abs(this.targetSteer) < 0.15) this.targetSteer = 0; // Deadzone
                    
                    this.virtualWheel.x = (lx+rx)/2; this.virtualWheel.y = (ly+ry)/2;
                    this.virtualWheel.r = Math.max(40, Math.hypot(dx,dy)/2);
                    this.virtualWheel.opacity = 1.0;
                }
            }

            if (!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                if (Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.85; // Auto-center mais rápido
                else this.targetSteer = 0;
            }

            this.steer += (this.targetSteer - this.steer) * 0.25; // Resposta mais ágil
        },

        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const track = TRACKS[this.selectedTrack];
            
            // 1. Velocidade
            let maxS = (this.boostTimer > 0 ? CONF.TURBO_MAX_SPEED : CONF.MAX_SPEED) * char.speedInfo;
            
            // Offroad não mata o jogo, só reduz
            if (Math.abs(this.playerX) > 2.2) {
                maxS *= 0.6; 
                this.speed *= CONF.DECEL_OFFROAD;
                this.bounce = Math.sin(this.time * 0.5) * 5;
            } else {
                this.bounce *= 0.6;
            }

            // Spin (Crash)
            if (this.spinTimer > 0) {
                this.speed *= 0.95; 
                this.spinAngle += 25; 
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                // Aceleração Arcade
                if (this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= CONF.DECEL_FREE;
            }

            // 2. Curvas (Lógica Corrigida para não "Tombar")
            const currentSeg = this.getSegment(this.pos);
            const speedRatio = (this.speed / CONF.MAX_SPEED);
            
            // Centrifuga reduzida para permitir fazer a curva
            const centrifugal = -currentSeg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL;
            
            // Força de virada aumentada
            const turnForce = this.steer * speedRatio * CONF.TURN_SPEED * char.turnInfo;

            this.playerX += (turnForce + centrifugal);
            
            // Clamp PlayerX (Não sai do universo)
            if (this.playerX < -4) { this.playerX = -4; this.speed *= 0.9; }
            if (this.playerX > 4) { this.playerX = 4; this.speed *= 0.9; }

            // 3. Movimento
            this.pos += this.speed;
            while (this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if (this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while (this.pos < 0) this.pos += this.trackLength;

            // 4. Tilt Visual (Apenas estético, não afeta a câmera física)
            const targetTilt = (this.steer * 20) + (currentSeg.curve * 10);
            this.visualTilt += (targetTilt - this.visualTilt) * 0.1;

            if (this.boostTimer > 0) this.boostTimer--;
            if (this.nitro < 100) this.nitro += 0.08;
            this.time++;

            // Obstáculos
            for(let obs of currentSeg.obs) {
                if (Math.abs(this.playerX - obs.x) < 0.8) {
                    this.triggerCrash();
                    obs.x = 999; 
                }
            }
        },

        updateAI: function() {
            let rankCounter = 1;
            this.rivals.forEach(r => {
                if (!r.isRemote) {
                    const rSeg = this.getSegment(r.pos);
                    // AI segue a linha ótima
                    const targetX = rSeg.curve * -0.3; 
                    r.x += (targetX - r.x) * 0.08;
                    
                    let targetS = CONF.MAX_SPEED * 0.92;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    r.pos += r.speed;
                    if(r.pos >= this.trackLength) { r.pos -= this.trackLength; r.lap++; }

                    // Colisão Simples
                    const distZ = Math.abs(r.pos - this.pos);
                    const distX = Math.abs(r.x - this.playerX);
                    if ((distZ < 400 || Math.abs(distZ - this.trackLength) < 400) && distX < 0.8 && this.spinTimer <= 0) {
                        this.triggerCrash();
                    }
                }
                // Rank
                const myTotal = (this.lap * this.trackLength) + this.pos;
                const rTotal = ((r.lap||1) * this.trackLength) + r.pos;
                if (rTotal > myTotal) rankCounter++;
            });
            this.rank = rankCounter;
        },

        triggerCrash: function() {
            this.spinTimer = 30; // Meio segundo de spin
            this.speed *= 0.6;   // Punição de velocidade
            window.Sfx.crash();
            window.Gfx.shakeScreen(15);
            window.System.msg("CRASH!");
        },

        activateBoost: function(frames) {
            this.boostTimer = frames;
            this.speed += 40; 
            window.Gfx.shakeScreen(5);
        },

        getSegment: function(position) {
            const idx = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[idx];
        },

        finishRace: function() {
            this.state = 'FINISHED';
            window.System.msg(this.rank === 1 ? "VITÓRIA!" : `${this.rank}º LUGAR`);
            document.getElementById('nitro-btn-kart').style.display = 'none';
            setTimeout(() => window.System.gameOver(Math.floor(this.score + (this.rank===1 ? 5000:0))), 3000);
        },

        // =================================================================
        // RENDERIZAÇÃO ESTILO HORIZON CHASE
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const trackTheme = TRACKS[this.selectedTrack].colors;
            const cx = w / 2;
            const horizon = h * 0.40; // Horizonte mais alto
            
            // 1. Céu (Gradiente Rico)
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, trackTheme.sky[0]); 
            skyGrad.addColorStop(1, trackTheme.sky[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,horizon);

            // Montanhas/Fundo (Parallax Simples)
            const bgOffset = (this.getSegment(this.pos).curve * 10) + (this.steer * 20);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<10; i++) {
                const mx = (w/10 * i) - (bgOffset * 0.5);
                ctx.lineTo(mx, horizon - 50 - (i%2==0?30:0));
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão Base
            ctx.fillStyle = trackTheme.grass;
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. Loop de Projeção (Horizonte -> Jogador)
            // Desenhamos apenas o necessário para performance
            const basePos = this.pos;
            const startSegIdx = Math.floor(basePos / CONF.SEGMENT_LENGTH);
            const camH = CONF.CAMERA_HEIGHT + this.bounce;
            const camZ = basePos;
            const camX = this.playerX * CONF.ROAD_WIDTH;

            let maxy = h;
            let x = 0, dx = 0;

            // Pre-calculate curves
            const baseSeg = this.getSegment(basePos);
            const basePercent = (basePos % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            dx = -(baseSeg.curve * basePercent);
            
            let sprites = []; // Fila de objetos para desenhar depois

            for (let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = (startSegIdx + n) % this.segments.length;
                const seg = this.segments[segIdx];
                
                // Z Buffer Zimplificado
                const segmentZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (basePos % CONF.SEGMENT_LENGTH));
                const scale = CONF.CAMERA_DEPTH / segmentZ;
                
                // Projeção Y (Mundo -> Tela)
                const projY = (1 - scale * (0 - camH) / 1000) * (h/2) + (horizon - (h/2)); // Ajuste fino de perspectiva
                // Simplificação robusta para evitar contas complexas:
                // Y = Horizon + (CamHeight / Z * ScaleFactor)
                const screenY = horizon + (camH * scale);

                // Oclusão
                if (screenY >= maxy) {
                    // Pula render da estrada, mas continua calculando X para sprites futuros?
                    // Não, em pseudo-3D, se o chão cobriu, acabou.
                    // Mas precisamos acumular a curva.
                    x += dx; dx += seg.curve;
                    continue; 
                }

                // Projeção X
                x += dx;
                dx += seg.curve;
                const curveOffset = x * 200; // Intensidade visual da curva
                const screenX = cx - (camX * scale) - (curveOffset * scale);
                const screenW = CONF.ROAD_WIDTH * scale;

                // Desenha o Segmento (Road Strip)
                this.drawSegment(ctx, w, screenX, screenY, screenW, maxy, segIdx, trackTheme);

                // Coleta Sprites (Rivais e Obstáculos)
                const collectSprite = (obj, type) => {
                    const spriteScale = scale * w * 0.0015;
                    const spriteX = screenX + (obj.x * screenW);
                    const spriteY = screenY;
                    sprites.push({ type, obj, x: spriteX, y: spriteY, scale: spriteScale, dist: segmentZ });
                };

                this.rivals.forEach(r => {
                    if (Math.floor(r.pos / CONF.SEGMENT_LENGTH) === segIdx) collectSprite(r, 'kart');
                });
                seg.obs.forEach(o => {
                    if (o.x < 100) collectSprite(o, o.type);
                });

                maxy = screenY; // Novo limite de clip
            }

            // 3. Desenha Sprites (De trás para frente)
            for (let i = sprites.length - 1; i >= 0; i--) {
                this.drawSprite(ctx, sprites[i]);
            }

            // 4. Desenha Jogador
            this.drawPlayer(ctx, w, h);
        },

        drawSegment: function(ctx, w, x, y, width, clipY, idx, theme) {
            if (y >= clipY) return;
            const h = clipY - y;
            const isDark = Math.floor(idx / CONF.RUMBLE_LENGTH) % 2 === 0;

            // Grama
            ctx.fillStyle = isDark ? theme.grassDark : theme.grass;
            ctx.fillRect(0, y, w, h);

            // Zebra (Rumble)
            const rumbleW = width * 1.2;
            ctx.fillStyle = isDark ? theme.rumble : theme.rumble2;
            ctx.fillRect(x - rumbleW, y, rumbleW * 2, h);

            // Estrada
            ctx.fillStyle = isDark ? theme.roadDark : theme.road;
            ctx.fillRect(x - width, y, width * 2, h);

            // Faixa Central
            if (isDark) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - width * 0.05, y, width * 0.1, h);
            }
        },

        drawSprite: function(ctx, s) {
            const size = s.scale * 1000;
            if (s.type === 'cone') {
                ctx.fillStyle = '#e67e22';
                ctx.beginPath();
                ctx.moveTo(s.x, s.y - size);
                ctx.lineTo(s.x - size/2, s.y);
                ctx.lineTo(s.x + size/2, s.y);
                ctx.fill();
            } else if (s.type === 'kart') {
                const r = s.obj;
                this.drawKartAsset(ctx, s.x, s.y, size * 0.0015, 0, 0, r.color, r.spinAngle||0, false);
                // Tag Name
                ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
                ctx.fillText(r.name, s.x, s.y - size - 5);
            }
        },

        drawPlayer: function(ctx, w, h) {
            const scale = w * 0.007; // Kart maior e mais imponente
            const cx = w / 2;
            const cy = h * 0.88 + this.bounce;
            
            // O "Tilt" agora é apenas rotação do sprite, não da tela
            const kartTilt = (this.steer * 0.1) + (this.visualTilt * 0.01) + (this.spinAngle * Math.PI/180);

            this.drawKartAsset(ctx, cx, cy, scale, this.steer, kartTilt, CHARACTERS[this.selectedChar].color, 0, true);
        },

        drawKartAsset: function(ctx, x, y, s, steer, tilt, color, spinRot, isPlayer) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(tilt + (spinRot * Math.PI/180));

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 20, 70, 15, 0, 0, Math.PI*2); ctx.fill();

            // Carroceria "Sport" (Horizon Style)
            ctx.fillStyle = color;
            // Base Larga
            ctx.beginPath();
            ctx.moveTo(-40, -10); ctx.lineTo(40, -10); // Traseira
            ctx.lineTo(45, 20); ctx.lineTo(-45, 20);   // Frente
            ctx.fill();

            // Topo/Cabine
            ctx.fillStyle = '#fff'; // Vidro
            ctx.beginPath();
            ctx.moveTo(-20, -25); ctx.lineTo(20, -25);
            ctx.lineTo(30, -5); ctx.lineTo(-30, -5);
            ctx.fill();
            
            // Aerofólio
            ctx.fillStyle = '#111';
            ctx.fillRect(-42, -25, 84, 8);

            // Lanternas Traseiras (Estilo Cyberpunk/Neon)
            const glow = this.boostTimer > 0 ? '#0ff' : '#f00';
            ctx.fillStyle = glow;
            ctx.fillRect(-35, -12, 20, 6);
            ctx.fillRect(15, -12, 20, 6);

            // Rodas Largas
            const drawWheel = (wx, wy) => {
                ctx.fillStyle = '#222';
                ctx.fillRect(wx-12, wy-15, 24, 30);
                if(this.spinTimer > 0) ctx.fillStyle = '#ffaa00'; // Incandescente no crash
                else ctx.fillStyle = '#555';
                ctx.fillRect(wx-8, wy-8, 16, 16);
            };
            drawWheel(-48, 15); drawWheel(48, 15); // Frente
            drawWheel(-45, -10); drawWheel(45, -10); // Trás

            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            // Velocímetro Minimalista
            const hudX = w - 80; const hudY = 60;
            
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), hudX, hudY);
            ctx.font = "14px Arial";
            ctx.fillText("KM/H", hudX, hudY + 20);

            // Barra de Turbo Vertical
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(w-30, 40, 10, 100);
            ctx.fillStyle = this.boostTimer > 0 ? '#00ffff' : '#f1c40f';
            const barH = (this.nitro/100) * 100;
            ctx.fillRect(w-30, 140 - barH, 10, barH);

            // Posição
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            ctx.font = "italic bold 50px 'Russo One'";
            ctx.fillText(`${this.rank}º`, 20, 60);
            ctx.font = "20px Arial";
            ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 90);

            // Volante Virtual (Se usando webcam)
            if (this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save();
                ctx.translate(vw.x, vw.y);
                ctx.globalAlpha = vw.opacity;
                ctx.rotate(this.targetSteer * 1.5);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0,0,vw.r,0,Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0,-vw.r,8,0,Math.PI*2); ctx.fill();
                ctx.restore();
            }

            // Spin Msg
            if (this.spinTimer > 0) {
                ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center";
                ctx.font = "bold 60px 'Russo One'";
                ctx.fillText("SPIN OUT!", w/2, h/2);
            }
        },

        // =================================================================
        // MENUS E SISTEMAS
        // =================================================================
        renderModeSelect: function(ctx, w, h) {
            // Fundo Gradiente Elegante
            const grad = ctx.createLinearGradient(0,0,0,h);
            grad.addColorStop(0, '#2b5876'); grad.addColorStop(1, '#4e4376');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "italic bold 50px 'Russo One'";
            ctx.fillText("HORIZON KART", w/2, h*0.2);

            // Botões Estilizados
            const btnW = 320; const btnH = 70;
            const drawBtn = (lbl, y, col, act) => {
                const x = w/2 - btnW/2;
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.roundRect(x, y, btnW, btnH, 10); ctx.fill();
                // Brilho
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillRect(x, y, btnW, btnH/2);
                
                ctx.fillStyle = '#fff'; ctx.font = "bold 24px Arial";
                ctx.fillText(lbl, w/2, y + 45);
                this.buttons.push({x,y,w:btnW,h:btnH,action:act});
            };

            drawBtn("JOGO RÁPIDO (SOLO)", h*0.45, '#e67e22', ()=>this.selectMode('SOLO'));
            drawBtn("MULTIPLAYER ONLINE", h*0.60, '#27ae60', ()=>this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#1e272e'; ctx.fillRect(0,0,w,h);

            // Card do Personagem
            const char = CHARACTERS[this.selectedChar];
            const trk = TRACKS[this.selectedTrack];

            ctx.fillStyle = char.color;
            ctx.beginPath(); ctx.arc(w/2, h*0.25, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 30px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.25 + 90);

            // Seleção de Pista (Melhorada)
            ctx.fillStyle = '#34495e'; 
            ctx.fillRect(w/2 - 200, h*0.5, 400, 80);
            ctx.fillStyle = '#fff'; ctx.font = "20px Arial";
            ctx.fillText("PISTA SELECIONADA", w/2, h*0.5 + 25);
            ctx.fillStyle = '#f1c40f'; ctx.font = "bold 26px 'Russo One'";
            ctx.fillText(trk.name, w/2, h*0.5 + 60);

            // Botões Navegação Pista
            const navBtn = (lbl, x, y, action) => {
                ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.fillText(lbl, x, y+8);
                this.buttons.push({x:x-25,y:y-25,w:50,h:50,action:action});
            };
            navBtn("<", w/2 - 240, h*0.5+40, () => {
                this.selectedTrack = (this.selectedTrack - 1 + TRACKS.length) % TRACKS.length;
                window.Sfx.click();
            });
            navBtn(">", w/2 + 240, h*0.5+40, () => {
                this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                window.Sfx.click();
            });

            // Start Button
            const startCol = this.isReady ? '#7f8c8d' : '#2ecc71';
            const startTxt = this.isReady ? "AGUARDANDO..." : "INICIAR CORRIDA";
            ctx.fillStyle = startCol;
            ctx.beginPath(); ctx.roundRect(w/2 - 150, h*0.8, 300, 60, 30); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font="bold 24px Arial";
            ctx.fillText(startTxt, w/2, h*0.8 + 40);
            this.buttons.push({x:w/2-150, y:h*0.8, w:300, h:60, action:()=>this.toggleReady()});
        },

        selectMode: function(mode) {
            this.setupTrack(this.selectedTrack);
            if(mode === 'MULTI') {
                if(!window.DB) { window.System.msg("OFFLINE!"); this.selectMode('SOLO'); return; }
                this.isOnline = true; this.connectNet(); this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                this.rivals = [
                    { id: 'cpu1', name: 'RIVAL 1', color: '#8e44ad', x: -0.4, pos: 500, speed: 0, isRemote: false },
                    { id: 'cpu2', name: 'RIVAL 2', color: '#27ae60', x: 0.4, pos: 200, speed: 0, isRemote: false }
                ];
                this.state = 'LOBBY';
            }
        },

        connectNet: function() {
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            const pRef = this.dbRef.child(`players/${window.System.playerId}`);
            pRef.set({ name: 'Player', charId: 0, ready: false });
            pRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const data = snap.val(); if(!data) return;
                this.rivals = Object.keys(data).filter(k=>k!==window.System.playerId).map(k=>({
                    id: k, isRemote: true, ...data[k], color: CHARACTERS[data[k].charId||0].color
                }));
                const allReady = Object.values(data).every(p=>p.ready) && Object.keys(data).length > 1;
                if(allReady && this.state === 'WAITING') this.startRace();
            });
        },

        syncNetwork: function() {
            if(Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    x: this.playerX, pos: Math.floor(this.pos), speed: Math.floor(this.speed), 
                    spinAngle: this.spinAngle, charId: this.selectedChar
                });
            }
        },

        toggleReady: function() {
            if(this.isOnline) {
                this.isReady = !this.isReady;
                this.dbRef.child(`players/${window.System.playerId}`).update({ ready: this.isReady });
                this.state = this.isReady ? 'WAITING' : 'LOBBY';
            } else {
                this.startRace();
            }
        },

        startRace: function() {
            this.state = 'RACE';
            document.getElementById('nitro-btn-kart').style.display = 'flex';
            window.System.msg("GO!");
            window.Sfx.play(600, 'square', 0.5, 0.1);
        },

        setupTrack: function(id) {
            this.segments = [];
            const trk = TRACKS[id];
            const addRoad = (enter, hold, leave, curve, y) => {
                const n = enter + hold + leave;
                for(let i=0; i<n; i++) {
                    let c = 0;
                    if(i < enter) c = curve * (i/enter);
                    else if (i < enter + hold) c = curve;
                    else c = curve * ((n-i)/leave);
                    this.segments.push({
                        curve: c * trk.curveMult,
                        obs: Math.random() > 0.96 ? [{type: 'cone', x: (Math.random()-0.5)*3}] : []
                    });
                }
            };
            
            // Layout da Pista (Curvas suaves e longas para alta velocidade)
            addRoad(50, 50, 50, 0, 0); 
            addRoad(100, 100, 100, 2, 0);
            addRoad(50, 50, 50, 0, 0);
            addRoad(100, 100, 100, -2, 0);
            addRoad(50, 200, 50, 0, 0); // Reta longa
            addRoad(100, 50, 100, 3, 0); // Curva forte
            
            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Horizon Kart', '🏎️', Logic, {
            camOpacity: 0.15, showWheel: true
        });
    }
