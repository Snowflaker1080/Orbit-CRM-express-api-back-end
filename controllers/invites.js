// controllers/invites.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verify-token');
const Invite = require('../models/Invite');
const crypto = require('crypto');

router.use(verifyToken);

// GET /api/invites
router.get('/', async (req, res, next) => {
  try {
    const invites = await Invite.find({ owner: req.user._id }).lean();
    res.json(invites);
  } catch (err) { next(err); }
});

// POST /api/invites
router.post('/', async (req, res, next) => {
  try {
    const { contactEmail, expiresAt } = req.body || {};
    if (!contactEmail) return res.status(400).json({ error: 'contactEmail is required' });

    const token = crypto.randomBytes(24).toString('hex');
    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await Invite.create({
      owner: req.user._id,
      contactEmail,
      token,
      expiresAt: expiry,
    });

    res.status(201).json(invite);
  } catch (err) { next(err); }
});

// GET /api/invites/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Invite.findOne({ _id: req.params.id, owner: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// PUT /api/invites/:id
router.put('/:id', async (req, res, next) => {
  try {
    const updated = await Invite.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/invites/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Invite.findOneAndDelete({ _id: req.params.id, owner: req.user._id }).lean();
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;