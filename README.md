# LongDrive Music Player 🎵

A static, self-hosted music player for GitHub Pages — no backend, no domain required.

## Features

- 🎨 **Dark glassmorphism UI** — Spotify-style layout with ambient gradient art per track
- 🎵 **Two playlists** — "My Music" and "Devotional" auto-detected from folder names
- 🔁 **Full playback controls** — Play/Pause, Prev/Next, Seek, Volume, Shuffle, Repeat (Off/All/One)
- 🔍 **Live search** — filter tracks by name instantly
- 💾 **Persists state** — last track, volume, shuffle & repeat via localStorage
- ⌨️ **Keyboard shortcuts** — Space, ←→ seek, ↑↓ volume, N/P next/prev
- 📱 **Fully responsive** — mobile-friendly layout
- ⚡ **Auto-playlist** — GitHub Action regenerates `playlist.json` on every push

## Getting Started

### 1. Add your music

Drop MP3 files into the appropriate folder:
- `music/my-music/` for personal tracks
- `music/devotional/` for devotional music

File names are auto-converted to track titles:
- `01 - some_awesome_track.mp3` → **Some Awesome Track**
- `Krishna_Das_Hanuman_Chalisa.mp3` → **Krishna Das Hanuman Chalisa**

### 2. Push to `main`

The GitHub Action (`.github/workflows/build-playlist.yml`) will:
1. Run `node scripts/generate-playlist.js`
2. Commit the updated `playlist.json` back to the repo

### 3. Enable GitHub Pages

- Go to **Settings → Pages**
- Source: **Deploy from a branch** → `main` → `/` (root)
- Your player will be live at `https://<username>.github.io/<repo>/`

## Local Development

```bash
# Generate playlist.json locally
node scripts/generate-playlist.js

# Serve with any static server
npx serve .
# or
python -m http.server 8080
```

> **Note:** You must serve via HTTP (not `file://`) because the player uses `fetch()` to load `playlist.json`.

## Supported Audio Formats

`.mp3` · `.ogg` · `.wav` · `.flac` · `.aac` · `.m4a`

## File Structure

```
├── index.html                         # Player UI
├── style.css                          # Dark theme styles
├── player.js                          # Player logic
├── playlist.json                      # Auto-generated track index
├── music/
│   ├── my-music/                      # Personal tracks (add MP3s here)
│   └── devotional/                    # Devotional tracks (add MP3s here)
├── scripts/
│   └── generate-playlist.js           # Playlist generator (Node.js)
└── .github/
    └── workflows/
        └── build-playlist.yml         # GitHub Action
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek −5s / +5s |
| `↑` / `↓` | Volume +5% / −5% |
| `N` | Next track |
| `P` | Previous track |
