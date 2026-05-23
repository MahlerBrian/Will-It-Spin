/**
 * auth.js — Spotify OAuth 2.0 flow
 *
 * GET /auth/login     → redirects the browser to Spotify's consent screen
 * GET /auth/callback  → Spotify redirects here; we exchange the code for tokens
 * GET /auth/logout    → clears the session
 * GET /auth/me        → returns the logged-in user's Spotify profile (used by the client
 *                       on every page load to check whether the session is still valid)
 */

import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  CLIENT_URL,
} = process.env;

// Scopes we need from Spotify.
// user-library-read  → read saved albums
// user-top-read      → read top artists/tracks (used in the "Top Artists" tab)
const SCOPES = [
  'user-library-read',
  'user-top-read',
  'user-read-private',
  'user-read-email',
].join(' ');

// ─── Step 1: redirect to Spotify ──────────────────────────────────────────────

router.get('/login', (req, res) => {
  // state is a random string we generate and later verify in /callback.
  // This prevents CSRF attacks on the OAuth redirect.
  console.log('LOGIN ROUTE HIT');
  console.log('SPOTIFY_CLIENT_ID:', SPOTIFY_CLIENT_ID);
  console.log('REDIRECT_URI:', SPOTIFY_REDIRECT_URI);
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// ─── Step 2: Spotify redirects back here with ?code=… ─────────────────────────

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // User denied access on Spotify's page
  if (error) {
    return res.redirect(`${CLIENT_URL}?error=access_denied`);
  }

  // Verify the state we set in /login to prevent CSRF
  // if (!state || state !== req.session.oauthState) {
  //   return res.redirect(`${CLIENT_URL}?error=state_mismatch`);
  // }
  // delete req.session.oauthState;

  try {
    // Exchange the authorization code for access + refresh tokens
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Spotify expects Basic auth: base64(clientId:clientSecret)
          Authorization:
            'Basic ' +
            Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch the user's Spotify profile so we can store their display name / id
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Store tokens and profile in the server-side session.
    // Never send tokens to the client.
    req.session.tokens = {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000,
    };
    req.session.user = {
      id: profileResponse.data.id,
      display_name: profileResponse.data.display_name,
      email: profileResponse.data.email,
      images: profileResponse.data.images,
    };
    console.log('SESSION AFTER CALLBACK:', req.session.user);
    console.log('SESSION ID:', req.session.id);
    res.redirect(`${CLIENT_URL}/dashboard?sid=${req.session.id}`);
  } catch (err) {
    console.error('OAuth callback error:', JSON.stringify(err.response?.data, null, 2));
    console.error('OAuth callback status:', err.response?.status);
    console.error('OAuth callback message:', err.message);
    console.error('Redirect URI used:', SPOTIFY_REDIRECT_URI);
    res.redirect(`${CLIENT_URL}?error=auth_failed`);
  }
});

// ─── Token refresh helper ──────────────────────────────────────────────────────

export async function refreshAccessToken(session) {
  const { refresh_token } = session.tokens;

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
    }
  );

  session.tokens.access_token = response.data.access_token;
  session.tokens.expires_at = Date.now() + response.data.expires_in * 1000;

  // Spotify sometimes issues a new refresh token too
  if (response.data.refresh_token) {
    session.tokens.refresh_token = response.data.refresh_token;
  }
}

// ─── GET /auth/me — used by the React app to check login status ────────────────

router.get('/me', (req, res) => {
  const sid = req.headers['x-session-id'];
  if (sid) {
    req.sessionStore.get(sid, (err, session) => {
      if (err || !session || !session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      return res.json({ user: session.user });
    });
    return;
  }
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

// ─── GET /auth/logout ──────────────────────────────────────────────────────────

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

export default router;
