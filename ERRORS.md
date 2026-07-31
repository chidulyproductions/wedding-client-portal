# ERRORS.md — Wedding Music Site

Logged failures + fixes. Check here before diagnosing a similar symptom.

## Can't log into admin/client portal — "Failed to fetch" on Sign In
**What didn't work / red herrings:** Assuming it was a frontend or GitHub Pages problem. It isn't — the static site loads fine; only the login fetch fails.
**Root cause:** Supabase free-tier project (ref `lfnlftxqdelcrmbceiob`) **auto-paused after ~7 days of inactivity**. When paused, its API subdomain returns **NXDOMAIN** (does not resolve) — not a "paused" HTTP page. So the browser shows "Failed to fetch" and the shell shows `curl` HTTP 000 / `nslookup` NXDOMAIN, while every other domain resolves normally.
**Diagnostic signature (fast confirm):**
- `nslookup lfnlftxqdelcrmbceiob.supabase.co` → NXDOMAIN  ⇒ project is paused/unreachable.
- After restore: subdomain resolves (Cloudflare IPs) and `curl .../auth/v1/health` → HTTP 401 (alive).
**What worked:** Chris logs into https://supabase.com/dashboard → Wedding Music Site project → **Restore**. Back within minutes. (Claude cannot do this — account login.)
**Note for next time:** A keep-alive GitHub Action now pings the REST API every 3 days (`.github/workflows/keepalive.yml`, merged in #23), so this should not recur. If it does, check the Actions tab first — a failing keep-alive run is the early warning. If the project is *not listed* in the dashboard (vs. just paused), STOP — that's deletion/data-recovery, not a simple restore.

## Wedding crate build drops tracks silently
**What didn't work:**
1. Trusting the crate track counts without reconciling against the playlist. Guest Seating built at 16/24 and Dance Floor at 52/58, and the shortfall looked like "tracks Chris doesn't own" when it was actually two bugs.
2. Re-running the builder to pick up newly sourced tracks — this made it *worse* (Guest Seating went 21 → 19), because sourcing detects downloads via a before/after directory diff and a file that already exists produces no new entry.
3. Repairing a crate by scanning the library for filenames resembling each playlist title. This attached a second file to tracks that were already matched and inflated Dance Floor to **94 paths for 65 tracks**. Loose-name reconciliation is never valid.

**What worked:** Two fixes in `_chiduly-tools/build_playlist_crate_reference.py` (branch `fix/crate-builder-sourcing-gaps`):
- Feed **artist-gated rejections** into the sourcing queue. When a playlist wants a cover (BAWK "Blinding Lights", Chloe Welch "Titanium") and the library holds only the original by a different artist, the gate refuses the substitution but a title match exists — so the track was classified neither matched nor missing and vanished.
- Resolve files **already on disk** by exact normalized `artists - title` before downloading. Serato hasn't ingested fresh downloads into `database V2`, so the matcher can't see them and the dir-diff finds nothing.

Result: Guest Seating 24/24, Cocktail Hour 21/21, Dance Floor 63/65.

**Note for next time:** Always reconcile crate track count against the source playlist count and account for every difference before moving crates into `Subcrates/`. Stage to `~/Downloads/` first, back up `Subcrates/` before any move, and confirm Serato is quit.

## Wrong song in a crate — a Christmas duet in wedding cocktail hour
**What didn't work:** Assuming a relaxed-tier substitution was "close enough" and not auditing what each match was actually based on. The crate looked complete (21/21) while containing the wrong song and missing the right one.

**Root cause — two bugs compounding:**
1. **Tier-3 accepted function-word-only overlaps.** Spotify's "Stuck with U (with Justin Bieber)" matched library "All I Want For Christmas Is You (SuperFestive!) Duet with Mariah Carey" on `{with, you}` alone — 2 of Spotify's 3 tokens = 67%, clearing the 50% gate. The artist gate scored 95 because Bieber genuinely is on both, so a **true artist match rescued a false title match**.
2. **Ranking ignored match tier.** Candidates sorted by play count only, so the Christmas song (2 plays) beat the correct "Stuck with U" (0 plays) — which was in the library the entire time.

Same audit found Martin Garrix "Wherever You Are" and John Summit "Where You Are" cross-assigned to each other on `{are, you}`.

**What worked:** `_WEAK_TOKENS` gating tier-3 only (NOT added to `_STOPWORDS` — that would loosen the tier-2 subset test), plus sort key `(tier, -playcount, -artist_score, simplicity)`. Commit `fc97e5d` in the `00_Serato Stuff` repo.

**Note for next time:** After any crate build, audit for matches whose token overlap is entirely function words — that pattern is the signature. A high play count is not evidence of correctness; here it was actively *causing* the wrong pick. Also: `john summit I got this feeling.mp3` has a correct ID3 tag but a misleading filename — verify matches by tag, not filename, or you will report a correct match as missing.

## Custom moments exported as the literal string "Custom Moment"
**Root cause:** The client page builds a custom-moment id as `'custom-' + Date.now()`, then stores the definition row as `'custom-def-' + id` → `custom-def-custom-<ts>`. `selectExportSections` re-added the prefix, producing `custom-custom-<ts>`, which never matched the song row `custom-<ts>`.
**Why it escaped tests:** the existing test used `custom-def-1` → `custom-1`, a shape the app never generates.
**What worked:** slice off `custom-def-` and only re-add the prefix if it isn't already there. PR #26, deployed.
**Note for next time:** when a test passes but production is broken, check whether the fixture matches what the app actually writes — query Supabase for a real row rather than inventing one.

## spotdl "YT-DLP download error" — sometimes transient, sometimes terminal
**What didn't work:** Treating the first failure as final. The Stringspace bride-walk track failed once and succeeded on a plain retry with no changes.
**What worked:** Retry before reporting failure. But cap it — ISOxo "FUCK THE SPEAKERZ UP" failed 4 spotdl attempts on the same YouTube Music video ID, then 3 alternate YouTube uploads (one age-gated needing cookies, two blocked by YouTube's SABR streaming). That one is genuinely unavailable and needs a **DMS Wishlist** add.
**Note for next time:** Retry once or twice. If every attempt fails on the *same* source ID, it's terminal — fall through the source chain rather than looping. Never keep a sub-320 YouTube file to close the gap.
