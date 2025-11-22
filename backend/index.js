const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

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
const userSchema = new mongoose.Schema({
  username: String,
  password: String, // In production, hash this
  credits: { type: Number, default: 0 },
  unlocks: [String], // e.g., ['jedi', 'laser-cutter']
  gear: [String], // equipped items
  level: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: false },
  toolbelt: [String] // weapon types for quick action bar
});

const User = mongoose.model('User', userSchema);

// Sub schemas
const enemySchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  health: Number,
  type: String,
  pathIndex: { type: Number, default: 0 }
});

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
  players: [{ userId: String, username: String, x: Number, y: Number, inventory: [Object], boosts: [Object], scrap: {type: Number, default: 0}, boostChoices: Object, lastPlaced: {type: Number, default: 0}, pickupRadius: {type: Number, default: 20}, pickupThreshold: {type: Number, default: 100}, previousPickupThreshold: {type: Number, default: 0} }],
  map: { type: Object, default: {} }, // e.g., path data
  wave: { type: Number, default: 1 },
  overflow: { type: Number, default: 100 },
  scrap: { type: Number, default: 0 },
  heat: { type: Number, default: 0 },
  enemies: [enemySchema],
  weapons: [weaponSchema],
  projectiles: [projectileSchema],
  scraps: [{ id: String, x: Number, y: Number, value: {type: Number, default: 10} }],
  status: { type: String, default: 'waiting' }, // waiting, active, ended
  ready: [{ userId: String }],
  enemiesDefeated: { type: Number, default: 0 },
  paused: { type: Boolean, default: false },
  boostThreshold: { type: Number, default: 100 },
  boostInterval: { type: Number, default: 100 },
  freezeEnd: { type: Number, default: 0 }
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

const WEAPON_TYPES = {
  'pressure-washer': {
    baseStats: { power: 50, cooldown: 1000, range: 50, shape: 'cone', gridSize: {w:1,h:1}, heatGen: 10, heatResist: 10, hp: 100, cost: 10, knockback: 1 },
    description: 'Shoots high-pressure water stream, damages and cools nearby weapons.'
  },
  'missile-launcher': {
    baseStats: { power: 100, cooldown: 3000, range: 180, shape: 'missile', gridSize: {w:2,h:2}, heatGen: 15, heatResist: 5, hp: 120, cost: 20, knockback: 2 },
    description: 'Launches 3 homing missiles that track and destroy enemies.'
  },
  'laser-cutter': {
    baseStats: { power: 30, cooldown: 800, range: 60, shape: 'line', gridSize: {w:1,h:3}, heatGen: 5, heatResist: 8, hp: 80, cost: 15, knockback: 1 },
    description: 'Emits focused beam of energy that slices through enemies.'
  },
  'waste-escape-pod': {
    baseStats: { power: 10, cooldown: 2000, range: 30, shape: 'circle', gridSize: {w:4,h:4}, heatGen: 2, heatResist: 15, hp: 150, cost: 20, knockback: 3 },
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

function generateRandomBoosts(count) {
  const types = Object.keys(BOOST_TYPES);
  const shuffled = types.sort(() => 0.5 - Math.random());
  const selectedTypes = shuffled.slice(0, count);
  return selectedTypes.map(type => {
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
    return { type, rarity, effect, description: BOOST_TYPES[type].description };
  });
}

function generateWeapon(specificType = null) {
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
    if (!user.toolbelt || user.toolbelt.length === 0) {
      user.toolbelt = ['pressure-washer'];
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

// Routes for shifts
app.post('/create-shift', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Creating shift for userId:', userId);
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'User not found' });
    const shiftId = 'shift-' + Date.now();
    const shift = new Shift({ id: shiftId, players: [{ userId, username: user.username, x: 400, y: 300 }], ready: [] });
    console.log('Generating map...');
    const map = generateMap();
    console.log('Generated map start:', map.startPos, 'end:', map.endPos, 'path length:', map.pathSquares.length, 'last square:', map.pathSquares[map.pathSquares.length - 1]);
    if (!map.pathSquares.some(s => s.x === map.endPos.x && s.y === map.endPos.y)) {
      console.error('Path did not reach end!');
    }
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
  shift.players.push({ userId, username: (await User.findById(userId)).username, x: 400, y: 300 });
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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-shift', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    socket.userId = userId;
    socket.join(shiftId);
    // Start game loop if not already running and status is active
    if (!activeShifts[shiftId] && shift.status === 'active') {
      activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
    }
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('place-weapon', async (data) => {
    const { shiftId, x, y, type, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const player = shift.players.find(p => p.userId === userId);
    if (!player) return;
    const now = Date.now();
    const cooldown = 1000; // 1 second cooldown
    if (now - player.lastPlaced < cooldown) return; // On cooldown
    // Generate weapon based on type
    const weaponData = generateWeapon(type);
    let gx = Math.floor(x / 10);
    let gy = Math.floor(y / 10);
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
        let wx = Math.floor(w.x / 10) - Math.floor(wGridSize.w / 2);
        let wy = Math.floor(w.y / 10) - Math.floor(wGridSize.h / 2);
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

  socket.on('start-shift', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift) {
      shift.status = 'active';
      await shift.save();
      // Start loop if not running
      if (!activeShifts[shiftId]) {
        activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
      }
      io.to(shiftId).emit('shift-started', shift);
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
        const positions = assignPlayerPositions(shift.map.pathSquares, shift.players.length);
        shift.players.forEach((p, i) => {
          p.x = positions[i].x;
          p.y = positions[i].y;
          if (!p.inventory || p.inventory.length === 0) {
            const toolbelt = (user && user.toolbelt) || ['pressure-washer', 'pressure-washer', 'pressure-washer'];
            p.inventory = toolbelt.map(type => generateWeapon(type));
          }
          p.boosts = []; // Start with no boosts
          p.scrap = 0; // Starting scrap
          p.pickupRadius = 30; // Default pickup radius
          p.pickupThreshold = 100; // Boost threshold
          p.previousPickupThreshold = 0; // Previous threshold
        });
        shift.status = 'active';
        await shift.save();
        if (!activeShifts[shiftId]) {
          activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
        }
        io.to(shiftId).emit('shift-started', shift);
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
      if (chosen.type === 'weapon-heal') {
        // Heal all damaged weapons for this player
        shift.weapons.forEach(w => {
          if (w.playerId === player.userId && w.hp < w.stats.hp) {
            w.hp = w.stats.hp;
          }
        });
      } else if (chosen.type === 'waste-destroy') {
        // Destroy all enemies
        shift.enemies = [];
      } else if (chosen.type === 'enemy-freeze') {
        // Freeze enemies for 5 seconds
        shift.freezeEnd = Date.now() + 5000;
      } else if (chosen.type === 'scrap-suck') {
        // Collect all scraps
        shift.scraps.forEach(s => {
          player.scrap += s.value;
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
        player.scrap += scrap.value;
        if (player.scrap >= player.pickupThreshold) {
          player.previousPickupThreshold = player.pickupThreshold;
          player.pickupThreshold += 100;
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

  socket.on('forfeit-shift', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    const player = shift.players.find(p => p.userId === userId);
    if (!player) return;
    const scrapEarned = player.scrap - 0;
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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Handle player leaving shift
  });
});

async function gameLoop(shiftId) {
  const shift = await Shift.findOne({ id: shiftId });
  if (!shift || shift.status !== 'active') return;

  if (shift.paused) {
    await shift.save();
    io.to(shiftId).emit('shift-update', shift);
    return;
  }

  // Ensure scrap is set
  shift.players.forEach(player => {
    if (typeof player.scrap !== 'number' || isNaN(player.scrap)) player.scrap = 0;
  });

  // Spawn enemies
  if (Math.random() < 0.02) { // 2% chance per frame to spawn (~1.2 per second at 60 FPS)
    const startSquare = shift.map.pathSquares[0];
    let enemyX = startSquare.x * 10 + 5;
    let enemyY = startSquare.y * 10 + 5;
    if (isNaN(enemyX) || isNaN(enemyY)) {
      enemyX = 5;
      enemyY = 305;
    }
    shift.enemies.push({
      id: Date.now().toString(),
      x: enemyX,
      y: enemyY,
      pathIndex: 0,
      health: 100 + (shift.wave - 1) * 20
    });
  }

  // Simulate enemies moving along path
  shift.enemies.forEach(enemy => {
    if (isNaN(enemy.x) || isNaN(enemy.y)) {
      shift.enemies = shift.enemies.filter(e => e !== enemy);
      return;
    }
    if (Date.now() < shift.freezeEnd) return; // Frozen
    let nextIndex = enemy.pathIndex + 1;
    if (nextIndex < shift.map.pathSquares.length) {
      let nextSquare = shift.map.pathSquares[nextIndex];
      let targetX = nextSquare.x * 10 + 5;
      let targetY = nextSquare.y * 10 + 5;
      let dx = targetX - enemy.x;
      let dy = targetY - enemy.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2) {
        enemy.pathIndex = nextIndex;
      } else {
        enemy.x += (dx / dist) * 2;
        enemy.y += (dy / dist) * 2;
      }
    } else {
      // reached end
      shift.overflow -= 10;
      shift.enemies = shift.enemies.filter(e => e !== enemy);
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
      // Find nearest enemy in range
      const nearest = shift.enemies.find(e => {
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
              speed: 3,
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
            const newSquare = shift.map.pathSquares[nearest.pathIndex];
            nearest.x = newSquare.x * 10 + 5;
            nearest.y = newSquare.y * 10 + 5;
          }
          if (nearest.health <= 0) {
            let scrapGain = 10;
            if (player && player.boosts) {
              player.boosts.forEach(boost => {
                if (boost.effect.scrapMult) scrapGain = Math.floor(scrapGain * boost.effect.scrapMult);
              });
            }
            shift.scraps.push({ id: Date.now().toString() + Math.random(), x: Math.max(0, Math.min(800, nearest.x + (Math.random() - 0.5) * 20)), y: Math.max(0, Math.min(600, nearest.y + (Math.random() - 0.5) * 20)), value: scrapGain });
            shift.enemiesDefeated += 1;
            shift.wave = Math.floor(shift.enemiesDefeated / 10) + 1;
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
        // Hit
        target.health -= p.damage;
        if (target.health > 0) {
          target.pathIndex = Math.max(0, target.pathIndex - p.knockback);
          const newSquare = shift.map.pathSquares[target.pathIndex];
          target.x = newSquare.x * 10 + 5;
          target.y = newSquare.y * 10 + 5;
        }
        if (target.health <= 0) {
          let scrapGain = 10;
          const player = shift.players.find(pl => pl.userId === p.playerId);
          if (player && player.boosts) {
            player.boosts.forEach(boost => {
              if (boost.effect.scrapMult) scrapGain = Math.floor(scrapGain * boost.effect.scrapMult);
            });
          }
          shift.scraps.push({ id: Date.now().toString() + Math.random(), x: Math.max(0, Math.min(800, target.x + (Math.random() - 0.5) * 20)), y: Math.max(0, Math.min(600, target.y + (Math.random() - 0.5) * 20)), value: scrapGain });
          shift.enemiesDefeated += 1;
          shift.wave = Math.floor(shift.enemiesDefeated / 10) + 1;
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

function assignPlayerPositions(pathSquares, numPlayers) {
  const positions = [];
  for (let i = 0; i < numPlayers; i++) {
    const pathLength = pathSquares.length;
    const anchorIndex = Math.floor(Math.random() * pathLength);
    const anchor = pathSquares[anchorIndex];
    const side = i % 2 === 0 ? -1 : 1; // -1 for above, 1 for below
    let placed = false;
    for (let offset = 5; offset <= 15 && !placed; offset++) {
      const candidateY = anchor.y + side * offset;
      if (candidateY >= 0 && candidateY < 60) {
        const onPath = pathSquares.some(s => s.x === anchor.x && s.y === candidateY);
        if (!onPath) {
          positions.push({ x: anchor.x * 10 + 5, y: candidateY * 10 + 5 });
          placed = true;
        }
      }
    }
    if (!placed) {
      // Fallback to center
      positions.push({ x: 400, y: 300 });
    }
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

function generateMap() {
  const gridWidth = 80;
  const gridHeight = 60;
  let pathSquares;
  let startPos;
  let endPos;
  // Generate start and end on border
  startPos = { x: 0, y: Math.floor(Math.random() * gridHeight) };
  endPos = { x: gridWidth - 1, y: Math.floor(Math.random() * gridHeight) };
  // Dijkstra with min 5 and max 10 straight runs
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 0: up, 1: right, 2: down, 3: left
  const dist = new Map();
  const cameFrom = new Map();
  const visited = new Set();
  const startKey = `${startPos.x},${startPos.y},-1,0`;
  dist.set(startKey, 0);
  cameFrom.set(startKey, null);
  const pq = new MinHeap();
  pq.push([0, startKey]);
  let found = false;
  let endKey = null;
  while (!pq.isEmpty()) {
    const [cost, current] = pq.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const [cx, cy, cdir, csteps] = current.split(',').map((v, i) => i < 2 ? Number(v) : (i === 2 ? (v === '-1' ? -1 : Number(v)) : Number(v)));
    if (cx === endPos.x && cy === endPos.y) {
      found = true;
      endKey = current;
      break;
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
        const newdir = dirs.findIndex(d => d[0] === dx && d[1] === dy);
        let canMove = false;
        let newsteps;
        if (cdir === -1) {
          // First move, any direction
          canMove = true;
          newsteps = 1;
        } else if (newdir === cdir) {
          // Continuing straight
          if (csteps < 10) {
            canMove = true;
            newsteps = csteps + 1;
          }
        } else {
          // Turning
          if (csteps >= 5) {
            canMove = true;
            newsteps = 1;
          }
        }
        if (canMove) {
          const newCost = cost + 1 + Math.random() * 2;
          const nkey = `${nx},${ny},${newdir},${newsteps}`;
          if (!dist.has(nkey) || newCost < dist.get(nkey)) {
            dist.set(nkey, newCost);
            cameFrom.set(nkey, current);
            pq.push([newCost, nkey]);
          }
        }
      }
    }
  }
  if (!found) {
    // Fallback
    pathSquares = [startPos];
  } else {
    // Reconstruct path
    pathSquares = [];
    let current = endKey;
    while (current) {
      const [x, y] = current.split(',').slice(0, 2).map(Number);
      pathSquares.unshift({ x, y });
      current = cameFrom.get(current);
    }
  }
  return { startPos, endPos, pathSquares };
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