import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import albumRoutes from './routes/albums.js';
import vinylRoutes from './routes/vinyl.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,           // required so the session cookie is sent cross-origin
}));

app.use(express.json({ limit: '10mb' }));

// Session stores the Spotify access/refresh tokens server-side.
// In production, swap the default MemoryStore for connect-mongo.
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,            // not accessible from JS — protects against XSS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60,   // 1 hour; refresh token keeps the user logged in
  },
}));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/vinyl', vinylRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Database ─────────────────────────────────────────────────────────────────

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
