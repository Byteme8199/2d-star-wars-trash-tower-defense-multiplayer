// game.js - Phaser game logic and scene

// Phaser Game Scene
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.spritesheet('conveyor-belt', 'assets/conveyor-belt.png', { frameWidth: 10, frameHeight: 10 });
    this.load.image('waste', 'assets/waste-01.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000011');
    this.physics.world.setBounds(0, 0, 800, 600);
    this.cellSize = window.GAME_CONSTANTS.cellSize;
    this.gridWidth = window.GAME_CONSTANTS.gridWidth;
    this.gridHeight = window.GAME_CONSTANTS.gridHeight;
    this.pathSquares = new Set();
    this.graphics = this.add.graphics();
    this.pathSprites = this.add.group();
    this.anims.create({
      key: 'conveyor-move',
      frames: this.anims.generateFrameNumbers('conveyor-belt', { start: 0, end: 2 }),
      frameRate: 3,
      repeat: -1
    });
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(1, 0x121212);
    for (let x = 0; x <= 800; x += this.cellSize) {
      this.gridGraphics.lineBetween(x, 0, x, 600);
    }
    for (let y = 0; y <= 600; y += this.cellSize) {
      this.gridGraphics.lineBetween(0, y, 800, y);
    }
    this.enemies = this.add.group();
    this.weapons = this.add.group();
    this.players = this.add.group();
    this.projectiles = this.add.group();
    this.lastMoveEmit = 0;
    this.heatText = this.add.text(700, 10, 'Heat: 0', { fontSize: '16px', fill: '#fff' });
    this.scrapText = this.add.text(700, 30, 'Scrap: 0', { fontSize: '16px', fill: '#fff' });
    this.weaponPositions = {};
    this.enemyPositions = {};
    this.boostTexts = [];
    this.wasd = {
      w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.paused = false;

    // Socket listeners for game
    window.stateManager.socket.on('shift-update', (shift) => {
      this.updateFromServer(shift);
    });
    window.stateManager.socket.on('weapon-fired', (data) => {
      let wpos = this.weaponPositions[data.weaponId];
      let epos = this.enemyPositions[data.targetId];
      if (!wpos) wpos = this.weaponPositions[data.weaponId] = {x: 0, y: 0, type: 'pressure-washer', stats: {hp: 100}};
      if (!epos) epos = this.enemyPositions[data.targetId] = {x: 0, y: 0};
      if (wpos && epos) {
        const line = this.add.graphics();
        line.lineStyle(5, 0xff0000);
        line.lineBetween(wpos.x, epos.x, wpos.y, epos.y);
        this.projectiles.add(line);
        this.time.delayedCall(1000, () => {
          line.destroy();
        });
        const damageText = this.add.text(epos.x, epos.y - 10, `-${data.damage}`, { fontSize: '16px', fill: '#ff0000' });
        this.time.delayedCall(500, () => {
          damageText.destroy();
        });
      }
    });
    window.stateManager.socket.on('boost-choice', (data) => {
      if (data.playerId === window.stateManager.currentUser._id) {
        showBoostModal(data.choices);
      }
    });
    window.stateManager.socket.on('missile-explosion', (data) => {
      if (!data.x || !data.y || !data.radius) return; // Guard check for missing data
      const explosion = this.add.circle(data.x, data.y, data.radius, 0xffaa00);
      explosion.setAlpha(0.7);
      this.tweens.add({
        targets: explosion,
        alpha: 0,
        scaleX: 2,
        scaleY: 2,
        duration: 300,
        onComplete: () => explosion.destroy()
      });
    });
    this.hoverGraphics = this.add.graphics();
    this.input.on('pointerdown', this.placeWeapon, this);
    this.input.on('pointermove', this.onPointerMove, this);
  }

  update() {
    if (this.player) {
      let dx = 0, dy = 0;
      if (this.wasd.a.isDown) dx -= 2;
      if (this.wasd.d.isDown) dx += 2;
      if (this.wasd.w.isDown) dy -= 2;
      if (this.wasd.s.isDown) dy += 2;
      if (dx || dy) {
        let newX = this.player.x + dx;
        let newY = this.player.y + dy;
        newX = Phaser.Math.Clamp(newX, 0, 780);
        newY = Phaser.Math.Clamp(newY, 0, 580);
        let gx = Math.floor(newX / this.cellSize);
        let gy = Math.floor(newY / this.cellSize);
        if (!this.pathSquares.has(`${gx},${gy}`)) {
          this.player.x = newX;
          this.player.y = newY;
          const now = Date.now();
          if (now - this.lastMoveEmit > window.GAME_CONSTANTS.moveThrottle) {
            window.stateManager.socket.emit('move', { shiftId: window.stateManager.currentShiftId, x: this.player.x, y: this.player.y, userId: window.stateManager.currentUser._id });
            this.lastMoveEmit = now;
          }
        }
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && window.stateManager.currentShift && window.stateManager.currentShift.players.length === 1) {
      if (this.paused) {
        this.paused = false;
        window.stateManager.socket.emit('resume-game', { shiftId: window.stateManager.currentShiftId });
        document.getElementById('message-modal').style.display = 'none';
        document.getElementById('pause-modal').style.display = 'none';
        if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'auto';
        document.getElementById('game-container').style.pointerEvents = 'auto';
      } else {
        this.paused = true;
        window.stateManager.socket.emit('pause-game', { shiftId: window.stateManager.currentShiftId });
        showMessage('Game Paused. Press space to resume');
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey) && window.stateManager.currentShift && window.stateManager.currentShift.players.length === 1) {
      if (!this.paused) {
        this.paused = true;
        window.stateManager.socket.emit('pause-game', { shiftId: window.stateManager.currentShiftId });
        document.getElementById('pause-modal').style.display = 'block';
        document.getElementById('pause-modal').style.zIndex = '10000';
        if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'none';
        document.getElementById('game-container').style.pointerEvents = 'none';
        document.getElementById('resume-pause-btn').addEventListener('click', () => {
          document.getElementById('pause-modal').style.display = 'none';
          window.stateManager.socket.emit('resume-game', { shiftId: window.stateManager.currentShiftId });
          if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'auto';
          document.getElementById('game-container').style.pointerEvents = 'auto';
          if (window.stateManager.gameInstance && window.stateManager.gameInstance.scene.getScene('GameScene')) {
            window.stateManager.gameInstance.scene.getScene('GameScene').paused = false;
          }
        });
        document.getElementById('quit-early-btn').addEventListener('click', () => {
          document.getElementById('pause-modal').style.display = 'none';
          if (window.stateManager.currentShift) {
            window.stateManager.currentShift.overflow = 0;
            window.stateManager.currentShift.status = 'ended';
          }
          handleShiftEnd(true);
          if (window.stateManager.gameInstance) window.stateManager.gameInstance.canvas.style.pointerEvents = 'auto';
          document.getElementById('game-container').style.pointerEvents = 'auto';
        });
      }
    }
  }

  updateFromServer(shift) {
    window.stateManager.currentShift = shift;
    if (shift.map && !this.enemyPath) {
      this.pathSquares = new Set(shift.map.pathSquares.map(s => `${s.x},${s.y}`));
      if (this.pathSprites) this.pathSprites.clear(true, true);
      shift.map.pathSquares.forEach((square, index) => {
        const sprite = this.add.sprite(square.x * this.cellSize + 5, square.y * this.cellSize + 5, 'conveyor-belt');
        sprite.setDisplaySize(this.cellSize, this.cellSize);
        const nextSquare = shift.map.pathSquares[index + 1];
        if (nextSquare) {
          const dx = nextSquare.x - square.x;
          const dy = nextSquare.y - square.y;
          if (dx === 1) sprite.angle = 0;
          else if (dx === -1) sprite.angle = 180;
          else if (dy === 1) sprite.angle = 90;
          else if (dy === -1) sprite.angle = 270;
        }
        if (this.anims.exists('conveyor-move')) sprite.play('conveyor-move');
        if (this.pathSprites) this.pathSprites.add(sprite);
      });
      this.enemyPath = new Phaser.Curves.Path(shift.map.startPos.x * this.cellSize + 5, shift.map.startPos.y * this.cellSize + 5);
      shift.map.pathSquares.forEach(square => {
        this.enemyPath.lineTo(square.x * this.cellSize + 5, square.y * this.cellSize + 5);
      });
    }
    shift.players.forEach(p => {
      if (p.userId === window.stateManager.currentUser._id) {
        if (!this.player) {
          this.player = this.add.rectangle(p.x, p.y, 10, 10, 0x00ff00);
          this.physics.add.existing(this.player);
          this.player.body.setCollideWorldBounds(true);
        }
      } else {
        if (!this.playerSprites[p.userId]) {
          let rect = this.add.rectangle(p.x, p.y, 10, 10, 0xffffff);
          this.physics.add.existing(rect);
          rect.body.setCollideWorldBounds(true);
          this.playerSprites[p.userId] = rect;
        }
        this.playerSprites[p.userId].x = p.x;
        this.playerSprites[p.userId].y = p.y;
      }
    });
    if (this.enemies) this.enemies.clear(true, true);
    if (this.weapons) this.weapons.clear(true, true);
    if (this.projectiles) this.projectiles.clear(true, true);
    this.weaponPositions = {};
    shift.weapons.forEach(w => this.weaponPositions[w.id] = {x: w.x, y: w.y, type: w.type, stats: w.stats});
    this.enemyPositions = {};
    shift.enemies.forEach(e => this.enemyPositions[e.id] = {x: e.x, y: e.y});
    hideItemModal();
    const existingEnemyTooltip = document.getElementById('enemy-tooltip');
    if (existingEnemyTooltip) existingEnemyTooltip.remove();
    shift.enemies.forEach(e => {
      if (!e.health) e.health = 100; // Guard check for missing health
      let enemy = this.add.sprite(e.x, e.y, 'waste');
      enemy.setDisplaySize(10, 10);
      if (e.boosted) {
        enemy.setTintFill(0xff0000);
      } else if (e.freezeEnd > Date.now()) {
        enemy.setTintFill(0x0000ff);
      }
      enemy.setInteractive();
      enemy.on('pointerover', (pointer) => {
        const tooltip = document.createElement('div');
        tooltip.innerHTML = `HP: ${e.health}`;
        tooltip.style.position = 'absolute';
        tooltip.style.left = (pointer.event.pageX + 10) + 'px';
        tooltip.style.top = (pointer.event.pageY - 10) + 'px';
        tooltip.style.background = 'rgba(0,0,0,0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '5px';
        tooltip.style.border = '1px solid white';
        tooltip.style.borderRadius = '3px';
        tooltip.style.pointerEvents = 'none';
        tooltip.id = 'enemy-tooltip';
        document.body.appendChild(tooltip);
      });
      enemy.on('pointerout', () => {
        const tooltip = document.getElementById('enemy-tooltip');
        if (tooltip) tooltip.remove();
      });
      this.enemies.add(enemy);
    });
    shift.weapons.forEach(w => {
      if (!window.WEAPON_GRID_SIZES || !window.WEAPON_GRID_SIZES[w.type]) {
        console.log('Unknown weapon type:', w.type);
        w.type = 'pressure-washer';
      }
      if (!w.stats) w.stats = { hp: 100, power: 10, cooldown: 1000, range: 50, gridSize: {w:1,h:1} }; // Guard check for missing stats
      if (!w.hp) w.hp = w.stats.hp || 100; // Guard check for missing hp
      let color = 0x0000ff;
      if (w.type === 'pressure-washer') color = 0x00ff00;
      else if (w.type === 'missile-launcher') color = 0xff0000;
      else if (w.type === 'laser-cutter') color = 0xffff00;
      else if (w.type === 'waste-escape-pod') color = 0xff00ff;
      else if (w.type === 'flame-thrower') color = 0xff6600;
      else if (w.type === 'railgun') color = 0x666666;
      const gridSize = window.WEAPON_GRID_SIZES[w.type] || {w:1,h:1};
      let alpha = w.hp / w.stats.hp;
      let weapon = this.add.rectangle(w.x, w.y, gridSize.w * 10, gridSize.h * 10, color);
      weapon.setAlpha(alpha);
      weapon.setInteractive();
      weapon.on('pointerover', (pointer) => {
        showItemModal(w, pointer.event);
      });
      weapon.on('pointerout', () => {
        hideItemModal();
      });
      weapon.on('pointerdown', (pointer) => {
        if (pointer.rightButtonDown()) {
          window.stateManager.socket.emit('destroy-weapon', { shiftId: window.stateManager.currentShiftId, x: w.x, y: w.y });
        }
      });
      this.weapons.add(weapon);
    });
    shift.projectiles.forEach(p => {
      if (!p.x || !p.y) return; // Guard check for missing position
      let proj = this.add.circle(p.x, p.y, 3, 0xff0000);
      this.projectiles.add(proj);
    });
    if (typeof shift.heat !== 'number' || isNaN(shift.heat)) shift.heat = 0;
    if (this.heatText) this.heatText.setText('Heat: ' + Math.round(shift.heat));
    const player = shift.players.find(p => p.userId === window.stateManager.currentUser._id);
    if (player && (typeof player.scrap !== 'number' || isNaN(player.scrap))) player.scrap = 0;
    if (this.scrapText) this.scrapText.setText('Scrap: ' + (player ? player.scrap : 0));
    updateGameToolbelt();
    const overflowEl = document.getElementById('overflow');
    if (overflowEl) overflowEl.textContent = shift.overflow;
    const waveEl = document.getElementById('wave');
    if (waveEl) waveEl.textContent = shift.wave;
    const scrapEl = document.getElementById('scrap');
    if (scrapEl) scrapEl.textContent = shift.scrap;
    if (shift.status === 'ended' && !window.stateManager.shiftEnded) {
      handleShiftEnd(false);
    }
  }

  placeWeapon(pointer) {
    if (!window.stateManager.currentUser.toolbelt || window.stateManager.currentUser.toolbelt.length === 0) {
      window.stateManager.currentUser.toolbelt = [generateWeapon('pressure-washer')];
    }
    if (window.stateManager.currentShiftId && window.stateManager.currentShift && !window.stateManager.currentShift.paused) {
      let gx = Math.floor(pointer.x / this.cellSize);
      let gy = Math.floor(pointer.y / this.cellSize);
      const toolbelt = window.stateManager.currentUser.toolbelt || [];
      const selectedWeapon = toolbelt[window.stateManager.selectedIndex];
      if (!selectedWeapon) return;
      const gridSize = selectedWeapon.stats.gridSize || {w:1,h:1};
      let gridW = gridSize.w, gridH = gridSize.h;
      let x = gx * this.cellSize + gridW * this.cellSize / 2;
      let y = gy * this.cellSize + gridH * this.cellSize / 2;
      let valid = true;
      for (let i = 0; i < gridW; i++) {
        for (let j = 0; j < gridH; j++) {
          if (this.pathSquares.has(`${gx + i},${gy + j}`)) valid = false;
        }
      }
      if (valid) {
        const occupied = Object.values(this.weaponPositions).some(pos => {
          let wGridW = pos.stats.gridSize?.w || 1;
          let wGridH = pos.stats.gridSize?.h || 1;
          let wx = Math.floor(pos.x / this.cellSize) - Math.floor(wGridW / 2);
          let wy = Math.floor(pos.y / this.cellSize) - Math.floor(wGridH / 2);
          return !(gx + gridW <= wx || wx + wGridW <= gx || gy + gridH <= wy || wy + wGridH <= gy);
        });
        if (!occupied) {
          window.stateManager.socket.emit('place-weapon', { shiftId: window.stateManager.currentShiftId, x, y, weapon: selectedWeapon, userId: window.stateManager.currentUser._id });
        }
      }
    }
  }

  onPointerMove(pointer) {
    this.hoverGraphics.clear();
    if (!window.stateManager.currentUser.toolbelt || window.stateManager.currentUser.toolbelt.length === 0) {
      window.stateManager.currentUser.toolbelt = [generateWeapon('pressure-washer')];
    }
    const toolbelt = window.stateManager.currentUser.toolbelt || [];
    const selectedWeapon = toolbelt[window.stateManager.selectedIndex];
    if (!selectedWeapon) return;
    let gx = Math.floor(pointer.x / this.cellSize);
    let gy = Math.floor(pointer.y / this.cellSize);
    const gridSize = selectedWeapon.stats.gridSize || {w:1,h:1};
    let gridW = gridSize.w, gridH = gridSize.h;
    let width = gridW * this.cellSize;
    let height = gridH * this.cellSize;
    let x = gx * this.cellSize + width / 2;
    let y = gy * this.cellSize + height / 2;
    let valid = true;
    for (let i = 0; i < gridW; i++) {
      for (let j = 0; j < gridH; j++) {
        if (this.pathSquares.has(`${gx + i},${gy + j}`)) valid = false;
      }
    }
    if (valid) {
      const occupied = Object.values(this.weaponPositions).some(pos => {
        let wGridW = pos.stats?.gridSize?.w || 1;
        let wGridH = pos.stats?.gridSize?.h || 1;
        let wx = Math.floor(pos.x / this.cellSize) - Math.floor(wGridW / 2);
        let wy = Math.floor(pos.y / this.cellSize) - Math.floor(wGridH / 2);
        return !(gx + gridW <= wx || wx + wGridW <= gx || gy + gridH <= wy || wy + wGridH <= gy);
      });
      valid = !occupied;
    }
    this.hoverGraphics.lineStyle(2, valid ? 0x00ff00 : 0xff0000);
    this.hoverGraphics.strokeRect(x - width / 2, y - height / 2, width, height);
    this.hoverGraphics.fillStyle(valid ? 0x00ff00 : 0xff0000, 0.3);
    this.hoverGraphics.fillRect(x - width / 2, y - height / 2, width, height);
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  scene: GameScene,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  }
};

window.GameScene = GameScene;
window.gameConfig = config;