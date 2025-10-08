const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
  },
  hashedPassword: {
    type: String,
    required: true
  },
 }, { timestamps: true });

// Ensure a sparse unique index on email so multiple docs without email (null)
// are allowed, but non-null emails remain unique.
userSchema.index({ email: 1 }, { unique: true, sparse: true });

 // hide hashedPassword in JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.hashedPassword;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);