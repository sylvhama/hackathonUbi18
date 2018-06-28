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
    canvas.style.width = width + "px";
    canvas.style.height = width / ratio + "px";
  } else {
    canvas.style.width = height * ratio + "px";
    canvas.style.height = height + "px";
  }
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/*
  PRELOAD SCENE
*/
class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "preload" });
  }
  preload() {
    window.addEventListener("resize", resize);
    resize();

    this.load.image('ship', 'assets/spaceShips_001.png');
    this.load.image('otherPlayer', 'assets/enemyBlack5.png');
    this.load.image('star', 'assets/star_gold.png');
    this.load.image('titlebg', 'assets/screenbg.jpg');
    this.load.image('gamebg', 'assets/gamebg.jpg');
    this.load.image('upBtn', 'assets/rocket.png');
    this.load.image('leftBtn', 'assets/left_arrow.png');
    this.load.image('rightBtn', 'assets/right_arrow.png');
    this.load.audio('collect', 'assets/audio/collect.mp3');
    this.load.audio('void', 'assets/audio/void.mp3');
    this.load.audio('intro', 'assets/audio/intro.mp3');
    this.load.audio('validate', 'assets/audio/validate.mp3');
    this.load.audio('engine', 'assets/audio/engine.mp3');

    var progressBar = this.add.graphics();
    var progressBox = this.add.graphics();
    progressBox.fillStyle(0x333333, 0.5);
    progressBox.fillRect(240, 270, 320, 50);

    var width = MAX_WIDTH;
    var height = MAX_HEIGHT;
    var loadingText = this.make.text({
      x: width / 2,
      y: height / 2,
      text: "Loading...",
      style: {
        font: "20px monospace",
        fill: "#c0a04d"
      }
    });
    loadingText.setOrigin(0.5, 0.5);

    var percentText = this.make.text({
      x: width / 2,
      y: height / 2 + 70,
      text: "0%",
      style: {
        font: "18px monospace",
        fill: "#fff"
      }
    });
    percentText.setOrigin(0.5, 0.5);

    this.load.on("progress", function(value) {
      percentText.setText(parseInt(value * 100) + "%");
      progressBar.clear();
      progressBar.fillStyle(0xc0a04d, 1);
      progressBar.fillRect(250, 280, 300 * value, 30);
    });

    var self = this;
    this.load.on("complete", function() {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
      self.scene.start("title");
    });
  }
  create() {}
}

/*
  TITLE SCENE (menu)
*/
class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: "title" });
  }
  preload() {}
  create() {
    resize();
    this.sound.add("intro", { volume: 0.2 }, false, false).play();
    this.add.sprite(MAX_WIDTH / 2, MAX_HEIGHT / 2, "titlebg");
    var helloText = this.add.text(
      MAX_WIDTH / 4,
      MAX_HEIGHT - 120,
      "Click or tap to play",
      {
        fontSize: "32px",
        fill: "#c0a04d"
      }
    );
    this.input.once(
      "pointerdown",
      function(event) {
        this.sound.add("validate", { volume: 0.3 }, false, false).play();
        // FIXME: figure out how to use transitions...
        var self = this;
        setTimeout(function() {
          self.scene.start("game");
        }, 500);
      },
      this
    );
  }
}

/*
  GAME SCENE
*/
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "game" });
  }
  preload() {}
  create() {
    resize();

    var self = this;
    self.add.image(MAX_WIDTH / 2, MAX_HEIGHT / 2, "gamebg");

    // Ambient music
    var bgMusic = self.sound.add("void", { volume: 0.2 });
    bgMusic.loop = true;
    bgMusic.play();

    this.socket = io();
    this.otherPlayers = this.physics.add.group();
    this.socket.on("currentPlayers", function(players) {
      Object.keys(players).forEach(function(id) {
        if (players[id].playerId === self.socket.id) {
          self.addPlayer(self, players[id]);
        } else {
          self.addOtherPlayers(self, players[id]);
        }
      });
    });
    this.socket.on("newPlayer", function(playerInfo) {
      self.addOtherPlayers(self, playerInfo);
    });
    this.socket.on("disconnect", function(playerId) {
      self.otherPlayers.getChildren().forEach(function(otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          otherPlayer.destroy();
        }
      });
    });
    this.socket.on("playerMoved", function(playerInfo) {
      self.otherPlayers.getChildren().forEach(function(otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          otherPlayer.setRotation(playerInfo.rotation);
          otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        }
      });
    });

    // If it's not desktop we need to add virtual controlling button
    // Adding !iPhone && !iPad because it seems that desktop=true
    // when device is iPhone or iPad
    if (
      this.sys.game.device.os.desktop &&
      !this.sys.game.device.os.iPhone &&
      !this.sys.game.device.os.iPad
    ) {
      this.cursors = this.input.keyboard.createCursorKeys();
    } else {
      // Add one more pointer for multitouch (basically we need 2)
      this.input.addPointer(1);

      this.cursors = {
        left: { isDown: false },
        right: { isDown: false },
        up: { isDown: false }
      };

      this.upButton = this.add
        .image(750, 400, "upBtn")
        .setOrigin(0.5, 0.5)
        .setAlpha(0.5)
        .setInteractive()
        .on("pointerdown", function() {
          self.cursors.up.isDown = true;
          self.upButton.setAlpha(0.8);
        })
        .on("pointerup", function() {
          self.cursors.up.isDown = false;
          self.upButton.setAlpha(0.5);
        });
      this.leftButton = this.add
        .image(50, 400, "leftBtn")
        .setOrigin(0.5, 0.5)
        .setAlpha(0.5)
        .setInteractive()
        .on("pointerdown", function() {
          self.cursors.left.isDown = true;
          self.leftButton.setAlpha(0.8);
        })
        .on("pointerup", function() {
          self.cursors.left.isDown = false;
          self.leftButton.setAlpha(0.5);
        });
      this.rightButton = this.add
        .image(125, 400, "rightBtn")
        .setOrigin(0.5, 0.5)
        .setAlpha(0.5)
        .setInteractive()
        .on("pointerdown", function() {
          self.cursors.right.isDown = true;
          self.rightButton.setAlpha(0.8);
        })
        .on("pointerup", function() {
          self.cursors.right.isDown = false;
          self.rightButton.setAlpha(0.5);
        });
    }

    this.blueScoreText = this.add.text(16, 16, "", {
      fontSize: "32px",
      fill: "#0000FF"
    });
    this.redScoreText = this.add.text(584, 16, "", {
      fontSize: "32px",
      fill: "#FF0000"
    });

    this.socket.on("scoreUpdate", function(scores) {
      self.blueScoreText.setText("Blue: " + scores.blue);
      self.redScoreText.setText("Red: " + scores.red);
    });

    this.socket.on("starLocation", function(starLocation) {
      if (self.star) self.star.destroy();
      self.star = self.physics.add.image(starLocation.x, starLocation.y, 'star');
      self.physics.add.overlap(self.ship, self.star, function () {
        self.star.destroy();
        this.socket.emit('starCollected');
        self.sound.add('collect', { volume: 0.2 }, false, false).play();
      }, null, self);
    });
  }

  addPlayer(self, playerInfo) {
    self.ship = self.physics.add
      .image(playerInfo.x, playerInfo.y, "ship")
      .setOrigin(0.5, 0.5)
      .setDisplaySize(53, 40);
    if (playerInfo.team === "blue") {
      self.ship.setTint(0x0000ff);
    } else {
      self.ship.setTint(0xff0000);
    }
    self.ship.setDrag(100);
    self.ship.setAngularDrag(100);
    self.ship.setMaxVelocity(200);
  }

  addOtherPlayers(self, playerInfo) {
    const otherPlayer = self.add
      .sprite(playerInfo.x, playerInfo.y, "otherPlayer")
      .setOrigin(0.5, 0.5)
      .setDisplaySize(53, 40);
    if (playerInfo.team === "blue") {
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
        this.physics.velocityFromRotation(
          this.ship.rotation + 1.5,
          100,
          this.ship.body.acceleration
        );
        this.sound.add("engine", { volume: 0.05 }, false, false).play();
      } else {
        this.ship.setAcceleration(0);
      }

      this.physics.world.wrap(this.ship, 5);

      // emit player movement
      var x = this.ship.x;
      var y = this.ship.y;
      var r = this.ship.rotation;
      if (
        this.ship.oldPosition &&
        (x !== this.ship.oldPosition.x ||
          y !== this.ship.oldPosition.y ||
          r !== this.ship.oldPosition.rotation)
      ) {
        this.socket.emit("playerMovement", {
          x: this.ship.x,
          y: this.ship.y,
          rotation: this.ship.rotation
        });
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
  parent: "root",
  width: MAX_WIDTH,
  height: MAX_HEIGHT,
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: [PreloadScene, TitleScene, GameScene]
};

var game = new Phaser.Game(config);
game.scene.start("preload");
