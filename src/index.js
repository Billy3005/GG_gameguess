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

io.on('connection', (socket) => {
  console.log('🔌 New user connected:', socket.id);

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
  socket.on('guess', (text) => {
    const guess = { userId: socket.id, guess: text };
    guessHistory.push(guess);
    io.emit('guess', { userId: socket.id, guess: text });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

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
