/**
 * WhenWhere.biz — launch-list signup backend
 *
 * Paste this whole file into a NEW, PRIVATE Google Sheet (the launch
 * list — not the public availability Sheet, not the private bookings
 * Sheet):
 *   Extensions → Apps Script, replace the default Code.gs contents.
 *
 * 1. Change NOTIFY_EMAIL at the top below only if you want an email
 *    per signup. Leave it blank and the Sheet is the only record —
 *    no per-signup email noise. The list lives in the Sheet either way.
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
 * rows with no headers, insert a row at the top of the Sheet and
 * type those labels in — the script only writes headers to an empty
 * tab, it never rewrites row 1.
 *
 * Keep this Sheet private (never publish it to the web). The page
 * only needs the Web app URL; nobody needs the Sheet link.
 */

var NOTIFY_EMAIL = '';  // blank = no per-signup email; put your Gmail here to get one per signup
var SHEET_TAB = 'Launch list';
var HEADERS = ['Submitted', 'Email'];

function doGet() {
  return ContentService.createTextOutput(
    'WhenWhere launch list — POST an email to join.');
}

function doPost(e) {
  try {
    var email = String((e && e.parameter && e.parameter.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return ContentService.createTextOutput('error: invalid email');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAB);
    if (!sheet) sheet = ss.insertSheet(SHEET_TAB);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    // Dedup: same address (case-insensitive) already on the list.
    var last = sheet.getLastRow();
    if (last > 1) {
      var existing = sheet.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).trim().toLowerCase() === email) {
          return ContentService.createTextOutput('ok');
        }
      }
    }

    sheet.appendRow([new Date(), email]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'New WhenWhere launch-list signup',
        body: 'New signup for the WhenWhere launch list:\n\nEmail: ' + email + '\n'
      });
    }
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}
