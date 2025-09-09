// controllers/groups.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Group = require('../models/Group');
const Contact = require('../models/Contact');
const verifyToken = require('../middleware/verify-token');

// Protect everything in this router
router.use(verifyToken);

// If verifyToken ever didn't attach a user, fail fast (defensive)
router.use((req, res, next) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

const isId = (v) => mongoose.isValidObjectId(v);
const toIdStr = (v) => String(v);

// Pull enum list once for validation & meta endpoint
const TYPE_ENUM = Group.schema.path('type')?.options?.enum || [];

// --- Utilities to keep Group.members <-> Contact.groups in sync ---
async function syncMemberAdds({ session, ownerId, groupId, contactIds = [] }) {
  if (!contactIds.length) return;

  const validContacts = await Contact.find(
    { _id: { $in: contactIds }, owner: ownerId },
    { _id: 1 }
  ).session(session);

  const validIds = validContacts.map((c) => c._id);
  await Group.updateOne(
    { _id: groupId, owner: ownerId },
    { $addToSet: { members: { $each: validIds } } },
    { session }
  );
  await Contact.updateMany(
    { _id: { $in: validIds }, owner: ownerId },
    { $addToSet: { groups: groupId } },
    { session }
  );
}

async function syncMemberRemoves({ session, ownerId, groupId, contactIds = [] }) {
  if (!contactIds.length) return;

  const validContacts = await Contact.find(
    { _id: { $in: contactIds }, owner: ownerId },
    { _id: 1 }
  ).session(session);

  const validIds = validContacts.map((c) => c._id);

  await Group.updateOne(
    { _id: groupId, owner: ownerId },
    { $pull: { members: { $in: validIds } } },
    { session }
  );

  await Contact.updateMany(
    { _id: { $in: validIds }, owner: ownerId },
    { $pull: { groups: groupId } },
    { session }
  );
}

// --- Meta: expose allowed group types (for UI forms) -----------------------
router.get('/meta', (req, res) => {
  return res.json({ types: TYPE_ENUM });
});

// GET /api/groups  -> list current user's groups
router.get('/', async (req, res, next) => {
  try {
    const groups = await Group.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(groups);
  } catch (err) {
    return next(err);
  }
});

// POST /api/groups -> create a group for current user
router.post('/', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { name, type, description, members } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (type && !TYPE_ENUM.includes(String(type).trim())) {
      return res.status(400).json({ error: `Invalid type "${type}". Allowed: ${TYPE_ENUM.join(', ')}` });
    }

    const ownerId = req.user._id;
    const initialMemberIds = Array.isArray(members) ? members.filter(isId) : [];

    await session.withTransaction(async () => {
      const doc = await Group.create(
        [{
          name: name.trim(),
          ...(type ? { type: String(type).trim() } : {}),
          ...(typeof description === 'string' ? { description: description.trim() } : {}),
          owner: ownerId,
        }],
        { session }
      );

      const group = doc[0];
      if (initialMemberIds.length) {
        await syncMemberAdds({ session, ownerId, groupId: group._id, contactIds: initialMemberIds });
      }

      const saved = await Group.findOne({ _id: group._id, owner: ownerId }).lean().session(session);
      return res.status(201).json(saved);
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
});

// GET /api/groups/:id -> read one (self-owned)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const doc = await Group.findOne({ _id: id, owner: req.user._id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json(doc);
  } catch (err) {
    return next(err);
  }
});

// PUT /api/groups/:id -> update (self-owned) + keep members/contact.groups in sync
router.put('/:id', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { name, type, description, members } = req.body || {};
    const ownerId = req.user._id;

    if (typeof type === 'string' && !TYPE_ENUM.includes(String(type).trim())) {
      return res.status(400).json({ error: `Invalid type "${type}". Allowed: ${TYPE_ENUM.join(', ')}` });
    }

    await session.withTransaction(async () => {
      const existing = await Group.findOne({ _id: id, owner: ownerId })
        .select('_id name type description members owner')
        .session(session);
      if (!existing) return res.status(404).json({ error: 'Not found' });

      if (typeof name === 'string') existing.name = name.trim();
      if (typeof type === 'string') existing.type = type.trim();
      if (typeof description === 'string') existing.description = description.trim();

      if (Array.isArray(members)) {
        const incoming = members.filter(isId).map(toIdStr);
        const current = (existing.members || []).map(toIdStr);
        const toAdd = incoming.filter((m) => !current.includes(m));
        const toRemove = current.filter((m) => !incoming.includes(m));

        if (toAdd.length) {
          await syncMemberAdds({ session, ownerId, groupId: existing._id, contactIds: toAdd });
        }
        if (toRemove.length) {
          await syncMemberRemoves({ session, ownerId, groupId: existing._id, contactIds: toRemove });
        }
      }

      await existing.save({ session, validateModifiedOnly: true });

      const updated = await Group.findOne({ _id: id, owner: ownerId }).lean().session(session);
      return res.json(updated);
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
});

// DELETE /api/groups/:id -> delete (self-owned) + pull group from contact.groups
router.delete('/:id', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const ownerId = req.user._id;

    await session.withTransaction(async () => {
      const group = await Group.findOneAndDelete(
        { _id: id, owner: ownerId },
        { session }
      ).lean();
      if (!group) return res.status(404).json({ error: 'Not found' });

      await Contact.updateMany(
        { _id: { $in: group.members || [] }, owner: ownerId },
        { $pull: { groups: id } },
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

// --- Convenience endpoints: single add/remove ------------------------------
router.post('/:groupId/members/:contactId', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { groupId, contactId } = req.params;
    if (!isId(groupId) || !isId(contactId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const ownerId = req.user._id;

    await session.withTransaction(async () => {
      const group = await Group.findOne({ _id: groupId, owner: ownerId }).session(session);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const contact = await Contact.findOne({ _id: contactId, owner: ownerId }).session(session);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      await syncMemberAdds({ session, ownerId, groupId, contactIds: [contactId] });

      const updated = await Group.findOne({ _id: groupId, owner: ownerId }).lean().session(session);
      return res.json(updated);
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

router.delete('/:groupId/members/:contactId', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { groupId, contactId } = req.params;
    if (!isId(groupId) || !isId(contactId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const ownerId = req.user._id;

    await session.withTransaction(async () => {
      const group = await Group.findOne({ _id: groupId, owner: ownerId }).session(session);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const contact = await Contact.findOne({ _id: contactId, owner: ownerId }).session(session);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      await syncMemberRemoves({ session, ownerId, groupId, contactIds: [contactId] });

      const updated = await Group.findOne({ _id: groupId, owner: ownerId }).lean().session(session);
      return res.json(updated);
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

// --- Bulk add/remove in one shot ------------------------------------------
router.post('/:groupId/members', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { groupId } = req.params;
    const { contactIds } = req.body || {};
    if (!isId(groupId) || !Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const ownerId = req.user._id;

    const ids = Array.from(new Set(contactIds.filter(isId).map(toIdStr)));
    if (!ids.length) return res.status(400).json({ error: 'No valid contactIds' });

    await session.withTransaction(async () => {
      const group = await Group.findOne({ _id: groupId, owner: ownerId }).session(session);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      await syncMemberAdds({ session, ownerId, groupId, contactIds: ids });

      const updated = await Group.findOne({ _id: groupId, owner: ownerId }).lean().session(session);
      return res.json(updated);
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

router.delete('/:groupId/members', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { groupId } = req.params;
    const { contactIds } = req.body || {};
    if (!isId(groupId) || !Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const ownerId = req.user._id;

    const ids = Array.from(new Set(contactIds.filter(isId).map(toIdStr)));
    if (!ids.length) return res.status(400).json({ error: 'No valid contactIds' });

    await session.withTransaction(async () => {
      const group = await Group.findOne({ _id: groupId, owner: ownerId }).session(session);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      await syncMemberRemoves({ session, ownerId, groupId, contactIds: ids });

      const updated = await Group.findOne({ _id: groupId, owner: ownerId }).lean().session(session);
      return res.json(updated);
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

module.exports = router;