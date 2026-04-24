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
let clientKeys = {}; // For host to store client's inputs

// Game Objects shared state
let state = {
    p1: { x: canvas.width / 2 - 50, y: canvas.height - 50, width: 40, height: 40, color: '#00ffff' },
    p2: { x: canvas.width / 2 + 10, y: canvas.height - 50, width: 40, height: 40, color: '#ff00ff', active: false },
    bullets: [],
    enemies: [],
    particles: []
};

const playerSpeed = 5;

// Input Handling
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Classes for Logic (Only Host uses these)
class Bullet {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 15;
        this.speed = 10;
        this.color = color;
    }
    update() { this.y -= this.speed; }
}

class Enemy {
    constructor() {
        this.width = 30;
        this.height = 30;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = 2 + Math.random() * 2 + (score / 500);
        this.color = '#ff0044';
    }
    update() { this.y += this.speed; }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.color = color;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }
}

// --------------------------------------------------------
// Multiplayer Networking Logic
// --------------------------------------------------------

function generateShortId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initPeerAsHost() {
    const roomId = generateShortId();
    peer = new Peer(roomId);

    peer.on('open', (id) => {
        myRoomIdEl.innerText = id;
        roomInfo.classList.remove('hidden');
        startGameAsHost(); // Start solo, others can join anytime
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
    connectionStatus.innerText = "Player 2 Joined!";
    connectionStatus.style.color = "#00ff00";

    conn.on('data', (data) => {
        if (data.type === 'inputs') {
            clientKeys = data.keys;
        }
    });

    conn.on('close', () => {
        isMultiplayer = false;
        state.p2.active = false;
        clientKeys = {};
        conn = null;
        connectionStatus.innerText = "Player 2 Disconnected.";
        connectionStatus.style.color = "#ff0000";
    });
}

function initPeerAsClient(hostId) {
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
            connectionStatus.style.color = "#00ff00";
            
            startGameAsClient();
        });

        conn.on('data', (data) => {
            if (data.type === 'state') {
                state = data.state;
                score = data.score;
                scoreElement.innerText = score;
                
                if (data.isGameOver && !isGameOver) {
                    showGameOverScreen();
                } else if (!data.isGameOver && isGameOver) {
                    // Host restarted
                    isGameOver = false;
                    gameOverScreen.classList.add('hidden');
                }
            } else if (data.type === 'error') {
                alert(data.msg);
                location.reload();
            }
        });

        conn.on('close', () => {
            alert("Connection to host lost.");
            location.reload();
        });
    });
    
    peer.on('error', (err) => {
        alert("Error connecting: " + err.type);
        joinBtn.innerText = "Join Room";
    });
}


// --------------------------------------------------------
// Game Functions
// --------------------------------------------------------

function startGameAsHost() {
    isHost = true;
    myPlayerId = 'p1';
    
    // Reset state
    state.p1.x = canvas.width / 2 - (isMultiplayer ? 50 : state.p1.width/2);
    state.p2.x = canvas.width / 2 + 10;
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    score = 0;
    scoreElement.innerText = score;
    isGameOver = false;
    isGameRunning = true;
    keys = {};
    clientKeys = {};
    
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
    
    gameOverScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    restartBtn.classList.add('hidden');
    clientWaitingMsg.classList.remove('hidden');
    
    cancelAnimationFrame(gameLoopId);
    clientLoop();
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        state.particles.push(new Particle(x, y, color));
    }
}

function spawnEnemy() {
    // Host only
    if (Math.random() < 0.02 + (score / 10000)) {
        state.enemies.push(new Enemy());
    }
}

function handleShooting(playerObj, isPlayer1, inputKeys) {
    if (inputKeys['Space']) {
        let canShoot = true;
        // Check cooldown by looking at newest bullet from this player color
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            if (b.color === playerObj.color) {
                if (playerObj.y - b.y < 40) {
                    canShoot = false;
                }
                break;
            }
        }
        
        if (canShoot) {
            state.bullets.push(new Bullet(playerObj.x + playerObj.width / 2 - 2, playerObj.y, playerObj.color));
        }
    }
}

function checkCollisions() {
    // Bullet hitting Enemy
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        for (let j = state.enemies.length - 1; j >= 0; j--) {
            const b = state.bullets[i];
            const e = state.enemies[j];

            if (b && e &&
                b.x < e.x + e.width && b.x + b.width > e.x &&
                b.y < e.y + e.height && b.y + b.height > e.y) {
                
                createExplosion(e.x + e.width/2, e.y + e.height/2, e.color);
                
                state.bullets.splice(i, 1);
                state.enemies.splice(j, 1);
                score += 10;
                scoreElement.innerText = score;
                break;
            }
        }
    }

    // Enemy hitting Players
    for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        
        // Hit P1
        if (e.x < state.p1.x + state.p1.width && e.x + e.width > state.p1.x &&
            e.y < state.p1.y + state.p1.height && e.y + e.height > state.p1.y) {
            showGameOverScreen();
        }
        
        // Hit P2
        if (state.p2.active && 
            e.x < state.p2.x + state.p2.width && e.x + e.width > state.p2.x &&
            e.y < state.p2.y + state.p2.height && e.y + e.height > state.p2.y) {
            showGameOverScreen();
        }
    }
}

function updateHostLogic() {
    if (isGameOver) return;

    // P1 Movement
    if (keys['ArrowLeft'] && state.p1.x > 0) state.p1.x -= playerSpeed;
    if (keys['ArrowRight'] && state.p1.x < canvas.width - state.p1.width) state.p1.x += playerSpeed;
    handleShooting(state.p1, true, keys);

    // P2 Movement (from clientKeys)
    if (state.p2.active) {
        if (clientKeys['ArrowLeft'] && state.p2.x > 0) state.p2.x -= playerSpeed;
        if (clientKeys['ArrowRight'] && state.p2.x < canvas.width - state.p2.width) state.p2.x += playerSpeed;
        handleShooting(state.p2, false, clientKeys);
    }

    // Update Bullets
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        state.bullets[i].update();
        if (state.bullets[i].y < 0) state.bullets.splice(i, 1);
    }

    spawnEnemy();

    // Update Enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
        state.enemies[i].update();
        if (state.enemies[i].y > canvas.height) {
            state.enemies.splice(i, 1);
            score -= 5;
            if (score < 0) score = 0;
            scoreElement.innerText = score;
        }
    }

    // Update Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        state.particles[i].update();
        if (state.particles[i].life <= 0) state.particles.splice(i, 1);
    }

    checkCollisions();
}

function drawPlayer(pObj) {
    ctx.fillStyle = pObj.color;
    ctx.fillRect(pObj.x, pObj.y, pObj.width, pObj.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pObj.x + 10, pObj.y + 10, 20, 15);
}

function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawPlayer(state.p1);
    if (state.p2.active) {
        drawPlayer(state.p2);
    }

    // Draw Bullets
    state.bullets.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    // Draw Enemies
    state.enemies.forEach(e => {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.width, e.height);
    });

    // Draw Particles
    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
}

// Host Loop
function gameLoop() {
    if (!isGameOver) {
        updateHostLogic();
    }
    draw();
    
    // Broadcast state
    if (isMultiplayer && conn && conn.open) {
        conn.send({
            type: 'state',
            state: state,
            score: score,
            isGameOver: isGameOver
        });
    }

    if (isGameRunning) {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

// Client Loop
let lastSentKeys = "";
function clientLoop() {
    draw(); // Draw state received from host
    
    // Send inputs to host if changed
    if (conn && conn.open && !isGameOver) {
        let currentKeysStr = JSON.stringify(keys);
        if (currentKeysStr !== lastSentKeys) {
            conn.send({ type: 'inputs', keys: keys });
            lastSentKeys = currentKeysStr;
        }
    }

    if (isGameRunning) {
        gameLoopId = requestAnimationFrame(clientLoop);
    }
}

function showGameOverScreen() {
    isGameOver = true;
    
    if (isHost) {
        createExplosion(state.p1.x + state.p1.width/2, state.p1.y + state.p1.height/2, state.p1.color);
        if (state.p2.active) {
            createExplosion(state.p2.x + state.p2.width/2, state.p2.y + state.p2.height/2, state.p2.color);
        }
    }

    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
}


// UI Listeners
hostBtn.addEventListener('click', () => {
    hostBtn.innerText = "Creating...";
    initPeerAsHost();
});

joinBtn.addEventListener('click', () => {
    const id = joinInput.value.trim();
    if (id) {
        initPeerAsClient(id);
    }
});

restartBtn.addEventListener('click', () => {
    if (isHost) {
        startGameAsHost();
    }
});

myRoomIdEl.addEventListener('click', () => {
    // Copy room ID to clipboard
    navigator.clipboard.writeText(myRoomIdEl.innerText);
    const oldText = myRoomIdEl.innerText;
    myRoomIdEl.innerText = "Copied!";
    setTimeout(() => { myRoomIdEl.innerText = oldText; }, 1000);
});

// Initial draw (just background)
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
