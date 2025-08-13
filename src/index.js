const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const morgan = require('morgan');
const { engine } = require('express-handlebars');

const app = express();
const port = 3000;

//Database
const { sequelize, connect } = require('./config/db/db.js');
connect(); // Gọi hàm kết nối DB
const PlayerModel = require('../src/app/models/Player.js')(sequelize);

//IO
const server = http.createServer(app); // Tạo server HTTP từ Express app
const io = new Server(server); //Kết nối Socket.IO vào server HTTP để lắng nghe kết nối WebSocket từ client

let drawHistory = [];
let guessHistory = [];
let players = []; // [{id, name, score, isCorrect}]
let currentDrawerIndex = 0;
let currentWord = '';
let gameStarted = false;

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('joinGame', async (playerName) => {
    if (!playerName || playerName.trim() === '') {
      console.log('❌ Invalid player name');
      return;
    }

    // Kiểm tra xem player đã tồn tại chưa
    const existingPlayer = players.find((p) => p.id === socket.id);
    if (existingPlayer) {
      console.log('Player already exists:', socket.id);
      return;
    }

    let playerScore = 0;

    // Kiểm tra xem player đã từng chơi chưa (dựa trên tên)
    try {
      const existingDbPlayer = await PlayerModel.findOne({
        where: { player_name: playerName.trim() },
      });

      if (existingDbPlayer) {
        playerScore = existingDbPlayer.score || 0;
        console.log(
          `Returning player ${playerName} with score: ${playerScore}`
        );

        // Cập nhật socket_id mới
        await PlayerModel.update(
          { socket_id: socket.id },
          { where: { player_name: playerName.trim() } }
        );
      }
    } catch (error) {
      console.error('❌ Error checking existing player:', error);
    }

    const newPlayer = {
      id: socket.id,
      name: playerName.trim(),
      score: playerScore,
      role: 'guesser',
      isCorrect: false,
    };

    players.push(newPlayer);
    updatePlayers();

    // Lưu vào DB (hoặc update nếu đã có)
    try {
      const [player, created] = await PlayerModel.findOrCreate({
        where: { player_name: newPlayer.name },
        defaults: {
          socket_id: newPlayer.id,
          player_name: newPlayer.name,
          score: newPlayer.score,
        },
      });

      if (!created) {
        // Player đã tồn tại, chỉ update socket_id
        await player.update({ socket_id: newPlayer.id });
      }
    } catch (err) {
      console.error('❌ Error saving player to DB:', err.message);
    }

    // Game logic
    if (players.length >= 2 && !gameStarted) {
      gameStarted = true;
      startTurn(); // Bắt đầu lượt đầu tiên khi có đủ 2 người
    } else if (players.length >= 2 && gameStarted) {
      socket.emit('role', 'guesser');
      socket.emit('startGame');

      // Gửi thông tin người vẽ hiện tại cho người mới
      const currentDrawer = players[currentDrawerIndex];
      if (currentDrawer) {
        socket.emit('updateCurrentDrawer', {
          id: currentDrawer.id,
          name:
            currentDrawer.name ||
            currentDrawer.player_name ||
            currentDrawer.id.slice(0, 5),
        });
      }
    } else {
      socket.emit('waiting', 'Waiting for others...');
    }
  });

  //Gửi dữ liệu cho người mới
  socket.emit('init', {
    drawHistory,
    guessHistory,
  });

  // Nhận dữ liệu vẽ và phát cho người khác
  socket.on('drawing', (data) => {
    drawHistory.push(data);
    socket.broadcast.emit('drawing', data);
  });

  // Nhận đoán và gửi lại cho tất cả
  socket.on('guess', async (text) => {
    // Tìm player để lấy tên
    const player = players.find((p) => p.id === socket.id);
    const playerName = player ? player.name : socket.id.slice(0, 5);

    const guess = { username: playerName, guess: text };
    guessHistory.push(guess);
    io.emit('guess', { username: playerName, guess: text });

    //logic check keyword
    if (
      text.trim().toLowerCase() === currentWord.trim().toLowerCase() &&
      socket.id !== players[currentDrawerIndex].id
    ) {
      const winner = players.find((p) => p.id === socket.id);
      if (winner) {
        // Cập nhật điểm trong memory
        winner.score += 10;
        winner.isCorrect = true;

        // Cập nhật điểm trong database
        try {
          await PlayerModel.update(
            { score: winner.score },
            { where: { socket_id: winner.id } }
          );
        } catch (error) {
          console.error('❌ Error updating score in DB:', error);
        }

        updatePlayers();
      }

      io.emit('stopTimer');

      // Delay chuyển lượt
      setTimeout(() => {
        nextTurn();
      }, 3000);
    }
  });

  socket.on('requestWordOptions', async () => {
    const [rows] = await sequelize.query(
      'SELECT keyword FROM Keywords ORDER BY RAND() LIMIT 2'
    );

    const wordOptions = rows.map((r) => r.keyword);
    socket.emit('chooseWordOptions', wordOptions);
  });

  socket.on('skipDrawing', () => {
    io.emit('stopTimer');
    nextTurn();
  });

  socket.on('selectedWord', (word) => {
    currentWord = word;

    const drawer = players[currentDrawerIndex];

    // Phát cho tất cả người chơi sự kiện bắt đầu round
    io.emit('startRound');

    io.to(drawer.id).emit('startDrawing');
    socket.broadcast.emit('otherPlayerDrawing');
  });

  socket.on('timeUp', () => {
    nextTurn();
  });

  socket.on('clearImg', () => {
    const player = players.find((p) => p.id === socket.id);
    if (player && player.role === 'drawer') {
      io.emit('clear');
    }
  });

  socket.on('disconnect', async () => {
    console.log('❌ User disconnected:', socket.id);
    const wasDrawer = socket.id === players[currentDrawerIndex]?.id;

    const playerToRemove = players.find((p) => p.id === socket.id);
    if (playerToRemove) {
      players = players.filter((p) => p.id !== socket.id);
      updatePlayers();

      await removePlayerFromDB(playerToRemove.id);

      if (players.length < 2) {
        io.emit('waiting', 'Waiting for other players...');
        currentDrawerIndex = 0;
        io.emit('clearCanvas');
        gameStarted = false;
        return;
      }

      if (wasDrawer) {
        if (currentDrawerIndex >= players.length) {
          currentDrawerIndex = 0;
        }
        nextTurn();
      }
    }
  });
});

//Function

function updatePlayers() {
  const currentDrawer = players[currentDrawerIndex];

  // Gửi thông tin danh sách players
  io.emit(
    'updatePlayers',
    players.map((p) => ({
      id: p.id,
      name: p.name || p.player_name || p.id.slice(0, 5),
      score: p.score || 0,
      role: p.role || 'guesser', // 'drawer' hoặc 'guesser'
      isCorrect: p.isCorrect || false,
    }))
  );

  // Gửi thông tin người vẽ hiện tại riêng biệt
  if (currentDrawer && players.length >= 2) {
    const drawerInfo = {
      id: currentDrawer.id,
      name:
        currentDrawer.name ||
        currentDrawer.player_name ||
        currentDrawer.id.slice(0, 5),
    };

    console.log('Sending updateCurrentDrawer:', drawerInfo.name);
    io.emit('updateCurrentDrawer', drawerInfo);
  }
}

async function chooseWord() {
  try {
    const [rows] = await sequelize.query(
      'SELECT keyword FROM Keywords ORDER BY RAND() LIMIT 1'
    );

    return rows[0].keyword;
  } catch (error) {
    console.error('Error choosing word:', error);
    return null;
  }
}

async function startTurn() {
  if (players.length < 2) return;

  // Reset tất cả về guesser
  players.forEach((p) => {
    p.role = 'guesser';
    p.isCorrect = false;
  });

  // Chỉ định drawer
  players[currentDrawerIndex].role = 'drawer';

  const drawer = players[currentDrawerIndex];

  console.log(`Starting turn - Drawer: ${drawer.name} (${drawer.id})`);

  updatePlayers();

  io.emit('newTurnStarted', {
    currentDrawer: {
      id: drawer.id,
      name: drawer.name || drawer.player_name || drawer.id.slice(0, 5),
    },
  });

  // Gửi role cho từng người chơi
  players.forEach((p, index) => {
    if (index === currentDrawerIndex) {
      io.to(p.id).emit('role', 'drawer');
    } else {
      io.to(p.id).emit('role', 'guesser');
    }
  });

  drawHistory = [];
  guessHistory = [];

  io.emit('clearCanvas');
}

async function nextTurn() {
  if (players.length < 2) return;

  // Thưởng điểm cho drawer nếu có người đoán đúng
  const currentDrawer = players[currentDrawerIndex];
  const hasCorrectGuess = players.some((p) => p.isCorrect);

  if (hasCorrectGuess && currentDrawer) {
    currentDrawer.score += 5; // Drawer được 5 điểm

    // Cập nhật điểm drawer trong database
    try {
      await PlayerModel.update(
        { score: currentDrawer.score },
        { where: { socket_id: currentDrawer.id } }
      );
    } catch (error) {
      console.error('❌ Error updating drawer score in DB:', error);
    }
  }

  // Chuyển lượt
  currentDrawerIndex = (currentDrawerIndex + 1) % players.length;
  currentWord = await chooseWord();

  // Reset tất cả về guesser
  players.forEach((p) => {
    p.role = 'guesser';
    p.isCorrect = false;
  });

  // Chỉ định drawer mới
  players[currentDrawerIndex].role = 'drawer';

  const newDrawer = players[currentDrawerIndex];

  console.log(`Next turn - New Drawer: ${newDrawer.name} (${newDrawer.id})`);

  // Cập nhật players và gửi thông tin người vẽ mới
  updatePlayers();

  // Gửi sự kiện turn mới
  io.emit('newTurnStarted', {
    currentDrawer: {
      id: newDrawer.id,
      name: newDrawer.name || newDrawer.player_name || newDrawer.id.slice(0, 5),
    },
  });

  // Gửi role cho từng người
  players.forEach((p, index) => {
    if (index === currentDrawerIndex) {
      io.to(p.id).emit('role', 'drawer');
      io.to(p.id).emit('yourTurnToDraw', currentWord);
    } else {
      io.to(p.id).emit('role', 'guesser');
    }
  });

  drawHistory = [];
  guessHistory = [];

  io.emit('clearCanvas');
  io.emit('startGame');
}

// Function delete from database
async function removePlayerFromDB(socketId) {
  try {
    await PlayerModel.destroy({
      where: { socket_id: socketId },
    });
    console.log(`Player with socket_id=${socketId} removed from DB`);
  } catch (error) {
    console.error('Error removing player from DB:', error);
  }
}

app.use(express.static(path.join(__dirname, 'public'))); //Static files middleware

app.use(morgan('combined'));

app.engine(
  'hbs',
  engine({
    extname: '.hbs',
  })
);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'resources', 'views'));

app.get('/', (req, res) => {
  res.render('home');
});

//drawRoute
const drawRoute = require('./routes/drawRoute');
app.use('/', drawRoute);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
