// controllers/contacts.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Contact = require('../models/Contact');
const Group = require('../models/Group');
const verifyToken = require('../middleware/verify-token');
const { computeNextDue } = require('../utils/connection-utils');

// Auth guard for all routes
router.use(verifyToken);

// Defensive guard in case verifyToken didn't attach a user
router.use((req, res, next) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

const isId = mongoose.isValidObjectId;

/* ------------------------ Helpers ------------------------ */

// Basic URL normaliser for socials  // <<< socials
function normaliseUrl(url) {
  if (!url) return '';
  const v = String(url).trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;                     // already http(s)
  if (/^[\w.-]+\.[a-z]{2,}($|\/)/i.test(v)) return `https://${v}`; // bare domain
  return v; // allow handles like @name
}

// Build a safe socials object (drops undefined and normalises) // <<< socials
function buildSocials(s = {}) {
  if (!s || typeof s !== 'object') return undefined;
  const out = {
    website:   s.website   != null ? normaliseUrl(s.website)   : undefined,
    linkedin:  s.linkedin  != null ? normaliseUrl(s.linkedin)  : undefined,
    twitter:   s.twitter   != null ? normaliseUrl(s.twitter)   : undefined,
    instagram: s.instagram != null ? normaliseUrl(s.instagram) : undefined,
    facebook:  s.facebook  != null ? normaliseUrl(s.facebook)  : undefined,
    github:    s.github    != null ? normaliseUrl(s.github)    : undefined,
    other1:    s.other1    != null ? normaliseUrl(s.other1)    : undefined,
    other2:    s.other2    != null ? normaliseUrl(s.other2)    : undefined,
  };
  // remove undefined keys so we don't overwrite existing values with undefined
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return Object.keys(out).length ? out : undefined;
}

// Sync Contact.groups <-> Group.members
async function syncContactGroupMembership({ session, ownerId, contactId, incomingGroupIds }) {
  const validGroups = incomingGroupIds?.length
    ? await Group.find(
        { _id: { $in: incomingGroupIds }, owner: ownerId },
        { _id: 1 }
      ).session(session)
    : [];
  const validIds = validGroups.map((g) => g._id.toString());

  const currentContact = await Contact.findOne(
    { _id: contactId, owner: ownerId },
    { groups: 1 }
  )
    .lean()
    .session(session);

  const currentIds = (currentContact?.groups || []).map((id) => id.toString());

  const toAdd = validIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !validIds.includes(id));

  // Update contact.groups to the valid set
  await Contact.updateOne(
    { _id: contactId, owner: ownerId },
    { $set: { groups: validIds } },
    { session }
  );

  if (toAdd.length) {
    await Group.updateMany(
      { _id: { $in: toAdd }, owner: ownerId },
      { $addToSet: { members: contactId } },
      { session }
    );
  }
  if (toRemove.length) {
    await Group.updateMany(
      { _id: { $in: toRemove }, owner: ownerId },
      { $pull: { members: contactId } },
      { session }
    );
  }
}

// Normalise connection fields from flat payload (back-compat)
function extractConnectionFromPayload(payload = {}) {
  const out = {};

  if (payload.firstConnectedAt !== undefined) {
    out.firstConnectedAt = payload.firstConnectedAt ? new Date(payload.firstConnectedAt) : null;
  }
  if (payload.lastConnectedAt !== undefined) {
    out.lastConnectedAt = payload.lastConnectedAt ? new Date(payload.lastConnectedAt) : null;
  }
  if (payload.connection?.firstConnectedAt !== undefined) {
    out.firstConnectedAt = payload.connection.firstConnectedAt ? new Date(payload.connection.firstConnectedAt) : null;
  }
  if (payload.connection?.lastConnectedAt !== undefined) {
    out.lastConnectedAt = payload.connection.lastConnectedAt ? new Date(payload.connection.lastConnectedAt) : null;
  }
  if (payload.connection?.frequencyDays !== undefined) {
    out.frequencyDays = Number(payload.connection.frequencyDays);
  }
  if (payload.connection?.snoozedUntil !== undefined) {
    out.snoozedUntil = payload.connection.snoozedUntil ? new Date(payload.connection.snoozedUntil) : null;
  }
  if (payload.connection?.isActive !== undefined) {
    out.isActive = !!payload.connection.isActive;
  }

  return out;
}

/* ------------------------ Routes ------------------------ */

// GET /api/contacts  -> list current user's contacts (supports ?group=<id>)
router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { group } = req.query;

    const query = { owner: ownerId };
    if (group && isId(group)) {
      query.groups = group;
    }

    const contacts = await Contact.find(query)
      .sort({ lastName: 1, firstName: 1, createdAt: -1 })
      .lean();

    return res.json(contacts);
  } catch (err) {
    return next(err);
  }
});

// POST /api/contacts -> create (and sync groups if provided)
// Accepts legacy firstConnectedAt / lastConnectedAt but stores under connection.*
router.post('/', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const ownerId = req.user._id;
    const payload = req.body || {};

    if (payload.email && typeof payload.email !== 'string') {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      city,
      country,
      notes,
      groups,   // optional array of group ids
      socials,  // <<< socials
    } = payload;

    const conn = extractConnectionFromPayload(payload);

    // Precompute next due if we have frequency/lastConnectedAt
    const nextConnectDueAt = computeNextDue({
      lastConnectedAt: conn.lastConnectedAt || null,
      frequencyDays: conn.frequencyDays || null,
    });
    if (nextConnectDueAt) conn.nextConnectDueAt = nextConnectDueAt;

    let created;
    await session.withTransaction(async () => {
      const doc = await Contact.create(
        [
          {
            owner: ownerId,
            firstName,
            lastName,
            email,
            phone,
            city,
            country,
            notes,
            groups: [],
            connection: { ...conn },
            socials: buildSocials(socials), // <<< socials
          },
        ],
        { session }
      );

      created = doc[0];

      if (Array.isArray(groups)) {
        const incomingGroupIds = groups.filter(isId);
        await syncContactGroupMembership({
          session,
          ownerId,
          contactId: created._id,
          incomingGroupIds,
        });
      }
    });

    const saved = await Contact.findOne({ _id: created._id, owner: ownerId }).lean();
    return res.status(201).json(saved);
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
});

// GET /api/contacts/:id -> read one (self-owned)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const doc = await Contact.findOne({ _id: id, owner: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json(doc);
  } catch (err) {
    return next(err);
  }
});

// PUT /api/contacts/:id -> update (self-owned) and sync groups if provided
// Also supports legacy firstConnectedAt/lastConnectedAt (mapped to connection.*)
router.put('/:id', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!isId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const ownerId = req.user._id;
    const payload = req.body || {};

    const {
      groups,   // may be undefined; only sync if it's an array
      socials,  // <<< socials
      ...rest
    } = payload;

    // peel out connection-related fields (back-compat)
    const conn = extractConnectionFromPayload(payload);

    let updated;
    await session.withTransaction(async () => {
      // Build $set atomically
      const $set = { ...rest };

      // Merge socials if provided      // <<< socials
      const normalisedSocials = buildSocials(socials);
      if (normalisedSocials) {
        $set.socials = normalisedSocials;
      }

      if (Object.keys(conn).length > 0) {
        const shouldRecompute =
          conn.frequencyDays !== undefined || conn.lastConnectedAt !== undefined;

        // Merge into nested path keys
        for (const [k, v] of Object.entries(conn)) {
          $set[`connection.${k}`] = v;
        }

        if (shouldRecompute) {
          const recompute = computeNextDue({
            lastConnectedAt:
              conn.lastConnectedAt !== undefined ? conn.lastConnectedAt : undefined,
            frequencyDays:
              conn.frequencyDays !== undefined ? conn.frequencyDays : undefined,
          });

          if (recompute !== undefined && recompute !== null) {
            $set['connection.nextConnectDueAt'] = recompute;
          } else {
            // If frequency removed/invalid, clear nextConnectDueAt
            $set['connection.nextConnectDueAt'] = null;
          }
        }
      }

      updated = await Contact.findOneAndUpdate(
        { _id: id, owner: ownerId },
        { $set },
        { new: true, runValidators: true, session }
      );

      if (!updated) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (Array.isArray(groups)) {
        const incomingGroupIds = groups.filter(isId);
        await syncContactGroupMembership({
          session,
          ownerId,
          contactId: updated._id,
          incomingGroupIds,
        });
        updated = await Contact.findOne({ _id: id, owner: ownerId }).session(session);
      }
    });

    if (!updated) return; // response already sent
    return res.json(updated.toObject());
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
});

// DELETE /api/contacts/:id -> delete (self-owned) and pull from groups.members
router.delete('/:id', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!isId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const ownerId = req.user._id;

    await session.withTransaction(async () => {
      const deleted = await Contact.findOneAndDelete(
        { _id: id, owner: ownerId },
        { session }
      ).lean();

      if (!deleted) {
        return res.status(404).json({ error: 'Not found' });
      }

      await Group.updateMany(
        { owner: ownerId },
        { $pull: { members: id } },
        { session }
      );

      return res.status(204).end();
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

/**
 * PATCH /api/contacts/:id/connection
 * Set/change frequency, first/last dates, isActive, snoozedUntil.
 */
router.patch('/:id/connection', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });

    const ownerId = req.user._id;
    const { frequencyDays, firstConnectedAt, lastConnectedAt, isActive, snoozedUntil } =
      req.body || {};

    const $set = {};
    if (frequencyDays !== undefined)
      $set['connection.frequencyDays'] = Number(frequencyDays);
    if (firstConnectedAt !== undefined)
      $set['connection.firstConnectedAt'] = firstConnectedAt
        ? new Date(firstConnectedAt)
        : null;
    if (lastConnectedAt !== undefined)
      $set['connection.lastConnectedAt'] = lastConnectedAt
        ? new Date(lastConnectedAt)
        : null;
    if (isActive !== undefined) $set['connection.isActive'] = !!isActive;
    if (snoozedUntil !== undefined)
      $set['connection.snoozedUntil'] = snoozedUntil ? new Date(snoozedUntil) : null;

    // Read current to compute next due correctly
    const doc = await Contact.findOne({ _id: id, owner: ownerId });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const freq =
      frequencyDays !== undefined ? Number(frequencyDays) : doc.connection?.frequencyDays;
    const last =
      lastConnectedAt !== undefined
        ? lastConnectedAt
          ? new Date(lastConnectedAt)
          : null
        : doc.connection?.lastConnectedAt || null;

    const nextDue = computeNextDue({ lastConnectedAt: last, frequencyDays: freq });
    $set['connection.nextConnectDueAt'] = nextDue || null;

    const updated = await Contact.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set },
      { new: true }
    ).lean();

    return res.json(updated);
  } catch (err) {
    return res
      .status(500)
      .json({ error: err.message || 'Failed to update connection settings' });
  }
});

/**
 * POST /api/contacts/:id/connection/log
 * Logs a connection event and advances nextConnectDueAt.
 * Body: { connectedAt?: DateString, note?: string }
 */
router.post('/:id/connection/log', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });

    const ownerId = req.user._id;
    const { connectedAt, note } = req.body || {};
    const when = connectedAt ? new Date(connectedAt) : new Date();

    const doc = await Contact.findOne({ _id: id, owner: ownerId });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (!doc.connection) doc.connection = {};
    if (!doc.connection.firstConnectedAt) doc.connection.firstConnectedAt = when;
    doc.connection.lastConnectedAt = when;

    if (!Array.isArray(doc.connection.history)) doc.connection.history = [];
    doc.connection.history.unshift({ connectedAt: when, note: note || '' });

    doc.connection.nextConnectDueAt = computeNextDue({
      lastConnectedAt: when,
      frequencyDays: doc.connection.frequencyDays || 30,
    });

    await doc.save();
    return res.json(doc.toObject());
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to log connection' });
  }
});

/**
 * GET /api/contacts/due?withinDays=7
 * Returns contacts due now or within N days (excludes snoozed and inactive).
 */
router.get('/due', async (req, res) => {
  try {
    const ownerId = req.user._id;
    const withinDays = Math.max(0, Number(req.query.withinDays || 0));

    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + withinDays);

    const results = await Contact.find({
      owner: ownerId,
      'connection.isActive': { $ne: false },
      $and: [
        {
          $or: [
            { 'connection.snoozedUntil': null },
            { 'connection.snoozedUntil': { $exists: false } },
            { 'connection.snoozedUntil': { $lte: now } },
          ],
        },
        {
          $or: [
            { 'connection.nextConnectDueAt': { $lte: until } },
            {
              $and: [
                { 'connection.nextConnectDueAt': { $in: [null, undefined] } },
                { 'connection.frequencyDays': { $gt: 0 } },
              ],
            },
          ],
        },
      ],
    })
      .sort({ 'connection.nextConnectDueAt': 1, lastName: 1, firstName: 1 })
      .lean();

    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch due contacts' });
  }
});

module.exports = router;