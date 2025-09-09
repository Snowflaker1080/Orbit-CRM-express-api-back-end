// middleware/require-auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // if you encoded user info under decoded.payload, adjust accordingly
    const userId = decoded?.payload?._id || decoded?.id || decoded?._id;

    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user; // attach for downstream handlers
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = requireAuth;