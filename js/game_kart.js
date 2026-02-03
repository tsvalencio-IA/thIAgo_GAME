// =============================================================================
// KART DO OTTO – HORIZON CHASE EDITION (FINAL V2)
// ARQUITETO: SENIOR GAME DEV
// FIX: SETUP UI, CENÁRIOS 3D, PREENCHIMENTO DE ESTRADA
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
            id: 0, name: 'CALIFORNIA SUNSET', theme: 'california',
            colors: { skyTop: '#2b5876', skyBot: '#4e4376', grassLight: '#55aa44', grassDark: '#448833', roadLight: '#777', roadDark: '#666', rumble1: '#c0392b', rumble2: '#ecf0f1' },
            curveMult: 1.0, props: ['palm', 'tree']
        },
        { 
            id: 1, name: 'NEON TOKYO', theme: 'city',
            colors: { skyTop: '#0f0c29', skyBot: '#302b63', grassLight: '#240b36', grassDark: '#1a0526', roadLight: '#34495e', roadDark: '#2c3e50', rumble1: '#00d2ff', rumble2: '#3a7bd5' },
            curveMult: 1.2, props: ['building', 'sign']
        },
        { 
            id: 2, name: 'ATACAMA DESERT', theme: 'desert',
            colors: { skyTop: '#ff7e5f', skyBot: '#feb47b', grassLight: '#e67e22', grassDark: '#d35400', roadLight: '#95a5a6', roadDark: '#7f8c8d', rumble1: '#8e44ad', rumble2: '#f1c40f' },
            curveMult: 0.9, props: ['cactus', 'rock']
        }
    ];

    const CONF = {
        SEGMENT_LENGTH: 200, 
        RUMBLE_LENGTH: 3,    
        ROAD_WIDTH: 2200,    
        
        CAMERA_HEIGHT: 1500, 
        CAMERA_DEPTH: 0.8,   
        DRAW_DISTANCE: 300,  
        
        MAX_SPEED: 260,
        ACCEL: 2.0,
        BREAKING: 6.0,
        DECEL: 0.96,
        OFFROAD_DECEL: 0.92,
        CENTRIFUGAL: 0.22    
    };

    // -----------------------------------------------------------------
    // 2. ESTADO DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'room_horizon_final',
        
        selectedChar: 0,
        selectedTrack: 0,
        
        isOnline: false,
        isReady: false,
        dbRef: null,
        lastSync: 0,
        rivals: [],

        speed: 0, pos: 0, playerX: 0, steer: 0, targetSteer: 0,
        nitro: 100, boostTimer: 0, spinTimer: 0, spinAngle: 0,
        
        segments: [], trackLength: 0,
        bounce: 0, visualTilt: 0, skyOffset: 0,
        
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        buttons: [],

        // --- INICIALIZAÇÃO ---
        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.resetPhysics();
            this.setupInput(); // CORREÇÃO: Nome correto da função
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

        // --- ENGINE DE PISTA COM CENÁRIOS ---
        createTrack: function(trackId) {
            this.segments = [];
            const trk = TRACKS[trackId];
            
            const addSegment = (curve) => {
                const sprite = Math.random() > 0.92 ? this.getRandomProp(trk.props) : null;
                // Sprites ficam fora da pista (x > 1.5 ou x < -1.5)
                const spriteX = sprite ? (Math.random() > 0.5 ? 2.5 + Math.random()*2 : -2.5 - Math.random()*2) : 0;
                
                this.segments.push({
                    curve: curve * trk.curveMult,
                    y: 0,
                    obs: sprite ? [{type: sprite, x: spriteX}] : [] 
                });
            };

            const addRoad = (enter, hold, leave, curve) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter));
                for(let i=0; i<hold; i++)  addSegment(curve);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave));
            };

            // Layout
            addRoad(50, 50, 50, 0);         
            addRoad(50, 100, 50, 2);        
            addRoad(50, 50, 50, 0);         
            addRoad(50, 50, 50, -2);        
            addRoad(100, 50, 100, 4);       
            addRoad(50, 200, 50, 0);        
            addRoad(100, 100, 100, -3);     
            addRoad(50, 50, 50, 0);         

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        getRandomProp: function(props) {
            return props[Math.floor(Math.random() * props.length)];
        },

        getSegment: function(position) {
            if (this.segments.length === 0) return { curve: 0, obs: [] };
            const index = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[index];
        },

        // --- UPDATE ---
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

            return Math.floor(this.pos / 100);
        },

        // --- FÍSICA ---
        processInput: function(w, h, pose) {
            if(this.spinTimer > 0) return;

            let handsFound = false;
            if(pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                if(lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    handsFound = true;
                    const lx = (1 - lw.x/640)*w; const ly = (lw.y/480)*h;
                    const rx = (1 - rw.x/640)*w; const ry = (rw.y/480)*h;
                    const dx = rx - lx; const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = angle * 2.5; 
                    this.virtualWheel = { x: (lx+rx)/2, y: (ly+ry)/2, r: Math.hypot(dx,dy)/2, opacity: 1 };
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

        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const currentSeg = this.getSegment(this.pos);
            const ratio = this.speed / CONF.MAX_SPEED;

            let maxS = (this.boostTimer > 0 ? 360 : CONF.MAX_SPEED) * char.speedInfo;
            if(Math.abs(this.playerX) > 2.2) { maxS *= 0.4; this.bounce = (Math.random()-0.5)*10; } 
            else this.bounce *= 0.5;

            if(this.spinTimer > 0) {
                this.speed *= 0.94;
                this.spinAngle += 30;
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                if(this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= CONF.DECEL;
            }

            // Curvas e Força Centrífuga
            const centrifugal = -(currentSeg.curve * (ratio * ratio)) * CONF.CENTRIFUGAL;
            const turnForce = this.steer * ratio * 2.5 * char.turnInfo;
            this.playerX += (turnForce + centrifugal);

            if(this.playerX < -3.5) { this.playerX = -3.5; this.speed *= 0.9; }
            if(this.playerX > 3.5) { this.playerX = 3.5; this.speed *= 0.9; }

            this.pos += this.speed;
            while(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while(this.pos < 0) this.pos += this.trackLength;

            this.skyOffset -= (currentSeg.curve * 0.05 * ratio) + (this.steer * 0.02);

            if(this.boostTimer > 0) this.boostTimer--;
            if(this.nitro < 100) this.nitro += 0.05;

            // Colisões com Obstáculos (Árvores/Cactos se player sair muito da pista)
            for(let o of currentSeg.obs) {
                if(Math.abs(this.playerX - o.x) < 0.8) {
                    this.crash();
                }
            }
        },

        updateAI: function() {
            let rk = 1;
            const myTot = this.lap * this.trackLength + this.pos;
            
            this.rivals.forEach(r => {
                if(!r.isRemote) {
                    const rSeg = this.getSegment(r.pos);
                    r.x += (-(rSeg.curve * 0.5) - r.x) * 0.05;
                    let targetS = CONF.MAX_SPEED * 0.95;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    
                    const dz = Math.abs(r.pos - this.pos);
                    const dx = Math.abs(r.x - this.playerX);
                    if((dz < 400 || Math.abs(dz - this.trackLength) < 400) && dx < 0.7) {
                        if(this.spinTimer <= 0 && r.spinTimer <= 0) {
                            this.crash();
                            r.x += (r.x > this.playerX ? 0.5 : -0.5);
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
            this.spinTimer = 40;
            this.speed *= 0.5;
            window.Sfx.crash();
            window.Gfx.shakeScreen(20);
            window.System.msg("CRASH!");
        },

        finishRace: function() {
            this.state = 'FINISHED';
            document.getElementById('nitro-btn-kart').style.display = 'none';
            setTimeout(() => {
                window.System.gameOver(this.rank === 1 ? "VITÓRIA!" : `${this.rank}º LUGAR`);
            }, 1000);
        },

        // =================================================================
        // RENDERIZAÇÃO (AGORA COM CENÁRIOS!)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const colors = TRACKS[this.selectedTrack].colors;
            const cx = w / 2;
            const horizon = h * 0.45;

            // Céu e Parallax
            const skyGrad = ctx.createLinearGradient(0,0,0,horizon);
            skyGrad.addColorStop(0, colors.skyTop); skyGrad.addColorStop(1, colors.skyBot);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,horizon);

            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                let mx = (i * w/10) + (this.skyOffset * w) % w;
                if (mx < 0) mx += w; if (mx > w) mx -= w;
                const my = horizon - 50 - (i%2==0 ? 40 : 0);
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão Base
            ctx.fillStyle = colors.grassDark;
            ctx.fillRect(0, horizon, w, h-horizon);

            // Render Pista (Painter's Algorithm)
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
                
                // CORREÇÃO VISUAL: Preencher até a linha anterior (evita buracos)
                this.drawSegment(ctx, w, cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale), screenY, CONF.ROAD_WIDTH * scale, maxY, idx, colors);
                maxY = screenY;

                // Sprites
                const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                const screenW = CONF.ROAD_WIDTH * scale;

                this.rivals.forEach(r => {
                    const rSegIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
                    if(rSegIdx === idx) {
                        sprites.push({ type:'kart', obj:r, x:screenX + (r.x * screenW), y:screenY, s:scale * w * 0.002, dist: segmentZ });
                    }
                });

                seg.obs.forEach(o => {
                    const sx = screenX + (o.x * screenW);
                    sprites.push({ type:o.type, x:sx, y:screenY, s:scale * w * 0.0025, dist: segmentZ });
                });
            }

            for(let i=sprites.length-1; i>=0; i--) {
                this.drawSprite(ctx, sprites[i]);
            }

            this.drawPlayer(ctx, w, h);
        },

        drawSegment: function(ctx, w, x, y, width, clipY, idx, cols) {
            const isAlt = (Math.floor(idx / CONF.RUMBLE_LENGTH) % 2) === 0;
            const h = clipY - y; // Altura dinâmica para tapar buracos

            ctx.fillStyle = isAlt ? cols.grassDark : cols.grassLight;
            ctx.fillRect(0, y, w, h);

            const rumbleW = width * 1.2;
            ctx.fillStyle = isAlt ? cols.rumble1 : cols.rumble2;
            ctx.fillRect(x - rumbleW, y, rumbleW*2, h);

            ctx.fillStyle = isAlt ? cols.roadDark : cols.roadLight;
            ctx.fillRect(x - width, y, width*2, h);

            if(isAlt) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - width*0.05, y, width*0.1, h);
            }
        },

        drawSprite: function(ctx, s) {
            const size = s.s * 800;
            const x = s.x; const y = s.y;
            
            // Desenho Procedural de Cenários (Low Poly)
            if (s.type === 'palm') {
                ctx.fillStyle = '#8e44ad'; // Sombra falsa
                ctx.fillRect(x-size*0.1, y, size*0.2, size*0.1); 
                
                ctx.fillStyle = '#A0522D'; // Tronco curvado
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+size*0.2, y-size); ctx.lineTo(x+size*0.3, y-size); ctx.lineTo(x+size*0.15, y); ctx.fill();
                
                ctx.fillStyle = '#2ecc71'; // Folhas
                for(let i=0; i<5; i++) {
                    ctx.beginPath(); ctx.arc(x+size*0.25, y-size, size*0.4, i, i+0.5); ctx.fill();
                }
            } 
            else if (s.type === 'tree') {
                ctx.fillStyle = '#5d4037'; ctx.fillRect(x-size*0.1, y-size*0.3, size*0.2, size*0.3); // Tronco
                ctx.fillStyle = '#27ae60'; // Copa
                ctx.beginPath(); ctx.moveTo(x-size*0.4, y-size*0.3); ctx.lineTo(x+size*0.4, y-size*0.3); ctx.lineTo(x, y-size*1.2); ctx.fill();
            }
            else if (s.type === 'cactus') {
                ctx.fillStyle = '#2e7d32'; // Corpo
                ctx.roundRect(x-size*0.1, y-size, size*0.2, size, 10); ctx.fill();
                ctx.fillRect(x-size*0.1, y-size*0.6, size*0.4, size*0.1); // Braço
                ctx.fillRect(x+size*0.3, y-size*0.8, size*0.1, size*0.3);
            }
            else if (s.type === 'building') {
                ctx.fillStyle = '#2c3e50'; ctx.fillRect(x-size*0.3, y-size*1.5, size*0.6, size*1.5);
                ctx.fillStyle = '#f1c40f'; // Janelas
                for(let i=0; i<4; i++) ctx.fillRect(x-size*0.1, y-size*(0.3 + i*0.3), size*0.2, size*0.1);
            }
            else if (s.type === 'kart') {
                const k = s.obj;
                this.drawHorizonCar(ctx, s.x, s.y, size*0.002, k.color, k.bodyColor, 0);
            }
        },

        drawPlayer: function(ctx, w, h) {
            const scale = w * 0.0025;
            const cx = w/2;
            const cy = h * 0.88 + this.bounce;
            const tilt = (this.steer * 0.1) + (this.spinAngle * Math.PI/180);
            const char = CHARACTERS[this.selectedChar];
            this.drawHorizonCar(ctx, cx, cy, scale, char.color, char.bodyColor, tilt);
        },

        drawHorizonCar: function(ctx, x, y, s, color1, color2, tilt) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(tilt);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 10, 80, 20, 0, 0, Math.PI*2); ctx.fill();

            // Pneus
            ctx.fillStyle = '#111';
            ctx.fillRect(-70, -10, 30, 40); ctx.fillRect(40, -10, 30, 40);

            // Chassi
            ctx.fillStyle = color2; 
            ctx.beginPath(); ctx.moveTo(-60, -20); ctx.lineTo(60, -20); ctx.lineTo(70, 10); ctx.lineTo(-70, 10); ctx.fill();

            // Topo
            ctx.fillStyle = color1;
            ctx.beginPath(); ctx.moveTo(-50, -30); ctx.lineTo(50, -30); ctx.lineTo(60, 0); ctx.lineTo(-60, 0); ctx.fill();

            // Vidro
            ctx.fillStyle = '#aaddff';
            ctx.beginPath(); ctx.moveTo(-30, -35); ctx.lineTo(30, -35); ctx.lineTo(40, -25); ctx.lineTo(-40, -25); ctx.fill();

            // Aerofólio
            ctx.fillStyle = '#111'; ctx.fillRect(-55, -40, 110, 10);
            ctx.fillStyle = color1; ctx.fillRect(-55, -40, 10, 20); ctx.fillRect(45, -40, 10, 20);

            // Luzes
            const light = this.speed < 10 ? '#f00' : (this.boostTimer > 0 ? '#0ff' : '#800');
            ctx.fillStyle = light; ctx.fillRect(-50, 0, 30, 10); ctx.fillRect(20, 0, 30, 10);

            // Placa
            ctx.fillStyle = '#fff'; ctx.fillRect(-15, 0, 30, 10);
            ctx.fillStyle = '#000'; ctx.font = '8px Arial'; ctx.fillText('KART', -10, 8);

            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 20, 50);
            ctx.font = "16px Arial"; ctx.fillText("KM/H", w - 20, 75);

            ctx.fillStyle = '#333'; ctx.fillRect(w - 30, 90, 10, 100);
            ctx.fillStyle = this.boostTimer > 0 ? '#0ff' : '#f1c40f';
            const bh = (this.nitro / 100) * 100;
            ctx.fillRect(w - 30, 190 - bh, 10, bh);

            ctx.textAlign = 'left'; ctx.font = "italic bold 60px 'Russo One'"; ctx.fillStyle = '#fff';
            ctx.fillText(this.rank, 20, 60);
            ctx.font = "20px Arial"; ctx.fillText("POS", 60, 60);
            ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 90);

            if(this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save(); ctx.translate(vw.x, vw.y); ctx.globalAlpha = vw.opacity;
                ctx.rotate(this.targetSteer * 1.5);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(0,0,vw.r,0,Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0,-vw.r,10,0,Math.PI*2); ctx.fill();
                ctx.restore();
            }
        },

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
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 50, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText(char.name, w/2, h*0.3 + 80);
            
            this.drawBtn(ctx, "<", w/2 - 120, h*0.3, '#555', ()=>{ 
                this.selectedChar = (this.selectedChar-1+CHARACTERS.length)%CHARACTERS.length; 
                window.Sfx.click();
            }, 60);
            this.drawBtn(ctx, ">", w/2 + 120, h*0.3, '#555', ()=>{ 
                this.selectedChar = (this.selectedChar+1)%CHARACTERS.length; 
                window.Sfx.click();
            }, 60);

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
            p.set({ name: 'P1', ready: false });
            p.onDisconnect().remove();
            
            this.dbRef.child('players').on('value', s => {
                const d = s.val(); if(!d) return;
                this.rivals = Object.keys(d).filter(k=>k!==window.System.playerId).map(k=>({
                    id:k, isRemote:true, ...d[k], 
                    color: CHARACTERS[d[k].charId||0].color, bodyColor: CHARACTERS[d[k].charId||0].bodyColor 
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
                for(let b of this.buttons) {
                    if(x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) { b.action(); return; }
                }
                if(this.state === 'RACE') {
                    if(x < window.System.canvas.width * 0.4) this.targetSteer = -1;
                    else if(x > window.System.canvas.width * 0.6) this.targetSteer = 1;
                    else this.targetSteer = 0;
                }
            };
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Horizon Kart', '🏎️', Logic, {camOpacity: 0.15});
    }

})();
