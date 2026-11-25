# Launch-list setup

The coming-soon page's single email field is a real signup form: it
POSTs the visitor's address to an Apps Script Web app, which appends
it to a **private** Google Sheet — the launch list. There is no
mailto hand-off and no email address on the page. This is the same
pattern as the main site and drone site inquiry forms, cut down to
one field.

## What you need

- A Google account (the one you want the list under — your personal
  Gmail is fine).
- About five minutes. The Sheet, the script, and the deployment are
  all in that account; nothing here touches the main site or the
  drone site.

## Steps

### 1. Create the private Sheet

1. In Google Sheets, create a new blank spreadsheet. Name it
   something clear, e.g. **WhenWhere — Launch list**.
2. Leave it as it is — the script creates the `Launch list` tab and
   its header row (`Submitted | Email`) on the first signup. If the
   tab already has rows but no header row, the script inserts the
   headers at the top instead of treating the first row as a header.
3. **Do not publish this Sheet to the web.** It holds people's email
   addresses. Keep its Share setting on Restricted (just you, plus
   anyone you explicitly add as an Editor — same lockdown as the
   content Sheets). The page never needs the Sheet link, only the
   Web app URL from step 3.

### 2. Paste in the script

1. In the Sheet: **Extensions → Apps Script**. A new script editor
   opens with a default `Code.gs`.
2. Delete the default contents and paste in the whole of
   `docs/apps-script/Code.gs` from this repo.
3. Save (Ctrl/Cmd+S). There are two settings at the top:
   `NOTIFY_EMAIL` — leave it blank and the Sheet is the only
   record, no per-signup email. Put your Gmail there if you want
   one email per signup (useful while testing; noisy once the
   list grows). `SEND_CONFIRMATION` — on by default: each new
   signup also gets a short confirmation email from your Gmail
   (the page promises "We'll email you the moment we launch").
   Set it to `false` to stop the confirmations; the Sheet still
   records every signup either way.

### 3. Deploy it as a Web app

1. **Deploy → New deployment → Web app** (gear icon → Web app).
2. **Execute as: Me.**
3. **Who has access: Anyone.** (The page is public, so the endpoint
   has to accept posts from anyone. The script only ever writes one
   email address to your Sheet — it cannot read or change anything
   else.)
4. **Deploy**, authorize when asked (the script needs permission
   to edit this Sheet and to send mail as you — the confirmation
   email is on by default, so the mail permission is asked for
   even with `NOTIFY_EMAIL` blank), and copy the Web app URL. It
   ends in `/exec`.

### 4. Paste the URL into the page

1. In `index.html`, find `WHENWHERE_CONFIG` just above the main
   script and paste the URL as `LAUNCH_LIST_ENDPOINT`:

   ```js
   var WHENWHERE_CONFIG = {
     LAUNCH_LIST_ENDPOINT: "https://script.google.com/macros/s/…/exec"
   };
   ```

2. Push once. From then on the form saves straight to the Sheet.

### 5. Test it

1. Open the live page and submit **your own** email.
2. You should see "You're on the list". Check the Sheet — a row
   `Submitted | your email` should be in the `Launch list` tab.
3. Submit the same email again: the page still says "You're on
   the list", but **no second row** appears — repeat signups are
   deduped.

If you ever change `Code.gs` after deploying, deploy it again as a
**new version** (Manage deployments → edit → new version). The URL
stays the same.

## How the list works

- One row per signup: the timestamp and the email, nothing else.
  No name, no message, no tracking.
- **Deduped by address** (case-insensitive). A visitor who signs up
  twice, or double-clicks Submit, gets one row. The dedup check and
  the append run under a script lock, so two identical signups
  arriving at the same moment cannot both slip through.
- **Confirmation email, on by default.** Each new signup gets a
  short email from your Gmail: "You're on the WhenWhere launch
  list". It states the honest total — this confirmation plus one
  launch email, two emails in all — with a gold "Visit
  WhenWhere.biz" button. It shows in the recipient's inbox as
  from **WhenWhere.biz** (the `name` option on the send — the
  address behind it is still your Gmail, same as the main
  site's emails). It names the address it was sent to and
  routes both cases to one reply: if the signup wasn't theirs,
  or they'd like to be removed, just reply and the row is
  deleted. (It deliberately does not tell a mistaken recipient
  to ignore it — an ignored address would still get the launch
  email.) It carries no running total and no Sheet link (those
  are owner-only). A repeat signup sends nothing.
  **Removal:** replies asking to be removed — or saying the
  signup wasn't theirs — land in your Gmail, and removing
  someone is deleting their row from the Sheet. That is the
  unsubscribe until the launch mail tool (which carries its own
  unsubscribe link) takes over.
  **From address:** both emails come from the Gmail account the
  script runs as — your personal Gmail, for now. Sending from
  `hello@whenwhere.biz` needs a mailbox for that address first
  (there is none yet), then a verified Gmail "Send mail as" alias
  for it, and a switch in `Code.gs` from `MailApp` to
  `GmailApp.sendEmail({ from: ... })`. That is a later change, not
  a settings tweak. **Quota:** Apps Script counts recipients, not
  emails — a consumer Gmail account gets 100 a day, so with both
  emails on, one signup costs two recipients and the day's budget
  covers 50 signups.
- **Owner notification, off by default.** The Sheet is the list.
  If you set `NOTIFY_EMAIL`, you get one email per signup instead.
  A failed email (owner notification or subscriber confirmation)
  never fails the signup itself — the row is already saved, and
  the failure is logged in the Apps Script **Executions** log.
  Each notification shows the new address, the running total on
  the list, when they signed up, and a link back to the Sheet
  (plain text plus a lightly styled HTML version).
- The page validates the address in the browser first (same check
  the script runs again server-side), and the script answers plain
  `'ok'` — the page only shows "You're on the list" when the server
  actually accepted it. A failed send shows "Something went wrong —
  please try again in a moment" and keeps the form up.

## At launch time

Export the Sheet (File → Download → CSV) and import it into
whatever you send the launch email with — your Gmail for a small
list, or a mailing tool (Buttondown, Mailchimp, ConvertKit) if the
list is big enough to want unsubscribes and delivery tracking. The
list is a plain two-column CSV, so it imports anywhere. There is
nothing to set up now for that step; decide the sending tool when
the launch date is real. The full launch run — and everything that
happens to the list before then — is in
`docs/LAUNCH-LIST-PIPELINE.md`.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| "Signups aren't open just yet" | `LAUNCH_LIST_ENDPOINT` is still blank in `index.html` | Paste the Web app URL (step 4) and push. |
| "Something went wrong — please try again" | The script errored or the URL is wrong | Open the Web app URL in a browser — it should show "WhenWhere launch list — POST an email to join." If it doesn't, the deployment is wrong (step 3). Then check the Apps Script **Executions** log for the error. |
| "That’s taking too long — please try again" | The script took over 15 seconds to answer (slow first run, or a very large list making the dedup scan slow) | Try again — the server dedups, so a retry cannot create a second row. If it keeps happening, check the **Executions** log for how long each run takes. |
| Page says "You're on the list" but no row appears | A duplicate address (deduped — expected), or the row went to a different Sheet | Check the `Launch list` tab in the Sheet the script is bound to. If you pasted the script into the wrong Sheet, move it. |
| Signed up but got no confirmation email | `SEND_CONFIRMATION` is off, the mail went to spam, or the day's 100-recipient quota is used up (each signup costs two recipients while both emails are on) | Check spam first, then `SEND_CONFIRMATION` at the top of `Code.gs`, then the Apps Script **Executions** log — a failed send is logged there, and the signup itself is unaffected. |
| The form does nothing at all | JavaScript error, or the endpoint never got set | Open the browser console for the error; check `WHENWHERE_CONFIG` is above the main script and the URL ends in `/exec`. |

## Why this instead of a mailing-list service

The page only needs to *record* one email field, not send mail yet.
An Apps Script + Sheet does that with no new account, no monthly
cost, and no third party holding the list — the same backend you
already run for the two inquiry forms, so there is nothing new to
learn or maintain. The sending tool is a launch-day decision, not a
today decision: when the date is real, export the CSV and pick the
tool then. If you'd rather have the blast tool ready now, the
alternative is a service like Buttondown (free tier, built for
exactly this) — the form would POST to its endpoint instead, and
the Sheet step goes away. But for a list that only gets used once,
at launch, the Sheet is the simpler keeper.
