// state.js - State management for the app

class StateManager {
  constructor() {
    this.currentUser = null;
    this.gameInstance = null;
    this.socket = null;
    this.currentShiftId = null;
    this.previousPlayers = [];
    this.selectedIndex = 0;
    this.shiftEnded = false;
    this.currentShift = null;
    this.pendingShift = null;
  }

  // Initialize socket and set up listeners
  initSocket() {
    this.socket = io('http://localhost:3001');
    setupSocketListeners();
  }

  updateShift(shift) {
    this.currentShift = shift;
    this.updateLockerRoomUI(shift);
    if (this.gameInstance) {
      const scene = this.gameInstance.scene.getScene('GameScene');
      if (scene) {
        scene.updateFromServer(shift);
      }
    } else {
      this.pendingShift = shift;
    }
  }

  setupSocketListeners() {
    this.socket.on('shift-ended', () => {
      this.returnToLockerRoom();
    });
    this.socket.on('shift-started', () => {
      document.getElementById('locker-room').style.display = 'none';
      this.startGame();
    });
    this.socket.on('reconnect', () => {
      if (this.currentShiftId) {
        this.socket.emit('join-shift', { shiftId: this.currentShiftId, userId: this.currentUser._id });
      }
    });
  }

  updateLockerRoomUI(shift) {
    if (document.getElementById('locker-room').style.display !== 'none') {
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
      this.updateStartButton(shift);
      const currentPrevious = [...this.previousPlayers];
      const newPlayers = shift.players.filter(p => !currentPrevious.some(pp => pp.userId === p.userId));
      if (newPlayers.length > 0) {
        newPlayers.forEach(newPlayer => {
          if (newPlayer.userId === this.currentUser._id) {
            const host = shift.players[0];
            showMessage(`You've joined ${host.username}'s shift`);
          } else {
            showMessage(`${newPlayer.username} has joined your shift`);
          }
        });
      }
      this.previousPlayers = [...shift.players];
    }
  }

  updateStartButton(shift) {
    const startBtn = document.getElementById('start-shift');
    if (shift.map) {
      if (shift.ready && shift.ready.some(r => r.userId === this.currentUser._id)) {
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

  returnToLockerRoom() {
    document.getElementById('end-game-modal').style.display = 'none';
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('ui-overlay').style.display = 'none';
    document.getElementById('toolbelt-ui').style.display = 'none';
    document.getElementById('locker-room').style.display = 'block';
    this.cleanupGameSocketListeners();
    if (this.gameInstance) {
      this.gameInstance.destroy(true);
      this.gameInstance = null;
    }
    this.currentShiftId = null;
    this.shiftEnded = false;
    fetch('http://localhost:3001/me', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    }).then(res => res.json()).then(data => {
      this.currentUser = data.user;
      if (typeof populateToolbelt === 'function') populateToolbelt();
      // Create a new shift to reset the locker room state
      fetch('http://localhost:3001/create-shift', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId: this.currentUser._id })
      }).then(res => res.json()).then(shift => {
        this.currentShiftId = shift._id;
        this.socket.emit('join-shift', { shiftId: this.currentShiftId, userId: this.currentUser._id });
      });
    });
  }

  cleanupGameSocketListeners() {
    if (!this.socket) return;
    this.socket.off('shift-update');
    this.socket.off('weapon-fired');
    this.socket.off('boost-choice');
    this.socket.off('missile-explosion');
    this.socket.off('shift-ended');
    this.socket.off('shift-started');
    this.socket.off('chat-message');
    this.socket.off('reconnect');
  }

  startGame() {
    if (this.gameInstance) return;
    this.gameInstance = new Phaser.Game(window.config);
    document.getElementById('game-container').style.display = 'block';
    document.getElementById('ui-overlay').style.display = 'block';
    document.getElementById('toolbelt-ui').style.display = 'block';
    document.getElementById('toggle-boosts').style.display = 'block';
    updateGameToolbelt();
    document.getElementById('game-container').addEventListener('contextmenu', (e) => e.preventDefault());
    setTimeout(() => {
      if (this.pendingShift && this.gameInstance && this.gameInstance.scene) {
        const scene = this.gameInstance.scene.getScene('GameScene');
        if (scene) {
          scene.updateFromServer(this.pendingShift);
          this.pendingShift = null;
        }
      }
    }, 500);
  }
}

// Global state manager
window.stateManager = new StateManager();