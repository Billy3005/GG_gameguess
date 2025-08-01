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

const setCanvasBackground = () => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = selectedColor; // setting fillstyle back to the selectedColor, it'll be the brush color
};

const resizeCanvas = () => {
  // Lưu lại ảnh cũ
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  const tempImage = ctx.getImageData(0, 0, oldWidth, oldHeight);

  // Resize canvas
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  setCanvasBackground(); // cần gọi lại để không bị nền trắng

  // Scale hình cũ vào canvas mới
  const scaleX = canvas.width / oldWidth;
  const scaleY = canvas.height / oldHeight;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = oldWidth;
  tempCanvas.height = oldHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(tempImage, 0, 0);

  ctx.scale(scaleX, scaleY); // tỉ lệ scale theo chiều mới
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform để không ảnh hưởng việc vẽ tiếp
};

window.addEventListener('resize', () => {
  resizeCanvas();
});

const startDraw = (e) => {
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
  if (!isDrawing) return; // if isDrawing is false return from here
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

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    const guessText = chatInput.value.trim();
    socket.emit('guess', guessText); // Gửi đoán đến server
    chatInput.value = ''; // Xoá input sau khi gửi
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
  const container = canvas.parentElement;
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
