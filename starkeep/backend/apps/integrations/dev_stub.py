"""
apps/integrations/dev_stub.py

A local stand-in for the archetype quiz's backend. DEBUG-only — mounted from
starkeep_project/urls.py inside the `if settings.DEBUG` block, never in prod.

WHY THIS EXISTS
---------------
The real quiz runs on Railway and its backend must call *this* server
server-to-server (step 3 of DEC-014) and then POST results back (step 6).
Neither call can reach a laptop's localhost. That normally forces you to stand
up a public tunnel before you can test anything at all.

This stub removes that dependency for day-to-day work by playing the quiz's
server role using the *real* protocol — real integration token, real HMAC over
real raw bytes, real HTTP to the real endpoints. If the round trip works here,
the only thing left to prove against the real quiz is that Emergent's side
speaks the same contract.

It is therefore also the reference implementation for the quiz repo: what
`exchange_identity()` and `post_results()` do below is exactly what their
backend has to do, minus the framework.

A NOTE ON THE SELF-CALL
-----------------------
This view issues an HTTP request back into the same Django process that is
serving it. `runserver` is threaded by default, so a second worker thread picks
up the inner request and it completes normally. If you ever run with
`--nothreading`, this deadlocks — the outer request holds the only thread while
waiting on the inner one. That is the one way Tier 1 testing can fail, and the
error below names it explicitly rather than hanging silently.
"""

import json
import urllib.error
import urllib.request
from html import escape
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.avatar.metadata import (
    CHART_PLACEMENTS,
    JUNG_ARCHETYPES,
    MBTI_TYPES,
    ZODIAC_SIGNS,
)
from apps.avatar.models import HeroicPath
from apps.common.integration_security import sign_body

SELF_CALL_TIMEOUT = 10


# ─── The two calls the real quiz backend must make ───────────────────────────

def _starkeep_base(request) -> str:
    """
    The origin the browser reached us on. Using this rather than a configured
    constant means the stub works unchanged over localhost or a tunnel.
    """
    return request.build_absolute_uri("/").rstrip("/")


def _signed_post(url: str, payload: dict) -> tuple[int, dict]:
    """
    POST `payload` with both credentials the quiz repo must present.

    The HMAC covers the exact bytes sent. Serialize once, sign those bytes, and
    send those same bytes — re-serializing between signing and sending is the
    classic way this breaks.
    """
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.QUIZ_INTEGRATION_TOKEN}",
            "X-Quiz-Signature": sign_body(body),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SELF_CALL_TIMEOUT) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read() or b"{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"errors": {"detail": raw.decode("utf-8", "replace")[:500]}}


def exchange_identity(request, ticket: str) -> tuple[int, dict]:
    """Step 3 — redeem the launch ticket for the Starkeep user's identity."""
    return _signed_post(
        f"{_starkeep_base(request)}/api/v1/integrations/quiz/exchange", {"ticket": ticket}
    )


def post_results(
    archetype_post_url: str, results: dict, breakdowns: dict, run_id: str
) -> tuple[int, dict]:
    """Step 6 — send completed quiz results back to Starkeep (contract v1.1)."""
    from django.utils import timezone

    return _signed_post(
        archetype_post_url,
        {
            "version": "1.1",
            "quiz_run_id": run_id,
            "completed_at": timezone.now().isoformat(),
            "results": results,
            "breakdowns": breakdowns,
            "raw": {"source": "dev_stub"},
        },
    )


# ─── Views ───────────────────────────────────────────────────────────────────

@require_http_methods(["GET"])
def sso_entry(request):
    """
    GET /dev/quiz-stub/sso/starkeep?ticket=&return_to=

    Stands in for the quiz's SSO landing route. Redeems the ticket server-side
    and renders the identity it resolved — seeing your own alias and email here
    is the proof that the handoff worked.
    """
    ticket = request.GET.get("ticket", "")
    return_to = request.GET.get("return_to", "")

    if not ticket:
        return _page("Missing ticket", "<p class='err'>No <code>ticket</code> query parameter.</p>")

    if not settings.QUIZ_INTEGRATION_TOKEN or not settings.QUIZ_REPO_WEBHOOK_SECRET:
        return _page(
            "Not configured",
            "<p class='err'>QUIZ_INTEGRATION_TOKEN and QUIZ_REPO_WEBHOOK_SECRET must both be "
            "set in <code>backend/.env</code>. Both verifiers fail closed while they are empty, "
            "so the exchange would reject this ticket.</p>",
        )

    try:
        status_code, body = exchange_identity(request, ticket)
    except urllib.error.URLError as exc:
        return _page(
            "Self-call failed",
            f"<p class='err'>Could not reach the exchange endpoint: {escape(str(exc))}</p>"
            "<p>If this hangs or times out, check you are not running "
            "<code>runserver --nothreading</code> — the stub calls back into this same "
            "process and needs a second worker thread.</p>",
        )

    if status_code != 200:
        detail = escape(str(body.get("errors", {}).get("detail", body)))
        return _page(
            f"Exchange failed ({status_code})",
            f"<p class='err'>{detail}</p>"
            "<p>401 = token or signature wrong · 404 = unknown ticket · "
            "410 = already used or expired (tickets are single-use and short-lived; "
            "go back to the Avatar page and click the button again).</p>",
        )

    identity = body["data"]
    return _page("Quiz stub — signed in", _identity_form(identity, return_to))


@csrf_exempt
@require_http_methods(["POST"])
def submit(request):
    """
    POST /dev/quiz-stub/submit

    Stands in for the quiz finishing: posts results to Starkeep, then redirects
    the browser back to return_to with the completion marker.
    """
    archetype_post_url = request.POST.get("archetype_post_url", "")
    return_to = request.POST.get("return_to", "")

    results = {
        "jung_archetype": request.POST.get("jung_archetype", ""),
        "mbti": request.POST.get("mbti", ""),
        "recommended_heroic_path": request.POST.get("recommended_heroic_path", ""),
        # recommended_learning_path is deliberately absent: the quiz does not
        # produce one, so the user picks their own Learning Path on the Avatar
        # page (DEC-012). Leaving it out here keeps the stub honest about that.
        "purpose_seed": request.POST.get("purpose_seed", ""),
    }
    # Every chart placement the real quiz sends (the derived IC/Descendant are
    # not among them - Starkeep computes those).
    for placement in CHART_PLACEMENTS:
        if "derived" in placement:
            continue
        results[placement["field"]] = request.POST.get(placement["field"], "")

    # Interpretive copy, mirroring results keys, as the real quiz will send it.
    breakdowns = {}
    for key, value in results.items():
        if not value:
            continue
        breakdowns[key] = {
            "title": f"{key.replace('_', ' ').title()}: {value}",
            "body": (
                f"Placeholder interpretation for {key} = {value}. The real quiz "
                "sends one to three paragraphs of plain text here, either static "
                "editorial or an interpretation generated when the user finished "
                "that chamber. No AI runs at POST time."
            ),
        }

    status_code, body = post_results(
        archetype_post_url,
        results,
        breakdowns,
        run_id=f"qr_devstub_{request.POST.get('run_nonce', '1')}",
    )

    if status_code not in (200, 201):
        detail = escape(str(body.get("errors", {}).get("detail", body)))
        return _page(
            f"Results POST failed ({status_code})",
            f"<p class='err'>{detail}</p><pre>{escape(json.dumps(results, indent=2))}</pre>",
        )

    sep = "&" if "?" in return_to else "?"
    return HttpResponseRedirect(f"{return_to}{sep}quiz=complete")


# ─── Rendering ───────────────────────────────────────────────────────────────

def _select(name, options, selected=None):
    opts = "".join(
        f"<option value='{escape(o)}'{' selected' if o == selected else ''}>{escape(o)}</option>"
        for o in options
    )
    return f"<label>{escape(name)}<select name='{escape(name)}'>{opts}</select></label>"


def _identity_form(identity, return_to):
    rows = "".join(
        f"<tr><th>{escape(k)}</th><td><code>{escape(str(v))}</code></td></tr>"
        for k, v in identity.items()
    )
    heroic = [c[0] for c in HeroicPath.choices]
    # Rotate the default sign per placement so a submitted chart is visibly
    # varied rather than twelve identical signs.
    sent = [p for p in CHART_PLACEMENTS if "derived" not in p]
    placement_selects = "".join(
        _select(p["field"], ZODIAC_SIGNS, ZODIAC_SIGNS[i % 12])
        for i, p in enumerate(sent)
    )
    return f"""
      <p class='ok'>Ticket redeemed. Starkeep released this identity over the back channel:</p>
      <table>{rows}</table>
      <p>The real quiz would now upsert a local user keyed on
         <code>starkeep_user_id</code> and start its own session. Pick results below to
         stand in for taking the quiz.</p>
      <form method='post' action='/dev/quiz-stub/submit'>
        <input type='hidden' name='archetype_post_url' value='{escape(identity["archetype_post_url"])}'>
        <input type='hidden' name='return_to' value='{escape(return_to or identity.get("return_to", "/"))}'>
        <input type='hidden' name='run_nonce' value='{escape(identity["starkeep_user_id"][:8])}'>
        <div class='grid'>
          {placement_selects}
          {_select("jung_archetype", JUNG_ARCHETYPES, "magician")}
          {_select("mbti", MBTI_TYPES, "INFP")}
          {_select("recommended_heroic_path", heroic, "dreamwalker")}
        </div>
        <p class='tag'>No recommended_learning_path: the quiz does not produce one,
           so the user chooses it on the Avatar page (DEC-012).</p>
        <label>purpose_seed<input name='purpose_seed' value='Self-Actualization Architect'></label>
        <label>visionary_trait<textarea name='visionary_trait' rows='2'>Sees the pattern before the proof arrives.</textarea></label>
        <label>divergent_trait<textarea name='divergent_trait' rows='2'>Learns by building the thing sideways first.</textarea></label>
        <button type='submit'>Finish quiz &amp; return to Starkeep</button>
      </form>
    """


def _page(title, inner):
    return HttpResponse(f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{escape(title)}</title><style>
 body{{font:14px/1.5 system-ui,sans-serif;background:#1F2A44;color:#fff;margin:0;padding:32px;}}
 main{{max-width:760px;margin:0 auto;background:#2A2A2A;padding:24px 28px;border-radius:16px;}}
 h1{{font-size:18px;letter-spacing:.08em;text-transform:uppercase;color:#A8E6FF;margin:0 0 4px;}}
 .tag{{color:#6B7280;font-size:12px;margin:0 0 20px;}}
 table{{border-collapse:collapse;width:100%;margin:12px 0 20px;}}
 th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #3A3A3A;font-weight:400;}}
 th{{color:#B0B0B0;width:190px;}}
 code{{color:#E8B14A;}} pre{{background:#1F2A44;padding:12px;border-radius:8px;overflow:auto;}}
 .grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin:16px 0;}}
 label{{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#B0B0B0;margin-bottom:10px;}}
 select,input,textarea{{background:#1F2A44;border:1px solid #3A3A3A;color:#fff;padding:7px;border-radius:6px;font:inherit;}}
 button{{background:#2D6CDF;color:#fff;border:0;padding:11px 20px;border-radius:8px;font:inherit;cursor:pointer;margin-top:8px;}}
 .ok{{color:#5CC689;}} .err{{color:#E25B5B;}}
</style></head><body><main>
<h1>{escape(title)}</h1>
<p class="tag">Local quiz stub — stands in for the Emergent-hosted quiz backend. DEBUG only.</p>
{inner}
</main></body></html>""")
