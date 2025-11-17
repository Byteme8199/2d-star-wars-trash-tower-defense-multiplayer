console.log('main.js loaded');
let currentUser = null;
let gameInstance = null;
let socket = null;
let currentShiftId = null;
let previousPlayers = [];

// Check for existing token on page load
window.addEventListener('load', async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const res = await fetch('http://localhost:3001/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('nav').style.display = 'flex';
        document.getElementById('locker-room').style.display = 'block';
        document.getElementById('nav-username').textContent = currentUser.username;
        document.getElementById('nav-scrap').textContent = currentUser.scrap;
        document.getElementById('nav-unlocks').textContent = currentUser.unlocks.join(', ');
        socket = io('http://localhost:3001');
        // Set up socket listeners
        socket.on('shift-update', (shift) => {
            // Update player list if locker room is visible
            if (document.getElementById('locker-room').style.display !== 'none') {
                const playerNames = shift.players.map(p => p.username).join(', ');
                document.getElementById('players').textContent = playerNames;
                // Show/hide chat based on multiplayer
                const chatDiv = document.getElementById('chat');
                if (shift.players.length > 1) {
                    chatDiv.style.display = 'block';
                } else {
                    chatDiv.style.display = 'none';
                }
                // Show/hide join section based on multiplayer
                const joinSec = document.getElementById('join-section');
                if (shift.players.length > 1) {
                    joinSec.style.display = 'none';
                } else {
                    joinSec.style.display = 'block';
                }
                // Show/hide join section based on multiplayer
                const joinSection = document.getElementById('join-section');
                if (shift.players.length > 1) {
                    joinSection.style.display = 'none';
                } else {
                    joinSection.style.display = 'block';
                }
                // Update ready button
                const startBtn = document.getElementById('start-shift');
                if (shift.map) {
                    // Map is generated, enable ready if not already ready
                    if (shift.ready && shift.ready.some(r => r.userId === currentUser._id)) {
                        startBtn.textContent = "Waiting for others...";
                        startBtn.disabled = true;
                    } else {
                        startBtn.textContent = "I'm Ready";
                        startBtn.disabled = false;
                    }
                } else {
                    // Map not generated yet
                    startBtn.disabled = true;
                    startBtn.textContent = "Generating Map...";
                }
                // Update previousPlayers before notifications
                const currentPrevious = [...previousPlayers];
                // Notifications
                const newPlayers = shift.players.filter(p => !currentPrevious.some(pp => pp.userId === p.userId));
                if (newPlayers.length > 0) {
                    newPlayers.forEach(newPlayer => {
                        if (newPlayer.userId === currentUser._id) {
                            // You joined
                            const host = shift.players[0];
                            alert(`You've joined ${host.username}'s shift`);
                        } else {
                            // Someone else joined
                            alert(`${newPlayer.username} has joined your shift`);
                        }
                    });
                }
                previousPlayers = [...shift.players];
            }
        });
        socket.on('chat-message', (data) => {
            const messagesDiv = document.getElementById('chat-messages');
            const messageElement = document.createElement('div');
            messageElement.textContent = `${data.username}: ${data.message}`;
            messagesDiv.appendChild(messageElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
        socket.on('shift-started', () => {
            document.getElementById('locker-room').style.display = 'none';
            startGame();
        });
        socket.on('reconnect', () => {
            if (currentShiftId) {
                socket.emit('join-shift', { shiftId: currentShiftId, userId: currentUser._id });
            }
        });
        // Create shift on entering locker room
        fetch('http://localhost:3001/create-shift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser._id })
        }).then(res => res.json()).then(data => {
          currentShiftId = data.shift.id;
          document.getElementById('code').textContent = currentShiftId;
          // Disable ready button until map is generated
          const startBtn = document.getElementById('start-shift');
          startBtn.disabled = true;
          startBtn.textContent = "Generating Map...";
          socket.emit('join-shift', { shiftId: data.shift.id, userId: currentUser._id });
          previousPlayers = [{ userId: currentUser._id, username: currentUser.username }];
        });
      } else {
        localStorage.removeItem('token');
      }
    } catch (err) {
      localStorage.removeItem('token');
    }
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  console.log('Login button clicked');
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('http://localhost:3001/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      localStorage.setItem('token', data.token);
      document.getElementById('login-container').style.display = 'none';
      document.getElementById('nav').style.display = 'flex';
      document.getElementById('locker-room').style.display = 'block';
      document.getElementById('nav-username').textContent = currentUser.username;
      document.getElementById('nav-scrap').textContent = currentUser.scrap;
      document.getElementById('nav-unlocks').textContent = currentUser.unlocks.join(', ');
      socket = io('http://localhost:3001');
      // Set up socket listeners
      socket.on('shift-update', (shift) => {
          // Update player list if locker room is visible
          if (document.getElementById('locker-room').style.display !== 'none') {
              const playerNames = shift.players.map(p => p.username).join(', ');
              document.getElementById('players').textContent = playerNames;
              // Show/hide chat based on multiplayer
              const chatDiv = document.getElementById('chat');
              if (shift.players.length > 1) {
                  chatDiv.style.display = 'block';
              } else {
                  chatDiv.style.display = 'none';
              }
              // Update ready button
              const startBtn = document.getElementById('start-shift');
              if (shift.map) {
                  // Map is generated, enable ready if not already ready
                  if (shift.ready && shift.ready.some(r => r.userId === currentUser._id)) {
                      startBtn.textContent = "Waiting for others...";
                      startBtn.disabled = true;
                  } else {
                      startBtn.textContent = "I'm Ready";
                      startBtn.disabled = false;
                  }
              } else {
                  // Map not generated yet
                  startBtn.disabled = true;
                  startBtn.textContent = "Generating Map...";
              }
              // Update previousPlayers before notifications
              const currentPrevious = [...previousPlayers];
              // Notifications
              const newPlayers = shift.players.filter(p => !currentPrevious.some(pp => pp.userId === p.userId));
              if (newPlayers.length > 0) {
                  newPlayers.forEach(newPlayer => {
                      if (newPlayer.userId === currentUser._id) {
                          // You joined
                          const host = shift.players[0];
                          alert(`You've joined ${host.username}'s shift`);
                      } else {
                          // Someone else joined
                          alert(`${newPlayer.username} has joined your shift`);
                      }
                  });
              }
              previousPlayers = [...shift.players];
          }
      });
      socket.on('chat-message', (data) => {
          const messagesDiv = document.getElementById('chat-messages');
          const messageElement = document.createElement('div');
          messageElement.textContent = `${data.username}: ${data.message}`;
          messagesDiv.appendChild(messageElement);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
      });
      socket.on('shift-started', () => {
          document.getElementById('locker-room').style.display = 'none';
          startGame();
      });
      socket.on('reconnect', () => {
          if (currentShiftId) {
              socket.emit('join-shift', { shiftId: currentShiftId, userId: currentUser._id });
          }
      });
      // Create shift on entering locker room
      console.log('Creating shift for userId:', currentUser._id);
      fetch('http://localhost:3001/create-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser._id })
      }).then(res => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error('Failed to create shift: ' + res.status);
        }
      }).then(data => {
        console.log('Shift created:', data);
        currentShiftId = data.shift.id;
        document.getElementById('code').textContent = currentShiftId;
        // Disable ready button until map is generated
        const startBtn = document.getElementById('start-shift');
        startBtn.disabled = true;
        startBtn.textContent = "Generating Map...";
        socket.emit('join-shift', { shiftId: data.shift.id, userId: currentUser._id });
        previousPlayers = [{ userId: currentUser._id, username: currentUser.username }];
      }).catch(err => console.error('Create shift error:', err));
    } else {
      document.getElementById('message').textContent = data.message;
    }
  } catch (error) {
    console.error('Login error:', error);
    document.getElementById('message').textContent = 'Login failed: ' + error.message;
  }
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('http://localhost:3001/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  document.getElementById('message').textContent = data.message;
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('http://localhost:3001/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser._id })
  });
  document.getElementById('nav').style.display = 'none';
  document.getElementById('login-container').style.display = 'block';
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
  currentUser = null;
  localStorage.removeItem('token');
  socket.disconnect();
});

document.getElementById('locker-btn').addEventListener('click', () => {
  document.getElementById('locker-room').style.display = 'block';
});

document.getElementById('send-chat').addEventListener('click', () => {
  const message = document.getElementById('chat-input').value.trim();
  if (message && currentShiftId) {
    socket.emit('chat-message', { shiftId: currentShiftId, message, username: currentUser.username });
    document.getElementById('chat-input').value = '';
  }
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('send-chat').click();
  }
});

document.getElementById('join-shift-btn').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim();
  if (code) {
    if (code === currentShiftId) {
      alert("Can't join your own shift");
      return;
    }
    fetch('http://localhost:3001/join-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftId: code, userId: currentUser._id })
    }).then(response => {
      if (response.ok) {
        return response.json();
      } else {
        return response.json().then(err => { throw new Error(err.message || 'Failed to join'); });
      }
    }).then(data => {
      currentShiftId = code;
      document.getElementById('code').textContent = code;
      document.getElementById('join-section').style.display = 'none';
      socket.emit('join-shift', { shiftId: code, userId: currentUser._id });
      previousPlayers = [...data.shift.players];
    }).catch(err => alert(err.message));
  }
});

document.getElementById('start-shift').addEventListener('click', () => {
  if (currentShiftId) {
    const startBtn = document.getElementById('start-shift');
    startBtn.textContent = "Waiting for others...";
    startBtn.disabled = true;
    socket.emit('ready', { shiftId: currentShiftId, userId: currentUser._id });
  }
});

function startGame() {
  if (gameInstance) return; // Prevent multiple instances
  gameInstance = new Phaser.Game(config);
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        // Load assets here (e.g., this.load.image('tower', 'assets/tower.png');)
        // For now, no assets loaded
    }

    create() {
        // Set background color
        this.cameras.main.setBackgroundColor('#000011');

        // Set world bounds
        this.physics.world.setBounds(0, 0, 800, 600);

        // Grid settings
        this.cellSize = 10;
        this.gridWidth = 80;
        this.gridHeight = 60;
        this.pathSquares = new Set();

        // Graphics for path
        this.graphics = this.add.graphics();

        // Initialize groups
        this.enemies = this.physics.add.group();
        this.weapons = this.add.group();
        this.players = this.physics.add.group();
        this.playerSprites = {};

        // Movement throttling
        this.lastMoveEmit = 0;

        // WASD keys
        this.wasd = {
            w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // Listen for shift updates
        socket.on('shift-update', (shift) => {
            this.updateFromServer(shift);
        });

        // Weapon placement mode
        this.placingWeapon = false;
        this.selectedWeaponType = null;

        // Input for placing weapons
        this.input.on('pointerdown', this.placeWeapon, this);

        // UI buttons
        document.getElementById('weapon1').addEventListener('click', () => {
            this.selectedWeaponType = 'pressure-washer';
            this.placingWeapon = true;
        });
        document.getElementById('weapon2').addEventListener('click', () => {
            this.selectedWeaponType = 'laser-cutter';
            this.placingWeapon = true;
        });
        document.getElementById('weapon3').addEventListener('click', () => {
            this.selectedWeaponType = 'waste-escape-pod';
            this.placingWeapon = true;
        });
    }

    update() {
        // Handle player movement
        if (this.player) {
            let dx = 0, dy = 0;
            if (this.wasd.a.isDown) dx -= 2;
            if (this.wasd.d.isDown) dx += 2;
            if (this.wasd.w.isDown) dy -= 2;
            if (this.wasd.s.isDown) dy += 2;
            if (dx || dy) {
                this.player.x += dx;
                this.player.y += dy;
                this.player.x = Phaser.Math.Clamp(this.player.x, 0, 780);
                this.player.y = Phaser.Math.Clamp(this.player.y, 0, 580);
                const now = Date.now();
                if (now - this.lastMoveEmit > 100) {
                    socket.emit('move', { shiftId: currentShiftId, x: this.player.x, y: this.player.y, userId: currentUser._id });
                    this.lastMoveEmit = now;
                }
            }
        }
    }

    updateFromServer(shift) {
        // Update map if available
        if (shift.map && !this.enemyPath) {
            this.pathSquares = new Set(shift.map.pathSquares.map(s => `${s.x},${s.y}`));
            // Draw path
            this.graphics.clear();
            this.graphics.fillStyle(0x00ff00);
            shift.map.pathSquares.forEach(square => {
                this.graphics.fillRect(square.x * this.cellSize, square.y * this.cellSize, this.cellSize, this.cellSize);
            });
            // Create enemy path
            this.enemyPath = new Phaser.Curves.Path(shift.map.startPos.x * this.cellSize + 5, shift.map.startPos.y * this.cellSize + 5);
            shift.map.pathSquares.forEach(square => {
                this.enemyPath.lineTo(square.x * this.cellSize + 5, square.y * this.cellSize + 5);
            });
        }

        // Clear existing enemies and weapons
        this.enemies.clear(true, true);
        this.weapons.clear(true, true);

        // Update players
        shift.players.forEach(p => {
            let x = p.x || 400;
            let y = p.y || 300;
            if (p.userId === currentUser._id) {
                if (!this.player) {
                    this.player = this.players.create(x, y, null);
                    this.player.setTint(0x00ff00);
                    this.player.setDisplaySize(20, 20);
                    this.player.setCollideWorldBounds(true);
                }
            } else {
                if (!this.playerSprites[p.userId]) {
                    let sprite = this.players.create(x, y, null);
                    sprite.setTint(0xffffff); // White for other players
                    sprite.setDisplaySize(20, 20);
                    sprite.setCollideWorldBounds(true);
                    this.playerSprites[p.userId] = sprite;
                } else {
                    this.playerSprites[p.userId].x = x;
                    this.playerSprites[p.userId].y = y;
                }
            }
        });

        // Add enemies
        shift.enemies.forEach(e => {
            let enemy = this.enemies.create(e.x, e.y, null);
            enemy.setTint(0xff0000);
            enemy.setDisplaySize(20, 20);
        });

        // Add weapons
        shift.weapons.forEach(w => {
            let weapon = this.weapons.create(w.x, w.y, null);
            weapon.setTint(0x0000ff);
            weapon.setDisplaySize(30, 30);
        });

        // Update UI
        document.getElementById('overflow').textContent = shift.overflow;
        document.getElementById('wave').textContent = shift.wave;
        document.getElementById('scrap').textContent = shift.scrap;
    }

    placeWeapon(pointer) {
        if (this.placingWeapon && this.selectedWeaponType && currentShiftId) {
            let gx = Math.floor(pointer.x / this.cellSize);
            let gy = Math.floor(pointer.y / this.cellSize);
            if (!this.pathSquares.has(`${gx},${gy}`)) {
                socket.emit('place-weapon', { shiftId: currentShiftId, x: pointer.x, y: pointer.y, type: this.selectedWeaponType, userId: currentUser._id });
                this.placingWeapon = false;
                this.selectedWeaponType = null;
            }
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    scene: GameScene,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    }
};

// Start game directly for testing
// startGame();