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
const isProd = process.env.NODE_ENV === 'production';

// ─── Middleware ────────────────────────────────────────────────────────────────

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60,
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
