/**
 * albums.js
 *
 * GET /api/albums          → returns the user's Spotify saved albums (paginated)
 * GET /api/albums/top      → returns the user's top Spotify artists
 *
 * Both routes are protected by requireAuth, which also handles token refresh.
 */

import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const response = await axios.get(
      `https://api.spotify.com/v1/me/albums?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${req.spotifyToken}` } }
    );

    const { items, next, total } = response.data;

    const albums = items.map((item) => {
      const album = item.album;
      return {
        id: album.id,
        title: album.name,
        artist: album.artists.map((a) => a.name).join(', '),
        primaryArtist: album.artists[0]?.name ?? '',
        releaseYear: album.release_date?.substring(0, 4) ?? '',
        imageUrl: album.images?.[1]?.url ?? album.images?.[0]?.url ?? null,
        spotifyUrl: album.external_urls?.spotify ?? null,
        totalTracks: album.total_tracks,
      };
    });

    res.json({ albums, total, hasMore: !!next, offset, limit });
  } catch (err) {
    console.error('Failed to fetch Spotify albums:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch albums from Spotify' });
  }
});

router.get('/top', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term',
      { headers: { Authorization: `Bearer ${req.spotifyToken}` } }
    );

    const artists = response.data.items.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.images?.[0]?.url ?? null,
      genres: a.genres.slice(0, 3),
      popularity: a.popularity,
      spotifyUrl: a.external_urls?.spotify ?? null,
    }));

    res.json({ artists });
  } catch (err) {
    console.error('Failed to fetch top artists:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch top artists from Spotify' });
  }
});

export default router;