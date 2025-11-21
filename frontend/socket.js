// socket.js - Socket.io event handling

function setupSocketListeners() {
  const socket = window.stateManager.socket;

  socket.on('shift-update', (shift) => {
    window.stateManager.updateShift(shift);
  });

  socket.on('shift-started', (shift) => {
    window.stateManager.updateShift(shift);
  });

  socket.on('chat-message', (data) => {
    // Handle chat message
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      const messageDiv = document.createElement('div');
      messageDiv.textContent = `${data.username}: ${data.message}`;
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  socket.on('shift-ended', () => {
    window.stateManager.shiftEnded = true;
    handleShiftEnd(false);
  });

  // Other listeners can be added here
}

window.setupSocketListeners = setupSocketListeners;