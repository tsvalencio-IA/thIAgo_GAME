// =============================================================================
// KART DO OTTO – COMPETITIVE EDITION (BASE V14 RESTAURADA + FEATURES PRO)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES & TUNING
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO', color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0, grip: 0.98 },
        { id: 1, name: 'THIAGO', color: '#f1c40f', speedInfo: 1.05, turnInfo: 0.90, grip: 0.96 },
        { id: 2, name: 'THAMIS', color: '#3498db', speedInfo: 0.95, turnInfo: 1.10, grip: 1.0 }
    ];

    const TRACKS = [
        { id: 0, name: 'GP INTERLAGOS', theme: 'grass', sky: 0, curveMult: 1.0 },
        { id: 1, name: 'DESERTO DO SAARA', theme: 'sand', sky: 1, curveMult: 0.8 },
        { id: 2, name: 'ALPES NEVADOS', theme: 'snow', sky: 2, curveMult: 1.3 }
    ];

    const CONF = {
        // Física Arcade Clássica (Super Scaler)
        MAX_SPEED: 240,
        ACCEL: 1.5,
        BREAKING: 4.0,
        DECEL: 0.98,
        OFFROAD_DECEL: 0.94,
        
        // Câmera (Ajustada para visão V14)
        CAMERA_HEIGHT: 1200, 
        CAMERA_DEPTH: 0.84,  
        FIELD_OF_VIEW: 100,
        
        // Pista
        SEGMENT_LENGTH: 200,
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2000,
        DRAW_DISTANCE: 300, // Ver longe
        
        // Gameplay
        CENTRIFUGAL: 0.3,
        TURBO_BOOST: 80
    };

    // -----------------------------------------------------------------
    // 2. ESTADO DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'kart_v14_pro',
        
        selectedChar: 0,
        selectedTrack: 0,
        
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
            window.System.msg("KART COMPETITION");
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

        // --- GERAÇÃO DE PISTA (ESTILO V14 - FUNCIONAL) ---
        createTrack: function(trackId) {
            this.segments = [];
            this.minimap = [];
            const trk = TRACKS[trackId];
            
            let mapX=0, mapY=0, mapAngle=0;

            const addSegment = (curve, y) => {
                // Props visuais simples (Cones)
                let obs = [];
                if (Math.random() > 0.98) obs.push({ type: 'cone', x: (Math.random()-0.5)*2.5 });

                this.segments.push({
                    curve: curve * trk.curveMult,
                    y: y,
                    obs: obs,
                    color: Math.floor(this.segments.length/CONF.RUMBLE_LENGTH)%2 ? 'dark' : 'light',
                    theme: trk.theme
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

            // Layout V14 Expandido
            addRoad(50, 50, 50, 0);       
            addRoad(50, 100, 50, 2);      
            addRoad(50, 50, 50, 0);
            addRoad(50, 50, 50, -2);      
            addRoad(100, 100, 100, 0);    
            addRoad(50, 50, 50, 3);       
            addRoad(50, 50, 50, -1);      
            addRoad(50, 50, 50, 0);       

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        getSegment: function(position) {
            if (this.segments.length === 0) return { curve: 0, obs: [] };
            const index = Math.floor(position / CONF.SEGMENT_LENGTH) % this.segments.length;
            return this.segments[index];
        },

        // --- GAME LOOP ---
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

        // --- INPUT & GESTOS ---
        processInput: function(w, h, pose) {
            if(this.spinTimer > 0) return;

            let handsFound = false;
            // Detecção via WebCam (Mãos acima do nariz = Turbo)
            if(pose && pose.keypoints) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                const nose = pose.keypoints.find(k=>k.name==='nose');

                if(lw && rw && lw.score > 0.15 && rw.score > 0.15) {
                    handsFound = true;
                    // Mapeamento
                    const lx = (1 - lw.x/640)*w; const ly = (lw.y/480)*h;
                    const rx = (1 - rw.x/640)*w; const ry = (rw.y/480)*h;
                    
                    // Direção
                    const dx = rx - lx; const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    this.targetSteer = angle * 2.5; 
                    
                    // Turbo?
                    let isHigh = false;
                    if (nose && nose.score > 0.15) {
                        const ny = (nose.y/480)*h;
                        if (ly < ny && ry < ny) isHigh = true;
                    }
                    this.virtualWheel = { x: (lx+rx)/2, y: (ly+ry)/2, r: Math.hypot(dx,dy)/2, opacity: 1, isHigh: isHigh };

                    if (isHigh && this.nitro > 0) this.activateTurbo();
                }
            }

            if(!handsFound) {
                this.virtualWheel.opacity *= 0.9;
                if(Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.85; else this.targetSteer = 0;
            }

            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        activateTurbo: function() {
            if (this.nitro > 0.5) {
                this.nitro -= 0.5;
                this.boostTimer = 10;
                if (this.speed < CONF.MAX_SPEED + CONF.TURBO_BOOST) this.speed += 3;
                window.Gfx.shakeScreen(2);
            }
        },

        // --- FÍSICA ---
        updatePhysics: function() {
            const char = CHARACTERS[this.selectedChar];
            const currentSeg = this.getSegment(this.pos);
            const ratio = this.speed / CONF.MAX_SPEED;

            // Velocidade
            let maxS = (this.boostTimer > 0 ? CONF.MAX_SPEED + CONF.TURBO_BOOST : CONF.MAX_SPEED) * char.speedInfo;
            
            // Offroad
            if(Math.abs(this.playerX) > 2.2) { 
                maxS *= 0.4; this.bounce = (Math.random()-0.5)*8; this.speed *= CONF.OFFROAD_DECEL;
            } else {
                this.bounce = Math.sin(this.pos * 0.05) * (this.speed * 0.005);
            }

            if(this.spinTimer > 0) {
                this.speed *= 0.94;
                this.spinAngle += 35;
                this.spinTimer--;
                if(this.spinTimer <= 0) this.spinAngle = 0;
            } else {
                if(this.speed < maxS) this.speed += CONF.ACCEL;
                else this.speed *= 0.99;
            }

            // Curvas (Física V14 melhorada)
            const centrifugal = -(currentSeg.curve * (ratio * ratio)) * CONF.CENTRIFUGAL;
            const turnForce = this.steer * ratio * 2.5 * char.turnInfo * char.grip;
            this.playerX += (turnForce + centrifugal);

            // Muros
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

            this.skyOffset -= (currentSeg.curve * 0.05 * ratio) + (this.steer * 0.01);

            if(this.boostTimer > 0) this.boostTimer--;
            if(this.nitro < 100) this.nitro += 0.05;

            // Colisões
            for(let o of currentSeg.obs) {
                if(o.type === 'cone' && Math.abs(this.playerX - o.x) < 0.8) {
                    this.crash();
                    o.x = 999;
                }
            }
        },

        updateAI: function() {
            let rk = 1;
            const myTot = this.lap * this.trackLength + this.pos;
            
            this.rivals.forEach(r => {
                if(!r.isRemote) {
                    const rSeg = this.getSegment(r.pos);
                    r.x += (-(rSeg.curve * 0.5) - r.x) * 0.05; // IA segue curva
                    let targetS = CONF.MAX_SPEED * 0.95;
                    if(r.speed < targetS) r.speed += CONF.ACCEL * 0.8;
                    
                    // Colisão Carro x Carro
                    const dz = Math.abs(r.pos - this.pos);
                    if((dz < 300 || Math.abs(dz - this.trackLength) < 300) && Math.abs(r.x - this.playerX) < 0.7) {
                        if(this.spinTimer <= 0) { 
                            this.crash(); 
                            // Empurrão físico
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
        // RENDERIZAÇÃO (V14 RESTAURADA - VISUAL CLÁSSICO)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const horizon = h * 0.45;
            
            // 1. Céu (V14 Style - Azul Clássico ou Laranja)
            const skyCols = [['#3498db', '#ecf0f1'], ['#e67e22', '#f1c40f'], ['#95a5a6', '#bdc3c7']];
            const sc = skyCols[TRACKS[this.selectedTrack].sky];
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, sc[0]); grad.addColorStop(1, sc[1]);
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);

            // Montanhas Parallax Simples
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) {
                let offset = (this.skyOffset * w) % w;
                let mx = (i * w/12) + offset;
                if(mx < -w/12) mx += w + w/12;
                let my = horizon - 50 - (Math.abs(Math.sin(i*132))*40);
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w*2, horizon); ctx.lineTo(0, horizon); ctx.fill();

            // Chão Base (Cor sólida da V14)
            const theme = TRACKS[this.selectedTrack].theme;
            ctx.fillStyle = theme === 'sand' ? '#d35400' : (theme==='snow'?'#b2bec3':'#2ecc71');
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. ESTRADA (ALGORITMO V14 - FUNCIONA)
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

                const scale = CONF.CAMERA_DEPTH / segmentZ;
                const screenY = horizon + (scale * camH);
                
                x += dx; dx += seg.curve;
                
                if(screenY >= maxY) {
                    // Oculto, mas processa sprites
                } else {
                    const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                    const screenW = CONF.ROAD_WIDTH * scale;
                    this.drawRoadSegment(ctx, w, screenX, screenY, screenW, maxY, seg, theme);
                    maxY = screenY; 
                }

                // Coleta Sprites
                const screenX = cx - (x * scale * w/2) - (this.playerX * CONF.ROAD_WIDTH * scale);
                const screenW = CONF.ROAD_WIDTH * scale;

                // Cones
                seg.obs.forEach(o => {
                    spritesDrawOrder.push({ type:o.type, x:screenX + (o.x * screenW), y:screenY, scale:scale });
                });

                // Rivais
                this.rivals.forEach(r => {
                    const rIdx = Math.floor(r.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
                    if(rIdx === idx) {
                        spritesDrawOrder.push({ 
                            type:'kart', obj:r, 
                            x:screenX + (r.x * screenW), y:screenY, scale:scale 
                        });
                    }
                });
            }

            // 3. DESENHA SPRITES
            for(let i=spritesDrawOrder.length-1; i>=0; i--) {
                this.drawSprite(ctx, spritesDrawOrder[i]);
            }

            // 4. DESENHA PLAYER
            this.drawPlayerCar(ctx, w, h);
        },

        drawRoadSegment: function(ctx, w, x, y, width, clipY, seg, theme) {
            const isDark = seg.color === 'dark';
            const h = clipY - y; 

            // Cores (Paleta V14)
            const cols = {
                grass: { l: '#55aa44', d: '#448833' },
                sand:  { l: '#f1c40f', d: '#e67e22' },
                snow:  { l: '#ffffff', d: '#dfe6e9' }
            }[theme] || {l:'#55aa44',d:'#448833'};

            const road = isDark ? '#666' : '#777';
            const rumble = isDark ? '#c0392b' : '#fff';

            // Grama
            ctx.fillStyle = isDark ? cols.d : cols.l; ctx.fillRect(0, y, w, h);

            // Zebra
            const rumbleW = width * 1.2;
            ctx.fillStyle = rumble; ctx.fillRect(x - rumbleW, y, rumbleW*2, h);

            // Estrada
            ctx.fillStyle = road; ctx.fillRect(x - width, y, width*2, h);

            // Linha
            if(isDark) {
                ctx.fillStyle = '#fff'; ctx.fillRect(x - width*0.05, y, width*0.1, h);
            }
        },

        drawSprite: function(ctx, s) {
            const size = s.scale * window.innerWidth * 1.5; 
            const x = s.x; const y = s.y;
            
            if (s.type === 'kart') {
                const k = s.obj;
                this.drawKartAsset(ctx, x, y, size*0.01, k.color, 0); // Rival
                ctx.fillStyle = '#fff'; ctx.font='10px Arial'; ctx.textAlign='center';
                ctx.fillText('P2', x, y - size*0.05);
            }
            else if (s.type === 'cone') {
                ctx.fillStyle = '#ff5500'; ctx.beginPath();
                ctx.moveTo(x, y - size*0.15); ctx.lineTo(x-size*0.05, y); ctx.lineTo(x+size*0.05, y); ctx.fill();
            }
        },

        // --- RENDERIZADOR DE KART V14 (SPRITE VETORIAL) ---
        drawPlayerCar: function(ctx, w, h) {
            const cx = w/2;
            const cy = h * 0.85 + this.bounce;
            const scale = w * 0.006;
            const char = CHARACTERS[this.selectedChar];
            
            // Inclinação (Banking)
            const rot = this.visualTilt * 0.02 + (this.spinAngle * Math.PI/180);
            
            this.drawKartAsset(ctx, cx, cy, scale, char.color, rot);
        },

        drawKartAsset: function(ctx, x, y, s, color, tilt) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(tilt);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 30, 70, 20, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-30, -20); ctx.lineTo(30, -20);
            ctx.lineTo(40, 20); ctx.lineTo(-40, 20);
            ctx.fill();

            // Spoiler
            ctx.fillStyle = '#222'; ctx.fillRect(-35, -35, 70, 10);

            // Rodas
            const wheelX = 45; const wheelY = 15;
            const dw = (wx, wy) => {
                ctx.fillStyle = '#111'; ctx.fillRect(wx-10, wy-15, 20, 30);
                ctx.fillStyle = '#555'; ctx.fillRect(wx-5, wy-5, 10, 10);
            };
            dw(-wheelX, -wheelY); dw(wheelX, -wheelY); // Trás
            dw(-wheelX, wheelY+10); dw(wheelX, wheelY+10); // Frente

            // Capacete (Piloto)
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -10, 20, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, -10, 18, 0, Math.PI, false); ctx.fill();

            // Fogo Turbo
            if (this.boostTimer > 0 || this.nitro > 99) { // Só player tem acesso a nitro var
                ctx.fillStyle = '#00ffff'; 
                ctx.beginPath(); ctx.arc(-20, -30, 10, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -30, 10, 0, Math.PI*2); ctx.fill();
            }

            ctx.restore();
        },

        // --- UI ---
        renderHUD: function(ctx, w, h) {
            // Speedo
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 30, 60);
            
            // Nitro Bar
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

            // Minimapa Geométrico
            if(this.minimap.length > 0) {
                const ms = 100; const mx = 20; const my = 120;
                ctx.save(); ctx.translate(mx + ms/2, my + ms/2);
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
                ctx.beginPath();
                this.minimap.forEach((p,i) => { if(i===0) ctx.moveTo(p.x*2, p.y*2); else ctx.lineTo(p.x*2, p.y*2); });
                ctx.closePath(); ctx.stroke();
                // Player
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
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font = "italic bold 50px 'Russo One'"; ctx.fillText("KART COMPETITION", w/2, h*0.25);
            this.drawBtn(ctx, "JOGO RÁPIDO", w/2, h*0.5, '#e67e22', ()=>this.selectMode('SOLO'));
            this.drawBtn(ctx, "MULTIPLAYER", w/2, h*0.7, '#27ae60', ()=>this.selectMode('MULTI'));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#222'; ctx.fillRect(0,0,w,h);
            const char = CHARACTERS[this.selectedChar]; const trk = TRACKS[this.selectedTrack];
            
            // Preview Simples
            this.drawKartAsset(ctx, w/2, h*0.35, w*0.005, char.color, 0);

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

        // --- REDE ---
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