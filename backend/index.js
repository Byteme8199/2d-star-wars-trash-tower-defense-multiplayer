const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"]
  }
});

app.get('/test', (req, res) => {
  res.send('Backend is running');
});
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/coruscant-defense', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// User model
const userSchema = new mongoose.Schema({
  username: String,
  password: String, // In production, hash this
  credits: { type: Number, default: 0 },
  unlocks: [String], // e.g., ['jedi', 'laser-cutter']
  gear: [String], // equipped items
  level: { type: Number, default: 1 },
  isOnline: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// Sub schemas
const enemySchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  health: Number,
  type: String,
  pathIndex: { type: Number, default: 0 }
});

const weaponSchema = new mongoose.Schema({
  id: String,
  x: Number,
  y: Number,
  type: String,
  playerId: String
});

// Shift model for multiplayer shifts
const shiftSchema = new mongoose.Schema({
  id: String,
  players: [{ userId: String, username: String, x: { type: Number, default: 400 }, y: { type: Number, default: 300 } }],
  map: { type: Object, default: {} }, // e.g., path data
  wave: { type: Number, default: 1 },
  overflow: { type: Number, default: 100 },
  scrap: { type: Number, default: 0 },
  enemies: [enemySchema],
  weapons: [weaponSchema],
  status: { type: String, default: 'waiting' }, // waiting, active, ended
  ready: [{ userId: String }]
}, { versionKey: false });

const Shift = mongoose.model('Shift', shiftSchema);

// GlobalState model for planet-wide overflow
const globalStateSchema = new mongoose.Schema({
  overflow: { type: Number, default: 100 },
  lastUpdated: { type: Date, default: Date.now }
});

const GlobalState = mongoose.model('GlobalState', globalStateSchema);

// Routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const trimmedUsername = username.trim();
  const existingUser = await User.findOne({ username: trimmedUsername });
  if (existingUser) {
    return res.status(400).json({ message: 'Username already taken' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username: trimmedUsername, password: hashedPassword });
  await user.save();
  res.json({ message: 'User registered' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username: username.trim() });
  if (user && await bcrypt.compare(password, user.password)) {
    user.isOnline = true;
    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ user, token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/logout', async (req, res) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (user) {
    user.isOnline = false;
    await user.save();
  }
  res.json({ message: 'Logged out' });
});

app.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({ user });
  });
});

// Routes for shifts
app.post('/create-shift', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Creating shift for userId:', userId);
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'User not found' });
    const shiftId = 'shift-' + Date.now();
    const shift = new Shift({ id: shiftId, players: [{ userId, username: user.username, x: 400, y: 300 }], ready: [] });
    console.log('Generating map...');
    const map = generateMap();
    console.log('Generated map start:', map.startPos, 'end:', map.endPos, 'path length:', map.pathSquares.length, 'last square:', map.pathSquares[map.pathSquares.length - 1]);
    if (!map.pathSquares.some(s => s.x === map.endPos.x && s.y === map.endPos.y)) {
      console.error('Path did not reach end!');
    }
    console.log('Map generated, saving shift...');
    shift.map = map;
    await shift.save();
    console.log('Shift saved:', shift.id);
    res.json({ shift });
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/join-shift', async (req, res) => {
  const { shiftId, userId } = req.body;
  const shift = await Shift.findOne({ id: shiftId });
  if (!shift) return res.status(404).json({ message: 'Shift not found' });
  if (shift.players.some(p => p.userId === userId)) return res.status(400).json({ message: 'Already in this shift' });
  if (shift.players.length >= 4) return res.status(400).json({ message: 'Shift full' });
  shift.players.push({ userId, username: (await User.findById(userId)).username, x: 400, y: 300 });
  await shift.save();
  res.json({ shift });
});

app.get('/global-state', async (req, res) => {
  let globalState = await GlobalState.findOne();
  if (!globalState) {
    globalState = new GlobalState();
    await globalState.save();
  }
  res.json({ overflow: globalState.overflow });
});

// Socket.io for multiplayer
const activeShifts = {}; // shiftId -> { shift, intervalId }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-shift', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    socket.join(shiftId);
    // Start game loop if not already running and status is active
    if (!activeShifts[shiftId] && shift.status === 'active') {
      activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
    }
    io.to(shiftId).emit('shift-update', shift);
  });

  socket.on('place-weapon', async (data) => {
    const { shiftId, x, y, type, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return;
    // Check if on path
    let gx = Math.floor(x / 10);
    let gy = Math.floor(y / 10);
    let pathSquares = new Set(shift.map.pathSquares.map(s => `${s.x},${s.y}`));
    if (!pathSquares.has(`${gx},${gy}`)) {
      // Validate placement (e.g., within bounds, not overlapping)
      const valid = x >= 0 && x <= 800 && y >= 0 && y <= 600 && !shift.weapons.some(w => Math.abs(w.x - x) < 50 && Math.abs(w.y - y) < 50);
      if (valid) {
        shift.weapons.push({ id: Date.now().toString(), x, y, type, playerId: userId });
        await shift.save();
        io.to(shiftId).emit('shift-update', shift);
      }
    }
  });

  socket.on('start-shift', async (data) => {
    const { shiftId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift) {
      shift.status = 'active';
      await shift.save();
      // Start loop if not running
      if (!activeShifts[shiftId]) {
        activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
      }
      io.to(shiftId).emit('shift-started', shift);
    }
  });

  socket.on('ready', async (data) => {
    const { shiftId, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift && !shift.ready.some(r => r.userId === userId)) {
      shift.ready.push({ userId });
      await shift.save();
      if (shift.ready.length === shift.players.length) {
        shift.status = 'active';
        await shift.save();
        if (!activeShifts[shiftId]) {
          activeShifts[shiftId] = { shift, intervalId: setInterval(() => gameLoop(shiftId), 1000 / 60) };
        }
        io.to(shiftId).emit('shift-started', shift);
      }
      io.to(shiftId).emit('shift-update', shift);
    }
  });

  socket.on('move', async (data) => {
    const { shiftId, x, y, userId } = data;
    const shift = await Shift.findOne({ id: shiftId });
    if (shift) {
      const player = shift.players.find(p => p.userId === userId);
      if (player) {
        player.x = x;
        player.y = y;
        await shift.save();
        io.to(shiftId).emit('shift-update', shift);
      }
    }
  });

  socket.on('chat-message', (data) => {
    const { shiftId, message, username } = data;
    io.to(shiftId).emit('chat-message', { username, message });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Handle player leaving shift
  });
});

async function gameLoop(shiftId) {
  const shift = await Shift.findOne({ id: shiftId });
  if (!shift || shift.status !== 'active') return;

  // Simulate enemies moving along path
  shift.enemies.forEach(enemy => {
    let nextIndex = enemy.pathIndex + 1;
    if (nextIndex < shift.map.pathSquares.length) {
      let nextSquare = shift.map.pathSquares[nextIndex];
      let targetX = nextSquare.x * 10 + 5;
      let targetY = nextSquare.y * 10 + 5;
      let dx = targetX - enemy.x;
      let dy = targetY - enemy.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2) {
        enemy.pathIndex = nextIndex;
      } else {
        enemy.x += (dx / dist) * 2;
        enemy.y += (dy / dist) * 2;
      }
    } else {
      // reached end
      shift.overflow -= 10;
      shift.enemies = shift.enemies.filter(e => e !== enemy);
    }
  });

  // Simulate weapons firing
  shift.weapons.forEach(weapon => {
    // Find nearest enemy and damage
    const nearest = shift.enemies.find(e => Math.abs(e.x - weapon.x) < 100);
    if (nearest) {
      nearest.health -= 10;
      if (nearest.health <= 0) {
        shift.scrap += 10;
        shift.enemies = shift.enemies.filter(e => e !== nearest);
      }
    }
  });

  // Spawn enemies
  if (Math.random() < 0.01) { // Simple spawn rate
        shift.enemies.push({ id: Date.now().toString(), x: shift.map.startPos.x * 10 + 5, y: shift.map.startPos.y * 10 + 5, health: 100, type: 'basic', pathIndex: 0 });
  }

  // Check win/lose
  if (shift.overflow <= 0) {
    shift.status = 'ended';
    // Update global overflow
    const globalState = await GlobalState.findOne() || new GlobalState();
    globalState.overflow -= 10;
    await globalState.save();
  }

  await shift.save();
  io.to(shiftId).emit('shift-update', shift);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function isValidPath(pathSquares) {
  const n = pathSquares.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) { // skip consecutive
      const dx = Math.abs(pathSquares[i].x - pathSquares[j].x);
      const dy = Math.abs(pathSquares[i].y - pathSquares[j].y);
      if (dx + dy == 1) { // prevent side-adjacent (shared side)
        return false;
      }
    }
  }
  return true;
}

function generateMap() {
  const gridWidth = 80;
  const gridHeight = 60;
  let pathSquares;
  let startPos;
  let endPos;
  // Generate start and end on border
  startPos = { x: 0, y: Math.floor(Math.random() * gridHeight) };
  endPos = { x: gridWidth - 1, y: Math.floor(Math.random() * gridHeight) };
  // Dijkstra with min 5 and max 10 straight runs
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 0: up, 1: right, 2: down, 3: left
  const dist = new Map();
  const cameFrom = new Map();
  const visited = new Set();
  const startKey = `${startPos.x},${startPos.y},-1,0`;
  dist.set(startKey, 0);
  cameFrom.set(startKey, null);
  const pq = new MinHeap();
  pq.push([0, startKey]);
  let found = false;
  let endKey = null;
  while (!pq.isEmpty()) {
    const [cost, current] = pq.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const [cx, cy, cdir, csteps] = current.split(',').map((v, i) => i < 2 ? Number(v) : (i === 2 ? (v === '-1' ? -1 : Number(v)) : Number(v)));
    if (cx === endPos.x && cy === endPos.y) {
      found = true;
      endKey = current;
      break;
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
        const newdir = dirs.findIndex(d => d[0] === dx && d[1] === dy);
        let canMove = false;
        let newsteps;
        if (cdir === -1) {
          // First move, any direction
          canMove = true;
          newsteps = 1;
        } else if (newdir === cdir) {
          // Continuing straight
          if (csteps < 10) {
            canMove = true;
            newsteps = csteps + 1;
          }
        } else {
          // Turning
          if (csteps >= 5) {
            canMove = true;
            newsteps = 1;
          }
        }
        if (canMove) {
          const newCost = cost + 1 + Math.random() * 2;
          const nkey = `${nx},${ny},${newdir},${newsteps}`;
          if (!dist.has(nkey) || newCost < dist.get(nkey)) {
            dist.set(nkey, newCost);
            cameFrom.set(nkey, current);
            pq.push([newCost, nkey]);
          }
        }
      }
    }
  }
  if (!found) {
    // Fallback
    pathSquares = [startPos];
  } else {
    // Reconstruct path
    pathSquares = [];
    let current = endKey;
    while (current) {
      const [x, y] = current.split(',').slice(0, 2).map(Number);
      pathSquares.unshift({ x, y });
      current = cameFrom.get(current);
    }
  }
  return { startPos, endPos, pathSquares };
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  push([cost, key]) {
    this.heap.push([cost, key]);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 1) return this.heap.pop();
    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._sinkDown(0);
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index][0] >= this.heap[parentIndex][0]) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  _sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let smallest = index;
      if (left < length && this.heap[left][0] < this.heap[smallest][0]) smallest = left;
      if (right < length && this.heap[right][0] < this.heap[smallest][0]) smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}