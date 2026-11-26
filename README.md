# When&Where.biz — Coming Soon

The coming-soon page for When&Where.biz: weddings, celebrations, and
drone light shows across Charlottesville and Central Virginia. It is
the placeholder that holds `whenwhere.biz` until the full site is
ready — one page, one job: collect emails for the launch list.

**Live:** <https://whenwhere.biz/> — GitHub Pages, deployed from
this repo (see [Deployment](#deployment)). The project URL
<https://enonymous1.github.io/whenwhere-biz-coming-soon/> redirects
there.

## What is on the page

- **One theme — Night & Gold** — night navy `#060a1a` + gold
  `#d9a441`, the same design system as the main site and the drone
  light shows page. The page follows the visitor's system: the night
  rendering in dark mode, warm ivory in light mode.
- **WHEN&WHERE wordmark, "Coming Soon" headline, one line** covering
  weddings, celebrations, and drone light shows in Charlottesville
  and Central Virginia.
- **A single email signup** — one field, one button ("Notify Me").
  Submitting POSTs the address to an Apps Script Web app that
  appends it to a private Google Sheet — the launch list (see
  [Launch-list setup](docs/LAUNCH-LIST-SETUP.md)). The page confirms
  with "You're on the list"; on a failed send it says so and keeps
  the form up so the visitor can retry.
- **A twinkling points-of-light canvas** behind the content — stars
  on the navy night, faint gold dust on the ivory light theme. It
  respects `prefers-reduced-motion` (a single still frame). Behind
  it sits a pure-CSS starfield fallback (three tiled layers, gold
  via the theme variables) that shows only when the canvas is not
  running — JS off, or `getContext()` failed — so the sky is never
  empty; the canvas hides it by adding `has-sky` to `<html>` once
  it is drawing.
- **No email address is listed anywhere on the page.** The original
  Wix version signed people up by opening their mail app addressed
  to hello@whenwhere.biz; that mailto hand-off is gone — the form
  now records the address itself, and there is no "email us at"
  line to scrape or to answer by hand.
- **GoatCounter analytics** — one async script in `<head>` reports
  each page view (path, title, referrer) to
  https://whenwherebiz.goatcounter.com. No cookies, no personal
  data, nothing shown on the page. See [Analytics](#analytics).

## Screenshots

Captured from the page in dark mode (the page follows the OS — the
light rendering is the same layout in warm ivory). Serve the folder
over HTTP first so the fonts load.

Desktop — 1920×1080, the most common desktop resolution:

![Coming Soon on desktop — the wordmark, headline, and single email signup](docs/screenshots/hero-desktop.png)

Mobile — 390×844, a typical phone viewport. The form stacks, the
button goes full-width, and the email field centers:

![Coming Soon on mobile — the same page, form stacked and button full-width](docs/screenshots/hero-mobile.png)

## Preview

`index.html` + `style.css` + `config.js` + `app.js` are the page — open `index.html` in a browser, or serve the
folder so paths resolve exactly as they will on Pages:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Note: with `LAUNCH_LIST_ENDPOINT` still blank, the form tells
visitors signups aren't open yet instead of silently dropping their
email. Wire the endpoint first (below), then push. The URL goes in
two places that must stay in sync: `LAUNCH_LIST_ENDPOINT` in
`WHENWHERE_CONFIG` (the JavaScript path) and the form's `action`
(the no-JavaScript fallback, which posts straight to the same
endpoint). A signup that takes longer than 15 seconds reports
"That’s taking too long" and can be retried — the server dedups,
so a retry never creates a second row.

## Launch-list setup

Full step-by-step instructions — private Sheet, Apps Script
deployment, testing, and troubleshooting — are in
[docs/LAUNCH-LIST-SETUP.md](docs/LAUNCH-LIST-SETUP.md). The short
version: create a new private Google Sheet, paste
`apps-script/Code.gs` into its Apps Script editor, deploy it as
a Web app (Execute as: Me, Who has access: Anyone), paste the Web
app URL as `LAUNCH_LIST_ENDPOINT` in `WHENWHERE_CONFIG` in
`config.js`, push once. After that, every signup lands as a row in
the Sheet — `Submitted | Email`, deduped by address — and the list
is yours to export when launch time comes.

How one signup travels:

```mermaid
flowchart TB
    V[Visitor enters email, clicks Notify Me] --> P[POST to the Apps Script Web app]
    P --> D{Address already in the Sheet?}
    D -- Yes --> O[Return ok — no second row]
    D -- No --> S[Append Submitted · Email to the Sheet]
    S --> E[Send confirmation email to the visitor<br/>and notify email to the owner, if set]
    E --> T[Return ok → page shows You're on the list]
    O --> T
```

## Analytics

Page views are counted by [GoatCounter](https://www.goatcounter.com)
(free, no cookies, no personal data). One async script in `<head>`
reports each view — path, page title, referrer — to the dashboard at
https://whenwherebiz.goatcounter.com. The `src` is explicit `https`
(not protocol-relative) so the script loads over HTTPS even if the
page is ever served over plain HTTP. GoatCounter deliberately does
not count visits from localhost, so opening the page locally while
developing never pollutes the stats; to verify the count fires from
a local copy, set `window.goatcounter = { allow_local: true }` before
the script in a test copy only (never in the real page). The signup
count itself lives in the launch-list Sheet — the dashboard's visitor
count next to it is the conversion rate.

## Deployment

Hosted on GitHub Pages via GitHub Actions — free, fast, versioned in
git, and no backend server needed. The workflow
(`.github/workflows/pages.yml`) deploys the page on every push to
`main`. There is no build step: what is committed is what goes live.

**One-time setup:**

1. Create an EMPTY public repo, e.g.
   `enonymous1/whenwhere-biz-coming-soon`.
2. Upload this folder's contents (including `.github/`,
   `apps-script/`, and `docs/`) to its root.
3. Repo → **Settings → Pages → Build and deployment → Source: GitHub
   Actions** → Save. (Not "Deploy from a branch".)
4. Push to `main`. Watch the run under the repo's **Actions** tab;
   it takes ~1–2 minutes. The live URL is
   `https://enonymous1.github.io/whenwhere-biz-coming-soon/` — that
   is the link to share for the demo.

**Updating the page:** edit the relevant file (`index.html`,
`style.css`, `config.js`, or `app.js`) and push. Copy changes do
not need a redeploy of anything else — the page is static, and the
launch list lives in the Sheet, not the repo.

## Custom domain

To serve this page at `whenwhere.biz` itself (instead of the
github.io URL), see
[docs/CUSTOM-DOMAIN.md](docs/CUSTOM-DOMAIN.md). The short version:
the repo already carries a `CNAME` file with `whenwhere.biz`;
point the domain's DNS at GitHub's Pages IPs and turn on Enforce
HTTPS. When the full site is ready, the custom domain moves to the
main-site repo and the DNS stays the same.

When the full site is ready, this page is the one that comes down —
`whenwhere.biz` points at the main site instead.

## Project structure

```text
whenwhere-biz-coming-soon/
├── .github/
│   └── workflows/
│       └── pages.yml           # deploy on push to main
├── apps-script/
│   └── Code.gs                 # Apps Script doPost for the launch-list Sheet
├── docs/
│   ├── LAUNCH-LIST-SETUP.md    # private Sheet + Apps Script setup, testing, troubleshooting
│   ├── LAUNCH-LIST-PIPELINE.md # how one signup travels: form → Sheet → emails → launch
│   ├── CUSTOM-DOMAIN.md        # point whenwhere.biz at this page (DNS + HTTPS)
│   └── screenshots/
│       ├── hero-desktop.png    # README desktop shot (1920×1080, dark mode)
│       └── hero-mobile.png     # README mobile shot (390×844, dark mode)
├── index.html                  # the page (markup + JSON-LD only)
├── style.css                   # all page styles, incl. the CSS starfield fallback
├── config.js                   # WHENWHERE_CONFIG (the launch-list endpoint)
├── app.js                      # signup form + sky canvas
├── favicon.png
├── CNAME
├── README.md
└── LICENSE                     # © 2026 When&Where.biz, all rights reserved
```

## License

© 2026 When&Where.biz — All rights reserved. See `LICENSE`.
