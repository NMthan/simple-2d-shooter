const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverScreen = document.getElementById('game-over');
const startScreen = document.getElementById('start-screen');
const finalScoreElement = document.getElementById('final-score');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const joinInput = document.getElementById('join-id-input');
const restartBtn = document.getElementById('restart-btn');
const clientWaitingMsg = document.getElementById('client-waiting-msg');
const roomInfo = document.getElementById('room-info');
const myRoomIdEl = document.getElementById('my-room-id');
const connectionStatus = document.getElementById('connection-status');

// Sound System (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'explode') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

// Multiplayer setup
let peer = null;
let conn = null;
let isHost = true;
let isMultiplayer = false;
let myPlayerId = 'p1';

// Game State
let gameLoopId;
let isGameOver = false;
let isGameRunning = false;
let score = 0;
let keys = {};
let clientKeys = {};

// Visuals
let localStars = [];

// Game Objects shared state
let state = {
    p1: { x: canvas.width / 2 - 50, y: canvas.height - 70, width: 40, height: 40, color: '#00ffff', weaponLevel: 1 },
    p2: { x: canvas.width / 2 + 10, y: canvas.height - 70, width: 40, height: 40, color: '#ff00ff', active: false, weaponLevel: 1 },
    bullets: [],
    enemies: [],
    particles: [],
    powerups: []
};

let isBossActive = false;
let bossSpawnThreshold = 500;
const playerSpeed = 6;

// Input Handling
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Logic Classes (Host Only)
class Bullet {
    constructor(x, y, color, dx = 0) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 15;
        this.speed = 12;
        this.dx = dx;
        this.color = color;
    }
    update() { 
        this.y -= this.speed; 
        this.x += this.dx;
    }
}

class Enemy {
    constructor(isBoss = false) {
        this.isBoss = isBoss;
        this.width = isBoss ? 100 : 30;
        this.height = isBoss ? 80 : 30;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.color = isBoss ? '#ffaa00' : '#ff0044';
        
        if (isBoss) {
            this.hp = 30 + Math.floor(score / 50);
            this.maxHp = this.hp;
            this.speed = 1.5;
            this.x = canvas.width / 2 - this.width / 2; // spawn center
        } else {
            this.hp = 1;
            this.maxHp = 1;
            this.speed = 2 + Math.random() * 2 + (score / 1000);
        }
    }
    update() { 
        if (this.isBoss && this.y > 50) {
            this.y = 50; // Boss stays at top
            this.x += Math.sin(Date.now() / 500) * 3; // Boss moves side to side
        } else {
            this.y += this.speed; 
        }
    }
}

class Powerup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 15;
        this.speed = 2;
        this.color = '#00ff00';
    }
    update() { this.y += this.speed; }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 10;
        this.speedY = (Math.random() - 0.5) * 10;
        this.color = color;
        this.life = 1.0;
        this.decay = Math.random() * 0.04 + 0.02;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size = Math.max(0, this.size - 0.1);
    }
}

// Client Side Stars
function initStars() {
    localStars = [];
    for (let i = 0; i < 100; i++) {
        localStars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2,
            speed: Math.random() * 3 + 0.5
        });
    }
}

function updateStars() {
    localStars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });
}

// --------------------------------------------------------
// Multiplayer Networking
// --------------------------------------------------------

function generateShortId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initPeerAsHost() {
    initAudio();
    const roomId = generateShortId();
    peer = new Peer(roomId);

    peer.on('open', (id) => {
        myRoomIdEl.innerText = id;
        roomInfo.classList.remove('hidden');
        startGameAsHost();
    });

    peer.on('connection', (connection) => {
        if (conn) {
            connection.send({ type: 'error', msg: 'Room is full' });
            setTimeout(() => connection.close(), 500);
            return;
        }
        conn = connection;
        setupHostConnection();
    });
}

function setupHostConnection() {
    isMultiplayer = true;
    state.p2.active = true;
    state.p2.weaponLevel = 1;
    connectionStatus.innerText = "P2 Joined!";
    connectionStatus.style.color = "#0ff";

    conn.on('data', (data) => {
        if (data.type === 'inputs') clientKeys = data.keys;
    });

    conn.on('close', () => {
        isMultiplayer = false;
        state.p2.active = false;
        clientKeys = {};
        conn = null;
        connectionStatus.innerText = "P2 Disconnected.";
        connectionStatus.style.color = "#ff0044";
    });
}

function initPeerAsClient(hostId) {
    initAudio();
    if (!hostId) return;
    joinBtn.innerText = "Connecting...";
    
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect(hostId.toUpperCase());
        conn.on('open', () => {
            isHost = false;
            isMultiplayer = true;
            myPlayerId = 'p2';
            
            startScreen.classList.add('hidden');
            roomInfo.classList.remove('hidden');
            myRoomIdEl.innerText = hostId;
            connectionStatus.innerText = "Connected to Host!";
            connectionStatus.style.color = "#0ff";
            
            startGameAsClient();
        });

        conn.on('data', (data) => {
            if (data.type === 'state') {
                state = data.state;
                score = data.score;
                scoreElement.innerText = score;
                
                // Play sounds triggered by host
                if (data.sounds) {
                    data.sounds.forEach(s => playSound(s));
                }
                
                if (data.isGameOver && !isGameOver) showGameOverScreen();
                else if (!data.isGameOver && isGameOver) {
                    isGameOver = false;
                    gameOverScreen.classList.add('hidden');
                }
            } else if (data.type === 'error') {
                alert(data.msg);
                location.reload();
            }
        });

        conn.on('close', () => {
            alert("Connection lost.");
            location.reload();
        });
    });
    
    peer.on('error', (err) => {
        alert("Error connecting: " + err.type);
        joinBtn.innerText = "Join Room";
    });
}

// --------------------------------------------------------
// Game Logic
// --------------------------------------------------------

function startGameAsHost() {
    isHost = true;
    myPlayerId = 'p1';
    
    state.p1 = { x: canvas.width / 2 - 50, y: canvas.height - 70, width: 40, height: 40, color: '#00ffff', weaponLevel: 1 };
    state.p2 = { x: canvas.width / 2 + 10, y: canvas.height - 70, width: 40, height: 40, color: '#ff00ff', active: isMultiplayer, weaponLevel: 1 };
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    state.powerups = [];
    score = 0;
    bossSpawnThreshold = 500;
    isBossActive = false;
    scoreElement.innerText = score;
    isGameOver = false;
    isGameRunning = true;
    keys = {};
    clientKeys = {};
    
    initStars();
    gameOverScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    clientWaitingMsg.classList.add('hidden');
    
    cancelAnimationFrame(gameLoopId);
    gameLoop();
}

function startGameAsClient() {
    isGameOver = false;
    isGameRunning = true;
    keys = {};
    initStars();
    
    gameOverScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    restartBtn.classList.add('hidden');
    clientWaitingMsg.classList.remove('hidden');
    
    cancelAnimationFrame(gameLoopId);
    clientLoop();
}

function createExplosion(x, y, color, scale = 1) {
    const count = 15 * scale;
    for (let i = 0; i < count; i++) {
        state.particles.push(new Particle(x, y, color));
    }
}

// To sync sounds from Host to Client
let frameSounds = []; 

function triggerSound(type) {
    playSound(type);
    if (isMultiplayer && isHost) frameSounds.push(type);
}

function handleShooting(playerObj, inputKeys) {
    if (inputKeys['Space']) {
        let canShoot = true;
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            if (state.bullets[i].color === playerObj.color && playerObj.y - state.bullets[i].y < 35) {
                canShoot = false;
                break;
            }
        }
        
        if (canShoot) {
            triggerSound('shoot');
            const bx = playerObj.x + playerObj.width / 2 - 2;
            const by = playerObj.y;
            
            if (playerObj.weaponLevel === 1) {
                state.bullets.push(new Bullet(bx, by, playerObj.color));
            } else if (playerObj.weaponLevel === 2) {
                state.bullets.push(new Bullet(bx - 10, by, playerObj.color));
                state.bullets.push(new Bullet(bx + 10, by, playerObj.color));
            } else {
                state.bullets.push(new Bullet(bx, by, playerObj.color));
                state.bullets.push(new Bullet(bx - 15, by + 5, playerObj.color, -2));
                state.bullets.push(new Bullet(bx + 15, by + 5, playerObj.color, 2));
            }
        }
    }
}

function checkCollisions() {
    // Bullet hitting Enemy
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        for (let j = state.enemies.length - 1; j >= 0; j--) {
            const b = state.bullets[i];
            const e = state.enemies[j];

            if (b && e && b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
                state.bullets.splice(i, 1);
                e.hp--;
                
                // Small particle on hit
                state.particles.push(new Particle(b.x, b.y, '#fff'));

                if (e.hp <= 0) {
                    triggerSound('explode');
                    createExplosion(e.x + e.width/2, e.y + e.height/2, e.color, e.isBoss ? 5 : 1);
                    
                    // Powerup drop chance
                    if (e.isBoss || Math.random() < 0.1) {
                        state.powerups.push(new Powerup(e.x + e.width/2, e.y + e.height/2));
                    }

                    if (e.isBoss) {
                        isBossActive = false;
                        bossSpawnThreshold += 1000;
                        score += 200;
                    } else {
                        score += 10;
                    }
                    
                    state.enemies.splice(j, 1);
                    scoreElement.innerText = score;
                }
                break;
            }
        }
    }

    // Checking Player hits
    const players = [state.p1];
    if (state.p2.active) players.push(state.p2);

    players.forEach(p => {
        // Enemy hitting Player
        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            // Shrink hitbox slightly for fairer gameplay
            const hitboxShrink = 8;
            if (e.x < p.x + p.width - hitboxShrink && e.x + e.width > p.x + hitboxShrink &&
                e.y < p.y + p.height - hitboxShrink && e.y + e.height > p.y + hitboxShrink) {
                showGameOverScreen();
            }
        }

        // Powerup hitting Player
        for (let i = state.powerups.length - 1; i >= 0; i--) {
            const pw = state.powerups[i];
            if (pw.x < p.x + p.width && pw.x + pw.size > p.x &&
                pw.y < p.y + p.height && pw.y + pw.size > p.y) {
                
                triggerSound('powerup');
                if (p.weaponLevel < 3) p.weaponLevel++;
                state.powerups.splice(i, 1);
            }
        }
    });
}

function updateHostLogic() {
    if (isGameOver) return;
    frameSounds = [];

    // P1 Movement
    if (keys['ArrowLeft'] && state.p1.x > 0) state.p1.x -= playerSpeed;
    if (keys['ArrowRight'] && state.p1.x < canvas.width - state.p1.width) state.p1.x += playerSpeed;
    if (keys['ArrowUp'] && state.p1.y > 0) state.p1.y -= playerSpeed;
    if (keys['ArrowDown'] && state.p1.y < canvas.height - state.p1.height) state.p1.y += playerSpeed;
    handleShooting(state.p1, keys);

    // P2 Movement
    if (state.p2.active) {
        if (clientKeys['ArrowLeft'] && state.p2.x > 0) state.p2.x -= playerSpeed;
        if (clientKeys['ArrowRight'] && state.p2.x < canvas.width - state.p2.width) state.p2.x += playerSpeed;
        if (clientKeys['ArrowUp'] && state.p2.y > 0) state.p2.y -= playerSpeed;
        if (clientKeys['ArrowDown'] && state.p2.y < canvas.height - state.p2.height) state.p2.y += playerSpeed;
        handleShooting(state.p2, clientKeys);
    }

    // Bullets
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        state.bullets[i].update();
        if (state.bullets[i].y < -20 || state.bullets[i].x < 0 || state.bullets[i].x > canvas.width) {
            state.bullets.splice(i, 1);
        }
    }

    // Boss Spawn Check
    if (score >= bossSpawnThreshold && !isBossActive) {
        state.enemies.push(new Enemy(true));
        isBossActive = true;
    }

    // Normal Enemy Spawner
    if (!isBossActive && Math.random() < 0.03 + (score / 20000)) {
        state.enemies.push(new Enemy());
    }

    // Enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
        state.enemies[i].update();
        if (state.enemies[i].y > canvas.height) {
            state.enemies.splice(i, 1);
            score = Math.max(0, score - 10);
            scoreElement.innerText = score;
        }
    }

    // Powerups
    for (let i = state.powerups.length - 1; i >= 0; i--) {
        state.powerups[i].update();
        if (state.powerups[i].y > canvas.height) state.powerups.splice(i, 1);
    }

    // Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        state.particles[i].update();
        if (state.particles[i].life <= 0) state.particles.splice(i, 1);
    }

    checkCollisions();
}

// --------------------------------------------------------
// Drawing Logic (Runs on both Host and Client)
// --------------------------------------------------------

function drawShip(x, y, w, h, color) {
    ctx.save();
    ctx.translate(x + w/2, y + h/2);
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.fillStyle = '#111';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(0, -h/2); // Nose
    ctx.lineTo(w/2, h/2); // Right wing
    ctx.lineTo(0, h/4);   // Engine indent
    ctx.lineTo(-w/2, h/2); // Left wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Engine glow
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(0, h/2, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x + e.width/2, e.y + e.height/2);
    ctx.shadowBlur = e.isBoss ? 20 : 10;
    ctx.shadowColor = e.color;
    ctx.strokeStyle = e.color;
    ctx.fillStyle = '#000';
    ctx.lineWidth = 2;

    if (e.isBoss) {
        // Boss shape
        ctx.beginPath();
        ctx.moveTo(-e.width/2, -e.height/2);
        ctx.lineTo(e.width/2, -e.height/2);
        ctx.lineTo(e.width/2, e.height/4);
        ctx.lineTo(0, e.height/2);
        ctx.lineTo(-e.width/2, e.height/4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Boss HP bar
        ctx.fillStyle = '#333';
        ctx.fillRect(-e.width/2, -e.height/2 - 15, e.width, 5);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-e.width/2, -e.height/2 - 15, e.width * (e.hp / e.maxHp), 5);

    } else {
        // Normal enemy shape (hexagon)
        ctx.beginPath();
        for(let i=0; i<6; i++) {
            const angle = i * Math.PI / 3 + Math.PI/6;
            const px = Math.cos(angle) * (e.width/2);
            const py = Math.sin(angle) * (e.height/2);
            if(i===0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateStars();
    // Draw stars
    ctx.fillStyle = '#fff';
    localStars.forEach(s => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    drawShip(state.p1.x, state.p1.y, state.p1.width, state.p1.height, state.p1.color);
    if (state.p2.active) {
        drawShip(state.p2.x, state.p2.y, state.p2.width, state.p2.height, state.p2.color);
    }

    state.bullets.forEach(b => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        ctx.fillStyle = '#fff';
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });
    ctx.shadowBlur = 0;

    state.enemies.forEach(e => drawEnemy(e));

    state.powerups.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x + p.size/2, p.y + p.size/2, p.size/2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('P', p.x + p.size/2, p.y + p.size/2 + 3);
        ctx.shadowBlur = 0;
    });

    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
}

// --------------------------------------------------------
// Game Loops
// --------------------------------------------------------

function gameLoop() {
    if (!isGameOver) updateHostLogic();
    draw();
    
    if (isMultiplayer && conn && conn.open) {
        conn.send({
            type: 'state',
            state: state,
            score: score,
            isGameOver: isGameOver,
            sounds: frameSounds.length > 0 ? frameSounds : undefined
        });
    }

    if (isGameRunning) gameLoopId = requestAnimationFrame(gameLoop);
}

let lastSentKeys = "";
function clientLoop() {
    draw(); 
    if (conn && conn.open && !isGameOver) {
        let currentKeysStr = JSON.stringify(keys);
        if (currentKeysStr !== lastSentKeys) {
            conn.send({ type: 'inputs', keys: keys });
            lastSentKeys = currentKeysStr;
        }
    }
    if (isGameRunning) gameLoopId = requestAnimationFrame(clientLoop);
}

function showGameOverScreen() {
    if (!isGameOver) {
        triggerSound('explode');
        triggerSound('explode');
    }
    isGameOver = true;
    
    if (isHost) {
        createExplosion(state.p1.x + state.p1.width/2, state.p1.y + state.p1.height/2, state.p1.color, 3);
        if (state.p2.active) {
            createExplosion(state.p2.x + state.p2.width/2, state.p2.y + state.p2.height/2, state.p2.color, 3);
        }
    }

    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// UI Listeners
hostBtn.addEventListener('click', () => {
    initAudio();
    hostBtn.innerText = "Creating...";
    initPeerAsHost();
});

joinBtn.addEventListener('click', () => {
    initAudio();
    const id = joinInput.value.trim();
    if (id) initPeerAsClient(id);
});

restartBtn.addEventListener('click', () => {
    if (isHost) startGameAsHost();
});

myRoomIdEl.addEventListener('click', () => {
    navigator.clipboard.writeText(myRoomIdEl.innerText);
    const oldText = myRoomIdEl.innerText;
    myRoomIdEl.innerText = "Copied!";
    setTimeout(() => { myRoomIdEl.innerText = oldText; }, 1000);
});

// Initial draw
initStars();
draw();
