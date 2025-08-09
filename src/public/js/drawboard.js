let timer;

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

function showCanvas() {
  document.getElementById('drawing-board__canvas').style.display = 'flex';
  setProgressBar(45, 'drawing-board__canvas-fill', () => {
    document.getElementById('drawing-board__canvas').style.display = 'none';
    document.getElementById('drawing-board__choice').style.display = 'block';
    document.getElementById('drawing-board__first').style.display = 'flex';
    document.getElementById('drawing-board__second').style.display = 'none';
    setProgressBar(10, 'drawing-board__progress-fill', () => startDrawing());
  });
}

function chooseWord(word) {
  // Gửi lên server
  socket.emit('chosenWord', word);

  // Ẩn giao diện chọn
  document.getElementById('drawing-board__choice').style.display = 'none';
}

window.onload = function () {
  setProgressBar(10, 'drawing-board__progress-fill', () => startDrawing());
};
