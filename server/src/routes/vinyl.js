/**
 * vinyl.js
 *
 * GET /api/vinyl/check?artist=…&title=…
 *   → checks a single album against Discogs; returns vinyl availability + price
 *
 * POST /api/vinyl/batch
 *   → body: { albums: [{ id, artist, title }, …] }
 *   → kicks off background checks for a list of albums; returns immediately
 *      with a jobId. The client polls GET /api/vinyl/status/:jobId.
 *
 * GET /api/vinyl/status/:jobId
 *   → returns current progress and any completed results for that batch job
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchVinyl } from '../services/discogsService.js';

const router = Router();

// In-memory job store (fine for a single-server app; use Redis for multi-server)
const jobs = new Map();

// ─── Single check ─────────────────────────────────────────────────────────────

router.get('/check', requireAuth, async (req, res) => {
  const { artist, title } = req.query;

  if (!artist || !title) {
    return res.status(400).json({ error: 'artist and title query params are required' });
  }

  try {
    const result = await searchVinyl(artist, title);
    res.json(result);
  } catch (err) {
    console.error('Discogs check failed:', err.message);
    res.status(500).json({ error: 'Failed to check Discogs' });
  }
});

// ─── Batch check ──────────────────────────────────────────────────────────────
// The client sends an array of albums. We create a job, start processing in the
// background (respecting the 1-per-second Discogs rate limit), and return a
// jobId the client can poll.

router.post('/batch', requireAuth, async (req, res) => {
  const { albums } = req.body;

  if (!Array.isArray(albums) || albums.length === 0) {
    return res.status(400).json({ error: 'albums array is required' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job = {
    id: jobId,
    total: albums.length,
    completed: 0,
    results: {},   // keyed by Spotify album id
    status: 'running',
  };

  jobs.set(jobId, job);

  // Process in the background — don't await
  processBatch(job, albums);

  res.json({ jobId, total: albums.length });
});

async function processBatch(job, albums) {
  for (const album of albums) {
    if (job.status === 'cancelled') break;
    try {
      const result = await searchVinyl(album.artist, album.title);
      job.results[album.id] = { ...result, albumId: album.id };
    } catch (err) {
      job.results[album.id] = { albumId: album.id, error: true, found: false };
    }
    job.completed++;
  }
  job.status = 'done';

  // Auto-clean the job from memory after 10 minutes
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
}

// ─── Poll job status ──────────────────────────────────────────────────────────

router.get('/status/:jobId', requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    progress: Math.round((job.completed / job.total) * 100),
    results: job.results,
  });
});

export default router;
