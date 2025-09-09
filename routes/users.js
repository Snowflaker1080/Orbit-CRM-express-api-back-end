const router = require('express').Router();
const verifyToken = require('../middleware/verify-token');
const User = require('../models/User');

// Protect all user routes
router.use(verifyToken);

// GET /api/users  (list all users; consider restricting to admins in future)
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find({}, '-password').lean();
    res.json(users);
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await User.findById(req.params.id, '-password').lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// PUT /api/users/:id  (allow self-update only)
router.put('/:id', async (req, res, next) => {
  try {
    if (req.user._id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
    const { username, email } = req.body || {};
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { ...(username && { username }), ...(email && { email }) } },
      { new: true, projection: '-password' }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/users/:id  (allow self-delete only)
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user._id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
    const deleted = await User.findByIdAndDelete(req.params.id).lean();
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;