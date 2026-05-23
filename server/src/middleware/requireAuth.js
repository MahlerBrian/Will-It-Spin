/**
 * requireAuth middleware
 *
 * Attach this to any route that needs a logged-in Spotify user.
 * It checks the session, auto-refreshes the access token if it has expired,
 * and attaches req.spotifyToken so downstream route handlers can use it
 * without knowing anything about the token lifecycle.
 */

import { refreshAccessToken } from '../routes/auth.js';

export async function requireAuth(req, res, next) {
  const sid = req.headers['x-session-id'];

  if (sid) {
    req.sessionStore.get(sid, async (err, sessionData) => {
      if (err || !sessionData || !sessionData.tokens) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Manually attach session data to req.session
      req.session.tokens = sessionData.tokens;
      req.session.user = sessionData.user;

      const expiresIn = sessionData.tokens.expires_at - Date.now();
      if (expiresIn < 60_000) {
        try {
          await refreshAccessToken(req.session);
        } catch (err) {
          return res.status(401).json({ error: 'Session expired, please log in again' });
        }
      }

      req.spotifyToken = req.session.tokens.access_token;
      next();
    });
    return;
  }

  if (!req.session.tokens || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const expiresIn = req.session.tokens.expires_at - Date.now();
  if (expiresIn < 60_000) {
    try {
      await refreshAccessToken(req.session);
    } catch (err) {
      req.session.destroy();
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
  }

  req.spotifyToken = req.session.tokens.access_token;
  next();
}