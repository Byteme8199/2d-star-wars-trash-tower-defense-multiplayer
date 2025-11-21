const RARITIES = {
  common: { chance: 0.6, color: '#ffffff', multiplier: 1 },
  uncommon: { chance: 0.25, color: '#00ff00', multiplier: 1.5 },
  rare: { chance: 0.1, color: '#0080ff', multiplier: 2 },
  epic: { chance: 0.04, color: '#8000ff', multiplier: 3 },
  legendary: { chance: 0.01, color: '#ff8000', multiplier: 5 }
};

const WEAPON_TYPES = {
  'laser-cutter': {
    name: 'Laser Cutter',
    baseStats: { damage: 10, range: 100, fireRate: 1000, knockback: 0 },
    description: 'Basic laser weapon'
  },
  'blaster': {
    name: 'Blaster',
    baseStats: { damage: 15, range: 120, fireRate: 800, knockback: 5 },
    description: 'Standard blaster'
  },
  'ion-cannon': {
    name: 'Ion Cannon',
    baseStats: { damage: 20, range: 150, fireRate: 1200, knockback: 10 },
    description: 'Slow but powerful'
  },
  'turret': {
    name: 'Turret',
    baseStats: { damage: 12, range: 80, fireRate: 600, knockback: 2 },
    description: 'Rapid fire turret'
  },
  'sniper': {
    name: 'Sniper',
    baseStats: { damage: 50, range: 200, fireRate: 2000, knockback: 15 },
    description: 'Long range precision'
  }
};

const BOOST_TYPES = {
  'damage': {
    name: 'Damage Boost',
    description: 'Increases weapon damage by 50%',
    effect: (weapon) => { weapon.stats.damage *= 1.5; }
  },
  'range': {
    name: 'Range Boost',
    description: 'Increases weapon range by 50%',
    effect: (weapon) => { weapon.stats.range *= 1.5; }
  },
  'fire-rate': {
    name: 'Fire Rate Boost',
    description: 'Increases weapon fire rate by 50%',
    effect: (weapon) => { weapon.stats.fireRate *= 0.5; }
  },
  'knockback': {
    name: 'Knockback Boost',
    description: 'Increases weapon knockback by 50%',
    effect: (weapon) => { weapon.stats.knockback *= 1.5; }
  },
  'health': {
    name: 'Health Boost',
    description: 'Increases weapon health by 50%',
    effect: (weapon) => { weapon.hp *= 1.5; }
  },
  'pickup-radius': {
    name: 'Pickup Radius Boost',
    description: 'Increases scrap pickup radius by 50%',
    effect: (player) => { player.pickupRadius *= 1.5; }
  },
  'pickup-threshold': {
    name: 'Pickup Threshold Boost',
    description: 'Decreases scrap pickup threshold by 50%',
    effect: (player) => { player.pickupThreshold *= 0.5; }
  }
};

const ADJECTIVES = {
  common: ['Basic', 'Standard', 'Ordinary', 'Plain', 'Simple'],
  uncommon: ['Improved', 'Enhanced', 'Upgraded', 'Refined', 'Advanced'],
  rare: ['Superior', 'Elite', 'Master', 'Expert', 'Proficient'],
  epic: ['Legendary', 'Mythical', 'Epic', 'Heroic', 'Divine'],
  legendary: ['Ultimate', 'Supreme', 'Transcendent', 'Ascended', 'Godlike']
};

function getRandomRarity() {
  const rand = Math.random();
  let cumulative = 0;
  for (const [rarity, data] of Object.entries(RARITIES)) {
    cumulative += data.chance;
    if (rand <= cumulative) return rarity;
  }
  return 'common';
}

function generateWeapon(type) {
  const rarity = getRandomRarity();
  const baseStats = WEAPON_TYPES[type].baseStats;
  const stats = { ...baseStats };
  const multiplier = RARITIES[rarity].multiplier;
  stats.damage *= multiplier;
  stats.range *= multiplier;
  stats.fireRate /= multiplier;
  stats.knockback *= multiplier;
  const adjective = ADJECTIVES[rarity][Math.floor(Math.random() * ADJECTIVES[rarity].length)];
  return {
    type,
    stats,
    rarity,
    adjective,
    hp: 100 * multiplier,
    heat: 0,
    lastFired: 0
  };
}

function generateBoost() {
  const types = Object.keys(BOOST_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  return { type, ...BOOST_TYPES[type] };
}

function generateRandomBoosts(count) {
  const boosts = [];
  for (let i = 0; i < count; i++) {
    boosts.push(generateBoost());
  }
  return boosts;
}

function assignPlayerPositions(players, map) {
  const positions = [];
  // Assuming map has path points, assign positions along the path
  const path = map.path || [];
  if (path.length > 0) {
    const spacing = path.length / (players.length + 1);
    for (let i = 0; i < players.length; i++) {
      const index = Math.floor((i + 1) * spacing);
      positions.push({ x: path[index].x, y: path[index].y });
    }
  } else {
    // Fallback to grid positions
    const cols = Math.ceil(Math.sqrt(players.length));
    for (let i = 0; i < players.length; i++) {
      positions.push({ x: (i % cols) * 100 + 50, y: Math.floor(i / cols) * 100 + 50 });
    }
  }
  return positions;
}

function isValidPath(map, x, y) {
  // Simple check if position is on path or near it
  const path = map.path || [];
  for (const point of path) {
    if (Math.abs(point.x - x) < 20 && Math.abs(point.y - y) < 20) return true;
  }
  return false;
}

function generateMap() {
  const map = { path: [] };
  // Generate a simple path from left to right
  for (let i = 0; i < 10; i++) {
    map.path.push({ x: i * 80 + 40, y: 300 });
  }
  return map;
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  insert(value) {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin() {
    if (this.heap.length === 1) return this.heap.pop();
    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.sinkDown(0);
    return min;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex] <= this.heap[index]) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let smallest = index;
      if (left < length && this.heap[left] < this.heap[smallest]) smallest = left;
      if (right < length && this.heap[right] < this.heap[smallest]) smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

module.exports = {
  RARITIES,
  WEAPON_TYPES,
  BOOST_TYPES,
  ADJECTIVES,
  getRandomRarity,
  generateWeapon,
  generateBoost,
  generateRandomBoosts,
  assignPlayerPositions,
  isValidPath,
  generateMap,
  MinHeap
};