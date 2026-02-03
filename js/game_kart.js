// =============================================================================
// KART DO OTTO – HORIZON CHASE EDITION (FINAL)
// ARQUITETO: SENIOR GAME DEV
// VISUAL: Low Poly, Cores Vibrantes, Pseudo-3D Estável
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES VISUAIS (ESTILO HORIZON)
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'CRIMSON FURY', color: '#e74c3c', bodyColor: '#c0392b', speedInfo: 1.0, turnInfo: 1.0 },
        { id: 1, name: 'GOLDEN ARROW', color: '#f1c40f', bodyColor: '#d35400', speedInfo: 1.08, turnInfo: 0.85 },
        { id: 2, name: 'BLUE THUNDER', color: '#3498db', bodyColor: '#2980b9', speedInfo: 0.95, turnInfo: 1.15 }
    ];

    const TRACKS = [
        { 
            id: 0, name: 'CALIFORNIA SUNSET', 
            colors: { skyTop: '#2b5876', skyBot: '#4e4376', grassLight: '#55aa44', grassDark: '#448833', roadLight: '#777', roadDark: '#666', rumble1: '#c0392b', rumble2: '#ecf0f1' },
            curveMult: 1.0 
        },
        { 
            id: 1, name: 'NEON TOKYO', 
            colors: { skyTop: '#0f0c29', skyBot: '#302b63', grassLight: '#240b36', grassDark: '#1a0526', roadLight: '#34495e', roadDark: '#2c3e50', rumble1: '#00d2ff', rumble2: '#3a7bd5' },
            curveMult: 1.2 
        },
        { 
            id: 2, name: 'ATACAMA DESERT', 
            colors: { skyTop: '#ff7e5f', skyBot: '#feb47b', grassLight: '#e67e22', grassDark: '#d35400', roadLight: '#95a5a6', roadDark: '#7f8c8d', rumble1: '#8e44ad', rumble2: '#f1c40f' },
            curveMult: 0.9 
        }
    ];

    const CONF = {
        SEGMENT_LENGTH: 200, // Tamanho de cada "fatia" da estrada
        RUMBLE_LENGTH: 3,    // Frequência das zebras
        ROAD_WIDTH: 2000,    // Largura da estrada (Mundo 3D)
        
        CAMERA_HEIGHT: 1500, // Altura da câmera (quanto maior, mais se vê a pista)
        CAMERA_DEPTH: 0.8,   // Campo de visão (FOV)
        DRAW_DISTANCE: 300,  // Quantos segmentos desenhar (profundidade visual)
        
        MAX_SPEED: 260,
        ACCEL: 2.5,
        BREAKING: 6.0,
        DECEL: 0.96,
        OFFROAD_DECEL: 0.92,
        CENTRIFUGAL: 0.22    // Força que joga pra fora da curva
    };

    // -----------------------------------------------------------------
    // 2. ESTADO DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, RACE, FINISHED
        roomId: 'room_horizon_v1',
        
        // Seleção
        selectedChar: 0,
        selectedTrack: 0,
        
        // Multiplayer
        isOnline: false,
        isReady: false,
        dbRef: null,
        lastSync: 0,
        rivals: [],

        // Física do Jogador
        speed: 0,
        pos: 0,          // Posição Z absoluta na pista
        playerX: 0,      // Posição X (-1 a 1 é pista)
        steer: 0,
        targetSteer: 0,
        
        // Mecânicas
        nitro: 100,
        boostTimer: 0,
        spinTimer: 0,
        spinAngle: 0,
        
        // Mundo
        segments: [],
        trackLength: 0,
        
        // Visual
        bounce: 0,
        visualTilt: 0,
        skyOffset: 0,    // Para parallax do fundo
        
        // Input
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        buttons: [],

        // --- INICIALIZAÇÃO ---
        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.resetPhysics();
            this.setupUI();
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
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
            this.lap = 1; this.totalLaps = 3; this.rank = 1;
        },

        // --- ENGINE DE PISTA (PSEUDO-3D) ---
        createTrack: function(trackId) {
            this.segments = [];
            const trk = TRACKS[trackId];
            
            const addSegment = (curve) => {
                this.segments.push({
                    curve: curve * trk.curveMult,
                    y: 0, // Sem colinas por enquanto para estabilidade
                    obs: Math.random() > 0.95 ? [{type: 'cone', x: (Math.random()-0.5)*2.5}] : [] 
                });
            };

            const addRoad = (enter, hold, leave, curve) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter));
                for(let i=0; i<hold; i++)  addSegment(curve);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave));
            };

            // Layout da Pista (Geração Procedural Fixa)
            addRoad(50, 50, 50, 0);         // Reta inicial
            addRoad(50, 100, 50, 2);        // Curva suave Dir
            addRoad(50, 50, 50, 0);         // Reta
            addRoad(50, 50, 50, -2);        // Curva suave Esq
            addRoad(100, 50, 100, 4);       // Curva Fechada Dir
            addRoad(50, 200, 50, 0);        // Retão
            addRoad(100, 100, 100, -3);     // Curva Média Esq
            addRoad(50, 50, 50, 0);         // Final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        getSegment: function(position) {
            if (this.segments.length === 0) return { curve: 0, obs: [] };
            const index = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[index];
        },

        // --- UPDATE LOOP ---
        update: function(ctx, w, h, pose) {
            this.buttons = []; // Limpa áreas clicáveis

            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            
            // FASE DE CORRIDA
            this.processInput(w, h, pose);
            this.updatePhysics();
            this.updateAI();
            
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline) this.syncNetwork();

            return Math.floor(this.pos / 100);
        },

        // --- FÍSICA ---
        processInput: function(w, h, pose) {
            if(this.spinTimer > 0) return; // Sem controle durante batida

            // WebCam (Mãos)
            let handsFound = false;
            if(pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                if(lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    handsFound = true;
                    // Mapeia coordenadas
                    const lx = (1 - lw.x/640)*w; const ly = (lw.y/480)*h;
                    const rx = (1 - rw.x/640)*w; const ry = (rw.y/480)*h;
                    
                    const dx = rx - lx; const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = angle * 2.5; // Multiplicador de sensibilidade
                    this.virtualWheel = { x: (lx+rx)/2, y: (ly+ry)/2, r: Math.hypot(dx,dy)/2, opacity: 1 };
                }
            }

            if(!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                if(Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.8;
                else this.targetSteer = 0;
            }

            // Suavização do volante
            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const currentSeg = this.getSegment(this.pos);
            const ratio = this.speed / CONF.MAX_SPEED;

            // 1. Aceleração
            let maxS = (this.boostTimer > 0 ? 360 : CONF.MAX_SPEED) * char.speedInfo;
            if(Math.abs(this.playerX) > 2.2) { maxS *= 0.4; this.bounce = (Math.random()-0.5)*10; } // Offroad
            else this.bounce *= 0.5;

            if(this.spinTimer > 0) {
                this.speed *= 0.94;
                this.spinAngle += 30;
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                if(this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= CONF.DECEL; // Drag natural
            }

            // 2. Curvas (A "Mágica" do Arcade)
            // Força Centrífuga: Quanto mais rápido e mais fechada a curva, mais joga pra fora
            const centrifugal = -(currentSeg.curve * (ratio * ratio)) * CONF.CENTRIFUGAL;
            // Virada do Jogador
            const turnForce = this.steer * ratio * 2.5 * char.turnInfo;
            
            this.playerX += (turnForce + centrifugal);

            // Limites (Muros invisíveis)
            if(this.playerX < -3.5) { this.playerX = -3.5; this.speed *= 0.9; }
            if(this.playerX > 3.5) { this.playerX = 3.5; this.speed *= 0.9; }

            // 3. Movimento Longitudinal
            this.pos += this.speed;
            while(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while(this.pos < 0) this.pos += this.trackLength;

            // 4. Parallax Sky
            this.skyOffset -= (currentSeg.curve * 0.05 * ratio) + (this.steer * 0.02);

            // 5. Nitro e Boost
            if(this.boostTimer > 0) this.boostTimer--;
            if(this.nitro < 100) this.nitro += 0.05;

            // 6. Colisões Obstáculos
            for(let o of currentSeg.obs) {
                if(Math.abs(this.playerX - o.x) < 0.8) {
                    this.crash();
                    o.x = 999; // Remove obstáculo
                }
            }
        },

        updateAI: function() {
            let rk = 1;
            const myTot = this.lap * this.trackLength + this.pos;
            
            this.rivals.forEach(r => {
                if(!r.isRemote) {
                    // IA Simples
                    const rSeg = this.getSegment(r.pos);
                    r.x += (-(rSeg.curve * 0.5) - r.x) * 0.05; // Tenta ficar no centro corrigido pela curva
                    
                    let targetS = CONF.MAX_SPEED * 0.95;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    
                    // Colisão com Jogador
                    const dz = Math.abs(r.pos - this.pos);
                    const dx = Math.abs(r.x - this.playerX);
                    // Se estiver MUITO perto (considerando loop da pista)
                    if((dz < 400 || Math.abs(dz - this.trackLength) < 400) && dx < 0.7) {
                        if(this.spinTimer <= 0 && r.spinTimer <= 0) {
                            this.crash();
                            // Empurra rival
                            r.x += (r.x > this.playerX ? 0.5 : -0.5);
                        }
                    }

                    r.pos += r.speed;
                    if(r.pos >= this.trackLength) { r.pos -= this.trackLength; r.lap++; }
                }
                
                // Rank Calc
                const rTot = (r.lap || 1) * this.trackLength + r.pos;
                if(rTot > myTot) rk++;
            });
            this.rank = rk;
        },

        crash: function() {
            this.spinTimer = 40;
            this.speed *= 0.5;
            window.Sfx.crash();
            window.Gfx.shakeScreen(20);
            window.System.msg("CRASH!");
        },

        // =================================================================
        // RENDERIZAÇÃO (AQUILO QUE VOCÊ QUERIA VER!)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const colors = TRACKS[this.selectedTrack].colors;
            const cx = w / 2;
            const cy = h / 2;
            const horizon = h * 0.45; // Linha do horizonte

            // 1. CÉU E PARALLAX
            const skyGrad = ctx.createLinearGradient(0,0,0,horizon);
            skyGrad.addColorStop(0, colors.skyTop); skyGrad.addColorStop(1, colors.skyBot);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,horizon);

            // Montanhas ao fundo (Parallax)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                // Usa skyOffset para mover as montanhas
                let mx = (i * w/10) + (this.skyOffset * w) % w;
                if (mx < 0) mx += w;
                if (mx > w) mx -= w;
                const my = horizon - 50 - (i%2==0 ? 40 : 0);
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon);
            ctx.fill();

            // Chão Base (Grama)
            ctx.fillStyle = colors.grassDark;
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. DESENHO DA PISTA (ALGORITMO PAINTER'S)
            // Desenhamos do mais longe para o mais perto
            
            const startPos = this.pos;
            const startIdx = Math.floor(startPos / CONF.SEGMENT_LENGTH);
            const camH = CONF.CAMERA_HEIGHT + this.bounce;
            
            let x = 0, dx = 0;
            let maxY = h; // Clip buffer para não desenhar estrada em cima da outra
            
            // Pre-cálculo da curva inicial (onde estamos)
            const baseSeg = this.getSegment(startPos);
            const basePct = (startPos % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            dx = -(baseSeg.curve * basePct); 
            
            let sprites = []; // Fila de objetos para desenhar depois (karts, cones)

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const idx = (startIdx + n) % this.segments.length;
                const seg = this.segments[idx];
                const loop = Math.floor((startIdx + n) / this.segments.length);
                
                // Z relativo à câmera
                const segmentZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (startPos % CONF.SEGMENT_LENGTH));
                if(segmentZ < 1) continue; // Evita div por zero

                // Projeção
                const scale = CONF.CAMERA_DEPTH / segmentZ;
                const screenY = horizon + (scale * camH);
                
                // Curva acumulada
                x += dx;
                dx += seg.curve;
                
                // Clip (Oclusão) - Se o segmento atual está "atrás" ou "abaixo" do anterior desenhado (que estava mais perto), pula
                if(screenY >= maxY) continue;
                maxY = screenY;

                // X na tela
                // A curva desloca o X central. PlayerX desloca a câmera.
                const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                const screenW = CONF.ROAD_WIDTH * scale;

                // --- DESENHA O SEGMENTO ---
                this.drawSegment(ctx, w, screenX, screenY, screenW, horizon, idx, colors);

                // --- COLETA SPRITES ---
                // Rivais
                this.rivals.forEach(r => {
                    // Normaliza posição do rival para coordenadas relativas da pista
                    const rLoop = Math.floor(r.pos / this.trackLength); // Não usado na logica simples, mas útil para ghost
                    // Se o rival está neste segmento
                    const rSegIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
                    
                    if(rSegIdx === idx && loop === Math.floor(r.pos/this.trackLength)) {
                        const spriteX = screenX + (r.x * screenW);
                        const spriteScale = scale * w * 0.002; // Escala do sprite
                        sprites.push({ type:'kart', obj:r, x:spriteX, y:screenY, s:spriteScale, dist: segmentZ });
                    }
                });

                // Obstáculos
                seg.obs.forEach(o => {
                    const spriteX = screenX + (o.x * screenW);
                    const spriteScale = scale * w * 0.002;
                    sprites.push({ type:'cone', x:spriteX, y:screenY, s:spriteScale, dist: segmentZ });
                });
            }

            // 3. DESENHA SPRITES (TRÁS PRA FRENTE)
            // A lista 'sprites' foi preenchida do fundo pra frente, então desenhamos ao contrário
            for(let i=sprites.length-1; i>=0; i--) {
                this.drawSprite(ctx, sprites[i]);
            }

            // 4. DESENHA JOGADOR
            this.drawPlayer(ctx, w, h);
        },

        drawSegment: function(ctx, w, x, y, width, horizon, idx, cols) {
            // Cores alternadas
            const isAlt = (Math.floor(idx / CONF.RUMBLE_LENGTH) % 2) === 0;
            
            // Altura do segmento na tela (até o fundo da tela ou próximo segmento implícito)
            // Aqui simplificamos desenhando uma faixa grossa para baixo, que será cortada pelo próximo segmento (Painter's Algo)
            // Mas como estamos desenhando do fundo para frente, precisamos limpar o topo?
            // Não, o loop desenha de TRÁS para FRENTE. O segmento N é desenhado. O N-1 (mais perto) é desenhado DEPOIS e cobre.
            // Pera, a lógica acima "if(screenY >= maxY) continue" sugere desenhar de PERTO para LONGE para otimização?
            // Sim, o loop acima é Frente->Fundo para calcular coordenadas, mas o desenho de polígonos sólidos deve ser cuidadoso.
            // VAMOS INVERTER A LÓGICA DE DESENHO:
            // O código acima calcula coordenadas. Vamos desenhar um TRAPÉZIO entre o segmento atual e o anterior?
            // Simplificação: Desenhar retângulos horizontais funciona bem em Mode7 denso.
            
            // Grama (Fundo total da linha)
            ctx.fillStyle = isAlt ? cols.grassDark : cols.grassLight;
            ctx.fillRect(0, y, w, 4); // Altura fixa pequena ou calcular diff?
            // O correto é preencher até o y anterior, mas nesse loop otimizado desenhamos linhas.
            // Hack visual: desenha linha grossa.
            
            const H = 3; // Altura visual da linha (evita buracos)

            // Grama Lateral
            ctx.fillStyle = isAlt ? cols.grassDark : cols.grassLight;
            ctx.fillRect(0, y, w, H);

            // Zebra
            const rumbleW = width * 1.2;
            ctx.fillStyle = isAlt ? cols.rumble1 : cols.rumble2;
            ctx.fillRect(x - rumbleW, y, rumbleW*2, H);

            // Estrada
            ctx.fillStyle = isAlt ? cols.roadDark : cols.roadLight;
            ctx.fillRect(x - width, y, width*2, H);

            // Linha Central
            if(isAlt) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - width*0.05, y, width*0.1, H);
            }
        },

        drawSprite: function(ctx, s) {
            const size = s.s * 800; // Tamanho base em pixels
            if(s.type === 'cone') {
                ctx.fillStyle = '#e67e22';
                ctx.beginPath();
                ctx.moveTo(s.x, s.y - size);
                ctx.lineTo(s.x - size/2, s.y);
                ctx.lineTo(s.x + size/2, s.y);
                ctx.fill();
            } else if (s.type === 'kart') {
                // Desenha Rival
                const k = s.obj;
                this.drawHorizonCar(ctx, s.x, s.y, size*0.002, k.color, k.bodyColor, 0);
            }
        },

        drawPlayer: function(ctx, w, h) {
            // Carro do jogador sempre no centro horizontal, baixo
            const scale = w * 0.0025;
            const cx = w/2;
            const cy = h * 0.85 + this.bounce;
            
            // Inclinação visual baseada na curva e volante
            const tilt = (this.steer * 0.1) + (this.spinAngle * Math.PI/180);
            
            const char = CHARACTERS[this.selectedChar];
            this.drawHorizonCar(ctx, cx, cy, scale, char.color, char.bodyColor, tilt);
        },

        // --- FUNÇÃO DE DESENHO DE CARRO (SEM IMAGENS) ---
        drawHorizonCar: function(ctx, x, y, s, color1, color2, tilt) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(tilt);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 10, 80, 20, 0, 0, Math.PI*2); ctx.fill();

            // Pneus (Largos)
            ctx.fillStyle = '#111';
            ctx.fillRect(-70, -10, 30, 40); // Esq
            ctx.fillRect(40, -10, 30, 40);  // Dir

            // Chassi (Corpo Principal)
            ctx.fillStyle = color2; // Cor Escura
            ctx.beginPath();
            ctx.moveTo(-60, -20); ctx.lineTo(60, -20);
            ctx.lineTo(70, 10); ctx.lineTo(-70, 10);
            ctx.fill();

            // Capô/Topo (Cor Clara)
            ctx.fillStyle = color1;
            ctx.beginPath();
            ctx.moveTo(-50, -30); ctx.lineTo(50, -30);
            ctx.lineTo(60, 0); ctx.lineTo(-60, 0);
            ctx.fill();

            // Vidro Traseiro
            ctx.fillStyle = '#aaddff';
            ctx.beginPath();
            ctx.moveTo(-30, -35); ctx.lineTo(30, -35);
            ctx.lineTo(40, -25); ctx.lineTo(-40, -25);
            ctx.fill();

            // Aerofólio
            ctx.fillStyle = '#111';
            ctx.fillRect(-55, -40, 110, 10);
            ctx.fillStyle = color1;
            ctx.fillRect(-55, -40, 10, 20); // Suporte E
            ctx.fillRect(45, -40, 10, 20);  // Suporte D

            // Lanternas (Brilham com freio/turbo)
            const lightColor = this.speed < 10 ? '#f00' : (this.boostTimer > 0 ? '#0ff' : '#800');
            ctx.fillStyle = lightColor;
            ctx.fillRect(-50, 0, 30, 10);
            ctx.fillRect(20, 0, 30, 10);

            // Placa / Detalhe
            ctx.fillStyle = '#fff';
            ctx.fillRect(-15, 0, 30, 10);
            ctx.fillStyle = '#000';
            ctx.font = '8px Arial'; ctx.fillText('KART', -10, 8);

            ctx.restore();
        },

        // --- HUD ---
        renderHUD: function(ctx, w, h) {
            // Velocímetro
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'right';
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 20, 50);
            ctx.font = "16px Arial";
            ctx.fillText("KM/H", w - 20, 75);

            // Barra Nitro
            ctx.fillStyle = '#333';
            ctx.fillRect(w - 30, 90, 10, 100);
            ctx.fillStyle = this.boostTimer > 0 ? '#0ff' : '#f1c40f';
            const bh = (this.nitro / 100) * 100;
            ctx.fillRect(w - 30, 190 - bh, 10, bh);

            // Posição
            ctx.textAlign = 'left';
            ctx.font = "italic bold 60px 'Russo One'";
            ctx.fillText(this.rank, 20, 60);
            ctx.font = "20px Arial";
            ctx.fillText("POS", 60, 60);
            ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 90);

            // Volante Virtual
            if(this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save();
                ctx.translate(vw.x, vw.y);
                ctx.globalAlpha = vw.opacity;
                ctx.rotate(this.targetSteer * 1.5);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(0,0,vw.r,0,Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0,-vw.r,10,0,Math.PI*2); ctx.fill();
                ctx.restore();
            }
        },

        // --- SISTEMAS DE MENU (SIMPLES E FUNCIONAL) ---
        renderModeSelect: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,0,h);
            grad.addColorStop(0, '#111'); grad.addColorStop(1, '#333');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("HORIZON KART", w/2, h*0.2);

            this.drawBtn(ctx, "SOLO RACE", w/2, h*0.4, '#e67e22', ()=>this.selectMode('SOLO'));
            this.drawBtn(ctx, "MULTIPLAYER", w/2, h*0.6, '#27ae60', ()=>this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#222'; ctx.fillRect(0,0,w,h);
            
            // Seleção Char
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color;
            ctx.beginPath(); ctx.arc(w/2, h*0.3, 50, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 30px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.3 + 80);
            
            // Botões troca char
            this.drawBtn(ctx, "<", w/2 - 120, h*0.3, '#555', ()=>{ 
                this.selectedChar = (this.selectedChar-1+CHARACTERS.length)%CHARACTERS.length; 
                window.Sfx.click();
            }, 60);
            this.drawBtn(ctx, ">", w/2 + 120, h*0.3, '#555', ()=>{ 
                this.selectedChar = (this.selectedChar+1)%CHARACTERS.length; 
                window.Sfx.click();
            }, 60);

            // Botão Start
            const txt = this.isReady ? "AGUARDANDO..." : "ACELERAR!";
            const col = this.isReady ? '#777' : '#e67e22';
            this.drawBtn(ctx, txt, w/2, h*0.8, col, ()=>this.toggleReady());
        },

        drawBtn: function(ctx, txt, x, y, color, action, w=300) {
            const h = 60;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.roundRect(x - w/2, y - h/2, w, h, 10); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = "bold 20px Arial"; ctx.textAlign='center';
            ctx.fillText(txt, x, y + 8);
            this.buttons.push({x: x-w/2, y: y-h/2, w, h, action});
        },

        // --- NETWORK & LOGIC HELPERS ---
        selectMode: function(mode) {
            this.createTrack(this.selectedTrack); // GERA A PISTA AQUI!
            if(mode === 'MULTI') {
                if(!window.DB) { window.System.msg("OFFLINE"); this.selectMode('SOLO'); return; }
                this.isOnline = true; this.connectNet(); this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                this.rivals = [
                    { id:'cpu1', name:'RIVAL 1', color:'#8e44ad', bodyColor:'#5e3370', x:-0.5, pos:0, speed:0, isRemote:false },
                    { id:'cpu2', name:'RIVAL 2', color:'#2ecc71', bodyColor:'#27ae60', x:0.5, pos:200, speed:0, isRemote:false }
                ];
                this.state = 'LOBBY';
            }
        },

        connectNet: function() {
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            const p = this.dbRef.child(`players/${window.System.playerId}`);
            p.set({ name: 'P1', ready: false });
            p.onDisconnect().remove();
            
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                this.rivals = Object.keys(d).filter(k=>k!==window.System.playerId).map(k=>({
                    id:k, isRemote:true, ...d[k], 
                    color: CHARACTERS[d[k].charId||0].color, 
                    bodyColor: CHARACTERS[d[k].charId||0].bodyColor 
                }));
                if(Object.values(d).every(x=>x.ready) && Object.keys(d).length > 1 && this.state === 'WAITING') {
                    this.state = 'RACE';
                    document.getElementById('nitro-btn-kart').style.display = 'flex';
                }
            });
        },

        syncNetwork: function() {
            if(Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    x: this.playerX, pos: Math.floor(this.pos), speed: Math.floor(this.speed), 
                    charId: this.selectedChar
                });
            }
        },

        toggleReady: function() {
            if(this.isOnline) {
                this.isReady = !this.isReady;
                this.dbRef.child(`players/${window.System.playerId}`).update({ready:this.isReady, charId:this.selectedChar});
                this.state = this.isReady ? 'WAITING' : 'LOBBY';
            } else {
                this.state = 'RACE';
                document.getElementById('nitro-btn-kart').style.display = 'flex';
                window.Sfx.play(600, 'square', 0.5, 0.2);
            }
        },

        setupInput: function() {
            let nBtn = document.getElementById('nitro-btn-kart');
            if(!nBtn) {
                nBtn = document.createElement('div');
                nBtn.id = 'nitro-btn-kart';
                nBtn.innerText = "N";
                Object.assign(nBtn.style, {
                    position:'absolute', top:'45%', right:'20px', width:'80px', height:'80px',
                    borderRadius:'50%', background:'linear-gradient(#f39c12, #d35400)', border:'4px solid #fff',
                    color:'#fff', display:'none', alignItems:'center', justifyContent:'center',
                    fontFamily:'sans-serif', fontWeight:'bold', fontSize:'30px', zIndex:'100', cursor:'pointer'
                });
                document.body.appendChild(nBtn);
                const boost = (e) => { 
                    e.preventDefault(); 
                    if(this.state==='RACE' && this.nitro>25) { 
                        this.nitro-=25; this.boostTimer=60; this.speed+=50; 
                        window.Sfx.play(800,'sawtooth',0.3,0.1);
                    } 
                };
                nBtn.onmousedown = boost; nBtn.ontouchstart = boost;
            }

            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = (e.clientX - r.left) * (window.System.canvas.width / r.width);
                const y = (e.clientY - r.top) * (window.System.canvas.height / r.height);
                
                // Botões
                for(let b of this.buttons) {
                    if(x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) {
                        b.action(); return;
                    }
                }
                
                // Touch Steering
                if(this.state === 'RACE') {
                    if(x < window.System.canvas.width * 0.4) this.targetSteer = -1;
                    else if(x > window.System.canvas.width * 0.6) this.targetSteer = 1;
                    else this.targetSteer = 0;
                }
            };
        }
    };

    // Registro
    if(window.System) {
        window.System.registerGame('drive', 'Horizon Kart', '🏎️', Logic, {camOpacity: 0.15});
    }

})();
