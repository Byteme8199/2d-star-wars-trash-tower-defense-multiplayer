// utils.js - Utility functions and constants

// Game constants
const GAME_CONSTANTS = {
  cellSize: 10,
  gridWidth: 80,
  gridHeight: 60,
  placementCooldown: 1000,
  moveThrottle: 100,
  heatThreshold: 100,
};

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
    description: 'Launches a homing missile that explodes on impact, dealing area damage.'
  },
  'laser-cutter': {
    baseStats: { power: 30, cooldown: 800, range: 60, shape: 'line', gridSize: {w:1,h:3}, heatGen: 5, heatResist: 8, hp: 80, cost: 15, knockback: 1 },
    description: 'Emits focused beam of energy that slices through enemies.'
  },
  'waste-escape-pod': {
    baseStats: { power: 10, cooldown: 2000, range: 30, shape: 'circle', gridSize: {w:4,h:4}, heatGen: 2, heatResist: 15, hp: 150, cost: 20, knockback: 3 },
    description: 'Launches pods that explode on impact, dealing area damage.'
  },
  'flame-thrower': {
    baseStats: { power: 20, cooldown: 500, range: 40, shape: 'cone', gridSize: {w:1,h:1}, heatGen: 20, heatResist: 5, hp: 90, cost: 25, knockback: 0 },
    description: 'Sprays flames that damage enemies over time.'
  },
  'railgun': {
    baseStats: { power: 200, cooldown: 5000, range: 200, shape: 'line', gridSize: {w:3,h:1}, heatGen: 25, heatResist: 10, hp: 140, cost: 30, knockback: 5 },
    description: 'Fires high-velocity projectiles with massive damage.'
  }
};

const WEAPON_BASE_STATS = {};
for (let type in WEAPON_TYPES) {
  WEAPON_BASE_STATS[type] = WEAPON_TYPES[type].baseStats;
}

const ADJECTIVES = {
  'rapid-fire': { effect: { cooldown: 0.8 } },
  'high-capacity': { effect: { hp: 1.2 } },
  'freezing': { effect: { power: 1.1 }, special: 'slows enemies' }
};

const WEAPON_GRID_SIZES = {
  'pressure-washer': {w:1,h:1},
  'missile-launcher': {w:2,h:2},
  'laser-cutter': {w:1,h:3},
  'waste-escape-pod': {w:4,h:4},
  'flame-thrower': {w:1,h:1},
  'railgun': {w:3,h:1}
};

function generateWeapon(specificType = null) {
  let type;
  if (specificType) {
    type = specificType;
  } else {
    const types = Object.keys(WEAPON_TYPES);
    type = types[Math.floor(Math.random() * types.length)];
  }
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
  const base = WEAPON_TYPES[type].baseStats;
  const mod = RARITIES[rarity].modifier;
  const stats = {
    power: Math.floor(base.power * mod),
    cooldown: Math.floor(base.cooldown / mod),
    range: base.range,
    shape: base.shape,
    gridSize: base.gridSize,
    heatGen: base.heatGen,
    heatResist: Math.floor(base.heatResist * mod),
    hp: Math.floor(base.hp * mod),
    cost: base.cost,
    knockback: Math.floor(base.knockback * mod)
  };
  let adjective = null;
  if (Math.random() < 0.3) {
    const adjKeys = Object.keys(ADJECTIVES);
    adjective = adjKeys[Math.floor(Math.random() * adjKeys.length)];
    const adjEffect = ADJECTIVES[adjective].effect;
    for (const [stat, mult] of Object.entries(adjEffect)) {
      stats[stat] = Math.floor(stats[stat] * mult);
    }
  }
  return { type, rarity, stats, adjective };
}

function getWeaponIcon(type) {
  const icons = {
    'pressure-washer': 'PW',
    'missile-launcher': 'ML',
    'laser-cutter': 'LC',
    'waste-escape-pod': 'WEP',
    'flame-thrower': 'FT',
    'railgun': 'RG'
  };
  return icons[type] || type;
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

function showMessage(message) {
  document.getElementById('message-text').textContent = message;
  document.getElementById('message-modal').style.display = 'block';
  document.getElementById('message-modal').style.zIndex = '10000';
  if (window.gameInstance) window.gameInstance.canvas.style.pointerEvents = 'none';
  document.getElementById('game-container').style.pointerEvents = 'none';
}

const WEAPON_UNLOCK_PRICES = {
  'missile-launcher': 500,
  'laser-cutter': 300,
  'waste-escape-pod': 1000,
  'flame-thrower': 700,
  'railgun': 1500
};

// Make constants globally available
window.GAME_CONSTANTS = GAME_CONSTANTS;
window.RARITIES = RARITIES;
window.WEAPON_TYPES = WEAPON_TYPES;
window.WEAPON_GRID_SIZES = WEAPON_GRID_SIZES;
window.WEAPON_UNLOCK_PRICES = WEAPON_UNLOCK_PRICES;
window.generateWeapon = generateWeapon;