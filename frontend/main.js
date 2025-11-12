class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        // Load assets here (e.g., this.load.image('tower', 'assets/tower.png');)
        // For now, no assets loaded
    }

    create() {
        // Set background color
        this.cameras.main.setBackgroundColor('#000011');

        // Add some placeholder text
        this.add.text(400, 300, 'Star Wars Tower Defense', { fontSize: '32px', fill: '#ffd700' }).setOrigin(0.5);

        // Placeholder for game elements
        // Example: this.add.rectangle(400, 400, 50, 50, 0xff0000); // Red square for enemy path or something

        // Initialize game variables
        this.health = 100;
        this.wave = 1;
        this.score = 0;

        // Update UI
        this.updateUI();
    }

    update() {
        // Game loop logic here
        // For now, empty
    }

    updateUI() {
        document.getElementById('health').textContent = this.health;
        document.getElementById('wave').textContent = this.wave;
        document.getElementById('score').textContent = this.score;
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

const game = new Phaser.Game(config);