// controllers/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const saltRounds = 12;

// POST /api/auth/sign-up
router.post('/sign-up', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ username }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = await User.create({ username, hashedPassword });

    const token = jwt.sign(
      { user: { _id: user._id.toString(), username: user.username } },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: { _id: user._id, username: user.username },
    });
  } catch (err) {
    // Mongo duplicate-key (e.g. unique index on username or leftover email index)
    if (err && err.code === 11000) {
      const dupField = err.keyValue ? Object.keys(err.keyValue).join(', ') : 'field';
      return res.status(409).json({ error: `Duplicate value for ${dupField}` });
    }
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// POST /api/auth/sign-in
router.post('/sign-in', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user: { _id: user._id.toString(), username: user.username } },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      user: { _id: user._id, username: user.username },
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
