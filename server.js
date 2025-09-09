// server.js
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');

// Routers
const authRouter     = require('./controllers/auth');
const testJwtRouter  = require('./controllers/test-jwt');
const usersRouter    = require('./controllers/users');  
const groupsRouter   = require('./controllers/groups');
const contactsRouter = require('./controllers/contacts');
const invitesRouter  = require('./controllers/invites');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/test', testJwtRouter);
app.use('/api/users', usersRouter);       
app.use('/api/groups', groupsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/invites', invitesRouter);

// 404 Route
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

// --- Connect to MongoDB + Boot ---
const db_url = process.env.MONGODB_URI;
if (!db_url) {
  console.error('Missing MONGODB_URI in environment');
  process.exit(1);
}

mongoose.set('debug', true);

mongoose
  .connect(db_url, {
    dbName: 'OrbitCRMDatabase',
    serverSelectionTimeoutMS: 15000,
  })
  .then(() => {
    console.log('Connected to MongoDB OrbitCRMDatabase');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Express API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

mongoose.connection.on('connected', () => {
  console.log(`Connected to MongoDB ${mongoose.connection.name}.`);
});
mongoose.connection.on('error', (e) => {
  console.error('MongoDB connection error:', e);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

module.exports = app;