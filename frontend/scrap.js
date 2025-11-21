// scrap.js - Scrap collection and animation logic

function collectScrap(scrapId) {
  const player = currentShift.players.find(p => p.userId === currentUser._id);
  if (!player) return;
  const scrap = currentShift.scraps.find(s => s.id === scrapId);
  if (!scrap) return;
  const distance = Math.sqrt((player.x - scrap.x) ** 2 + (player.y - scrap.y) ** 2);
  if (distance > player.pickupRadius) return;
  socket.emit('collect-scrap', { shiftId: currentShiftId, scrapId });
}

function animateScrapCollection(scene, scrapSprite, player) {
  scene.tweens.add({
    targets: scrapSprite,
    x: player.x,
    y: player.y,
    duration: 500,
    ease: 'Power2',
    onComplete: () => {
      scrapSprite.destroy();
    }
  });
}

function updateScrapBar(scrap, threshold) {
  const bar = document.getElementById('scrap-bar');
  const text = document.getElementById('scrap-bar-text');
  const progress = Math.min(scrap / threshold, 1);
  bar.style.width = `${progress * 100}%`;
  text.textContent = `${scrap}/${threshold}`;
}

function createScrapSprite(scene, scrap) {
  const sprite = scene.add.sprite(scrap.x, scrap.y, 'scrap-orb');
  sprite.setDisplaySize(10, 10);
  sprite.setTint(0x00ffff); // Blue orb
  // Bounce animation
  scene.tweens.add({
    targets: sprite,
    y: scrap.y - 5,
    duration: 500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
  return sprite;
}

function updateScrapSprites(scene, scraps) {
  // Clear old sprites and create new ones
  if (scene.scrapSprites) {
    scene.scrapSprites.forEach(s => s.destroy());
  }
  scene.scrapSprites = [];
  scraps.forEach(scrap => {
    const sprite = createScrapSprite(scene, scrap);
    scene.scrapSprites.push(sprite);
  });
}

function checkScrapPickup(scene) {
  const player = currentShift.players.find(p => p.userId === currentUser._id);
  if (!player) return;
  currentShift.scraps.forEach(scrap => {
    const distance = Math.sqrt((player.x - scrap.x) ** 2 + (player.y - scrap.y) ** 2);
    if (distance <= player.pickupRadius) {
      collectScrap(scrap.id);
      const sprite = scene.scrapSprites.find(s => s.x === scrap.x && s.y === scrap.y);
      if (sprite) {
        animateScrapCollection(scene, sprite, player);
      }
    }
  });
}