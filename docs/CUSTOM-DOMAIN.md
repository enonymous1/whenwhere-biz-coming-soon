# Custom domain — point whenwhere.biz at this page

This page is built to hold `whenwhere.biz` until the full site is
ready. A GitHub Pages custom domain does that: the address bar stays
on `whenwhere.biz` (no redirect to the github.io URL), GitHub
provides HTTPS for free, and the switch is reversible.

## What you need

- The repo pushed to GitHub (the `CNAME` file is already in it).
- Access to the DNS settings for `whenwhere.biz` — Wix's domain
  settings if Wix manages the domain, otherwise the registrar where
  the domain lives.
- A few minutes, plus propagation time.

## How it works (the short version)

1. The repo tells GitHub it owns `whenwhere.biz` — the `CNAME` file
   at the repo root, already in place. Nothing to do here.
2. DNS points `whenwhere.biz` at GitHub's servers — your step,
   below.
3. GitHub provisions an HTTPS certificate and serves this page at
   the domain.
4. When the full site is ready, the custom domain moves to the
   main-site repo; the DNS stays exactly the same.

## Steps

### 1. Push the repo (the CNAME is already in it)

The `CNAME` file at the repo root contains one line:

```text
whenwhere.biz
```

Push as usual. If you ever need to set the domain by hand instead:
repo → **Settings → Pages → Custom domain** → type `whenwhere.biz`
→ Save (GitHub writes the `CNAME` file for you).

### 2. Update DNS

Do this wherever `whenwhere.biz`'s DNS lives. If Wix manages the
domain, that's Wix → Settings → Domains → `whenwhere.biz` → DNS
records (or Advanced). Otherwise it's the registrar's DNS panel.

Replace the records that point the domain at Wix with these:

| Host | Type | Value |
|---|---|---|
| `@` (the apex, i.e. `whenwhere.biz` itself) | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `www` | CNAME | `enonymous1.github.io` |

Delete or replace the existing A records and the existing `www`
record that point to Wix. Do **not** delete other records — MX
(email), TXT (verification), and anything else stay as they are;
only the records that serve the website change. (The four A-record
addresses are GitHub's published Pages IPs.)

### 3. Turn on Enforce HTTPS

After the DNS has propagated: repo → **Settings → Pages**. The
Custom domain field shows `whenwhere.biz` with "DNS check
successful". Check **Enforce HTTPS**. GitHub provisions the
certificate automatically; the checkbox appears once the domain
resolves to GitHub.

### 4. Check it

- Visit <https://whenwhere.biz> — the coming-soon page, with the
  domain in the address bar.
- Visit <https://www.whenwhere.biz> — the same page (GitHub serves
  `www` at the apex domain).
- The repo → **Settings → Pages** shows the custom domain and
  "Your site is live at https://whenwhere.biz/".

## What to expect

- **Propagation takes minutes to a few hours.** During the
  transition some visitors still see the Wix site — that's cached
  DNS, not a broken setup.
- **The Wix site isn't deleted**, just disconnected from the domain.
  Going back means pointing the DNS at Wix's records again.
- **The github.io URL keeps working the whole time:**
  <https://enonymous1.github.io/whenwhere-biz-coming-soon/> — so
  the page is never down while the domain moves.

## When the full site is ready

1. In **this** repo, remove the custom domain — delete the `CNAME`
   file (or clear it in **Settings → Pages**) and push.
2. In the **main-site** repo (`whenwhere-biz-main-site`), add a
   `CNAME` file containing `whenwhere.biz` (or set it in
   **Settings → Pages**) and push.
3. **DNS stays exactly as it is** — still GitHub's IPs. The domain
   starts serving the main site instead.
4. Turn on Enforce HTTPS in the main-site repo's Pages settings
   once it shows the domain.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Pages settings says "DNS check unsuccessful" | DNS hasn't propagated yet, or the records are wrong | Wait, then check the live records: `nslookup whenwhere.biz` should list GitHub's four IPs, and `nslookup www.whenwhere.biz` should show `enonymous1.github.io`. Fix any record that still points to Wix. |
| "Enforce HTTPS" is greyed out, or the certificate is pending | GitHub hasn't provisioned the certificate yet | Wait for the DNS to resolve to GitHub first; the certificate follows, usually within an hour. If it's stuck after a day, remove and re-add the custom domain in **Settings → Pages**. |
| `whenwhere.biz` still shows the Wix site | Cached DNS, or the old Wix A records are still there | Check the live DNS (`nslookup whenwhere.biz`). If it still lists Wix IPs, the old A records weren't replaced. If it lists GitHub's IPs, it's just cache — wait, and try a fresh browser or incognito window. |
| `www.whenwhere.biz` doesn't load | The `www` CNAME is missing or still points to Wix | Add or replace the `www` CNAME → `enonymous1.github.io`. |
| The github.io URL shows a 404 | The Pages deployment hasn't run, or the source is wrong | Check the repo's **Actions** tab for a failed run, and **Settings → Pages → Source** is "GitHub Actions". |
