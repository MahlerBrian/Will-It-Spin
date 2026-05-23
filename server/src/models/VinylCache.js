/**
 * VinylCache.js
 *
 * Stores the result of a Discogs vinyl lookup so we don't re-query the API
 * for albums we've already checked.
 *
 * The `expireAt` field uses a MongoDB TTL index — Mongo automatically
 * deletes documents when their expireAt date passes, so the cache
 * self-cleans after 7 days without any extra code.
 */

import mongoose from 'mongoose';

const vinylCacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true, index: true },
    artist:    { type: String, required: true },
    albumTitle:{ type: String, required: true },

    // The full result object returned by discogsService
    result: {
      found:        Boolean,
      listingCount: Number,
      lowestPrice:  Number,
      currency:     String,
      url:          String,
      releaseId:    Number,
    },

    // TTL field — MongoDB removes this document automatically after 7 days
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      expires: 0,  // "0 seconds after expireAt" = delete at expireAt exactly
    },
  },
  { timestamps: true }
);

export default mongoose.model('VinylCache', vinylCacheSchema);
