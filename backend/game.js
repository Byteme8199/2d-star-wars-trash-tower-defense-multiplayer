const { Shift, User, GlobalState } = require('./models');
const { generateWeapon, generateRandomBoosts } = require('./utils');

function gameLoop(io) {
  setInterval(async () => {
    const shifts = await Shift.find({ status: 'active', paused: false });
    for (const shift of shifts) {
      // Enemy spawning
      if (Math.random() < 0.1) { // 10% chance per tick
        const enemy = {
          id: Date.now().toString() + Math.random(),
          x: 0,
          y: 300,
          health: 50 + shift.wave * 10,
          type: 'stormtrooper',
          pathIndex: 0
        };
        shift.enemies.push(enemy);
      }

      // Enemy movement
      shift.enemies.forEach(enemy => {
        enemy.pathIndex += 0.01; // Move along path
        const path = shift.map.path || [];
        if (path.length > 0) {
          const index = Math.floor(enemy.pathIndex);
          if (index < path.length) {
            enemy.x = path[index].x;
            enemy.y = path[index].y;
          } else {
            // Enemy reached end, damage overflow
            shift.overflow -= 10;
            shift.enemies = shift.enemies.filter(e => e.id !== enemy.id);
          }
        }
      });

      // Weapon firing
      shift.weapons.forEach(weapon => {
        if (Date.now() - weapon.lastFired > weapon.stats.fireRate) {
          const target = shift.enemies.find(e => Math.sqrt((e.x - weapon.x) ** 2 + (e.y - weapon.y) ** 2) < weapon.stats.range);
          if (target) {
            const projectile = {
              id: Date.now().toString() + Math.random(),
              x: weapon.x,
              y: weapon.y,
              targetId: target.id,
              speed: 5,
              damage: weapon.stats.damage,
              playerId: weapon.playerId,
              knockback: weapon.stats.knockback
            };
            shift.projectiles.push(projectile);
            weapon.lastFired = Date.now();
            weapon.heat += 10;
            if (weapon.heat > 100) {
              weapon.hp -= 10; // Overheat damage
            }
          }
        }
      });

      // Heat damage
      shift.weapons.forEach(weapon => {
        if (weapon.heat > 0) weapon.heat -= 1;
        if (weapon.hp <= 0) {
          shift.weapons = shift.weapons.filter(w => w.id !== weapon.id);
        }
      });

      // Projectile movement
      shift.projectiles.forEach(projectile => {
        const target = shift.enemies.find(e => e.id === projectile.targetId);
        if (target) {
          const dx = target.x - projectile.x;
          const dy = target.y - projectile.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < projectile.speed) {
            // Hit
            target.health -= projectile.damage;
            if (target.health <= 0) {
              // Enemy defeated
              shift.enemiesDefeated += 1;
              shift.enemies = shift.enemies.filter(e => e.id !== target.id);
              // Drop scrap
              const scrap = {
                id: Date.now().toString() + Math.random(),
                x: target.x + (Math.random() - 0.5) * 20, // Random offset
                y: target.y + (Math.random() - 0.5) * 20,
                value: 10
              };
              shift.scraps.push(scrap);
            }
            shift.projectiles = shift.projectiles.filter(p => p.id !== projectile.id);
          } else {
            projectile.x += (dx / dist) * projectile.speed;
            projectile.y += (dy / dist) * projectile.speed;
          }
        } else {
          shift.projectiles = shift.projectiles.filter(p => p.id !== projectile.id);
        }
      });

      // Win/lose checks
      if (shift.overflow <= 0) {
        shift.status = 'ended';
        // Lose: no credits
        io.to(shift.id).emit('game-over', { credits: 0, reason: 'lose' });
      } else if (shift.enemiesDefeated >= 100 + shift.wave * 20) { // Arbitrary win condition
        shift.status = 'ended';
        // Win: calculate credits
        for (const player of shift.players) {
          const baseCredits = player.scrap * 0.1;
          const boost = shift.players.length > 1 ? 1.1 : 1; // 10% boost in multiplayer
          const credits = Math.floor(baseCredits * boost);
          const user = await User.findOne({ _id: player.userId });
          if (user) {
            user.credits += credits;
            await user.save();
          }
          io.to(shift.id).emit('game-over', { credits, reason: 'win' });
        }
      }

      await shift.save();
      io.to(shift.id).emit('shift-update', shift);
    }
  }, 100); // 10 times per second
}

module.exports = { gameLoop };