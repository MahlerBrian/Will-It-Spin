import styles from './StatsBar.module.css';

export default function StatsBar({ total, found, checking, avgPrice }) {
  return (
    <div className={styles.bar}>
      <Stat label="Albums synced" value={total} />
      <Stat label="Vinyl found" value={found} accent />
      <Stat label="Avg. price" value={avgPrice ? `$${avgPrice}` : '—'} />
      <Stat label="Still checking" value={checking} muted={checking === 0} />
    </div>
  );
}

function Stat({ label, value, accent, muted }) {
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${accent ? styles.accent : ''} ${muted ? styles.muted : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}
