const express = require('express');
const { User, Shift, GlobalState } = require('./models');

function setupRoutes(app) {
  // Register
  app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });
    const user = new User({ username, password, credits: 0, unlocks: ['laser-cutter'], toolbelt: ['laser-cutter'] });
    await user.save();
    res.json({ message: 'Registered' });
  });

  // Login
  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    user.isOnline = true;
    await user.save();
    const userObj = { _id: user._id, username: user.username, credits: user.credits, unlocks: user.unlocks, toolbelt: user.toolbelt };
    res.json({ user: userObj, token: user._id.toString() });
  });

  // Logout
  app.post('/logout', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ _id: userId });
    if (user) {
      user.isOnline = false;
      await user.save();
    }
    res.json({ message: 'Logged out' });
  });

  // Me
  app.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const userId = authHeader.split(' ')[1];
    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userObj = { _id: user._id, username: user.username, credits: user.credits, unlocks: user.unlocks, toolbelt: user.toolbelt };
    res.json({ user: userObj });
  });

  // Create shift
  app.post('/create-shift', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const shiftId = Date.now().toString();
    const shift = new Shift({
      id: shiftId,
      players: [{ userId, username: user.username, x: 500, y: 500, inventory: [], boosts: [], scrap: 0, boostChoices: null, lastPlaced: 0, pickupRadius: 50, pickupThreshold: 100, previousPickupThreshold: 0 }],
      map: generateMap(),
      status: 'waiting'
    });
    await shift.save();
    res.json({ shiftId });
  });

  // Join shift
  app.post('/join-shift', async (req, res) => {
    const { shiftId, userId } = req.body;
    const shift = await Shift.findOne({ id: shiftId });
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (shift.status !== 'waiting') return res.status(400).json({ error: 'Shift already started' });
    if (shift.players.length >= 4) return res.status(400).json({ error: 'Shift full' });
    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    shift.players.push({ userId, username: user.username, x: 500 + shift.players.length * 50, y: 500, inventory: [], boosts: [], scrap: 0, boostChoices: null, lastPlaced: 0, pickupRadius: 50, pickupThreshold: 100, previousPickupThreshold: 0 });
    await shift.save();
    res.json({ message: 'Joined' });
  });

  // Global state
  app.get('/global-state', async (req, res) => {
    let state = await GlobalState.findOne();
    if (!state) {
      state = new GlobalState({ overflow: 100 });
      await state.save();
    }
    res.json({ overflow: state.overflow });
  });

  // Buy unlock
  app.post('/buy-unlock', async (req, res) => {
    const { userId, type } = req.body;
    const user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const price = { 'missile-launcher': 500, 'laser-cutter': 300, 'waste-escape-pod': 1000, 'flame-thrower': 700, 'railgun': 1500 }[type];
    if (!price) return res.status(400).json({ error: 'Invalid type' });
    if (user.credits < price) return res.status(400).json({ error: 'Not enough credits' });
    user.credits -= price;
    user.unlocks.push(type);
    await user.save();
    res.json({ unlocks: user.unlocks, credits: user.credits });
  });
}

module.exports = { setupRoutes };