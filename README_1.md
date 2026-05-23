# Will it Spin?

A web app that connects to your Spotify library and checks Discogs for vinyl LP listings of your saved albums. Browse your collection, see which albums are available on wax, and find the lowest price currently listed.

---

## How It Works

### Tech Stack
- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Database:** MongoDB (via Mongoose)
- **APIs:** Spotify Web API, Discogs REST API

### Application Flow

1. **Authentication** — The user clicks "Connect with Spotify." The Express server redirects them to Spotify's OAuth 2.0 consent screen. After the user approves, Spotify sends an authorization code back to the server's `/auth/callback` route. The server exchanges this code for an access token and refresh token, stores them in a server-side session, and redirects the browser to the dashboard.

2. **Album loading** — The dashboard fetches the user's saved Spotify albums in pages of 50. The first page appears immediately; remaining pages load in the background and are added to the list as they arrive. Duplicate albums (which Spotify sometimes returns) are filtered out.

3. **Vinyl checking** — Once the first page of albums is displayed, the app sends only those 50 albums to the server as a batch job. The server queries the Discogs database for each album, searching for vinyl LP releases and checking the marketplace for active listings and the lowest current price. Results are returned via a polling endpoint that the client checks every 2 seconds. When the user navigates to a new page, that page's albums are checked — already-checked albums are skipped.

4. **Caching** — Every Discogs result is stored in MongoDB with a 7-day TTL (time-to-live). When an album is checked again within 7 days, the cached result is returned instantly without hitting the Discogs API. This respects Discogs' rate limit of 60 requests per minute.

5. **Display** — Albums are shown 50 per page. The user can sort by recently saved (Spotify default order) or alphabetically by artist, filter to show only albums with vinyl found or not found, and search by album or artist name. Each album row shows a badge with the number of Discogs listings and the lowest listed price, linking directly to the Discogs release page.

---

## Project Structure

```
vinyl-finder/
  client/                         ← React frontend (Vite)
    src/
      App.jsx                     ← Auth context, routing, session management
      pages/
        LoginPage.jsx             ← Spotify connect screen
        DashboardPage.jsx         ← Main album browser with pagination + sorting
      components/
        AlbumRow.jsx              ← Single album row with vinyl badge + price
        StatsBar.jsx              ← Summary stats at top of dashboard
  server/                         ← Express backend
    src/
      index.js                    ← Server entry point, middleware, DB connection
      routes/
        auth.js                   ← Spotify OAuth flow (login, callback, logout, /me)
        albums.js                 ← Spotify album fetching (paginated)
        vinyl.js                  ← Discogs batch jobs + polling endpoint
      middleware/
        requireAuth.js            ← Protects API routes, handles token refresh
      services/
        discogsService.js         ← Rate-limited Discogs queue + cache lookup
      models/
        VinylCache.js             ← MongoDB model with 7-day auto-expiring TTL
```

---

## Setup

### Prerequisites
- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- Spotify Developer account → https://developer.spotify.com
- Discogs Developer account → https://www.discogs.com/settings/developers

### Installation

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Environment Variables

Copy `server/.env.example` to `server/.env` and fill in:

```
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/vinyl-finder
SESSION_SECRET=a_long_random_string_at_least_32_characters

SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/auth/callback

DISCOGS_TOKEN=your_discogs_personal_access_token
```

Also create `client/.env`:
```
VITE_API_URL=http://localhost:5000
```

### Spotify App Configuration

1. Go to https://developer.spotify.com/dashboard and create an app
2. Under Settings, add `http://127.0.0.1:5000/auth/callback` as a Redirect URI
   - Use `127.0.0.1` not `localhost` — Spotify requires this for HTTP in development
3. Under User Management, add your Spotify account email (required while the app is in Development mode)
4. Copy the Client ID and Client Secret into `server/.env`

### Running the App

In one terminal:
```bash
cd server
npm run dev
```

In a second terminal:
```bash
cd client
npm run dev
```

Open http://localhost:5173

---

## Major Debugging Changes

The following issues were encountered and resolved during development. Documented here as a reference for future MERN projects involving OAuth.

---

### 1. PowerShell doesn't support `&&`

**Problem:** The setup instructions used `cd server && npm install`, which works in bash/zsh but throws a parse error in Windows PowerShell.

**Fix:** Run commands separately on Windows:
```powershell
cd server
npm install
```

---

### 2. Spotify rejected `localhost` as a redirect URI

**Problem:** Spotify's developer dashboard refused to accept `http://localhost:5000/auth/callback`, showing an "Insecure redirect URI" error.

**Fix:** Use `http://127.0.0.1:5000/auth/callback` instead. Spotify treats `127.0.0.1` as a loopback address and permits plain HTTP for it in development. Both the Spotify dashboard setting and `SPOTIFY_REDIRECT_URI` in `.env` must use `127.0.0.1`.

---

### 3. OAuth state mismatch

**Problem:** After Spotify redirected back to the app, the server returned a `state_mismatch` error. The `state` parameter generated during `/auth/login` was not present in the session by the time `/auth/callback` was reached.

**Root cause:** The session cookie was not persisting between the two requests due to cross-origin cookie restrictions (the React app on port 5173 and the Express server on port 5000 are treated as different origins).

**Fix:** The state check was disabled temporarily to confirm this was the only issue, then the session problem was addressed properly in the next step.

---

### 4. Session cookies not persisting across origins

**Problem:** The Express session was created successfully during `/auth/callback` (confirmed via console logs), but a completely different session ID appeared when `/auth/me` was called from the React frontend. This meant the user object stored in the session was never found, and the app treated the user as logged out.

**Root cause:** Browsers block cross-origin cookies by default. The session cookie set by the server on port 5000 was not sent by the browser when the React app on port 5173 made API requests, even with `withCredentials: true` on axios.

**Fix:** After the OAuth callback succeeds, the server passes the session ID as a URL query parameter (`?sid=...`) in the redirect to the frontend. The React app reads this from the URL, stores it in `sessionStorage`, and attaches it as a custom `x-session-id` header on every subsequent API request. The server's `requireAuth` middleware and `/auth/me` route were updated to look up the session by this header when present, using `req.sessionStore.get(sid, callback)`.

---

### 5. Custom headers stripped by the Vite proxy

**Problem:** Even after implementing the `x-session-id` header approach, the header was not reaching the server. API calls were returning 401 errors.

**Root cause:** The Vite development proxy (which forwards `/api` and `/auth` requests to the Express server) was stripping custom headers.

**Fix:** Changed all API calls in the React app to use the full `http://localhost:5000/...` URL, bypassing the Vite proxy entirely for authenticated requests.

---

### 6. 413 Payload Too Large on Discogs batch request

**Problem:** When the app tried to send all ~960 albums to the `/api/vinyl/batch` endpoint at once, the server responded with a 413 error.

**Fix:** Two changes were made:
- Added `{ limit: '10mb' }` to Express's `express.json()` middleware
- Split the batch into chunks of 100 albums per request on the client side

---

### 7. Discogs checking all albums instead of just the current page

**Problem:** The `useEffect` that triggered Discogs checks depended on `albums.length` in its dependency array. Since albums load in batches of 50 in the background, this caused the effect to fire on every batch arrival — sending Discogs requests for all loaded albums rather than just the visible page.

**Fix:** Replaced the `albums.length` dependency with a `lastCheckedIdsRef` ref that stores a comma-joined string of the current page's album IDs. The effect only calls `checkCurrentPage` when this string changes, meaning it only fires when the actually-visible albums change (page navigation, sorting, filtering) — not when background loading adds more albums to the list.

---

### 8. Duplicate album keys

**Problem:** React warned about duplicate keys in the album list. Spotify's API occasionally returns the same album more than once across paginated results.

**Fix:** After merging each new page of albums into the running list, duplicates are removed using a `Map` keyed by Spotify album ID:
```javascript
const deduped = Array.from(new Map(combined.map((a) => [a.id, a])).values());
```
