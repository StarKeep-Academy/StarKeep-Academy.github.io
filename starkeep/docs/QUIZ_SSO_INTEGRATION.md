# Starkeep ↔ Archetype Quiz — Integration Contract

> **Audience:** the team/agent building the archetype quiz app (currently hosted at
> `https://starkeepacademy-production.up.railway.app/`).
> **Contract version:** 1.1 (supersedes 1.0 — see §11 for what changed and why).
> **Status:** Starkeep's side is built, tested, and verified end to end against v1.1. Your §9
> answers are incorporated; §11 answers your six asks.
> **Authority:** `DECISIONS.md` DEC-007 (hosted quiz) and DEC-014 (SSO handoff).

---

## 1. What we are solving

Starkeep and the quiz are separate apps, on separate hosts, with separate user accounts.
Today a Starkeep user clicks "Take the archetype quiz", lands on the quiz as an anonymous
stranger, and there is no way for the quiz to send results back to the right person.

We fix that with a **one-time launch ticket, redeemed server-to-server**. Starkeep vouches for
the user; the quiz redeems that voucher from its own backend and starts its own session.

This is OAuth's authorization-code flow reduced to essentials for a single known consumer.
We deliberately do **not** put a Starkeep session token in the URL — that would hand a live,
full-scope account credential to another origin and write it into browser history, `Referer`
headers, and server logs. The ticket below is worthless to anyone who cannot also present the
shared integration secret.

---

## 2. The flow

```
 1. Browser  ─────→  Starkeep   POST /api/v1/integrations/quiz/launch      (user's JWT)
                               ← { launch_url }
 2. Browser  ─────→  Quiz       GET  /api/sso/starkeep?ticket=…&return_to=… ← YOU BUILD THIS
 3. Quiz srv ─────→  Starkeep   POST /api/v1/integrations/quiz/exchange    ← YOU BUILD THIS
                               ← { starkeep_user_id, avatar_id, email, … }   ticket dies here
 4. Quiz srv                    upsert your user on starkeep_user_id, start your session
 5.  … the user takes your quiz …
 6. Quiz srv ─────→  Starkeep   POST /api/v1/avatars/{avatar_id}/archetype ← YOU BUILD THIS
 7. Quiz     ─────→  Browser    302 to return_to + "?quiz=complete"        ← YOU BUILD THIS
 8. Browser  ─────→  Starkeep   /avatar refetches; archetype panel renders
```

Steps 1 and 8 are done. **You build steps 2, 3, 6, and 7.**

### Quick reference — exact strings

Copy these verbatim; they are the whole wire contract.

| | Value |
|---|---|
| Your SSO route | `GET /api/sso/starkeep?ticket=&return_to=` |
| Exchange endpoint | `POST {STARKEEP_API_BASE}/api/v1/integrations/quiz/exchange` |
| Results endpoint | `POST` the `archetype_post_url` from the exchange response |
| Auth header | `Authorization: Bearer <STARKEEP_INTEGRATION_TOKEN>` |
| Signature header | `X-Quiz-Signature: sha256=<hex HMAC-SHA256 of raw body>` |
| Signature key | `STARKEEP_WEBHOOK_SECRET` |
| Payload version | `"version": "1.1"` |
| Return marker | append `?quiz=complete` to `return_to` |

⚠️ The signature header is **`X-Quiz-Signature`** — named for the quiz that sends it, not for
Starkeep. `X-Starkeep-Signature` is not read and will fail closed with a 401 that looks like a key
mismatch. Both headers are required on **both** server-to-server calls; the bearer token alone is
rejected, and so is a signature alone.

---

## 3. Credentials

Two shared secrets, delivered to you **out of band** — never in this file, a repo, a ticket, or
a chat log:

| Env var | Purpose |
|---|---|
| `STARKEEP_INTEGRATION_TOKEN` | Bearer token on every server-to-server call to Starkeep |
| `STARKEEP_WEBHOOK_SECRET` | HMAC-SHA256 key for signing request bodies |
| `STARKEEP_API_BASE` | e.g. `https://api.starkeep.io` — **must be an env var**, see §7 |

(Our side calls the first two `QUIZ_INTEGRATION_TOKEN` and `QUIZ_REPO_WEBHOOK_SECRET`. Same values.)

> **Both are server-side only.** If either can be read from a browser — bundled into frontend
> JS, exposed via a public config endpoint, inlined into HTML — the whole scheme is void,
> because anyone could then write arbitrary results to any avatar.

### Signing

Every server-to-server request carries **both**:

```
Authorization:      Bearer <STARKEEP_INTEGRATION_TOKEN>
X-Quiz-Signature:   sha256=<hex HMAC-SHA256 of the raw request body, keyed with STARKEEP_WEBHOOK_SECRET>
```

> ⚠️ **The single most common way this integration breaks:** sign the *exact bytes you send*.
> Serialize your JSON once, sign that byte string, and send that same byte string. If you
> re-serialize between signing and sending (different key order, different whitespace, a
> framework re-encoding the body), the signature will not reproduce on our side and you will
> get a 401. Do not sign a re-parsed or pretty-printed version.

Python reference (this is our actual implementation, `apps/common/integration_security.py`):

```python
import hashlib, hmac, json, requests

body = json.dumps(payload).encode("utf-8")          # serialize ONCE
sig  = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()

requests.post(url, data=body, headers={             # send THOSE bytes
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}",
    "X-Quiz-Signature": sig,
})
```

Node reference:

```js
const body = JSON.stringify(payload);               // serialize ONCE
const sig  = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");

await fetch(url, { method: "POST", body, headers: {  // send THOSE bytes
    "Content-Type": "application/json",
    "Authorization": `Bearer ${TOKEN}`,
    "X-Quiz-Signature": sig,
}});
```

---

## 4. Step 2 — your SSO landing route

**`GET /api/sso/starkeep?ticket=…&return_to=…`** — your preferred path, confirmed. Your
SPA-catch-all rationale is sound and it cost us one env var (`QUIZ_SSO_LAUNCH_PATH`), exactly as
§4 anticipated. Nothing further needed here.

You receive:

| Query param | Example | Notes |
|---|---|---|
| `ticket` | `CTp0IY3DqX5dqqJJ…` | Opaque, 43 chars, **single-use, expires in 120 seconds** |
| `return_to` | `https://starkeep.io/avatar` | Absolute URL, built by us. Send the user back here when done. |

Do not try to parse the ticket — it carries no information, it is a random lookup key.

## 5. Step 3 — redeem the ticket

```http
POST {STARKEEP_API_BASE}/api/v1/integrations/quiz/exchange
Authorization: Bearer <STARKEEP_INTEGRATION_TOKEN>
X-Quiz-Signature: sha256=<hmac of body>
Content-Type: application/json

{ "ticket": "CTp0IY3DqX5dqqJJ…" }
```

**200 response:**

```json
{
  "data": {
    "starkeep_user_id":   "6838a0ed-1aa7-4569-b90a-d238fae7620a",
    "avatar_id":          "97b1769e-bb8a-4095-9670-e25d6d8b8805",
    "email":              "user@example.com",
    "alias":              "DREAMWALKER",
    "display_name":       "Ryan Boyd",
    "level":              7,
    "has_archetype":      false,
    "issued_at":          "2026-08-23T19:14:02.117Z",
    "archetype_post_url": "https://api.starkeep.io/api/v1/avatars/97b1769e-…/archetype",
    "return_to":          "https://starkeep.io/avatar"
  },
  "errors": null
}
```

| Status | Meaning | What to do |
|---|---|---|
| 200 | Ticket redeemed | Proceed — the ticket is now dead |
| 401 | Bad token or bad signature | Check §3. Don't retry blindly. |
| 404 | Unknown ticket | Wrong value, or wrong environment |
| 400 | Malformed JSON | — |
| 410 | Already used, or older than 120s | Send the user back to Starkeep to start again |

**Errors use `{"data": null, "errors": {"title","status","detail",…}}`** — `detail` is written to
be read by a human debugging this, so log it.

### Step 4 — your side of the session

Your `UserProfile` design and three-branch linking logic (match `starkeep_user_id` → match email →
create) are exactly right. No notes.

`archetype_post_url` is handed to you fully formed on purpose, so results can never be posted
against the wrong avatar.

⚠️ **Do not persist it on `UserProfile`.** It is a per-session convenience, not a durable
identifier: we build it from our own public base URL, which during tunnel testing is a Cloudflare
quick-tunnel hostname that **changes every time the tunnel restarts**. A URL persisted on the user
row will silently point at a dead host on the next test run, and later at a dead host in
production.

Persist **`starkeep_avatar_id`** — that UUID is stable forever — and build the URL at POST time:

```python
url = f"{STARKEEP_API_BASE}/api/v1/avatars/{profile.starkeep_avatar_id}/archetype"
```

Then repointing `STARKEEP_API_BASE` is the only change any environment move needs. Keeping
`archetype_post_url` on the *session* for an immediate post is fine; keeping it on the *user* is
the part that goes stale.

## 6. Step 6 — post the results

```http
POST {archetype_post_url}
Authorization: Bearer <STARKEEP_INTEGRATION_TOKEN>
X-Quiz-Signature: sha256=<hmac of body>
Content-Type: application/json
```

```json
{
  "version": "1.1",
  "quiz_run_id": "qr_abc123",
  "completed_at": "2026-08-23T14:23:00Z",
  "results": {
    "sun_sign": "aries", "moon_sign": "cancer", "rising_sign": "capricorn",
    "mercury_sign": "gemini", "venus_sign": "taurus", "mars_sign": "leo",
    "jupiter_sign": "sagittarius", "saturn_sign": "aquarius",
    "uranus_sign": "scorpio", "neptune_sign": "sagittarius",
    "pluto_sign": "libra", "midheaven_sign": "libra",
    "jung_archetype": "hermit",
    "mbti": "INFP",
    "recommended_heroic_path": "dreamwalker",
    "purpose_seed": "Self-Actualization Architect"
  },
  "breakdowns": {
    "sun_sign": { "title": "Sun in Aries", "body": "…plain text…" },
    "mbti":     { "title": "INFP — The Mediator", "body": "…" }
  },
  "raw": { "your unabridged output, stored verbatim, shape is yours" }
}
```

**Every field in `results` is optional.** A quiz that produces only some of them is a valid
caller; absent fields simply don't overwrite what we hold.

### Accepted values

Values are **case-insensitive** — we normalize. But they must be from these sets, or the request
is rejected with a 400 naming the offending field.

| Field | Accepted values |
|---|---|
| The twelve `*_sign` fields below | `aries` `taurus` `gemini` `cancer` `leo` `virgo` `libra` `scorpio` `sagittarius` `capricorn` `aquarius` `pisces` |
| `jung_archetype` | `innocent` `everyman` `hero` `caregiver` `explorer` `rebel` `lover` `creator` `jester` `hermit` `magician` `ruler` — plus deprecated `sage`→`hermit` and `outlaw`→`rebel`, folded on ingest |
| `mbti` | the 16 standard types, e.g. `INFP` |
| `recommended_heroic_path` | `earthwatcher` `peacebringer` `storyteller` `innovator` `dreamwalker` `truthseeker` |
| `recommended_learning_path` | `scholar` `wayfinder` `specialist` `divergent` `generalist` `mystic` — **but see §11.3: do not send this** |
| `purpose_seed` | free text, ≤500 chars |

### The twelve chart placements

Accepted and stored, exactly as you proposed:

`sun_sign` `moon_sign` `rising_sign` `mercury_sign` `venus_sign` `mars_sign` `jupiter_sign`
`saturn_sign` `uranus_sign` `neptune_sign` `pluto_sign` `midheaven_sign`

These twelve are the whole contract. **Do not send `ic_sign`, `descendant_sign`, or any other
placement** — they are not accepted and will 400. (Both of those are trivially derivable from the
Midheaven and Ascendant, but nothing in the Avatar design renders them, so they are not part of the
schema.)

We are **not** taking `longitude` / `house` for now. Nothing in the current Avatar design renders
degrees. If that changes we'll ask, and it's additive.

### The `breakdowns` object

Accepted. **Plain text, please** — not markdown, not HTML.

The reason is concrete rather than stylistic: `frontend-web` is vanilla JS with no bundler and no
markdown library, and this is third-party content rendered on a Starkeep page. Plain text goes
straight through `textContent` with no HTML generated and therefore no injection surface. We split
on blank lines to make paragraphs, so **use `\n\n` between paragraphs** and that will render as you
intend.

Shape is exactly as you proposed — keys mirror `results` keys, each entry `{title, body}`:

| Rule | Limit |
|---|---|
| Entries per payload | 32 max |
| `title` | 200 chars max |
| `body` | 12,000 chars max (~4× your stated 500-word ceiling) |
| Unknown key | **400, naming the key** — not silently dropped, so a typo surfaces as your bug rather than looking like ours |
| Entry with an empty `body` | Dropped silently; harmless |

The whole object is optional.

**Responses:** `201` first time, `200` on update, `400` validation failure (read `errors.detail`),
`401` auth/signature, `404` unknown avatar.

**Retries are safe.** Reposting the same `quiz_run_id` returns `200` with the stored profile and
changes nothing. Using your `session_id` as `quiz_run_id` is exactly right.

### Step 7 — send the user home

Redirect the browser to the `return_to` you were given, appending `quiz=complete`:

```
302 https://starkeep.io/avatar?quiz=complete
```

Starkeep reads that marker, refetches, and renders the archetype panel. Post results **before**
redirecting where you can; if results arrive slightly late we retry once automatically, but the
user sees a brief "syncing" state.

## 7. Testing before Starkeep is deployed

Starkeep currently runs on a laptop at `localhost:8000`, which your Railway backend cannot
reach. To do a real end-to-end test we expose it over HTTPS with a tunnel:

```
cloudflared tunnel --url http://localhost:8000
# → https://<random-words>.trycloudflare.com
```

**The hostname changes every time the tunnel restarts.** This is exactly why `STARKEEP_API_BASE`
must be an environment variable on your side that you can repoint in seconds — please do not
hardcode our host anywhere. Our own client resolves the API same-origin, so it needs no change when
the hostname moves.

We will send you the current tunnel URL when we're ready to test together, and separately a
stable production URL later.

---

## 8. Reference implementation

`backend/apps/integrations/dev_stub.py` in the Starkeep repo is a working implementation of
**your** side of steps 2, 3, 6, and 7 — it stands in for your backend so we could verify our half
end to end before your side existed. It is the same code that produced every passing result quoted
in §12.

**§13 below is that code, extracted and de-Django'd for you to drop straight in.** Standard library
only, ~110 lines including the commentary.

---

## 9. Open questions — all answered

Your responses to §9 are accepted as written. Q1, Q3, Q4, Q5, Q6 and Q9 need nothing further:
your `UserProfile` design, session-cookie flow, link-don't-error collision policy, Railway
service-level env vars, and `python-decouple` config pattern are all exactly what this needs.
Q2, Q7 and Q8 are resolved in §11 below.

No staging service needed on your side for now — the tunnel path in §7 is fine, and we'll ask if
that changes.

## 10. Security properties (for review)

- Launch tickets are 43 chars from a CSPRNG, single-use, and expire in 120 seconds. Redemption is
  a single atomic SQL `UPDATE`, so two concurrent redemptions cannot both succeed.
- Minting a new ticket retires the user's previous unconsumed one.
- `return_to` is validated as a **site-relative path** and made absolute by us — absolute URLs,
  protocol-relative `//evil.com`, backslash variants, and header-splitting characters are all
  rejected, so the launch endpoint cannot be turned into an open redirect.
- Both credential checks use constant-time comparison, and **fail closed** when unconfigured.
- The bearer token alone is not enough — every call needs a valid body signature too.
- Results are schema-validated before write, so a bad path slug is a 400 rather than a corrupted
  profile. `breakdowns` is size-capped and rendered via `textContent`, never `innerHTML`.

**Known limitation, accepted for v1:** there is a single shared credential pair for one known
consumer, with no per-caller identity, rotation, or revocation. Anyone holding the token can post
results for any `avatar_id`. This is acceptable while the quiz is the only integration and the
data is non-financial; if a second consumer appears, this should become real OAuth (the flow shape
above is deliberately compatible with that upgrade).

---

## 11. Decisions on your six asks

### 11.1 — Dropping `visionary_trait` / `divergent_trait`: **confirmed, you were right**

We checked against the UI before agreeing. `AvatarView.js` renders `visionary_trait` directly
beneath the Heroic Path title and `divergent_trait` beneath the Learning Path title — precisely the
relationship you described. They were never independent outputs.

Both are **removed from the contract**. The columns still exist and are still accepted if sent, so
nothing breaks, but nothing expects them and you should not populate them.

We're taking your recommendation on ownership too: Starkeep supplies the short trait line from its
own lookup keyed on the path slug, and renders your `breakdowns.recommended_heroic_path.body` as
the long form when present. Your copy stays yours, our UI voice stays ours.

### 11.2 — Nine new placements and the `breakdowns` object: **both accepted**

Implemented and tested end to end. All twelve sign fields are stored and served as an ordered,
glyph-annotated `chart` array. `breakdowns` is stored in a single JSONB column and rendered as cards.

Worth knowing why this landed so easily: the Avatar page already had a birth-chart glyph grid
sitting there as inert "coming soon" placeholders. Your nine fields complete it — the grid is now
exactly the twelve placements you compute (`☉ ☽ ASC ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ MC`), every one carrying real
data. Placeholders with no source behind them (North Node, IC, Descendant) are gone rather than
left dead.

We asked whether you could also produce the North Node; the answer is no, so that glyph is retired.
No action needed.

### 11.3 — `recommended_learning_path`: **neither A nor B — omit the field**

Please do **not** build either option. Leave `recommended_learning_path` out of the payload
entirely. This is zero work for you and removes the one genuine gap from your critical path.

Reasoning: the six Learning Paths describe how a student *structures their education* — Scholar,
Wayfinder, Specialist, Divergent, Generalist, Mystic. Option A would derive that from MBTI × Jung,
which measures something else entirely; the mapping would be invented rather than evidenced. And
DEC-012 has the user explicitly confirm this choice on the Avatar page, which reads badly if the
value was quietly inferred from a personality type.

Option B is a genuinely good idea and we may come back to it. But it costs you a day for a value
the user can simply pick, so it shouldn't gate this integration.

Starkeep now prompts for it directly: when the Learning Path is unset, the Avatar page shows
"Not set yet — choose how you learn and grow" and opens the picker. If you later add the chamber,
send the field and our existing DEC-012 pre-fill will use it automatically — no contract change.

### 11.4 — Secrets: sent separately

`STARKEEP_INTEGRATION_TOKEN`, `STARKEEP_WEBHOOK_SECRET`, and the current tunnel URL for
`STARKEEP_API_BASE` come to you out of band, not in this document or any repo.

### 11.5 — Slug updates: **`hermit` confirmed**; `rebel` confirmed

`rebel` is unchanged — send `rebel`.

`hermit` is accepted as the **canonical** slug, and your reasoning was correct. Our first read of
this was that `sage` collided with nothing, since none of the six current heroic paths is called
Sage — but Truthseeker *was* called Sage earlier in this project, so `sage` is a retired path name
in our history exactly as you said. Reusing it for an archetype would blur the two taxonomies, and
would blur them again on any future path rename. That last point is why we're going further than
you asked:

**`hermit` is now the only value stored for this archetype.** `sage` is accepted on the wire as a
deprecated alias and folded to `hermit` before it is written, so a legacy caller never breaks but
the database only ever holds one name for the concept. Same treatment for `outlaw` → `rebel`, since
you mentioned that was your old display name — you don't need to coordinate that rename with us.

Send `hermit` and `rebel`. Anything older still works.

### 11.6 — `breakdowns` body format: **plain text**

See §6. Use `\n\n` between paragraphs. Not markdown, not HTML — the reasoning is in that section.

---

## 12. Where this leaves us

**Done on our side and verified end to end:** contract v1.1 — twelve chart placements, derived
IC/Descendant, `breakdowns` storage and rendering, `hermit`, case-insensitive values, trait fields
retired, learning-path prompt, and the `/api/sso/starkeep` path change. 44 backend tests pass.

We also fixed a bug that your payload would have tripped on the first real call: `purpose_seed`
validated at 500 characters but its database column was 200, so anything in between passed
validation and then failed on write. Your stated 500-char truncation would have hit it immediately.

**Your build order stands**, minus step 7 — `recommended_learning_path` is off the list per §11.3.
That should take option A's ~1 day down further, since the mapping layer no longer needs it.

**Nothing is outstanding on the contract.** Every question in both directions is resolved, so you
are unblocked to build steps 2, 3, 6 and 7 against §4-6.

**What we need from you next:** tell us when you're ready for a live Tier 2 test, so we can bring up
the tunnel and send you the `STARKEEP_API_BASE` value for it. The two shared secrets come to you
separately, ahead of that.

---

## 13. Appendix — reference client (`starkeep_client.py`)

Ported from our `dev_stub.py`. Read the three env vars from your config layer
(`python-decouple` is fine); the two secrets must never reach a browser bundle.

```python
"""
starkeep_client.py — reference implementation of the two calls the quiz repo
must make to Starkeep (contract v1.1, DEC-014).

Ported from Starkeep's own `apps/integrations/dev_stub.py`, which is the stub we
used to verify our half end to end before your side existed. Standard library
only — swap urllib for requests/httpx if you prefer.

Read STARKEEP_INTEGRATION_TOKEN, STARKEEP_WEBHOOK_SECRET and STARKEEP_API_BASE
from your environment (python-decouple is fine). Never let the first two reach
a browser bundle.
"""

import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

API_BASE = os.environ["STARKEEP_API_BASE"].rstrip("/")
TOKEN = os.environ["STARKEEP_INTEGRATION_TOKEN"]
SECRET = os.environ["STARKEEP_WEBHOOK_SECRET"]

TIMEOUT = 10


def sign_body(body: bytes) -> str:
    """
    The X-Quiz-Signature value for `body`.

    Signing covers the raw bytes exactly as transmitted, NOT a re-serialized
    parse of them. Serialize once, sign those bytes, send those same bytes.
    Re-encoding between signing and sending (different key order, different
    whitespace, a framework re-serializing the body) is the single most common
    way this integration fails, and it presents as a 401.
    """
    return "sha256=" + hmac.new(SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _signed_post(url: str, payload: dict) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")          # serialize ONCE
    req = urllib.request.Request(
        url,
        data=body,                                      # send THOSE bytes
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
            "X-Quiz-Signature": sign_body(body),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read() or b"{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"errors": {"detail": raw.decode("utf-8", "replace")[:500]}}


# ─── Step 3: redeem the launch ticket ────────────────────────────────────────

def exchange_identity(ticket: str) -> tuple[int, dict]:
    """
    Call this from your GET /api/sso/starkeep handler, server-side, immediately.

    The ticket is an opaque 43-char lookup key carrying no data. It is
    single-use and expires 120 seconds after Starkeep minted it, so do not pass
    it to your SPA or hold it for later.

    200 -> {"data": {starkeep_user_id, avatar_id, email, alias, display_name,
                     level, has_archetype, issued_at, archetype_post_url,
                     return_to}, "errors": null}
    401 -> bad token or bad signature      404 -> unknown ticket
    410 -> already redeemed, or expired    400 -> malformed JSON

    On non-200, log errors.detail — it is written for whoever is debugging this.
    """
    return _signed_post(f"{API_BASE}/api/v1/integrations/quiz/exchange", {"ticket": ticket})


# ─── Step 6: post the completed results ──────────────────────────────────────

def post_results(archetype_post_url: str, results: dict, breakdowns: dict,
                 quiz_run_id: str) -> tuple[int, dict]:
    """
    Call this when all chambers are done, BEFORE the 302 back to return_to.

    `archetype_post_url` comes from the exchange response. Fine to keep for an
    immediate post; do NOT persist it on the user row — it embeds our public
    base URL, which moves whenever the test tunnel restarts. Persist
    starkeep_avatar_id and rebuild the URL from STARKEEP_API_BASE instead.

    `quiz_run_id`: your session_id is ideal. Reposting the same run_id returns
    200 and changes nothing, so retrying a delivery you never saw succeed is
    safe. Use a fresh id per genuine completion.

    201 -> created   200 -> updated, or an idempotent replay
    400 -> validation failure; errors.detail names the offending field
    """
    return _signed_post(
        archetype_post_url,
        {
            "version": "1.1",
            "quiz_run_id": quiz_run_id,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "results": results,        # the 12 *_sign slugs + jung/mbti/heroic/purpose
            "breakdowns": breakdowns,  # {results_key: {"title": ..., "body": ...}}, plain text
            "raw": {},                 # your unabridged output, stored verbatim
        },
    )
```
