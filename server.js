const dotenv = require('dotenv');
dotenv.config();

// Core imports
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');

// Read required env
const {
  NODE_ENV = 'development',
  PORT = 3000,
  MONGODB_URI,
  CLIENT_URL = 'https://orbitcrm.netlify.app/',
  CORS_ORIGINS = '',
  CORS_ALLOW_REGEX
} = process.env;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment');
  process.exit(1);
}

// App Setup
const app = express();
app.set('trust proxy', 1); // Heroku/Reverse proxy friendly (safe for JWT-only)

// Security & performance
app.use(helmet());
app.use(compression());

// JSON body parser
app.use(express.json());    
// Logger - Queiter in production                                  
app.use(morgan(NODE_ENV === 'production' ? 'tiny' : 'dev')); 

// Middleware & allowlist from env (comma-separated), plus regex (e.g. *.netlify.app)
// Build allowlist from env; normalize entries by trimming and removing trailing slashes
const allowlist = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/g, ''))
  .filter(Boolean);

const allowRegex = process.env.CORS_ALLOW_REGEX
  ? new RegExp(process.env.CORS_ALLOW_REGEX)
  : null;

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server / curl / Postman (no Origin header)
    if (!origin) return cb(null, true);

    // Normalize incoming origin (strip trailing slash) before checking
    const normalizedOrigin = origin.replace(/\/+$/g, '');

    // Exact match allowlist
    const okExact = allowlist.includes(normalizedOrigin);

    // Pattern match (e.g any Netlify preview subdomain)
    let okRegex = false;
    if (allowRegex) {
      try {
        const { hostname } = new URL(origin);
        okRegex = allowRegex.test(hostname);
      } catch { /* ignore bad origins */ }
    }

    if (okExact || okRegex) return cb(null, true);

    // Helpful debug message for blocked origins (visible in server logs)
    console.warn(`CORS: origin not allowed -> ${origin}`);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.options('*', cors()); // preflight for all routes

// Healthcheck
app.get('/healthz', (_req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting 4=unauth
  res.json({ ok: true, env: NODE_ENV, db: state });
});

// Routers
const authRouter     = require('./controllers/auth');
const testJwtRouter  = require('./controllers/test-jwt');
const usersRouter    = require('./controllers/users');  
const groupsRouter   = require('./controllers/groups');
const contactsRouter = require('./controllers/contacts');
const invitesRouter  = require('./controllers/invites');

// API Routes
app.use('/api/auth', authRouter);
// Backwards-compatibility: also mount auth router at /auth so clients calling
// /auth/sign-in (no /api prefix) still work.
app.use('/auth', authRouter);
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
app.use((err, req, res, _next) => {
  if (NODE_ENV !== 'production') console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

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
    console.log(`MongoDB connected: ${mongoose.connection.name}`);

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