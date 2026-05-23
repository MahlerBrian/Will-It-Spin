import styles from './AlbumRow.module.css';

/**
 * vinylResult shape:
 *   undefined          → not yet checked (still in the queue)
 *   { found: false }   → checked, no vinyl listings found
 *   { found: true, listingCount, lowestPrice, currency, url }
 */
export default function AlbumRow({ index, album, vinylResult }) {
  const status = !vinylResult
    ? 'pending'
    : vinylResult.found
    ? 'found'
    : 'not_found';

  return (
    <div className={styles.row}>
      {/* Index */}
      <span className={styles.num}>{index}</span>

      {/* Album art */}
      <div className={styles.art}>
        {album.imageUrl ? (
          <img src={album.imageUrl} alt={album.title} width={40} height={40} />
        ) : (
          <div className={styles.artPlaceholder} aria-hidden="true">♪</div>
        )}
      </div>

      {/* Album info */}
      <div className={styles.info}>
        <span className={styles.title}>{album.title}</span>
        <span className={styles.artist}>{album.artist}</span>
      </div>

      {/* Vinyl badge */}
      <div className={styles.badgeCell}>
        {status === 'pending' && (
          <span className={`${styles.badge} ${styles.pending}`}>Checking…</span>
        )}
        {status === 'found' && (
          <a
            href={vinylResult.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.badge} ${styles.found}`}
            title="View on Discogs"
          >
            ✓ {vinylResult.listingCount != null ? `${vinylResult.listingCount} listings` : 'Found'}
          </a>
        )}
        {status === 'not_found' && (
          <span className={`${styles.badge} ${styles.notFound}`}>Not found</span>
        )}
      </div>

      {/* Price */}
      <div className={styles.price}>
        {status === 'found' && vinylResult.lowestPrice != null
          ? `${vinylResult.currency} ${vinylResult.lowestPrice.toFixed(2)}`
          : <span className={styles.dash}>—</span>
        }
      </div>
    </div>
  );
}
