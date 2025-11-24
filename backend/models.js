const mongoose = require('mongoose');

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
  pathIndex: { type: Number, default: 0 },
  reachedPit: { type: Boolean, default: false }
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
  overflow: { type: Number, default: 1000 },
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

module.exports = { User, Shift, GlobalState };