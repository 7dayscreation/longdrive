/**
 * Personal Music Player — LongDrive Edition
 * Ultra-fast Vanilla JS with Web Audio API, MediaSession, and dynamic playlist loading.
 */

// ── Fallback / Sample Tracks if playlist is empty ────────────────────────────
const SAMPLE_TRACKS = [
  {
    id: "sample-1",
    title: "Starlit Reverie",
    artist: "Buqiarti x Lil Magrib",
    album: "Night Bloom",
    folder: "my-music",
    duration: "3:12",
    color: "#c6e94c",
    genre: "Electronic",
    path: ""
  },
  {
    id: "sample-2",
    title: "Midnight Confessions",
    artist: "Alexiao",
    album: "After Hours",
    folder: "my-music",
    duration: "4:08",
    color: "#7b6fd6",
    genre: "R&B",
    path: ""
  },
  {
    id: "sample-3",
    title: "Lost in the Echo",
    artist: "Alexiao",
    album: "Parallel Lines",
    folder: "devotional",
    duration: "3:44",
    color: "#d87a54",
    genre: "Devotional",
    path: ""
  },
  {
    id: "sample-4",
    title: "Breaking the Silence",
    artist: "Alexiao",
    album: "Night Bloom",
    folder: "devotional",
    duration: "3:36",
    color: "#ba6d91",
    genre: "Devotional",
    path: ""
  },
  {
    id: "sample-5",
    title: "Tears on the Vinyl",
    artist: "Alexiao",
    album: "After Hours",
    folder: "my-music",
    duration: "4:21",
    color: "#c5904c",
    genre: "Soul",
    path: ""
  }
];

const COLOR_PALETTE = [
  "#c6e94c", "#b7d93e", "#7b6fd6", "#d87a54", "#5b9c9c", 
  "#ba6d91", "#c5904c", "#48dbfb", "#a29bfe", "#fd79a8"
];

// ── State ────────────────────────────────────────────────────────────────────
const AUDIO_CACHE_NAME = "longdrive-audio-cache-v1";

const state = {
  tracks: [],
  currentTrackId: null,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0, // 0 = Off, 1 = All, 2 = One
  volume: 0.8,
  isMuted: false,
  playbackRate: 1.0,
  activeView: "library",
  activeFilter: "All",
  searchQuery: "",
  likedSongIds: new Set(),
  recentSongIds: [],
  cachedTrackPaths: new Set(),
  blobUrls: new Map(),
  eqPreset: "Flat",
  sleepTimer: null,
  sleepTimerEndsAt: null,
  sleepTimerEndOfTrack: false
};

function initAudioContext() {
  // Direct hardware accelerated HTML5 audio playback (zero CORS or silence bugs)
}

function applyEqPreset(preset) {
  state.eqPreset = preset;
  try { localStorage.setItem("pmp_eq", preset); } catch (e) {}

  const label = preset === "BassBoost" ? "Bass Boost" : preset === "Vocal" ? "Vocal Clarity" : preset === "Acoustic" ? "Acoustic" : preset === "Treble" ? "Treble Air" : "Flat EQ";
  const sLabel = document.getElementById("sidebar-eq-label");
  if (sLabel) sLabel.textContent = label;
  const tLabel = document.getElementById("top-eq-label");
  if (tLabel) tLabel.textContent = "EQ: " + (preset === "Flat" ? "Flat" : preset);
  const npBadge = document.getElementById("np-eq-badge");
  if (npBadge) npBadge.textContent = label;

  const presetSelect = document.getElementById("preset-select");
  if (presetSelect) presetSelect.value = preset;
  const settingsSelect = document.getElementById("settings-eq-select");
  if (settingsSelect) settingsSelect.value = preset;

  document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-preset") === preset);
  });
}

// ── Offline Drive & Preload Engine (Spotify-style Lookahead Cache) ───────────
async function initAudioCache() {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    keys.forEach(req => {
      const url = new URL(req.url);
      state.cachedTrackPaths.add(url.pathname);
      state.cachedTrackPaths.add(decodeURI(url.pathname));
      state.cachedTrackPaths.add(req.url);
    });
    updateCacheStorageText();
  } catch (e) {
    console.warn("Could not inspect audio cache:", e);
  }
}

function updateCacheStorageText() {
  const desc = document.getElementById("cache-storage-desc");
  if (!desc) return;
  const count = state.cachedTrackPaths.size;
  if (count > 0) {
    desc.textContent = `${count} audio file(s) saved on this device for zero-network driving.`;
  } else {
    desc.textContent = "Preloads complete songs into your device storage for zero-network playback.";
  }
}

async function getPlayableAudioUrl(track) {
  if (!track || !track.path) return "";
  if (track.path.startsWith("blob:") || track.path.startsWith("data:")) return track.path;

  // 1. In-memory blob check
  if (state.blobUrls.has(track.path)) {
    return state.blobUrls.get(track.path);
  }

  const encodedPath = encodeURI(track.path);

  // 2. Persistent Cache API check
  if ("caches" in window) {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const fullUrl = new URL(encodedPath, window.location.href).href;
      const cachedResponse = await cache.match(fullUrl) || await cache.match(encodedPath);
      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const objUrl = URL.createObjectURL(blob);
        state.blobUrls.set(track.path, objUrl);
        state.cachedTrackPaths.add(track.path);
        return objUrl;
      }
    } catch (e) {}
  }

  return encodedPath;
}

async function preloadTrack(track, silent = true) {
  if (!track || !track.path || track.path.startsWith("blob:") || !("caches" in window)) return;
  const encodedPath = encodeURI(track.path);
  const fullUrl = new URL(encodedPath, window.location.href).href;

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const existing = await cache.match(fullUrl);
    if (!existing) {
      const response = await fetch(fullUrl);
      if (response.ok) {
        await cache.put(fullUrl, response.clone());
        const blob = await response.blob();
        state.blobUrls.set(track.path, URL.createObjectURL(blob));
        state.cachedTrackPaths.add(track.path);
        updateCacheStorageText();
        if (!silent) {
          showToast(`Downloaded "${track.title}" for offline drive!`);
        }
      }
    } else {
      state.cachedTrackPaths.add(track.path);
    }
  } catch (err) {
    console.warn("Background preloading error for:", track.title, err);
  }
}

async function preloadUpcomingTracks(currentTrackId) {
  const filtered = getFilteredTracks();
  if (filtered.length === 0) return;

  const currentIdx = filtered.findIndex(t => t.id === currentTrackId);
  const queue = [];

  // Current track first if not cached
  const current = filtered[currentIdx];
  if (current) queue.push(current);

  // Next 2 upcoming tracks in queue
  for (let i = 1; i <= 2; i++) {
    const nextIdx = (currentIdx + i) % filtered.length;
    if (filtered[nextIdx] && filtered[nextIdx].id !== currentTrackId) {
      queue.push(filtered[nextIdx]);
    }
  }

  for (const tr of queue) {
    await preloadTrack(tr, true);
  }
}

async function cacheCurrentPlaylist() {
  const filtered = getFilteredTracks();
  if (filtered.length === 0) {
    showToast("No tracks in this playlist to save.");
    return;
  }

  const btnText = document.getElementById("btn-preload-text");
  showToast(`Saving ${filtered.length} tracks to phone storage for offline drive...`);
  
  let done = 0;
  for (const track of filtered) {
    if (btnText) btnText.textContent = `Saving (${done + 1}/${filtered.length})...`;
    await preloadTrack(track, true);
    done++;
  }

  if (btnText) btnText.textContent = "✓ Saved for offline";
  showToast(`✓ All ${filtered.length} tracks are saved! You can drive with zero network.`);
  updateCacheStorageText();
  renderSongList();
}

async function clearAudioCache() {
  if (!("caches" in window)) return;
  try {
    await caches.delete(AUDIO_CACHE_NAME);
    state.cachedTrackPaths.clear();
    state.blobUrls.clear();
    updateCacheStorageText();
    renderSongList();
    showToast("Offline audio cache cleared.");
  } catch (e) {
    console.warn("Could not clear cache:", e);
  }
}

// ── DOM References ───────────────────────────────────────────────────────────
const audio = document.getElementById("audio");
const fileInput = document.getElementById("file-input");
const searchInput = document.getElementById("search-input");
const filterRow = document.getElementById("filter-row");
const songList = document.getElementById("song-list");
const emptyState = document.getElementById("empty-state");
const trackCountText = document.getElementById("track-count-text");
const storageCount = document.getElementById("storage-count");
const storageFill = document.getElementById("storage-fill");

// Views
const viewLibrary = document.getElementById("view-library");
const viewNowPlaying = document.getElementById("view-nowplaying");
const viewSettings = document.getElementById("view-settings");

// Now Playing elements
const npArtwork = document.getElementById("np-artwork");
const npMonogram = document.getElementById("np-monogram");
const npTitle = document.getElementById("np-title");
const npArtist = document.getElementById("np-artist");
const npAlbum = document.getElementById("np-album");
const npYear = document.getElementById("np-year");
const npGenre = document.getElementById("np-genre");
const npFolderBadge = document.getElementById("np-folder-badge");
const seekSlider = document.getElementById("seek-slider");
const timeElapsed = document.getElementById("time-elapsed");
const timeRemaining = document.getElementById("time-remaining");
const btnMainPlay = document.getElementById("btn-main-play");
const mainPlayIcon = document.getElementById("main-play-icon");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnShuffle = document.getElementById("btn-shuffle");
const btnRepeat = document.getElementById("btn-repeat");
const repeatBadge = document.getElementById("repeat-badge");
const btnNpLike = document.getElementById("btn-np-like");
const btnMute = document.getElementById("btn-mute");
const volumeIcon = document.getElementById("volume-icon");
const volumeSlider = document.getElementById("volume-slider");
const speedSelect = document.getElementById("speed-select");
const dynamicBackdrop = document.getElementById("dynamic-backdrop");

// Full-width Footer Web Player elements
const bottomPlayer = document.getElementById("bottom-player");
const bpArt = document.getElementById("bp-art");
const bpMonogram = document.getElementById("bp-monogram");
const bpTitle = document.getElementById("bp-title");
const bpArtist = document.getElementById("bp-artist");
const btnBpLike = document.getElementById("btn-bp-like");
const btnBpShuffle = document.getElementById("btn-bp-shuffle");
const btnBpPrev = document.getElementById("btn-bp-prev");
const btnBpPlay = document.getElementById("btn-bp-play");
const bpPlayIcon = document.getElementById("bp-play-icon");
const btnBpNext = document.getElementById("btn-bp-next");
const btnBpRepeat = document.getElementById("btn-bp-repeat");
const bpRepeatBadge = document.getElementById("bp-repeat-badge");
const bpSeekSlider = document.getElementById("bp-seek-slider");
const bpTimeElapsed = document.getElementById("bp-time-elapsed");
const bpTimeRemaining = document.getElementById("bp-time-remaining");
const btnBpEq = document.getElementById("btn-bp-eq");
const btnBpTimer = document.getElementById("btn-bp-timer");
const btnBpMute = document.getElementById("btn-bp-mute");
const bpVolumeIcon = document.getElementById("bp-volume-icon");
const bpVolumeSlider = document.getElementById("bp-volume-slider");
const btnBpExpand = document.getElementById("btn-bp-expand");
const bpInfoClick = document.getElementById("bp-info-click");

// Modals & Toast
const modalEq = document.getElementById("modal-eq");
const modalTimer = document.getElementById("modal-timer");
const toast = document.getElementById("toast");

// ── Color & Initials Helpers ─────────────────────────────────────────────────
function getTrackColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function getInitials(str) {
  if (!str) return "♪";
  const words = str.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// ── View Switching ───────────────────────────────────────────────────────────
function setView(viewName) {
  state.activeView = viewName;
  viewLibrary.classList.toggle("hidden", viewName !== "library");
  viewNowPlaying.classList.toggle("hidden", viewName !== "nowplaying");
  viewSettings.classList.toggle("hidden", viewName !== "settings");

  document.body.classList.toggle("is-now-playing", viewName === "nowplaying");
  if (miniPlayer) {
    miniPlayer.style.display = viewName === "nowplaying" ? "none" : "flex";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });

  document.querySelectorAll("[data-view]").forEach(btn => {
    const isTarget = btn.getAttribute("data-view") === viewName;
    const filter = btn.getAttribute("data-filter");
    if (viewName === "library" && filter) {
      btn.classList.toggle("nav-active", isTarget && filter === state.activeFilter);
    } else {
      btn.classList.toggle("nav-active", isTarget);
    }
  });
}

function formatFolderLabel(folder) {
  if (!folder) return "Library";
  if (folder.toLowerCase() === "devotional") return "Devotional";
  if (folder.toLowerCase() === "my-music") return "My Music";
  return folder
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Track Filtering & Rendering ──────────────────────────────────────────────
function getFilteredTracks() {
  let list = state.tracks;

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(t => 
      t.title.toLowerCase().includes(q) ||
      (t.artist && t.artist.toLowerCase().includes(q)) ||
      (t.folder && t.folder.toLowerCase().includes(q)) ||
      (t.album && t.album.toLowerCase().includes(q)) ||
      (t.filename && t.filename.toLowerCase().includes(q))
    );
  }

  if (state.activeFilter === "Liked Songs") {
    list = list.filter(t => state.likedSongIds.has(t.id));
  } else if (state.activeFilter === "Recently Played") {
    list = state.recentSongIds.map(id => state.tracks.find(t => t.id === id)).filter(Boolean);
  } else if (state.activeFilter !== "All") {
    const target = state.activeFilter.toLowerCase();
    list = list.filter(t => {
      const fName = formatFolderLabel(t.folder).toLowerCase();
      const rawFolder = (t.folder || "").toLowerCase();
      const album = (t.album || "").toLowerCase();
      const folderLabel = (t.folderLabel || "").toLowerCase();
      return fName === target || rawFolder === target || album === target || folderLabel === target;
    });
  }

  return list;
}

function renderFilterPills() {
  if (!filterRow) return;
  const folders = [...new Set(state.tracks.map(t => t.folderLabel || formatFolderLabel(t.folder)).filter(Boolean))];
  const pills = ["All", ...folders, "Liked Songs", "Recently Played"];

  filterRow.innerHTML = pills.map(p => `
    <button class="filter-pill ${state.activeFilter === p ? "filter-active" : ""}" data-filter="${p}" role="tab">${p}</button>
  `).join("");
}

function renderSidebarPlaylists() {
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;
  const folders = [...new Set(state.tracks.map(t => t.folderLabel || formatFolderLabel(t.folder)).filter(Boolean))];

  let html = `
    <button class="nav-btn ${state.activeView === "library" && state.activeFilter === "All" ? "nav-active" : ""}" data-view="library" data-filter="All">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z"/></svg>
      <span>All Tracks</span>
    </button>
  `;

  folders.forEach(f => {
    const count = state.tracks.filter(t => (t.folderLabel || formatFolderLabel(t.folder)) === f).length;
    const isActive = state.activeView === "library" && state.activeFilter === f;
    html += `
      <button class="nav-btn ${isActive ? "nav-active" : ""}" data-view="library" data-filter="${f}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
        <span>${f}</span>
        <span style="margin-left: auto; font-size: 10px; color: var(--muted); background: #1b2018; padding: 2px 6px; border-radius: 8px;">${count}</span>
      </button>
    `;
  });

  html += `
    <button class="nav-btn ${state.activeView === "library" && state.activeFilter === "Liked Songs" ? "nav-active" : ""}" data-view="library" data-filter="Liked Songs">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z"/></svg>
      <span>Liked Songs</span>
    </button>

    <button class="nav-btn ${state.activeView === "nowplaying" ? "nav-active" : ""}" data-view="nowplaying">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span>Now Playing</span>
    </button>
  `;

  nav.innerHTML = html;

  nav.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      const filter = btn.getAttribute("data-filter");
      if (filter) {
        state.activeFilter = filter;
        document.querySelectorAll(".filter-pill").forEach(p => {
          p.classList.toggle("filter-active", p.getAttribute("data-filter") === filter);
        });
      }
      setView(view);
      if (view === "library") renderSongList();
    });
  });
}

function renderSongList() {
  const filtered = getFilteredTracks();
  songList.innerHTML = "";

  trackCountText.textContent = filtered.length + " track" + (filtered.length === 1 ? "" : "s");
  storageCount.textContent = state.tracks.length + " tracks indexed";
  storageFill.style.width = Math.min(100, Math.max(12, state.tracks.length * 15)) + "%";

  const kicker = document.getElementById("library-kicker");
  const heading = document.getElementById("library-heading");
  const subtitle = document.getElementById("library-subtitle");

  if (state.searchQuery) {
    kicker.textContent = "SEARCH RESULTS";
    heading.textContent = '"' + state.searchQuery + '"';
    subtitle.textContent = "Found " + filtered.length + " matching track" + (filtered.length === 1 ? "" : "s");
  } else {
    kicker.textContent = state.activeFilter === "All" ? "COLLECTION / 2024" : "ALBUM PLAYLIST";
    heading.textContent = state.activeFilter;
    subtitle.textContent = state.activeFilter === "Liked Songs" 
      ? "Your heart-picked favorites in one place."
      : `${filtered.length} track${filtered.length === 1 ? "" : "s"} in this album`;
  }

  const allCached = filtered.length > 0 && filtered.every(t => !t.path || t.path.startsWith("blob:") || state.cachedTrackPaths.has(t.path) || state.blobUrls.has(t.path));
  const btnPreloadText = document.getElementById("btn-preload-text");
  if (btnPreloadText) {
    btnPreloadText.textContent = allCached ? "✓ Saved for offline" : "Save for offline drive";
  }

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((track, idx) => {
    const isCurrent = track.id === state.currentTrackId;
    const isLiked = state.likedSongIds.has(track.id);
    const isCached = track.path && (track.path.startsWith("blob:") || state.cachedTrackPaths.has(track.path) || state.blobUrls.has(track.path));

    const row = document.createElement("article");
    row.className = "song-row" + (isCurrent ? " is-active" : "") + (isCurrent && state.isPlaying ? " is-playing" : "");
    row.setAttribute("data-id", track.id);
    row.setAttribute("role", "listitem");

    const trackColor = track.color || getTrackColor(track.title);
    const initials = getInitials(track.title);

    row.innerHTML = `
      <div class="track-num-col" style="display: grid; place-items: center;">
        <span class="track-number">${String(idx + 1).padStart(2, "0")}</span>
        <div class="playing-eq-bars" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="artwork" style="--art: ${trackColor};">
        <span>${initials}</span>
        <i></i>
      </div>
      <div class="song-info">
        <strong>${track.title}</strong>
        <span style="display: flex; align-items: center; gap: 4px;">
          ${track.artist || (track.folder === 'devotional' ? 'Devotional Track' : 'Selected Track')}
          ${isCached ? '<span class="cached-badge" title="Saved on device for offline driving">⚡ Offline Ready</span>' : ''}
        </span>
      </div>
      <span class="album-name">${track.album || (track.folder ? track.folder.replace('-', ' ') : 'Library')}</span>
      <span class="song-duration">${track.duration || '—'}</span>
      <button class="heart-button ${isLiked ? 'liked' : ''}" data-action="like" aria-label="Like song" title="Save to favorites">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z"/></svg>
      </button>
      <button class="row-play" data-action="play" aria-label="Play ${track.title}" title="Play song">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${isCurrent && state.isPlaying 
            ? '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'
            : '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/>'}
        </svg>
      </button>
    `;

    row.addEventListener("click", (e) => {
      const target = e.target.closest("button");
      if (target && target.getAttribute("data-action") === "like") {
        e.stopPropagation();
        toggleLike(track.id);
        return;
      }
      playTrack(track.id);
    });

    songList.appendChild(row);
  });
}

// ── Playback Controls ────────────────────────────────────────────────────────
function playTrack(id, shouldAutoplay = true) {
  initAudioContext();

  const track = state.tracks.find(t => t.id === id);
  if (!track) return;

  state.currentTrackId = id;

  state.recentSongIds = [id, ...state.recentSongIds.filter(i => i !== id)].slice(0, 30);
  try { localStorage.setItem("pmp_recents", JSON.stringify(state.recentSongIds)); } catch (e) {}

  if (track.path) {
    const rawPath = track.path.startsWith("blob:") ? track.path : encodeURI(track.path);
    audio.src = rawPath;
  } else {
    audio.removeAttribute("src");
    showToast('"' + track.title + '" is a demo track.');
  }

  if (npTitle) npTitle.textContent = track.title;
  if (npArtist) npArtist.textContent = track.artist || "LongDrive Selected";
  if (npAlbum) npAlbum.textContent = track.album || "Collection";
  if (npFolderBadge) npFolderBadge.textContent = track.folder ? track.folder.toUpperCase() : "MY MUSIC";
  if (npGenre) npGenre.textContent = track.genre || "Lossless Audio";

  const color = track.color || getTrackColor(track.title);
  const initials = getInitials(track.title);

  if (npArtwork) npArtwork.style.setProperty("--art", color);
  if (npMonogram) npMonogram.textContent = initials;
  if (dynamicBackdrop) dynamicBackdrop.style.setProperty("--track-glow", color + "20");

  if (bpTitle) bpTitle.textContent = track.title;
  if (bpArtist) bpArtist.textContent = track.artist || "LongDrive Library";
  if (bpArt) bpArt.style.setProperty("--art", color);
  if (bpMonogram) bpMonogram.textContent = initials;

  updateLikeButtons();

  try { localStorage.setItem("pmp_last_track", String(id)); } catch (e) {}

  if (shouldAutoplay && track.path) {
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        state.isPlaying = true;
        updatePlayStateUI();
      }).catch(err => {
        console.warn("Autoplay notice:", err);
        state.isPlaying = false;
        updatePlayStateUI();
      });
    }
  } else {
    state.isPlaying = false;
    updatePlayStateUI();
  }

  updateMediaSession(track);
  renderSongList();

  // Background lookahead caching without blocking playback
  setTimeout(() => {
    preloadUpcomingTracks(id);
  }, 100);
}

function togglePlayPause() {
  initAudioContext();

  if (!state.currentTrackId && state.tracks.length > 0) {
    playTrack(state.tracks[0].id);
    return;
  }

  const current = state.tracks.find(t => t.id === state.currentTrackId);
  if (!current || !current.path) {
    showToast("Please select a playable track with audio.");
    return;
  }

  if (audio.paused) {
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        state.isPlaying = true;
        updatePlayStateUI();
      }).catch(e => {
        console.warn("Playback error:", e);
        state.isPlaying = false;
        updatePlayStateUI();
      });
    }
  } else {
    audio.pause();
    state.isPlaying = false;
    updatePlayStateUI();
  }
}

function playNextTrack() {
  const filtered = getFilteredTracks();
  if (filtered.length === 0) return;

  let nextTrack = null;

  if (state.isShuffle) {
    const others = filtered.filter(t => t.id !== state.currentTrackId);
    if (others.length > 0) {
      nextTrack = others[Math.floor(Math.random() * others.length)];
    } else {
      nextTrack = filtered[0];
    }
  } else {
    const idx = filtered.findIndex(t => t.id === state.currentTrackId);
    if (idx === -1 || idx === filtered.length - 1) {
      nextTrack = filtered[0];
    } else {
      nextTrack = filtered[idx + 1];
    }
  }

  if (nextTrack) {
    playTrack(nextTrack.id);
  }
}

function playPrevTrack() {
  const filtered = getFilteredTracks();
  if (filtered.length === 0) return;

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  const idx = filtered.findIndex(t => t.id === state.currentTrackId);
  let prevTrack = null;
  if (idx <= 0) {
    prevTrack = filtered[filtered.length - 1];
  } else {
    prevTrack = filtered[idx - 1];
  }

  if (prevTrack) {
    playTrack(prevTrack.id);
  }
}

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  if (btnShuffle) btnShuffle.classList.toggle("control-active", state.isShuffle);
  if (btnBpShuffle) btnBpShuffle.classList.toggle("control-active", state.isShuffle);
  showToast(state.isShuffle ? "Shuffle Mode On" : "Shuffle Mode Off");
}

function toggleRepeat() {
  state.repeatMode = (state.repeatMode + 1) % 3;
  const isAll = state.repeatMode === 1;
  const isOne = state.repeatMode === 2;

  if (btnRepeat) btnRepeat.classList.toggle("control-active", isAll || isOne);
  if (repeatBadge) repeatBadge.style.display = isOne ? "grid" : "none";

  if (btnBpRepeat) btnBpRepeat.classList.toggle("control-active", isAll || isOne);
  if (bpRepeatBadge) bpRepeatBadge.style.display = isOne ? "grid" : "none";

  if (state.repeatMode === 0) showToast("Repeat Off");
  else if (state.repeatMode === 1) showToast("Repeat All Tracks");
  else if (state.repeatMode === 2) showToast("Repeat Current Track");
}

function toggleLike(id) {
  if (state.likedSongIds.has(id)) {
    state.likedSongIds.delete(id);
    showToast("Removed from Liked Songs");
  } else {
    state.likedSongIds.add(id);
    showToast("Added to Liked Songs");
  }

  try { localStorage.setItem("pmp_liked", JSON.stringify([...state.likedSongIds])); } catch (e) {}
  updateLikeButtons();
  if (state.activeFilter === "Liked Songs") {
    renderSongList();
  }
}

function updateLikeButtons() {
  const isLiked = state.likedSongIds.has(state.currentTrackId);
  if (btnNpLike) btnNpLike.classList.toggle("liked", isLiked);
  if (btnBpLike) btnBpLike.classList.toggle("liked", isLiked);

  document.querySelectorAll(".song-row").forEach(row => {
    const id = row.getAttribute("data-id");
    const heart = row.querySelector(".heart-button");
    if (heart) {
      heart.classList.toggle("liked", state.likedSongIds.has(id));
    }
  });
}

function updatePlayStateUI() {
  const playSvg = '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/>';
  const pauseSvg = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
  const bpPlaySvg = '<polygon points="7 4 19 12 7 20 7 4" fill="currentColor"/>';
  const bpPauseSvg = '<rect x="5" y="4" width="4" height="16" fill="currentColor"/><rect x="15" y="4" width="4" height="16" fill="currentColor"/>';

  if (state.isPlaying) {
    if (mainPlayIcon) mainPlayIcon.innerHTML = pauseSvg;
    if (bpPlayIcon) bpPlayIcon.innerHTML = bpPauseSvg;
    if (npArtwork) npArtwork.classList.add("is-spinning");
  } else {
    if (mainPlayIcon) mainPlayIcon.innerHTML = playSvg;
    if (bpPlayIcon) bpPlayIcon.innerHTML = bpPlaySvg;
    if (npArtwork) npArtwork.classList.remove("is-spinning");
  }

  document.querySelectorAll(".song-row").forEach(row => {
    const id = row.getAttribute("data-id");
    const isCurrent = id === state.currentTrackId;
    row.classList.toggle("is-active", isCurrent);
    row.classList.toggle("is-playing", isCurrent && state.isPlaying);

    const playBtnSvg = row.querySelector(".row-play svg");
    if (playBtnSvg) {
      playBtnSvg.innerHTML = (isCurrent && state.isPlaying) ? pauseSvg : playSvg;
    }
  });
}

// ── Audio Events (Play, Pause, Seek, Time, Ended, Error) ─────────────────────
audio.addEventListener("play", () => {
  state.isPlaying = true;
  updatePlayStateUI();
});

audio.addEventListener("pause", () => {
  state.isPlaying = false;
  updatePlayStateUI();
});

audio.addEventListener("error", (e) => {
  console.warn("Audio playback stream notice:", audio.error, e);
  state.isPlaying = false;
  updatePlayStateUI();
});

audio.addEventListener("timeupdate", () => {
  const cur = audio.currentTime || 0;
  const dur = audio.duration || 0;

  if (dur > 0) {
    const pct = (cur / dur) * 100;
    if (seekSlider) seekSlider.value = pct;
    if (bpSeekSlider) bpSeekSlider.value = pct;
    if (timeElapsed) timeElapsed.textContent = formatTime(cur);
    if (bpTimeElapsed) bpTimeElapsed.textContent = formatTime(cur);
    if (timeRemaining) timeRemaining.textContent = "-" + formatTime(Math.max(0, dur - cur));
    if (bpTimeRemaining) bpTimeRemaining.textContent = "-" + formatTime(Math.max(0, dur - cur));
  } else {
    if (seekSlider) seekSlider.value = 0;
    if (bpSeekSlider) bpSeekSlider.value = 0;
    if (timeElapsed) timeElapsed.textContent = "0:00";
    if (bpTimeElapsed) bpTimeElapsed.textContent = "0:00";
    if (timeRemaining) timeRemaining.textContent = "-0:00";
    if (bpTimeRemaining) bpTimeRemaining.textContent = "-0:00";
  }

  if (state.sleepTimerEndsAt && Date.now() >= state.sleepTimerEndsAt) {
    cancelSleepTimer();
    fadeOutAndPause();
  }
});

audio.addEventListener("ended", () => {
  if (state.sleepTimerEndOfTrack) {
    state.sleepTimerEndOfTrack = false;
    audio.pause();
    state.isPlaying = false;
    updatePlayStateUI();
    showToast("Sleep timer: Paused at end of track.");
    return;
  }

  if (state.repeatMode === 2) {
    audio.currentTime = 0;
    audio.play();
  } else if (state.repeatMode === 1) {
    playNextTrack();
  } else {
    const filtered = getFilteredTracks();
    const idx = filtered.findIndex(t => t.id === state.currentTrackId);
    if (idx !== -1 && idx < filtered.length - 1) {
      playNextTrack();
    } else {
      state.isPlaying = false;
      updatePlayStateUI();
    }
  }
});

seekSlider.addEventListener("input", (e) => {
  const dur = audio.duration || 0;
  if (dur > 0) {
    const target = (Number(e.target.value) / 100) * dur;
    audio.currentTime = target;
  }
});

// ── Volume & Speed ───────────────────────────────────────────────────────────
volumeSlider.addEventListener("input", (e) => {
  state.volume = Number(e.target.value) / 100;
  audio.volume = state.volume;
  state.isMuted = state.volume === 0;
  if (bpVolumeSlider) bpVolumeSlider.value = state.volume * 100;
  updateVolumeIcon();
  try { localStorage.setItem("pmp_volume", String(state.volume)); } catch (err) {}
});

btnMute.addEventListener("click", () => {
  state.isMuted = !state.isMuted;
  if (state.isMuted) {
    audio.volume = 0;
    volumeSlider.value = 0;
    if (bpVolumeSlider) bpVolumeSlider.value = 0;
  } else {
    audio.volume = state.volume || 0.8;
    volumeSlider.value = (state.volume || 0.8) * 100;
    if (bpVolumeSlider) bpVolumeSlider.value = (state.volume || 0.8) * 100;
  }
  updateVolumeIcon();
});

function updateVolumeIcon() {
  const muteSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  const lowSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  const highSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';

  let iconSvg = highSvg;
  if (state.isMuted || audio.volume === 0) {
    iconSvg = muteSvg;
  } else if (audio.volume < 0.5) {
    iconSvg = lowSvg;
  }

  if (volumeIcon) volumeIcon.innerHTML = iconSvg;
  if (bpVolumeIcon) bpVolumeIcon.innerHTML = iconSvg;
}

speedSelect.addEventListener("change", (e) => {
  state.playbackRate = Number(e.target.value);
  audio.playbackRate = state.playbackRate;
  showToast("Playback Speed: " + state.playbackRate + "x");
});

// ── Sleep Timer Logic ────────────────────────────────────────────────────────
function setSleepTimer(minutes, endOfTrack = false) {
  cancelSleepTimer();

  const timerBtnLabel = document.getElementById("top-timer-label");

  if (endOfTrack) {
    state.sleepTimerEndOfTrack = true;
    if (timerBtnLabel) timerBtnLabel.textContent = "Timer: Track";
    showToast("Sleep timer set for end of current track.");
    closeModals();
    return;
  }

  if (minutes <= 0) {
    if (timerBtnLabel) timerBtnLabel.textContent = "Timer";
    showToast("Sleep timer turned off.");
    closeModals();
    return;
  }

  const durationMs = minutes * 60 * 1000;
  state.sleepTimerEndsAt = Date.now() + durationMs;
  if (timerBtnLabel) timerBtnLabel.textContent = "Timer: " + minutes + "m";
  showToast("Sleep timer set for " + minutes + " minutes.");

  state.sleepTimer = setTimeout(() => {
    fadeOutAndPause();
  }, durationMs);

  closeModals();
}

function cancelSleepTimer() {
  if (state.sleepTimer) clearTimeout(state.sleepTimer);
  state.sleepTimer = null;
  state.sleepTimerEndsAt = null;
  state.sleepTimerEndOfTrack = false;
  const timerBtnLabel = document.getElementById("top-timer-label");
  if (timerBtnLabel) timerBtnLabel.textContent = "Timer";
}

function fadeOutAndPause() {
  let vol = audio.volume;
  const fadeInterval = setInterval(() => {
    vol = Math.max(0, vol - 0.05);
    audio.volume = vol;
    if (vol <= 0) {
      clearInterval(fadeInterval);
      audio.pause();
      state.isPlaying = false;
      audio.volume = state.volume;
      updatePlayStateUI();
      cancelSleepTimer();
      showToast("Sleep timer: Playback paused.");
    }
  }, 100);
}

// ── Native MediaSession API (Lockscreen) ─────────────────────────────────────
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;

  const color = track.color || getTrackColor(track.title);

  let artDataUri = "";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0c0b";
    ctx.fillRect(0, 0, 512, 512);

    const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "#11140f");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(256, 256, 230, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0b0c0b";
    ctx.beginPath();
    ctx.arc(256, 256, 70, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitials(track.title), 256, 256);

    artDataUri = canvas.toDataURL("image/png");
  } catch (e) {}

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist || "LongDrive",
    album: track.album || "Collection",
    artwork: artDataUri ? [{ src: artDataUri, sizes: "512x512", type: "image/png" }] : []
  });

  navigator.mediaSession.setActionHandler("play", () => {
    initAudioContext();
    audio.play();
    state.isPlaying = true;
    updatePlayStateUI();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    audio.pause();
    state.isPlaying = false;
    updatePlayStateUI();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
  navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime && isFinite(details.seekTime)) {
      audio.currentTime = details.seekTime;
    }
  });
}

// ── Modals Handling ──────────────────────────────────────────────────────────
function openModal(modal) {
  if (modal) modal.classList.add("open");
}

function closeModals() {
  document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
}

// ── Local File Import (Scan Music Folder) ────────────────────────────────────
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("audio/") || f.name.endsWith(".mp3") || f.name.endsWith(".wav") || f.name.endsWith(".ogg") || f.name.endsWith(".m4a"));
  if (files.length === 0) return;

  const newTracks = files.map((file, i) => {
    const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    return {
      id: "local-" + Date.now() + "-" + i,
      title: title,
      artist: "Local Audio File",
      album: "Local Imports",
      folder: "Local Imports",
      folderLabel: "Local Imports",
      duration: "—",
      color: COLOR_PALETTE[(state.tracks.length + i) % COLOR_PALETTE.length],
      genre: "Local",
      path: URL.createObjectURL(file)
    };
  });

  state.tracks = [...newTracks, ...state.tracks];
  renderFilterPills();
  renderSidebarPlaylists();
  renderSongList();
  showToast(newTracks.length + " song" + (newTracks.length > 1 ? "s" : "") + " added to your library!");

  playTrack(newTracks[0].id);
});

// ── Playlist Data Fetching ───────────────────────────────────────────────────
async function loadPlaylistData() {
  try {
    const res = await fetch("playlist.json?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    const fetchedTracks = [];
    if (data && data.playlists && Array.isArray(data.playlists)) {
      data.playlists.forEach(pl => {
        if (pl.tracks && Array.isArray(pl.tracks)) {
          const folderLabel = pl.label || formatFolderLabel(pl.folder);
          pl.tracks.forEach(tr => {
            fetchedTracks.push({
              id: "pl-" + tr.folder + "-" + tr.id,
              title: tr.title,
              artist: tr.artist || (tr.folder && tr.folder.toLowerCase() === "devotional" ? "Devotional Music" : folderLabel),
              album: tr.album || folderLabel,
              folder: tr.folder,
              folderLabel: folderLabel,
              filename: tr.filename,
              duration: tr.duration || "—",
              color: getTrackColor(tr.title),
              genre: tr.folder && tr.folder.toLowerCase() === "devotional" ? "Spiritual" : "Lossless Audio",
              path: tr.path
            });
          });
        }
      });
    }

    if (fetchedTracks.length > 0) {
      state.tracks = fetchedTracks;
    } else {
      state.tracks = SAMPLE_TRACKS;
    }
  } catch (err) {
    console.warn("Could not load playlist.json (using default sample tracks):", err);
    state.tracks = SAMPLE_TRACKS;
  }

  try {
    const savedLiked = localStorage.getItem("pmp_liked");
    if (savedLiked) state.likedSongIds = new Set(JSON.parse(savedLiked));

    const savedRecents = localStorage.getItem("pmp_recents");
    if (savedRecents) state.recentSongIds = JSON.parse(savedRecents);

    const savedVol = localStorage.getItem("pmp_volume");
    if (savedVol) {
      state.volume = parseFloat(savedVol);
      audio.volume = state.volume;
      if (volumeSlider) volumeSlider.value = state.volume * 100;
      if (bpVolumeSlider) bpVolumeSlider.value = state.volume * 100;
    }

    const savedEq = localStorage.getItem("pmp_eq");
    if (savedEq) {
      applyEqPreset(savedEq);
    }
  } catch (e) {}

  renderFilterPills();
  renderSidebarPlaylists();
  renderSongList();

  const savedTrackId = localStorage.getItem("pmp_last_track");
  const trackToLoad = state.tracks.find(t => String(t.id) === savedTrackId) || state.tracks[0];
  if (trackToLoad) {
    playTrack(trackToLoad.id, false);
  }
}

// ── Event Listeners Binding ──────────────────────────────────────────────────
function setupEvents() {
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      const filter = btn.getAttribute("data-filter");
      if (filter) {
        state.activeFilter = filter;
        document.querySelectorAll(".filter-pill").forEach(p => {
          p.classList.toggle("filter-active", p.getAttribute("data-filter") === filter);
        });
      }
      setView(view);
      if (view === "library") renderSongList();
    });
  });

  filterRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".filter-pill");
    if (!pill) return;
    document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("filter-active"));
    pill.classList.add("filter-active");
    state.activeFilter = pill.getAttribute("data-filter");
    
    document.querySelectorAll("[data-filter]").forEach(btn => {
      btn.classList.toggle("nav-active", btn.getAttribute("data-filter") === state.activeFilter);
    });

    renderSongList();
  });

  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    setView("library");
    renderSongList();
  });

  // Play / Pause Buttons
  if (btnMainPlay) btnMainPlay.addEventListener("click", togglePlayPause);
  if (btnBpPlay) btnBpPlay.addEventListener("click", togglePlayPause);

  // Next / Prev Buttons
  if (btnNext) btnNext.addEventListener("click", playNextTrack);
  if (btnBpNext) btnBpNext.addEventListener("click", playNextTrack);
  if (btnPrev) btnPrev.addEventListener("click", playPrevTrack);
  if (btnBpPrev) btnBpPrev.addEventListener("click", playPrevTrack);

  // Shuffle & Repeat
  if (btnShuffle) btnShuffle.addEventListener("click", toggleShuffle);
  if (btnBpShuffle) btnBpShuffle.addEventListener("click", toggleShuffle);
  if (btnRepeat) btnRepeat.addEventListener("click", toggleRepeat);
  if (btnBpRepeat) btnBpRepeat.addEventListener("click", toggleRepeat);

  // Like Buttons
  if (btnNpLike) {
    btnNpLike.addEventListener("click", () => {
      if (state.currentTrackId) toggleLike(state.currentTrackId);
    });
  }
  if (btnBpLike) {
    btnBpLike.addEventListener("click", () => {
      if (state.currentTrackId) toggleLike(state.currentTrackId);
    });
  }

  // Footer Seek & Volume Sliders
  if (bpSeekSlider) {
    bpSeekSlider.addEventListener("input", (e) => {
      const dur = audio.duration || 0;
      if (dur > 0) {
        const target = (Number(e.target.value) / 100) * dur;
        audio.currentTime = target;
      }
    });
  }

  if (bpVolumeSlider) {
    bpVolumeSlider.addEventListener("input", (e) => {
      state.volume = Number(e.target.value) / 100;
      audio.volume = state.volume;
      state.isMuted = state.volume === 0;
      if (volumeSlider) volumeSlider.value = state.volume * 100;
      updateVolumeIcon();
      try { localStorage.setItem("pmp_volume", String(state.volume)); } catch (err) {}
    });
  }

  if (btnBpMute) {
    btnBpMute.addEventListener("click", () => {
      btnMute.click();
    });
  }

  if (btnBpEq) btnBpEq.addEventListener("click", () => openModal(modalEq));
  if (btnBpTimer) btnBpTimer.addEventListener("click", () => openModal(modalTimer));

  // Expand to Now Playing view
  const openNowPlaying = () => setView("nowplaying");
  if (btnBpExpand) btnBpExpand.addEventListener("click", openNowPlaying);
  if (bpArt) bpArt.addEventListener("click", openNowPlaying);
  if (bpInfoClick) bpInfoClick.addEventListener("click", openNowPlaying);

  document.getElementById("btn-np-back").addEventListener("click", () => {
    setView("library");
  });

  document.getElementById("btn-np-share").addEventListener("click", () => {
    const current = state.tracks.find(t => t.id === state.currentTrackId);
    const text = current ? "Listening to \"" + current.title + "\" on LongDrive Music Player" : "LongDrive Music Player";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast("Link copied to clipboard!");
      });
    } else {
      showToast(text);
    }
  });

  const triggerScan = () => fileInput.click();
  document.getElementById("btn-scan-folder").addEventListener("click", triggerScan);
  document.getElementById("btn-empty-add").addEventListener("click", triggerScan);
  document.getElementById("btn-settings-scan").addEventListener("click", triggerScan);

  const btnPreloadAlbum = document.getElementById("btn-preload-album");
  if (btnPreloadAlbum) {
    btnPreloadAlbum.addEventListener("click", cacheCurrentPlaylist);
  }

  const btnClearCache = document.getElementById("btn-clear-cache");
  if (btnClearCache) {
    btnClearCache.addEventListener("click", clearAudioCache);
  }

  document.getElementById("btn-shuffle-all").addEventListener("click", () => {
    state.isShuffle = true;
    if (btnShuffle) btnShuffle.classList.add("control-active");
    if (btnBpShuffle) btnBpShuffle.classList.add("control-active");
    playNextTrack();
    showToast("Shuffling all library tracks!");
  });

  document.getElementById("sidebar-eq-btn").addEventListener("click", () => openModal(modalEq));
  document.getElementById("top-eq-btn").addEventListener("click", () => openModal(modalEq));
  document.getElementById("btn-close-eq").addEventListener("click", closeModals);
  document.getElementById("modal-eq").addEventListener("click", (e) => {
    if (e.target === modalEq) closeModals();
  });
  document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyEqPreset(btn.getAttribute("data-preset"));
      showToast("Audio Preset: " + btn.textContent);
      closeModals();
    });
  });

  const presetSelect = document.getElementById("preset-select");
  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      applyEqPreset(e.target.value);
      showToast("Audio Preset: " + e.target.value);
    });
  }
  const settingsEqSelect = document.getElementById("settings-eq-select");
  if (settingsEqSelect) {
    settingsEqSelect.addEventListener("change", (e) => {
      applyEqPreset(e.target.value);
      showToast("Audio Preset: " + e.target.value);
    });
  }

  document.getElementById("top-timer-btn").addEventListener("click", () => openModal(modalTimer));
  document.getElementById("btn-settings-timer").addEventListener("click", () => openModal(modalTimer));
  document.getElementById("btn-close-timer").addEventListener("click", closeModals);
  document.getElementById("modal-timer").addEventListener("click", (e) => {
    if (e.target === modalTimer) closeModals();
  });
  document.querySelectorAll(".preset-btn[data-timer]").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-timer");
      document.querySelectorAll(".preset-btn[data-timer]").forEach(b => b.classList.toggle("active", b === btn));
      if (val === "track") {
        setSleepTimer(0, true);
      } else {
        setSleepTimer(parseInt(val, 10), false);
      }
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "n" || e.key === "N") {
      playNextTrack();
    } else if (e.key === "p" || e.key === "P") {
      playPrevTrack();
    } else if (e.key === "s" || e.key === "S") {
      toggleShuffle();
    } else if (e.key === "r" || e.key === "R") {
      toggleRepeat();
    } else if (e.key === "l" || e.key === "L") {
      if (state.currentTrackId) toggleLike(state.currentTrackId);
    } else if (e.key === "m" || e.key === "M") {
      btnMute.click();
    } else if (e.key === "ArrowRight") {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    } else if (e.key === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.key === "ArrowUp") {
      state.volume = Math.min(1, state.volume + 0.05);
      audio.volume = state.volume;
      volumeSlider.value = state.volume * 100;
      if (bpVolumeSlider) bpVolumeSlider.value = state.volume * 100;
      updateVolumeIcon();
    } else if (e.key === "ArrowDown") {
      state.volume = Math.max(0, state.volume - 0.05);
      audio.volume = state.volume;
      volumeSlider.value = state.volume * 100;
      if (bpVolumeSlider) bpVolumeSlider.value = state.volume * 100;
      updateVolumeIcon();
    }
  });
}

// ── Initialize App ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  initAudioCache();
  loadPlaylistData();
});
