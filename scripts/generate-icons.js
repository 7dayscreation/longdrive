const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Ensure icons folder exists
const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// ── CRC32 Table & Computation for PNG ─────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcTarget = chunk.subarray(4, 8 + len);
  const crcVal = crc32(crcTarget);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

function encodeRGBAtoPNG(width, height, rgbaBuffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // Color type 6 (RGBA)
  ihdrData[10] = 0; // Compression method 0
  ihdrData[11] = 0; // Filter method 0
  ihdrData[12] = 0; // Interlace method 0
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let srcOffset = 0;
  let dstOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[dstOffset++] = 0; // filter byte: None
    rgbaBuffer.copy(scanlines, dstOffset, srcOffset, srcOffset + width * 4);
    dstOffset += width * 4;
    srcOffset += width * 4;
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// ── SVG Artwork for MV Logo ──────────────────────────────────────────────────
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#182014"/>
      <stop offset="60%" stop-color="#0c0e0b"/>
      <stop offset="100%" stop-color="#060705"/>
    </radialGradient>

    <!-- Accent Lime Glow -->
    <radialGradient id="limeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c6e94c" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#c6e94c" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#c6e94c" stop-opacity="0"/>
    </radialGradient>

    <!-- Metallic Lime Gradient for MV -->
    <linearGradient id="mvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ebff99"/>
      <stop offset="35%" stop-color="#c6e94c"/>
      <stop offset="85%" stop-color="#8fa733"/>
      <stop offset="100%" stop-color="#55661d"/>
    </linearGradient>

    <!-- Disc Gradient -->
    <linearGradient id="discGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#232a1f"/>
      <stop offset="100%" stop-color="#11150f"/>
    </linearGradient>

    <!-- Gold-Lime Ring Gradient -->
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#c6e94c" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#c6e94c" stop-opacity="0.8"/>
    </linearGradient>

    <!-- Drop Shadow Filter -->
    <filter id="neonDrop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#c6e94c" flood-opacity="0.45"/>
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <!-- Squircle Base for App Icon -->
  <rect width="512" height="512" rx="116" fill="url(#bgGrad)"/>
  <rect width="504" height="504" x="4" y="4" rx="112" fill="none" stroke="url(#ringGrad)" stroke-width="3" stroke-opacity="0.35"/>

  <!-- Halo Aura -->
  <circle cx="256" cy="256" r="210" fill="url(#limeGlow)"/>

  <!-- Vinyl Turntable Base -->
  <circle cx="256" cy="256" r="190" fill="url(#discGrad)" stroke="#2d3527" stroke-width="4"/>
  <circle cx="256" cy="256" r="165" fill="none" stroke="#252b20" stroke-width="2"/>
  <circle cx="256" cy="256" r="140" fill="none" stroke="#2a3224" stroke-width="1.5" stroke-dasharray="8 4"/>
  <circle cx="256" cy="256" r="115" fill="none" stroke="#23291e" stroke-width="2"/>

  <!-- Center Core Disc -->
  <circle cx="256" cy="256" r="95" fill="#0d100c" stroke="#3b4632" stroke-width="3"/>
  <circle cx="256" cy="256" r="95" fill="none" stroke="#c6e94c" stroke-width="2" stroke-opacity="0.5"/>

  <!-- Stylish Sound Wave Arc Accent -->
  <path d="M 120 256 A 136 136 0 0 1 392 256" fill="none" stroke="#c6e94c" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12" stroke-opacity="0.75"/>
  <path d="M 145 256 A 111 111 0 0 0 367 256" fill="none" stroke="#c6e94c" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="10 10" stroke-opacity="0.4"/>

  <!-- 'MV' Interlocking Monogram Geometry with Shadow -->
  <g filter="url(#neonDrop)">
    <!-- Letter M -->
    <path d="M 148 335 L 148 180 L 182 180 L 222 268 L 262 180 L 296 180 L 296 335 L 264 335 L 264 228 L 234 295 L 210 295 L 180 228 L 180 335 Z" fill="url(#mvGrad)"/>
    
    <!-- Letter V seamlessly interlocking across M -->
    <path d="M 282 180 L 316 180 L 364 300 L 412 180 L 446 180 L 382 335 L 346 335 Z" fill="url(#mvGrad)"/>
  </g>

  <!-- Center Turntable Spindle Glow -->
  <circle cx="256" cy="256" r="10" fill="#c6e94c" opacity="0.95"/>
  <circle cx="256" cy="256" r="5" fill="#0b0c0b"/>
</svg>
`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');
fs.writeFileSync(path.join(iconsDir, 'favicon.svg'), svgContent, 'utf8');
console.log('Saved SVG icon files');

// ── Rasterize High-Res Pixel Renderer for PNGs ────────────────────────────────
// Mathematical anti-aliased software rasterizer for the MV logo
function renderMvLogo(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    const bgA = buf[idx + 3] / 255;
    const fgA = a / 255;
    const outA = fgA + bgA * (1 - fgA);
    if (outA > 0) {
      buf[idx] = Math.round((r * fgA + buf[idx] * bgA * (1 - fgA)) / outA);
      buf[idx + 1] = Math.round((g * fgA + buf[idx + 1] * bgA * (1 - fgA)) / outA);
      buf[idx + 2] = Math.round((b * fgA + buf[idx + 2] * bgA * (1 - fgA)) / outA);
      buf[idx + 3] = Math.round(outA * 255);
    }
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;
  const cornerRadius = size * 0.22;

  // Render Base Squircle & Vinyl Layers
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / (size / 2);
      const ny = (y - cy) / (size / 2);
      
      // Rounded box distance
      const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - cornerRadius));
      const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - cornerRadius));
      const distCorner = Math.sqrt(dx * dx + dy * dy);
      
      if (distCorner <= cornerRadius) {
        // Inside squircle
        const dCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        
        // Dark background with radial tint
        let r = 14, g = 17, b = 13, a = 255;
        const gradT = dCenter / (size * 0.7);
        r = Math.round(20 * (1 - gradT) + 6 * gradT);
        g = Math.round(26 * (1 - gradT) + 8 * gradT);
        b = Math.round(18 * (1 - gradT) + 6 * gradT);

        // Vinyl outer disc
        const vinylR = size * 0.38;
        if (dCenter <= vinylR) {
          const vRing = Math.sin(dCenter / (scale * 3.5)) * 0.5 + 0.5;
          r = Math.round(18 + vRing * 6);
          g = Math.round(22 + vRing * 8);
          b = Math.round(15 + vRing * 5);
        }

        // Center vinyl core
        const coreR = size * 0.20;
        if (dCenter <= coreR) {
          r = 11; g = 13; b = 10;
        }

        // Green glow aura ring
        const ringDist = Math.abs(dCenter - size * 0.28);
        if (ringDist < scale * 8) {
          const glow = (1 - ringDist / (scale * 8)) * 0.35;
          r = Math.round(r * (1 - glow) + 198 * glow);
          g = Math.round(g * (1 - glow) + 233 * glow);
          b = Math.round(b * (1 - glow) + 76 * glow);
        }

        // Squircle border
        const borderDist = cornerRadius - distCorner;
        if (borderDist < scale * 4 && (dx > 0 || dy > 0 || Math.abs(x - cx) > size/2 - scale*4 || Math.abs(y - cy) > size/2 - scale*4)) {
          r = Math.round(r * 0.4 + 198 * 0.6);
          g = Math.round(g * 0.4 + 233 * 0.6);
          b = Math.round(b * 0.4 + 76 * 0.6);
        }

        setPixel(x, y, r, g, b, 255);
      }
    }
  }

  // Draw Letter Polygons / Segments for 'M' and 'V'
  // Letter M lines
  function drawLine(x0, y0, x1, y1, thickness, r, g, b) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    const rad = thickness / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      for (let oy = -rad; oy <= rad; oy++) {
        for (let ox = -rad; ox <= rad; ox++) {
          if (ox * ox + oy * oy <= rad * rad) {
            setPixel(Math.round(px + ox), Math.round(py + oy), r, g, b, 255);
          }
        }
      }
    }
  }

  const strokeW = scale * 26;
  const limeR = 198, limeG = 233, limeB = 76;
  const goldR = 235, goldG = 255, goldB = 153;

  // 'M' Strokes (Left to right)
  // Left vertical
  drawLine(scale * 156, scale * 335, scale * 156, scale * 180, strokeW, goldR, goldG, goldB);
  // Left diagonal down
  drawLine(scale * 156, scale * 180, scale * 220, scale * 290, strokeW, limeR, limeG, limeB);
  // Right diagonal up
  drawLine(scale * 220, scale * 290, scale * 280, scale * 180, strokeW, limeR, limeG, limeB);
  // Right vertical
  drawLine(scale * 280, scale * 180, scale * 280, scale * 335, strokeW, limeR, limeG, limeB);

  // 'V' Strokes (Interlocking on right side)
  // V left diagonal down
  drawLine(scale * 305, scale * 180, scale * 365, scale * 335, strokeW, goldR, goldG, goldB);
  // V right diagonal up
  drawLine(scale * 365, scale * 335, scale * 425, scale * 180, strokeW, goldR, goldG, goldB);

  // Center turntable spindle dot
  const dotR = scale * 8;
  for (let dy = -dotR; dy <= dotR; dy++) {
    for (let dx = -dotR; dx <= dotR; dx++) {
      if (dx * dx + dy * dy <= dotR * dotR) {
        setPixel(Math.round(cx + dx), Math.round(cy + dy), limeR, limeG, limeB, 255);
      }
    }
  }

  return buf;
}

// Generate PNG sizes
const sizes = [
  { name: 'apple-touch-icon-180x180.png', size: 180 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-16x16.png', size: 16 }
];

sizes.forEach(item => {
  const rgba = renderMvLogo(item.size);
  const png = encodeRGBAtoPNG(item.size, item.size, rgba);
  fs.writeFileSync(path.join(iconsDir, item.name), png);
  console.log(`Generated ${item.name} (${item.size}x${item.size})`);
});
