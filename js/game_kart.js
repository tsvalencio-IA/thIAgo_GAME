// =============================================================================
// KART DO OTTO – HORIZON ULTIMATE EDITION (V4.0)
// ARQUITETO: SENIOR GAME DEV
// FEATURES: VISUAL HORIZON + MAPA REAL + TURBO GESTUAL + COLISÃO FÍSICA
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS E BALANCEAMENTO
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'CRIMSON FURY', color: '#e74c3c', bodyColor: '#c0392b', speedInfo: 1.0, turnInfo: 1.0 }, // Equilibrado
        { id: 1, name: 'GOLDEN ARROW', color: '#f1c40f', bodyColor: '#d35400', speedInfo: 1.08, turnInfo: 0.85 }, // Rápido, ruim de curva
        { id: 2, name: 'BLUE THUNDER', color: '#3498db', bodyColor: '#2980b9', speedInfo: 0.95, turnInfo: 1.15 }  // Curvas perfeitas
    ];

    const TRACKS = [
        { 
            id: 0, name: 'CALIFORNIA SUNSET', 
            colors: { sky: ['#ff7e5f', '#feb47b'], ground: '#6ab04c', road: '#555', roadLine: '#fff', grass: '#6ab04c', grassDark: '#569e3d', rumble: '#c0392b', rumble2: '#ecf0f1' },
            props: ['palm', 'tree'], curveMult: 1.0 
        },
        { 
            id: 1, name: 'NEON TOKYO NIGHT', 
            colors: { sky: ['#0f0c29', '#302b63'], ground: '#240b36', road: '#2c3e50', roadLine: '#f1c40f', grass: '#240b36', grassDark: '#1a0526', rumble: '#00d2ff', rumble2: '#8e44ad' },
            props: ['building', 'neon_sign'], curveMult: 1.2 
        },
        { 
            id: 2, name: 'ATACAMA DESERT', 
            colors: { sky: ['#2980b9', '#6dd5fa'], ground: '#e67e22', road: '#95a5a6', roadLine: '#fff', grass: '#e67e22', grassDark: '#d35400', rumble: '#d35400', rumble2: '#f39c12' },
            props: ['cactus', 'rock'], curveMult: 0.9 
        }
    ];

    const CONF = {
        SEGMENT_LENGTH: 200,
        ROAD_WIDTH: 2000,
        CAMERA_HEIGHT: 1000, 
        CAMERA_DEPTH: 0.84,  
        DRAW_DISTANCE: 300,  
        CENTRIFUGAL: 0.3,
        MAX_SPEED: 240,
        ACCEL: 1.5,
        BREAKING: 4.0
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        selectedChar: 0,
        selectedTrack: 0,
        
        // Multiplayer
        isOnline: false, isReady: false, dbRef: null, rivals: [], lastSync: 0,

        // Física
        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, boostTimer: 0, spinTimer: 0, spinAngle: 0,
        
        // Mundo
        segments: [], trackLength: 0, minimap: [],
        bounce: 0, visualTilt: 0, skyOffset: 0,
        
        // Input
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        buttons: [],

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
            this.lap = 1; this.totalLaps = 3; this.rank = 1;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        // --- GERAÇÃO DE PISTA & MINI-MAPA ---
        createTrack: function(trackId) {
            this.segments = [];
            this.minimap = [];
            const trk = TRACKS[trackId];
            
            // Variáveis para o Mini-Mapa
            let mapX = 0, mapY = 0, mapAngle = 0;

            const addSegment = (curve) => {
                // Props do cenário
                let obs = [];
                if (Math.random() > 0.92) {
                    const type = trk.props[Math.floor(Math.random() * trk.props.length)];
                    const side = Math.random() > 0.5 ? 1 : -1;
                    obs.push({ type: type, x: side * (2.5 + Math.random() * 3) });
                }
                if (Math.random() > 0.985) obs.push({ type: 'cone', x: (Math.random() - 0.5) * 1.5 });

                const actualCurve = curve * trk.curveMult;
                this.segments.push({ curve: actualCurve, y: 0, obs: obs });

                // Geração do Mini-Mapa (Geometria 2D simples)
                mapAngle += actualCurve * 0.003; 
                mapX += Math.sin(mapAngle);
                mapY -= Math.cos(mapAngle);
                this.minimap.push({x: mapX, y: mapY});
            };

            const addRoad = (enter, hold, leave, curve) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter));
                for(let i=0; i<hold; i++)  addSegment(curve);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave));
            };

            // Layout da Pista (Desenhado para ser divertido)
            addRoad(50, 50, 50, 0);         
            addRoad(50, 100, 50, 2);        
            addRoad(50, 50, 50, 0);         
            addRoad(50, 50, 50, -2);        
            addRoad(100, 100, 100, 3); 
            addRoad(50, 200, 50, 0);       
            addRoad(100, 100, 100, -3);     
            addRoad(50, 50, 50, 0);         

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        getSegment: function(position) {
            if (this.segments.length === 0) return { curve: 0, obs: [] };
            const index = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[index];
        },

        // --- LOOP PRINCIPAL ---
        update: function(ctx, w, h, pose) {
            this.buttons = [];

            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            
            this.processInput(w, h, pose);
            this.updatePhysics();
            this.updateAI();
            
            this.renderWorld(ctx, w, h);
            this.renderHUD(ctx, w, h);

            if(this.isOnline) this.syncNetwork();

            return Math.floor(this.score);
        },

        // --- INPUT: VOLANTE E GESTOS ---
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
                    
                    // TURBO GESTUAL: Se mãos acima do nariz
                    let isHigh = false;
                    if (nose && nose.score > 0.2) {
                        const ny = (nose.y/480)*h;
                        // Y cresce para baixo, então menor = mais alto
                        if (ly < ny && ry < ny) isHigh = true;
                    }
                    this.virtualWheel = { x: (lx+rx)/2, y: (ly+ry)/2, r: Math.hypot(dx,dy)/2, opacity: 1, isHigh: isHigh };

                    // Ativa Turbo se segurar em cima
                    if (isHigh && this.nitro > 0) {
                        this.activateTurbo();
                    }
                }
            }

            if(!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                if(Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.8;
                else this.targetSteer = 0;
            }

            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        activateTurbo: function() {
            if (this.nitro > 0.5) {
                this.nitro -= 0.5; // Gasta nitro
                this.boostTimer = 10;
                if (this.speed < 300) this.speed += 3;
                window.Gfx.shakeScreen(2);
            }
        },

        // --- FÍSICA E COLISÃO ---
        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const currentSeg = this.getSegment(this.pos);
            const ratio = this.speed / CONF.MAX_SPEED;

            // Velocidade Máxima
            let maxS = (this.boostTimer > 0 ? 340 : CONF.MAX_SPEED) * char.speedInfo;
            
            // Offroad
            if(Math.abs(this.playerX) > 2.2) { 
                maxS *= 0.4; 
                this.bounce = (Math.random()-0.5)*8; 
                this.speed *= 0.96; // Desacelera rápido
            } else {
                this.bounce *= 0.6;
            }

            // Aceleração / Spin
            if(this.spinTimer > 0) {
                this.speed *= 0.94;
                this.spinAngle += 35;
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                if(this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= 0.99; // Resistência do ar
            }

            // Curvas e Centrífuga (A "Mão" do Jogo)
            const centrifugal = -(currentSeg.curve * (ratio * ratio)) * CONF.CENTRIFUGAL;
            const turnForce = this.steer * ratio * 2.2 * char.turnInfo;
            this.playerX += (turnForce + centrifugal);

            // Muros Invisíveis
            if(this.playerX < -3.5) { this.playerX = -3.5; this.speed *= 0.9; }
            if(this.playerX > 3.5) { this.playerX = 3.5; this.speed *= 0.9; }

            // Avanço na pista
            this.pos += this.speed;
            while(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while(this.pos < 0) this.pos += this.trackLength;

            this.skyOffset -= (currentSeg.curve * 0.05 * ratio) + (this.steer * 0.01);

            if(this.boostTimer > 0) this.boostTimer--;
            if(this.nitro < 100) this.nitro += 0.05; // Regenera pouco

            // Colisão com Cones
            for(let o of currentSeg.obs) {
                if(o.type === 'cone' && Math.abs(this.playerX - o.x) < 0.8) {
                    this.crash();
                    o.x = 999; // Some com o cone
                }
            }
        },

        updateAI: function() {
            let rk = 1;
            const myTot = this.lap * this.trackLength + this.pos;
            
            this.rivals.forEach(r => {
                if(!r.isRemote) {
                    const rSeg = this.getSegment(r.pos);
                    // IA segue a curva
                    r.x += (-(rSeg.curve * 0.5) - r.x) * 0.05;
                    
                    let targetS = CONF.MAX_SPEED * 0.95;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    
                    // COLISÃO CARRO X CARRO
                    const dz = Math.abs(r.pos - this.pos);
                    const dx = Math.abs(r.x - this.playerX);
                    // Verifica se está perto no Z (considerando loop da pista) e no X
                    if((dz < 400 || Math.abs(dz - this.trackLength) < 400) && dx < 0.7) {
                        if(this.spinTimer <= 0) { 
                            this.crash(); 
                            r.speed *= 0.8; // Rival também perde velocidade
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
            this.spinTimer = 45; // 45 frames girando
            this.speed *= 0.5;   // Perde metade da velocidade
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
        // RENDERIZAÇÃO
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const colors = TRACKS[this.selectedTrack].colors;
            const cx = w / 2;
            const horizon = h * 0.45;

            // 1. Céu e Parallax
            const skyGrad = ctx.createLinearGradient(0,0,0,horizon);
            skyGrad.addColorStop(0, colors.sky[0]); skyGrad.addColorStop(1, colors.sky[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,horizon);

            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                let offset = (this.skyOffset * w) % w;
                let mx = (i * w/10) + offset;
                if(mx < -w/10) mx += w + w/10;
                const height = 60 + (i%3)*30;
                ctx.lineTo(mx, horizon - height);
            }
            ctx.lineTo(w + w, horizon); ctx.lineTo(0, horizon); ctx.fill();

            // Chão Base
            ctx.fillStyle = colors.ground; ctx.fillRect(0, horizon, w, h-horizon);

            // 2. Render Pista
            const startPos = this.pos;
            const startIdx = Math.floor(startPos / CONF.SEGMENT_LENGTH);
            const camH = CONF.CAMERA_HEIGHT + this.bounce;
            
            let x = 0, dx = 0;
            let maxY = h; 
            
            const baseSeg = this.getSegment(startPos);
            const basePct = (startPos % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            dx = -(baseSeg.curve * basePct); 
            
            let sprites = [];

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const idx = (startIdx + n) % this.segments.length;
                const seg = this.segments[idx];
                
                const segmentZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (startPos % CONF.SEGMENT_LENGTH));
                if(segmentZ < 1) continue;

                const scale = CONF.CAMERA_DEPTH / segmentZ;
                const screenY = horizon + (scale * camH);
                
                x += dx; dx += seg.curve;
                
                if(screenY >= maxY) continue;
                
                const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                const screenW = CONF.ROAD_WIDTH * scale;
                
                this.drawSegment(ctx, w, screenX, screenY, screenW, maxY, idx, colors);
                maxY = screenY;

                // Sprites
                this.rivals.forEach(r => {
                    const rSegIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
                    if(rSegIdx === idx) {
                        sprites.push({ type:'kart', obj:r, x:screenX + (r.x * screenW), y:screenY, s:scale * w * 0.002 });
                    }
                });
                seg.obs.forEach(o => {
                    const sx = screenX + (o.x * screenW);
                    sprites.push({ type:o.type, x:sx, y:screenY, s:scale * w * 0.0025 });
                });
            }

            for(let i=sprites.length-1; i>=0; i--) this.drawSprite(ctx, sprites[i]);
            this.drawPlayer(ctx, w, h);
        },

        drawSegment: function(ctx, w, x, y, width, clipY, idx, cols) {
            const isAlt = (Math.floor(idx / CONF.RUMBLE_LENGTH) % 2) === 0;
            const h = clipY - y; 
            ctx.fillStyle = isAlt ? cols.grassDark : cols.grass; ctx.fillRect(0, y, w, h);
            const rumbleW = width * 1.2;
            ctx.fillStyle = isAlt ? cols.rumble : cols.rumble2; ctx.fillRect(x - rumbleW, y, rumbleW*2, h);
            ctx.fillStyle = cols.road; ctx.fillRect(x - width, y, width*2, h);
            if(isAlt) { ctx.fillStyle = cols.roadLine; ctx.fillRect(x - width*0.05, y, width*0.1, h); }
        },

        drawSprite: function(ctx, s) {
            const size = s.s * 800; const x = s.x; const y = s.y;
            if (s.type === 'palm') {
                ctx.fillStyle = '#8d6e63'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+size*0.1, y-size); ctx.lineTo(x-size*0.1, y-size); ctx.fill();
                ctx.fillStyle = '#4caf50'; for(let i=0; i<5; i++) { ctx.beginPath(); ctx.ellipse(x, y-size, size*0.5, size*0.2, i, 0, Math.PI*2); ctx.fill(); }
            } 
            else if (s.type === 'cactus') {
                ctx.fillStyle = '#2e7d32'; ctx.roundRect(x-size*0.1, y-size, size*0.2, size, 10); ctx.fill();
                ctx.fillRect(x-size*0.1, y-size*0.7, size*0.4, size*0.1); ctx.fillRect(x+size*0.3, y-size*0.9, size*0.1, size*0.3);
            }
            else if (s.type === 'building') {
                ctx.fillStyle = '#34495e'; ctx.fillRect(x-size*0.4, y-size*2, size*0.8, size*2);
                ctx.fillStyle = '#f1c40f'; for(let i=0; i<5; i++) ctx.fillRect(x-size*0.2, y-size*(0.4 + i*0.4), size*0.4, size*0.2);
            }
            else if (s.type === 'kart') {
                const k = s.obj; this.drawHorizonCar(ctx, s.x, s.y, size*0.002, k.color, k.bodyColor, 0);
            }
            else if (s.type === 'cone') {
                ctx.fillStyle = '#ff5722'; ctx.beginPath(); ctx.moveTo(x, y-size*0.5); ctx.lineTo(x-size*0.3, y); ctx.lineTo(x+size*0.3, y); ctx.fill();
            }
        },

        drawPlayer: function(ctx, w, h) {
            const scale = w * 0.0025;
            const cx = w/2; const cy = h * 0.88 + this.bounce;
            const tilt = (this.steer * 0.1) + (this.spinAngle * Math.PI/180);
            const char = CHARACTERS[this.selectedChar];
            this.drawHorizonCar(ctx, cx, cy, scale, char.color, char.bodyColor, tilt);
        },

        drawHorizonCar: function(ctx, x, y, s, c1, c2, tilt) {
            ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(tilt);
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 10, 90, 25, 0, 0, Math.PI*2); ctx.fill();
            // Pneus
            ctx.fillStyle = '#222'; ctx.fillRect(-80, -15, 35, 45); ctx.fillRect(45, -15, 35, 45);
            // Corpo
            ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-70, -20); ctx.lineTo(70, -20); ctx.lineTo(80, 15); ctx.lineTo(-80, 15); ctx.fill();
            ctx.fillStyle = c1; ctx.fillRect(-60, -30, 120, 20);
            ctx.fillStyle = '#81d4fa'; ctx.beginPath(); ctx.moveTo(-40, -45); ctx.lineTo(40, -45); ctx.lineTo(50, -30); ctx.lineTo(-50, -30); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-65, -50, 130, 10);
            const light = this.speed < 10 ? '#ff0000' : (this.boostTimer > 0 ? '#00ffff' : '#880000');
            ctx.fillStyle = light; ctx.fillRect(-60, 5, 40, 10); ctx.fillRect(20, 5, 40, 10);
            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            // Velocidade
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 30, 60); ctx.font = "16px Arial"; ctx.fillText("KM/H", w - 30, 85);

            // Barra Nitro
            ctx.fillStyle = '#222'; ctx.fillRect(w - 40, 100, 15, 120);
            ctx.fillStyle = this.boostTimer > 0 ? '#00ffff' : '#f1c40f';
            const bh = (this.nitro / 100) * 116; ctx.fillRect(w - 38, 218 - bh, 11, bh);

            // Volante Virtual + Gesto
            if(this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save(); ctx.translate(vw.x, vw.y); ctx.globalAlpha = vw.opacity;
                // Efeito visual se mãos estiverem altas
                if(vw.isHigh) { ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff'; }
                ctx.rotate(this.targetSteer * 1.5);
                ctx.strokeStyle = vw.isHigh ? '#00ffff' : '#fff'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(0,0,vw.r,0,Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0,-vw.r,12,0,Math.PI*2); ctx.fill();
                ctx.restore();
            }

            // MINI-MAPA (NOVA FEATURE!)
            if(this.minimap.length > 0) {
                const mapS = 100; const mapX = 30; const mapY = 130;
                ctx.save(); ctx.translate(mapX + mapS/2, mapY + mapS/2);
                
                // Desenha linha do mapa
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4; ctx.beginPath();
                this.minimap.forEach((p, i) => { 
                    const scale = 3; // Zoom do mapa
                    if (i===0) ctx.moveTo(p.x*scale, p.y*scale); else ctx.lineTo(p.x*scale, p.y*scale);
                });
                ctx.closePath(); ctx.stroke();

                // Desenha Player
                const pIdx = Math.floor((this.pos / this.trackLength) * this.minimap.length) % this.minimap.length;
                const pPoint = this.minimap[pIdx];
                if(pPoint) { ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(pPoint.x*3, pPoint.y*3, 5, 0, Math.PI*2); ctx.fill(); }

                // Desenha Rivais
                this.rivals.forEach(r => {
                    const rIdx = Math.floor((r.pos / this.trackLength) * this.minimap.length) % this.minimap.length;
                    const rPoint = this.minimap[rIdx];
                    if(rPoint) { ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(rPoint.x*3, rPoint.y*3, 4, 0, Math.PI*2); ctx.fill(); }
                });
                ctx.restore();
            }
        },

        // --- SISTEMA UI ---
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
                    if(this.state==='RACE' && this.nitro>25) { this.activateTurbo(); } 
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
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font = "italic bold 50px 'Russo One'"; ctx.fillText("HORIZON LEGENDS", w/2, h*0.25);
            this.drawBtn(ctx, "JOGO RÁPIDO", w/2, h*0.5, '#e67e22', ()=>this.selectMode('SOLO'));
            this.drawBtn(ctx, "MULTIPLAYER", w/2, h*0.7, '#27ae60', ()=>this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
            const char = CHARACTERS[this.selectedChar]; const trk = TRACKS[this.selectedTrack];
            this.drawHorizonCar(ctx, w/2, h*0.35, w*0.004, char.color, char.bodyColor, Date.now()*0.001);
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 30px 'Russo One'"; ctx.fillText(char.name, w/2, h*0.15);
            ctx.font = "20px Arial"; ctx.fillText(trk.name, w/2, h*0.55);
            this.drawBtn(ctx, "< CARRO >", w/2, h*0.25, 'rgba(255,255,255,0.1)', ()=>{ this.selectedChar = (this.selectedChar+1)%CHARACTERS.length; window.Sfx.click(); }, 400);
            this.drawBtn(ctx, "< PISTA >", w/2, h*0.6, 'rgba(255,255,255,0.1)', ()=>{ this.selectedTrack = (this.selectedTrack+1)%TRACKS.length; window.Sfx.click(); }, 400);
            const txt = this.isReady ? "AGUARDANDO..." : "ACELERAR!";
            this.drawBtn(ctx, txt, w/2, h*0.85, this.isReady?'#777':'#e67e22', ()=>this.toggleReady());
        },

        drawBtn: function(ctx, txt, x, y, color, action, width=300) {
            ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - width/2, y - 30, width, 60, 15); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = "bold 24px Arial"; ctx.textAlign='center'; ctx.fillText(txt, x, y + 8);
            this.buttons.push({x: x-width/2, y: y-30, w:width, h:60, action});
        },

        selectMode: function(mode) {
            this.createTrack(this.selectedTrack); 
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
            p.set({ name: 'P1', ready: false }); p.onDisconnect().remove();
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                this.rivals = Object.keys(d).filter(k=>k!==window.System.playerId).map(k=>({
                    id:k, isRemote:true, ...d[k], color: CHARACTERS[d[k].charId||0].color, bodyColor: CHARACTERS[d[k].charId||0].bodyColor 
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
        window.System.registerGame('drive', 'Horizon Kart', '🏎️', Logic, {camOpacity: 0.15});
    }

})();
