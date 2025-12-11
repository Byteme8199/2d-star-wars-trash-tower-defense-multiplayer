const { Shift, User } = require('./models');
const { generateWeapon, generateRandomBoosts, assignPlayerPositions, isValidPath, generateMap } = require('./utils');

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-shift', async (data) => {
      const { shiftId, userId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      socket.join(shiftId);
      socket.shiftId = shiftId;
      socket.userId = userId;
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('place-weapon', async (data) => {
      const { shiftId, x, y, type } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.status !== 'active') return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player) return;
      if (Date.now() - player.lastPlaced < 500) return; // Cooldown
      if (!isValidPath(shift.map, x, y)) return;
      const weapon = generateWeapon(type);
      weapon.id = Date.now().toString() + Math.random();
      weapon.x = x;
      weapon.y = y;
      weapon.playerId = socket.userId;
      shift.weapons.push(weapon);
      player.lastPlaced = Date.now();
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('destroy-weapon', async (data) => {
      const { shiftId, weaponId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.status !== 'active') return;
      const weapon = shift.weapons.find(w => w.id === weaponId);
      if (!weapon || weapon.playerId !== socket.userId) return; // Only owner can destroy
      shift.weapons = shift.weapons.filter(w => w.id !== weaponId);
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('start-shift', async (data) => {
      const { shiftId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.players.length === 0) return;
      shift.status = 'active';
      shift.map = generateMap();
      const positions = assignPlayerPositions(shift.players, shift.map);
      shift.players.forEach((p, i) => {
        p.x = positions[i].x;
        p.y = positions[i].y;
      });
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('ready', async (data) => {
      const { shiftId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      if (!shift.ready.includes(socket.userId)) {
        shift.ready.push(socket.userId);
      }
      if (shift.ready.length === shift.players.length && shift.players.length > 0) {
        shift.status = 'active';
        shift.map = generateMap();
        const positions = assignPlayerPositions(shift.players, shift.map);
        shift.players.forEach((p, i) => {
          p.x = positions[i].x;
          p.y = positions[i].y;
        });
      }
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('move', async (data) => {
      const { shiftId, x, y } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.status !== 'active' || shift.paused) return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player) return;
      player.x = x;
      player.y = y;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('chat-message', async (data) => {
      const { shiftId, message } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player) return;
      io.to(shiftId).emit('chat-message', { username: player.username, message });
    });

    socket.on('save-toolbelt', async (data) => {
      const { toolbelt } = data;
      const user = await User.findOne({ _id: socket.userId });
      if (!user) return;
      user.toolbelt = toolbelt;
      await user.save();
      socket.emit('toolbelt-saved');
    });

    socket.on('choose-boost', async (data) => {
      const { shiftId, boostIndex } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.status !== 'active') return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player || !player.boostChoices) return;
      const chosenBoost = player.boostChoices[boostIndex];
      if (!chosenBoost) return;
      player.boosts.push(chosenBoost);
      // Apply boost effect
      if (chosenBoost.effect) {
        chosenBoost.effect(player);
      }
      player.boostChoices = null;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('pause-game', async (data) => {
      const { shiftId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      shift.paused = true;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('resume-game', async (data) => {
      const { shiftId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      shift.paused = false;
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('collect-scrap', async (data) => {
      const { shiftId, scrapId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift || shift.status !== 'active') return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player) return;
      const scrap = shift.scraps.find(s => s.id === scrapId);
      if (!scrap) return;
      const distance = Math.sqrt((player.x - scrap.x) ** 2 + (player.y - scrap.y) ** 2);
      if (distance > player.pickupRadius) return;
      // Calculate scrap value with bonuses
      const scrapBonus = player.boosts.reduce((sum, b) => sum + (b.effect.scrapBonus || 0), 0);
      const scrapValue = scrap.value + scrapBonus;
      player.totalScrap += scrapValue;
      player.scrap += scrapValue;
      shift.scraps = shift.scraps.filter(s => s.id !== scrapId);
      // Check for boost threshold
      if (player.scrap >= player.pickupThreshold) {
        player.previousPickupThreshold = player.pickupThreshold;
        player.pickupThreshold += Math.ceil(player.pickupThreshold * 0.35);
        const boosts = generateRandomBoosts(3);
        player.boostChoices = { id: Date.now().toString(), options: boosts };
        io.to(shiftId).emit('boost-choice', { playerId: player.userId, choices: boosts });
      }
      await shift.save();
      io.to(shiftId).emit('shift-update', shift);
    });

    socket.on('forfeit-shift', async (data) => {
      const { shiftId } = data;
      const shift = await Shift.findOne({ id: shiftId });
      if (!shift) return;
      const player = shift.players.find(p => p.userId === socket.userId);
      if (!player) return;
      // Calculate credits with penalty
      const baseCredits = player.scrap * 0.1;
      const penalty = shift.players.length > 1 ? 0.5 : 0; // 50% penalty in multiplayer
      const credits = Math.floor(baseCredits * (1 - penalty));
      const user = await User.findOne({ _id: socket.userId });
      if (user) {
        user.credits += credits;
        await user.save();
      }
      shift.players = shift.players.filter(p => p.userId !== socket.userId);
      if (shift.players.length === 0) {
        await Shift.deleteOne({ id: shiftId });
      } else {
        await shift.save();
        io.to(shiftId).emit('shift-update', shift);
      }
      socket.emit('game-over', { credits, reason: 'forfeit' });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}

module.exports = { setupSocketHandlers };