const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { generateWaste, calculateDamage, handleWasteDeath, applyRegeneration, applyToxicEffect } = require('./wasteTypes');

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/test', (req, res) => {
  res.send('Backend is running');
});
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/coruscant-defense', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// User model
const inventoryItemSchema = new mongoose.Schema({
  id: String,
  type: String,
  rarity: String,
  stats: mongoose.Schema.Types.Mixed
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: String,
  password: String, // In production, hash this
  credits: { type: Number, default: 0 },
  unlockedWeapons: { type: [String], default: ['pressure-washer'] },
  gear: [String], // equipped items
  level: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: false },
  toolbelt: [String], // weapon ids for quick action bar
  inventory: { type: [inventoryItemSchema], default: [{ id: 'default-pw', type: 'pressure-washer', rarity: 'common', stats: { power: 50, cooldown: 1000, range: 50, hp: 100, heatGen: 10, heatResist: 10, knockback: 1, shape: 'cone', gridSize: {w:1,h:1} } }] }
});

const User = mongoose.model('User', userSchema);

// Gacha Log model
const gachaLogSchema = new mongoose.Schema({
  userId: String,
  weaponType: String,
  rarity: String,
  timestamp: { type: Date, default: Date.now }
});

const GachaLog = mongoose.model('GachaLog', gachaLogSchema);

// Sub schemas
const enemySchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  health: Number,
  hp: Number,
  maxHP: Number,
  type: String,
  name: String,
  rarity: String,
  rarityColor: Number,
  material: String,
  materialWeakTo: [String],
  materialResistantTo: [String],
  gridWidth: { type: Number, default: 1 },
  gridHeight: { type: Number, default: 1 },
  size: { type: Number, default: 1 },
  toughness: { type: Number, default: 0 },
  density: { type: Number, default: 1 },
  value: { type: Number, default: 1 },
  specialAbility: String,
  specialAbilityData: mongoose.Schema.Types.Mixed,
  pathIndex: { type: Number, default: 0 },
  pathId: { type: Number, default: 0 },
  reachedPit: { type: Boolean, default: false },
  pitSlot: { type: Number, default: -1 }
}, { strict: false });

const weaponSchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  type: String,
  playerId: String,
  stats: Object,
  rarity: String,
  adjective: String,
  hp: Number,
  heat: { type: Number, default: 0 },
  lastFired: { type: Number, default: 0 }
});

const projectileSchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  targetId: String,
  speed: Number,
  damage: Number,
  playerId: String,
  knockback: Number
});

// Shift model for multiplayer shifts
const shiftSchema = new mongoose.Schema({
  id: String,
  players: [{ userId: String, username: String, x: Number, y: Number, inventory: [Object], boosts: [Object], scrap: {type: Number, default: 0}, totalScrap: {type: Number, default: 0}, boostChoices: Object, lastPlaced: {type: Number, default: 0}, pickupRadius: {type: Number, default: 20}, pickupThreshold: {type: Number, default: 20}, previousPickupThreshold: {type: Number, default: 0} }],
  map: { type: Object, default: {} }, // e.g., path data
  wave: { type: Number, default: 1 },
  overflow: { type: Number, default: 20 },
  scrap: { type: Number, default: 0 },
  heat: { type: Number, default: 0 },
  enemies: [enemySchema],
  weapons: [weaponSchema],
  projectiles: [projectileSchema],
  scraps: [{ id: String, x: Number, y: Number, value: {type: Number, default: 1} }],
  status: { type: String, default: 'waiting' }, // waiting, active, ended
  ready: [{ userId: String }],
  enemiesDefeated: { type: Number, default: 0 },
  paused: { type: Boolean, default: false },
  boostThreshold: { type: Number, default: 100 },
  boostInterval: { type: Number, default: 100 },
  freezeEnd: { type: Number, default: 0 },
  worldWidth: Number,
  worldHeight: Number,
  gridWidth: Number,
  gridHeight: Number,
  cellSize: { type: Number, default: 10 },
  phase: { type: Number, default: 1 },
  phaseStartTime: { type: Number, default: 0 },
  waveInPhase: { type: Number, default: 1 },
  activeEntries: [Number],
  pitFill: { type: Number, default: 0 },
  pitMaxFill: { type: Number, default: 20 },
  waves: [{ phase: Number, waveInPhase: Number, activeEntries: [Number], spawnRate: Number, enemyHp: Number, numEnemies: Number, spawnInterval: Number }],
  currentWaveIndex: { type: Number, default: 0 },
  waveTimer: { type: Number, default: 0 },
  waveState: { type: String, default: 'waiting' },
  spawnTimer: { type: Number, default: 0 },
  enemiesSpawned: { type: Number, default: 0 }
}, { versionKey: false });

const Shift = mongoose.model('Shift', shiftSchema);

// GlobalState model for planet-wide overflow
const globalStateSchema = new mongoose.Schema({
  overflow: { type: Number, default: 100 },
  lastUpdated: { type: Date, default: Date.now }
});

const GlobalState = mongoose.model('GlobalState', globalStateSchema);

// Weapon and loot definitions
const RARITIES = {
  common: { weight: 0.5, color: 0x00ff00, name: 'Common', modifier: 1.0 },
  uncommon: { weight: 0.35, color: 0x0000ff, name: 'Uncommon', modifier: 1.1 },
  rare: { weight: 0.13, color: 0xff0000, name: 'Rare', modifier: 1.25 },
  mythic: { weight: 0.01666, color: 0xffa500, name: 'Mythic Rare', modifier: 1.5 },
  legendary: { weight: 0.00333, color: 0xffffff, name: 'Legendary', modifier: 2.0 }
};

const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.1,
  rare: 1.2,
  mythic: 1.4,
  legendary: 1.6
};

function getWeaponStats(type, rarity) {
  const base = WEAPON_TYPES[type].baseStats;
  const mult = RARITY_MULTIPLIERS[rarity];
  return {
    power: Math.floor(base.power * mult),
    cooldown: Math.floor(base.cooldown / mult),
    range: Math.floor(base.range * mult),
    hp: Math.floor(base.hp * mult),
    heatGen: base.heatGen,
    heatResist: Math.floor(base.heatResist * mult),
    knockback: Math.floor(base.knockback * mult),
    shape: base.shape,
    gridSize: base.gridSize
  };
}

function getRandomRarity() {
  const rand = Math.random();
  if (rand < 0.5) return 'common';
  if (rand < 0.8) return 'uncommon';
  if (rand < 0.95) return 'rare';
  if (rand < 0.99) return 'mythic';
  return 'legendary';
}

const WEAPON_TYPES = {
  'pressure-washer': {
    baseStats: { power: 50, cooldown: 1000, range: 50, shape: 'cone', gridSize: {w:1,h:1}, heatGen: 10, heatResist: 10, hp: 100, cost: 0, knockback: 1 },
    description: 'Shoots high-pressure water stream, damages and cools nearby weapons.'
  },
  'missile-launcher': {
    baseStats: { power: 100, cooldown: 3000, range: 180, shape: 'missile', gridSize: {w:2,h:2}, heatGen: 15, heatResist: 5, hp: 120, cost: 500, knockback: 2 },
    description: 'Launches 3 homing missiles that track and destroy enemies.'
  },
  'laser-cutter': {
    baseStats: { power: 30, cooldown: 800, range: 60, shape: 'line', gridSize: {w:1,h:3}, heatGen: 5, heatResist: 8, hp: 80, cost: 1000, knockback: 1 },
    description: 'Emits focused beam of energy that slices through enemies.'
  },
  'waste-escape-pod': {
    baseStats: { power: 10, cooldown: 2000, range: 30, shape: 'circle', gridSize: {w:4,h:4}, heatGen: 2, heatResist: 15, hp: 150, cost: 2000, knockback: 3 },
    description: 'Launches pods that explode on impact, dealing area damage.'
  }
  // Add more as needed
};

const ADJECTIVES = {
  'rapid-fire': { effect: { cooldown: 0.8 } },
  'high-capacity': { effect: { hp: 1.2 } },
  'freezing': { effect: { power: 1.1 }, special: 'slows enemies' }
  // Add more
};

const BOOST_TYPES = {
  'cooldown-reduction': {
    baseEffect: { cooldownMult: 0.9 }, // Reduce cooldown by 10%
    description: 'Reduces cooldown time of all weapons.'
  },
  'heat-dissipation': {
    baseEffect: { heatDissipate: 1 }, // Extra heat reduction per second
    description: 'Increases heat dissipation rate.'
  },
  'scrap-gain': {
    baseEffect: { scrapMult: 1.2 }, // Increase scrap earned
    description: 'Increases scrap gained from enemies.'
  },
  'weapon-power': {
    baseEffect: { powerMult: 1.1 }, // Increase weapon power
    description: 'Increases damage output of all weapons.'
  },
  'defensive-boost': {
    baseEffect: { heatResistBonus: 10 }, // Bonus heat resist
    description: 'Increases heat resistance of all weapons.'
  },
  'range-boost': {
    baseEffect: { rangeMult: 1.1 }, // Increase weapon range
    description: 'Increases range of all weapons.'
  },
  'hp-boost': {
    baseEffect: { hpMult: 1.1 }, // Increase weapon HP
    description: 'Increases HP of all weapons.'
  },
  'knockback-boost': {
    baseEffect: { knockbackMult: 1.2 }, // Increase weapon knockback
    description: 'Increases knockback distance of all weapons.'
  },
  'weapon-heal': {
    baseEffect: { healWeapons: true },
    description: 'Heals all damaged weapons to full HP (one-time use).'
  },
  'waste-destroy': {
    baseEffect: { destroyWaste: true },
    description: 'Destroys all enemies on screen (one-time use).'
  },
  'enemy-freeze': {
    baseEffect: { freezeEnemies: true },
    description: 'Freezes all enemies in place for 5 seconds (one-time use).'
  },
  'scrap-suck': {
    baseEffect: { suckScrap: true },
    description: 'Instantly collects all scrap on the screen (one-time use).'
  },
  'pickup-boost': {
    baseEffect: { pickupRadiusMult: 2.5 },
    description: 'Increases scrap pickup radius until end of shift.'
  }
};

function generateBoost() {
  // Pick type
  const types = Object.keys(BOOST_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  // Pick rarity
  let rand = Math.random();
  let cumulative = 0;
  let rarity = 'common';
  for (const [key, val] of Object.entries(RARITIES)) {
    cumulative += val.weight;
    if (rand <= cumulative) {
      rarity = key;
      break;
    }
  }
  // Apply modifier (stronger for higher rarity)
  const base = BOOST_TYPES[type].baseEffect;
  const mod = RARITIES[rarity].modifier;
  const effect = {};
  for (const [key, val] of Object.entries(base)) {
    if (key.includes('Mult')) {
      effect[key] = val ** mod; // Compound for multis
    } else {
      effect[key] = Math.floor(val * mod);
    }
  }
  return { type, rarity, effect, duration: 30000 }; // 30 seconds
}



function generateWeapon(specificType = null, specificRarity = null) {
  // Map old icon names to types
  const typeMap = { 'PW': 'pressure-washer' };
  if (specificType && typeMap[specificType]) {
    specificType = typeMap[specificType];
  }
  // Pick type
  let type;
  if (specificType) {
    type = specificType;
  } else {
    const types = Object.keys(WEAPON_TYPES);
    type = types[Math.floor(Math.random() * types.length)];
  }
  // Pick rarity
  let rarity;
  if (specificRarity) {
    rarity = specificRarity;
  } else {
    let rand = Math.random();
    let cumulative = 0;
    rarity = 'common';
    for (const [key, val] of Object.entries(RARITIES)) {
      cumulative += val.weight;
      if (rand <= cumulative) {
        rarity = key;
        break;
      }
    }
  }
  // Apply modifier
  const base = WEAPON_TYPES[type].baseStats;
  const mod = RARITIES[rarity].modifier;
  const stats = {
    power: Math.floor(base.power * mod),
    cooldown: Math.floor(base.cooldown / mod), // Faster for higher rarity
    range: base.range,
    shape: base.shape,
    gridSize: base.gridSize,
    heatGen: base.heatGen,
    heatResist: Math.floor(base.heatResist * mod),
    hp: Math.floor(base.hp * mod),
    cost: base.cost,
    knockback: Math.floor(base.knockback * mod)
  };
  // Optional adjective
  let adjective = null;
  if (Math.random() < 0.3) { // 30% chance
    const adjKeys = Object.keys(ADJECTIVES);
    adjective = adjKeys[Math.floor(Math.random() * adjKeys.length)];
    const adjEffect = ADJECTIVES[adjective].effect;
    for (const [stat, mult] of Object.entries(adjEffect)) {
      stats[stat] = Math.floor(stats[stat] * mult);
    }
  }
  return { type, rarity, stats, adjective };
}

// Routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const trimmedUsername = username.trim();
  const existingUser = await User.findOne({ username: trimmedUsername });
  if (existingUser) {
    return res.status(400).json({ message: 'Username already taken' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username: trimmedUsername, password: hashedPassword });
  await user.save();
  res.json({ message: 'User registered' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username: username.trim() });
  if (user && await bcrypt.compare(password, user.password)) {
    user.isOnline = true;
    if (!user.inventory) user.inventory = [];
    if (!user.toolbelt || user.toolbelt.length === 0) {
      const defaultItems = [
        { id: 'default-pw-1', type: 'pressure-washer', rarity: 'common', stats: getWeaponStats('pressure-washer', 'common') },
        { id: 'default-pw-2', type: 'pressure-washer', rarity: 'common', stats: getWeaponStats('pressure-washer', 'common') },
        { id: 'default-pw-3', type: 'pressure-washer', rarity: 'common', stats: getWeaponStats('pressure-washer', 'common') }
      ];
      user.inventory.push(...defaultItems);
      user.toolbelt = ['default-pw-1', 'default-pw-2', 'default-pw-3'];
      await user.save();
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ user, token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/logout', async (req, res) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (user) {
    user.isOnline = false;
    await user.save();
  }
  res.json({ message: 'Logged out' });
});

app.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({ user });
  });
});

app.post('/buy-license', async (req, res) => {
  const { userId, weaponType } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.unlockedWeapons.includes(weaponType)) return res.status(400).json({ message: 'Already unlocked' });
  const cost = WEAPON_TYPES[weaponType]?.baseStats?.cost;
  if (cost === undefined) return res.status(400).json({ message: 'Invalid weapon' });
  if (user.credits < cost) return res.status(400).json({ message: 'Not enough credits' });
  user.credits -= cost;
  user.unlockedWeapons.push(weaponType);
  await user.save();
  res.json({ credits: user.credits, unlockedWeapons: user.unlockedWeapons });
});

app.post('/spin-gacha', async (req, res) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.credits < 100) return res.status(400).json({ message: 'Not enough credits' });
  user.credits -= 100;
  // Pick random unlocked weapon type
  const unlocked = user.unlockedWeapons.length > 0 ? user.unlockedWeapons : ['pressure-washer'];
  const type = unlocked[Math.floor(Math.random() * unlocked.length)];
  // Pick rarity
  const rarity = getRandomRarity();
  // Get stats
  const stats = getWeaponStats(type, rarity);
  // Create weapon instance
  const weapon = { id: Date.now().toString(), type, rarity, stats };
  // Add to inventory
  if (!user.inventory) user.inventory = [];
  user.inventory.push(weapon);
  await user.save();
  // Log the roll
  const log = new GachaLog({ userId, weaponType: type, rarity, timestamp: new Date() });
  await log.save();
  res.json({ weapon, credits: user.credits });
});

// Routes for shifts
app.post('/create-shift', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Creating shift for userId:', userId);
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'User not found' });
    const shiftId = 'shift-' + Date.now();
    // Fixed world: 1000x1000 pixels = 100x100 grid cells
    const worldWidth = 1000;
    const worldHeight = 1000;
    const gridWidth = 100;
    const gridHeight = 100;
    const cellSize = 10;
    const shift = new Shift({ 
      id: shiftId, 
      players: [{ userId, username: user.username, x: 500, y: 500 }], 
      ready: [], 
      worldWidth, 
      worldHeight, 
      gridWidth, 
      gridHeight, 
      cellSize,
      overflow: 20,
      pitMaxFill: 20
    });
    console.log('Generating map for 100x100 grid...');
    const map = generateMap(gridWidth, gridHeight);
    console.log('Generated map pit:', map.pit, 'entries:', map.entries.length, 'path length:', map.pathSquares.length, 'last square:', map.pathSquares[map.pathSquares.length - 1]);
    console.log('Map generated, saving shift...');
    shift.map = map;
    await shift.save();
    console.log('Shift saved:', shift.id);
    res.json({ shift });
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/join-shift', async (req, res) => {
  const { shiftId, userId } = req.body;
  const shift = await Shift.findOne({ id: shiftId });
  if (!shift) return res.status(404).json({ message: 'Shift not found' });
  if (shift.players.some(p => p.userId === userId)) return res.status(400).json({ message: 'Already in this shift' });
  if (shift.players.length >= 4) return res.status(400).json({ message: 'Shift full' });
  shift.players.push({ userId, username: (await User.findById(userId)).username, x: 500, y: 500 });
  await shift.save();
  res.json({ shift });
});

app.get('/global-state', async (req, res) => {
  let globalState = await GlobalState.findOne();
  if (!globalState) {
    globalState = new GlobalState();
    await globalState.save();
  }
  res.json({ overflow: globalState.overflow });
});

// Socket.io for multiplayer
const activeShifts = {}; // shiftId -> { shift, intervalId }
const socketToShift = {}; // socketId -> shiftId

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-shift', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    socket.userId = userId;
    socket.join(shiftId);
    socketToShift[socket.id] = shiftId;
    // Start game loop if not already running and status is active
    if (!activeShifts[shiftId] && shift.status === 'active') {
      activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
    }
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('place-weapon', async (data) => {
    const { shiftId, x, y, type, rarity, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const player = shift.players.find(p => p.userId === userId);
    if (!player) return;
    const now = Date.now();
    const cooldown = 1000; // 1 second cooldown
    if (now - player.lastPlaced < cooldown) return; // On cooldown
    // Generate weapon based on type and rarity
    const weaponData = generateWeapon(type, rarity);
    let gx = Math.floor(x / shift.cellSize);
    let gy = Math.floor(y / shift.cellSize);
    const gridSize = weaponData.stats.gridSize || {w:1,h:1};
    let pathSquares = new Set(shift.map.pathSquares.map(s => `${s.x},${s.y}`));
    // Check path for the entire area
    let valid = true;
    for (let i = 0; i < gridSize.w; i++) {
        for (let j = 0; j < gridSize.h; j++) {
            if (pathSquares.has(`${gx + i},${gy + j}`)) valid = false;
        }
    }
    if (valid) {
      // Check occupied
      const occupied = shift.weapons.some(w => {
        const wGridSize = WEAPON_TYPES[w.type]?.baseStats?.gridSize || {w:1,h:1};
        let wx = Math.floor(w.x / shift.cellSize) - Math.floor(wGridSize.w / 2);
        let wy = Math.floor(w.y / shift.cellSize) - Math.floor(wGridSize.h / 2);
        return !(gx + gridSize.w <= wx || wx + wGridSize.w <= gx || gy + gridSize.h <= wy || wy + wGridSize.h <= gy);
      });
      if (!occupied) {
        // Check grid size, for now assume 1x1
        shift.weapons.push({ id: Date.now().toString(), x, y, type: weaponData.type, playerId: userId, stats: weaponData.stats, rarity: weaponData.rarity, adjective: weaponData.adjective, hp: weaponData.stats.hp, lastFired: 0 });
        // Apply existing boosts to new weapon
        const newWeapon = shift.weapons[shift.weapons.length - 1];
        if (player.boosts) {
          player.boosts.forEach(boost => {
            if (boost.effect.hpMult) {
              newWeapon.hp = Math.floor(newWeapon.hp * boost.effect.hpMult);
            }
            if (boost.effect.rangeMult) {
              newWeapon.stats.range = Math.floor(newWeapon.stats.range * boost.effect.rangeMult);
            }
            if (boost.effect.knockbackMult) {
              newWeapon.stats.knockback = Math.floor(newWeapon.stats.knockback * boost.effect.knockbackMult);
            }
          });
        }
        player.lastPlaced = now;
        await shift.save();
        io.to(shiftId).emit('shift-update', shift);
      }
    }
  });

  socket.on('start-wave', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift) {
      console.log('Start wave called for shift:', shiftId);
      shift.status = 'active';
      shift.paused = false;
      shift.waveState = 'spawning';
      shift.waveTimer = 0;
      shift.spawnTimer = 0;
      shift.enemiesSpawned = 0;
      shift.activeEntries = shift.waves[0].activeEntries;
      shift.phase = 1;
      shift.waveInPhase = 1;
      shift.wave = 1;
      await shift.save();
      // Start loop if not running
      if (!activeShifts[shiftId]) {
        activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 30) };
      }
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('end-break', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift && shift.waveState === 'break') {
      shift.waveState = 'spawning';
      shift.waveTimer = 0;
      shift.spawnTimer = 0;
      shift.enemiesSpawned = 0;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('ready', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift && !shift.ready.some(r => r.userId === userId)) {
      shift.ready.push({ userId });
      await shift.save();
      if (shift.ready.length === shift.players.length) {
        const user = await User.findById(userId);
        // Assign player positions
        const positions = assignPlayerPositions(shift.map.pit, shift.players.length, shift.cellSize, shift.worldWidth, shift.worldHeight, shift.map.pathSquares);
        shift.players.forEach((p, i) => {
          p.x = positions[i].x;
          p.y = positions[i].y;
          if (!p.inventory || p.inventory.length === 0) {
            p.inventory = user.toolbelt.map(id => {
              const item = user.inventory.find(inv => inv.id === id);
              return item ? { ...item } : { id, type: 'pressure-washer', rarity: 'common', stats: getWeaponStats('pressure-washer', 'common') };
            });
          }
          p.boosts = []; // Start with no boosts
          p.scrap = 0; // Starting scrap
          p.totalScrap = 0; // Total scrap
          p.pickupRadius = 30; // Default pickup radius
          p.pickupThreshold = 20; // Boost threshold
          p.previousPickupThreshold = 0; // Previous threshold
        });
        shift.activeEntries = Array.from({length: shift.map.entries.length}, (_, i) => i);
        const waves = [];
        for (let phase = 1; phase <= 3; phase++) {
          for (let waveInPhase = 1; waveInPhase <= 5; waveInPhase++) {
            // Determine which main paths are active this phase (0, 1, or 2 means first, second, third main path)
            const activeMainPaths = phase === 1 ? [0] : phase === 2 ? [0,1] : [0,1,2];
            // Find all entry indices that belong to these main paths
            const activeEntries = [];
            shift.map.entryToMainPath.forEach((mainPathIndex, entryIndex) => {
              if (activeMainPaths.includes(mainPathIndex)) {
                activeEntries.push(entryIndex);
              }
            });
            const spawnRate = 1000; // not used now
            const numEnemies = Math.floor(Math.random() * 21) + 20; // 20-40
            const enemyHp = Math.floor(50 * (40 / numEnemies));
            const spawnInterval = 50 / numEnemies; // seconds per enemy
            waves.push({phase, waveInPhase, activeEntries, spawnRate, enemyHp, numEnemies, spawnInterval});
          }
        }
        console.log('Generated waves:', waves);
        shift.waves = waves;
        shift.currentWaveIndex = 0;
        shift.waveTimer = 0;
        shift.waveState = 'waiting';
        shift.waveInPhase = 1;
        shift.phase = 1;
        shift.pitFill = 0;
        shift.overflow = 20;
        shift.status = 'planning';
        shift.paused = true;
        await shift.save();
        if (!activeShifts[shiftId]) {
          activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
        }
        io.to(shiftId).emit('shift-started', shift);
        setTimeout(() => io.to(shiftId).emit('shift-update', shift), 1000);
      }
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('move', async (data) => {
    const { shiftId, x, y, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift) {
      const player = shift.players.find(p => p.userId === userId);
      if (player) {
        player.x = x;
        player.y = y;
        await shift.save();
        io.to(shiftId).emit('shift-update', shift);
      }
    }
  });

  socket.on('chat-message', (data) => {
    const { shiftId, message, username } = data;
    io.to(shiftId).emit('chat-message', { username, message });
  });

  socket.on('save-toolbelt', async (data) => {
    const { userId, toolbelt } = data;
    const user = await User.findById(userId);
    if (user) {
      user.toolbelt = toolbelt;
      await user.save();
    }
  });

  socket.on('choose-boost', async (data) => {
    const { shiftId, choiceIndex } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const player = shift.players.find(p => p.userId === socket.userId);
    if (player && player.boostChoices && player.boostChoices.options[choiceIndex]) {
      const chosen = player.boostChoices.options[choiceIndex];
      let isInstantBoost = false;
      
      if (chosen.type === 'weapon-heal') {
        // Heal all damaged weapons for this player
        isInstantBoost = true;
        shift.weapons.forEach(w => {
          if (w.playerId === player.userId && w.hp < w.stats.hp) {
            w.hp = w.stats.hp;
          }
        });
      } else if (chosen.type === 'waste-destroy') {
        // Destroy all enemies
        isInstantBoost = true;
        shift.enemies = [];
      } else if (chosen.type === 'enemy-freeze') {
        // Freeze enemies for 5 seconds
        isInstantBoost = true;
        shift.freezeEnd = Date.now() + 5000;
      } else if (chosen.type === 'scrap-suck') {
        // Collect all scraps with current bonuses
        isInstantBoost = true;
        const scrapBonus = player.boosts.reduce((sum, b) => sum + (b.effect.scrapBonus || 0), 0);
        shift.scraps.forEach(s => {
          const scrapValue = s.value + scrapBonus;
          player.scrap += scrapValue;
          player.totalScrap += scrapValue;
        });
        shift.scraps = [];
      } else {
        // Normal stacking boost
        player.boosts.push(chosen);
        // Apply boost effects to existing weapons
        shift.weapons.forEach(w => {
          if (w.playerId === player.userId) {
            if (chosen.effect.hpMult) {
              w.hp = Math.floor(w.hp * chosen.effect.hpMult);
            }
            if (chosen.effect.rangeMult) {
              w.stats.range = Math.floor(w.stats.range * chosen.effect.rangeMult);
            }
            if (chosen.effect.knockbackMult) {
              w.stats.knockback = Math.floor(w.stats.knockback * chosen.effect.knockbackMult);
            }
          }
        });
        // Apply pickup radius
        if (chosen.effect.pickupRadiusMult) {
          player.pickupRadius = 20 * chosen.effect.pickupRadiusMult;
        }
      }
      player.boostChoices = null;
      // Only reset scrap counter for permanent boosts, not instant boosts
      if (!isInstantBoost) {
        player.scrap = 0;
        player.previousPickupThreshold = 0;
      }
      if (shift.players.length === 1) {
        shift.paused = false;
      }
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('pause-game', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift && shift.players.length === 1) {
      shift.paused = true;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('resume-game', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift && shift.players.length === 1) {
      shift.paused = false;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('collect-scrap', async (data) => {
    const { shiftId, scrapId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const scrap = shift.scraps.find(s => s.id === scrapId);
    if (scrap) {
      const player = shift.players.find(p => p.userId === socket.userId);
      if (player) {
        // Calculate scrap value with bonuses
        const scrapBonus = player.boosts.reduce((sum, b) => sum + (b.effect.scrapBonus || 0), 0);
        const scrapValue = scrap.value + scrapBonus;
        player.totalScrap += scrapValue;
        player.scrap += scrapValue;
        if (player.scrap >= player.pickupThreshold) {
          player.previousPickupThreshold = player.pickupThreshold;
          player.pickupThreshold += Math.ceil(player.pickupThreshold * 0.35);
          const boosts = generateRandomBoosts(3);
          player.boostChoices = { id: Date.now().toString(), options: boosts };
          io.to(shiftId).emit('boost-choice', { playerId: player.userId, choices: boosts });
          if (shift.players.length === 1) {
            shift.paused = true;
          }
        }
      }
      shift.scraps = shift.scraps.filter(s => s !== scrap);
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('pause-shift', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    shift.paused = true;
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('resume-shift', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    shift.paused = false;
    if (shift.waveState === 'lunch') {
      shift.waveState = 'spawning';
      shift.waveTimer = 0;
    }
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('set-pause', async (data) => {
    const { shiftId, paused } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    shift.paused = paused;
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('forfeit-shift', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const player = shift.players.find(p => p.userId === userId);
    if (!player) return;
    const scrapEarned = player.totalScrap;
    const wavesCompleted = shift.wave - 1;
    const fullCredits = Math.floor((scrapEarned * wavesCompleted + shift.enemiesDefeated) / 100);
    let credits = Math.floor(fullCredits * 0.8);
    if (shift.players.length > 1) {
      credits = Math.floor(credits * 1.1);
    }
    const user = await User.findById(userId);
    if (user) {
      user.credits += credits;
      await user.save();
    }
    // Remove player from shift
    shift.players = shift.players.filter(p => p.userId !== userId);
    // If no players left, end the shift
    if (shift.players.length === 0) {
      shift.status = 'ended';
      if (activeShifts[shiftId]) {
        clearInterval(activeShifts[shiftId].intervalId);
        delete activeShifts[shiftId];
      }
    }
    await shift.save();
    socket.leave(shiftId);
    io.to(shiftId).emit('shift-update', shift);
    // Do not emit 'game-over' for forfeit, as alert is shown locally
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    const shiftId = socketToShift[socket.id];
    if (shiftId) {
      const shift = await Shift.findOne({ id: shiftId });
      if (shift && shift.status === 'active' && shift.players.length === 1) {
        console.log(`Stopping single-player shift ${shiftId} due to disconnect`);
        shift.status = 'ended';
        await shift.save();
        if (activeShifts[shiftId]) {
          clearInterval(activeShifts[shiftId].intervalId);
          delete activeShifts[shiftId];
        }
      }
      delete socketToShift[socket.id];
    }
  });
});

function generateRandomBoosts(count) {
  const boostPool = [
    // One-time boosts
    { type: 'weapon-heal', rarity: 'common', description: 'Heal all your weapons to full HP', effect: { healWeapons: true } },
    { type: 'waste-destroy', rarity: 'rare', description: 'Destroy all enemies on the map', effect: { destroyWaste: true } },
    { type: 'enemy-freeze', rarity: 'uncommon', description: 'Freeze all enemies for 5 seconds', effect: { freezeEnemies: true } },
    { type: 'scrap-suck', rarity: 'uncommon', description: 'Collect all scrap on the map', effect: { suckScrap: true } },
    // Permanent boosts
    { type: 'hp-boost', rarity: 'common', description: 'Increase weapon HP by 20%', effect: { hpMult: 1.2 } },
    { type: 'range-boost', rarity: 'uncommon', description: 'Increase weapon range by 20%', effect: { rangeMult: 1.2 } },
    { type: 'power-boost', rarity: 'rare', description: 'Increase weapon power by 15%', effect: { powerMult: 1.15 } },
    { type: 'cooldown-boost', rarity: 'uncommon', description: 'Reduce weapon cooldown by 10%', effect: { cooldownMult: 0.9 } },
    { type: 'knockback-boost', rarity: 'common', description: 'Increase weapon HP by 20%', effect: { knockbackMult: 1.2 } },
    { type: 'scrap-boost', rarity: 'rare', description: '+1 scrap per pickup', effect: { scrapBonus: 1 } },
    { type: 'pickup-boost', rarity: 'uncommon', description: 'Increase pickup radius by 20%', effect: { pickupRadiusMult: 1.2 } },
    { type: 'heat-dissipate', rarity: 'common', description: 'Increase heat dissipation by 0.2', effect: { heatDissipate: 0.2 } },
    { type: 'heat-resist', rarity: 'uncommon', description: 'Increase heat resistance by 10', effect: { heatResistBonus: 10 } }
  ];

  const selected = [];
  const shuffled = [...boostPool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    selected.push(shuffled[i]);
  }
  return selected;
}

async function gameLoop(shiftId) {
  const shift = await Shift.findOne({ id: shiftId });
  if (!shift || shift.status !== 'active') return;

  if (shift.paused) {
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
    return;
  }

  // Check if any player has boost choices pending
  if (shift.players.some(p => p.boostChoices)) {
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
    return;
  }

  // Ensure scrap is set
  shift.players.forEach(player => {
    if (typeof player.scrap !== 'number' || isNaN(player.scrap)) player.scrap = 0;
  });

  const currentWave = shift.waves[shift.currentWaveIndex];
  if (!currentWave) {
    shift.status = 'ended';
    return;
  }
  shift.waveTimer += 1/30;
  if (shift.waveState === 'spawning') {
    shift.spawnTimer += 1/30;
    if (shift.spawnTimer >= currentWave.spawnInterval && shift.enemiesSpawned < currentWave.numEnemies) {
      const active = shift.activeEntries;
      if (active.length > 0) {
        const entryIndex = active[Math.floor(Math.random() * active.length)];
        const pathId = entryIndex;
        const pathData = shift.map.corePaths[pathId];
        if (pathData && pathData.squares && pathData.squares.length > 0) {
          const startSquare = pathData.squares[0];
          let enemyX = startSquare.x * shift.cellSize + shift.cellSize / 2;
          let enemyY = startSquare.y * shift.cellSize + shift.cellSize / 2;
          enemyX = Math.max(0, Math.min(shift.worldWidth - shift.cellSize, enemyX));
          enemyY = Math.max(0, Math.min(shift.worldHeight - shift.cellSize, enemyY));
          
          // Generate waste using new system
          const isBoss = (shift.currentWaveIndex + 1) % 5 === 0 && shift.enemiesSpawned === 0; // First enemy of every 5th wave is boss
          const waste = generateWaste(shift.currentWaveIndex + 1, isBoss);
          waste.x = enemyX;
          waste.y = enemyY;
          waste.pathId = pathId;
          waste.pathIndex = 0;
          waste.health = waste.hp; // Ensure health is set
          
          console.log(`${new Date().toISOString()} Spawning ${waste.rarity} waste: ${waste.name}, HP=${waste.hp}, size=${waste.gridWidth}x${waste.gridHeight}, position=(${enemyX}, ${enemyY}), spawner=entry${entryIndex}`);
          shift.enemies.push(waste);
          shift.enemiesSpawned++;
          shift.spawnTimer = 0;
        }
      }
    }
    if (shift.enemiesSpawned >= currentWave.numEnemies) {
      shift.waveState = 'delay';
      shift.waveTimer = 0;
    }
  } else if (shift.waveState === 'delay') {
    if (shift.waveTimer >= 10) {
      shift.currentWaveIndex++;
      const nextWave = shift.waves[shift.currentWaveIndex];
      if (nextWave) {
        shift.activeEntries = nextWave.activeEntries;
        shift.phase = nextWave.phase;
        shift.waveInPhase = nextWave.waveInPhase;
        shift.wave = shift.currentWaveIndex + 1;
        shift.waveState = 'spawning';
        shift.waveTimer = 0;
        shift.spawnTimer = 0;
        shift.enemiesSpawned = 0;
        if (shift.currentWaveIndex % 5 === 0) {
          shift.waveState = 'break';
        }
      } else {
        shift.status = 'ended';
      }
    }
  }

  // Simulate enemies moving along path
  shift.enemies.forEach(enemy => {
    if (isNaN(enemy.x) || isNaN(enemy.y)) {
      shift.enemies = shift.enemies.filter(e => e !== enemy);
      return;
    }
    
    // Upgrade old enemy data to new format if needed
    if (!enemy.name || !enemy.rarity) {
      const upgradedWaste = generateWaste(shift.currentWaveIndex + 1, false);
      Object.assign(enemy, {
        name: upgradedWaste.name,
        rarity: upgradedWaste.rarity,
        rarityColor: upgradedWaste.rarityColor,
        material: upgradedWaste.material,
        materialWeakTo: upgradedWaste.materialWeakTo,
        materialResistantTo: upgradedWaste.materialResistantTo,
        gridWidth: enemy.size || 1,
        gridHeight: enemy.size || 1,
        size: (enemy.size || 1) * (enemy.size || 1),
        toughness: upgradedWaste.toughness,
        density: upgradedWaste.density,
        value: upgradedWaste.value,
        specialAbility: upgradedWaste.specialAbility,
        specialAbilityData: upgradedWaste.specialAbilityData,
        maxHP: enemy.health || 10,
        hp: enemy.health || 10
      });
    }
    
    // Apply regeneration
    applyRegeneration(enemy, 0.1); // 100ms = 0.1 seconds
    
    // Apply toxic effect to nearby weapons
    applyToxicEffect(enemy, shift.weapons);
    
    if (Date.now() < shift.freezeEnd) return; // Frozen
    const pathData = shift.map.corePaths[enemy.pathId];
    if (!pathData || !pathData.squares) return; // Invalid path
    const path = pathData.squares;
    
    // Apply speed modifier for fast enemies
    const speed = enemy.specialAbilityData?.speedModifier ? 1 * enemy.specialAbilityData.speedModifier : 1;
    let nextIndex = enemy.pathIndex + 1;
    if (nextIndex < path.length) {
      let nextSquare = path[nextIndex];
      let targetX = nextSquare.x * shift.cellSize + shift.cellSize / 2;
      let targetY = nextSquare.y * shift.cellSize + shift.cellSize / 2;
      let dx = targetX - enemy.x;
      let dy = targetY - enemy.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) {
        enemy.pathIndex = nextIndex;
      } else {
        enemy.x += (dx / dist) * speed;
        enemy.y += (dy / dist) * speed;
      }
    } else {
      // reached end, move to pit
      if (!enemy.reachedPit) {
        enemy.reachedPit = true;
        enemy.pathIndex = path.length;
        // Reduce overflow by waste size (1x1 = 1, 2x2 = 4, 3x3 = 9)
        const wasteSize = enemy.size || (enemy.gridWidth * enemy.gridHeight) || 1;
        shift.overflow -= wasteSize;
        
        // Assign pit slot and position
        const pitFilled = shift.enemies.filter(e => e.reachedPit && e.pitSlot >= 0).length;
        if (pitFilled < shift.pitMaxFill) {
          enemy.pitSlot = pitFilled;
          // Position in pit grid (4 wide, 5 tall = 20 slots)
          const slotX = pitFilled % 4;
          const slotY = Math.floor(pitFilled / 4);
          enemy.x = (shift.map.pit.x + slotX) * shift.cellSize + shift.cellSize / 2;
          enemy.y = (shift.map.pit.y + slotY) * shift.cellSize + shift.cellSize / 2;
        }
        
        console.log(`Enemy reached pit: id=${enemy.id}, slot=${enemy.pitSlot}, overflow=${shift.overflow}`);
      }
    }
  });

  // Simulate weapons firing
  shift.weapons.forEach(weapon => {
    const player = shift.players.find(p => p.userId === weapon.playerId);
    let effectiveStats = { ...weapon.stats };
    if (player && player.boosts) {
      player.boosts.forEach(boost => {
        if (boost.effect.cooldownMult) effectiveStats.cooldown *= boost.effect.cooldownMult;
        if (boost.effect.powerMult) effectiveStats.power = Math.floor(effectiveStats.power * boost.effect.powerMult);
        if (boost.effect.heatResistBonus) effectiveStats.heatResist += boost.effect.heatResistBonus;
        if (boost.effect.rangeMult) effectiveStats.range = Math.floor(effectiveStats.range * boost.effect.rangeMult);
        if (boost.effect.hpMult) effectiveStats.hp = Math.floor(effectiveStats.hp * boost.effect.hpMult);
        if (boost.effect.knockbackMult) effectiveStats.knockback = Math.floor(effectiveStats.knockback * boost.effect.knockbackMult);
      });
    }
    const now = Date.now();
    if (now - weapon.lastFired > effectiveStats.cooldown) {
      // Find nearest enemy in range (excluding those in pit)
      const nearest = shift.enemies.find(e => {
        if (e.reachedPit) return false; // Don't target waste in pit
        const dist = Math.sqrt((e.x - weapon.x)**2 + (e.y - weapon.y)**2);
        return dist <= effectiveStats.range;
      });
      if (nearest) {
        if (weapon.type === 'missile-launcher') {
          // Launch 3 homing missiles
          for (let i = 0; i < 3; i++) {
            shift.projectiles.push({
              id: Date.now().toString() + i,
              x: weapon.x,
              y: weapon.y,
              targetId: nearest.id,
              speed: 1,
              damage: Math.floor(effectiveStats.power / 3),
              playerId: weapon.playerId,
              knockback: effectiveStats.knockback
            });
          }
        } else {
          // Instant damage
          nearest.health -= effectiveStats.power;
          if (nearest.health > 0) {
            nearest.pathIndex = Math.max(0, nearest.pathIndex - effectiveStats.knockback);
            const pathData = shift.map.corePaths[nearest.pathId];
            const newSquare = pathData.squares[nearest.pathIndex];
            nearest.x = newSquare.x * shift.cellSize + shift.cellSize / 2;
            nearest.y = newSquare.y * shift.cellSize + shift.cellSize / 2;
          }
          if (nearest.health <= 0) {
            let scrapGain = 1;
            if (player && player.boosts) {
              player.boosts.forEach(boost => {
                if (boost.effect.scrapMult) scrapGain = Math.floor(scrapGain * boost.effect.scrapMult);
              });
            }
            shift.scraps.push({ id: Date.now().toString() + Math.random(), x: Math.max(0, Math.min(shift.worldWidth, nearest.x + (Math.random() - 0.5) * 20)), y: Math.max(0, Math.min(shift.worldHeight, nearest.y + (Math.random() - 0.5) * 20)), value: scrapGain });
            shift.enemiesDefeated += 1;
            shift.enemies = shift.enemies.filter(e => e !== nearest);
          }
          // Emit weapon fired event
          io.to(shiftId).emit('weapon-fired', { weaponId: weapon.id, targetId: nearest.id, damage: effectiveStats.power });
        }
        weapon.lastFired = now;
        shift.heat += effectiveStats.heatGen;
      }
    }
  });

  // Heat damage and cooling
  let heatDissipate = 0.5;
  shift.players.forEach(player => {
    if (player.boosts) {
      player.boosts.forEach(boost => {
        if (boost.effect.heatDissipate) heatDissipate += boost.effect.heatDissipate;
      });
    }
  });
  shift.heat = Math.max(0, shift.heat - heatDissipate);
  if (shift.heat > 100) {
    shift.weapons.forEach(w => {
      const player = shift.players.find(p => p.userId === w.playerId);
      let resist = w.stats.heatResist;
      if (player && player.boosts) {
        player.boosts.forEach(boost => {
          if (boost.effect.heatResistBonus) resist += boost.effect.heatResistBonus;
        });
      }
      if (shift.heat > resist) {
        w.hp -= 1;
        if (w.hp <= 0) {
          shift.weapons = shift.weapons.filter(ww => ww !== w);
        }
      }
    });
  }

  // Move projectiles
  shift.projectiles.forEach(p => {
    const target = shift.enemies.find(e => e.id === p.targetId);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p.speed) {
        // Hit - calculate damage with material resistances
        const actualDamage = calculateDamage(target, p.damage, p.weaponType || 'physical');
        target.health -= actualDamage;
        target.hp = target.health; // Keep hp in sync
        
        if (target.health > 0) {
          // Apply knockback based on density
          const knockbackAmount = Math.floor(p.knockback / (target.density || 1));
          target.pathIndex = Math.max(0, target.pathIndex - knockbackAmount);
          const pathData = shift.map.corePaths[target.pathId];
          if (pathData && pathData.squares && pathData.squares[target.pathIndex]) {
            const newSquare = pathData.squares[target.pathIndex];
            target.x = newSquare.x * shift.cellSize + shift.cellSize / 2;
            target.y = newSquare.y * shift.cellSize + shift.cellSize / 2;
          }
        }
        if (target.health <= 0) {
          // Handle special abilities on death
          const newEnemies = handleWasteDeath(target, shift);
          if (newEnemies) {
            newEnemies.forEach(ne => {
              ne.x = target.x;
              ne.y = target.y;
              ne.pathId = target.pathId;
              ne.pathIndex = target.pathIndex;
              shift.enemies.push(ne);
            });
          }
          
          // Award scrap based on waste value
          let scrapGain = target.value || 1;
          const player = shift.players.find(pl => pl.userId === p.playerId);
          if (player && player.boosts) {
            const scrapBonus = player.boosts.reduce((sum, b) => sum + (b.effect.scrapBonus || 0), 0);
            scrapGain += scrapBonus;
          }
          shift.scraps.push({ id: Date.now().toString() + Math.random(), x: Math.max(0, Math.min(shift.worldWidth, target.x + (Math.random() - 0.5) * 20)), y: Math.max(0, Math.min(shift.worldHeight, target.y + (Math.random() - 0.5) * 20)), value: scrapGain });
          shift.enemiesDefeated += 1;
          shift.enemies = shift.enemies.filter(e => e !== target);
        }
        shift.projectiles = shift.projectiles.filter(pp => pp !== p);
      } else {
        p.x += (dx / dist) * p.speed;
        p.y += (dy / dist) * p.speed;
      }
    } else {
      // Target dead
      shift.projectiles = shift.projectiles.filter(pp => pp !== p);
    }
  });

  // Check win/lose
  if (shift.overflow <= 0) {
    shift.status = 'ended';
    // Clear boost choices
    shift.players.forEach(p => p.boostChoices = null);
    // Calculate credits for each player
    for (const player of shift.players) {
      const scrapEarned = player.scrap - 0;
      const wavesCompleted = shift.wave - 1;
      let credits = Math.floor((scrapEarned * wavesCompleted + shift.enemiesDefeated) / 100);
      if (shift.players.length > 1) {
        credits = Math.floor(credits * 1.1);
      }
      const user = await User.findById(player.userId);
      if (user) {
        user.credits += credits;
        await user.save();
      }
      io.to(shiftId).emit('game-over', { playerId: player.userId, credits });
    }
    // Stop the game loop
    if (activeShifts[shiftId]) {
      clearInterval(activeShifts[shiftId].intervalId);
      delete activeShifts[shiftId];
    }
  }

  await shift.save();
  io.to(shiftId).emit('shift-update', shift);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function assignPlayerPositions(pit, numPlayers, cellSize, worldWidth, worldHeight, pathSquares) {
  const positions = [];
  const pitCenterX = (pit.x + pit.width / 2) * cellSize;
  const pitCenterY = (pit.y + pit.height / 2) * cellSize;
  const pathSet = new Set(pathSquares.map(s => `${s.x},${s.y}`));
  for (let i = 0; i < numPlayers; i++) {
    const angle = (i / numPlayers) * 2 * Math.PI;
    let dist = 50; // pixels
    let x, y, gx, gy;
    do {
      x = pitCenterX + Math.cos(angle) * dist;
      y = pitCenterY + Math.sin(angle) * dist;
      x = Math.max(0, Math.min(worldWidth, x));
      y = Math.max(0, Math.min(worldHeight, y));
      gx = Math.floor(x / cellSize);
      gy = Math.floor(y / cellSize);
      dist += 10; // increase distance if on path
    } while (pathSet.has(`${gx},${gy}`));
    positions.push({ x, y });
  }
  return positions;
}

function isValidPath(pathSquares) {
  const n = pathSquares.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) { // skip consecutive
      const dx = Math.abs(pathSquares[i].x - pathSquares[j].x);
      const dy = Math.abs(pathSquares[i].y - pathSquares[j].y);
      if (dx + dy == 1) { // prevent side-adjacent (shared side)
        return false;
      }
    }
  }
  return true;
}

function generateSimpleMap(gridWidth, gridHeight) {
  // Fallback: create simple straight paths when meandering fails
  const pitWidth = 4;
  const pitHeight = 5;
  const centerX = Math.floor(gridWidth / 2);
  const centerY = Math.floor(gridHeight / 2);
  
  const pit = {
    x: centerX - Math.floor(pitWidth / 2),
    y: centerY - Math.floor(pitHeight / 2),
    width: pitWidth,
    height: pitHeight
  };
  
  const pitCenter = { x: pit.x + Math.floor(pitWidth / 2), y: pit.y + Math.floor(pitHeight / 2) };
  
  // Create 3 simple straight paths from edges to pit sides
  const entries = [
    { start: { x: 0, y: centerY }, end: { x: pit.x - 1, y: centerY } }, // Left to left side of pit
    { start: { x: gridWidth - 1, y: centerY }, end: { x: pit.x + pitWidth, y: centerY } }, // Right to right side of pit
    { start: { x: centerX, y: 0 }, end: { x: centerX, y: pit.y - 1 } } // Top to top side of pit
  ];
  
  const corePaths = [];
  const allCoreSquares = new Set();
  const entryToMainPath = [0, 1, 2]; // Each of the 3 entries is its own main path
  
  entries.forEach((entryData, idx) => {
    const path = [];
    const current = {...entryData.start};
    const target = entryData.end;
    
    // Simple direct path to pit edge
    while (current.x !== target.x || current.y !== target.y) {
      path.push({...current});
      if (current.x < target.x) current.x++;
      else if (current.x > target.x) current.x--;
      else if (current.y < target.y) current.y++;
      else if (current.y > target.y) current.y--;
    }
    path.push({...target});
    
    const pathColor = `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
    corePaths.push({squares: path, color: pathColor, id: idx});
    path.forEach(sq => allCoreSquares.add(`${sq.x},${sq.y}`));
  });
  
  // Widen paths
  const widenedSet = new Set();
  for (const sqStr of allCoreSquares) {
    const [x, y] = sqStr.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight && 
            !(nx >= pit.x && nx < pit.x + pit.width && ny >= pit.y && ny < pit.y + pit.height)) {
          widenedSet.add(`${nx},${ny}`);
        }
      }
    }
  }
  
  const pathSquares = Array.from(widenedSet).map(s => {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  });
  
  // Extract just the start positions for entries
  const entriesOutput = entries.map(e => e.start);
  
  console.log('Generated simple fallback map with 3 straight paths');
  return { pit, entries: entriesOutput, pathSquares, corePaths, entryToMainPath };
}

function generateMap(gridWidth, gridHeight, depth = 0) {
  // Place pit at center of map
  const pitWidth = 4;
  const pitHeight = 5;
  const centerX = Math.floor(gridWidth / 2);
  const centerY = Math.floor(gridHeight / 2);
  
  const pit = {
    x: centerX - Math.floor(pitWidth / 2),
    y: centerY - Math.floor(pitHeight / 2),
    width: pitWidth,
    height: pitHeight
  };
  
  // Create 4 starting points on the pit edges (one per side)
  const pitStarts = [
    { x: pit.x + Math.floor(pitWidth / 2), y: pit.y - 1, side: 'top' },       // Top
    { x: pit.x + pitWidth, y: pit.y + Math.floor(pitHeight / 2), side: 'right' }, // Right
    { x: pit.x + Math.floor(pitWidth / 2), y: pit.y + pitHeight, side: 'bottom' }, // Bottom
    { x: pit.x - 1, y: pit.y + Math.floor(pitHeight / 2), side: 'left' }      // Left
  ];
  
  console.log(`Generating 3 paths with branches outward from pit at (${pit.x},${pit.y})`);
  
  const corePaths = [];
  const allCoreSquares = new Set();
  const entries = []; // Will be the endpoints where waste spawns
  const entryToMainPath = []; // Maps entry index to main path index (0, 1, or 2)
  let pathIdCounter = 0;
  let successfulMainPaths = 0;
  
  // Generate 3 main paths, each with 0-2 branches
  const mainPathIndices = [0, 1, 2]; // Use top, right, bottom
  for (let i = 0; i < mainPathIndices.length; i++) {
    const mainPathIndex = mainPathIndices[i];
    const pitStart = pitStarts[mainPathIndex];
    
    // Generate main path
    const mainPath = generateOutwardPath(pitStart, pit, gridWidth, gridHeight, allCoreSquares);
    
    if (mainPath && mainPath.length >= 30) {
      console.log(`Main path ${i} (${pitStart.side}): length=${mainPath.length}`);
      
      // Store original path for branching (before reversing)
      const originalMainPath = [...mainPath];
      
      // Reverse a COPY of the path so it goes from endpoint to pit
      const reversedMainPath = [...mainPath].reverse();
      const spawnPoint = reversedMainPath[0];
      entries.push(spawnPoint);
      entryToMainPath.push(successfulMainPaths); // Track which main path this entry belongs to
      
      const pathColor = `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
      corePaths.push({squares: reversedMainPath, color: pathColor, id: pathIdCounter++});
      reversedMainPath.forEach(sq => allCoreSquares.add(`${sq.x},${sq.y}`));
      successfulMainPaths++;
      
      // Decide how many branches (0-2)
      const numBranches = Math.floor(Math.random() * 3); // 0, 1, or 2
      console.log(`  Creating ${numBranches} branches for main path ${i}`);
      
      // Create branches at points along the main path
      for (let b = 0; b < numBranches; b++) {
        // Pick a branch point (30-70% along the original path)
        const branchIndex = Math.floor(originalMainPath.length * (0.3 + Math.random() * 0.4));
        const branchStart = originalMainPath[branchIndex];
        
        console.log(`  Branch ${b} starting from (${branchStart.x},${branchStart.y})`);
        
        // Generate branch path
        const branchPath = generateBranchPath(branchStart, pit, gridWidth, gridHeight, allCoreSquares);
        
        if (branchPath && branchPath.length >= 20) {
          const reversedBranch = branchPath.reverse();
          const branchSpawnPoint = reversedBranch[0];
          entries.push(branchSpawnPoint);
          entryToMainPath.push(successfulMainPaths - 1); // Branch belongs to the current main path (which was just incremented)
          
          corePaths.push({squares: reversedBranch, color: pathColor, id: pathIdCounter++});
          reversedBranch.forEach(sq => allCoreSquares.add(`${sq.x},${sq.y}`));
          console.log(`  Branch ${b}: length=${branchPath.length}, endpoint=(${branchSpawnPoint.x},${branchSpawnPoint.y})`);
        } else {
          console.log(`  Branch ${b} failed: length=${branchPath ? branchPath.length : 0}`);
        }
      }
    } else {
      console.log(`Main path ${i} (${pitStart.side}) failed: length=${mainPath ? mainPath.length : 0}`);
    }
  }
  
  // If we don't have at least 3 valid MAIN paths, regenerate
  if (successfulMainPaths < 3) {
    console.log(`Only ${successfulMainPaths} main paths generated (total paths: ${corePaths.length}), regenerating map...`);
    if (depth > 10) {
      console.error('Max recursion depth reached, using fallback simple paths');
      return generateSimpleMap(gridWidth, gridHeight);
    }
    return generateMap(gridWidth, gridHeight, depth + 1);
  }
  
  console.log(`Successfully generated ${corePaths.length} outward paths`);
  
  // Widen to 3x3 around all core squares, excluding pit
  const widenedSet = new Set();
  for (const sqStr of allCoreSquares) {
    const [x, y] = sqStr.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight && 
            !(nx >= pit.x && nx < pit.x + pit.width && ny >= pit.y && ny < pit.y + pit.height)) {
          widenedSet.add(`${nx},${ny}`);
        }
      }
    }
  }
  
  const pathSquares = Array.from(widenedSet).map(s => {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  });
  
  return { pit, entries, pathSquares, corePaths, entryToMainPath };
}

function generateBranchPath(start, pit, gridWidth, gridHeight, existingPathSquares) {
  // Generate a branch path from a point on an existing path
  const path = [{x: start.x, y: start.y}];
  const visited = new Set([`${start.x},${start.y}`]);
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  
  const pitCenter = { x: pit.x + Math.floor(pit.width / 2), y: pit.y + Math.floor(pit.height / 2) };
  let current = {x: start.x, y: start.y};
  let currentDir = -1;
  let stepsInCurrentDir = 0;
  
  // Initial direction: away from pit center
  const dx = start.x - pitCenter.x;
  const dy = start.y - pitCenter.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    currentDir = dx > 0 ? 1 : 3; // right or left
  } else {
    currentDir = dy > 0 ? 0 : 2; // down or up
  }
  
  const targetLength = 30 + Math.floor(Math.random() * 30); // 30-60 cells (shorter than main paths)
  const maxSteps = 150;
  let steps = 0;
  const minStepsBeforeTurn = 3;
  const minDistanceFromOldPath = 5;
  
  const isValid = (x, y) => {
    // Must be in bounds (with 3-cell buffer) and not in pit
    const padding = 3;
    if (x < padding || x >= gridWidth - padding || y < padding || y >= gridHeight - padding) return false;
    if (x >= pit.x && x < pit.x + pit.width && y >= pit.y && y < pit.y + pit.height) return false;
    if (visited.has(`${x},${y}`)) return false;
    
    // Check distance from older parts of THIS path
    if (path.length > minDistanceFromOldPath + 5) {
      for (let i = 0; i < path.length - minDistanceFromOldPath; i++) {
        const oldCell = path[i];
        const distance = Math.abs(x - oldCell.x) + Math.abs(y - oldCell.y);
        if (distance < minDistanceFromOldPath) {
          return false;
        }
      }
    }
    
    return true;
  };
  
  const getAwayFromPit = () => {
    const dx = current.x - pitCenter.x;
    const dy = current.y - pitCenter.y;
    const options = [];
    if (dx > 0) options.push(1);
    if (dx < 0) options.push(3);
    if (dy > 0) options.push(0);
    if (dy < 0) options.push(2);
    return options;
  };
  
  while (steps < maxSteps && path.length < targetLength) {
    steps++;
    let nextDir = -1;
    const rand = Math.random();
    
    if (path.length < 10) {
      const awayDirs = getAwayFromPit();
      const validAwayDirs = awayDirs.filter(dir => {
        const [dx, dy] = dirs[dir];
        return isValid(current.x + dx, current.y + dy);
      });
      if (validAwayDirs.length > 0) {
        nextDir = validAwayDirs[Math.floor(Math.random() * validAwayDirs.length)];
      }
    } else if (rand < 0.6 || stepsInCurrentDir < minStepsBeforeTurn) {
      if (currentDir >= 0) {
        const [dx, dy] = dirs[currentDir];
        if (isValid(current.x + dx, current.y + dy)) {
          nextDir = currentDir;
        }
      }
    } else if (rand < 0.85 && stepsInCurrentDir >= minStepsBeforeTurn) {
      if (currentDir >= 0) {
        const turnDir = Math.random() < 0.5 ? 1 : -1;
        const newDir = (currentDir + turnDir + 4) % 4;
        const [dx, dy] = dirs[newDir];
        if (isValid(current.x + dx, current.y + dy)) {
          nextDir = newDir;
        }
      }
    }
    
    if (nextDir === -1) {
      const validDirs = dirs
        .map((d, i) => ({dir: i, x: current.x + d[0], y: current.y + d[1]}))
        .filter(d => isValid(d.x, d.y));
      
      if (validDirs.length === 0) {
        return path.length >= 20 ? path : null;
      }
      
      const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
      nextDir = chosen.dir;
    }
    
    const [dx, dy] = dirs[nextDir];
    current = {x: current.x + dx, y: current.y + dy};
    path.push({...current});
    visited.add(`${current.x},${current.y}`);
    
    if (nextDir === currentDir) {
      stepsInCurrentDir++;
    } else {
      stepsInCurrentDir = 1;
      currentDir = nextDir;
    }
  }
  
  return path.length >= 20 ? path : null;
}

function generateOutwardPath(start, pit, gridWidth, gridHeight, existingPathSquares) {
  // Generate path growing outward from pit edge
  const path = [{x: start.x, y: start.y}];
  const visited = new Set([`${start.x},${start.y}`]);
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // down, right, up, left
  
  const pitCenter = { x: pit.x + Math.floor(pit.width / 2), y: pit.y + Math.floor(pit.height / 2) };
  let current = {x: start.x, y: start.y};
  let currentDir = -1; // Will be set based on starting side
  let stepsInCurrentDir = 0; // Track how many steps in current direction
  
  // Determine initial direction based on which side of pit we're starting from
  if (start.side === 'top') currentDir = 2; // up (away from pit)
  else if (start.side === 'bottom') currentDir = 0; // down
  else if (start.side === 'left') currentDir = 3; // left
  else if (start.side === 'right') currentDir = 1; // right
  
  const targetLength = 50 + Math.floor(Math.random() * 30); // 50-80 cells
  const maxSteps = 200;
  let steps = 0;
  const minStepsBeforeTurn = 3; // Minimum straight path before allowing turns
  const minDistanceFromOldPath = 5; // Minimum distance from older parts of path
  
  const isValid = (x, y) => {
    // Must be in bounds (with 3-cell buffer) and not in pit
    const padding = 3;
    if (x < padding || x >= gridWidth - padding || y < padding || y >= gridHeight - padding) return false;
    if (x >= pit.x && x < pit.x + pit.width && y >= pit.y && y < pit.y + pit.height) return false;
    
    // Can't revisit exact same cell
    if (visited.has(`${x},${y}`)) return false;
    
    // Check distance from older parts of the path (not recent path)
    // This prevents tight loops while allowing normal meandering
    if (path.length > minDistanceFromOldPath + 5) {
      for (let i = 0; i < path.length - minDistanceFromOldPath; i++) {
        const oldCell = path[i];
        const distance = Math.abs(x - oldCell.x) + Math.abs(y - oldCell.y); // Manhattan distance
        if (distance < minDistanceFromOldPath) {
          return false; // Too close to old part of path
        }
      }
    }
    
    return true;
  };
  
  const getAwayFromPit = () => {
    // Direction that moves away from pit center
    const dx = current.x - pitCenter.x;
    const dy = current.y - pitCenter.y;
    const options = [];
    if (dx > 0) options.push(1); // right (away from pit if we're on right side)
    if (dx < 0) options.push(3); // left
    if (dy > 0) options.push(0); // down
    if (dy < 0) options.push(2); // up
    return options;
  };
  
  while (steps < maxSteps && path.length < targetLength) {
    steps++;
    
    let nextDir = -1;
    const rand = Math.random();
    
    if (path.length < 10) {
      // First 10 steps: move away from pit
      const awayDirs = getAwayFromPit();
      const validAwayDirs = awayDirs.filter(dir => {
        const [dx, dy] = dirs[dir];
        return isValid(current.x + dx, current.y + dy);
      });
      if (validAwayDirs.length > 0) {
        nextDir = validAwayDirs[Math.floor(Math.random() * validAwayDirs.length)];
      }
    } else if (rand < 0.6 || stepsInCurrentDir < minStepsBeforeTurn) {
      // 60% - Continue same direction OR forced to continue if haven't met minimum
      if (currentDir >= 0) {
        const [dx, dy] = dirs[currentDir];
        if (isValid(current.x + dx, current.y + dy)) {
          nextDir = currentDir;
        }
      }
    } else if (rand < 0.85 && stepsInCurrentDir >= minStepsBeforeTurn) {
      // 25% - Turn 90 degrees (only if we've moved at least minStepsBeforeTurn)
      if (currentDir >= 0) {
        const turnDir = Math.random() < 0.5 ? 1 : -1;
        const newDir = (currentDir + turnDir + 4) % 4;
        const [dx, dy] = dirs[newDir];
        if (isValid(current.x + dx, current.y + dy)) {
          nextDir = newDir;
        }
      }
    }
    // 15% - Random valid direction (creates loops and wild paths)
    
    // If no direction chosen, pick any valid direction
    if (nextDir === -1) {
      const validDirs = dirs
        .map((d, i) => ({dir: i, x: current.x + d[0], y: current.y + d[1]}))
        .filter(d => isValid(d.x, d.y));
      
      if (validDirs.length === 0) {
        // Dead end - return what we have
        console.log(`Outward path hit dead end at (${current.x},${current.y}), length=${path.length}`);
        return path.length >= 30 ? path : null;
      }
      
      const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
      nextDir = chosen.dir;
    }
    
    // Move in chosen direction
    const [dx, dy] = dirs[nextDir];
    current = {x: current.x + dx, y: current.y + dy};
    path.push({...current});
    visited.add(`${current.x},${current.y}`);
    
    // Track direction changes
    if (nextDir === currentDir) {
      stepsInCurrentDir++;
    } else {
      stepsInCurrentDir = 1; // Reset counter on direction change
      currentDir = nextDir;
    }
  }
  
  return path.length >= 30 ? path : null;
}

function generatePath(start, end, gridWidth, gridHeight) {
  // Goal-biased meandering path generator
  const path = [{x: start.x, y: start.y}];
  const visited = new Set([`${start.x},${start.y}`]);
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // down, right, up, left
  
  let current = {x: start.x, y: start.y};
  let currentDir = -1; // No initial direction
  const maxSteps = 500;
  let steps = 0;
  
  const isValid = (x, y) => {
    return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight && !visited.has(`${x},${y}`);
  };
  
  const getTowardsGoal = () => {
    const dx = end.x - current.x;
    const dy = end.y - current.y;
    const options = [];
    if (dx > 0) options.push(1); // right
    if (dx < 0) options.push(3); // left
    if (dy > 0) options.push(0); // down
    if (dy < 0) options.push(2); // up
    return options;
  };
  
  while (steps < maxSteps && (current.x !== end.x || current.y !== end.y)) {
    steps++;
    
    const distToEnd = Math.abs(current.x - end.x) + Math.abs(current.y - end.y);
    
    // Decide action based on distance and randomness
    let nextDir = -1;
    
    if (distToEnd <= 3) {
      // Close to end - go direct
      const goalDirs = getTowardsGoal();
      for (const dir of goalDirs) {
        const [dx, dy] = dirs[dir];
        if (isValid(current.x + dx, current.y + dy)) {
          nextDir = dir;
          break;
        }
      }
    } else {
      const rand = Math.random();
      
      if (rand < 0.6) {
        // 60% - Move towards goal
        const goalDirs = getTowardsGoal();
        const validGoalDirs = goalDirs.filter(dir => {
          const [dx, dy] = dirs[dir];
          return isValid(current.x + dx, current.y + dy);
        });
        if (validGoalDirs.length > 0) {
          nextDir = validGoalDirs[Math.floor(Math.random() * validGoalDirs.length)];
        }
      } else if (rand < 0.85) {
        // 25% - Continue same direction (straightaway)
        if (currentDir >= 0) {
          const [dx, dy] = dirs[currentDir];
          if (isValid(current.x + dx, current.y + dy)) {
            nextDir = currentDir;
          }
        }
      } else {
        // 15% - Turn 90 degrees (curve)
        if (currentDir >= 0) {
          const turnDir = Math.random() < 0.5 ? 1 : -1;
          const newDir = (currentDir + turnDir + 4) % 4;
          const [dx, dy] = dirs[newDir];
          if (isValid(current.x + dx, current.y + dy)) {
            nextDir = newDir;
          }
        }
      }
    }
    
    // If no direction chosen, pick any valid direction
    if (nextDir === -1) {
      const validDirs = dirs
        .map((d, i) => ({dir: i, x: current.x + d[0], y: current.y + d[1]}))
        .filter(d => isValid(d.x, d.y));
      
      if (validDirs.length === 0) {
        // Dead end - backtrack not implemented, return what we have
        console.log(`Path generation dead end at (${current.x},${current.y}), length=${path.length}`);
        return path.length >= 20 ? path : null;
      }
      
      // Prefer directions towards goal
      const goalDirs = getTowardsGoal();
      const goalValid = validDirs.filter(d => goalDirs.includes(d.dir));
      
      if (goalValid.length > 0) {
        const chosen = goalValid[Math.floor(Math.random() * goalValid.length)];
        nextDir = chosen.dir;
      } else {
        const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
        nextDir = chosen.dir;
      }
    }
    
    // Move in chosen direction
    const [dx, dy] = dirs[nextDir];
    current = {x: current.x + dx, y: current.y + dy};
    path.push({...current});
    visited.add(`${current.x},${current.y}`);
    currentDir = nextDir;
  }
  
  // Check if we reached the goal
  if (current.x === end.x && current.y === end.y) {
    return path;
  }
  
  console.log(`Path failed to reach goal, ended at (${current.x},${current.y}), length=${path.length}`);
  return path.length >= 30 ? path : null;
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  push([cost, key]) {
    this.heap.push([cost, key]);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 1) return this.heap.pop();
    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._sinkDown(0);
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index][0] >= this.heap[parentIndex][0]) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  _sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let smallest = index;
      if (left < length && this.heap[left][0] < this.heap[smallest][0]) smallest = left;
      if (right < length && this.heap[right][0] < this.heap[smallest][0]) smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}
