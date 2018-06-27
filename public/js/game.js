/*
  HELPERS
*/
var MAX_WIDTH = 800;
var MAX_HEIGHT = 450;

function resize() {
  var canvas = game.canvas,
    width = window.innerWidth,
    height = window.innerHeight;

  var wratio = width / height,
    ratio = canvas.width / canvas.height;

  if (height * ratio > MAX_WIDTH || width / ratio > MAX_HEIGHT) return;

  if (wratio < ratio) {
    canvas.style.width = width + 'px';
    canvas.style.height = width / ratio + 'px';
  } else {
    canvas.style.width = height * ratio + 'px';
    canvas.style.height = height + 'px';
  }
}

/*
  PRELOAD SCENE
*/
class PreloadScene extends Phaser.Scene {
  constructor () {
    super({ key: 'preload' });
  }
  preload () {
    this.load.image('ship', 'assets/spaceShips_001.png');
    this.load.image('otherPlayer', 'assets/enemyBlack5.png');
    this.load.image('star', 'assets/star_gold.png');
    this.load.image('screenbg', 'assets/screenbg.jpg');
    this.load.audio('collect', 'assets/audio/collect.wav');
    this.load.audio('void', 'assets/audio/void.mp3');
    this.load.audio('intro', 'assets/audio/intro.wav');
    this.load.audio('validate', 'assets/audio/validate.wav');
  }
  create () {
    window.addEventListener('resize', resize);
    resize();
    // FIXME: create preloading screen
    this.scene.start('title');
  }
}

/*
  TITLE SCENE (menu)
*/
class TitleScene extends Phaser.Scene {
  constructor () {
    super({ key: 'title' });
  }
  preload () {}
  create () {
    resize();
    this.sound.add('intro', { volume: 0.2 }, false, false).play();
    this.add.sprite(MAX_WIDTH/2, MAX_HEIGHT/2, 'screenbg');
    var helloText = this.add.text(MAX_WIDTH/4, (MAX_HEIGHT-120), 'Click or tap to play', {
      fontSize: '32px',
      fill: '#988832'
    });
    this.input.once('pointerdown', function (event) {
      this.sound.add('validate', { volume: 0.3 }, false, false).play();
      // FIXME: figure out how to use transitions...
      var self = this;
      setTimeout(function () {
        self.scene.start('game');
      }, 1000);
    }, this);
  }
}

/*
  GAME SCENE
*/
class GameScene extends Phaser.Scene {
  constructor () {
    super({ key: 'game' });
  }
  preload () {}
  create() {
    resize();

    var self = this;

    var bgMusic = self.sound.add('void', { volume: 0.2 });
    bgMusic.loop = true;
    bgMusic.play();

    this.socket = io();
    this.otherPlayers = this.physics.add.group();
    this.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        if (players[id].playerId === self.socket.id) {
          self.addPlayer(self, players[id]);
        } else {
          self.addOtherPlayers(self, players[id]);
        }
      });
    });
    this.socket.on('newPlayer', function (playerInfo) {
      self.addOtherPlayers(self, playerInfo);
    });
    this.socket.on('disconnect', function (playerId) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          otherPlayer.destroy();
        }
      });
    });
    this.socket.on('playerMoved', function (playerInfo) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          otherPlayer.setRotation(playerInfo.rotation);
          otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        }
      });
    });
    this.cursors = this.input.keyboard.createCursorKeys();

    this.blueScoreText = this.add.text(16, 16, '', { fontSize: '32px', fill: '#0000FF' });
    this.redScoreText = this.add.text(584, 16, '', { fontSize: '32px', fill: '#FF0000' });

    this.socket.on('scoreUpdate', function (scores) {
      self.blueScoreText.setText('Blue: ' + scores.blue);
      self.redScoreText.setText('Red: ' + scores.red);
    });

    this.socket.on('starLocation', function (starLocation) {
      if (self.star) self.star.destroy();
      self.star = self.physics.add.image(starLocation.x, starLocation.y, 'star');
      self.physics.add.overlap(self.ship, self.star, function () {
        this.socket.emit('starCollected');
        self.sound.add('collect', { volume: 0.2 }, false, false).play();
      }, null, self);
    });
  }

  addPlayer(self, playerInfo) {
    self.ship = self.physics.add.image(playerInfo.x, playerInfo.y, 'ship').setOrigin(0.5, 0.5).setDisplaySize(53, 40);
    if (playerInfo.team === 'blue') {
      self.ship.setTint(0x0000ff);
    } else {
      self.ship.setTint(0xff0000);
    }
    self.ship.setDrag(100);
    self.ship.setAngularDrag(100);
    self.ship.setMaxVelocity(200);
  }

  addOtherPlayers(self, playerInfo) {
    const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayer').setOrigin(0.5, 0.5).setDisplaySize(53, 40);
    if (playerInfo.team === 'blue') {
      otherPlayer.setTint(0x0000ff);
    } else {
      otherPlayer.setTint(0xff0000);
    }
    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
  }

  update() {
    if (this.ship) {
      if (this.cursors.left.isDown) {
        this.ship.setAngularVelocity(-150);
      } else if (this.cursors.right.isDown) {
        this.ship.setAngularVelocity(150);
      } else {
        this.ship.setAngularVelocity(0);
      }

      if (this.cursors.up.isDown) {
        this.physics.velocityFromRotation(this.ship.rotation + 1.5, 100, this.ship.body.acceleration);
      } else {
        this.ship.setAcceleration(0);
      }

      this.physics.world.wrap(this.ship, 5);

      // emit player movement
      var x = this.ship.x;
      var y = this.ship.y;
      var r = this.ship.rotation;
      if (this.ship.oldPosition && (x !== this.ship.oldPosition.x || y !== this.ship.oldPosition.y || r !== this.ship.oldPosition.rotation)) {
        this.socket.emit('playerMovement', { x: this.ship.x, y: this.ship.y, rotation: this.ship.rotation });
      }
      // save old position data
      this.ship.oldPosition = {
        x: this.ship.x,
        y: this.ship.y,
        rotation: this.ship.rotation
      };
    }
  }
}

var config = {
  type: Phaser.AUTO,
  parent: 'root',
  width: MAX_WIDTH,
  height: MAX_HEIGHT,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: [
    PreloadScene,
    TitleScene,
    GameScene
  ]
};

var game = new Phaser.Game(config);
game.scene.start('preload');
