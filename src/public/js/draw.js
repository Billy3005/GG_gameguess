const canvas = document.querySelector('canvas'),
  toolBtns = document.querySelectorAll('.tool'),
  fillColor = document.querySelector('#fill-color'),
  sizeSlider = document.querySelector('#size-slider'),
  colorBtns = document.querySelectorAll('.colors .option'),
  colorPicker = document.querySelector('#color-picker'),
  clearCanvas = document.querySelector('.clear-canvas'),
  saveImg = document.querySelector('.save-img'),
  ctx = canvas.getContext('2d');

// global variables with default value
let prevMouseX,
  prevMouseY,
  snapshot,
  isDrawing = false,
  selectedTool = 'brush',
  brushWidth = 5,
  selectedColor = '#000';

let lastX, lastY;
let canPlay = false;
let isDrawer = false;
let canGuess = false;
let timer;

const setCanvasBackground = () => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = selectedColor; // setting fillstyle back to the selectedColor, it'll be the brush color
};

const resizeCanvas = () => {
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;

  let tempImage = null;
  if (oldWidth > 0 && oldHeight > 0) {
    tempImage = ctx.getImageData(0, 0, oldWidth, oldHeight);
  }

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  setCanvasBackground();

  const scaleX = canvas.width / oldWidth;
  const scaleY = canvas.height / oldHeight;

  if (tempImage) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = oldWidth;
    tempCanvas.height = oldHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(tempImage, 0, 0);

    ctx.scale(scaleX, scaleY);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
};

window.addEventListener('resize', () => {
  resizeCanvas();
});

const startDraw = (e) => {
  if (!isDrawer) return;
  isDrawing = true;
  prevMouseX = e.offsetX; // passing current mouseX position as prevMouseX value
  prevMouseY = e.offsetY; // passing current mouseY position as prevMouseY value
  lastX = e.offsetX;
  lastY = e.offsetY;

  ctx.beginPath(); // creating new path to draw
  ctx.lineWidth = brushWidth; // passing brushSize as line width
  ctx.strokeStyle = selectedColor; // passing selectedColor as stroke style
  ctx.fillStyle = selectedColor; // passing selectedColor as fill style
  // copying canvas data & passing as snapshot value.. this avoids dragging the image
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
};

const socket = io(); // Mặc định kết nối tới server đang chạy

const drawing = (e) => {
  if (!isDrawing || !isDrawer) return;
  ctx.putImageData(snapshot, 0, 0); // adding copied canvas data on to this canvas

  const currentX = e.offsetX;
  const currentY = e.offsetY;

  ctx.strokeStyle = selectedTool === 'eraser' ? '#fff' : selectedColor;
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();

  // Gửi dữ liệu vẽ
  if (typeof lastX === 'number' && typeof lastY === 'number') {
    socket.emit('drawing', {
      prevX: lastX,
      prevY: lastY,
      x: currentX,
      y: currentY,
      color: selectedTool === 'eraser' ? '#fff' : selectedColor,
      width: brushWidth,
    });
  }

  lastX = currentX;
  lastY = currentY;
};

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelector('.options .active').classList.remove('active');
    btn.classList.add('active');
    selectedTool = btn.id;
  });
});

sizeSlider.addEventListener('change', () => (brushWidth = sizeSlider.value));

colorBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelector('.options .selected').classList.remove('selected');
    btn.classList.add('selected');
    selectedColor = window
      .getComputedStyle(btn)
      .getPropertyValue('background-color');
  });
});

colorPicker.addEventListener('change', () => {
  colorPicker.parentElement.style.background = colorPicker.value;
  colorPicker.parentElement.click();
});

clearCanvas.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // clearing whole canvas
  setCanvasBackground();
});

saveImg.addEventListener('click', () => {
  const link = document.createElement('a'); // creating <a> element
  link.download = `${Date.now()}.jpg`; // passing current date as link download value
  link.href = canvas.toDataURL(); // passing canvasData as link href value
  link.click(); // clicking link to download image
});

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', drawing);
canvas.addEventListener('mouseup', () => (isDrawing = false));

//GUESS
const chatInput = document.querySelector('.chat_input');
const chatBody = document.querySelector('.chat_body');

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    if (!canGuess) return;
    socket.emit('guess', chatInput.value.trim());
    chatInput.value = '';
  }
});

socket.on('guess', (data) => {
  const div = document.createElement('div');
  div.classList.add('guess'); // class để định dạng CSS
  div.textContent = `👤 ${data.userId.slice(0, 5)}: ${data.guess}`; // Cắt gọn ID cho đẹp
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight; // Tự cuộn xuống dòng mới
});

//Socket IO

socket.on('drawing', (data) => {
  if (
    typeof data.prevX !== 'number' ||
    typeof data.prevY !== 'number' ||
    typeof data.x !== 'number' ||
    typeof data.y !== 'number'
  )
    return;

  ctx.beginPath();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.width;
  ctx.moveTo(data.prevX, data.prevY); // từ điểm trước
  ctx.lineTo(data.x, data.y); // đến điểm mới
  ctx.stroke();
});

socket.on('init', (data) => {
  // Đảm bảo canvas đã resize trước khi vẽ
  const container = document.getElementById('drawing-board__canvas');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  setCanvasBackground();

  data.drawHistory.forEach((line) => {
    if (
      typeof line.prevX !== 'number' ||
      typeof line.prevY !== 'number' ||
      typeof line.x !== 'number' ||
      typeof line.y !== 'number'
    )
      return;

    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width;
    ctx.moveTo(line.prevX, line.prevY);
    ctx.lineTo(line.x, line.y);
    ctx.stroke();
  });

  // Gửi đoán
  data.guessHistory.forEach((g) => {
    const div = document.createElement('div');
    div.classList.add('guess');
    div.textContent = `👤 ${g.userId.slice(0, 5)}: ${g.guess}`;
    chatBody.appendChild(div);
  });

  chatBody.scrollTop = chatBody.scrollHeight;
});

socket.on('startGame', () => {
  canPlay = true;
  document.getElementById('drawing-board__first').style.display = 'flex'; //Mặc định
  document.querySelector('.drawing-board__progress').style.display = 'block'; //Mặc định
});

// Khi chưa đủ người
socket.on('waiting', (playerCount) => {
  alert(`Waiting for other players`);
});

socket.on('yourTurnToDraw', () => {
  isDrawer = true;
  canGuess = false;
  document.getElementById('drawing-board__choice').style.display = 'block';
});

socket.on('startDrawing', () => {
  isDrawer = true;
  document.getElementById('drawing-board__choice').style.display = 'none';
  document.getElementById('drawing-board__canvas').style.display = 'block';
  resizeCanvas();
});

socket.on('otherPlayerDrawing', () => {
  isDrawer = false;
  canGuess = true;
  document.getElementById('drawing-board__choice').style.display = 'none';
  document.getElementById('drawing-board__canvas').style.display = 'block';
  resizeCanvas();
});

socket.on('startRound', () => {
  setProgressBar(45, 'drawing-board__canvas-fill', () => {
    socket.emit('timeUp'); // Chỉ thông báo cho server
  });
});

//Role
socket.on('role', (role) => {
  if (role === 'drawer') {
    isDrawer = true;
    canGuess = false;

    // Hiện first, ẩn second và canvas
    document.getElementById('drawing-board__choice').style.display = 'block';
    document.getElementById('drawing-board__first').style.display = 'flex';
    document.getElementById('drawing-board__second').style.display = 'none';
    document.getElementById('drawing-board__canvas').style.display = 'none';
  } else {
    isDrawer = false;
    canGuess = true;

    // Ẩn tất cả UI chọn vẽ, chỉ để canvas đoán
    document.getElementById('drawing-board__choice').style.display = 'none';
    document.getElementById('drawing-board__canvas').style.display = 'block';
  }
});

//Guess correctly
socket.on('correctGuess', (data) => {
  alert(`🎉 ${data.winnerId.slice(0, 5)} đã đoán đúng từ "${data.word}"!`);
});

socket.on('clearCanvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasBackground();
  chatBody.innerHTML = ''; // Xoá đoạn chat cũ
});

//Choose Word

function chooseWord(word) {
  socket.emit('selectedWord', word);
  document.getElementById('drawing-board__choice').style.display = 'none';
  document.getElementById('drawing-board__canvas').style.display = 'block';
  resizeCanvas();
  setProgressBar(45, 'drawing-board__canvas-fill', () => {});
}

socket.on('chooseWordOptions', (words) => {
  document.getElementById('drawing-board__choice').style.display = 'block';
  document.getElementById('drawing-board__canvas').style.display = 'none';

  const secondUI = document.getElementById('drawing-board__second');
  secondUI.style.display = 'flex';

  // Tìm phần .drawing-board__options
  const optionsContainer = secondUI.querySelector('.drawing-board__options');
  optionsContainer.innerHTML = ''; // Xoá các nút cũ nếu có

  // Thêm các nút mới vào .drawing-board__options
  words.forEach((word) => {
    const btn = document.createElement('button');
    btn.textContent = word;
    btn.classList.add('drawing-board__button');
    btn.onclick = () => chooseWord(word);
    optionsContainer.appendChild(btn);
  });
});

socket.on('selectedWord', (word) => {
  currentWord = word;

  // Thông báo cho người chơi khác là bắt đầu vẽ
  socket.broadcast.emit('otherPlayerDrawing');

  io.emit('startGame'); // Giữ lại nếu cần cho UI hiển thị canvas
});

//Drawboard.js
function handleChoice(choice) {
  if (choice === 'draw') {
    // Ẩn first, hiển thị second để chọn từ
    document.getElementById('drawing-board__first').style.display = 'none';
    document.getElementById('drawing-board__second').style.display = 'flex';

    // Gửi yêu cầu server gửi danh sách từ
    socket.emit('requestWordOptions');
  } else {
    // Không vẽ → thông báo server để đổi lượt
    socket.emit('skipDrawing');
    document.getElementById('drawing-board__choice').style.display = 'none';
  }
}

function setProgressBar(duration, barId, callback) {
  const fill = document.getElementById(barId);
  fill.style.transition = 'none';
  fill.style.width = '100%';
  setTimeout(() => {
    fill.style.transition = `width ${duration}s linear`;
    fill.style.width = '0%';
  }, 50);

  clearTimeout(timer);
  timer = setTimeout(callback, duration * 1000);
}

function startDrawing() {
  document.getElementById('drawing-board__choice').style.display = 'none';
  document.getElementById('drawing-board__canvas').style.display = 'flex';

  // đảm bảo canvas có kích thước hợp lệ trước khi vẽ
  requestAnimationFrame(() => {
    resizeCanvas();
    setProgressBar(45, 'drawing-board__canvas-fill', () => {}); //Thêm code code sau khi hêt thời gian vẽ làm gì tiếp theo trong hàm
  });
}

socket.on('syncTimer', (remainingTime) => {
  setProgressBar(remainingTime, 'drawing-board__canvas-fill', () => {});
});

socket.on('stopTimer', () => {
  clearTimeout(timer);
  const fill = document.getElementById('drawing-board__canvas-fill');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%'; // Dừng ngay lập tức
  }
});

//Bảng người chơi
socket.on('updatePlayers', (players) => {
  const sidebar = document.querySelector('.player-drawing .player_playing');
  if (!sidebar) return;

  sidebar.innerHTML = ''; // Xóa danh sách cũ

  players.forEach((p) => {
    const playerDiv = document.createElement('div');
    playerDiv.classList.add('player');

    // Icon người vẽ
    const drawerIcon = p.role === 'drawer' ? '✏️ ' : '';

    playerDiv.innerHTML = `
      <div class="player_main">
        <div class="player_avatar"></div>
        <div class="player_detail">
          <div class="player_name">${drawerIcon}${p.name}</div>
          <div class="player_score">${
            p.score
          } <p class="player_score_text">pts</p></div>
        </div>
      </div>
      ${
        p.isCorrect
          ? `
        <div class="greentick">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10L8 14L16 6" stroke="#28a745" stroke-width="2" fill="none"/>
          </svg>
        </div>
      `
          : ''
      }
    `;

    sidebar.appendChild(playerDiv);
  });
});

window.onload = function () {
  setProgressBar(10, 'drawing-board__progress-fill', () => startDrawing());
};
