const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');

// App Set Up
const app = express();

// Security & performance
app.use(helmet());
app.use(compression());

// Middleware
app.use(cors());
app.use(express.json());                                      // JSON body parsing
app.use(morgan(NODE_ENV === 'production' ? 'tiny' : 'dev'));  // Quieter logging in prod

// CORS (allow Netlify front-end + localhost for local dev)
const allowedOrigins = [
  CLIENT_URL,                 // production front-end (set in env)
  'http://localhost:5173',    // Vite dev
  'http://localhost:3000'     // Local front-end
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true); // allow postman (no origin) and known origins
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false // set to true only if cookies are used
}));

// Routers
const authRouter     = require('./controllers/auth');
const testJwtRouter  = require('./controllers/test-jwt');
const usersRouter    = require('./controllers/users');  
const groupsRouter   = require('./controllers/groups');
const contactsRouter = require('./controllers/contacts');
const invitesRouter  = require('./controllers/invites');

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/test', testJwtRouter);
app.use('/api/users', usersRouter);       
app.use('/api/groups', groupsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/invites', invitesRouter);

// 404 Fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

// --- Sanity checks for required env ---
const {
  NODE_ENV = 'development',
  PORT = 3000,
  MONGODB_URI,
  CLIENT_URL = 'https://orbitcrm.netlify.app/',
} = process.env;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment');
  process.exit(1);
}

// Mongoose config & connect + boot
mongoose.set('debug', NODE_ENV !== 'production');

let server;
(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: 'OrbitCRMDatabase',
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10,
    });
    console.log(`Connected to MongoDB: ${mongoose.connection.name}`);

    server = app.listen(PORT, () => {
      console.log(`Express API listening on port ${PORT} (${NODE_ENV})`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
})();

// Connection event logs
mongoose.connection.on('connected', () => {
  console.log(`Connected to MongoDB ${mongoose.connection.name}.`);
});
mongoose.connection.on('error', (e) => {
  console.error('MongoDB connection error:', e);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received: closing HTTP server & MongoDB...`);
  if (server) {
    server.close(() => {
      mongoose.connection.close(false, () => {
        console.log('HTTP server and MongoDB connections closed');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C locally
process.on('SIGTERM', () => shutdown('SIGTERM')); // Cloud provider stop/restart

module.exports = app;