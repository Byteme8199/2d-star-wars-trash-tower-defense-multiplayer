// auth.js - Authentication functions

async function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  if (!username.trim() || !password.trim()) {
    const messageEl = getMessageElement();
    messageEl.textContent = 'Username and password cannot be empty';
    return;
  }
  try {
    const res = await fetch('http://localhost:3001/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      setupAfterLogin(data.user, data.token);
    } else {
      const messageEl = getMessageElement();
      messageEl.textContent = data.message;
    }
  } catch (error) {
    console.error('Login error:', error);
    const messageEl = getMessageElement();
    messageEl.textContent = 'Login failed: ' + error.message;
  }
}

async function handleRegister() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  if (!username.trim() || !password.trim()) {
    showMessage('Username and password cannot be empty');
    return;
  }
  const res = await fetch('http://localhost:3001/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (res.ok) {
    showMessage('Registration successful! Logging you in...');
    const loginRes = await fetch('http://localhost:3001/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const loginData = await loginRes.json();
    if (loginRes.ok) {
      setupAfterLogin(loginData.user, loginData.token);
    } else {
      showMessage('Registration successful, but login failed: ' + loginData.message);
    }
  } else {
    showMessage(data.message);
  }
}

async function handleLogout() {
  await fetch('http://localhost:3001/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: window.stateManager.currentUser._id })
  });
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('nav').style.display = 'none';
  document.getElementById('locker-room').style.display = 'none';
  document.getElementById('ui-overlay').style.display = 'none';
  document.getElementById('tower-panel').style.display = 'none';
  document.getElementById('item-modal').style.display = 'none';
  document.getElementById('boost-modal').style.display = 'none';
  document.getElementById('show-boosts-modal').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('toolbelt-ui').style.display = 'none';
  getMessageElement().textContent = '';
  if (window.stateManager.gameInstance) {
    window.stateManager.gameInstance.destroy(true);
    window.stateManager.gameInstance = null;
  }
  window.stateManager.currentUser = null;
  window.stateManager.currentShiftId = null;
  window.stateManager.previousPlayers = [];
  window.stateManager.selectedIndex = 0;
  window.stateManager.shiftEnded = false;
  if (window.stateManager.socket) {
    window.stateManager.socket.disconnect();
    window.stateManager.socket = null;
  }
  localStorage.removeItem('token');
}

function setupAfterLogin(user, token) {
  window.stateManager.currentUser = user;
  if (!window.stateManager.currentUser.toolbelt || window.stateManager.currentUser.toolbelt.length === 0) {
    window.stateManager.currentUser.toolbelt = [generateWeapon('pressure-washer')];
  }
  localStorage.setItem('token', token);
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('nav').style.display = 'flex';
  document.getElementById('locker-room').style.display = 'block';
  if (typeof populateToolbelt === 'function') populateToolbelt();
  document.getElementById('nav-username').textContent = window.stateManager.currentUser.username;
  window.stateManager.initSocket();
  fetch('http://localhost:3001/create-shift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: window.stateManager.currentUser._id })
  }).then(res => res.json()).then(data => {
    window.stateManager.currentShiftId = data.shift.id;
    document.getElementById('code').textContent = window.stateManager.currentShiftId;
    if (typeof updateStartButton === 'function') updateStartButton(null);
    if (window.stateManager.socket.connected) {
      window.stateManager.socket.emit('join-shift', { shiftId: data.shift.id, userId: window.stateManager.currentUser._id });
    } else {
      window.stateManager.socket.on('connect', () => {
        window.stateManager.socket.emit('join-shift', { shiftId: data.shift.id, userId: window.stateManager.currentUser._id });
      });
    }
    window.stateManager.previousPlayers = [{ userId: window.stateManager.currentUser._id, username: window.stateManager.currentUser.username }];
  }).catch(err => {
    console.error('Create shift error:', err);
    if (err.name === 'AbortError') {
      document.getElementById('code').textContent = 'Timeout generating shift';
    } else {
      document.getElementById('code').textContent = 'Error generating shift';
    }
  });
}

// Check for existing token on page load
window.addEventListener('load', async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const res = await fetch('http://localhost:3001/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) {
        setupAfterLogin(data.user, token);
      } else {
        localStorage.removeItem('token');
      }
    } catch (err) {
      console.error('Token validation error:', err);
      localStorage.removeItem('token');
    }
  }
});