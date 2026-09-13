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
  eqPreset: "Flat",
  sleepTimer: null,
  sleepTimerEndsAt: null,
  sleepTimerEndOfTrack: false
};

// ── Audio Context & Hardware Filters (Web Audio API) ─────────────────────────
let audioCtx = null;
let audioSourceNode = null;
let lowShelfFilter = null;
let midFilter = null;
let highShelfFilter = null;

function initAudioContext() {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    audioSourceNode = audioCtx.createMediaElementSource(audio);

    // Bass Filter (Low shelf)
    lowShelfFilter = audioCtx.createBiquadFilter();
    lowShelfFilter.type = "lowshelf";
    lowShelfFilter.frequency.value = 120;
    lowShelfFilter.gain.value = 0;

    // Mid Filter (Peaking)
    midFilter = audioCtx.createBiquadFilter();
    midFilter.type = "peaking";
    midFilter.frequency.value = 1500;
    midFilter.Q.value = 1.0;
    midFilter.gain.value = 0;

    // Treble Filter (High shelf)
    highShelfFilter = audioCtx.createBiquadFilter();
    highShelfFilter.type = "highshelf";
    highShelfFilter.frequency.value = 7500;
    highShelfFilter.gain.value = 0;

    // Chain: Source -> Low -> Mid -> High -> Destination
    audioSourceNode.connect(lowShelfFilter);
    lowShelfFilter.connect(midFilter);
    midFilter.connect(highShelfFilter);
    highShelfFilter.connect(audioCtx.destination);

    applyEqPreset(state.eqPreset);
  } catch (err) {
    console.warn("Web Audio API not supported or already attached:", err);
  }
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

  if (!lowShelfFilter) return;

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  switch (preset) {
    case "BassBoost":
      lowShelfFilter.gain.setValueAtTime(7.5, now);
      midFilter.gain.setValueAtTime(-1, now);
      highShelfFilter.gain.setValueAtTime(1, now);
      break;
    case "Vocal":
      lowShelfFilter.gain.setValueAtTime(-2, now);
      midFilter.gain.setValueAtTime(5, now);
      highShelfFilter.gain.setValueAtTime(2, now);
      break;
    case "Acoustic":
      lowShelfFilter.gain.setValueAtTime(3, now);
      midFilter.gain.setValueAtTime(2, now);
      highShelfFilter.gain.setValueAtTime(4.5, now);
      break;
    case "Treble":
      lowShelfFilter.gain.setValueAtTime(-1, now);
      midFilter.gain.setValueAtTime(1, now);
      highShelfFilter.gain.setValueAtTime(7, now);
      break;
    case "Flat":
    default:
      lowShelfFilter.gain.setValueAtTime(0, now);
      midFilter.gain.setValueAtTime(0, now);
      highShelfFilter.gain.setValueAtTime(0, now);
      break;
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

// Mini Player
const miniPlayer = document.getElementById("mini-player");
const miniArt = document.getElementById("mini-art");
const miniMonogram = document.getElementById("mini-monogram");
const miniTitle = document.getElementById("mini-title");
const miniArtist = document.getElementById("mini-artist");
const miniProgressBar = document.getElementById("mini-progress-bar");
const miniPlayBtn = document.getElementById("mini-play-btn");
const miniPlayIcon = document.getElementById("mini-play-icon");
const miniNextBtn = document.getElementById("mini-next-btn");

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

// ── Track Filtering & Rendering ──────────────────────────────────────────────
function getFilteredTracks() {
  let list = state.tracks;

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(t => 
      t.title.toLowerCase().includes(q) ||
      (t.artist && t.artist.toLowerCase().includes(q)) ||
      (t.folder && t.folder.toLowerCase().includes(q)) ||
      (t.filename && t.filename.toLowerCase().includes(q))
    );
  }

  if (state.activeFilter === "Liked Songs") {
    list = list.filter(t => state.likedSongIds.has(t.id));
  } else if (state.activeFilter === "Devotional") {
    list = list.filter(t => t.folder && t.folder.toLowerCase() === "devotional");
  } else if (state.activeFilter === "My Music") {
    list = list.filter(t => t.folder && t.folder.toLowerCase() === "my-music");
  } else if (state.activeFilter === "Recently Played") {
    list = state.recentSongIds.map(id => state.tracks.find(t => t.id === id)).filter(Boolean);
  }

  return list;
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
    kicker.textContent = "COLLECTION / 2024";
    heading.textContent = state.activeFilter;
    subtitle.textContent = state.activeFilter === "Liked Songs" 
      ? "Your heart-picked favorites in one place."
      : state.activeFilter === "Devotional"
      ? "Sacred sounds and contemplative tracks."
      : "A quiet place for all your favorite sounds.";
  }

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((track, idx) => {
    const isCurrent = track.id === state.currentTrackId;
    const isLiked = state.likedSongIds.has(track.id);

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
        <span>${track.artist || (track.folder === 'devotional' ? 'Devotional Track' : 'Selected Track')}</span>
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
    audio.src = track.path;
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

  if (miniTitle) miniTitle.textContent = track.title;
  if (miniArtist) miniArtist.textContent = track.artist || "LongDrive Library";
  if (miniArt) miniArt.style.setProperty("--art", color);
  if (miniMonogram) miniMonogram.textContent = initials;

  updateLikeButtons();

  try { localStorage.setItem("pmp_last_track", String(id)); } catch (e) {}

  if (shouldAutoplay && track.path) {
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayStateUI();
    }).catch(err => {
      console.warn("Autoplay blocked or stream error:", err);
      state.isPlaying = false;
      updatePlayStateUI();
    });
  } else {
    state.isPlaying = false;
    updatePlayStateUI();
  }

  updateMediaSession(track);
  renderSongList();
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
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayStateUI();
    }).catch(e => console.warn(e));
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
  btnShuffle.classList.toggle("control-active", state.isShuffle);
  showToast(state.isShuffle ? "Shuffle Mode On" : "Shuffle Mode Off");
}

function toggleRepeat() {
  state.repeatMode = (state.repeatMode + 1) % 3;
  if (state.repeatMode === 0) {
    btnRepeat.classList.remove("control-active");
    repeatBadge.style.display = "none";
    showToast("Repeat Off");
  } else if (state.repeatMode === 1) {
    btnRepeat.classList.add("control-active");
    repeatBadge.style.display = "none";
    showToast("Repeat All Tracks");
  } else if (state.repeatMode === 2) {
    btnRepeat.classList.add("control-active");
    repeatBadge.style.display = "grid";
    showToast("Repeat Current Track");
  }
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
  btnNpLike.classList.toggle("liked", isLiked);

  document.querySelectorAll(".song-row").forEach(row => {
    const id = row.getAttribute("data-id");
    const heart = row.querySelector(".heart-button");
    if (heart) {
      heart.classList.toggle("liked", state.likedSongIds.has(id));
    }
  });
}

function updatePlayStateUI() {
  if (state.isPlaying) {
    mainPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
    miniPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
    npArtwork.classList.add("is-spinning");
  } else {
    mainPlayIcon.innerHTML = '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/>';
    miniPlayIcon.innerHTML = '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/>';
    npArtwork.classList.remove("is-spinning");
  }

  document.querySelectorAll(".song-row").forEach(row => {
    const id = row.getAttribute("data-id");
    const isCurrent = id === state.currentTrackId;
    row.classList.toggle("is-active", isCurrent);
    row.classList.toggle("is-playing", isCurrent && state.isPlaying);

    const playBtnSvg = row.querySelector(".row-play svg");
    if (playBtnSvg) {
      playBtnSvg.innerHTML = (isCurrent && state.isPlaying)
        ? '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'
        : '<polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/>';
    }
  });
}

// ── Audio Events (Seek, Time, Ended) ─────────────────────────────────────────
audio.addEventListener("timeupdate", () => {
  const cur = audio.currentTime || 0;
  const dur = audio.duration || 0;

  if (dur > 0) {
    const pct = (cur / dur) * 100;
    seekSlider.value = pct;
    miniProgressBar.style.width = pct + "%";
    timeElapsed.textContent = formatTime(cur);
    timeRemaining.textContent = "-" + formatTime(Math.max(0, dur - cur));
  } else {
    seekSlider.value = 0;
    miniProgressBar.style.width = "0%";
    timeElapsed.textContent = "0:00";
    timeRemaining.textContent = "-0:00";
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
  updateVolumeIcon();
  try { localStorage.setItem("pmp_volume", String(state.volume)); } catch (e) {}
});

btnMute.addEventListener("click", () => {
  state.isMuted = !state.isMuted;
  if (state.isMuted) {
    audio.volume = 0;
    volumeSlider.value = 0;
  } else {
    audio.volume = state.volume || 0.8;
    volumeSlider.value = (state.volume || 0.8) * 100;
  }
  updateVolumeIcon();
});

function updateVolumeIcon() {
  if (state.isMuted || audio.volume === 0) {
    volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (audio.volume < 0.5) {
    volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  } else {
    volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  }
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
      folder: "my-music",
      duration: "—",
      color: COLOR_PALETTE[(state.tracks.length + i) % COLOR_PALETTE.length],
      genre: "Local",
      path: URL.createObjectURL(file)
    };
  });

  state.tracks = [...newTracks, ...state.tracks];
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
          pl.tracks.forEach(tr => {
            fetchedTracks.push({
              id: "pl-" + tr.folder + "-" + tr.id,
              title: tr.title,
              artist: tr.artist || (tr.folder === "devotional" ? "Devotional Music" : "Personal Collection"),
              album: tr.album || (tr.folder ? tr.folder.replace("-", " ") : "LongDrive"),
              folder: tr.folder,
              filename: tr.filename,
              duration: tr.duration || "—",
              color: getTrackColor(tr.title),
              genre: tr.folder === "devotional" ? "Spiritual" : "Lossless Audio",
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
      volumeSlider.value = state.volume * 100;
    }

    const savedEq = localStorage.getItem("pmp_eq");
    if (savedEq) {
      applyEqPreset(savedEq);
    }
  } catch (e) {}

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
    renderSongList();
  });

  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    setView("library");
    renderSongList();
  });

  btnMainPlay.addEventListener("click", togglePlayPause);
  miniPlayBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlayPause();
  });
  btnNext.addEventListener("click", playNextTrack);
  miniNextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    playNextTrack();
  });
  btnPrev.addEventListener("click", playPrevTrack);
  btnShuffle.addEventListener("click", toggleShuffle);
  btnRepeat.addEventListener("click", toggleRepeat);
  btnNpLike.addEventListener("click", () => {
    if (state.currentTrackId) toggleLike(state.currentTrackId);
  });

  miniPlayer.addEventListener("click", () => {
    setView("nowplaying");
  });

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

  document.getElementById("btn-shuffle-all").addEventListener("click", () => {
    state.isShuffle = true;
    btnShuffle.classList.add("control-active");
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
      updateVolumeIcon();
    } else if (e.key === "ArrowDown") {
      state.volume = Math.max(0, state.volume - 0.05);
      audio.volume = state.volume;
      volumeSlider.value = state.volume * 100;
      updateVolumeIcon();
    }
  });
}

// ── Initialize App ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  loadPlaylistData();
});
