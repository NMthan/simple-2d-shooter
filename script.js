const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverScreen = document.getElementById('game-over');
const startScreen = document.getElementById('start-screen');
const finalScoreElement = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game State
let gameLoopId;
let isGameOver = false;
let isGameRunning = false;
let score = 0;
let keys = {};

// Game Objects
const player = {
    x: canvas.width / 2,
    y: canvas.height - 50,
    width: 40,
    height: 40,
    speed: 5,
    color: '#00ffff'
};

const bullets = [];
const enemies = [];
const particles = [];

// Input Handling
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Classes
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 15;
        this.speed = 10;
        this.color = '#ffff00';
    }

    update() {
        this.y -= this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Enemy {
    constructor() {
        this.width = 30;
        this.height = 30;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = 2 + Math.random() * 2 + (score / 500); // Increase speed based on score
        this.color = '#ff0044';
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
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

    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// Game Functions
function init() {
    player.x = canvas.width / 2 - player.width / 2;
    bullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    score = 0;
    scoreElement.innerText = score;
    isGameOver = false;
    isGameRunning = true;
    keys = {};
    
    gameOverScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    
    gameLoop();
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function spawnEnemy() {
    if (Math.random() < 0.02 + (score / 10000)) { // Spawn rate increases slightly with score
        enemies.push(new Enemy());
    }
}

function checkCollisions() {
    // Bullet hitting Enemy
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const b = bullets[i];
            const e = enemies[j];

            if (b && e &&
                b.x < e.x + e.width &&
                b.x + b.width > e.x &&
                b.y < e.y + e.height &&
                b.y + b.height > e.y) {
                
                createExplosion(e.x + e.width/2, e.y + e.height/2, e.color);
                
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score += 10;
                scoreElement.innerText = score;
                break; // Bullet destroyed, move to next bullet
            }
        }
    }

    // Enemy hitting Player
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.x < player.x + player.width &&
            e.x + e.width > player.x &&
            e.y < player.y + player.height &&
            e.y + e.height > player.y) {
            
            gameOver();
        }
    }
}

function update() {
    if (isGameOver) return;

    // Player Movement
    if (keys['ArrowLeft'] && player.x > 0) {
        player.x -= player.speed;
    }
    if (keys['ArrowRight'] && player.x < canvas.width - player.width) {
        player.x += player.speed;
    }

    // Shooting
    if (keys['Space']) {
        // Prevent rapid fire by checking last bullet position or adding a cooldown
        // For simplicity, just check if enough space above player
        let canShoot = true;
        if (bullets.length > 0) {
            const lastBullet = bullets[bullets.length - 1];
            if (player.y - lastBullet.y < 30) {
                canShoot = false;
            }
        }
        
        if (canShoot) {
            bullets.push(new Bullet(player.x + player.width / 2 - 2, player.y));
        }
    }

    // Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
        }
    }

    spawnEnemy();

    // Update Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        if (enemies[i].y > canvas.height) {
            enemies.splice(i, 1);
            score -= 5; // Penalty for letting enemies pass
            if (score < 0) score = 0;
            scoreElement.innerText = score;
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    checkCollisions();
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    // Add a little cockpit
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.x + 10, player.y + 10, 20, 15);

    // Draw Bullets
    bullets.forEach(b => b.draw());

    // Draw Enemies
    enemies.forEach(e => e.draw());

    // Draw Particles
    particles.forEach(p => p.draw());
}

function gameLoop() {
    if (!isGameOver) {
        update();
        draw();
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

function gameOver() {
    isGameOver = true;
    isGameRunning = false;
    cancelAnimationFrame(gameLoopId);
    
    // Draw one final frame with explosion on player
    createExplosion(player.x + player.width/2, player.y + player.height/2, player.color);
    draw();
    
    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// Event Listeners for Buttons
startBtn.addEventListener('click', init);
restartBtn.addEventListener('click', init);

// Initial draw (just background)
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
