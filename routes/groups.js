const router = require('express').Router();
const verifyToken = require('../middleware/verify-token');
const Group = require('../models/Group');

router.use(verifyToken);

// GET /api/groups
router.get('/', async (req, res, next) => {
  try {
    const groups = await Group.find({ owner: req.user._id }).lean();
    res.json(groups);
  } catch (err) { next(err); }
});

// POST /api/groups
router.post('/', async (req, res, next) => {
  try {
    const { name, type } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const group = await Group.create({ name, type, owner: req.user._id, members: [] });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

// GET /api/groups/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Group.findOne({ _id: req.params.id, owner: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// PUT /api/groups/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, type, members } = req.body || {};
    const updated = await Group.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: { ...(name && { name }), ...(type && { type }), ...(members && { members }) } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Group.findOneAndDelete({ _id: req.params.id, owner: req.user._id }).lean();
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;