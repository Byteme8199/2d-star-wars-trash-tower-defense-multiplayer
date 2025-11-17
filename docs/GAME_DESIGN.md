# Game Design Document Template

## 1. Game Concept
- **Title**: Coruscant Sewage Defense (or Droid Defense: Coruscant Cleanup)
- **Genre**: Multiplayer Persistent Tower Defense with Rogue-like Elements
- **Platform**: Web-based (Browser)
- **Target Audience**: Star Wars fans, tower defense enthusiasts, casual gamers interested in persistent worlds and loot systems
- **Core Idea/Summary**: Players take on the role of union droids tasked with defending against overflowing sewage on Coruscant, the ecumenopolis planet from Star Wars. In short shifts (5-10 minutes), place waste disposal defenses (weapons) to destroy incoming waste, collect scrap metal for upgrades, and earn bonuses for unlocks. Contribute to the planet-wide Overflow meter to prevent total collapse. Features persistent progression, loot/gear drops, and event-based gameplay.
- **Unique Selling Points**: Humorous Star Wars sewage theme, persistent multiplayer world, rogue-like shift-based gameplay with loot, community-driven planet health.

## 2. Gameplay Mechanics
- **Objective**: Survive short shifts (5-10 minutes) by placing waste disposal weapons to destroy incoming sewage waste, collect scrap metal for upgrades, defeat bosses for loot, and earn bonuses. Contribute to the planet-wide Overflow meter to prevent global collapse and unlock community rewards.
- **Controls**: Mouse for placing/selecting weapons, upgrading during shifts, and interacting with UI. Keyboard for quick actions (e.g., pause).
- **Core Loop**: Start shift -> Place weapons along paths -> Waves of waste spawn -> Destroy waste for scrap -> Use scrap for randomized powerups -> Face mid/end bosses -> Shift ends -> Receive bonuses/unlocks based on performance.
- **Progression System**: Earn credits from shifts for unlocks (characters, weapons, skills). Global Overflow meter rises with population; good performance attracts more people (better loot/paydays), poor performance drives them away (easier but worse rewards).
- **Win/Lose Conditions**: Shift loss if Overflow meter fills (waste reaches base). Global loss if Overflow overflows completely. Win by surviving shifts, collecting loot, and achieving unlocks.

## 3. Characters and Entities
- **Player Character/Role**: Union droids with unique abilities (e.g., faster placement, heat resistance). Unlock via $, achievements, global progress. Pre-shift locker room: Select character, equip weapons, skills, power-ups on toolbelt. Characters vary in equipment slots, weapon access, and special abilities. Starting droid levels up with scrap collected. Examples: Jedi (lightsaber for waste destruction), Bounty Hunter (thermal detonator explosions).
- **Enemies/NPCs**: Waste types (organic, metal, industrial/chemical, mixed) with varying resistances. Boss monsters (mid/end shift) with loot tables, requiring multiplayer for tough ones. Easter eggs: Carbonite-frozen people (metal), starship debris, Jabba the Hutt as a fatberg boss.
- **Allies/Support**: None directly, but community contributions unlock global perks.

## 4. Levels and Environments
- **Level Design**: Shifts as procedurally generated or themed maps on Coruscant (e.g., streets, sewers). Paths for waste flow.
- **Environments**: Urban Coruscant setting with silly elements (overflowing toilets, floating debris).
- **Difficulty Scaling**: Based on Overflow meter (population). More people = harder waste waves but better rewards.

## 5. Art and Audio
- **Visual Style**: 2D cartoonish, humorous Star Wars theme (droids, waste animations).
- **Key Assets**: Weapon sprites, waste enemies, droid characters, Coruscant backgrounds.
- **Sound Design**: Funny sound effects (splat, zap, droid beeps).
- **Music**: Upbeat, silly tracks with Star Wars motifs.

## 6. User Interface and Experience
- **HUD Elements**: Overflow meter, scrap counter, weapon panel, heat indicators, shift timer.
- **Menus**: Character select, shift start, loot screen, global leaderboard.
- **Feedback Systems**: Visual effects for weapon breakdowns, loot drops, performance ratings.

## 7. Multiplayer Aspects
- **Multiplayer Modes**: Co-op shifts with friends (share loot), solo shifts contributing to global goals.
- **Networking**: Real-time via WebSockets for co-op.
- **Social Features**: Friend invites, global achievements, community unlocks.

## 8. Technical Specifications
- **Technology Stack**: Frontend (Phaser.js), Backend (Node.js/Express/Socket.io), Database (MongoDB).
- **Performance Requirements**: Smooth 60 FPS, handle multiple players/enemies.
- **Compatibility**: Modern browsers, responsive design.

## 9. Monetization and Business Model
- **Revenue Streams**: Optional purchases for $, cosmetic unlocks.
- **Free-to-Play Elements**: Core gameplay free, unlocks via play/achievements.

## 10. Development Roadmap
- **Milestones**: Prototype basic shift, add weapons/waste, implement multiplayer, polish.
- **Risks and Challenges**: Balancing silly tone with gameplay, managing persistence.

## 11. Additional Notes
- Tone: Silly and humorous, with funny weapon names/effects.
- Weapons: Pressure washers, laser cutters, waste escape pods, etc. Balance damage/pushback/efficiency/heat.
- Events: Modified shifts with special rewards, raid bosses/dungeons with better loot.
- Pre-shift Setup: Locker room for character/weapon/skill/power-up selection. Toolbelt equipment system.
- Character Progression: Starting droid levels with scrap; unlocks for diverse characters with unique abilities (e.g., Jedi lightsaber, Bounty Hunter thermal detonator).
- Easter Eggs: Carbonite people, starship pieces, Jabba fatberg boss.