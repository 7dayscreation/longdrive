/**
 * player.js — LongDrive Music Player
 * Pure vanilla JS, no dependencies.
 * Works entirely off playlist.json loaded via fetch().
 */

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  playlists:       [],  // raw from playlist.json
  activePlaylist:  0,   // index into playlists[]
  filteredTracks:  [],  // shown in current view
  currentTrackId:  null,
  isPlaying:       false,
  isShuffle:       false,
  repeatMode:      0,   // 0=off 1=all 2=one
  volume:          0.8,
  searchQuery:     "",
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const audio          = document.getElementById("audio");
const seekBar        = document.getElementById("seek-bar");
const volumeBar      = document.getElementById("volume-bar");
const timeElapsed    = document.getElementById("time-elapsed");
const timeRemaining  = document.getElementById("time-remaining");
const btnPlayPause   = document.getElementById("btn-play-pause");
const btnPrev        = document.getElementById("btn-prev");
const btnNext        = document.getElementById("btn-next");
const btnShuffle     = document.getElementById("btn-shuffle");
const btnRepeat      = document.getElementById("btn-repeat");
const btnVolume      = document.getElementById("btn-volume");
const npTitle        = document.getElementById("np-title");
const npPlaylist     = document.getElementById("np-playlist");
const npSubtitle     = document.getElementById("np-subtitle");
const trackArt       = document.getElementById("track-art");
const equalizer      = document.getElementById("equalizer");
const sidebarNav     = document.getElementById("sidebar-nav");
const sidebarList    = document.getElementById("sidebar-tracklist");
const mainTracklist  = document.getElementById("main-tracklist");
const tracklistTitle = document.getElementById("tracklist-title");
const trackCount     = document.getElementById("track-count");
const searchInput    = document.getElementById("search-input");

// ── Gradient palette (one per track, derived from title hash) ─────────────────
const GRADIENTS = [
  ["#7c3aed","#06b6d4"],["#db2777","#7c3aed"],["#059669","#06b6d4"],
  ["#d97706","#db2777"],["#dc2626","#7c3aed"],["#2563eb","#059669"],
  ["#7c3aed","#db2777"],["#06b6d4","#059669"],["#f59e0b","#ef4444"],
  ["#8b5cf6","#3b82f6"],["#ec4899","#f59e0b"],["#10b981","#6366f1"],
];

function trackGradient(title = "") {
  let hash = 0;
  for (const c of title) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function allTracks() {
  return state.playlists.flatMap((p) => p.tracks);
}

function trackById(id) {
  return allTracks().find((t) => t.id === id) || null;
}

function currentPlaylistTracks() {
  const pl = state.playlists[state.activePlaylist];
  return pl ? pl.tracks : [];
}

// ── LocalStorage persistence ──────────────────────────────────────────────────
function saveState() {
  localStorage.setItem("ld_trackId",  JSON.stringify(state.currentTrackId));
  localStorage.setItem("ld_volume",   String(state.volume));
  localStorage.setItem("ld_playlist", String(state.activePlaylist));
  localStorage.setItem("ld_shuffle",  String(state.isShuffle));
  localStorage.setItem("ld_repeat",   String(state.repeatMode));
}

function loadSavedState() {
  const v = parseFloat(localStorage.getItem("ld_volume"));
  if (!isNaN(v)) state.volume = Math.min(1, Math.max(0, v));
  const pl = parseInt(localStorage.getItem("ld_playlist"), 10);
  if (!isNaN(pl)) state.activePlaylist = pl;
  state.isShuffle = localStorage.getItem("ld_shuffle") === "true";
  const rm = parseInt(localStorage.getItem("ld_repeat"), 10);
  if (!isNaN(rm)) state.repeatMode = rm;

  const savedId = JSON.parse(localStorage.getItem("ld_trackId") || "null");
  if (savedId !== null && trackById(savedId)) {
    state.currentTrackId = savedId;
    loadTrack(savedId, false); // load but don't autoplay
  }
}

// ── Track loading ─────────────────────────────────────────────────────────────
function loadTrack(id, autoplay = true) {
  const track = trackById(id);
  if (!track) return;

  state.currentTrackId = id;
  state.isPlaying = false;

  audio.src = track.path;
  audio.volume = state.volume;
  audio.load();

  // Update now-playing UI
  npTitle.textContent    = track.title;
  npTitle.classList.remove("empty");
  const pl = state.playlists.find((p) => p.folder === track.folder);
  npPlaylist.textContent  = pl ? pl.label : track.folder;
  npSubtitle.textContent  = track.filename;

  const grad = trackGradient(track.title);
  trackArt.style.background = grad;
  // propagate ambient glow colour
  document.getElementById("now-playing").style.setProperty(
    "--np-color1", grad
  );
  trackArt.classList.add("playing-pulse");

  updateSeekBar();
  updatePlayPauseIcon();
  renderTracklists();
  saveState();

  if (autoplay) play();
}

function play() {
  audio.play().catch(() => {});
  state.isPlaying = true;
  updatePlayPauseIcon();
  equalizer.classList.remove("paused");
  trackArt.classList.add("playing-pulse");
}

function pause() {
  audio.pause();
  state.isPlaying = false;
  updatePlayPauseIcon();
  equalizer.classList.add("paused");
  trackArt.classList.remove("playing-pulse");
}

function togglePlayPause() {
  if (state.currentTrackId === null) {
    // play first visible track
    const tracks = state.filteredTracks.length ? state.filteredTracks : currentPlaylistTracks();
    if (tracks.length) loadTrack(tracks[0].id);
    return;
  }
  state.isPlaying ? pause() : play();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function getQueue() {
  // Queue is the currently filtered + active-playlist tracks
  const tracks = state.filteredTracks.length
    ? state.filteredTracks
    : currentPlaylistTracks();
  return tracks;
}

function nextTrack() {
  const queue = getQueue();
  if (!queue.length) return;

  if (state.repeatMode === 2) { // repeat one
    audio.currentTime = 0;
    play();
    return;
  }

  const idx = queue.findIndex((t) => t.id === state.currentTrackId);

  if (state.isShuffle) {
    const newIdx = Math.floor(Math.random() * queue.length);
    loadTrack(queue[newIdx].id);
    return;
  }

  const next = idx + 1;
  if (next < queue.length) {
    loadTrack(queue[next].id);
  } else if (state.repeatMode === 1) {
    loadTrack(queue[0].id);
  } else {
    pause();
    audio.currentTime = 0;
  }
}

function prevTrack() {
  // If >3s in, restart; else go prev
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const queue = getQueue();
  if (!queue.length) return;
  const idx = queue.findIndex((t) => t.id === state.currentTrackId);
  const prev = idx - 1;
  if (prev >= 0) loadTrack(queue[prev].id);
  else if (state.repeatMode === 1) loadTrack(queue[queue.length - 1].id);
  else { audio.currentTime = 0; }
}

// ── Seek & Volume ─────────────────────────────────────────────────────────────
function updateSeekBar() {
  const dur = audio.duration || 0;
  const cur = audio.currentTime || 0;
  const pct = dur ? (cur / dur) * 100 : 0;
  seekBar.value = pct;
  seekBar.style.background = buildRangeGradient(pct);
  timeElapsed.textContent   = formatTime(cur);
  timeRemaining.textContent = `-${formatTime(dur - cur)}`;
}

function buildRangeGradient(pct, color = "var(--accent-light)") {
  return `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, var(--bg-overlay-md) ${pct}%, var(--bg-overlay-md) 100%)`;
}

seekBar.addEventListener("input", () => {
  const dur = audio.duration || 0;
  audio.currentTime = (seekBar.value / 100) * dur;
  updateSeekBar();
});

volumeBar.addEventListener("input", () => {
  state.volume = parseFloat(volumeBar.value) / 100;
  audio.volume = state.volume;
  volumeBar.style.background = buildRangeGradient(state.volume * 100, "var(--accent2)");
  updateVolumeIcon();
  saveState();
});

function setVolume(v) {
  state.volume = Math.min(1, Math.max(0, v));
  audio.volume  = state.volume;
  volumeBar.value = state.volume * 100;
  volumeBar.style.background = buildRangeGradient(state.volume * 100, "var(--accent2)");
  updateVolumeIcon();
}

function updateVolumeIcon() {
  const v = state.volume;
  let icon;
  if (v === 0)      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  else if (v < 0.5) icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  else               icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  btnVolume.innerHTML = icon;
}

btnVolume.addEventListener("click", () => {
  if (state.volume > 0) {
    btnVolume._savedVol = state.volume;
    setVolume(0);
  } else {
    setVolume(btnVolume._savedVol || 0.8);
  }
  saveState();
});

// ── Shuffle / Repeat ──────────────────────────────────────────────────────────
btnShuffle.addEventListener("click", () => {
  state.isShuffle = !state.isShuffle;
  btnShuffle.classList.toggle("active", state.isShuffle);
  saveState();
});

const REPEAT_ICONS = {
  0: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  1: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  2: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="10" y="14" font-size="7" fill="currentColor" stroke="none" font-weight="bold">1</text></svg>`,
};

btnRepeat.addEventListener("click", () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  btnRepeat.innerHTML = REPEAT_ICONS[state.repeatMode];
  btnRepeat.classList.toggle("active", state.repeatMode > 0);
  btnRepeat.title = ["Repeat Off","Repeat All","Repeat One"][state.repeatMode];
  saveState();
});

// ── Audio events ──────────────────────────────────────────────────────────────
audio.addEventListener("timeupdate",  updateSeekBar);
audio.addEventListener("ended",       nextTrack);
audio.addEventListener("loadedmetadata", updateSeekBar);

audio.addEventListener("play",  () => {
  state.isPlaying = true;
  updatePlayPauseIcon();
  equalizer.classList.remove("paused");
});
audio.addEventListener("pause", () => {
  state.isPlaying = false;
  updatePlayPauseIcon();
  equalizer.classList.add("paused");
});

// ── Controls ──────────────────────────────────────────────────────────────────
btnPlayPause.addEventListener("click", togglePlayPause);
btnPrev.addEventListener("click",      prevTrack);
btnNext.addEventListener("click",      nextTrack);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  if (tag === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlayPause(); }
  if (e.code === "ArrowRight") { audio.currentTime += 5; }
  if (e.code === "ArrowLeft")  { audio.currentTime -= 5; }
  if (e.code === "ArrowUp")    { setVolume(state.volume + 0.05); }
  if (e.code === "ArrowDown")  { setVolume(state.volume - 0.05); }
  if (e.code === "KeyN")       { nextTrack(); }
  if (e.code === "KeyP")       { prevTrack(); }
});

function updatePlayPauseIcon() {
  btnPlayPause.innerHTML = state.isPlaying
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

// ── Playlist switching ────────────────────────────────────────────────────────
function switchPlaylist(idx) {
  state.activePlaylist = idx;
  state.searchQuery    = "";
  searchInput.value    = "";
  applyFilter();
  renderSidebarNav();
  renderTracklists();
  saveState();
}

searchInput.addEventListener("input", () => {
  state.searchQuery = searchInput.value.toLowerCase().trim();
  applyFilter();
  renderTracklists();
});

function applyFilter() {
  const tracks = currentPlaylistTracks();
  if (!state.searchQuery) {
    state.filteredTracks = [];
    return;
  }
  state.filteredTracks = tracks.filter((t) =>
    t.title.toLowerCase().includes(state.searchQuery) ||
    t.filename.toLowerCase().includes(state.searchQuery)
  );
}

// ── Render: Sidebar nav ───────────────────────────────────────────────────────
function renderSidebarNav() {
  sidebarNav.innerHTML = "";
  state.playlists.forEach((pl, i) => {
    const btn = document.createElement("button");
    btn.className = "nav-btn" + (i === state.activePlaylist ? " active" : "");
    btn.innerHTML = `
      ${playlistIcon(pl.folder)}
      <span>${pl.label}</span>
      <span class="badge">${pl.tracks.length}</span>`;
    btn.addEventListener("click", () => switchPlaylist(i));
    sidebarNav.appendChild(btn);
  });
}

function playlistIcon(folder) {
  if (folder === "devotional")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

// ── Render: Sidebar track list ────────────────────────────────────────────────
function renderSidebarTracklist() {
  const tracks = state.filteredTracks.length
    ? state.filteredTracks
    : currentPlaylistTracks();

  sidebarList.innerHTML = "";
  if (!tracks.length) return;

  tracks.forEach((track, i) => {
    const item = document.createElement("div");
    item.className = "track-item" + (track.id === state.currentTrackId ? " playing" : "");
    item.style.animationDelay = `${i * 0.03}s`;
    item.innerHTML = `
      <div class="track-num">
        ${i + 1}
        <div class="track-mini-eq">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="track-info-small">
        <div class="track-name-small">${escapeHtml(track.title)}</div>
      </div>`;
    item.addEventListener("click", () => loadTrack(track.id));
    sidebarList.appendChild(item);
  });
}

// ── Render: Main tracklist ────────────────────────────────────────────────────
function renderMainTracklist() {
  const tracks = state.filteredTracks.length
    ? state.filteredTracks
    : currentPlaylistTracks();

  const pl = state.playlists[state.activePlaylist];
  tracklistTitle.textContent = state.searchQuery
    ? `Search results`
    : (pl ? pl.label : "");
  trackCount.textContent = `${tracks.length} track${tracks.length !== 1 ? "s" : ""}`;

  mainTracklist.innerHTML = "";

  if (!tracks.length) {
    mainTracklist.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <p>${state.searchQuery ? "No tracks match your search." : "No tracks yet.\nDrop MP3 files into the folder and push to auto-update."}</p>
      </div>`;
    return;
  }

  tracks.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "tracklist-row" + (track.id === state.currentTrackId ? " playing" : "");
    row.style.animationDelay = `${i * 0.025}s`;
    const pl = state.playlists.find((p) => p.folder === track.folder);
    row.innerHTML = `
      <div class="row-num">
        <span>${i + 1}</span>
        <div class="row-play-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div class="row-info">
        <div class="row-title">${escapeHtml(track.title)}</div>
      </div>
      <span class="row-folder">${pl ? pl.label : track.folder}</span>`;
    row.addEventListener("click", () => loadTrack(track.id));
    mainTracklist.appendChild(row);
  });
}

function renderTracklists() {
  renderSidebarTracklist();
  renderMainTracklist();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  // Init UI defaults
  setVolume(state.volume);
  updatePlayPauseIcon();
  btnRepeat.innerHTML = REPEAT_ICONS[0];

  // Fetch playlist
  let data;
  try {
    const res = await fetch("playlist.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    console.error("[player] Failed to load playlist.json", err);
    npTitle.textContent = "Could not load playlist";
    npTitle.classList.add("empty");
    mainTracklist.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Failed to load playlist.json.<br>Make sure the GitHub Action has run at least once.</p>
      </div>`;
    return;
  }

  state.playlists = data.playlists || [];

  // Restore persisted state
  loadSavedState();

  // Clamp activePlaylist
  if (state.activePlaylist >= state.playlists.length) state.activePlaylist = 0;

  // Apply persisted shuffle/repeat visuals
  btnShuffle.classList.toggle("active", state.isShuffle);
  btnRepeat.innerHTML = REPEAT_ICONS[state.repeatMode];
  btnRepeat.classList.toggle("active", state.repeatMode > 0);
  btnRepeat.title = ["Repeat Off","Repeat All","Repeat One"][state.repeatMode];

  applyFilter();
  renderSidebarNav();
  renderTracklists();

  // If no saved track, show placeholder
  if (state.currentTrackId === null) {
    npTitle.textContent = "Select a track to play";
    npTitle.classList.add("empty");
    npPlaylist.textContent  = "";
    npSubtitle.textContent  = "";
    trackArt.style.background = "linear-gradient(135deg, #1a1a2e 0%, #12121c 100%)";
  }
}

document.addEventListener("DOMContentLoaded", init);
