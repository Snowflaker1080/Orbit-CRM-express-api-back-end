const router = require('express').Router();
const verifyToken = require('../middleware/verify-token');
const Reminder = require('../models/Reminder');

router.use(verifyToken);

// GET /api/reminders
router.get('/', async (req, res, next) => {
  try {
    const reminders = await Reminder.find({ owner: req.user._id }).lean();
    res.json(reminders);
  } catch (err) { next(err); }
});

// POST /api/reminders
router.post('/', async (req, res, next) => {
  try {
    const { contact, frequency, nextAt, note } = req.body || {};
    if (!frequency || !nextAt) return res.status(400).json({ error: 'frequency and nextAt are required' });
    const reminder = await Reminder.create({ owner: req.user._id, contact, frequency, nextAt, note });
    res.status(201).json(reminder);
  } catch (err) { next(err); }
});

// GET /api/reminders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Reminder.findOne({ _id: req.params.id, owner: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// PUT /api/reminders/:id
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await Reminder.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Reminder.findOneAndDelete({ _id: req.params.id, owner: req.user._id }).lean();
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;