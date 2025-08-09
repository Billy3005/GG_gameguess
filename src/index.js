const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Baohung305@',
  database: 'drawgame',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const morgan = require('morgan');
const { engine } = require('express-handlebars');
const app = express();
const port = 3000;

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
  console.log('🔌 New user connected:', socket.id);

  players.push({
    id: socket.id,
    name: `Player ${players.length + 1}`, // hoặc lấy từ client
    score: 0,
    role: '',
    isCorrect: false,
  });

  updatePlayers();

  //Gửi dữ liệu cho người mới
  socket.emit('init', {
    drawHistory,
    guessHistory,
  });

  if (players.length >= 2 && !gameStarted) {
    gameStarted = true;
    startTurn(); // Bắt đầu lượt đầu tiên khi có đủ 2 người
  } else if (players.length >= 2) {
    // Nếu đã có game đang chạy, người mới sẽ là guesser
    socket.emit('role', 'guesser');
    socket.emit('startGame'); // Hiện canvas để đoán
  } else {
    socket.emit('waiting', 'Waiting for others...');
  }

  // Nhận dữ liệu vẽ và phát cho người khác
  socket.on('drawing', (data) => {
    drawHistory.push(data);
    socket.broadcast.emit('drawing', data);
  });

  // Nhận đoán và gửi lại cho tất cả
  socket.on('guess', (text) => {
    const guess = { userId: socket.id, guess: text };
    guessHistory.push(guess);
    io.emit('guess', { userId: socket.id, guess: text });

    //logic check keyword
    if (
      text.trim().toLowerCase() === currentWord.trim().toLowerCase() &&
      socket.id !== players[currentDrawerIndex].id
    ) {
      const winner = players.find((p) => p.id === socket.id);
      if (winner) {
        winner.score += 10;
        winner.isCorrect = true;
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
    const [rows] = await pool.query(
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

    io.to(drawer).emit('startDrawing');
    socket.broadcast.emit('otherPlayerDrawing');
  });

  socket.on('timeUp', () => {
    if (socket.id === players[currentDrawerIndex]) {
      // Chỉ người vẽ báo hết giờ mới trigger next turn
      nextTurn();
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    const wasDrawer = socket.id === players[currentDrawerIndex]; // 🟡 Đang là người vẽ?

    // Xóa khỏi danh sách người chơi
    players = players.filter((p) => p.id !== socket.id);
    updatePlayers();

    // Nếu không đủ người chơi thì dừng game
    if (players.length < 2) {
      io.emit('waiting', 'Waiting for other players...');
      currentDrawerIndex = 0;
      return;
    }

    // Nếu người vẽ rời đi → bắt đầu lượt mới với người tiếp theo
    if (wasDrawer) {
      if (currentDrawerIndex >= players.length) {
        currentDrawerIndex = 0;
      }
      nextTurn();
    }
  });
});

//Function

function updatePlayers() {
  io.emit(
    'updatePlayers',
    players.map((p) => ({
      id: p.id,
      name: p.name || p.id.slice(0, 5),
      score: p.score || 0,
      role: p.role || 'guesser', // 'drawer' hoặc 'guesser'
      isCorrect: p.isCorrect || false,
    }))
  );
}

async function chooseWord() {
  try {
    const [rows] = await pool.query(
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

  players.forEach((p, index) => {
    if (index === currentDrawerIndex) {
      p.role = 'drawer';
      p.isCorrect = false;
    } else {
      p.role = 'guesser';
      p.isCorrect = false;
    }
  });
  updatePlayers();

  const drawer = players[currentDrawerIndex];

  // Gửi role cho người chơi
  players.forEach((p, index) => {
    if (index === currentDrawerIndex) {
      io.to(p.id).emit('role', 'drawer');
      io.to(p.id).emit('showChoiceScreen'); // Hiển thị UI "Vẽ" hay "Không vẽ"
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

  currentDrawerIndex = (currentDrawerIndex + 1) % players.length;
  currentWord = await chooseWord();

  players.forEach((p, index) => {
    if (index === currentDrawerIndex) {
      p.role = 'drawer';
      p.isCorrect = false;
    } else {
      p.role = 'guesser';
      p.isCorrect = false;
    }
  });
  updatePlayers();

  const drawer = players[currentDrawerIndex];
  io.to(drawer).emit('yourTurnToDraw', currentWord);

  players.forEach((p, index) => {
    if (index !== currentDrawerIndex) {
      io.to(p.id).emit('role', 'guesser');
    } else {
      io.to(p.id).emit('role', 'drawer');
    }
  });

  drawHistory = [];
  guessHistory = [];

  io.emit('clearCanvas');
  io.emit('startGame');
}

// //drawRoute
// const drawRoute = require('./routes/drawRoute');
// app.use('/', drawRoute);

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

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
