// locker.js - Locker room and UI page management

function loadLockerRoomPage() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('nav').style.display = 'block';
  document.getElementById('locker-room').style.display = 'block';
  document.getElementById('tower-panel').style.display = 'none';
  document.getElementById('item-modal').style.display = 'none';
  document.getElementById('boost-modal').style.display = 'none';
  document.getElementById('show-boosts-modal').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('toolbelt-ui').style.display = 'none';
  document.getElementById('end-game-modal').style.display = 'none';
  document.getElementById('pause-modal').style.display = 'none';
  document.getElementById('message-modal').style.display = 'none';
  document.getElementById('scrap-bar-container').style.display = 'none';
  populateToolbelt();
  populateLicenses();
}

function loadTowerPanelPage() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('nav').style.display = 'block';
  document.getElementById('locker-room').style.display = 'none';
  document.getElementById('tower-panel').style.display = 'block';
  document.getElementById('item-modal').style.display = 'none';
  document.getElementById('boost-modal').style.display = 'none';
  document.getElementById('show-boosts-modal').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('toolbelt-ui').style.display = 'none';
  document.getElementById('end-game-modal').style.display = 'none';
  document.getElementById('pause-modal').style.display = 'none';
  document.getElementById('message-modal').style.display = 'none';
  document.getElementById('scrap-bar-container').style.display = 'none';
}

function loadGamePage() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('nav').style.display = 'none';
  document.getElementById('locker-room').style.display = 'none';
  document.getElementById('tower-panel').style.display = 'none';
  document.getElementById('item-modal').style.display = 'none';
  document.getElementById('boost-modal').style.display = 'none';
  document.getElementById('show-boosts-modal').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('toolbelt-ui').style.display = 'block';
  document.getElementById('end-game-modal').style.display = 'none';
  document.getElementById('pause-modal').style.display = 'none';
  document.getElementById('message-modal').style.display = 'none';
  document.getElementById('scrap-bar-container').style.display = 'block';
}

function obtainShiftCode() {
  fetch('http://localhost:3000/create-shift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser._id })
  }).then(res => res.json()).then(data => {
    currentShiftId = data.shiftId;
    socket.emit('join-shift', { shiftId: currentShiftId, userId: currentUser._id });
    document.getElementById('shift-code').textContent = currentShiftId;
  });
}

function obtainInventory() {
  // Assuming inventory is part of user
}

function obtainSavedToolbelt() {
  // Assuming toolbelt is part of user
}

function enableButtons() {
  document.getElementById('nav-locker-room').addEventListener('click', loadLockerRoomPage);
  document.getElementById('nav-tower-panel').addEventListener('click', loadTowerPanelPage);
  document.getElementById('start-shift').addEventListener('click', () => {
    socket.emit('ready', { shiftId: currentShiftId, userId: currentUser._id });
  });
  document.getElementById('send-chat').addEventListener('click', () => {
    const message = document.getElementById('chat-input').value;
    if (message.trim()) {
      socket.emit('chat-message', { shiftId: currentShiftId, message });
      document.getElementById('chat-input').value = '';
    }
  });
  document.getElementById('save-toolbelt').addEventListener('click', () => {
    const toolbelt = [];
    for (let i = 0; i < 6; i++) {
      const slot = document.getElementById('toolbelt-slots').children[i];
      const weapon = slot.dataset.weapon ? JSON.parse(slot.dataset.weapon) : null;
      toolbelt.push(weapon);
    }
    socket.emit('save-toolbelt', { toolbelt });
  });
  document.getElementById('toggle-boosts').addEventListener('click', () => {
    const modal = document.getElementById('show-boosts-modal');
    modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    if (modal.style.display === 'block') {
      populateBoostsModal();
    }
  });
  document.getElementById('forfeit-btn').addEventListener('click', () => {
    socket.emit('forfeit-shift', { shiftId: currentShiftId, userId: currentUser._id });
  });
}

function populateBoostsModal() {
  const boostsDiv = document.getElementById('boosts-list');
  boostsDiv.innerHTML = '';
  const player = currentShift.players.find(p => p.userId === currentUser._id);
  if (player && player.boosts) {
    player.boosts.forEach(boost => {
      const div = document.createElement('div');
      div.textContent = `${boost.type.replace('-', ' ')}: ${boost.description}`;
      boostsDiv.appendChild(div);
    });
  }
}

function handleShiftEnd(forfeit) {
  const player = currentShift.players.find(p => p.userId === currentUser._id);
  let credits = 0;
  if (player) {
    credits = Math.floor(player.scrap * 0.1);
    if (currentShift.players.length > 1) credits = Math.floor(credits * 1.1);
    if (forfeit) credits = Math.floor(credits * 0.8);
  }
  document.getElementById('end-credits').textContent = credits;
  document.getElementById('end-game-modal').style.display = 'block';
  document.getElementById('end-game-modal').style.zIndex = '10000';
  document.getElementById('return-to-locker').addEventListener('click', () => {
    document.getElementById('end-game-modal').style.display = 'none';
    loadLockerRoomPage();
    obtainShiftCode();
    obtainInventory();
    obtainSavedToolbelt();
    enableButtons();
  });
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
  currentShiftId = null;
}

function showDismissableAlert(message, buttonText) {
  const modal = document.getElementById('message-modal');
  document.getElementById('message-text').textContent = message;
  document.getElementById('message-btn').textContent = buttonText;
  modal.style.display = 'block';
  modal.style.zIndex = '10000';
  document.getElementById('message-btn').onclick = () => {
    modal.style.display = 'none';
  };
}

function showMessage(message) {
  const messageEl = getMessageElement();
  messageEl.textContent = message;
  setTimeout(() => {
    messageEl.textContent = '';
  }, 5000);
}

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

function connectSocketIO() {
  socket = io('http://localhost:3000');
  socket.on('shift-update', (shift) => {
    currentShift = shift;
    updateLockerRoom(shift);
  });
  socket.on('shift-started', () => {
    loadGamePage();
    startGame();
  });
  socket.on('game-over', (data) => {
    handleShiftEnd(false);
  });
  socket.on('chat-message', (data) => {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.textContent = `${data.username}: ${data.message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
  socket.on('boost-choice', (data) => {
    if (data.playerId === currentUser._id) {
      showBoostModal(data.choices);
    }
  });
  socket.on('collect-scrap', (data) => {
    // Scrap collection logic
    const player = currentShift.players.find(p => p.userId === currentUser._id);
    if (player && data.playerId === currentUser._id) {
      player.scrap += data.value;
      updateScrapBar(player.scrap, player.pickupThreshold);
    }
  });
}

function updateLockerRoom(shift) {
  const playerNames = shift.players.map(p => p.username).join(', ');
  document.getElementById('players').textContent = playerNames;
  const chatDiv = document.getElementById('chat');
  const joinSec = document.getElementById('join-section');
  if (shift.players.length > 1) {
    chatDiv.style.display = 'block';
    joinSec.style.display = 'none';
  } else {
    chatDiv.style.display = 'none';
    joinSec.style.display = 'block';
  }
  updateStartButton(shift);
  const currentPrevious = [...previousPlayers];
  const newPlayers = shift.players.filter(p => !currentPrevious.some(pp => pp.userId === p.userId));
  if (newPlayers.length > 0) {
    newPlayers.forEach(newPlayer => {
      if (newPlayer.userId === currentUser._id) {
        const host = shift.players[0];
        showMessage(`You've joined ${host.username}'s shift`);
      } else {
        showMessage(`${newPlayer.username} has joined your shift`);
      }
    });
  }
  previousPlayers = [...shift.players];
}

function updateStartButton(shift) {
  const startBtn = document.getElementById('start-shift');
  if (shift.map) {
    if (shift.ready && shift.ready.some(r => r.userId === currentUser._id)) {
      startBtn.textContent = "Waiting for others...";
      startBtn.disabled = true;
    } else {
      startBtn.textContent = "I'm Ready";
      startBtn.disabled = false;
    }
  } else {
    startBtn.disabled = true;
    startBtn.textContent = "Generating Map...";
  }
}

function startGame() {
  gameInstance = new Phaser.Game(config);
  document.getElementById('game-container').addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateScrapBar(scrap, threshold) {
  const bar = document.getElementById('scrap-bar');
  const text = document.getElementById('scrap-bar-text');
  const progress = Math.min(scrap / threshold, 1);
  bar.style.width = `${progress * 100}%`;
  text.textContent = `${scrap}/${threshold}`;
}