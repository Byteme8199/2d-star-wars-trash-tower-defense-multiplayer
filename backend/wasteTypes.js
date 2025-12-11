// Waste/Enemy type definitions and generation

const MATERIALS = {
  ORGANIC: {
    name: 'Organic',
    names: ['Bantha Dung', 'Rotten Food', 'Decomposed Matter', 'Sludge Pile', 'Mystery Goop'],
    weakTo: ['bio-cleaner', 'incinerator'],
    resistantTo: ['laser', 'electric']
  },
  METAL: {
    name: 'Metal',
    names: ['Trash Can', 'Blaster Parts', 'Starship Plating', 'Carbonite Block', 'Droid Chassis', 'Speeder Debris'],
    weakTo: ['laser', 'electric', 'magnetic'],
    resistantTo: ['bio-cleaner', 'physical']
  },
  CHEMICAL: {
    name: 'Chemical',
    names: ['Toxic Waste', 'Coolant Leak', 'Acid Barrel', 'Fuel Spill', 'Reactor Sludge'],
    weakTo: ['neutralizer', 'incinerator'],
    resistantTo: ['water', 'bio-cleaner']
  },
  MIXED: {
    name: 'Mixed',
    names: ['Garbage Pile', 'Junk Heap', 'Debris Cluster', 'Scrap Bundle', 'Waste Amalgam'],
    weakTo: [],
    resistantTo: []
  }
};

const RARITIES = {
  COMMON: {
    name: 'Common',
    statMultiplier: 1.0,
    valueMultiplier: 1.0,
    spawnWeight: 100,
    color: 0x888888
  },
  UNCOMMON: {
    name: 'Uncommon',
    statMultiplier: 1.5,
    valueMultiplier: 1.5,
    spawnWeight: 50,
    color: 0x00FF00
  },
  RARE: {
    name: 'Rare',
    statMultiplier: 2.0,
    valueMultiplier: 3.0,
    spawnWeight: 20,
    color: 0x0088FF
  },
  EPIC: {
    name: 'Epic',
    statMultiplier: 3.0,
    valueMultiplier: 5.0,
    spawnWeight: 10,
    color: 0xAA00FF
  },
  LEGENDARY: {
    name: 'Legendary',
    statMultiplier: 5.0,
    valueMultiplier: 10.0,
    spawnWeight: 5,
    color: 0xFFAA00
  },
  BOSS: {
    name: 'Boss',
    statMultiplier: 10.0,
    valueMultiplier: 20.0,
    spawnWeight: 0, // Spawned manually
    color: 0xFF0000
  }
};

const SPECIAL_ABILITIES = {
  SPLIT: {
    name: 'Splitting',
    description: 'Splits into 2 smaller enemies on death'
  },
  REGENERATING: {
    name: 'Regenerating',
    description: 'Heals 5% max HP per second'
  },
  ARMORED: {
    name: 'Armored',
    description: 'Takes 50% less damage',
    damageModifier: 0.5
  },
  FAST: {
    name: 'Swift',
    description: 'Moves 50% faster',
    speedModifier: 1.5
  },
  EXPLOSIVE: {
    name: 'Explosive',
    description: 'Deals damage to nearby weapons on death'
  },
  TOXIC: {
    name: 'Toxic',
    description: 'Increases weapon heat on proximity'
  }
};

// Base stats for waste by size (using max dimension)
const BASE_STATS_BY_SIZE = {
  1: { hp: 10, toughness: 0, density: 1.0, value: 1 },
  2: { hp: 25, toughness: 2, density: 1.5, value: 3 },
  3: { hp: 50, toughness: 5, density: 2.0, value: 6 }
};

/**
 * Generate a random waste enemy
 * @param {number} waveNumber - Current wave (affects stats)
 * @param {boolean} isBoss - Whether to generate a boss
 * @returns {object} Waste enemy object
 */
function generateWaste(waveNumber = 1, isBoss = false) {
  // Select rarity based on spawn weights
  let rarity;
  if (isBoss) {
    rarity = RARITIES.BOSS;
  } else {
    const rarityList = Object.values(RARITIES).filter(r => r.spawnWeight > 0);
    const totalWeight = rarityList.reduce((sum, r) => sum + r.spawnWeight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const rarityData of rarityList) {
      roll -= rarityData.spawnWeight;
      if (roll <= 0) {
        rarity = rarityData;
        break;
      }
    }
    if (!rarity) rarity = RARITIES.COMMON;
  }

  // Select material
  const materialKeys = Object.keys(MATERIALS);
  const material = MATERIALS[materialKeys[Math.floor(Math.random() * materialKeys.length)]];

  // Select size (larger sizes for higher rarities and bosses)
  const rarityIndex = Object.keys(RARITIES).indexOf(rarity.name);
  // Common: 1, Uncommon: 1-2, Rare: 1-2, Epic: 1-3, Legendary: 1-3, Boss: 2-3
  let maxSize;
  if (isBoss) {
    maxSize = 2 + Math.floor(Math.random() * 2); // 2 or 3
  } else if (rarityIndex === 0) {
    maxSize = 1; // Common always 1x1
  } else if (rarityIndex <= 2) {
    maxSize = Math.random() < 0.7 ? 1 : 2; // Uncommon/Rare: 70% 1x1, 30% 2x2
  } else {
    maxSize = Math.random() < 0.5 ? 2 : 3; // Epic/Legendary: 50% 2x2, 50% 3x3
  }
  const gridWidth = maxSize;
  const gridHeight = maxSize;
  const sizeKey = Math.max(gridWidth, gridHeight);

  // Get base stats
  const baseStats = BASE_STATS_BY_SIZE[sizeKey] || BASE_STATS_BY_SIZE[1];

  // Apply wave scaling (increases with wave number)
  const waveMultiplier = 1 + ((waveNumber - 1) * 0.2);

  // Calculate final stats
  const maxHP = Math.floor(baseStats.hp * rarity.statMultiplier * waveMultiplier);
  const toughness = Math.floor(baseStats.toughness * rarity.statMultiplier);
  const density = baseStats.density * (rarity.statMultiplier * 0.5);
  const value = Math.floor(baseStats.value * rarity.valueMultiplier);

  // Select special ability (higher chance for higher rarities)
  let specialAbility = null;
  const abilityChance = isBoss ? 1.0 : Math.min(0.5, rarityIndex * 0.15);
  if (Math.random() < abilityChance) {
    const abilityKeys = Object.keys(SPECIAL_ABILITIES);
    specialAbility = SPECIAL_ABILITIES[abilityKeys[Math.floor(Math.random() * abilityKeys.length)]];
  }

  // Generate name
  const materialName = material.names[Math.floor(Math.random() * material.names.length)];
  let name = `${material.name} ${materialName}`;
  if (specialAbility) {
    name += ` of ${specialAbility.name}`;
  }

  // Create waste object
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    name,
    rarity: rarity.name,
    rarityColor: rarity.color,
    material: material.name,
    materialWeakTo: material.weakTo,
    materialResistantTo: material.resistantTo,
    gridWidth,
    gridHeight,
    size: gridWidth * gridHeight, // Total grid cells occupied (for overflow)
    maxHP,
    health: maxHP,
    hp: maxHP,
    toughness, // Damage reduction
    density, // Knockback resistance
    value, // Scrap dropped
    specialAbility: specialAbility ? specialAbility.name : null,
    specialAbilityData: specialAbility,
    pathIndex: 0,
    pathId: 0,
    reachedPit: false,
    pitSlot: -1
  };
}

/**
 * Generate a wave of waste enemies
 * @param {number} waveNumber - Current wave number
 * @param {number} count - Number of enemies to generate
 * @returns {array} Array of waste enemies
 */
function generateWaveEnemies(waveNumber, count) {
  const enemies = [];
  
  // Chance for a mini-boss (1 per 5 waves starting at wave 5)
  const hasMiniBoss = waveNumber >= 5 && waveNumber % 5 === 0;
  
  if (hasMiniBoss) {
    enemies.push(generateWaste(waveNumber, true));
    count--; // One less regular enemy
  }

  for (let i = 0; i < count; i++) {
    enemies.push(generateWaste(waveNumber, false));
  }

  return enemies;
}

/**
 * Calculate damage dealt to waste considering material resistances and toughness
 * @param {object} waste - The waste enemy
 * @param {number} baseDamage - Base damage before modifiers
 * @param {string} weaponType - Type of weapon dealing damage
 * @returns {number} Final damage dealt
 */
function calculateDamage(waste, baseDamage, weaponType = 'physical') {
  let damage = baseDamage;

  // Apply special ability damage modifier
  if (waste.specialAbilityData?.damageModifier) {
    damage *= waste.specialAbilityData.damageModifier;
  }

  // Apply material resistances
  if (waste.materialWeakTo && waste.materialWeakTo.includes(weaponType)) {
    damage *= 1.5; // 50% more damage
  } else if (waste.materialResistantTo && waste.materialResistantTo.includes(weaponType)) {
    damage *= 0.5; // 50% less damage
  }

  // Apply toughness (flat damage reduction)
  damage = Math.max(1, damage - waste.toughness);

  return Math.floor(damage);
}

/**
 * Handle special ability effects on death
 * @param {object} waste - The dying waste
 * @param {object} shift - The shift object
 * @returns {array|null} New enemies to spawn (for split ability)
 */
function handleWasteDeath(waste, shift) {
  if (!waste.specialAbility) return null;

  switch (waste.specialAbility) {
    case 'Splitting':
      // Create 2 smaller versions at 50% size and HP
      const size = Math.max(1, Math.max(waste.gridWidth, waste.gridHeight) - 1);
      const newHP = Math.floor(waste.maxHP * 0.5);
      return [
        {
          ...waste,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          gridWidth: size,
          gridHeight: size,
          size: size * size,
          hp: newHP,
          health: newHP,
          maxHP: newHP,
          specialAbility: null,
          specialAbilityData: null,
          name: waste.name.replace(' of Splitting', '')
        },
        {
          ...waste,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9) + 'b',
          gridWidth: size,
          gridHeight: size,
          size: size * size,
          hp: newHP,
          health: newHP,
          maxHP: newHP,
          specialAbility: null,
          specialAbilityData: null,
          name: waste.name.replace(' of Splitting', '')
        }
      ];

    case 'Explosive':
      // Deal damage to weapons within 30 units
      const explosionRadius = 30;
      shift.weapons.forEach(weapon => {
        const dx = weapon.x - waste.x;
        const dy = weapon.y - waste.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= explosionRadius) {
          weapon.hp = Math.max(0, weapon.hp - 20);
        }
      });
      return null;

    default:
      return null;
  }
}

/**
 * Apply regeneration to waste
 * @param {object} waste - The waste to heal
 * @param {number} deltaTime - Time since last update (in seconds)
 */
function applyRegeneration(waste, deltaTime) {
  if (waste.specialAbility === 'Regenerating') {
    waste.hp = Math.min(waste.maxHP, waste.hp + (waste.maxHP * 0.05 * deltaTime));
    waste.health = waste.hp;
  }
}

/**
 * Apply toxic effect to nearby weapons
 * @param {object} waste - The toxic waste
 * @param {array} weapons - Array of weapons to check
 */
function applyToxicEffect(waste, weapons) {
  if (waste.specialAbility === 'Toxic') {
    weapons.forEach(weapon => {
      const dx = weapon.x - waste.x;
      const dy = weapon.y - waste.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 30 && weapon.heat !== undefined) {
        weapon.heat = Math.min(100, weapon.heat + 2);
      }
    });
  }
}

module.exports = {
  MATERIALS,
  RARITIES,
  SPECIAL_ABILITIES,
  generateWaste,
  generateWaveEnemies,
  calculateDamage,
  handleWasteDeath,
  applyRegeneration,
  applyToxicEffect
};
