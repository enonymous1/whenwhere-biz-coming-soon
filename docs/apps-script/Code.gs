/**
 * WhenWhere.biz — launch-list signup backend (Google Apps Script).
 *
 * Paste this whole file into a NEW, PRIVATE Google Sheet (the launch
 * list — not the public availability Sheet, not the private bookings
 * Sheet):
 *   Extensions → Apps Script, replace the default Code.gs contents.
 *
 * 1. Change the two settings at the top below. NOTIFY_EMAIL: put
 *    your Gmail there if you want one email per signup; leave it
 *    blank and the Sheet is the only record — no per-signup email
 *    noise. SEND_CONFIRMATION: on by default — each new signup
 *    also gets a short confirmation email (see below). The list
 *    lives in the Sheet either way.
 * 2. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 3. Copy the Web app URL and paste it as LAUNCH_LIST_ENDPOINT in
 *    index.html (WHENWHERE_CONFIG, just above the main script).
 * 4. Push the site once. From then on the form saves straight to the
 *    Sheet. Test it with your own email first and check the row lands.
 *
 * The script creates a 'Launch list' tab on first submit if it does
 * not exist yet, and writes the header row (below) when the tab is
 * empty. It appends one row per signup, in this order:
 *   Submitted | Email
 * A repeat signup from the same address is deduped — the page is
 * told 'ok' but no second row is written. If the tab already has
 * rows with no headers, the script now inserts the header row at
 * the top instead of silently treating the first data row as a
 * header (the old behaviour — see {@link ensureSheet}).
 *
 * Keep this Sheet private (never publish it to the web). The page
 * only needs the Web app URL; nobody needs the Sheet link.
 *
 * Per-signup notification (2026-11-25): when NOTIFY_EMAIL is set,
 * each new signup sends one email with the address, the running
 * total on the list, the submitted time, and a link back to this
 * Sheet. The email is sent both as plain text and as a lightly
 * styled HTML version (inline styles only — Gmail strips
 * `<style>` blocks and external fonts/images, so there is no
 * stylesheet, logo, or tracking pixel to strip). The address is
 * HTML-escaped before it goes into the HTML version.
 *
 * Subscriber confirmation (2026-11-25): when SEND_CONFIRMATION
 * is on, each NEW signup also gets a short confirmation email —
 * the page already promises "We'll email you the moment we
 * launch", so this is that promise arriving. Same navy/gold
 * inline styling as the notification, but no running total and
 * no Sheet link (those are owner-only). It names the address it
 * was sent to and routes both cases to one reply: if the signup
 * wasn't theirs, or they'd like to be removed, just reply and
 * the row is deleted. (An earlier draft told a mistaken
 * recipient to ignore it — but an ignored address would still
 * get the launch email, so ignoring was the one thing that
 * didn't work.) A deduped repeat sends nothing. Both emails go
 * out via MailApp, which means they come from the Gmail account
 * the script runs as — the owner's personal Gmail, for now —
 * but both carry the display name `WhenWhere.biz` (the `name`
 * option on each send), so that is what the recipient's inbox
 * shows, exactly like the main site's emails. Sending from
 * hello@whenwhere.biz needs a verified Gmail alias for that
 * address plus a switch to GmailApp.sendEmail({from: ...});
 * that is a later change, not a code tweak (see
 * LAUNCH-LIST-SETUP.md).
 *
 * Quota note: Apps Script counts recipients, not emails — a
 * consumer Gmail account gets 100 recipients a day, so with
 * both emails on, one signup costs two recipients and the day's
 * budget covers 50 signups. Both sends are best-effort and
 * logged; the signup itself never depends on either.
 *
 * Response contract (the page depends on this — do not change it
 * without changing index.html in step):
 *   - Success (including a deduped repeat): plain text `ok`.
 *   - Anything else: plain text starting `error: `.
 *   Apps Script always answers HTTP 200, even on rejection, so the
 *   page reads the body, not the status. Error bodies are generic
 *   on purpose: the detail goes to the Executions log (Logger.log),
 *   not to an anonymous caller.
 *
 * Review history — reviewed 2026-11-25 against the shipped tip
 * (commit beee9e0). Fixes applied in this copy, see REVIEW.md:
 * [R11] Dedup + append now run under a script lock (LockService).
 *       The old check-then-append had a race: two concurrent
 *       duplicate POSTs could both pass the dedup scan and both
 *       append. The lock makes the whole read-check-write atomic.
 * [R12] A MailApp failure no longer reports the signup as failed.
 *       The row was already appended; the old code threw after the
 *       append, so the page said "something went wrong" for a
 *       signup that had landed. Mail is now best-effort, logged.
 * [R13] Error bodies no longer leak internals (`'error: ' + err`
 *       used to hand the caller the raw exception, including sheet
 *       and quota details). Callers get a generic message.
 * [R14] Header handling: a tab with data but no header row gets
 *       headers inserted at row 1 (was: row 1 silently treated as
 *       the header, so that address was never deduped).
 * [R15] Guards added: bound-sheet missing (standalone copy),
 *       254-char email cap, formula-injection leading characters
 *       (`=`, `+`, `-`, `@`) rejected, NOTIFY_EMAIL validated
 *       before use instead of failing every signup.
 *
 * Known limits, deliberately left as-is (see REVIEW.md §3):
 * - Dedup is an O(n) scan of column B on every signup. Fine for a
 *   launch list (hundreds of rows); at thousands of rows it gets
 *   slow, and the fix then is a second lookup tab or CacheService,
 *   not a bigger scan.
 * - No rate limiting or CAPTCHA: "Who has access: Anyone" means
 *   anyone with the URL can POST. Google's quotas are the only
 *   throttle. If spam ever lands, the fix is a token/honeypot in
 *   the form, not a secret URL.
 * - Only form-encoded POSTs are accepted (e.parameter). The page
 *   sends URLSearchParams for exactly this reason; a JSON body
 *   would arrive with an empty e.parameter and be rejected.
 */

/** Blank = no per-signup email; put your Gmail here to get one per signup. */
var NOTIFY_EMAIL = '';
/**
 * On = each new signup also gets a short confirmation email (see
 * buildConfirmEmail). Sent from the Gmail account this script
 * runs as, via MailApp — until a hello@whenwhere.biz alias exists
 * and the sends move to GmailApp, there is no prettier From.
 */
var SEND_CONFIRMATION = true;
/** Tab holding the launch list. Created on first submit if missing. */
var SHEET_TAB = 'Launch list';
/** Header row, written to an empty tab (or inserted above headerless data). */
var HEADERS = ['Submitted', 'Email'];

/**
 * Maximum email length (RFC 5321/5322 path limit). Matches the
 * `maxlength="254"` on the form field in index.html — keep the two
 * in sync, so the page never promises an address the server rejects.
 * @type {number}
 */
var MAX_EMAIL_LENGTH = 254;

/**
 * Email check, byte-identical to the one in index.html. It knowingly
 * rejects a few valid addresses (1-character TLDs, quoted local
 * parts, non-ASCII). Loosen one side without the other and the page
 * will promise signups the server then rejects.
 * @type {RegExp}
 */
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Leading characters that would let a Sheet treat the value as a
 * formula when the CSV is opened elsewhere (formula/CSV injection).
 * A legitimate address essentially never starts with one of these,
 * so rejecting them costs nothing and closes the hole.
 * @type {RegExp}
 */
var FORMULA_LEAD_RE = /^[=+\-@]/;

/** How long doPost waits for the script lock before telling the caller to retry. */
var LOCK_TIMEOUT_MS = 10000;

/**
 * Health-check endpoint. Open the Web app URL in a browser: this
 * text means the deployment is live and reachable.
 *
 * @return {GoogleAppsScript.Content.TextOutput} Plain-text status line.
 */
function doGet() {
  return ContentService.createTextOutput(
    'WhenWhere launch list — POST an email to join.');
}

/**
 * Records one launch-list signup.
 *
 * Accepts a form-encoded POST with a single `email` field, dedups
 * it case-insensitively against column B, and appends
 * `[timestamp, email]` when it is new. A repeat address returns
 * `ok` with no second row, so a client retry after a timeout can
 * never create a duplicate.
 *
 * The whole read-check-write runs under a script lock: without it,
 * two concurrent duplicate POSTs can both pass the dedup scan
 * before either appends, and the list gets two rows for one address.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The POST event; only
 *     `e.parameter.email` (form-encoded) is read.
 * @return {GoogleAppsScript.Content.TextOutput} Plain text `ok` on
 *     success (including deduped repeats), or a generic
 *     `error: …` message on failure. Always HTTP 200 — the page
 *     reads the body, not the status.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    // Serialise the dedup check + append (see the JSDoc above).
    // If the lock is busy, tell the caller to retry rather than
    // risking a duplicate row — the page's retry is dedup-safe.
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) {
      return ContentService.createTextOutput('error: busy, please retry');
    }

    var email = String((e && e.parameter && e.parameter.email) || '').trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH ||
        FORMULA_LEAD_RE.test(email) || !EMAIL_RE.test(email)) {
      return ContentService.createTextOutput('error: invalid email');
    }

    var sheet = ensureSheet();
    if (isDuplicate(sheet, email)) {
      return ContentService.createTextOutput('ok');
    }

    // new Date() uses the script's timezone (Project Settings →
    // Time zone, defaulting to the Sheet's). The Sheet displays it
    // in that zone; if the list is ever exported for another
    // timezone, convert at export time, not here.
    var submitted = new Date();
    sheet.appendRow([submitted, email]);

    // The running total, exact at this moment: the dedup check and
    // the append above ran under the script lock, so no other
    // signup can have slipped in between. Minus one for the
    // header row.
    var total = sheet.getLastRow() - 1;
    var submittedText = Utilities.formatDate(
      submitted, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    // The confirmation goes first, then the owner notification
    // below: the page promises the visitor an email ("We'll email
    // you the moment we launch"), so when the day's mail quota is
    // nearly out, the visitor's email gets the remaining sends
    // first — the owner always has the Sheet as the record.
    // Best-effort, like the notification: a failure is logged,
    // never returned (the row above is already saved). Deduped
    // repeats never reach this code (they returned 'ok' above),
    // so nobody gets a second confirmation.
    if (SEND_CONFIRMATION) {
      try {
        var confirm = buildConfirmEmail(email);
        MailApp.sendEmail({
          to: email,
          subject: confirm.subject,
          body: confirm.body,
          htmlBody: confirm.htmlBody,
          name: 'WhenWhere.biz'
        });
      } catch (confirmErr) {
        Logger.log('Launch-list confirmation email failed for %s: %s', email, confirmErr);
      }
    }

    // Notification is best-effort and must never fail the signup:
    // the row above is already saved, so a mail failure (bad
    // NOTIFY_EMAIL, daily quota) is logged, not returned as an
    // error — otherwise the page would report failure for a
    // signup that landed, and the visitor's retry would look
    // like a second failure.
    if (NOTIFY_EMAIL && EMAIL_RE.test(NOTIFY_EMAIL)) {
      try {
        var notify = buildNotifyEmail(
          email, total, submittedText, getSpreadsheetUrl());
        MailApp.sendEmail({
          to: NOTIFY_EMAIL,
          subject: notify.subject,
          body: notify.body,
          htmlBody: notify.htmlBody,
          name: 'WhenWhere.biz'
        });
      } catch (mailErr) {
        Logger.log('Launch-list notify email failed for %s: %s', email, mailErr);
      }
    } else if (NOTIFY_EMAIL) {
      Logger.log('Launch-list NOTIFY_EMAIL is not a valid email address; skipping notification.');
    }
    return ContentService.createTextOutput('ok');
  } catch (err) {
    // Log the detail where the owner can see it (Executions log)
    // and give the caller a generic message. The old code returned
    // 'error: ' + err, handing an anonymous caller the raw
    // exception — sheet names, quota errors, stack fragments.
    Logger.log('Launch-list doPost failed: %s', err);
    return ContentService.createTextOutput('error: unavailable, please try again');
  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * Builds the per-signup notification email (plain text + HTML).
 *
 * Kept as a pure function — no SpreadsheetApp/MailApp calls — so
 * the wording and the escaping can be reasoned about (and tested)
 * without a live Sheet. The subject carries the running total in
 * parentheses so the inbox shows the list size at a glance, while
 * the fixed prefix keeps the thread filterable/searchable.
 *
 * Styling is deliberately light and inline-only: Gmail strips
 * `<style>` blocks, external stylesheets, webfonts and images, so
 * anything fancier would be stripped or blocked on arrival. No
 * logo, no webfont, no tracking pixel — a navy header bar, the
 * gold accent, and one link button. The plain-text body carries
 * the same content for clients that do not render HTML.
 *
 * @param {string} email The normalised (trimmed, lower-cased) address.
 * @param {number} total Running total on the list, header excluded.
 * @param {string} submittedText The signup time, already formatted.
 * @param {string} sheetUrl Link back to the launch-list Sheet, or
 *     '' when unknown — the link is then omitted, not rendered empty.
 * @return {{subject: string, body: string, htmlBody: string}} The
 *     three parts MailApp.sendEmail takes.
 */
function buildNotifyEmail(email, total, submittedText, sheetUrl) {
  // The address is escaped before it touches the HTML version: the
  // email regex allows characters like <, > and &, so an address
  // such as "<b>@example.com" would otherwise break out of the
  // markup in the notification. The plain-text body uses the raw
  // address — there is nothing to escape into there.
  var safeEmail = escapeHtml(email);
  var safeUrl = escapeHtml(sheetUrl);
  var subject = 'New WhenWhere launch-list signup (#' + total + ')';
  var body = 'New signup for the WhenWhere launch list:\n\n' +
    'Email: ' + email + '\n' +
    'Total on the list: ' + total + '\n' +
    'Submitted: ' + submittedText + '\n' +
    (sheetUrl ? 'Launch list: ' + sheetUrl + '\n' : '');
  var link = sheetUrl ?
    '<p style="margin:20px 0 0;"><a href="' + safeUrl + '" ' +
    'style="display:inline-block;background:#d9a441;color:#131a38;' +
    'padding:10px 18px;border-radius:999px;text-decoration:none;' +
    'font-family:Arial,sans-serif;font-size:14px;">' +
    'Open the launch list</a></p>' : '';
  var htmlBody =
    '<div style="font-family:Georgia,serif;color:#131a38;max-width:480px;">' +
    '<div style="background:#060a1a;color:#f2ead6;padding:16px 20px;' +
    'font-size:18px;letter-spacing:0.18em;">WHEN<span style="color:#d9a441;">WHERE</span></div>' +
    '<div style="background:#f6f1e6;padding:20px;">' +
    '<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:14px;">' +
    'New signup for the WhenWhere launch list</p>' +
    '<p style="margin:0 0 8px;font-size:18px;"><strong>' + safeEmail + '</strong></p>' +
    '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;">' +
    'Total on the list: <strong>' + total + '</strong></p>' +
    '<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#454d6e;">' +
    'Submitted: ' + escapeHtml(submittedText) + '</p>' +
    link +
    '</div></div>';
  return { subject: subject, body: body, htmlBody: htmlBody };
}

/**
 * Builds the confirmation email to the new subscriber (plain text
 * + HTML). Pure, like buildNotifyEmail — no SpreadsheetApp/MailApp
 * calls — so the wording and the escaping can be tested without a
 * live Sheet.
 *
 * The copy states the honest total — this confirmation plus one
 * launch email, two emails in all — and offers removal by reply:
 * replies land in the owner's Gmail, and removing someone is
 * deleting their row from the Sheet. That is the unsubscribe
 * until the launch mail tool takes over. Same navy/gold inline
 * styling as the notification.
 *
 * @param {string} email The normalised (trimmed, lower-cased) address.
 * @return {{subject: string, body: string, htmlBody: string}} The
 *     three parts MailApp.sendEmail takes.
 */
function buildConfirmEmail(email) {
  var safeEmail = escapeHtml(email);
  var subject = "You're on the WhenWhere launch list";
  var body = "You're on the WhenWhere launch list.\n\n" +
    "We'll email you when we launch — one more email, and that's " +
    'everything.\n\n' +
    'This email was sent to ' + email + ' because someone signed ' +
    "up with that address. If that wasn't you, or you'd like to " +
    "be removed, just reply to this email — we'll take you off " +
    'the list.\n\n' +
    '— WhenWhere\n' +
    'whenwhere.biz';
  var htmlBody =
    '<div style="font-family:Georgia,serif;color:#131a38;max-width:480px;">' +
    '<div style="background:#060a1a;color:#f2ead6;padding:16px 20px;' +
    'font-size:18px;letter-spacing:0.18em;">WHEN<span style="color:#d9a441;">WHERE</span></div>' +
    '<div style="background:#f6f1e6;padding:20px;">' +
    '<p style="margin:0 0 8px;font-size:18px;"><strong>You&rsquo;re on the list</strong></p>' +
    '<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:14px;">' +
    'We&rsquo;ll email you when we launch &mdash; one more email, and that&rsquo;s everything.</p>' +
    '<p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;color:#454d6e;">' +
    'This email was sent to <strong>' + safeEmail + '</strong> because someone ' +
    'signed up with that address. If that wasn&rsquo;t you, or you&rsquo;d like to be ' +
    'removed, just reply to this email &mdash; we&rsquo;ll take you off the list.</p>' +
    '<p style="margin:0;"><a href="https://whenwhere.biz" ' +
    'style="display:inline-block;background:#d9a441;color:#131a38;' +
    'padding:10px 18px;border-radius:999px;text-decoration:none;' +
    'font-family:Arial,sans-serif;font-size:14px;">' +
    'Visit WhenWhere.biz</a></p>' +
    '</div></div>';
  return { subject: subject, body: body, htmlBody: htmlBody };
}

/**
 * Escapes a value for interpolation into HTML text or an attribute.
 * Ampersand first — escaping it last would double-escape the
 * entities the other replacements just wrote.
 *
 * @param {string} value The raw value.
 * @return {string} The value with &, <, >, " and ' escaped.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Link back to the launch-list Sheet for the notification email.
 * The link goes only to NOTIFY_EMAIL (the owner), never to a
 * visitor, and it grants nothing — the recipient already owns the
 * Sheet. Returns '' when the spreadsheet cannot be resolved, so
 * the caller omits the link instead of sending a broken one.
 *
 * @return {string} The Sheet URL, or ''.
 */
function getSpreadsheetUrl() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss ? ss.getUrl() : '';
}

/**
 * Returns the launch-list tab, creating it (with headers) if needed.
 *
 * Handles three states, because the tab's history is not guaranteed:
 * missing → create + headers; empty → headers; has rows but row 1
 * is not the header row → insert headers at the top. The last case
 * is the fix for the old behaviour, which silently treated the
 * first data row as the header — that address was then never
 * deduped, and every later signup compared against the wrong rows.
 *
 * @return {GoogleAppsScript.Spreadsheet.Sheet} The launch-list tab.
 * @throws {Error} If this script is not bound to a spreadsheet
 *     (e.g. pasted into a standalone script), so the caller gets a
 *     clean error instead of a null-dereference downstream.
 */
function ensureSheet() {
  // getActiveSpreadsheet() is null in a standalone script. This
  // script is only ever meant to be bound to the launch-list Sheet,
  // so fail loudly here rather than crashing on getSheetByName.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Launch-list script is not bound to a spreadsheet');
  }
  var sheet = ss.getSheetByName(SHEET_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TAB);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return sheet;
  }
  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var hasHeaders = true;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(firstRow[i]).trim() !== HEADERS[i]) {
      hasHeaders = false;
      break;
    }
  }
  if (!hasHeaders) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

/**
 * Case-insensitive dedup check against column B (Email).
 *
 * This is an O(n) scan of the whole column on every signup: one
 * getValues() call, then a linear loop that exits on the first
 * match. That is fine for a launch list (hundreds of rows) and is
 * the simplest correct shape while the list is small. Do not "fix"
 * it with a per-row getValue() loop — that would be n API calls
 * instead of one. When the list reaches thousands of rows, replace
 * this with a lookup tab or CacheService, not a bigger scan.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The launch-list tab.
 * @param {string} email The normalised (trimmed, lower-cased) address.
 * @return {boolean} True if the address is already on the list.
 */
function isDuplicate(sheet, email) {
  var last = sheet.getLastRow();
  if (last <= 1) return false; // headers only (or empty) — nothing to match
  var existing = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim().toLowerCase() === email) {
      return true;
    }
  }
  return false;
}
