const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  hashedPassword: {
    type: String,
    required: true
  },
 }, { timestamps: true });

 // hide hashedPassword in JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.hashedPassword;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);