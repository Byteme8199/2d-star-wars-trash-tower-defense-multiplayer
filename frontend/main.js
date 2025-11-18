// Helper function to get or create message element
function getMessageElement() {
  let messageEl = document.getElementById('message');
  if (!messageEl) {
    messageEl = document.createElement('p');
    messageEl.id = 'message';
    messageEl.style.textAlign = 'center';
    messageEl.style.color = 'red';
    document.body.insertBefore(messageEl, document.getElementById('nav'));
  }
  return messageEl;
}

var currentUser = null;
var gameInstance = null;
var socket = null;
var currentShiftId = null;
var previousPlayers = [];
var selectedIndex = 0;

const WEAPON_GRID_SIZES = {
  'pressure-washer': {w:1,h:1},
  'missile-launcher': {w:2,h:2},
  'laser-cutter': {w:1,h:3},
  'waste-escape-pod': {w:4,h:4}
};

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
        if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
          currentUser.toolbelt = ['pressure-washer'];
        }
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('nav').style.display = 'flex';
        document.getElementById('locker-room').style.display = 'block';
        populateToolbelt();
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
      if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
        currentUser.toolbelt = ['pressure-washer'];
      }
      localStorage.setItem('token', data.token);
      document.getElementById('login-container').style.display = 'none';
      document.getElementById('nav').style.display = 'flex';
      document.getElementById('locker-room').style.display = 'block';
      document.getElementById('nav-username').textContent = currentUser.username;
    //   document.getElementById('nav-scrap').textContent = currentUser.scrap;
    //   document.getElementById('nav-unlocks').textContent = currentUser.unlocks.join(', ');
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
      const messageEl = getMessageElement();
      messageEl.textContent = data.message;
    }
  } catch (error) {
    console.error('Login error:', error);
    const messageEl = getMessageElement();
    messageEl.textContent = 'Login failed: ' + error.message;
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
  const messageEl = getMessageElement();
  messageEl.textContent = data.message;
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('http://localhost:3001/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser._id })
  });
  // Reset all UI elements to initial state
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('nav').style.display = 'none';
  document.getElementById('locker-room').style.display = 'none';
  document.getElementById('ui-overlay').style.display = 'none';
  document.getElementById('tower-panel').style.display = 'none';
  document.getElementById('item-modal').style.display = 'none';
  document.getElementById('boost-modal').style.display = 'none';
  document.getElementById('show-boosts-modal').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('toolbelt-ui').style.display = 'none';
  // Clear message
  getMessageElement().textContent = '';
  // Destroy game instance
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
  // Reset variables
  currentUser = null;
  currentShiftId = null;
  previousPlayers = [];
  selectedIndex = 0;
  localStorage.removeItem('token');
  if (socket) {
    socket.disconnect();
    socket = null;
  }
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

document.getElementById('toggle-boosts').addEventListener('click', () => {
  const modal = document.getElementById('show-boosts-modal');
  const boostsList = document.getElementById('boosts-list');
  boostsList.innerHTML = '';
  const player = window.currentShift.players.find(p => p.userId === currentUser._id);
  if (player && player.boosts) {
    player.boosts.forEach((boost) => {
      const boostDiv = document.createElement('div');
      boostDiv.textContent = `${boost.type.replace('-', ' ')} (${boost.rarity})`;
      boostDiv.style.margin = '5px';
      boostDiv.style.padding = '5px';
      boostDiv.style.border = '1px solid #fff';
      boostsList.appendChild(boostDiv);
    });
  }
  modal.style.display = 'block';
  if (window.currentShift.players.length === 1) {
    socket.emit('pause-game', { shiftId: currentShiftId });
  }
});

document.getElementById('close-boosts-modal').addEventListener('click', () => {
  document.getElementById('show-boosts-modal').style.display = 'none';
  if (window.currentShift.players.length === 1) {
    socket.emit('resume-game', { shiftId: currentShiftId });
  }
});

function populateToolbelt() {
  const inventoryItems = document.getElementById('inventory-items');
  if (!inventoryItems) {
    console.error('inventory-items element not found');
    return;
  }
  inventoryItems.innerHTML = '';
  const availableWeapons = ['pressure-washer', 'missile-launcher']; // Always available
  availableWeapons.forEach(type => {
    const item = document.createElement('div');
    item.className = 'inventory-item';
    item.draggable = true;
    item.textContent = getWeaponIcon(type);
    item.style.borderColor = '#00ff00'; // Default green for common
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', type);
    });
    item.addEventListener('mouseover', (e) => showItemModal(type, e));
    item.addEventListener('mouseout', () => hideItemModal());
    inventoryItems.appendChild(item);
  });

  const toolbeltSlots = document.getElementById('toolbelt-slots');
  if (!toolbeltSlots) {
    console.error('toolbelt-slots element not found');
    return;
  }
  let toolbelt = currentUser.toolbelt || [];
  if (toolbelt.length === 0) {
    toolbelt = ['pressure-washer'];
  }
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'toolbelt-slot';
    slot.textContent = toolbelt[i] ? getWeaponIcon(toolbelt[i]) : '';
    slot.dataset.type = toolbelt[i] || '';
    if (i === selectedIndex) slot.classList.add('selected');
    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      slot.textContent = getWeaponIcon(type);
      slot.dataset.type = type;
      toolbelt[i] = type;
    });
    slot.addEventListener('click', () => {
      selectedIndex = i;
      updateToolbeltSelection();
    });
    slot.addEventListener('mouseover', (e) => {
      if (toolbelt[i]) showItemModal(toolbelt[i], e);
    });
    slot.addEventListener('mouseout', () => hideItemModal());
    toolbeltSlots.appendChild(slot);
  }
}

function getWeaponIcon(type) {
  const icons = {
    'pressure-washer': 'PW',
    'missile-launcher': 'ML'
  };
  return icons[type] || type;
}

function showItemModal(type, event) {
  const modal = document.getElementById('item-modal');
  const descriptions = {
    'pressure-washer': 'Pressure Washer: Shoots high-pressure water stream, damages and cools nearby weapons. Power: 30, Cooldown: 1000ms, Range: 50',
    'missile-launcher': 'Missile Launcher: Launches 3 homing missiles that track enemies. Power: 50, Cooldown: 3000ms, Range: 80'
  };
  modal.textContent = descriptions[type] || type;
  modal.style.left = event.pageX + 10 + 'px';
  modal.style.top = (event.pageY - 100) + 'px';
  modal.style.display = 'block';
}

function hideItemModal() {
  document.getElementById('item-modal').style.display = 'none';
}

function updateGameToolbelt() {
  if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
    currentUser.toolbelt = ['pressure-washer'];
  }
  const slots = document.getElementById('game-toolbelt-slots');
  slots.innerHTML = '';
  const toolbelt = currentUser.toolbelt || [];
  const player = window.currentShift ? window.currentShift.players.find(p => p.userId === currentUser._id) : null;
  const cooldown = 1000;
  const timeSince = player ? Date.now() - player.lastPlaced : 0;
  const timeLeft = Math.max(0, cooldown - timeSince);
  const progress = timeLeft / cooldown;
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'game-toolbelt-slot';
    slot.textContent = toolbelt[i] ? getWeaponIcon(toolbelt[i]) : '';
    slot.dataset.type = toolbelt[i] || '';
    if (i === selectedIndex) slot.classList.add('selected');
    slot.addEventListener('pointerdown', () => {
      if (toolbelt[i]) {
        selectedIndex = i;
        updateToolbeltSelection();
        updateGameToolbelt();
      }
    });
    slot.addEventListener('mouseover', (e) => {
      if (toolbelt[i]) showItemModal(toolbelt[i], e);
    });
    slot.addEventListener('mouseout', () => hideItemModal());
    if (timeLeft > 0) {
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = `rgba(0, 0, 0, ${progress})`;
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.color = 'white';
      overlay.style.fontSize = '14px';
      overlay.style.fontWeight = 'bold';
      overlay.textContent = Math.ceil(timeLeft / 1000);
      slot.style.position = 'relative';
      slot.appendChild(overlay);
    }
    slots.appendChild(slot);
  }
}

function updateToolbeltSelection() {
  document.querySelectorAll('.toolbelt-slot').forEach((slot, i) => {
    if (i === selectedIndex) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });
  document.querySelectorAll('.game-toolbelt-slot').forEach((slot, i) => {
    if (i === selectedIndex) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });
}

document.getElementById('save-toolbelt').addEventListener('click', () => {
  const toolbelt = [];
  document.querySelectorAll('.toolbelt-slot').forEach(slot => {
    if (slot.dataset.type) toolbelt.push(slot.dataset.type);
  });
  socket.emit('save-toolbelt', { userId: currentUser._id, toolbelt });
  currentUser.toolbelt = toolbelt; // Update local
  populateToolbelt(); // Refresh display
});

// Hotkeys for toolbelt selection (1-6)
document.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') {
    const index = parseInt(e.key) - 1;
    const toolbelt = currentUser.toolbelt || [];
    if (toolbelt[index]) {
      selectedIndex = index;
      updateToolbeltSelection();
      updateGameToolbelt();
    }
  }
});

function startGame() {
  if (gameInstance) return; // Prevent multiple instances
  gameInstance = new Phaser.Game(config);
  document.getElementById('toolbelt-ui').style.display = 'block';
  document.getElementById('toggle-boosts').style.display = 'block';
  updateGameToolbelt();
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

        // Graphics for grid
        this.gridGraphics = this.add.graphics();
        this.gridGraphics.lineStyle(1, 0x808080); // Gray color
        for (let x = 0; x <= 800; x += this.cellSize) {
            this.gridGraphics.lineBetween(x, 0, x, 600);
        }
        for (let y = 0; y <= 600; y += this.cellSize) {
            this.gridGraphics.lineBetween(0, y, 800, y);
        }

        // Initialize groups
        this.enemies = this.add.group();
        this.weapons = this.add.group();
        this.players = this.add.group();
        this.projectiles = this.add.group();

        // Movement throttling
        this.lastMoveEmit = 0;

        // Heat text
        this.heatText = this.add.text(700, 10, 'Heat: 0', { fontSize: '16px', fill: '#fff' });

        // Scrap text
        this.scrapText = this.add.text(700, 30, 'Scrap: 0', { fontSize: '16px', fill: '#fff' });

        // Position maps
        this.weaponPositions = {};
        this.enemyPositions = {};

        // Boost UI
        this.boostTexts = [];

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

        // Listen for weapon fired
        socket.on('weapon-fired', (data) => {
            const wpos = this.weaponPositions[data.weaponId];
            const epos = this.enemyPositions[data.targetId];
            if (wpos && epos) {
                const line = this.add.graphics();
                line.lineStyle(5, 0xff0000);
                line.lineBetween(wpos.x, wpos.y, epos.x, epos.y);
                this.projectiles.add(line);
                this.time.delayedCall(1000, () => {
                    line.destroy();
                });
                // Show damage number
                const damageText = this.add.text(epos.x, epos.y - 10, `-${data.damage}`, { fontSize: '16px', fill: '#ff0000' });
                this.time.delayedCall(500, () => {
                    damageText.destroy();
                });
            }
        });

        // Listen for boost choice
        socket.on('boost-choice', (data) => {
            if (data.playerId === currentUser._id) {
                showBoostModal(data.choices);
            }
        });

        // Weapon placement mode
        // Removed: placingWeapon and selectedWeaponType

        // Hover graphics for placement preview
        this.hoverGraphics = this.add.graphics();

        // Input for placing weapons
        this.input.on('pointerdown', this.placeWeapon, this);
        this.input.on('pointermove', this.onPointerMove, this);
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
                let newX = this.player.x + dx;
                let newY = this.player.y + dy;
                // Clamp to bounds
                newX = Phaser.Math.Clamp(newX, 0, 780);
                newY = Phaser.Math.Clamp(newY, 0, 580);
                // Check if new position is on path
                let gx = Math.floor(newX / this.cellSize);
                let gy = Math.floor(newY / this.cellSize);
                if (!this.pathSquares.has(`${gx},${gy}`)) {
                    this.player.x = newX;
                    this.player.y = newY;
                    const now = Date.now();
                    if (now - this.lastMoveEmit > 100) {
                        socket.emit('move', { shiftId: currentShiftId, x: this.player.x, y: this.player.y, userId: currentUser._id });
                        this.lastMoveEmit = now;
                    }
                }
            }
        }
    }

    updateFromServer(shift) {
        window.currentShift = shift;
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

        // Update players
        shift.players.forEach(p => {
            if (p.userId === currentUser._id) {
                if (!this.player) {
                    this.player = this.add.rectangle(p.x, p.y, 10, 10, 0x00ff00);
                    this.physics.add.existing(this.player);
                    this.player.body.setCollideWorldBounds(true);
                }
            } else {
                if (!this.playerSprites[p.userId]) {
                    let rect = this.add.rectangle(p.x, p.y, 10, 10, 0xffffff);
                    this.physics.add.existing(rect);
                    rect.body.setCollideWorldBounds(true);
                    this.playerSprites[p.userId] = rect;
                } else {
                    this.playerSprites[p.userId].x = p.x;
                    this.playerSprites[p.userId].y = p.y;
                }
            }
        });

        // Clear existing enemies and weapons
        this.enemies.clear(true, true);
        this.weapons.clear(true, true);
        this.projectiles.clear(true, true);

        // Update position maps
        this.weaponPositions = {};
        shift.weapons.forEach(w => this.weaponPositions[w.id] = {x: w.x, y: w.y, type: w.type});
        this.enemyPositions = {};
        shift.enemies.forEach(e => this.enemyPositions[e.id] = {x: e.x, y: e.y});

        // Add enemies
        shift.enemies.forEach(e => {
            let enemy = this.add.rectangle(e.x, e.y, 10, 10, 0xff0000);
            this.enemies.add(enemy);
        });

        // Add weapons
        shift.weapons.forEach(w => {
            let color = 0x0000ff; // default
            if (w.type === 'pressure-washer') color = 0x00ff00;
            else if (w.type === 'missile-launcher') color = 0xff0000;
            else if (w.type === 'laser-cutter') color = 0xffff00;
            else if (w.type === 'waste-escape-pod') color = 0xff00ff;
            const gridSize = WEAPON_GRID_SIZES[w.type] || {w:1,h:1};
            let alpha = w.hp / w.stats.hp;
            let weapon = this.add.rectangle(w.x, w.y, gridSize.w * 10, gridSize.h * 10, color);
            weapon.setAlpha(alpha);
            this.weapons.add(weapon);
        });

        // Add projectiles
        shift.projectiles.forEach(p => {
            let proj = this.add.circle(p.x, p.y, 3, 0xff0000);
            this.projectiles.add(proj);
        });

        // Update heat
        if (typeof shift.heat !== 'number' || isNaN(shift.heat)) shift.heat = 0;
        this.heatText.setText('Heat: ' + Math.round(shift.heat));

        // Update scrap
        const player = shift.players.find(p => p.userId === currentUser._id);
        if (player && (typeof player.scrap !== 'number' || isNaN(player.scrap))) player.scrap = 0;
        this.scrapText.setText('Scrap: ' + (player ? player.scrap : 0));

        // Update toolbelt
        updateGameToolbelt();

        // Update UI
        document.getElementById('overflow').textContent = shift.overflow;
        document.getElementById('wave').textContent = shift.wave;
        document.getElementById('scrap').textContent = shift.scrap;
    }

    placeWeapon(pointer) {
        if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
            currentUser.toolbelt = ['pressure-washer'];
        }
        if (currentShiftId) {
            let gx = Math.floor(pointer.x / this.cellSize);
            let gy = Math.floor(pointer.y / this.cellSize);
            const toolbelt = currentUser.toolbelt || [];
            const selectedType = toolbelt[selectedIndex] || 'pressure-washer';
            const gridSize = WEAPON_GRID_SIZES[selectedType] || {w:1,h:1};
            let gridW = gridSize.w, gridH = gridSize.h;
            let x = gx * this.cellSize + gridW * this.cellSize / 2;
            let y = gy * this.cellSize + gridH * this.cellSize / 2;
            // Check path and occupied for the entire area
            let valid = true;
            for (let i = 0; i < gridW; i++) {
                for (let j = 0; j < gridH; j++) {
                    if (this.pathSquares.has(`${gx + i},${gy + j}`)) valid = false;
                }
            }
            if (valid) {
                const occupied = Object.values(this.weaponPositions).some(pos => {
                    let wGridW = WEAPON_GRID_SIZES[pos.type]?.w || 1;
                    let wGridH = WEAPON_GRID_SIZES[pos.type]?.h || 1;
                    let wx = Math.floor(pos.x / this.cellSize) - Math.floor(wGridW / 2);
                    let wy = Math.floor(pos.y / this.cellSize) - Math.floor(wGridH / 2);
                    return !(gx + gridW <= wx || wx + wGridW <= gx || gy + gridH <= wy || wy + wGridH <= gy);
                });
                if (!occupied) {
                    socket.emit('place-weapon', { shiftId: currentShiftId, x, y, type: selectedType, userId: currentUser._id });
                }
            }
        }
    }

    onPointerMove(pointer) {
        this.hoverGraphics.clear();
        if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
            currentUser.toolbelt = ['pressure-washer'];
        }
        const toolbelt = currentUser.toolbelt || [];
        const selectedType = toolbelt[selectedIndex];
        if (!selectedType) return;
        let gx = Math.floor(pointer.x / this.cellSize);
        let gy = Math.floor(pointer.y / this.cellSize);
        // Get grid size
        const gridSize = WEAPON_GRID_SIZES[selectedType] || {w:1,h:1};
        let gridW = gridSize.w, gridH = gridSize.h;
        let width = gridW * this.cellSize;
        let height = gridH * this.cellSize;
        let x = gx * this.cellSize + width / 2;
        let y = gy * this.cellSize + height / 2;
        // Check validity: path and occupied
        let valid = true;
        for (let i = 0; i < gridW; i++) {
            for (let j = 0; j < gridH; j++) {
                if (this.pathSquares.has(`${gx + i},${gy + j}`)) valid = false;
            }
        }
        if (valid) {
            const occupied = Object.values(this.weaponPositions).some(pos => {
                let wGridW = WEAPON_GRID_SIZES[pos.type]?.w || 1;
                let wGridH = WEAPON_GRID_SIZES[pos.type]?.h || 1;
                let wx = Math.floor(pos.x / this.cellSize) - Math.floor(wGridW / 2);
                let wy = Math.floor(pos.y / this.cellSize) - Math.floor(wGridH / 2);
                return !(gx + gridW <= wx || wx + wGridW <= gx || gy + gridH <= wy || wy + wGridH <= gy);
            });
            valid = !occupied;
        }
        this.hoverGraphics.lineStyle(2, valid ? 0x00ff00 : 0xff0000);
        this.hoverGraphics.strokeRect(x - width / 2, y - height / 2, width, height);
        this.hoverGraphics.fillStyle(valid ? 0x00ff00 : 0xff0000, 0.3);
        this.hoverGraphics.fillRect(x - width / 2, y - height / 2, width, height);
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

function showBoostModal(choices) {
    const modal = document.getElementById('boost-modal');
    const optionsDiv = document.getElementById('boost-options');
    optionsDiv.innerHTML = '';
    optionsDiv.style.display = 'flex';
    optionsDiv.style.justifyContent = 'space-around';
    optionsDiv.style.width = '100%';
    choices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.textContent = `${choice.type.replace('-', ' ')} (${choice.rarity}): ${choice.description}`;
        button.style.margin = '5px';
        button.style.padding = '10px';
        button.style.height = '80px'; // Static height
        button.style.width = '30%'; // Roughly equal width
        button.style.border = `2px solid ${getRarityColor(choice.rarity)}`;
        button.style.color = 'black'; // Text remains black
        button.style.backgroundColor = 'white';
        button.style.cursor = 'pointer'; // Show clickable
        button.style.wordWrap = 'break-word';
        button.style.whiteSpace = 'normal';
        button.onmouseover = () => {
            button.style.backgroundColor = '#f0f0f0'; // Light gray on hover
        };
        button.onmouseout = () => {
            button.style.backgroundColor = 'white';
        };
        button.onclick = () => {
            socket.emit('choose-boost', { shiftId: currentShiftId, choiceIndex: index });
            modal.style.display = 'none';
        };
        optionsDiv.appendChild(button);
    });
    modal.style.display = 'block';
}

function getRarityColor(rarity) {
    const rarityColors = {
        common: '#00ff00',
        uncommon: '#0000ff',
        rare: '#ff0000',
        mythic: '#ffa500',
        legendary: '#ffffff'
    };
    return rarityColors[rarity] || '#fff';
}