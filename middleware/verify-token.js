// middleware/verify-token.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // you signed: jwt.sign({ user: { _id, username } }, ...)
    const basicUser = decoded?.user;
    if (!basicUser?._id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // load fresh user doc without hashedPassword
    const user = await User.findById(basicUser._id)
      .select('_id username email createdAt')
      .lean();

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = user; // => has _id
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyToken; 