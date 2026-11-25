# Security publishing blockers

- [x] Restrict bot agent reads without changing automated posting access.
- [x] Restrict bot posting history reads without changing automated posting access.
- [x] Run database access regression checks and clear the two verified findings.

# Remaining English highlight review

- [x] Review and safely correct every remaining English clue highlight.
- [x] Preserve corrections in a durable review ledger and validate highlights and whole sentences.
- [x] Verify corrected clues in the reader.

# First-load bundle handoff

- [x] Defer account tools, social demo data, and toasts from the first load.
- [x] Keep error validation server-only and inspect other root validation imports.
- [x] Run all 2,281 tests and verify public playback, member profile, admin access, and signed-in bearer requests.
- [x] Request publishing and write the live re-measurement handoff.
- [ ] Confirm the new production entry meets 165 KB gzip and run the deeper deck fingerprint check; waiting for published output (the live check still served the previous entry).
- [ ] Complete a real Google OAuth round trip on the published site; requires an account holder's Google sign-in.