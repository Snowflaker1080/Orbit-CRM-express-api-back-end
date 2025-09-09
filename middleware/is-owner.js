function isOwner(modelName, paramId = 'id') {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const doc = await Model.findById(req.params[paramId]);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (doc.owner?.toString() !== req.user?._id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.doc = doc;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = isOwner;