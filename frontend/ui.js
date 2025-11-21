// ui.js - UI management functions

function populateToolbelt() {
  console.log('Populating toolbelt for user:', window.stateManager.currentUser);
  const inventoryItems = document.getElementById('inventory-items');
  if (!inventoryItems) {
    console.error('inventory-items element not found');
    return;
  }
  inventoryItems.innerHTML = '';
  const inventory = window.stateManager.currentUser.inventory || [];
  inventory.forEach(w => {
    const item = document.createElement('div');
    item.className = 'inventory-item';
    item.draggable = true;
    item.textContent = getWeaponIcon(w.type);
    item.style.borderColor = getRarityColor(w.rarity);
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify(w));
    });
    item.addEventListener('mouseover', (e) => showItemModal(w, e));
    item.addEventListener('mouseout', () => hideItemModal());
    inventoryItems.appendChild(item);
  });

  const toolbeltSlots = document.getElementById('toolbelt-slots');
  if (!toolbeltSlots) {
    console.error('toolbelt-slots element not found');
    return;
  }
  toolbeltSlots.innerHTML = '';
  let toolbelt = window.stateManager.currentUser.toolbelt || [];
  if (toolbelt.length === 0) {
    toolbelt = [generateWeapon('pressure-washer')];
  }
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'toolbelt-slot';
    const weapon = toolbelt[i];
    slot.textContent = weapon ? getWeaponIcon(weapon.type) : '';
    slot.dataset.weapon = weapon ? JSON.stringify(weapon) : '';
    slot.style.borderColor = weapon ? getRarityColor(weapon.rarity) : '#00ff00';
    if (i === window.stateManager.selectedIndex) slot.classList.add('selected');
    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const weapon = JSON.parse(e.dataTransfer.getData('text/plain'));
      slot.textContent = getWeaponIcon(weapon.type);
      slot.dataset.weapon = JSON.stringify(weapon);
      slot.style.borderColor = getRarityColor(weapon.rarity);
      toolbelt[i] = weapon;
    });
    slot.addEventListener('click', () => {
      window.stateManager.selectedIndex = i;
      updateToolbeltSelection();
    });
    slot.addEventListener('mouseover', (e) => {
      if (weapon) showItemModal(weapon, e);
    });
    slot.addEventListener('mouseout', () => hideItemModal());
    toolbeltSlots.appendChild(slot);
  }

  document.getElementById('credits').textContent = window.stateManager.currentUser.credits;
}

function showItemModal(weapon, event) {
  const modal = document.getElementById('item-modal');
  let desc;
  if (weapon.baseStats) {
    let name = weapon.type.replace(/-/g, ' ');
    if (weapon.adjective) {
      name += ' of ' + weapon.adjective.replace(/-/g, ' ');
    }
    desc = `<strong>${name}</strong><br>`;
    const player = window.stateManager.currentShift ? window.stateManager.currentShift.players.find(p => p.userId === window.stateManager.currentUser._id) : null;
    let effectiveStats = { ...weapon.baseStats };
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
    const stats = ['power', 'cooldown', 'range', 'hp', 'knockback'];
    stats.forEach(stat => {
      let current = effectiveStats[stat];
      let base = weapon.baseStats[stat];
      let bonus = current - base;
      let bonusText = bonus !== 0 ? ` (${bonus > 0 ? '+' : ''}${bonus})` : '';
      desc += `${stat.charAt(0).toUpperCase() + stat.slice(1)}: ${current}${bonusText}<br>`;
    });
      desc += (window.WEAPON_TYPES[weapon.type] || {}).description || 'No description available.';
  } else {
    let name = weapon.type.replace(/-/g, ' ');
    if (weapon.adjective) {
      name += ' of ' + weapon.adjective.replace(/-/g, ' ');
    }
    desc = `<strong>${name}</strong><br>`;
    const base = window.WEAPON_TYPES[weapon.type] ? window.WEAPON_TYPES[weapon.type].baseStats : null;
    if (base && weapon.stats) {
      const stats = ['power', 'cooldown', 'range', 'hp', 'knockback'];
      stats.forEach(stat => {
        let diff = weapon.stats[stat] - base[stat];
        let isBetter = (stat === 'cooldown') ? diff < 0 : diff > 0;
        let color = isBetter ? 'green' : diff === 0 ? 'white' : 'red';
        let arrow = isBetter ? '↑' : diff === 0 ? '' : '↓';
        let diffText = diff === 0 ? '' : ` (${diff > 0 ? '+' : ''}${diff}${arrow})`;
        desc += `${stat.charAt(0).toUpperCase() + stat.slice(1)}: <span style="color:${color}">${weapon.stats[stat]}${diffText}</span><br>`;
      });
    } else {
      desc += `Power: ${weapon.stats.power}, Cooldown: ${weapon.stats.cooldown}ms, Range: ${weapon.stats.range}<br>`;
    }
    desc += (window.WEAPON_TYPES[weapon.type] || {}).description || 'No description available.';
  }
  modal.innerHTML = desc;
  modal.style.left = (event.pageX + 10) + 'px';
  modal.style.top = (event.pageY - 100) + 'px';
  modal.style.display = 'block';
}

function hideItemModal() {
  document.getElementById('item-modal').style.display = 'none';
}

function updateGameToolbelt() {
  if (!window.stateManager.currentUser.toolbelt || window.stateManager.currentUser.toolbelt.length === 0) {
    window.stateManager.currentUser.toolbelt = [generateWeapon('pressure-washer')];
  }
  const slots = document.getElementById('game-toolbelt-slots');
  slots.innerHTML = '';
  const toolbelt = window.stateManager.currentUser.toolbelt || [];
  const player = window.stateManager.currentShift ? window.stateManager.currentShift.players.find(p => p.userId === window.stateManager.currentUser._id) : null;
  const cooldown = window.GAME_CONSTANTS.placementCooldown;
  const timeSince = player ? Date.now() - player.lastPlaced : 0;
  const timeLeft = Math.max(0, cooldown - timeSince);
  const progress = timeLeft / cooldown;
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'game-toolbelt-slot';
    const weapon = toolbelt[i];
    slot.textContent = weapon ? getWeaponIcon(weapon.type) : '';
    slot.dataset.type = weapon ? weapon.type : '';
    slot.style.borderColor = weapon ? getRarityColor(weapon.rarity) : '#00ff00';
    if (i === window.stateManager.selectedIndex) slot.classList.add('selected');
    slot.addEventListener('pointerdown', () => {
      if (weapon) {
        window.stateManager.selectedIndex = i;
        updateToolbeltSelection();
        updateGameToolbelt();
      }
    });
    slot.addEventListener('mouseover', (e) => {
      if (weapon) showItemModal(weapon, e);
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
    if (i === window.stateManager.selectedIndex) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });
  document.querySelectorAll('.game-toolbelt-slot').forEach((slot, i) => {
    if (i === window.stateManager.selectedIndex) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });
}

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
    button.style.height = '80px';
    button.style.width = '30%';
    const isOneTime = choice.effect.destroyWaste || choice.effect.healWeapons || choice.effect.freezeEnemies;
    button.style.border = isOneTime ? '2px solid #cccccc' : `2px solid ${getRarityColor(choice.rarity)}`;
    button.style.color = 'black';
    button.style.backgroundColor = 'white';
    button.style.cursor = 'pointer';
    button.style.wordWrap = 'break-word';
    button.style.whiteSpace = 'normal';
    button.onmouseover = () => {
      button.style.backgroundColor = '#f0f0f0';
    };
    button.onmouseout = () => {
      button.style.backgroundColor = 'white';
    };
    button.onclick = () => {
      window.stateManager.socket.emit('choose-boost', { shiftId: window.stateManager.currentShiftId, choiceIndex: index });
      modal.style.display = 'none';
      if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'auto';
      document.getElementById('game-container').style.pointerEvents = 'auto';
    };
    optionsDiv.appendChild(button);
  });
  modal.style.display = 'block';
  modal.style.zIndex = '10000';
  if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'none';
  document.getElementById('game-container').style.pointerEvents = 'none';
}

function populateLicenses() {
  const list = document.getElementById('license-list');
  list.innerHTML = '';
  Object.keys(window.WEAPON_TYPES).forEach(type => {
    const div = document.createElement('div');
    div.style.margin = '10px';
    div.style.padding = '10px';
    div.style.border = '1px solid #ffd700';
    div.textContent = type.replace('-', ' ').toUpperCase();
    if (type === 'pressure-washer' || (window.stateManager.currentUser.unlocks && window.stateManager.currentUser.unlocks.includes(type))) {
      div.innerHTML += ' (Unlocked)';
      div.style.backgroundColor = 'rgba(0,255,0,0.2)';
    } else {
      const price = window.WEAPON_UNLOCK_PRICES[type];
      if (price) {
        const btn = document.createElement('button');
        btn.textContent = `Unlock for ${price} credits`;
        btn.style.marginLeft = '10px';
        btn.onclick = async () => {
          const res = await fetch('http://localhost:3001/buy-unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: window.stateManager.currentUser._id, type })
          });
          const data = await res.json();
          if (res.ok) {
            window.stateManager.currentUser.unlocks = data.unlocks;
            window.stateManager.currentUser.credits = data.credits;
            populateLicenses();
            populateToolbelt();
          } else {
            showMessage(data.message);
          }
        };
        div.appendChild(btn);
      }
    }
    list.appendChild(div);
  });
}

function updateStartButton(shift) {
  const startBtn = document.getElementById('start-shift');
  if (!shift || !shift.map) {
    startBtn.disabled = true;
    startBtn.textContent = "Generating Map...";
  } else {
    if (shift.ready && shift.ready.some(r => r.userId === window.stateManager.currentUser._id)) {
      startBtn.textContent = "Waiting for others...";
      startBtn.disabled = true;
    } else {
      startBtn.textContent = "I'm Ready";
      startBtn.disabled = false;
    }
  }
}