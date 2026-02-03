// =============================================================================
// KART DO OTTO – ULTIMATE PRO EDITION (V20)
// ARQUITETO: ESPECIALISTA 177 - GAMEPLAY OVERHAUL
// DATA: 2025 - FÍSICA ARCADE, DRIFT, COLISÃO SPIN E UI CORRIGIDA
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS, CONSTANTES E TUNING (GAME DESIGN)
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO', color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0, grip: 0.96 },
        { id: 1, name: 'Thiago', color: '#f1c40f', speedInfo: 1.10, turnInfo: 0.80, grip: 0.93 }, // Mais rápido, derrapa mais
        { id: 2, name: 'Thamis', color: '#3498db', speedInfo: 0.95, turnInfo: 1.20, grip: 0.98 }  // Mais controle, menos top speed
    ];

    const TRACKS = [
        { id: 0, name: 'GP INTERLAGOS', theme: 'grass', sky: 0, curveMult: 1.0, friction: 1.0 },
        { id: 1, name: 'DESERTO MIRAGEM', theme: 'sand', sky: 1, curveMult: 0.8, friction: 0.8 }, // Escorregadio
        { id: 2, name: 'PICO CONGELADO', theme: 'snow', sky: 2, curveMult: 1.4, friction: 0.7 }   // Muito escorregadio
    ];

    const CONF = {
        // Física Base
        ACCEL: 1.5,
        BRAKING: 3.0,
        MAX_SPEED: 220,
        TURBO_MAX_SPEED: 320,
        DECEL_OFFROAD: 0.88, // Punição severa
        DECEL_FREE: 0.98,    // Resistência do ar

        // Física de Curva
        CENTRIFUGAL: 0.35,   // Força que joga o carro para fora
        CORNER_STIFFNESS: 4, // Dificuldade de virar em alta velocidade

        // Game Feel
        CAMERA_DEPTH: 0.84,  // FOV
        ROAD_WIDTH: 2000,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 300,  // Aumentado para ver mais longe
        RUMBLE_LENGTH: 3
    };

    // Estado Global (Singleton Pattern Simplificado)
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, WAITING, RACE, FINISHED
        roomId: 'room_kart_pro',
        
        // Seleção
        selectedChar: 0,
        selectedTrack: 0,
        
        // Multiplayer
        isOnline: false,
        isReady: false,
        dbRef: null,
        lastSync: 0,
        rivals: [], // {id, x, pos, spin...}

        // Física do Veículo Local
        speed: 0,
        pos: 0,
        playerX: 0,       // -1 (Esquerda) a 1 (Direita) na pista. >1 ou <-1 é Offroad.
        steer: 0,         // Input atual suavizado
        targetSteer: 0,   // Input bruto (teclado/webcam)
        
        // Mecânicas Avançadas
        driftCharge: 0,   // Acumulador de mini-turbo
        boostTimer: 0,    // Tempo restante de boost
        spinTimer: 0,     // Se > 0, carro está girando (batida)
        spinAngle: 0,     // Ângulo visual do giro 360
        nitro: 100,       // Barra de nitro manual

        // Progressão
        lap: 1,
        totalLaps: 3,
        time: 0,
        rank: 1,
        score: 0,         // Pontuação baseada em performance
        combo: 1,         // Multiplicador
        
        // Visual
        visualTilt: 0,    // Inclinação da câmera nas curvas
        bounce: 0,        // Vibração vertical
        skyColor: 0,
        
        // Input
        inputState: 0,    // 0=Nenhum, 1=Teclado/Mouse, 2=Webcam
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        
        // Engine da Pista
        segments: [],
        trackLength: 0,
        
        // UI Elements
        buttons: [], // Hitboxes para cliques precisos

        // =================================================================
        // CICLO DE VIDA
        // =================================================================
        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.setupInput();
            this.resetPhysics();
            window.System.msg("BEM-VINDO AO KART PRO");
        },

        cleanup: function() {
            if(this.dbRef) try { this.dbRef.off(); } catch(e){}
            const btn = document.getElementById('nitro-btn-kart');
            if(btn) btn.remove();
        },

        resetPhysics: function() {
            this.speed = 0;
            this.pos = 0;
            this.playerX = 0;
            this.steer = 0;
            this.driftCharge = 0;
            this.boostTimer = 0;
            this.spinTimer = 0;
            this.spinAngle = 0;
            this.lap = 1;
            this.score = 0;
            this.combo = 1;
            this.nitro = 100;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        setupInput: function() {
            // Cria botão Nitro HTML (Overlay)
            let nBtn = document.getElementById('nitro-btn-kart');
            if(!nBtn) {
                nBtn = document.createElement('div');
                nBtn.id = 'nitro-btn-kart';
                nBtn.innerText = "NITRO";
                Object.assign(nBtn.style, {
                    position: 'absolute', top: '40%', right: '20px', width: '90px', height: '90px',
                    borderRadius: '50%', background: 'radial-gradient(#ff5500, #aa0000)', border: '4px solid #fff',
                    color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Russo One', fontSize: '18px', zIndex: '100', cursor: 'pointer',
                    boxShadow: '0 0 15px #ff5500', userSelect: 'none', transform: 'scale(1)'
                });
                document.getElementById('game-ui').appendChild(nBtn);
                
                const activateNitro = (e) => {
                    if(e) { e.preventDefault(); e.stopPropagation(); }
                    if(this.state === 'RACE' && this.nitro > 20) {
                        this.activateBoost(50); // Boost médio
                        this.nitro -= 25;
                        window.Sfx.play(800, 'sawtooth', 0.3, 0.2);
                    }
                };
                nBtn.addEventListener('mousedown', activateNitro);
                nBtn.addEventListener('touchstart', activateNitro, {passive:false});
            }

            // Handler de Clique Unificado e CORRIGIDO (Matemática de Escala)
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                // Calcula fator de escala entre CSS pixels e Canvas pixels reais
                const scaleX = window.System.canvas.width / rect.width;
                const scaleY = window.System.canvas.height / rect.height;

                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                this.handleClick(clickX, clickY);
            };
        },

        handleClick: function(x, y) {
            // Verifica colisão com botões definidos na renderização
            if (this.buttons.length > 0) {
                for(let b of this.buttons) {
                    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                        window.Sfx.click();
                        b.action();
                        return;
                    }
                }
            }

            // Fallback para toque na tela durante corrida (acelerar/frear se não usar webcam)
            if (this.state === 'RACE') {
                // Toque na esquerda/direita para virar (mobile fallback)
                const w = window.System.canvas.width;
                if (x < w * 0.3) this.targetSteer = -1;
                else if (x > w * 0.7) this.targetSteer = 1;
                else this.targetSteer = 0;
            }
        },

        // =================================================================
        // LÓGICA DE JOGO (UPDATE LOOP)
        // =================================================================
        update: function(ctx, w, h, pose) {
            // Limpa botões do frame anterior
            this.buttons = [];

            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            
            // FASE DE CORRIDA
            if (this.segments.length === 0) return 0;

            this.processInput(w, h, pose);
            this.updatePhysics();
            this.updateAI();
            this.updateMechanics();
            
            // Renderização
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline) this.syncNetwork();

            return Math.floor(this.score);
        },

        processInput: function(w, h, pose) {
            // Se estiver em SPIN (colisão), ignora input e inverte direção
            if (this.spinTimer > 0) {
                this.targetSteer = (Math.random() - 0.5) * 2; // Perda de controle
                return;
            }

            // Detecção via WebCam (Mãos)
            let handsFound = false;
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    handsFound = true;
                    // Mapeia coordenadas normalizadas para tela
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;
                    
                    // Volante Virtual
                    const dx = rx - lx;
                    const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    // Suaviza input do ângulo (-1 a 1)
                    let steerInput = angle * 2.0; 
                    steerInput = Math.max(-1.5, Math.min(1.5, steerInput));
                    
                    // Zona morta
                    if (Math.abs(steerInput) < 0.1) steerInput = 0;
                    
                    this.targetSteer = steerInput;
                    this.inputState = 2; // Webcam Active

                    // Visual Feedback do Volante
                    this.virtualWheel.x = (lx + rx) / 2;
                    this.virtualWheel.y = (ly + ry) / 2;
                    this.virtualWheel.r = Math.max(40, Math.hypot(dx, dy)/2);
                    this.virtualWheel.opacity = 1.0;
                }
            }

            if (!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                // Mantém input anterior com decaimento se não houver toque
                if (Math.abs(this.targetSteer) > 0.01) this.targetSteer *= 0.9;
                else this.targetSteer = 0;
            }

            // Suavização do volante (Lerp)
            this.steer += (this.targetSteer - this.steer) * 0.2;
        },

        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const track = TRACKS[this.selectedTrack];
            
            // 1. Aceleração e Velocidade
            let maxS = (this.boostTimer > 0 ? CONF.TURBO_MAX_SPEED : CONF.MAX_SPEED) * char.speedInfo;
            
            // Se estiver fora da pista, penalidade severa
            if (Math.abs(this.playerX) > 2.0) {
                maxS *= 0.3; // Corta velocidade para 30%
                this.speed *= CONF.DECEL_OFFROAD;
                // Efeito de trepidação
                this.bounce = (Math.random() - 0.5) * 10;
                this.combo = 1; // Reseta combo
            } else {
                this.bounce *= 0.5;
            }

            // Se estiver em SPIN (Colisão)
            if (this.spinTimer > 0) {
                this.speed *= 0.92; // Freio rápido
                this.spinAngle += 30; // Roda visualmente
                this.spinTimer--;
                if(this.spinTimer <= 0) {
                    this.spinAngle = 0;
                    window.System.msg("RECUPERADO!");
                }
            }

            // Aceleração automática se não estiver parado (Arcade Style)
            if (this.state === 'RACE' && this.spinTimer <= 0) {
                if (this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= CONF.DECEL_FREE; // Drag natural
            } else {
                this.speed *= 0.95; // Freio fim de corrida
            }

            // 2. Curvas e Força Centrífuga (O CORAÇÃO DA FÍSICA)
            const currentSeg = this.getSegment(this.pos);
            const speedRatio = (this.speed / CONF.MAX_SPEED);
            
            // Força Centrífuga: A curva te joga para fora (contrário da curva)
            // track.curveMult: intensidade da curva
            // speedRatio^2: quanto mais rápido, mais força
            const centrifugal = -currentSeg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL;
            
            // Input do jogador (virar contra a força)
            // char.turnInfo: agilidade do carro
            // grip: quanto o pneu segura no chão (reduz escorregamento)
            const gripFactor = Math.abs(this.playerX) > 1.2 ? 0.2 : char.grip * track.friction;
            const turnForce = this.steer * speedRatio * gripFactor * 1.5;

            // Resultante lateral
            this.playerX += (turnForce + centrifugal);

            // Limites da pista
            if (this.playerX < -5) { this.playerX = -5; this.speed *= 0.5; }
            if (this.playerX > 5) { this.playerX = 5; this.speed *= 0.5; }

            // 3. Movimento Longitudinal
            this.pos += this.speed;
            while (this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if (this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while (this.pos < 0) this.pos += this.trackLength;

            // 4. Tilt Visual da Câmera
            const targetTilt = (this.steer * 30) + (currentSeg.curve * 15);
            this.visualTilt += (targetTilt - this.visualTilt) * 0.1;

            // Pontuação e Combo
            if(this.speed > 150 && Math.abs(this.playerX) < 1.0) {
                this.score += (this.speed * 0.01) * this.combo;
                if (this.time % 60 === 0 && this.combo < 5) this.combo += 0.5;
            }
            this.time++;
        },

        updateMechanics: function() {
            // Mecânica de Drift / Carga de Turbo
            // Se virar muito em alta velocidade
            if (Math.abs(this.steer) > 0.8 && this.speed > 100) {
                this.driftCharge++;
                if (this.driftCharge > 60) { // 1 segundo segurando
                    // Partículas seriam geradas aqui na renderização
                    if (this.driftCharge === 61) window.System.msg("DRIFT READY!");
                }
            } else {
                // Soltou o drift
                if (this.driftCharge > 60) {
                    this.activateBoost(80);
                    window.System.msg("TURBO DRIFT!");
                    this.score += 500;
                }
                this.driftCharge = 0;
            }

            // Gerenciamento do Boost
            if (this.boostTimer > 0) {
                this.boostTimer--;
                this.speed += 2; // Kick extra
                // Efeito visual (Shake)
                window.Gfx.shakeScreen(2);
            }

            // Regeneração lenta de Nitro
            if (this.nitro < 100) this.nitro += 0.05;

            // Colisão com Obstáculos
            const pSeg = this.getSegment(this.pos);
            for(let obs of pSeg.obs) {
                // Se colidir (distância X e Z próxima)
                if (Math.abs(this.playerX - obs.x) < 0.6) {
                    this.triggerCrash();
                    // Remove obstáculo visualmente (hack simples movendo pra longe)
                    obs.x = 999; 
                }
            }
        },

        updateAI: function() {
            // Lógica para rivais offline e online
            let rankCounter = 1;
            
            this.rivals.forEach(r => {
                // Se for bot (offline)
                if (!r.isRemote) {
                    // IA Simples
                    const rSeg = this.getSegment(r.pos);
                    // Bot tenta ficar no centro (x=0) mas é afetado pela curva
                    const targetX = rSeg.curve * -0.5; 
                    r.x += (targetX - r.x) * 0.05;
                    
                    // Velocidade variável
                    let targetSpeed = (CONF.MAX_SPEED * 0.95);
                    if (r.spinTimer > 0) { 
                        r.speed *= 0.9; 
                        r.spinTimer--; 
                        r.angle = (r.angle || 0) + 30;
                    } else {
                        r.angle = 0;
                        if (r.speed < targetSpeed) r.speed += CONF.ACCEL * 0.8;
                    }

                    r.pos += r.speed;
                    if(r.pos >= this.trackLength) { r.pos -= this.trackLength; r.lap++; }
                    
                    // Colisão Jogador vs Bot
                    const distZ = Math.abs(r.pos - this.pos);
                    const distX = Math.abs(r.x - this.playerX);
                    // Se estiver perto (considerando loop da pista)
                    if ((distZ < 300 || Math.abs(distZ - this.trackLength) < 300) && distX < 0.8) {
                        if (this.spinTimer <= 0) {
                            // Quem está atrás bate e roda menos, quem está na frente roda mais
                            // Simplificação: Ambos rodam
                            this.triggerCrash();
                            r.spinTimer = 30;
                            window.Sfx.crash();
                        }
                    }
                }

                // Cálculo de Rank
                const myTotal = (this.lap * this.trackLength) + this.pos;
                const rTotal = ((r.lap||1) * this.trackLength) + r.pos;
                if (rTotal > myTotal) rankCounter++;
            });
            
            this.rank = rankCounter;
        },

        // =================================================================
        // AUXILIARES
        // =================================================================
        triggerCrash: function() {
            this.spinTimer = 45; // 45 frames girando
            this.speed *= 0.5;   // Perda massiva de velocidade
            this.combo = 1;
            window.Sfx.crash();
            window.Gfx.shakeScreen(20);
            window.System.msg("CRASH!");
        },

        activateBoost: function(frames) {
            this.boostTimer = frames;
            this.speed += 30; // Arrancada imediata
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
            setTimeout(() => window.System.gameOver(Math.floor(this.score)), 3000);
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const horizon = h * 0.45;
            
            // Sky
            const skyGrad = ctx.createLinearGradient(0,0,0,horizon);
            const skyColors = [['#3498db', '#ecf0f1'], ['#e67e22', '#f1c40f'], ['#95a5a6', '#bdc3c7']];
            const sc = skyColors[TRACKS[this.selectedTrack].sky];
            skyGrad.addColorStop(0, sc[0]); skyGrad.addColorStop(1, sc[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,horizon);

            // Ground
            ctx.fillStyle = this.selectedTrack === 2 ? '#fff' : (this.selectedTrack === 1 ? '#d35400' : '#2ecc71');
            ctx.fillRect(0, horizon, w, h-horizon);

            // 3D Projection Loop
            const baseSeg = this.getSegment(this.pos);
            const basePercent = (this.pos % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            const playerX_Projected = this.playerX * CONF.ROAD_WIDTH;
            
            let dx = -(baseSeg.curve * basePercent);
            let x = 0;
            let maxY = h;

            // Desenha segmentos do fundo para frente? Não, frente para fundo (Painter's algo invertido para otimizar clipping seria ideal, mas aqui usamos standard Z-buffer fake)
            // Na verdade, Pseudo-3D clássico desenha de trás pra frente ou usa clip de Y.
            // Vamos usar o método simples: desenhar e projetar.
            
            // Melhor abordagem para Mode7 Strip: Projetar pontos
            let camX = this.playerX * CONF.ROAD_WIDTH;
            let camZ = this.pos;
            let camH = 1000 + (this.bounce * 100);

            // Armazena coords para desenhar sprites depois
            let spriteQueue = [];

            // Loop de renderização da pista
            let viewZ = CONF.DRAW_DISTANCE * CONF.SEGMENT_LENGTH;
            let currentClipY = h;

            // Otimização: Renderizar apenas o necessário
            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = (Math.floor((camZ + (n * CONF.SEGMENT_LENGTH)) / CONF.SEGMENT_LENGTH)) % this.segments.length;
                const seg = this.segments[segIdx];
                
                // Curva acumulada
                x += dx;
                dx += seg.curve;

                // Projeção
                // Z relativo à camera
                const segZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (camZ % CONF.SEGMENT_LENGTH));
                const scale = CONF.CAMERA_DEPTH / (segZ);
                
                // Coordenadas de tela
                const screenY = (1 + scale * (0 - camH)) * h/2 + horizon; // Simplificado
                // Precisamos de uma projeção melhor para ficar bonito
                // Y = Horizon + (Height / Z)
                const projY = horizon + (20000 / segZ); // Magic number para altura da câmera
                const projScale = 200 / segZ; // Escala baseada em Z

                if (projY >= currentClipY) continue; // Oclusão (está atrás do chão já desenhado)
                
                // Curva da estrada na tela
                // ScreenX = Center + (WorldX - CamX - CurveOffset) * Scale
                const curveOffset = x * 200; 
                const screenX = cx - (camX * projScale) - (curveOffset * projScale);

                // Desenha Faixa (Grass/Rumble/Road)
                const bandW = CONF.ROAD_WIDTH * projScale * w * 0.002;
                
                // Cores
                const isDark = (Math.floor(segIdx / CONF.RUMBLE_LENGTH) % 2) === 0;
                const theme = TRACKS[this.selectedTrack];
                
                // Rumble (Zebras)
                const rumbleW = bandW * 1.2;
                ctx.fillStyle = isDark ? '#fff' : '#c0392b'; // Zebra Vermelha/Branca
                ctx.fillRect(screenX - rumbleW, projY, rumbleW*2, currentClipY - projY);

                // Estrada
                ctx.fillStyle = isDark ? '#666' : '#636363';
                if(theme.id === 1) ctx.fillStyle = isDark ? '#e67e22' : '#d35400'; // Areia
                if(theme.id === 2) ctx.fillStyle = isDark ? '#bdc3c7' : '#95a5a6'; // Gelo
                
                ctx.fillRect(screenX - bandW, projY, bandW*2, currentClipY - projY);
                
                // Linha Central
                if (isDark) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(screenX - (bandW * 0.05), projY, bandW * 0.1, currentClipY - projY);
                }

                // Adiciona Sprites (Rivais/Objetos) à fila deste segmento
                // Rivais
                this.rivals.forEach(r => {
                    const rSegIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH);
                    if (rSegIdx === segIdx) {
                        spriteQueue.push({
                            type: 'kart',
                            obj: r,
                            x: screenX + (r.x * CONF.ROAD_WIDTH * projScale * w * 0.002),
                            y: projY,
                            scale: projScale,
                            dist: segZ
                        });
                    }
                });

                // Obstáculos
                seg.obs.forEach(o => {
                    if (o.x > 500) return; // Hack de remoção
                    spriteQueue.push({
                        type: o.type,
                        x: screenX + (o.x * CONF.ROAD_WIDTH * projScale * w * 0.002),
                        y: projY,
                        scale: projScale,
                        dist: segZ
                    });
                });

                currentClipY = projY; // Atualiza buffer de oclusão
            }

            // Desenha Sprites (De trás pra frente - Painter's Algo já garantido pela fila inversa? Não, a fila foi criada de frente pra trás)
            // Precisamos desenhar na ordem inversa de inserção (os mais distantes primeiro)
            for (let i = spriteQueue.length - 1; i >= 0; i--) {
                this.drawSprite(ctx, spriteQueue[i], w, h);
            }

            // Desenha Jogador
            this.drawPlayerKart(ctx, w, h);
        },

        drawSprite: function(ctx, s, w, h) {
            const size = s.scale * w * 1.5;
            const sx = s.x;
            const sy = s.y;

            if (s.type === 'cone') {
                ctx.fillStyle = '#e67e22';
                ctx.beginPath();
                ctx.moveTo(sx, sy - size);
                ctx.lineTo(sx - size/2, sy);
                ctx.lineTo(sx + size/2, sy);
                ctx.fill();
            } else if (s.type === 'kart') {
                // Desenha Rival
                const r = s.obj;
                const spin = r.spinAngle || 0;
                this.drawKartAsset(ctx, sx, sy, size * 0.01, 0, 0, r.color, spin);
                
                // Nome
                ctx.fillStyle = '#fff';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(r.name || 'CPU', sx, sy - size - 10);
            }
        },

        drawPlayerKart: function(ctx, w, h) {
            const cx = w/2;
            const cy = h * 0.85 + this.bounce;
            const scale = w * 0.006; // Ajuste de tamanho
            
            // Aplica Spin Visual
            const rot = this.visualTilt * 0.02 + (this.spinAngle * Math.PI / 180);
            
            this.drawKartAsset(ctx, cx, cy, scale, this.steer, rot, CHARACTERS[this.selectedChar].color, 0);

            // Efeitos de Partícula (Drift/Boost)
            if (this.driftCharge > 20 || this.boostTimer > 0) {
                const color = this.boostTimer > 0 ? '#00ffff' : (this.driftCharge > 60 ? '#ff0000' : '#ffff00');
                for(let i=0; i<3; i++) {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(cx - (60*scale) + Math.random()*20, cy + (20*scale), 5 + Math.random()*5, 0, Math.PI*2);
                    ctx.arc(cx + (60*scale) + Math.random()*20, cy + (20*scale), 5 + Math.random()*5, 0, Math.PI*2);
                    ctx.fill();
                }
            }
        },

        drawKartAsset: function(ctx, x, y, s, steer, tilt, color, extraRot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(tilt + (extraRot * Math.PI/180));

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 30, 70, 20, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            ctx.fillStyle = color;
            // Corpo Principal
            ctx.beginPath();
            ctx.moveTo(-30, -20); ctx.lineTo(30, -20); // Traseira
            ctx.lineTo(40, 20); ctx.lineTo(-40, 20);   // Frente
            ctx.fill();
            
            // Spoiler
            ctx.fillStyle = '#222';
            ctx.fillRect(-35, -35, 70, 10);

            // Rodas (giram com steer)
            const wheelY = 15;
            const wheelX = 45;
            
            const drawWheel = (wx, wy, angle) => {
                ctx.save();
                ctx.translate(wx, wy);
                ctx.rotate(angle);
                ctx.fillStyle = '#111';
                ctx.fillRect(-10, -15, 20, 30);
                // Aro
                if (this.spinTimer > 0) ctx.fillStyle = '#ff0000'; // Freio incandescente
                else ctx.fillStyle = '#555';
                ctx.fillRect(-5, -5, 10, 10);
                ctx.restore();
            };

            // Rodas Traseiras (Fixas)
            drawWheel(-wheelX, -wheelY, 0);
            drawWheel(wheelX, -wheelY, 0);

            // Rodas Dianteiras (Direcionais)
            drawWheel(-wheelX, wheelY+10, steer * 0.8);
            drawWheel(wheelX, wheelY+10, steer * 0.8);

            // Piloto (Cabeça)
            ctx.fillStyle = '#fff'; // Capacete
            ctx.beginPath(); ctx.arc(0, -10, 20, 0, Math.PI*2); ctx.fill();
            // Visor
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.arc(0, -10, 18, 0, Math.PI, false); ctx.fill();

            // Texto Player (Se online)
            if (extraRot !== 0) { // É rival girando?
                ctx.fillStyle = 'yellow';
                ctx.font = 'bold 40px Arial';
                ctx.fillText("!", 0, -50);
            }

            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            // Speedometer (Digital + Barra)
            const hudX = w - 100;
            const hudY = h - 80;
            
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath(); ctx.arc(hudX, hudY, 60, 0, Math.PI*2); ctx.fill();
            
            // Arco de RPM
            const pct = Math.min(1, this.speed / CONF.TURBO_MAX_SPEED);
            ctx.strokeStyle = this.boostTimer > 0 ? '#00ffff' : '#e74c3c';
            ctx.lineWidth = 8;
            ctx.beginPath(); ctx.arc(hudX, hudY, 55, Math.PI, Math.PI + (Math.PI * pct)); ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), hudX, hudY + 10);
            ctx.font = "14px Arial";
            ctx.fillText("KM/H", hudX, hudY + 30);

            // Nitro Bar
            const barW = 200;
            const barH = 20;
            ctx.fillStyle = "#333";
            ctx.fillRect(w/2 - barW/2, 20, barW, barH);
            ctx.fillStyle = "#ffaa00";
            ctx.fillRect(w/2 - barW/2 + 2, 22, (barW-4) * (this.nitro/100), barH-4);
            ctx.font = "bold 16px Arial";
            ctx.fillStyle = "#fff";
            ctx.fillText("NITRO", w/2, 15);

            // Combo & Score
            if (this.combo > 1) {
                ctx.fillStyle = "#f1c40f";
                ctx.font = "bold 30px 'Russo One'";
                ctx.fillText(`x${this.combo.toFixed(1)} COMBO!`, w/2, 80);
            }

            // Posição
            ctx.fillStyle = "#fff";
            ctx.textAlign = "left";
            ctx.font = "bold 60px 'Russo One'";
            ctx.fillText(`${this.rank}º`, 20, 80);
            ctx.font = "20px Arial";
            ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 110);

            // Volante Virtual (Se ativo)
            if (this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save();
                ctx.translate(vw.x, vw.y);
                ctx.globalAlpha = vw.opacity;
                ctx.rotate(this.targetSteer * 1.5);
                
                // Aro
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(0,0, vw.r, 0, Math.PI*2); ctx.stroke();
                // Centro
                ctx.fillStyle = this.driftCharge > 0 ? '#ff0000' : '#00ffff';
                ctx.beginPath(); ctx.arc(0,0, 10, 0, Math.PI*2); ctx.fill();
                // Marcador Topo
                ctx.fillStyle = '#ff0';
                ctx.fillRect(-5, -vw.r, 10, 20);
                
                ctx.restore();
            }

            // Mensagens Centrais (Spin/Crash)
            if (this.spinTimer > 0) {
                ctx.save();
                ctx.translate(w/2, h/2);
                ctx.rotate((Math.random()-0.5)*0.2);
                ctx.fillStyle = "#e74c3c";
                ctx.font = "bold 80px 'Russo One'";
                ctx.textAlign = "center";
                ctx.fillText("CRASH!", 0, 0);
                ctx.restore();
            }
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("ULTIMATE KART PRO", w/2, 80);
            
            // Botões desenhados (com hitbox registrada)
            const btnW = 300; const btnH = 80;
            const drawBtn = (label, y, color, action) => {
                const bx = w/2 - btnW/2;
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.roundRect(bx, y, btnW, btnH, 15); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = "bold 24px Arial";
                ctx.fillText(label, w/2, y + 50);
                
                // Registra hitbox
                this.buttons.push({x: bx, y: y, w: btnW, h: btnH, action: action});
            };

            drawBtn("JOGO RÁPIDO (SOLO)", h*0.4, '#e67e22', () => this.selectMode('SOLO'));
            drawBtn("MULTIPLAYER ONLINE", h*0.6, '#27ae60', () => this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#34495e'; ctx.fillRect(0,0,w,h);
            
            // Info Personagem
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color;
            ctx.beginPath(); ctx.arc(w/2, h*0.3, 80, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.3 + 120);
            
            // Stats Bars
            const bar = (label, val, y) => {
                ctx.font = "16px Arial"; ctx.textAlign="right";
                ctx.fillText(label, w/2 - 110, y+15);
                ctx.fillStyle = '#222'; ctx.fillRect(w/2 - 100, y, 200, 20);
                ctx.fillStyle = '#f1c40f'; ctx.fillRect(w/2 - 100, y, 200 * (val/1.5), 20);
            };
            bar("SPEED", char.speedInfo, h*0.5);
            bar("TURN", char.turnInfo, h*0.55);

            // Botões de Navegação
            const navBtn = (txt, x, y, action) => {
                ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 30px Arial"; ctx.fillText(txt, x, y+10);
                this.buttons.push({x: x-30, y: y-30, w: 60, h: 60, action: action});
            };
            
            navBtn("<", w/2 - 150, h*0.3, () => { 
                this.selectedChar = (this.selectedChar - 1 + CHARACTERS.length) % CHARACTERS.length; 
                window.Sfx.hover();
            });
            navBtn(">", w/2 + 150, h*0.3, () => { 
                this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length; 
                window.Sfx.hover();
            });

            // Botão Start
            const startTxt = this.isReady ? "AGUARDANDO..." : "PRONTO!";
            const startCol = this.isReady ? '#7f8c8d' : '#2ecc71';
            
            ctx.fillStyle = startCol;
            ctx.beginPath(); ctx.roundRect(w/2 - 150, h*0.8, 300, 70, 10); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font="bold 30px 'Russo One'";
            ctx.fillText(startTxt, w/2, h*0.8 + 45);
            
            this.buttons.push({x: w/2 - 150, y: h*0.8, w: 300, h: 70, action: () => this.toggleReady()});
        },

        // =================================================================
        // SISTEMA (Network, Track Gen)
        // =================================================================
        selectMode: function(mode) {
            this.setupTrack(this.selectedTrack);
            if(mode === 'MULTI') {
                if(!window.DB) { window.System.msg("OFFLINE!"); this.selectMode('SOLO'); return; }
                this.isOnline = true;
                this.connectNet();
                this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                // Bots
                this.rivals = [
                    { id: 'cpu1', name: 'Luigi Bot', color: '#2ecc71', x: -0.5, pos: 500, speed: 0, isRemote: false },
                    { id: 'cpu2', name: 'Toad Bot', color: '#3498db', x: 0.5, pos: 200, speed: 0, isRemote: false }
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
                const data = snap.val();
                if(!data) return;
                
                this.rivals = Object.keys(data)
                    .filter(k => k !== window.System.playerId)
                    .map(k => ({
                        id: k,
                        isRemote: true,
                        ...data[k],
                        color: CHARACTERS[data[k].charId || 0].color
                    }));
                
                // Auto Start Check
                const allReady = Object.values(data).every(p => p.ready) && Object.keys(data).length > 1;
                if(allReady && this.state === 'WAITING') this.startRace();
            });
        },

        syncNetwork: function() {
            if(Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    x: this.playerX,
                    pos: Math.floor(this.pos),
                    speed: Math.floor(this.speed),
                    spinAngle: this.spinAngle, // Sincroniza o giro!
                    charId: this.selectedChar
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
            window.System.msg("LARGADA!");
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
                        y: 0, // Sem hills por enquanto para manter performance
                        obs: Math.random() > 0.95 ? [{type: 'cone', x: (Math.random()-0.5)*3}] : []
                    });
                }
            };
            
            // Geração Procedural Determinística Simples
            addRoad(50, 50, 50, 0, 0); // Start
            addRoad(50, 100, 50, 2, 0); // Curva Dir
            addRoad(50, 50, 50, 0, 0);
            addRoad(50, 100, 50, -3, 0); // Curva Esq Fechada
            addRoad(100, 100, 100, 1, 0); // Longa
            addRoad(50, 20, 50, 0, 0);
            
            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        }
    };

    // Registro no Sistema
    if(window.System) {
        window.System.registerGame('drive', 'Kart Pro Evolution', '🏎️', Logic, {
            camOpacity: 0.15,
            showWheel: true
        });
    }

})();