/**
 * convert-wma-to-r2.js
 * Downloads WMA/WAV lectures from ybt.org, converts to MP3 via ffmpeg,
 * uploads to R2, and updates audioUrl in lectures.json.
 *
 * Setup: fill in your R2 credentials below, then run:
 *   node scripts/convert-wma-to-r2.js --test   # preview only, no downloads/uploads
 *   node scripts/convert-wma-to-r2.js           # full run
 */

const fs        = require('fs');
const path      = require('path');
const https     = require('https');
const http      = require('http');
const { execSync } = require('child_process');

// ─── R2 CREDENTIALS — fill these in ──────────────────────────────────────────
const R2_ACCOUNT_ID     = '0d01541d98533894b1ab1254a44f9478';
const R2_ACCESS_KEY_ID  = 'a46217faaf5d48a5dc084b58cced3994';
const R2_SECRET_KEY     = 'b13c07a130a4ecca4f2becaed0b53fada55603baaa7807d56b2ac855b3086e87';
const R2_BUCKET         = 'shiurim-audio';
const R2_PUBLIC_URL     = 'https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev'; // your R2 public bucket URL
// ─────────────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-wma-convert.json');
const TMP_DIR   = path.join('tmp', 'wma-convert');

function ext(url) {
  return (url || '').split('.').pop().toLowerCase().split('?')[0];
}

// ─── Find all WMA/WAV lectures ────────────────────────────────────────────────
function findConvertibles(categories) {
  const results = [];
  function walk(nodes) {
    for (const n of nodes) {
      if (n.lectures) {
        for (const l of n.lectures) {
          const e = ext(l.audioUrl);
          if (e === 'wma' || e === 'wav') results.push(l);
        }
      }
      if (n.children) walk(n.children);
    }
  }
  walk(categories);
  return results;
}

// ─── Download file ────────────────────────────────────────────────────────────
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);
    proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => { file.close(); reject(err); });
  });
}

// ─── Upload to R2 via S3-compatible API ──────────────────────────────────────
async function uploadToR2(localPath, r2Key) {
  // Use AWS SDK v3 (install once: npm install @aws-sdk/client-s3)
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_KEY,
    },
  });

  const fileBuffer = fs.readFileSync(localPath);
  await client.send(new PutObjectCommand({
    Bucket:       R2_BUCKET,
    Key:          r2Key,
    Body:         fileBuffer,
    ContentType:  'audio/mpeg',
  }));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n========================================`);
  console.log(isTest ? '  WMA Convert — TEST MODE' : '  WMA Convert — FULL MODE');
  console.log(`========================================\n`);

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const lectures = findConvertibles(data.categories);

  console.log(`Found ${lectures.length} WMA/WAV lectures to convert:\n`);
  for (const l of lectures) {
    console.log(`  ${l.id}  ${ext(l.audioUrl).toUpperCase()}  ${l.title}`);
    console.log(`    ${l.audioUrl}`);
  }

  if (isTest) {
    console.log('\nTest mode — no downloads or uploads. Run without --test to proceed.\n');
    return;
  }

  // Verify credentials are filled in
  if (R2_ACCESS_KEY_ID === 'YOUR_ACCESS_KEY_ID') {
    console.error('\nERROR: Fill in R2 credentials at the top of the script before running.\n');
    process.exit(1);
  }

  // Check ffmpeg
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); }
  catch { console.error('ERROR: ffmpeg not found in PATH.'); process.exit(1); }

  // Check AWS SDK
  try { require('@aws-sdk/client-s3'); }
  catch {
    console.error('ERROR: @aws-sdk/client-s3 not installed.');
    console.error('Run: npm install @aws-sdk/client-s3');
    process.exit(1);
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(BACKUP, JSON.stringify(data, null, 2));
  console.log(`\nBacked up to ${BACKUP}\n`);

  let converted = 0, failed = 0;

  for (const lecture of lectures) {
    const srcExt   = ext(lecture.audioUrl);
    const safeName = lecture.id.replace(/[^a-zA-Z0-9\-]/g, '_');
    const srcPath  = path.join(TMP_DIR, `${safeName}.${srcExt}`);
    const mp3Path  = path.join(TMP_DIR, `${safeName}.mp3`);
    const r2Key    = `YBTArchived/${safeName}.mp3`;

    process.stdout.write(`  ${lecture.id} — downloading... `);
    try {
      await download(lecture.audioUrl, srcPath);
      process.stdout.write('converting... ');

      execSync(`ffmpeg -y -i "${srcPath}" -codec:a libmp3lame -qscale:a 4 "${mp3Path}"`, { stdio: 'ignore' });
      process.stdout.write('uploading... ');

      await uploadToR2(mp3Path, r2Key);

      // Update audioUrl in the lecture object
      lecture.audioUrl = `${R2_PUBLIC_URL}/${r2Key}`;
      converted++;
      console.log('✓');

      // Clean up tmp files
      fs.unlinkSync(srcPath);
      fs.unlinkSync(mp3Path);
    } catch (err) {
      failed++;
      console.log(`✗ FAILED: ${err.message}`);
    }
  }

  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

  console.log(`\n========================================`);
  console.log(`  Converted: ${converted}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Saved:     ${inputPath}`);
  console.log(`========================================\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
