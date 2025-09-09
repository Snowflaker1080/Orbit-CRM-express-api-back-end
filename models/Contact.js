// models/Contact.js
const { Schema, model, Types } = require('mongoose');

/**
 * Normaliser for YYYY-MM-DD strings:
 * Stores at UTC midnight to avoid TZ shifts in browsers.
 */
const normaliseYyyyMmDdToUTC = (v) => {
  if (!v) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return v;
};

/* --------------------- socials helpers ---------------------- */ // <<< socials
// Accepts fully-qualified URLs, bare domains, or @handles.
// - If bare domain, prefixes https://
// - If @handle or other non-domain text, returns as-is
// - Returns undefined for empty values so Mongoose doesn't store them
const asUrlOrHandle = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;                                   // full URL
  if (/^[\w.-]+\.[a-z]{2,}([\/?#]|$)/i.test(s)) return `https://${s}`;      // bare domain
  return s;                                                                 // handle / other text
};

// Reusable string field config for social links
const socialField = {
  type: String,
  set: asUrlOrHandle,
  maxlength: 512,
};

/* ---------------- connection / cadence subschema ------------- */
const connectionSchema = new Schema(
  {
    frequencyDays: { type: Number, min: 1, default: 30 },
    firstConnectedAt: { type: Date, default: null },
    lastConnectedAt: { type: Date, default: null },
    nextConnectDueAt: { type: Date, default: null },
    snoozedUntil: { type: Date, default: null },
    history: {
      type: [
        {
          connectedAt: { type: Date, required: true },
          note: { type: String, default: '' },
        },
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

/* --------------------- socials subschema --------------------- */ // <<< socials
const socialsSchema = new Schema(
  {
    website:   socialField,
    linkedin:  socialField,
    twitter:   socialField,    // aka X
    instagram: socialField,
    facebook:  socialField,
    github:    socialField,
    other1:    socialField,
    other2:    socialField,
  },
  {
    _id: false,
    minimize: true, // if all keys end up undefined, don't store an empty object
  }
);

/* ---------------------- main contact schema ------------------ */
const contactSchema = new Schema(
  {
    owner: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, default: '' },

    jobTitle: { type: String, trim: true, default: '' },

    dateOfBirth: {
      type: Date,
      set: normaliseYyyyMmDdToUTC,
      default: null,
    },

    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },

    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },

    notes: { type: String, default: '' },

    groups: [{ type: Types.ObjectId, ref: 'Group' }],

    connection: { type: connectionSchema, default: () => ({}) },

    socials: { type: socialsSchema, default: undefined }, // <<< socials
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    minimize: true,
  }
);

/* ----------------------- virtuals ---------------------------- */
// Map to nested connection date (handy in lists)
contactSchema.virtual('nextConnectionDate').get(function () {
  return this.connection?.nextConnectDueAt ?? null;
});

// Count how many social links are present (for UI badges)        // <<< socials
contactSchema.virtual('socialLinksCount').get(function () {
  const s = this.socials || {};
  return Object.values(s).filter(Boolean).length;
});

/* ----------------------- indexes ----------------------------- */
contactSchema.index({ owner: 1, 'connection.nextConnectDueAt': 1 });
contactSchema.index({ owner: 1, lastName: 1, firstName: 1 });

/* ------------------- next-due computation -------------------- */
function computeNextDue(baseDate, frequencyDays) {
  if (!baseDate || !frequencyDays) return null;
  const next = new Date(baseDate.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
  next.setHours(0, 0, 0, 0);
  return next;
}

/* ------------------------ hooks ------------------------------ */
contactSchema.pre('save', function (next) {
  if (!this.connection || this.connection.isActive === false) return next();

  const c = this.connection;
  const base =
    c.lastConnectedAt ||
    c.firstConnectedAt ||
    this.createdAt ||
    new Date();

  c.nextConnectDueAt = computeNextDue(base, c.frequencyDays);
  return next();
});

/* --------------------- instance methods ---------------------- */
contactSchema.methods.addConnectionEvent = function ({ connectedAt = new Date(), note = '' } = {}) {
  if (!this.connection) this.connection = {};
  if (!Array.isArray(this.connection.history)) this.connection.history = [];
  this.connection.history.unshift({ connectedAt, note });
  this.connection.lastConnectedAt = connectedAt;
  return this;
};

module.exports = model('Contact', contactSchema);