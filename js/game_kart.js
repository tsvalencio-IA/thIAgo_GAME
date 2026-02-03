// =============================================================================
// KART LEGENDS: ULTIMATE ARCADE ENGINE (V6.0 - FINAL GOLD)
// ARQUITETO: SENIOR GAME DEV
// FEATURES: FÍSICA DRIFT, CARROS 3D, GESTO TURBO, MINIMAPA REAL
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. ASSETS & TUNING
    // -----------------------------------------------------------------
    const COLORS = {
        SKY: ['#00B4DB', '#0083B0'],
        GROUND: { light: '#55aa44', dark: '#448833' },
        ROAD: { light: '#7f8c8d', dark: '#707b7c' },
        RUMBLE: { light: '#c0392b', dark: '#ecf0f1' } // Zebra clássica
    };

    const CAR_SPECS = [
        { id: 0, name: 'F-ROSSO', color: '#c0392b', speed: 1.0, grip: 0.96, model: 'sport' },
        { id: 1, name: 'Y-STINGER', color: '#f1c40f', speed: 1.05, grip: 0.92, model: 'muscle' },
        { id: 2, name: 'B-THUNDER', color: '#2980b9', speed: 0.95, grip: 0.98, model: 'hatch' }
    ];

    const TRACKS = [
        { id: 0, name: 'ALPINE HILLS', theme: 'grass', curveMult: 1.0, len: 1600 },
        { id: 1, name: 'NEON CITY', theme: 'city', curveMult: 1.2, len: 2000 },
        { id: 2, name: 'DESERT CANYON', theme: 'sand', curveMult: 0.9, len: 1800 }
    ];

    const CONF = {
        SEGMENT_LENGTH: 200,
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2000,
        CAMERA_HEIGHT: 1200, // Altura perfeita para ver a pista
        CAMERA_DEPTH: 0.8,   // Campo de visão
        DRAW_DISTANCE: 300,
        MAX_SPEED: 260,
        ACCEL: 1.2,
        BREAKING: 3.0,
        DECEL: 0.98,
        OFFROAD_DECEL: 0.94,
        CENTRIFUGAL: 0.3
    };

    // -----------------------------------------------------------------
    // 2. ENGINE LÓGICA
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'kart_pro_v1',
        
        // Seleção
        selectedChar: 0,
        selectedTrack: 0,
        
        // Multiplayer
        isOnline: false, isReady: false, dbRef: null, rivals: [], lastSync: 0,

        // Física
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, boostTimer: 0, spinTimer: 0, spinAngle: 0,
        
        // Mundo
        segments: [], trackLength: 0, minimap: [],
        bounce: 0, skyOffset: 0,
        
        // Input
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        buttons: [],

        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.resetPhysics();
            this.setupUI();
            window.System.msg("KART LEGENDS");
        },

        cleanup: function() {
            if(this.dbRef) try { this.dbRef.off(); } catch(e){}
            const btn = document.getElementById('nitro-btn-kart');
            if(btn) btn.remove();
        },

        resetPhysics: function() {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.nitro = 100; this.boostTimer = 0; this.spinTimer = 0; this.spinAngle = 0;
            this.lap = 1; this.totalLaps = 3; this.rank = 1;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        // --- GERAÇÃO DE PISTA PROFISSIONAL ---
        createTrack: function(trackId) {
            this.segments = [];
            this.minimap = [];
            const trk = TRACKS[trackId];
            
            // Gerador de Pista com Curvas Suaves (S-Curves, Retas, Grampos)
            let mapX=0, mapY=0, mapAngle=0;

            const addSegment = (curve, y) => {
                // Props (Decoração)
                let sprites = [];
                // Lógica de spawn de props baseada no tema
                if (Math.random() > 0.95) {
                    const side = Math.random() > 0.5 ? 1 : -1;
                    const dist = 3 + Math.random()*5;
                    const type = trk.theme === 'city' ? (Math.random()>0.5?'pole':'billboard') 
                               : trk.theme === 'sand' ? 'cactus' 
                               : 'tree';
                    sprites.push({ type, x: side * dist });
                }
                // Obstáculos
                if (Math.random() > 0.99) sprites.push({ type: 'rock', x: (Math.random()-0.5)*1.5 });

                this.segments.push({
                    curve: curve * trk.curveMult,
                    y: y,
                    sprites: sprites,
                    index: this.segments.length
                });

                // Minimapa
                mapAngle += curve * 0.003;
                mapX += Math.sin(mapAngle); mapY -= Math.cos(mapAngle);
                this.minimap.push({x: mapX, y: mapY});
            };

            const addRoad = (enter, hold, leave, curve, y=0) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter), y);
                for(let i=0; i<hold; i++)  addSegment(curve, y);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave), y);
            };

            // Layout da Pista (Desenhado à mão para flow)
            addRoad(50, 50, 50, 0);       // Largada
            addRoad(50, 50, 50, 2);       // Curva Direita
            addRoad(50, 50, 50, 0);
            addRoad(50, 50, 50, -2);      // Curva Esquerda
            addRoad(100, 100, 100, 0);    // Reta Longa
            addRoad(50, 50, 50, 3);       // Curva Fechada
            addRoad(50, 50, 50, -1);      // Chicane
            addRoad(50, 50, 50, 0);       // Final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        getSegment: function(position) {
            if (this.segments.length === 0) return { curve: 0, sprites: [] };
            const index = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[index];
        },

        // --- UPDATE LOOP ---
        update: function(ctx, w, h, pose) {
            this.buttons = []; // Reset click zones

            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            
            // JOGO RODANDO
            this.processInput(w, h, pose);
            this.updatePhysics();
            this.updateAI();
            
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline) this.syncNetwork();

            return Math.floor(this.score);
        },

        // --- CONTROLES ---
        processInput: function(w, h, pose) {
            if(this.spinTimer > 0) return;

            let handsFound = false;
            // Detecção via WebCam
            if(pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                const nose = pose.keypoints.find(k=>k.name==='nose');

                if(lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    handsFound = true;
                    // Mapeamento
                    const lx = (1 - lw.x/640)*w; const ly = (lw.y/480)*h;
                    const rx = (1 - rw.x/640)*w; const ry = (rw.y/480)*h;
                    
                    // Direção
                    const dx = rx - lx; const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = angle * 2.5; 
                    
                    // Gesto de Turbo (Mãos altas)
                    let isHigh = false;
                    if (nose && nose.score > 0.2) {
                        const ny = (nose.y/480)*h;
                        if (ly < ny && ry < ny) isHigh = true;
                    }
                    this.virtualWheel = { x: (lx+rx)/2, y: (ly+ry)/2, r: Math.hypot(dx,dy)/2, opacity: 1, isHigh: isHigh };

                    if (isHigh && this.nitro > 0) this.activateTurbo();
                }
            }

            if(!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                // Auto-center suave
                if(Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.85; else this.targetSteer = 0;
            }

            // Suavização do input (Inércia do volante)
            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        activateTurbo: function() {
            if (this.nitro > 0.5) {
                this.nitro -= 0.5;
                this.boostTimer = 10;
                if (this.speed < CONF.MAX_SPEED + 80) this.speed += 3;
                window.Gfx.shakeScreen(2);
            }
        },

        // --- FÍSICA ARCADE ---
        updatePhysics: function() {
            const carSpec = CAR_SPECS[this.selectedChar];
            const currentSeg = this.getSegment(this.pos);
            const ratio = this.speed / CONF.MAX_SPEED;

            // Aceleração / Freio
            let maxS = (this.boostTimer > 0 ? CONF.MAX_SPEED + 80 : CONF.MAX_SPEED) * carSpec.speed;
            
            // Terreno
            if(Math.abs(this.playerX) > 2.2) { // Offroad
                maxS *= 0.4; 
                this.bounce = (Math.random()-0.5)*8; 
                this.speed *= CONF.OFFROAD_DECEL;
            } else {
                this.bounce = Math.sin(this.pos * 0.05) * (this.speed * 0.005); // Vibração do motor
            }

            if(this.spinTimer > 0) {
                this.speed *= 0.94;
                this.spinAngle += 35; // Gira visualmente no eixo Y (como um pião, sim, mas só no crash)
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                if(this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= 0.99; // Drag
            }

            // Física de Curva (O segredo do Arcade)
            // Centrifuga: Joga pra fora baseado na velocidade e curva
            const centrifugal = -(currentSeg.curve * (ratio * ratio)) * CONF.CENTRIFUGAL;
            // Virada: Baseada no input e aderência
            const turnForce = this.steer * ratio * 2.5 * carSpec.grip;
            
            this.playerX += (turnForce + centrifugal);

            // Colisões com Muros
            if(this.playerX < -3.5) { this.playerX = -3.5; this.speed *= 0.9; }
            if(this.playerX > 3.5) { this.playerX = 3.5; this.speed *= 0.9; }

            // Avanço
            this.pos += this.speed;
            while(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while(this.pos < 0) this.pos += this.trackLength;

            // Parallax
            this.skyOffset -= (currentSeg.curve * 0.05 * ratio) + (this.steer * 0.01);

            if(this.boostTimer > 0) this.boostTimer--;
            if(this.nitro < 100) this.nitro += 0.05;

            // Colisão com Objetos
            for(let s of currentSeg.sprites) {
                if(s.type === 'rock' && Math.abs(this.playerX - s.x) < 0.8) {
                    this.crash();
                    s.x = 999; // Remove
                }
            }
        },

        updateAI: function() {
            let rk = 1;
            const myTot = this.lap * this.trackLength + this.pos;
            
            this.rivals.forEach(r => {
                if(!r.isRemote) {
                    const rSeg = this.getSegment(r.pos);
                    // IA segue a curva suavemente
                    r.x += (-(rSeg.curve * 0.5) - r.x) * 0.05;
                    // Velocidade
                    let targetS = CONF.MAX_SPEED * 0.95;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    
                    // Colisão Carro x Carro
                    const dz = Math.abs(r.pos - this.pos);
                    if((dz < 300 || Math.abs(dz - this.trackLength) < 300) && Math.abs(r.x - this.playerX) < 0.7) {
                        if(this.spinTimer <= 0) { 
                            this.crash(); 
                            r.speed *= 0.8; 
                            // Empurrão
                            const push = (this.playerX - r.x) > 0 ? 0.5 : -0.5;
                            this.playerX += push;
                        }
                    }
                    r.pos += r.speed;
                    if(r.pos >= this.trackLength) { r.pos -= this.trackLength; r.lap++; }
                }
                const rTot = (r.lap || 1) * this.trackLength + r.pos;
                if(rTot > myTot) rk++;
            });
            this.rank = rk;
        },

        crash: function() {
            this.spinTimer = 45;
            this.speed *= 0.5;
            window.Sfx.crash();
            window.Gfx.shakeScreen(25);
            window.System.msg("BATIDA!");
        },

        finishRace: function() {
            this.state = 'FINISHED';
            const btn = document.getElementById('nitro-btn-kart');
            if(btn) btn.style.display = 'none';
            setTimeout(() => {
                window.System.gameOver(this.rank === 1 ? "CAMPEÃO!" : `${this.rank}º LUGAR`);
            }, 1500);
        },

        // =================================================================
        // RENDERIZAÇÃO PROFISSIONAL (PSEUDO-3D)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const horizon = h * 0.45;
            
            // 1. CÉU E PARALLAX
            // Gradiente
            const trkTheme = TRACKS[this.selectedTrack].theme;
            const skyCols = trkTheme === 'city' ? ['#0f0c29', '#302b63'] : ['#2980b9', '#6dd5fa'];
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, skyCols[0]); grad.addColorStop(1, skyCols[1]);
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);

            // Montanhas/Prédios (Parallax)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                let offset = (this.skyOffset * w) % w;
                let mx = (i * w/10) + offset;
                if(mx < -w/10) mx += w + w/10;
                let my = horizon - 50 - (Math.abs(Math.sin(i*132))*50);
                if (trkTheme === 'city') {
                    // Prédios quadrados
                    ctx.lineTo(mx, my); ctx.lineTo(mx + w/15, my);
                } else {
                    // Montanhas
                    ctx.lineTo(mx, my);
                }
            }
            ctx.lineTo(w*2, horizon); ctx.lineTo(0, horizon); ctx.fill();

            // Chão Base
            ctx.fillStyle = trkTheme === 'sand' ? '#e67e22' : (trkTheme==='city'?'#2c3e50':'#388e3c');
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. ESTRADA (PAINTER'S ALGORITHM)
            // Desenha de trás para frente para sobreposição correta
            const startPos = this.pos;
            const startIdx = Math.floor(startPos / CONF.SEGMENT_LENGTH);
            const camH = CONF.CAMERA_HEIGHT + this.bounce;
            
            let x = 0, dx = 0;
            let maxY = h; 
            
            const baseSeg = this.getSegment(startPos);
            const basePct = (startPos % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            dx = -(baseSeg.curve * basePct); 
            
            let spritesDrawOrder = [];

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const idx = (startIdx + n) % this.segments.length;
                const seg = this.segments[idx];
                
                const segmentZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (startPos % CONF.SEGMENT_LENGTH));
                if(segmentZ < 1) continue;

                // Projeção 3D
                const scale = CONF.CAMERA_DEPTH / segmentZ;
                const screenY = horizon + (scale * camH);
                
                // Curva acumulada
                x += dx; dx += seg.curve;
                
                // Oclusão (Importante: só desenha se estiver "abaixo" do segmento anterior na tela)
                if(screenY >= maxY) {
                    // Mesmo oculto, precisamos acumular sprites para desenhar depois
                } else {
                    // Desenha Estrada
                    const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                    const screenW = CONF.ROAD_WIDTH * scale;
                    this.drawRoadSegment(ctx, w, screenX, screenY, screenW, maxY, idx, trkTheme);
                    maxY = screenY; // Atualiza horizonte de corte
                }

                // Coleta Sprites e Carros para desenhar depois (no topo da estrada)
                // Calcular posição na tela mesmo se a estrada foi cortada
                const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                const screenW = CONF.ROAD_WIDTH * scale;

                // Cenário
                seg.sprites.forEach(s => {
                    spritesDrawOrder.push({ type:s.type, x:screenX + (s.x * screenW), y:screenY, scale:scale, dist:segmentZ });
                });

                // Rivais
                this.rivals.forEach(r => {
                    const rIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
                    if(rIdx === idx) {
                        spritesDrawOrder.push({ 
                            type:'kart', obj:r, 
                            x:screenX + (r.x * screenW), y:screenY, scale:scale, dist:segmentZ 
                        });
                    }
                });
            }

            // 3. DESENHA SPRITES (Longe -> Perto)
            for(let i=spritesDrawOrder.length-1; i>=0; i--) {
                this.drawSprite(ctx, spritesDrawOrder[i]);
            }

            // 4. DESENHA PLAYER
            this.drawPlayerCar(ctx, w, h);
        },

        drawRoadSegment: function(ctx, w, x, y, width, clipY, idx, theme) {
            const isAlt = (Math.floor(idx / CONF.RUMBLE_LENGTH) % 2) === 0;
            const h = clipY - y; // Altura para preencher buracos

            // Cores
            let rC = isAlt ? COLORS.RUMBLE.light : COLORS.RUMBLE.dark;
            let rdC = isAlt ? COLORS.ROAD.light : COLORS.ROAD.dark;
            let gC = theme === 'sand' ? '#d35400' : (theme==='city'?'#34495e':'#2e7d32');
            if (isAlt) gC = theme === 'sand' ? '#e67e22' : (theme==='city'?'#2c3e50':'#388e3c');

            // Grama/Fundo Lateral
            ctx.fillStyle = gC; ctx.fillRect(0, y, w, h);

            // Zebra
            const rumbleW = width * 1.2;
            ctx.fillStyle = rC; ctx.fillRect(x - rumbleW, y, rumbleW*2, h);

            // Estrada
            ctx.fillStyle = rdC; ctx.fillRect(x - width, y, width*2, h);

            // Linha Central
            if(isAlt) {
                ctx.fillStyle = '#fff'; ctx.fillRect(x - width*0.05, y, width*0.1, h);
            }
        },

        drawSprite: function(ctx, s) {
            const size = s.scale * window.innerWidth * 1.5; // Tamanho base escalado
            const x = s.x; const y = s.y;
            
            if (s.type === 'kart') {
                const k = s.obj;
                const spec = CAR_SPECS[k.charId||0];
                this.draw3DCar(ctx, x, y, s.scale * window.innerWidth * 0.003, spec.color, 0, 0); // Rival sem tilt complexo
                // Nome
                ctx.fillStyle = '#fff'; ctx.font='10px Arial'; ctx.textAlign='center';
                ctx.fillText('P2', x, y - size*0.05);
            }
            else if (s.type === 'tree') {
                ctx.fillStyle = '#2d3436'; ctx.fillRect(x-size*0.05, y-size*0.3, size*0.1, size*0.3); // Tronco
                ctx.fillStyle = '#00b894'; ctx.beginPath(); ctx.moveTo(x-size*0.2, y-size*0.3); ctx.lineTo(x, y-size); ctx.lineTo(x+size*0.2, y-size*0.3); ctx.fill();
            }
            else if (s.type === 'cactus') {
                ctx.fillStyle = '#27ae60'; ctx.roundRect(x-size*0.05, y-size*0.4, size*0.1, size*0.4, 5); ctx.fill();
                ctx.fillRect(x-size*0.1, y-size*0.25, size*0.2, size*0.05);
            }
            else if (s.type === 'pole') {
                ctx.fillStyle = '#bdc3c7'; ctx.fillRect(x-size*0.02, y-size*0.8, size*0.04, size*0.8);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(x, y-size*0.8, size*0.05, 0, Math.PI*2); ctx.fill();
            }
            else if (s.type === 'rock') {
                ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(x, y, size*0.1, Math.PI, 0); ctx.fill();
            }
        },

        // --- RENDERIZADOR DE CARRO 3D (O PULO DO GATO) ---
        drawPlayerCar: function(ctx, w, h) {
            const scale = w * 0.0035;
            const cx = w/2;
            const cy = h * 0.9 + this.bounce;
            const car = CAR_SPECS[this.selectedChar];
            
            // Aqui está a mágica: NÃO rodamos o canvas (exceto no crash).
            // Nós desenhamos o carro com perspectiva baseada no 'steer'.
            // Steer -1 (Esq) -> Mostra lateral direita.
            // Steer 1 (Dir) -> Mostra lateral esquerda.
            
            const turnFactor = this.steer; // -1 a 1
            const crashRot = this.spinAngle * Math.PI/180;

            if (this.spinTimer > 0) {
                // No crash, aí sim rodamos o mundo
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(crashRot);
                this.draw3DCar(ctx, 0, 0, scale, car.color, 0, 0); // Desenha reto no contexto rodado
                ctx.restore();
            } else {
                // Desenho normal com "Banking"
                this.draw3DCar(ctx, cx, cy, scale, car.color, turnFactor, this.boostTimer > 0);
            }
        },

        draw3DCar: function(ctx, x, y, s, color, turn, turbo) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);

            // Cores
            const shadow = 'rgba(0,0,0,0.5)';
            const tire = '#1e1e1e';
            const rim = '#bdc3c7';
            const win = '#81d4fa';
            
            // Dimensões base
            const W = 140; // Largura corpo
            const H = 60;  // Altura traseira
            const TW = 40; // Largura Pneu
            
            // Perspectiva: Deslocamento X das camadas superiores
            // Se viro pra esquerda (turn < 0), o topo vai pra esquerda
            const bank = turn * 20; 

            // 1. Sombra
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.ellipse(0, 20, W*0.8, 20, 0, 0, Math.PI*2); ctx.fill();

            // 2. Pneus (Traseiros)
            // Se virar muito, um pneu fica mais visível
            ctx.fillStyle = tire;
            ctx.fillRect(-W/2 - TW + bank/2, -H/2, TW, H/1.5); // Esq
            ctx.fillRect(W/2 - bank/2, -H/2, TW, H/1.5);       // Dir
            // Calotas
            ctx.fillStyle = rim;
            ctx.fillRect(-W/2 - TW + 5 + bank/2, -H/2 + 10, TW-10, H/3);
            ctx.fillRect(W/2 + 5 - bank/2, -H/2 + 10, TW-10, H/3);

            // 3. Chassis (Parte de baixo)
            ctx.fillStyle = '#222'; // Para-choque escuro
            ctx.beginPath();
            ctx.moveTo(-W/2 + bank, 0);
            ctx.lineTo(W/2 + bank, 0);
            ctx.lineTo(W/2 - 10, 25);
            ctx.lineTo(-W/2 + 10, 25);
            ctx.fill();

            // 4. Carroceria (Traseira)
            ctx.fillStyle = color;
            ctx.fillRect(-W/2 + bank, -H, W, H);
            
            // Detalhe lateral (Simulando 3D)
            if (Math.abs(turn) > 0.1) {
                ctx.fillStyle = '#922b21'; // Cor mais escura para lateral
                ctx.beginPath();
                if (turn < 0) { // Mostra lateral direita
                    ctx.moveTo(W/2 + bank, -H);
                    ctx.lineTo(W/2 + bank + 20, -H + 10);
                    ctx.lineTo(W/2 + bank + 20, 0);
                    ctx.lineTo(W/2 + bank, 0);
                } else { // Mostra lateral esquerda
                    ctx.moveTo(-W/2 + bank, -H);
                    ctx.lineTo(-W/2 + bank - 20, -H + 10);
                    ctx.lineTo(-W/2 + bank - 20, 0);
                    ctx.lineTo(-W/2 + bank, 0);
                }
                ctx.fill();
            }

            // 5. Lanternas
            const lightColor = this.speed < 10 ? '#ff0000' : (turbo ? '#00ffff' : '#880000');
            ctx.fillStyle = lightColor;
            ctx.fillRect(-W/2 + 10 + bank, -H + 10, 40, 15);
            ctx.fillRect(W/2 - 50 + bank, -H + 10, 40, 15);

            // 6. Cabine / Vidro
            ctx.fillStyle = win;
            ctx.beginPath();
            ctx.moveTo(-W/3 + bank*1.5, -H);
            ctx.lineTo(W/3 + bank*1.5, -H);
            ctx.lineTo(W/4 + bank*2, -H - 30);
            ctx.lineTo(-W/4 + bank*2, -H - 30);
            ctx.fill();

            // 7. Aerofólio
            ctx.fillStyle = '#111';
            ctx.fillRect(-W/2 - 10 + bank, -H - 5, W + 20, 10); // Asa
            ctx.fillStyle = color;
            ctx.fillRect(-W/4 + bank, -H, 10, -10); // Suportes
            ctx.fillRect(W/4 + bank, -H, 10, -10);

            // 8. Fogo do Turbo
            if (turbo) {
                ctx.fillStyle = `rgba(0, 255, 255, ${Math.random()})`;
                ctx.beginPath();
                ctx.moveTo(-10 + bank, 10);
                ctx.lineTo(10 + bank, 10);
                ctx.lineTo(0 + bank, 10 + Math.random()*40);
                ctx.fill();
            }

            ctx.restore();
        },

        // --- HUD E UI ---
        renderHUD: function(ctx, w, h) {
            // Velocímetro
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 30, 60);
            ctx.font = "16px Arial"; ctx.fillText("KM/H", w - 30, 85);

            // Barra Nitro
            ctx.fillStyle = '#222'; ctx.fillRect(w - 40, 100, 15, 120);
            ctx.fillStyle = this.boostTimer > 0 ? '#00ffff' : '#f1c40f';
            const bh = (this.nitro / 100) * 116;
            ctx.fillRect(w - 38, 218 - bh, 11, bh);

            // Volante
            if(this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save(); ctx.translate(vw.x, vw.y); ctx.globalAlpha = vw.opacity;
                if(vw.isHigh) { ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff'; }
                ctx.rotate(this.targetSteer * 1.5);
                ctx.strokeStyle = vw.isHigh ? '#00ffff' : '#fff'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(0,0,vw.r,0,Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0,-vw.r,12,0,Math.PI*2); ctx.fill();
                ctx.restore();
            }

            // Minimapa
            if(this.minimap.length > 0) {
                const ms = 120; const mx = 30; const my = 150;
                ctx.save(); ctx.translate(mx + ms/2, my + ms/2);
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
                ctx.beginPath();
                this.minimap.forEach((p,i) => { 
                    if(i===0) ctx.moveTo(p.x*2, p.y*2); else ctx.lineTo(p.x*2, p.y*2); 
                });
                ctx.closePath(); ctx.stroke();
                // Player Dot
                const pIdx = Math.floor((this.pos / this.trackLength) * this.minimap.length) % this.minimap.length;
                if(this.minimap[pIdx]) {
                    ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(this.minimap[pIdx].x*2, this.minimap[pIdx].y*2, 4, 0, Math.PI*2); ctx.fill();
                }
                ctx.restore();
            }
        },

        setupUI: function() {
            let nBtn = document.getElementById('nitro-btn-kart');
            if(!nBtn) {
                nBtn = document.createElement('div'); nBtn.id = 'nitro-btn-kart'; nBtn.innerText = "N";
                Object.assign(nBtn.style, {
                    position:'absolute', top:'45%', right:'20px', width:'80px', height:'80px',
                    borderRadius:'50%', background:'linear-gradient(#f39c12, #d35400)', border:'4px solid #fff',
                    color:'#fff', display:'none', alignItems:'center', justifyContent:'center',
                    fontFamily:'sans-serif', fontWeight:'bold', fontSize:'30px', zIndex:'100', cursor:'pointer'
                });
                document.body.appendChild(nBtn);
                const boost = (e) => { 
                    if(e.cancelable) e.preventDefault(); 
                    if(this.state==='RACE' && this.nitro>25) this.activateTurbo(); 
                };
                nBtn.onmousedown = boost; nBtn.ontouchstart = boost;
            }
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = (e.clientX - r.left) * (window.System.canvas.width / r.width);
                const y = (e.clientY - r.top) * (window.System.canvas.height / r.height);
                for(let b of this.buttons) { if(x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) { b.action(); return; } }
                if(this.state === 'RACE') {
                    if(x < window.System.canvas.width * 0.4) this.targetSteer = -1;
                    else if(x > window.System.canvas.width * 0.6) this.targetSteer = 1;
                    else this.targetSteer = 0;
                }
            };
        },

        renderModeSelect: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0, '#1a2a6c'); grad.addColorStop(1, '#b21f1f');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font = "italic bold 50px 'Russo One'"; ctx.fillText("KART LEGENDS", w/2, h*0.25);
            this.drawBtn(ctx, "JOGO RÁPIDO", w/2, h*0.5, '#e67e22', ()=>this.selectMode('SOLO'));
            this.drawBtn(ctx, "MULTIPLAYER", w/2, h*0.7, '#27ae60', ()=>this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
            const char = CAR_SPECS[this.selectedChar]; const trk = TRACKS[this.selectedTrack];
            
            // Preview 3D girando
            const time = Date.now() * 0.002;
            const turn = Math.sin(time);
            this.draw3DCar(ctx, w/2, h*0.35, w*0.005, char.color, turn, false);

            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 30px 'Russo One'"; ctx.fillText(char.name, w/2, h*0.15);
            ctx.font = "20px Arial"; ctx.fillText(trk.name, w/2, h*0.55);
            
            this.drawBtn(ctx, "< CARRO >", w/2, h*0.25, 'rgba(255,255,255,0.1)', ()=>{ this.selectedChar = (this.selectedChar+1)%CAR_SPECS.length; window.Sfx.click(); }, 400);
            this.drawBtn(ctx, "< PISTA >", w/2, h*0.6, 'rgba(255,255,255,0.1)', ()=>{ this.selectedTrack = (this.selectedTrack+1)%TRACKS.length; window.Sfx.click(); }, 400);
            const txt = this.isReady ? "AGUARDANDO..." : "ACELERAR!";
            this.drawBtn(ctx, txt, w/2, h*0.85, this.isReady?'#777':'#e67e22', ()=>this.toggleReady());
        },

        drawBtn: function(ctx, txt, x, y, color, action, width=300) {
            ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - width/2, y - 30, width, 60, 15); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = "bold 24px Arial"; ctx.textAlign='center'; ctx.fillText(txt, x, y + 8);
            this.buttons.push({x: x-width/2, y: y-30, w:width, h:60, action});
        },

        // --- REDE (Mantida igual para compatibilidade) ---
        selectMode: function(mode) {
            this.createTrack(this.selectedTrack); 
            if(mode === 'MULTI') {
                if(!window.DB) { window.System.msg("OFFLINE"); this.selectMode('SOLO'); return; }
                this.isOnline = true; this.connectNet(); this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                this.rivals = [
                    { id:'cpu1', charId: 1, x:-0.5, pos:0, speed:0, isRemote:false },
                    { id:'cpu2', charId: 2, x:0.5, pos:200, speed:0, isRemote:false }
                ];
                this.state = 'LOBBY';
            }
        },
        connectNet: function() {
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            const p = this.dbRef.child(`players/${window.System.playerId}`);
            p.set({ name: 'P1', ready: false }); p.onDisconnect().remove();
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                this.rivals = Object.keys(d).filter(k=>k!==window.System.playerId).map(k=>({
                    id:k, isRemote:true, ...d[k]
                }));
                if(Object.values(d).every(x=>x.ready) && Object.keys(d).length > 1 && this.state === 'WAITING') {
                    this.state = 'RACE'; document.getElementById('nitro-btn-kart').style.display = 'flex';
                }
            });
        },
        syncNetwork: function() {
            if(Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({ x: this.playerX, pos: Math.floor(this.pos), speed: Math.floor(this.speed), charId: this.selectedChar });
            }
        },
        toggleReady: function() {
            if(this.isOnline) {
                this.isReady = !this.isReady;
                this.dbRef.child(`players/${window.System.playerId}`).update({ready:this.isReady, charId:this.selectedChar});
                this.state = this.isReady ? 'WAITING' : 'LOBBY';
            } else {
                this.state = 'RACE'; document.getElementById('nitro-btn-kart').style.display = 'flex'; window.Sfx.play(600, 'square', 0.5, 0.2);
            }
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, {camOpacity: 0.15});
    }

})();
