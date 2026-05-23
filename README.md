# Vinyl Finder

A web app that connects to your Spotify library and checks Discogs for vinyl LP listings of your saved albums.

## Project Structure

```
vinyl-finder/
  client/       ← React frontend (Vite)
  server/       ← Express backend (Node.js)
```

## Prerequisites

- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- Spotify Developer account → https://developer.spotify.com
- Discogs Developer account → https://www.discogs.com/settings/developers

## Setup

### 1. Clone and install

```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Create environment files

**server/.env**
```
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/vinyl-finder
SESSION_SECRET=replace_with_a_long_random_string

SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5000/auth/callback

DISCOGS_TOKEN=your_discogs_personal_access_token
```

**client/.env**
```
VITE_API_URL=http://localhost:5000
```

### 3. Register your Spotify app

1. Go to https://developer.spotify.com/dashboard
2. Create an app
3. Add `http://localhost:5000/auth/callback` as a Redirect URI
4. Copy Client ID and Client Secret into server/.env

### 4. Get a Discogs token

1. Go to https://www.discogs.com/settings/developers
2. Generate a Personal Access Token
3. Add it to server/.env

### 5. Run the app

```bash
# Terminal 1 — start the server
cd server && npm run dev

# Terminal 2 — start the client
cd client && npm run dev
```

Open http://localhost:5173

## How It Works

1. User logs in via Spotify OAuth 2.0
2. The server fetches the user's saved albums from Spotify
3. For each album, the server queries Discogs to find vinyl LP listings
4. Results are cached in MongoDB to respect Discogs rate limits (60 req/min)
5. The React frontend displays albums with vinyl availability and prices
