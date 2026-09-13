/**
 * generate-playlist.js
 * Scans /music subfolders for audio files and outputs /playlist.json
 * Run: node scripts/generate-playlist.js
 */

const fs   = require("fs");
const path = require("path");

const MUSIC_DIR   = path.resolve(__dirname, "..", "music");
const OUTPUT_FILE = path.resolve(__dirname, "..", "playlist.json");
const AUDIO_EXT   = new Set([".mp3", ".ogg", ".wav", ".flac", ".aac", ".m4a", ".webm", ".opus"]);

const FOLDER_LABELS = {
  "my-music":   "My Music",
  "devotional": "Devotional",
};

function filenameToTitle(filename) {
  const noExt = path.parse(filename).name;

  // If filename is e.g. "01_Track" or "01 Track" or "01-Track"
  const trackMatch = noExt.match(/^(\d+)[\s._-]+track$/i);
  if (trackMatch) {
    return `Track ${trackMatch[1]}`;
  }

  // If filename is e.g. "Track_01" or "Track 01"
  const revMatch = noExt.match(/^track[\s._-]+(\d+)$/i);
  if (revMatch) {
    return `Track ${revMatch[1]}`;
  }

  const clean = noExt
    .replace(/^\d+[\s.\-_]+/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return clean || noExt;
}

function collectAudioFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAudioFiles(fullPath));
    } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function folderToLabel(folderName) {
  const lower = folderName.toLowerCase();
  if (FOLDER_LABELS[lower]) return FOLDER_LABELS[lower];
  return folderName
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function main() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error("[generate-playlist] Music directory not found: " + MUSIC_DIR);
    process.exit(1);
  }

  const folderEntries = fs
    .readdirSync(MUSIC_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const playlists = [];
  let globalIndex = 0;

  for (const folderName of folderEntries) {
    const folderPath = path.join(MUSIC_DIR, folderName);
    const files      = collectAudioFiles(folderPath);

    const tracks = files.map((absPath) => {
      const filename = path.basename(absPath);
      const relativePath = path
        .relative(path.resolve(__dirname, ".."), absPath)
        .replace(/\\/g, "/");
      return {
        id:       globalIndex++,
        folder:   folderName,
        filename,
        title:    filenameToTitle(filename),
        path:     relativePath,
      };
    });

    if (tracks.length === 0) continue;

    playlists.push({
      folder: folderName,
      label:  folderToLabel(folderName),
      tracks,
    });
  }

  const output = {
    generated: new Date().toISOString(),
    playlists,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  const total = playlists.reduce((s, p) => s + p.tracks.length, 0);
  console.log("[generate-playlist] Done. " + playlists.length + " playlist(s), " + total + " track(s).");
}

main();
