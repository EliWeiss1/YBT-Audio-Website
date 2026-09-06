#!/usr/bin/env node
// =============================================================================
// notify-schneeweiss-summary.js — emails a summary after the scheduled
// migrate-schneeweiss.js run (see .github/workflows/schneeweiss-daily-sync.yml).
//
// Only sends an email when there's something to review: shiurim were added,
// something got flagged for manual categorization, a shiur failed, or the
// migration script crashed outright. A quiet day (nothing new on YUTorah)
// sends nothing.
// =============================================================================
const fs = require('fs');
const { Resend } = require('resend');

const LOG_PATH = process.env.LOG_PATH || 'migrate-output.log';
const MIGRATE_OUTCOME = process.env.MIGRATE_OUTCOME || 'success';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'eliisaweiss@gmail.com';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function send(subject, html) {
  if (!RESEND_API_KEY) {
    console.log('No RESEND_API_KEY set — skipping email.\n---\n', subject, '\n', html);
    return;
  }
  const resend = new Resend(RESEND_API_KEY);
  await resend.emails.send({ from: 'ingest@noreply.ybt.org', to: ADMIN_EMAIL, subject, html });
}

async function main() {
  const log = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : '';
  const summaryMatch = log.match(/MIGRATE SUMMARY[\s\S]*?════/);

  if (MIGRATE_OUTCOME !== 'success' || !summaryMatch) {
    await send(
      '[Schneeweiss Sync] FAILED',
      `<h2>Rabbi Schneeweiss YUTorah sync failed</h2>
       <p>The migration script did not complete normally. Last output:</p>
       <pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;">${escapeHtml(log.slice(-4000) || '(no log captured)')}</pre>`
    );
    return;
  }

  const summary = summaryMatch[0];
  const num = (label) => {
    const m = summary.match(new RegExp(`${label}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  const added = num('added');
  const flagged = num('flagged');
  const failed = num('failed');
  const gaveUp = num('gave up on');

  if (added === 0 && flagged === 0 && failed === 0) {
    console.log('Nothing new this run — skipping summary email.');
    return;
  }

  const parts = [`${added} added`];
  if (flagged) parts.push(`${flagged} flagged`);
  if (failed) parts.push(`${failed} failed`);
  if (gaveUp) parts.push(`${gaveUp} gave up`);

  const html = `
    <h2>Rabbi Schneeweiss YUTorah sync</h2>
    <pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;">${escapeHtml(summary)}</pre>
    ${flagged ? `<p><strong>Action needed:</strong> ${flagged} shiur(s) need manual categorization — add entries to <code>SHIUR_OVERRIDES</code> in <code>scripts/migrate-schneeweiss.js</code>. They'll stay flagged (and get re-flagged in this summary) until that's done.</p>` : ''}
    ${failed ? `<p>See <code>scripts/migrate-failures.json</code> in the repo for failure details.</p>` : ''}
    ${gaveUp ? `<p><strong>${gaveUp} shiur(s) gave up after repeated failures</strong> and will no longer auto-retry (likely a broken/empty source file on YUTorah's end) — check <code>scripts/migrate-failures.json</code> for the "skipped" entries and use <code>--retry-failures</code> to force a retry once the source is fixed.</p>` : ''}
  `;

  await send(`[Schneeweiss Sync] ${parts.join(', ')}`, html);
}

main().catch((e) => { console.error('notify-schneeweiss-summary failed', e); process.exit(1); });
