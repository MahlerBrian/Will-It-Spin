import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App.jsx';
import AlbumRow from '../components/AlbumRow.jsx';
import StatsBar from '../components/StatsBar.jsx';
import styles from './DashboardPage.module.css';

const POLL_INTERVAL = 2000;
const PAGE_SIZE = 50;
const DISPLAY_PAGE_SIZE = 50;

function getHeaders() {
  const sid = sessionStorage.getItem('sid');
  return sid ? { 'x-session-id': sid } : {};
}

export default function DashboardPage() {
  const { user, setUser }             = useAuth();
  const [albums, setAlbums]           = useState([]);
  const [vinyl, setVinyl]             = useState({});
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalAlbums, setTotalAlbums] = useState(0);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [sortBy, setSortBy]           = useState('date');
  const [page, setPage]               = useState(1);
  const [jobProgress, setJobProgress] = useState(null);
  const allAlbumsRef                  = useRef([]);
  const vinylRef                      = useRef({});
  const lastCheckedIdsRef             = useRef('');

  // Keep vinylRef in sync so checkCurrentPage can read latest state
  useEffect(() => { vinylRef.current = vinyl; }, [vinyl]);

  // ── Load all albums from Spotify ─────────────────────────────────────────

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getHeaders();

      // Load first page and show immediately
      const { data: firstPage } = await axios.get(
        `http://localhost:5000/api/albums?limit=${PAGE_SIZE}&offset=0`,
        { headers }
      );
      setTotalAlbums(firstPage.total);
      allAlbumsRef.current = firstPage.albums;
      setAlbums([...firstPage.albums]);
      setLoading(false);

      // Fetch remaining pages in background
      let offset = PAGE_SIZE;
      while (offset < firstPage.total) {
        setLoadingMore(true);
        const { data: nextPage } = await axios.get(
          `http://localhost:5000/api/albums?limit=${PAGE_SIZE}&offset=${offset}`,
          { headers }
        );
        const combined = [...allAlbumsRef.current, ...nextPage.albums];
        const deduped  = Array.from(new Map(combined.map((a) => [a.id, a])).values());
        allAlbumsRef.current = deduped;
        setAlbums([...deduped]);
        offset += PAGE_SIZE;
      }
      setLoadingMore(false);

    } catch (err) {
      console.error('Failed to load albums:', err);
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  // ── Check Discogs only for albums on the current page ────────────────────

  const checkCurrentPage = useCallback(async (pageAlbums) => {
    const unchecked = pageAlbums.filter((a) => vinylRef.current[a.id] === undefined);
    if (unchecked.length === 0) return;

    const headers = getHeaders();
    try {
      const { data: job } = await axios.post(
        'http://localhost:5000/api/vinyl/batch',
        { albums: unchecked.map((a) => ({ id: a.id, artist: a.primaryArtist, title: a.title })) },
        { headers }
      );
      pollJob(job.jobId);
    } catch (err) {
      console.error('Failed to start vinyl check:', err);
    }
  }, []);

  // ── Poll a Discogs batch job until done ───────────────────────────────────

  function pollJob(jobId) {
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(
          `http://localhost:5000/api/vinyl/status/${jobId}`,
          { headers: getHeaders() }
        );
        setVinyl((prev) => ({ ...prev, ...data.results }));
        setJobProgress({ completed: data.completed, total: data.total });
        if (data.status === 'done') {
          clearInterval(interval);
          setJobProgress(null);
        }
      } catch (err) {
        console.error('Poll error:', err);
        clearInterval(interval);
      }
    }, POLL_INTERVAL);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await axios.get('http://localhost:5000/auth/logout', { headers: getHeaders() });
    sessionStorage.removeItem('sid');
    setUser(null);
  };

  // ── Sort + filter ─────────────────────────────────────────────────────────

  const sortedFiltered = [...albums]
    .sort((a, b) => sortBy === 'artist' ? a.artist.localeCompare(b.artist) : 0)
    .filter((album) => {
      const v = vinyl[album.id];
      if (filter === 'found'     && (!v || !v.found)) return false;
      if (filter === 'not_found' && v?.found)          return false;
      if (search) {
        const q = search.toLowerCase();
        if (!album.title.toLowerCase().includes(q) &&
            !album.artist.toLowerCase().includes(q)) return false;
      }
      return true;
    });

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages      = Math.ceil(sortedFiltered.length / DISPLAY_PAGE_SIZE);
  const paginatedAlbums = sortedFiltered.slice(
    (page - 1) * DISPLAY_PAGE_SIZE,
    page * DISPLAY_PAGE_SIZE
  );

  // Reset to page 1 when filter/search/sort changes
  useEffect(() => { setPage(1); }, [filter, search, sortBy]);

  // Trigger Discogs check only when the visible album IDs actually change
  useEffect(() => {
    if (paginatedAlbums.length === 0) return;
    const currentIds = paginatedAlbums.map((a) => a.id).join(',');
    if (currentIds === lastCheckedIdsRef.current) return;
    lastCheckedIdsRef.current = currentIds;
    checkCurrentPage(paginatedAlbums);
  }, [paginatedAlbums]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const checkedAlbums = albums.filter((a) => vinyl[a.id] !== undefined);
  const foundAlbums   = checkedAlbums.filter((a) => vinyl[a.id]?.found);
  const prices        = foundAlbums.map((a) => vinyl[a.id]?.lowestPrice).filter(Boolean);
  const avgPrice      = prices.length
    ? (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      <header className={styles.topbar}>
        <div className={styles.logo}>
          <span className={styles.dot} />
          Will it Spin?
        </div>
        <div className={styles.userArea}>
          {loadingMore && (
            <span className={styles.scanning}>
              Loading albums… {albums.length}/{totalAlbums}
            </span>
          )}
          {!loadingMore && jobProgress && (
            <span className={styles.scanning}>
              Checking Discogs… {jobProgress.completed}/{jobProgress.total}
            </span>
          )}
          <span className={styles.username}>{user.display_name}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <StatsBar
        total={totalAlbums}
        found={foundAlbums.length}
        checking={totalAlbums - checkedAlbums.length}
        avgPrice={avgPrice}
      />

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <SearchIcon />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search albums or artists…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          {['all', 'found', 'not_found'].map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'found' ? '● Vinyl found' : '○ Not found'}
            </button>
          ))}
        </div>
        <div className={styles.sortWrap}>
          <span className={styles.sortLabel}>Sort:</span>
          <button
            className={`${styles.sortBtn} ${sortBy === 'date' ? styles.active : ''}`}
            onClick={() => setSortBy('date')}
          >
            Recently saved
          </button>
          <button
            className={`${styles.sortBtn} ${sortBy === 'artist' ? styles.active : ''}`}
            onClick={() => setSortBy('artist')}
          >
            Artist A–Z
          </button>
        </div>
      </div>

      <div className={styles.colHeaders}>
        <span className={styles.colNum}>#</span>
        <span />
        <span>Album</span>
        <span className={styles.colRight}>Vinyl</span>
        <span className={styles.colRight}>Lowest price</span>
      </div>

      <main className={styles.list}>
        {loading ? (
          <p className={styles.empty}>Loading your Spotify library…</p>
        ) : paginatedAlbums.length === 0 ? (
          <p className={styles.empty}>No albums match your filters.</p>
        ) : (
          paginatedAlbums.map((album, i) => (
            <AlbumRow
              key={album.id}
              index={(page - 1) * DISPLAY_PAGE_SIZE + i + 1}
              album={album}
              vinylResult={vinyl[album.id]}
            />
          ))
        )}
      </main>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
            <span className={styles.pageCount}> · {sortedFiltered.length} albums</span>
          </span>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}

    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}
