# Security review — 2026-08-17

## Scope

Static customer preview (`index.html`, `styles.css`, `script.js`, legal pages) and the existing Node.js project dependencies.

## Results

- `pnpm audit --prod`: **No known vulnerabilities found**.
- Node.js syntax checks passed for `script.js` and `server.js`.
- Existing automated suite: **8/8 tests passed**.
- Repository secret-pattern scan found no committed Telegram token, private key or common API-key pattern. Example placeholders in `.env.example` and `README.md` are expected.
- Browser verification at desktop and mobile widths produced no console errors.
- Static preview does not contain a form, does not call `fetch`, does not use cookies/localStorage and cannot connect to an API because `connect-src 'none'` is set in its Content Security Policy.
- External fonts, trackers, CDN assets and third-party scripts were removed from the preview.
- The Pages workflow uploads only the five static preview files rather than the backend repository.

## Snyk status

The official Snyk CLI wrapper was invoked, but its Windows binary download from `downloads.snyk.io` did not complete in this environment and was stopped after repeated timeouts. A completed Snyk result must not be claimed from this attempt. Snyk also requires an authenticated Snyk account before project scans.

To complete the requested Snyk Open Source and Snyk Code scans later:

1. Install the official Snyk CLI.
2. Run `snyk auth` and approve OAuth in the owner's Snyk account.
3. Run `snyk test --all-projects --severity-threshold=low`.
4. Enable Snyk Code in the organization and run `snyk code test --severity-threshold=low`.
5. Export the reports and store no Snyk token in Git.

## Important remaining actions before Beget production

- Revoke and replace the Telegram bot token that was previously pasted into chat, even though it is not committed to the repository.
- Add server-side rate limiting, upload malware/type validation and Russian-hosted primary storage before re-enabling the lead form.
- Configure HTTP security headers at Beget/Nginx level; meta CSP is useful for the static preview but is not a replacement for response headers.
- Keep `.env`, uploads, database dumps, logs and manager lists outside the public web root.
- Restrict database and Telegram bot credentials to the backend process and use a separate least-privilege database account.
