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

const WEAPON_TYPES = {
  'pressure-washer': {
    name: 'Pressure Washer',
    description: 'Shoots high-pressure water stream, damages and cools nearby weapons.',
    baseStats: { power: 50, cooldown: 1000, range: 50, shape: 'cone', gridSize: {w:1,h:1}, heatGen: 10, heatResist: 10, hp: 100, cost: 0, knockback: 1 },
    color: 0x00ff00,
    cost: 0
  },
  'missile-launcher': {
    name: 'Missile Launcher',
    description: 'Launches 3 homing missiles that track enemies.',
    baseStats: { power: 100, cooldown: 3000, range: 180, shape: 'missile', gridSize: {w:2,h:2}, heatGen: 15, heatResist: 5, hp: 120, cost: 500, knockback: 2 },
    color: 0xff0000,
    cost: 500
  },
  'laser-cutter': {
    name: 'Laser Cutter',
    description: 'Cuts through waste with a powerful laser beam.',
    baseStats: { power: 30, cooldown: 800, range: 60, shape: 'line', gridSize: {w:1,h:3}, heatGen: 5, heatResist: 8, hp: 80, cost: 1000, knockback: 1 },
    color: 0xffff00,
    cost: 1000
  },
  'waste-escape-pod': {
    name: 'Waste Escape Pod',
    description: 'A large pod that destroys waste on contact.',
    baseStats: { power: 10, cooldown: 2000, range: 30, shape: 'circle', gridSize: {w:4,h:4}, heatGen: 2, heatResist: 15, hp: 150, cost: 2000, knockback: 3 },
    color: 0xff00ff,
    cost: 2000
  }
};

const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.1,
  rare: 1.2,
  mythic: 1.4,
  legendary: 1.6
};

function getWeaponStats(type, rarity) {
  const base = WEAPON_TYPES[type].baseStats || WEAPON_TYPES[type].stats;
  const mult = RARITY_MULTIPLIERS[rarity];
  return {
    power: Math.floor(base.power * mult),
    cooldown: Math.floor(base.cooldown / mult), // Faster for higher rarity
    range: base.range,
    shape: base.shape,
    gridSize: base.gridSize,
    heatGen: base.heatGen,
    heatResist: Math.floor(base.heatResist * mult),
    hp: Math.floor(base.hp * mult),
    cost: base.cost,
    knockback: Math.floor((base.knockback || 1) * mult)
  };
}

const WEAPON_GRID_SIZES = Object.fromEntries(Object.entries(WEAPON_TYPES).map(([k,v]) => [k, v.gridSize]));

const ENEMY_TYPES = {
  'waste': {
    name: 'Waste',
    description: 'Basic waste enemy that follows the path.',
    stats: { hp: 50, speed: 1, damage: 10 }
  }
};

// Check for existing token on page load
window.addEventListener('load', async () => {
  const token = localStorage.getItem('token');
  if (token) {
    const success = await loginUser({ token });
    if (success) {
      loadLockerRoomPage();
      connectSocketIO();
      await obtainShiftCode();
      obtainInventory();
      obtainSavedToolbelt();
      enableButtons();
    }
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  console.log('Login button clicked');
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const success = await loginUser({ username, password });
  if (success) {
    loadLockerRoomPage();
    connectSocketIO();
    await obtainShiftCode();
    obtainInventory();
    obtainSavedToolbelt();
    enableButtons();
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
  showDismissableAlert(data.message, "OK");
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
  if (!currentUser) return;
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
  if (!currentUser) return;
  const code = document.getElementById('join-code').value.trim();
  if (code) {
    if (code === currentShiftId) {
      showDismissableAlert("Can't join your own shift", "OK");
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
    }).catch(err => showDismissableAlert(err.message, "OK"));
  }
});

document.getElementById('start-shift').addEventListener('click', () => {
  if (!currentUser) return;
  if (currentShiftId) {
    const startBtn = document.getElementById('start-shift');
    startBtn.textContent = "Waiting for others...";
    startBtn.disabled = true;
    socket.emit('ready', { shiftId: currentShiftId, userId: currentUser._id });
  }
});

document.getElementById('toggle-boosts').addEventListener('click', () => {
  if (!currentUser) return;
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
  if (!currentUser) return;
  document.getElementById('show-boosts-modal').style.display = 'none';
  if (window.currentShift.players.length === 1) {
    socket.emit('resume-game', { shiftId: currentShiftId });
  }
});

document.getElementById('licenses-btn').addEventListener('click', () => {
  if (!currentUser) return;
  showLicensesModal();
});

document.getElementById('close-licenses-modal').addEventListener('click', () => {
  document.getElementById('licenses-modal').style.display = 'none';
});

function populateToolbelt() {
  if (!currentUser) return;
  const inventoryItems = document.getElementById('inventory-items');
  if (!inventoryItems) {
    console.error('inventory-items element not found');
    return;
  }
  inventoryItems.innerHTML = '';
  const inventory = currentUser.inventory || [];
  inventory.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'inventory-item';
    itemDiv.draggable = true;
    itemDiv.textContent = getWeaponIcon(item.type);
    itemDiv.style.borderColor = getRarityColor(item.rarity);
    itemDiv.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.id);
    });
    itemDiv.addEventListener('mouseover', (e) => showItemModal(item, e));
    itemDiv.addEventListener('mouseout', () => hideItemModal());
    inventoryItems.appendChild(itemDiv);
  });

  const toolbeltSlots = document.getElementById('toolbelt-slots');
  if (!toolbeltSlots) {
    console.error('toolbelt-slots element not found');
    return;
  }
  toolbeltSlots.innerHTML = '';
  let toolbelt = currentUser.toolbelt || [];
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'toolbelt-slot';
    const itemId = toolbelt[i];
    const item = currentUser.inventory.find(inv => inv.id === itemId);
    slot.style.borderColor = item ? getRarityColor(item.rarity) : getRarityColor('common');
    slot.textContent = item ? getWeaponIcon(item.type) : '';
    slot.dataset.type = item ? item.type : '';
    if (i === selectedIndex) slot.classList.add('selected');
    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const draggedItem = currentUser.inventory.find(inv => inv.id === id);
      if (draggedItem) {
        toolbelt[i] = draggedItem.id;
        slot.textContent = getWeaponIcon(draggedItem.type);
        slot.dataset.type = draggedItem.type;
        slot.style.borderColor = getRarityColor(draggedItem.rarity);
        socket.emit('save-toolbelt', { userId: currentUser._id, toolbelt });
      }
    });
    slot.addEventListener('click', () => {
      selectedIndex = i;
      updateToolbeltSelection();
    });
    slot.addEventListener('mouseover', (e) => {
      const itemId = toolbelt[i];
      const item = currentUser.inventory.find(inv => inv.id === itemId);
      showItemModal(item, e);
    });
    slot.addEventListener('mouseout', () => hideItemModal());
    toolbeltSlots.appendChild(slot);
  }
}

function getWeaponIcon(type) {
  const icons = {
    'pressure-washer': 'PW',
    'missile-launcher': 'ML',
    'laser-cutter': 'LC',
    'waste-escape-pod': 'WEP'
  };
  return icons[type] || type;
}

function showItemModal(itemOrType, event) {
  const modal = document.getElementById('item-modal');
  let text = '';
  let item;
  if (typeof itemOrType === 'string') {
    // Create a fake item object for base weapon types
    const weapon = WEAPON_TYPES[itemOrType];
    if (weapon) {
      item = {
        type: itemOrType,
        rarity: 'common',
        stats: weapon.baseStats
      };
    } else {
      text = itemOrType;
    }
  } else {
    // Item instance
    item = itemOrType;
  }
  if (!item) return;
  if (item) {
    const base = WEAPON_TYPES[item.type];
    if (base) {
      const baseStats = base.baseStats;
      const diffPower = item.stats.power - baseStats.power;
      const diffCooldown = item.stats.cooldown - baseStats.cooldown;
      const diffRange = item.stats.range - baseStats.range;
      const diffHp = item.stats.hp - baseStats.hp;
      const diffStrPower = diffPower > 0 ? ` <span style="color: green;">(+${diffPower})</span>` : diffPower < 0 ? ` <span style="color: red;">(${diffPower})</span>` : '';
      const diffStrCooldown = diffCooldown < 0 ? ` <span style="color: green;">(${diffCooldown})</span>` : diffCooldown > 0 ? ` <span style="color: red;">(+${diffCooldown})</span>` : '';
      const diffStrRange = diffRange > 0 ? ` <span style="color: green;">(+${diffRange})</span>` : diffRange < 0 ? ` <span style="color: red;">(${diffRange})</span>` : '';
      const diffStrHp = diffHp > 0 ? ` <span style="color: green;">(+${diffHp})</span>` : diffHp < 0 ? ` <span style="color: red;">(${diffHp})</span>` : '';
      text = `${base.name} (${item.rarity}): ${base.description}<br>Power: ${item.stats.power}${diffStrPower}<br>Cooldown: ${item.stats.cooldown}ms${diffStrCooldown}<br>Range: ${item.stats.range}${diffStrRange}<br>HP: ${item.stats.hp}${diffStrHp}`;
    } else {
      text = item.type;
    }
  }
  modal.innerHTML = text.replace(/\n/g, '<br>');
  modal.style.borderColor = getRarityColor(item.rarity);
  modal.style.left = event.pageX + 10 + 'px';
  modal.style.top = (event.pageY - 100) + 'px';
  modal.style.display = 'block';
}

function hideItemModal() {
  document.getElementById('item-modal').style.display = 'none';
}

function updateGameToolbelt() {
  if (!currentUser) return;
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
    const itemId = toolbelt[i];
    const item = currentUser.inventory.find(inv => inv.id === itemId);
    slot.style.borderColor = item ? getRarityColor(item.rarity) : getRarityColor('common');
    slot.textContent = item ? getWeaponIcon(item.type) : '';
    slot.dataset.type = item ? item.type : '';
    if (i === selectedIndex) slot.classList.add('selected');
    slot.addEventListener('pointerdown', () => {
      if (item) {
        selectedIndex = i;
        updateToolbeltSelection();
        updateGameToolbelt();
      }
    });
    slot.addEventListener('mouseover', (e) => {
      const itemId = toolbelt[i];
      const item = currentUser.inventory.find(inv => inv.id === itemId);
      showItemModal(item, e);
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

document.getElementById('gacha-btn').addEventListener('click', () => {
  if (!currentUser) return;
  const modal = document.getElementById('gacha-modal');
  modal.style.display = 'block';
});

document.getElementById('close-gacha-modal').addEventListener('click', () => {
  document.getElementById('gacha-modal').style.display = 'none';
});

document.getElementById('spin-gacha-btn').addEventListener('click', async () => {
  if (!currentUser) return;
  if (currentUser.credits < 100) {
    showDismissableAlert('Not enough credits!', 'OK');
    return;
  }
  try {
    const res = await fetch('http://localhost:3001/spin-gacha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser._id })
    });
    if (res.ok) {
      const data = await res.json();
      currentUser.credits = data.credits;
      currentUser.inventory = currentUser.inventory || [];
      currentUser.inventory.push(data.weapon);
      document.getElementById('nav-credits').textContent = currentUser.credits;
      populateToolbelt(); // Refresh inventory
      document.getElementById('gacha-modal').style.display = 'none';
      showDismissableAlert(`You got a ${data.weapon.rarity} ${WEAPON_TYPES[data.weapon.type].name}!`, 'OK');
    } else {
      const err = await res.json();
      showDismissableAlert(err.message, 'OK');
    }
  } catch (error) {
    showDismissableAlert('Gacha failed: ' + error.message, 'OK');
  }
});

// Disable right-click context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Pause game with Space
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && gameInstance && document.getElementById('game-container').style.display !== 'none') {
    e.preventDefault();
    const scene = gameInstance.scene.getScene('GameScene');
    if (scene) {
      if (scene.paused) {
        scene.pauseGame(false);
        document.getElementById('pause-modal').style.display = 'none';
      } else {
        scene.pauseGame(true);
      }
    }
  }
});

// Game menu with Esc
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && gameInstance && document.getElementById('game-container').style.display !== 'none') {
    e.preventDefault();
    const scene = gameInstance.scene.getScene('GameScene');
    if (scene) {
      scene.pauseGame(true);
      showGameMenu();
    }
  }
});

function startGame() {
  if (gameInstance) return; // Prevent multiple instances
  let container = document.getElementById('game-container');
  let w = window.innerWidth;
  let h = window.innerHeight;
  let aspect = w / h;
  let gameW, gameH;
  if (aspect > 4/3) {
    // Wider screen, fit height to 4:3
    gameW = h * 4 / 3;
    gameH = h;
  } else {
    // Taller screen, fit width to 4:3
    gameW = w;
    gameH = w * 3 / 4;
  }
  container.style.width = gameW + 'px';
  container.style.height = gameH + 'px';
  const config = {
    type: Phaser.AUTO,
    width: gameW,
    height: gameH,
    parent: 'game-container',
    scene: GameScene,
    physics: {
      default: 'arcade',
      arcade: {
        debug: false
      }
    }
  };
  gameInstance = new Phaser.Game(config);
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('toolbelt-ui').style.display = 'block';
  document.getElementById('scrap-bar-container').style.display = 'block';
  document.getElementById('toggle-boosts').style.display = 'block';
  document.getElementById('nav').style.display = 'none';
  updateGameToolbelt();
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        // Load assets here (e.g., this.load.image('tower', 'assets/tower.png');)
        this.load.spritesheet('conveyor-belt', 'assets/conveyor-belt.png', { frameWidth: 10, frameHeight: 10 });
        this.load.image('scrap', 'assets/scrap.png');
        this.load.image('waste-01', 'assets/waste-01.png');
        this.load.image('pressure-washer', 'assets/pressure-washer.png');
    }

    create() {
        // Fixed world: 1000x1000 pixels
        const WORLD_WIDTH = 1000;
        const WORLD_HEIGHT = 1000;
        this.cellSize = 10;
        this.gridWidth = 100;
        this.gridHeight = 100;
        this.gameScale = 1.0; // Fixed world, no scaling needed

        // Set background color
        this.cameras.main.setBackgroundColor('#000011');

        // Set world bounds to fixed size
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        
        // Calculate zoom to fit player's screen nicely
        const canvasWidth = this.game.canvas.width;
        const canvasHeight = this.game.canvas.height;
        const zoomX = canvasWidth / WORLD_WIDTH;
        const zoomY = canvasHeight / WORLD_HEIGHT;
        // Start more zoomed in for better visibility
        const initialZoom = Math.max(1.5, Math.min(zoomX, zoomY) * 1.2);
        this.cameras.main.setZoom(initialZoom);
        
        // Set zoom bounds
        this.minZoom = 0.5;  // Can zoom out to see more of the map
        this.maxZoom = 4.0;  // Can zoom in for detailed placement

        // Pause flag
        this.paused = false;

        // Inputs disabled flag
        this.inputsDisabled = false;

        // Boost UI
        this.boostTexts = [];

        // Hover weapon id
        this.hoveredWeaponId = null;

        // Collecting scrap tracking
        this.collectingScrapIds = new Set();
        this.collectingScraps = this.add.group();

        // Groups and graphics
        this.pathSprites = this.add.group();
        this.pitGraphics = this.add.graphics();
        this.scraps = this.add.group();
        this.playerSprites = {};
        this.enemySprites = {};
        this.weaponSprites = {};
        this.projectileSprites = {};
        this.weapons = this.add.group();
        this.enemies = this.add.group();
        this.projectiles = this.add.group();

        // UI texts - fixed to camera (not world)
        this.heatText = this.add.text(10, 10, 'Heat: 0', { fontSize: '16px', fill: '#fff', fontFamily: 'Arial' });
        this.heatText.setScrollFactor(0).setDepth(1000).setScale(1);
        this.nameText = this.add.text(10, 30, 'Name: ', { fontSize: '16px', fill: '#fff', fontFamily: 'Arial' });
        this.nameText.setScrollFactor(0).setDepth(1000).setScale(1);
        this.creditsText = this.add.text(10, 50, 'Credits: ', { fontSize: '16px', fill: '#fff', fontFamily: 'Arial' });
        this.creditsText.setScrollFactor(0).setDepth(1000).setScale(1);
        this.phaseText = this.add.text(10, 70, 'Phase: , Wave: ', { fontSize: '16px', fill: '#fff', fontFamily: 'Arial' });
        this.phaseText.setScrollFactor(0).setDepth(1000).setScale(1);

        // WASD keys
        this.wasd = {
            w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // Arrow keys
        this.cursors = this.input.keyboard.createCursorKeys();

        // Position tracking
        this.weaponPositions = {};
        this.enemyPositions = {};
        this.lastMoveEmit = 0;
        this.pathSquares = new Set();
        this.pathDrawn = false;
        this.pathSpriteMap = {};

        // Create conveyor belt animation
        if (!this.anims.exists('conveyor-move')) {
            this.anims.create({
                key: 'conveyor-move',
                frames: this.anims.generateFrameNumbers('conveyor-belt', { start: 0, end: 2 }),
                frameRate: 3,
                repeat: -1
            });
        }

        // Pause game function
        this.pauseGame = (paused, fromServer = false) => {
            if (this.paused !== paused) {
                console.log(`pauseGame called: paused=${paused}, fromServer=${fromServer}, current=${this.paused}`);
                this.paused = paused;
                if (paused) {
                    this.scene.pause('GameScene');
                    console.log('Scene PAUSED');
                } else {
                    this.scene.resume('GameScene');
                    console.log('Scene RESUMED');
                }
                // Only emit if not triggered by server update (prevent loops)
                if (!fromServer) {
                    socket.emit('set-pause', { shiftId: currentShiftId, paused });
                }
            }
        };

        // Store listener references for cleanup
        this.shiftUpdateHandler = (shift) => {
            this.updateFromServer(shift);
        };
        
        this.weaponFiredHandler = (data) => {
            const wpos = this.weaponPositions[data.weaponId];
            const epos = this.enemyPositions[data.targetId];
            if (wpos && epos) {
                const line = this.add.graphics();
                line.lineStyle(5 * this.gameScale, 0xff0000);
                line.lineBetween(wpos.x * this.gameScale, wpos.y * this.gameScale, epos.x * this.gameScale, epos.y * this.gameScale);
                if (this.projectiles) this.projectiles.add(line);
                this.time.delayedCall(1000, () => {
                    line.destroy();
                });
                // Show damage number
                const damageText = this.add.text(epos.x * this.gameScale, epos.y * this.gameScale - 10 * this.gameScale, `-${data.damage}`, { fontSize: `${16 * this.gameScale}px`, fill: '#ff0000' });
                this.time.delayedCall(500, () => {
                    damageText.destroy();
                });
            }
        };
        
        this.boostChoiceHandler = (data) => {
            if (data.playerId === currentUser._id) {
                showBoostModal(data.choices);
            }
        };

        // Remove any existing listeners first (prevent duplicates)
        socket.off('shift-update', this.shiftUpdateHandler);
        socket.off('weapon-fired', this.weaponFiredHandler);
        socket.off('boost-choice', this.boostChoiceHandler);
        
        // Listen for shift updates
        socket.on('shift-update', this.shiftUpdateHandler);

        // Listen for weapon fired
        socket.on('weapon-fired', this.weaponFiredHandler);

        // Listen for boost choice
        socket.on('boost-choice', this.boostChoiceHandler);

        // Weapon placement mode
        // Removed: placingWeapon and selectedWeaponType

        // Hover graphics for placement preview
        this.hoverGraphics = this.add.graphics();

        // Input for placing weapons
        this.input.on('pointerdown', this.placeWeapon, this);
        this.input.on('pointermove', this.onPointerMove, this);
        
        // Mouse wheel zoom control
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const currentZoom = this.cameras.main.zoom;
            const zoomChange = deltaY > 0 ? -0.1 : 0.1; // Scroll down = zoom out, up = zoom in
            const newZoom = Phaser.Math.Clamp(currentZoom + zoomChange, this.minZoom, this.maxZoom);
            this.cameras.main.setZoom(newZoom);
        });

        // Start wave button listener
        document.getElementById('start-wave-btn').addEventListener('click', () => {
            socket.emit('start-wave', { shiftId: currentShiftId });
        });

        // End break button listener
        document.getElementById('end-break-btn').addEventListener('click', () => {
            socket.emit('end-break', { shiftId: currentShiftId });
        });
    }

    update() {
        // Process pending shift update if available
        if (this.pendingShiftUpdate) {
            const now = Date.now();
            if (now - this.lastShiftUpdate >= 33) {
                const pending = this.pendingShiftUpdate;
                this.pendingShiftUpdate = null;
                this.updateFromServer(pending);
            }
        }
        
        if (this.paused || this.inputsDisabled) return;
        // Handle player movement
        if (this.player) {
            let dx = 0, dy = 0;
            if (this.wasd.a.isDown || this.cursors.left.isDown) dx -= 2;
            if (this.wasd.d.isDown || this.cursors.right.isDown) dx += 2;
            if (this.wasd.w.isDown || this.cursors.up.isDown) dy -= 2;
            if (this.wasd.s.isDown || this.cursors.down.isDown) dy += 2;
            
            // Check if player is on a path and apply conveyor movement
            let gx = Math.floor(this.player.x / this.cellSize);
            let gy = Math.floor(this.player.y / this.cellSize);
            const onPathKey = `${gx},${gy}`;
            
            if (this.pathSquares && this.pathSquares.has(onPathKey) && window.currentShift && window.currentShift.map) {
                // Player is on conveyor belt - push towards pit
                // Find which path the player is on
                for (let pathData of window.currentShift.map.corePaths) {
                    const pathIndex = pathData.squares.findIndex(sq => sq.x === gx && sq.y === gy);
                    if (pathIndex >= 0 && pathIndex < pathData.squares.length - 1) {
                        // Get next square in path
                        const nextSquare = pathData.squares[pathIndex + 1];
                        const conveyorDx = (nextSquare.x - gx) * 0.5; // Move at half waste speed
                        const conveyorDy = (nextSquare.y - gy) * 0.5;
                        dx += conveyorDx;
                        dy += conveyorDy;
                        break;
                    }
                }
            }
            
            if (dx || dy) {
                let newX = this.player.x + dx;
                let newY = this.player.y + dy;
                // Clamp to world bounds (1000x1000)
                newX = Phaser.Math.Clamp(newX, 5, 995);
                newY = Phaser.Math.Clamp(newY, 5, 995);
                
                // Check collision with weapons only (no path collision)
                let playerRect = new Phaser.Geom.Rectangle(newX - 5, newY - 5, 10, 10);
                let canMove = true;
                if (this.weapons && this.weapons.children) {
                    this.weapons.children.entries.forEach(weapon => {
                        let weaponRect = new Phaser.Geom.Rectangle(weapon.x - weapon.width / 2, weapon.y - weapon.height / 2, weapon.width, weapon.height);
                        if (Phaser.Geom.Rectangle.Overlaps(playerRect, weaponRect)) {
                            canMove = false;
                        }
                    });
                }
                if (canMove) {
                    this.player.x = newX;
                    this.player.y = newY;
                    // Camera follows player movement
                    this.cameras.main.startFollow(this.player, false, 0.1, 0.1);
                    const now = Date.now();
                    if (now - this.lastMoveEmit > 50) {
                        socket.emit('move', { shiftId: currentShiftId, x: this.player.x, y: this.player.y, userId: currentUser._id });
                        this.lastMoveEmit = now;
                    }
                }
            }
        }
        // Collect scraps
        if (!this.paused && this.player) {
          const playerData = window.currentShift.players.find(p => p.userId === currentUser._id);
          if (playerData && this.collectingScraps.children.entries.length === 0) {
            for (let s of window.currentShift.scraps) {
              const dist = Math.sqrt((this.player.x - s.x * this.gameScale)**2 + (this.player.y - s.y * this.gameScale)**2);
              if (dist < playerData.pickupRadius * this.gameScale && !this.collectingScrapIds.has(s.id)) {
                this.collectingScrapIds.add(s.id);
                let sprite = null;
                if (this.scraps && this.scraps.children) {
                  sprite = this.scraps.children.entries.find(child => {
                    const dx = child.x - s.x * this.gameScale;
                    const dy = child.y - s.y * this.gameScale;
                    return dx * dx + dy * dy < (25 * this.gameScale * this.gameScale); // within ~5 pixels scaled
                  });
                }
                if (sprite) {
                  sprite.scrapId = s.id;
                  this.collectingScraps.add(sprite);
                  this.scraps.remove(sprite);
                } else {
                  // If no sprite found, remove from collecting to allow retry
                  this.collectingScrapIds.delete(s.id);
                }
                break; // Only collect one at a time
              }
            }
          }
        }
        // Move collecting scraps towards player
        if (this.collectingScraps && this.collectingScraps.children) {
          this.collectingScraps.children.entries.forEach(sprite => {
            const dx = this.player.x - sprite.x;
            const dy = this.player.y - sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 10 * this.gameScale) {
              sprite.x += (dx / dist) * 8 * this.gameScale; // speed
              sprite.y += (dy / dist) * 8 * this.gameScale;
            } else {
              // Close enough, collect
              socket.emit('collect-scrap', { shiftId: currentShiftId, scrapId: sprite.scrapId });
              this.collectingScrapIds.delete(sprite.scrapId);
              sprite.destroy();
            }
          });
        }
    }

    updateFromServer(shift) {
        if (!currentUser) return;
        
        // Throttle updates to prevent overwhelming Phaser (max 30 updates/sec)
        const now = Date.now();
        if (!this.lastShiftUpdate) this.lastShiftUpdate = 0;
        if (now - this.lastShiftUpdate < 33) {
            // Store pending update to process later
            this.pendingShiftUpdate = shift;
            return;
        }
        this.lastShiftUpdate = now;
        
        window.currentShift = shift;
        
        // Handle pause state changes
        if (shift.paused !== this.paused && shift.status !== 'planning') {
            console.log(`Shift pause state changed: server=${shift.paused}, local=${this.paused}`);
            this.pauseGame(shift.paused, true); // fromServer = true to prevent loop
            // Removed: showPauseModal() call to prevent unwanted pause modals after boost selections
        }
        
        // Don't return early if paused - we still need to process updates
        // The Phaser scene pause will prevent rendering, but data should update
        // if (this.paused) return; // REMOVED to allow updates while paused
        
        // Update map if available
        if (shift.map) {
            this.pathSquares = new Set(shift.map.pathSquares.map(s => `${s.x},${s.y}`));
            if (!this.pathDrawn) {
                // Build map of square to path index for coloring
                const squareToPath = new Map();
                shift.map.corePaths.forEach((pathData, index) => {
                    pathData.squares.forEach(sq => {
                        const key = `${sq.x},${sq.y}`;
                        if (!squareToPath.has(key)) {
                            squareToPath.set(key, {pathIndex: index, color: pathData.color});
                        }
                    });
                });
                
                shift.map.pathSquares.forEach((square) => {
                    const key = `${square.x},${square.y}`;
                    let frame = 0; // Simplify, set all to 0
                    const sprite = this.add.sprite(square.x * this.cellSize + this.cellSize / 2, square.y * this.cellSize + this.cellSize / 2, 'conveyor-belt');
                    sprite.setFrame(frame);
                    sprite.setScale(this.gameScale);
                    
                    // Apply path-specific tint
                    const pathInfo = squareToPath.get(key);
                    if (pathInfo && pathInfo.color) {
                        // Parse color string properly
                        const colorValue = typeof pathInfo.color === 'string' ? 
                            parseInt(pathInfo.color.replace('0x', ''), 16) : 
                            pathInfo.color;
                        sprite.setTint(colorValue);
                        sprite.setAlpha(0.9);
                    } else {
                        // Default gray if no path info
                        sprite.setTint(0x808080);
                        sprite.setAlpha(0.8);
                    }
                    
                    if (this.anims.exists('conveyor-move')) {
                        sprite.play('conveyor-move');
                    }
                    sprite.setDepth(0);
                    if (this.pathSprites) {
                        this.pathSprites.add(sprite);
                    }
                    if (!this.pathSpriteMap) this.pathSpriteMap = {};
                    this.pathSpriteMap[key] = {sprite: sprite, pathInfo: pathInfo};
                });
                this.pathDrawn = true;
            }
            // Update glow for active spawning paths
            if (shift.activeEntries && shift.activeEntries.length > 0) {
                const activeSet = new Set();
                shift.map.corePaths.forEach((pathData, index) => {
                    if (shift.activeEntries.includes(index)) {
                        pathData.squares.forEach(sq => activeSet.add(`${sq.x},${sq.y}`));
                    }
                });
                
                for (const key in this.pathSpriteMap) {
                    const data = this.pathSpriteMap[key];
                    const sprite = data.sprite;
                    const pathInfo = data.pathInfo;
                    
                    if (activeSet.has(key)) {
                        // Add bright glow effect to active spawning paths
                        sprite.setTint(0xFFFF00); // Bright yellow glow
                        sprite.setAlpha(1);
                        sprite.setScale(this.gameScale * 1.1); // Slightly larger
                    } else if (pathInfo && pathInfo.color) {
                        // Normal path color
                        const colorValue = typeof pathInfo.color === 'string' ? 
                            parseInt(pathInfo.color.replace('0x', ''), 16) : 
                            pathInfo.color;
                        sprite.setTint(colorValue);
                        sprite.setAlpha(0.9);
                        sprite.setScale(this.gameScale);
                    } else {
                        // Default gray if no color info
                        sprite.setTint(0x808080);
                        sprite.setAlpha(0.8);
                        sprite.setScale(this.gameScale);
                    }
                }
            } else {
                // No active paths - just show normal colors
                for (const key in this.pathSpriteMap) {
                    const data = this.pathSpriteMap[key];
                    const sprite = data.sprite;
                    const pathInfo = data.pathInfo;
                    
                    if (pathInfo && pathInfo.color) {
                        const colorValue = typeof pathInfo.color === 'string' ? 
                            parseInt(pathInfo.color.replace('0x', ''), 16) : 
                            pathInfo.color;
                        sprite.setTint(colorValue);
                        sprite.setAlpha(0.9);
                    } else {
                        sprite.setTint(0x808080);
                        sprite.setAlpha(0.8);
                    }
                }
            }
        }

        // Draw pit
        if (this.pitGraphics) {
            this.pitGraphics.clear();
            this.pitGraphics.fillStyle(0xadd8e6);
            this.pitGraphics.lineStyle(2, 0xffffff);
            this.pitGraphics.fillRect(shift.map.pit.x * this.cellSize, shift.map.pit.y * this.cellSize, shift.map.pit.width * this.cellSize, shift.map.pit.height * this.cellSize);
            this.pitGraphics.strokeRect(shift.map.pit.x * this.cellSize, shift.map.pit.y * this.cellSize, shift.map.pit.width * this.cellSize, shift.map.pit.height * this.cellSize);
        }

        // Update players
        shift.players.forEach(p => {
            if (p.userId === currentUser._id) {
                if (!this.player) {
                    this.player = this.add.rectangle(p.x * this.gameScale, p.y * this.gameScale, 10 * this.gameScale, 10 * this.gameScale, 0x00ff00);
                    this.physics.add.existing(this.player);
                    this.player.body.setCollideWorldBounds(true);
                    // Camera follows player smoothly
                    this.cameras.main.startFollow(this.player, false, 0.1, 0.1);
                }
                // Don't update own position to prevent snapping
            } else {
                if (!this.playerSprites[p.userId]) {
                    let rect = this.add.rectangle(p.x * this.gameScale, p.y * this.gameScale, 10 * this.gameScale, 10 * this.gameScale, 0xffffff);
                    this.physics.add.existing(rect);
                    rect.body.setCollideWorldBounds(true);
                    this.playerSprites[p.userId] = rect;
                } else {
                    this.playerSprites[p.userId].x = p.x * this.gameScale;
                    this.playerSprites[p.userId].y = p.y * this.gameScale;
                }
            }
        });

        // Clear existing enemies and weapons
        // Removed: this.enemies.clear(true, true);
        // Removed: this.weapons.clear(true, true);
        // Removed: this.projectiles.clear(true, true);

        // Remove old collider
        if (this.playerWeaponCollider) {
            this.physics.world.removeCollider(this.playerWeaponCollider);
        }

        // Update position maps
        this.weaponPositions = {};
        shift.weapons.forEach(w => this.weaponPositions[w.id] = {x: w.x, y: w.y, type: w.type});
        this.enemyPositions = {};
        shift.enemies.forEach(e => this.enemyPositions[e.id] = {x: e.x, y: e.y});

        // Update enemies
        const currentEnemyIds = new Set(shift.enemies.map(e => e.id));
        if (!this.enemySprites) this.enemySprites = {};
        for (let id in this.enemySprites) {
            if (!currentEnemyIds.has(id)) {
                const enemy = this.enemySprites[id];
                if (enemy.bgRect) enemy.bgRect.destroy();
                if (enemy.hpBar) enemy.hpBar.destroy();
                if (enemy.hpBarBg) enemy.hpBarBg.destroy();
                if (enemy.nameText) enemy.nameText.destroy();
                if (enemy.abilityGlow) enemy.abilityGlow.destroy();
                enemy.destroy();
                delete this.enemySprites[id];
            }
        }
        shift.enemies.forEach(e => {
            if (!this.enemySprites[e.id]) {
                // Create enemy container based on grid size
                const spriteWidth = (e.gridWidth || 1) * this.cellSize;
                const spriteHeight = (e.gridHeight || 1) * this.cellSize;
                
                // Create background rectangle with rarity color
                const bgRect = this.add.rectangle(
                    e.x * this.gameScale, 
                    e.y * this.gameScale, 
                    spriteWidth, 
                    spriteHeight, 
                    e.rarityColor || 0xff0000
                );
                bgRect.setDepth(5);
                bgRect.setAlpha(0.8);
                
                // Create small sprite in center (30% of total size)
                const smallSpriteSize = Math.min(spriteWidth, spriteHeight) * 0.3;
                let enemy = this.add.sprite(e.x * this.gameScale, e.y * this.gameScale, 'waste-01');
                enemy.setDisplaySize(smallSpriteSize, smallSpriteSize);
                enemy.setDepth(5.5);
                if (this.enemies) this.enemies.add(enemy);
                
                // Store background reference
                enemy.bgRect = bgRect;
                
                // Add HP bar background
                enemy.hpBarBg = this.add.rectangle(
                    e.x * this.gameScale, 
                    e.y * this.gameScale - spriteHeight/2 - 5, 
                    spriteWidth, 
                    3, 
                    0x000000
                );
                enemy.hpBarBg.setDepth(6);
                
                // Add HP bar
                enemy.hpBar = this.add.rectangle(
                    e.x * this.gameScale, 
                    e.y * this.gameScale - spriteHeight/2 - 5, 
                    spriteWidth, 
                    3, 
                    0x00FF00
                );
                enemy.hpBar.setDepth(7);
                
                // Add name text
                enemy.nameText = this.add.text(
                    e.x * this.gameScale, 
                    e.y * this.gameScale + spriteHeight/2 + 5, 
                    e.name || 'Waste',
                    {
                        fontSize: '8px',
                        color: '#' + (e.rarityColor || 0xFFFFFF).toString(16).padStart(6, '0'),
                        stroke: '#000000',
                        strokeThickness: 2
                    }
                ).setOrigin(0.5, 0).setDepth(8);
                
                this.enemySprites[e.id] = enemy;
            } else {
                const enemy = this.enemySprites[e.id];
                const spriteWidth = (e.gridWidth || 1) * this.cellSize;
                const spriteHeight = (e.gridHeight || 1) * this.cellSize;
                
                // Update position for both sprite and background
                enemy.x = e.x * this.gameScale;
                enemy.y = e.y * this.gameScale;
                if (enemy.bgRect) {
                    enemy.bgRect.x = e.x * this.gameScale;
                    enemy.bgRect.y = e.y * this.gameScale;
                }
                
                // Update HP bar
                const hpPercent = (e.health || e.hp) / (e.maxHP || e.health || 1);
                enemy.hpBar.x = e.x * this.gameScale;
                enemy.hpBar.y = e.y * this.gameScale - spriteHeight/2 - 5;
                enemy.hpBar.scaleX = hpPercent;
                enemy.hpBar.setFillStyle(hpPercent > 0.5 ? 0x00FF00 : hpPercent > 0.25 ? 0xFFAA00 : 0xFF0000);
                enemy.hpBarBg.x = e.x * this.gameScale;
                enemy.hpBarBg.y = e.y * this.gameScale - spriteHeight/2 - 5;
                
                // Update name
                enemy.nameText.setPosition(e.x * this.gameScale, e.y * this.gameScale + spriteHeight/2 + 5);
                
                // Add special ability glow
                if (e.specialAbility && !enemy.abilityGlow) {
                    enemy.abilityGlow = this.add.circle(e.x * this.gameScale, e.y * this.gameScale, spriteWidth * 0.6, 0xFFFFFF, 0.3);
                    enemy.abilityGlow.setDepth(4);
                }
                if (enemy.abilityGlow) {
                    enemy.abilityGlow.setPosition(e.x * this.gameScale, e.y * this.gameScale);
                }
            }
        });

        // Update weapons
        const currentWeaponIds = new Set(shift.weapons.map(w => w.id));
        if (!this.weaponSprites) this.weaponSprites = {};
        for (let id in this.weaponSprites) {
            if (!currentWeaponIds.has(id)) {
                this.weaponSprites[id].destroy();
                delete this.weaponSprites[id];
            }
        }
        shift.weapons.forEach(w => {
            if (!this.weaponSprites[w.id]) {
                let color = WEAPON_TYPES[w.type]?.color || 0x0000ff;
                const gridSize = WEAPON_GRID_SIZES[w.type] || {w:1,h:1};
                let alpha = w.hp / w.stats.hp;
                let weapon;
                if (w.type === 'pressure-washer') {
                    weapon = this.add.sprite(w.x * this.gameScale, w.y * this.gameScale, 'pressure-washer');
                    weapon.setDisplaySize(gridSize.w * this.cellSize, gridSize.h * this.cellSize);
                    weapon.originalColor = 0xffffff;
                } else {
                    weapon = this.add.rectangle(w.x * this.gameScale, w.y * this.gameScale, gridSize.w * this.cellSize, gridSize.h * this.cellSize, color);
                    weapon.originalColor = color;
                }
                weapon.setAlpha(alpha);
                weapon.setDepth(1); // Weapons above path
                this.physics.add.existing(weapon);
                weapon.body.setImmovable(true);
                if (this.weapons) this.weapons.add(weapon);
                this.weaponSprites[w.id] = weapon;
            } else {
                // Update alpha if needed
                let alpha = w.hp / w.stats.hp;
                this.weaponSprites[w.id].setAlpha(alpha);
            }
        });

        // Add new collider
        this.playerWeaponCollider = this.physics.add.collider(this.player, this.weapons);

        // Update projectiles
        const currentProjectileIds = new Set(shift.projectiles.map(p => p.id));
        if (!this.projectileSprites) this.projectileSprites = {};
        for (let id in this.projectileSprites) {
            if (!currentProjectileIds.has(id)) {
                this.projectileSprites[id].destroy();
                delete this.projectileSprites[id];
            }
        }
        shift.projectiles.forEach(p => {
            if (!this.projectileSprites[p.id]) {
                let proj = this.add.circle(p.x * this.gameScale, p.y * this.gameScale, 3 * this.gameScale, 0xff0000);
                proj.setDepth(2); // Projectiles above everything
                if (this.projectiles) this.projectiles.add(proj);
                this.projectileSprites[p.id] = proj;
            } else {
                this.projectileSprites[p.id].x = p.x * this.gameScale;
                this.projectileSprites[p.id].y = p.y * this.gameScale;
            }
        });

        // Update heat
        if (typeof shift.heat !== 'number' || isNaN(shift.heat)) shift.heat = 0;
        if (this.heatText) this.heatText.setText('Heat: ' + Math.round(shift.heat));

        // Update UI texts
        if (this.nameText) this.nameText.setText('Name: ' + currentUser.username);
        if (this.creditsText) this.creditsText.setText('Credits: ' + currentUser.credits);
        let phaseDisplay = shift.status === 'active' ? shift.phase : shift.status;
        let waveDisplay = shift.status === 'active' ? shift.waveInPhase : (shift.status === 'planning' ? 0 : shift.wave);
        if (this.phaseText) this.phaseText.setText(`Phase: ${phaseDisplay}, Wave: ${waveDisplay}`);

        // Update scrap
        const player = shift.players.find(p => p.userId === currentUser._id);
        if (player && (typeof player.scrap !== 'number' || isNaN(player.scrap))) player.scrap = 0;
        // Update scrap bar
        const bar = document.getElementById('scrap-bar');
        const maxScrap = 1000;
        const progress = (player.scrap - player.previousPickupThreshold) / (player.pickupThreshold - player.previousPickupThreshold);
        const percentage = Math.min(progress * 100, 100);
        bar.style.width = percentage + '%';
        document.getElementById('scrap-text').textContent = 'Scrap: ' + player.totalScrap;

        // Update scraps
        if (this.scraps) this.scraps.clear(true, true);
        shift.scraps.forEach(s => {
          if (!this.collectingScrapIds.has(s.id)) {
            let scrap = this.add.sprite(s.x * this.gameScale, s.y * this.gameScale, 'scrap');
            scrap.setScale(this.gameScale);
            if (this.scraps) this.scraps.add(scrap);
            this.tweens.add({
              targets: scrap,
              y: s.y * this.gameScale + 10 * this.gameScale,
              duration: 300,
              ease: 'Bounce.easeOut'
            });
          }
        });

        // Update toolbelt
        updateGameToolbelt();

        // Update start wave button
        if (shift.status === 'planning') {
            document.getElementById('start-wave-btn').style.display = 'block';
        } else {
            document.getElementById('start-wave-btn').style.display = 'none';
        }

        // Update end break button
        if (shift.waveState === 'break') {
            document.getElementById('end-break-btn').style.display = 'block';
        } else {
            document.getElementById('end-break-btn').style.display = 'none';
        }
    }

    placeWeapon(pointer) {
        if (this.paused || this.inputsDisabled || !window.currentShift) return;
        if (!currentUser) return;
        if (pointer.button === 2) {
            if (!currentShiftId) return;
            if (this.hoveredWeaponId) {
                console.log('Destroying weapon:', this.weaponPositions[this.hoveredWeaponId]);
                socket.emit('destroy-weapon', { shiftId: currentShiftId, weaponId: this.hoveredWeaponId, userId: currentUser._id });
            }
            return;
        }
        const toolbelt = currentUser.toolbelt || [];
        const selectedId = toolbelt[selectedIndex];
        if (!selectedId) return;
        const selectedItem = currentUser.inventory.find(inv => inv.id === selectedId);
        if (!selectedItem) return;
        if (currentShiftId) {
            // Convert pointer from screen space to world space (accounting for zoom)
            const worldX = (pointer.worldX !== undefined) ? pointer.worldX : ((pointer.x / this.cameras.main.zoom) + this.cameras.main.scrollX);
            const worldY = (pointer.worldY !== undefined) ? pointer.worldY : ((pointer.y / this.cameras.main.zoom) + this.cameras.main.scrollY);
            
            let gx = Math.floor(worldX / this.cellSize);
            let gy = Math.floor(worldY / this.cellSize);
            const gridSize = WEAPON_GRID_SIZES[selectedItem.type] || {w:1,h:1};
            let gridW = gridSize.w, gridH = gridSize.h;
            let x = gx * window.currentShift.cellSize + (gridW * window.currentShift.cellSize) / 2;
            let y = gy * window.currentShift.cellSize + (gridH * window.currentShift.cellSize) / 2;
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
                    let wx = Math.floor(pos.x / 10) - Math.floor(wGridW / 2);
                    let wy = Math.floor(pos.y / 10) - Math.floor(wGridH / 2);
                    return !(gx + gridW <= wx || wx + wGridW <= gx || gy + gridH <= wy || wy + wGridH <= gy);
                });
                if (!occupied) {
                    socket.emit('place-weapon', { shiftId: currentShiftId, x, y, type: selectedItem.type, rarity: selectedItem.rarity, userId: currentUser._id });
                }
            }
        }
    }

    shutdown() {
        // Clean up socket listeners to prevent memory leaks
        if (this.shiftUpdateHandler) {
            socket.off('shift-update', this.shiftUpdateHandler);
        }
        if (this.weaponFiredHandler) {
            socket.off('weapon-fired', this.weaponFiredHandler);
        }
        if (this.boostChoiceHandler) {
            socket.off('boost-choice', this.boostChoiceHandler);
        }
        console.log('GameScene socket listeners cleaned up');
    }

    onPointerMove(pointer) {
        if (!window.currentShift || !this.pathSquares) return;
        if (!this.weaponPositions) this.weaponPositions = {};
        this.hoverGraphics.clear();
        const toolbelt = currentUser.toolbelt || [];
        const selectedId = toolbelt[selectedIndex];
        if (!selectedId) return;
        const selectedItem = currentUser.inventory.find(inv => inv.id === selectedId);
        if (!selectedItem) return;
        
        // Convert pointer from screen space to world space (accounting for zoom)
        const worldX = (pointer.worldX !== undefined) ? pointer.worldX : ((pointer.x / this.cameras.main.zoom) + this.cameras.main.scrollX);
        const worldY = (pointer.worldY !== undefined) ? pointer.worldY : ((pointer.y / this.cameras.main.zoom) + this.cameras.main.scrollY);
        
        let gx = Math.floor(worldX / this.cellSize);
        let gy = Math.floor(worldY / this.cellSize);
        // Get grid size
        const gridSize = WEAPON_GRID_SIZES[selectedItem.type] || {w:1,h:1};
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
                let wwx = Math.floor((pos.x - (wGridW * window.currentShift.cellSize) / 2) / window.currentShift.cellSize);
                let wwy = Math.floor((pos.y - (wGridH * window.currentShift.cellSize) / 2) / window.currentShift.cellSize);
                return !(gx + gridW <= wwx || wwx + wGridW <= gx || gy + gridH <= wwy || wwy + wGridH <= gy);
            });
            valid = !occupied;
        }
        this.hoverGraphics.lineStyle(2 * this.gameScale, valid ? 0x00ff00 : 0xff0000);
        this.hoverGraphics.strokeRect(x - width / 2, y - height / 2, width, height);
        this.hoverGraphics.fillStyle(valid ? 0x00ff00 : 0xff0000, 0.3);
        this.hoverGraphics.fillRect(x - width / 2, y - height / 2, width, height);

        // Check for hovered weapon
        this.hoveredWeaponId = null;
        for (let [id, pos] of Object.entries(this.weaponPositions)) {
            const gridSize = WEAPON_GRID_SIZES[pos.type] || {w:1,h:1};
            const wx = Math.floor((pos.x - (gridSize.w * window.currentShift.cellSize) / 2) / window.currentShift.cellSize);
            const wy = Math.floor((pos.y - (gridSize.h * window.currentShift.cellSize) / 2) / window.currentShift.cellSize);
            if (gx >= wx && gx < wx + gridSize.w && gy >= wy && gy < wy + gridSize.h) {
                this.hoveredWeaponId = id;
                break;
            }
        }
    }
}

// Start game directly for testing
// startGame();

async function loginUser(credentials) {
  if (credentials.token) {
    try {
      const res = await fetch('http://localhost:3001/me', {
        headers: { 'Authorization': `Bearer ${credentials.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
          currentUser.toolbelt = [{type: 'pressure-washer', rarity: 'common'}];
        }
        if (!currentUser.unlockedWeapons) {
          currentUser.unlockedWeapons = ['pressure-washer'];
        }
        if (!currentUser.credits) {
          currentUser.credits = 0;
        }
        return true;
      } else {
        localStorage.removeItem('token');
        return false;
      }
    } catch (err) {
      localStorage.removeItem('token');
      return false;
    }
  } else {
    try {
      const res = await fetch('http://localhost:3001/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        if (!currentUser.toolbelt || currentUser.toolbelt.length === 0) {
          currentUser.toolbelt = [{type: 'pressure-washer', rarity: 'common'}];
        }
        if (!currentUser.unlockedWeapons) {
          currentUser.unlockedWeapons = ['pressure-washer'];
        }
        if (!currentUser.credits) {
          currentUser.credits = 0;
        }
        localStorage.setItem('token', data.token);
        return true;
      } else {
        showDismissableAlert(data.message, "OK");
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      showDismissableAlert('Login failed: ' + error.message, "OK");
      return false;
    }
  }
}

function updateFromServer(data) {
  const { user, shift } = data;
  currentUser = user;
  document.getElementById('credits-display').innerText = `Credits: ${user.credits}`;
  if (shift) {
    // Update shift if needed
  } else {
    loadLockerRoomPage();
  }
}

function loadLockerRoomPage() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('nav').style.display = 'flex';
  document.getElementById('locker-room').style.display = 'block';
  document.getElementById('nav-username').textContent = currentUser.username;
  document.getElementById('nav-credits').textContent = currentUser.credits || 0;
  // Show all elements initially
  document.getElementById('shift-spinner').style.display = 'none';
  document.getElementById('shift-code').style.display = 'block';
  document.getElementById('join-section').style.display = 'block';
  document.getElementById('player-list').style.display = 'block';
  document.getElementById('loadout').style.display = 'block';
  document.getElementById('chat').style.display = 'none';
  document.getElementById('start-shift').style.display = 'block';
  document.getElementById('licenses-btn').style.display = 'block';
  // Hide game elements
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('toolbelt-ui').style.display = 'none';
  document.getElementById('scrap-bar-container').style.display = 'none';
  document.getElementById('toggle-boosts').style.display = 'none';
  // Destroy game instance
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
  // Reset game variables
  currentShiftId = null;
  previousPlayers = [];
  selectedIndex = 0;
  // Disable buttons initially
  document.getElementById('start-shift').disabled = true;
  document.getElementById('start-shift').textContent = "I'm Ready";
  document.getElementById('join-shift-btn').disabled = false;
}

function connectSocketIO() {
  socket = io('http://localhost:3001');
  // Set up socket listeners
  socket.on('shift-update', (shift) => {
    if (!currentUser) return;
    window.currentShift = shift; // Set current shift for game scene
    // Update player list if locker room is visible
    if (document.getElementById('locker-room').style.display !== 'none') {
      if (shift.id !== currentShiftId) return; // Only update for current shift
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
      if (shift.status !== 'ended') {
        const newPlayers = shift.players.filter(p => !currentPrevious.some(pp => pp.userId === p.userId));
        if (newPlayers.length > 0) {
          newPlayers.forEach(newPlayer => {
            if (newPlayer.userId === currentUser._id) {
              // You joined
              const host = shift.players[0];
              showDismissableAlert(`You've joined ${host.username}'s shift`, "OK");
            } else {
              // Someone else joined
              showDismissableAlert(`${newPlayer.username} has joined your shift`, "OK");
            }
          });
        }
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
    if (!currentUser) return;
    document.getElementById('locker-room').style.display = 'none';
    startGame();
  });
  socket.on('reconnect', () => {
    if (!currentUser) return;
    if (currentShiftId) {
      socket.emit('join-shift', { shiftId: currentShiftId, userId: currentUser._id });
    }
  });
  socket.on('game-over', (data) => {
    if (!currentUser) return;
    if (data.playerId === currentUser._id) {
      currentUser.credits += data.credits;
      showDismissableAlert(`You earned ${data.credits} credits from this shift`, "OK", () => {
        loadLockerRoomPage();
      });
    }
  });
  socket.on('update', updateFromServer);
}

async function obtainShiftCode() {
  console.log('Creating shift for userId:', currentUser._id);
  // Show spinner and hide other elements
  document.getElementById('shift-spinner').style.display = 'block';
  document.getElementById('shift-code').style.display = 'none';
  document.getElementById('join-section').style.display = 'none';
  document.getElementById('player-list').style.display = 'none';
  document.getElementById('loadout').style.display = 'none';
  document.getElementById('chat').style.display = 'none';
  document.getElementById('start-shift').style.display = 'none';
  document.getElementById('licenses-btn').style.display = 'none';
  // Fixed world size: 800x600 (80x60 grid)
  const worldWidth = 800;
  const worldHeight = 600;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000); // 10 second timeout
  try {
    const res = await fetch('http://localhost:3001/create-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser._id }),
      signal: controller.signal
    });
    if (res.ok) {
      const data = await res.json();
      console.log('Shift created:', data);
      currentShiftId = data.shift.id;
      document.getElementById('code').textContent = currentShiftId;
      // Hide spinner
      document.getElementById('shift-spinner').style.display = 'none';
      // Show the rest of the locker room
      document.getElementById('shift-code').style.display = 'block';
      document.getElementById('join-section').style.display = 'block';
      document.getElementById('player-list').style.display = 'block';
      document.getElementById('loadout').style.display = 'block';
      document.getElementById('chat').style.display = 'none'; // Chat shows based on multiplayer
      document.getElementById('start-shift').style.display = 'block';
      document.getElementById('licenses-btn').style.display = 'block';
      // Disable ready button until map is generated
      const startBtn = document.getElementById('start-shift');
      startBtn.disabled = true;
      startBtn.textContent = "Generating Map...";
      if (socket.connected) {
        socket.emit('join-shift', { shiftId: data.shift.id, userId: currentUser._id });
      } else {
        socket.on('connect', () => {
          socket.emit('join-shift', { shiftId: data.shift.id, userId: currentUser._id });
        });
      }
      previousPlayers = [{ userId: currentUser._id, username: currentUser.username }];
    } else {
      throw new Error('Failed to create shift: ' + res.status);
    }
  } catch (err) {
    console.error('Create shift error:', err);
    // Hide spinner on error
    document.getElementById('shift-spinner').style.display = 'none';
    // Show the rest of the locker room
    document.getElementById('shift-code').style.display = 'block';
    document.getElementById('join-section').style.display = 'block';
    document.getElementById('player-list').style.display = 'block';
    document.getElementById('loadout').style.display = 'block';
    document.getElementById('chat').style.display = 'none';
    document.getElementById('start-shift').style.display = 'block';
    document.getElementById('licenses-btn').style.display = 'block';
    if (err.name === 'AbortError') {
      showDismissableAlert('Timeout generating shift', "OK");
    } else {
      showDismissableAlert('Error generating shift', "OK");
    }
  }
}

function obtainInventory() {
  // Inventory is populated in populateToolbelt
}

function obtainSavedToolbelt() {
  populateToolbelt();
}

function validateToolbelt() {
  // For now, assume valid
  return true;
}

function enableButtons() {
  if (validateToolbelt()) {
    document.getElementById('start-shift').disabled = false;
    document.getElementById('join-shift-btn').disabled = false;
  }
}

function showDismissableAlert(text, buttonText, callback) {
  const modal = document.getElementById('alert-modal');
  const textEl = document.getElementById('alert-text');
  const btn = document.getElementById('alert-dismiss-btn');
  const closeX = document.getElementById('alert-close-x');

  textEl.textContent = text;
  btn.textContent = buttonText;

  modal.style.display = 'block';

  const closeModal = () => {
    modal.style.display = 'none';
    document.removeEventListener('keydown', escHandler);
    if (callback) callback();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  document.addEventListener('keydown', escHandler);

  closeX.onclick = closeModal;
  btn.onclick = closeModal;
}

function showPauseModal() {
  const modal = document.getElementById('pause-modal');
  modal.style.display = 'block';

  const resume = () => {
    modal.style.display = 'none';
    if (gameInstance && gameInstance.scene) {
      const scene = gameInstance.scene.getScene('GameScene');
      if (scene) {
        scene.pauseGame(false);
      }
    }
  };

  const closeX = document.getElementById('pause-close-x');
  const btn = document.getElementById('pause-resume-btn');

  closeX.onclick = resume;
  btn.onclick = resume;

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      resume();
    }
  };

  document.addEventListener('keydown', escHandler);
}

function showGameMenu() {
  const modal = document.getElementById('game-menu-modal');
  modal.style.display = 'block';

  const resume = () => {
    modal.style.display = 'none';
    if (gameInstance && gameInstance.scene) {
      const scene = gameInstance.scene.getScene('GameScene');
      if (scene) {
        scene.paused = false;
        scene.scene.resume('GameScene');
      }
    }
    socket.emit('resume-shift', { shiftId: currentShiftId });
  };

  const forfeit = () => {
    modal.style.display = 'none';
    const player = window.currentShift ? window.currentShift.players.find(p => p.userId === currentUser._id) : null;
    if (!player) return;
    const scrapEarned = player.scrap - 0;
    const wavesCompleted = window.currentShift.wave - 1;
    const wasteDefeated = window.currentShift.enemiesDefeated;
    const fullCredits = Math.floor((scrapEarned * wavesCompleted + wasteDefeated) / 100);
    let credits = Math.floor(fullCredits * 0.8);
    if (window.currentShift.players.length > 1) {
      credits = Math.floor(credits * 1.1);
    }
    socket.emit('forfeit-shift', { shiftId: currentShiftId, userId: currentUser._id });
    showDismissableAlert(`You earned ${credits} credits from this shift`, "OK", () => {
      loadLockerRoomPage();
    });
  };

  document.getElementById('menu-resume-btn').onclick = resume;
  document.getElementById('menu-forfeit-btn').onclick = forfeit;
}

function showBoostModal(choices) {
    if (!currentUser) return;
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
        // One-time use boosts are yellow
        if (choice.effect.healWeapons || choice.effect.destroyWaste || choice.effect.freezeEnemies || choice.effect.suckScrap) {
            button.style.border = '2px solid #ffff00';
        }
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
            // Backend automatically unpauses for single-player, no need to call resume-game
            if (gameInstance && gameInstance.scene) {
                const scene = gameInstance.scene.getScene('GameScene');
                if (scene) {
                    scene.inputsDisabled = false;
                }
            }
        };
        optionsDiv.appendChild(button);
    });
    modal.style.display = 'block';
    if (gameInstance && gameInstance.scene) {
        const scene = gameInstance.scene.getScene('GameScene');
        if (scene) {
            scene.inputsDisabled = true;
        }
    }
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

function showLicensesModal() {
  if (!currentUser) return;
  const modal = document.getElementById('licenses-modal');
  const list = document.getElementById('licenses-list');
  list.innerHTML = '';
  Object.entries(WEAPON_TYPES).forEach(([type, weapon]) => {
    if (currentUser.unlockedWeapons.includes(type)) {
      const div = document.createElement('div');
      div.textContent = `${weapon.name} - Unlocked`;
      div.style.margin = '5px';
      list.appendChild(div);
    } else {
      const button = document.createElement('button');
      button.textContent = `Buy ${weapon.name} - ${weapon.cost} credits`;
      button.style.margin = '5px';
      button.style.padding = '10px';
      button.style.background = '#333';
      button.style.border = '1px solid #ffd700';
      button.style.color = 'white';
      button.style.cursor = 'pointer';
      button.onclick = () => {
        fetch('http://localhost:3001/buy-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser._id, weaponType: type })
        }).then(response => {
          if (response.ok) {
            return response.json();
          } else {
            return response.json().then(err => { throw new Error(err.message || 'Failed to buy'); });
          }
        }).then(data => {
          currentUser.credits = data.credits;
          currentUser.unlockedWeapons = data.unlockedWeapons;
          document.getElementById('nav-credits').textContent = currentUser.credits;
          populateToolbelt(); // Refresh inventory
          showLicensesModal(); // Refresh modal
          showDismissableAlert(`Unlocked ${weapon.name}!`, "OK");
        }).catch(err => showDismissableAlert(err.message, "OK"));
      };
      list.appendChild(button);
    }
  });
  modal.style.display = 'block';
}