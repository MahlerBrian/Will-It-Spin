/**
 * discogsService.js
 *
 * Wraps the Discogs REST API with:
 *   1. A request queue that enforces ≤ 60 requests / minute (1 per second)
 *      so we never get a 429 from Discogs.
 *   2. A MongoDB-backed cache (TTL: 7 days) so repeat lookups never hit
 *      the Discogs API at all.
 *
 * Public API:
 *   searchVinyl(artist, albumTitle)  →  { found, listingCount, lowestPrice, currency, url }
 */

import axios from 'axios';
import VinylCache from '../models/VinylCache.js';

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const DISCOGS_API = 'https://api.discogs.com';

// User-Agent is required by the Discogs API ToS
const HEADERS = {
  Authorization: `Discogs token=${DISCOGS_TOKEN}`,
  'User-Agent': 'VinylFinder/1.0 +https://github.com/yourhandle/vinyl-finder',
};

// ─── Rate-limit queue ─────────────────────────────────────────────────────────
// We process one request per second (well within the 60/min cap).
// Each call to enqueue() returns a Promise that resolves when the request
// reaches the front of the queue and completes.

const queue = [];
let processing = false;

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    if (!processing) processQueue();
  });
}

async function processQueue() {
  processing = true;
  while (queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    }
    // Wait 1 second before firing the next request
    if (queue.length > 0) {
      await sleep(1000);
    }
  }
  processing = false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Core search function ─────────────────────────────────────────────────────

async function fetchFromDiscogs(artist, albumTitle) {
  // 1. Search the Discogs database for this release in Vinyl format
  const searchRes = await axios.get(`${DISCOGS_API}/database/search`, {
    headers: HEADERS,
    params: {
      artist,
      release_title: albumTitle,
      format: 'Vinyl',
      type: 'release',
      per_page: 5,
    },
  });

  const results = searchRes.data.results;
  if (!results || results.length === 0) {
    return { found: false, listingCount: 0, lowestPrice: null, currency: null, url: null };
  }

  // Take the most relevant result (first hit)
  const release = results[0];
  const releaseId = release.id;
  const releaseUrl = `https://www.discogs.com${release.uri}`;

  // 2. Check the marketplace for this specific release
  //    (marketplace/stats gives us listing count + lowest price without
  //    paginating through all individual listings)
  try {
    const statsRes = await axios.get(
      `${DISCOGS_API}/marketplace/stats/${releaseId}`,
      { headers: HEADERS }
    );

    const stats = statsRes.data;
    const listingCount = stats.num_for_sale ?? 0;
    const lowestPrice = stats.lowest_price?.value ?? null;
    const currency = stats.lowest_price?.currency ?? 'USD';

    return {
      found: listingCount > 0,
      listingCount,
      lowestPrice,
      currency,
      url: releaseUrl,
      releaseId,
    };
  } catch (statsErr) {
    // Marketplace stats endpoint occasionally 404s for older releases.
    // Fall back to "found but price unknown".
    console.warn(`Marketplace stats unavailable for release ${releaseId}`);
    return {
      found: true,
      listingCount: null,
      lowestPrice: null,
      currency: null,
      url: releaseUrl,
      releaseId,
    };
  }
}

// ─── Public function ──────────────────────────────────────────────────────────

export async function searchVinyl(artist, albumTitle) {
  // Build a cache key that's stable regardless of minor string differences
  const cacheKey = `${artist}__${albumTitle}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '__');

  // 1. Check the MongoDB cache first
  const cached = await VinylCache.findOne({ cacheKey });
  if (cached) {
    return cached.result;
  }

  // 2. Not cached — enqueue a Discogs API request
  const result = await enqueue(() => fetchFromDiscogs(artist, albumTitle));

  // 3. Persist to cache with a 7-day TTL
  await VinylCache.create({ cacheKey, artist, albumTitle, result });

  return result;
}
