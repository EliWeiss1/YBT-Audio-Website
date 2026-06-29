#!/usr/bin/env node
// =============================================================================
// pilot-download.js — Phase 4 (download) + Phase 5 (MP4→MP3 convert + validate)
// Reads scripts/pilot-output/_scrape-cache.json, downloads each media file to
// scripts/pilot-output/pilot-media/{shiurID}.{ext}, converts MP4→MP3 via ffmpeg,
// validates durations via ffprobe (within 5s), deletes intermediate MP4, and
// writes media results to _media-cache.json + updates checkpoint.json.
// =============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join('scripts', 'pilot-output');
const MEDIA = path.join(OUT, 'pilot-media');
const cache = JSON.parse(fs.readFileSync(path.join(OUT, '_scrape-cache.json'), 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(path.join(OUT, 'checkpoint.json'), 'utf8'));
fs.mkdirSync(MEDIA, { recursive: true });

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  const j = JSON.parse(out);
  const d = parseFloat(j.format && j.format.duration);
  return Number.isFinite(d) ? d : null;
}

async function download(url, dest) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

(async () => {
  const mediaResults = {};
  for (const r of cache) {
    if (r.failed) { mediaResults[r.shiurID] = { failed: true, error: r.error }; continue; }
    const id = r.shiurID;
    const ext = r.original_media_type; // mp3 | mp4
    const rawPath = path.join(MEDIA, `${id}.${ext}`);
    try {
      console.log(`\n[${id}] downloading ${r.original_media_url}`);
      const bytes = await download(r.original_media_url, rawPath);
      console.log(`[${id}] downloaded ${(bytes / 1e6).toFixed(1)} MB → ${rawPath}`);
      checkpoint[id].status = 'downloaded';
      checkpoint[id].mediaPath = rawPath;

      const origDur = ffprobeDuration(rawPath);
      let finalPath = rawPath;
      let convertedDur = origDur;

      if (ext === 'mp4') {
        const mp3Path = path.join(MEDIA, `${id}.mp3`);
        console.log(`[${id}] converting MP4→MP3 ...`);
        execFileSync('ffmpeg', ['-y', '-i', rawPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', mp3Path], { stdio: 'ignore' });
        convertedDur = ffprobeDuration(mp3Path);
        const drift = (origDur != null && convertedDur != null) ? Math.abs(origDur - convertedDur) : null;
        console.log(`[${id}] orig=${origDur}s converted=${convertedDur}s drift=${drift}s`);
        if (drift != null && drift <= 5) {
          fs.unlinkSync(rawPath); // delete intermediate mp4 only after successful validation
          console.log(`[${id}] validated (drift ≤5s); deleted intermediate MP4`);
        } else {
          console.log(`[${id}] ⚠ drift >5s or unknown — KEEPING MP4 for inspection`);
        }
        finalPath = mp3Path;
        checkpoint[id].status = 'converted';
      }
      const finalBytes = fs.statSync(finalPath).size;
      mediaResults[id] = {
        finalPath, finalBytes,
        original_duration_seconds: origDur,
        converted_duration_seconds: convertedDur,
        duration_drift_seconds: (origDur != null && convertedDur != null) ? +(Math.abs(origDur - convertedDur)).toFixed(3) : null,
        mp3_size_mb: +(finalBytes / 1e6).toFixed(2),
      };
      checkpoint[id].status = 'done';
    } catch (e) {
      console.log(`[${id}] ERROR: ${e.message}`);
      mediaResults[id] = { failed: true, error: e.message };
      checkpoint[id].status = 'failed';
      checkpoint[id].error = e.message;
    }
    fs.writeFileSync(path.join(OUT, '_media-cache.json'), JSON.stringify(mediaResults, null, 2));
    fs.writeFileSync(path.join(OUT, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2));
  }
  console.log('\n=== DOWNLOAD/CONVERT DONE ===');
  for (const [id, m] of Object.entries(mediaResults)) {
    console.log(m.failed ? `${id}: FAILED ${m.error}` : `${id}: ${m.mp3_size_mb} MB | orig ${m.original_duration_seconds}s → conv ${m.converted_duration_seconds}s (drift ${m.duration_drift_seconds}s)`);
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
