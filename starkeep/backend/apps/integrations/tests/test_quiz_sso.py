"""
apps/integrations/tests/test_quiz_sso.py

DEC-014 — the quiz SSO handoff, plus the archetype webhook's ingest rules.

These lean on the security properties rather than the happy path, because the
happy path is what the dev stub exercises by hand and the failure modes are
what nobody clicks through.
"""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.avatar.metadata import CHART_SIGN_FIELDS
from apps.avatar.models import ArchetypeProfile
from apps.common.integration_security import sign_body
from apps.integrations.models import QuizLaunchTicket

TOKEN = "test-integration-token"
SECRET = "test-webhook-secret"

integration_settings = override_settings(
    QUIZ_INTEGRATION_TOKEN=TOKEN,
    QUIZ_REPO_WEBHOOK_SECRET=SECRET,
    QUIZ_REPO_BASE_URL="https://quiz.example.com",
    QUIZ_SSO_LAUNCH_PATH="/sso/starkeep",
    STARKEEP_PUBLIC_BASE_URL="https://starkeep.example.com",
    QUIZ_LAUNCH_TICKET_TTL_SECONDS=120,
)


def signed_post(client, url, payload):
    """Send a payload the way the quiz repo must: same bytes signed and sent."""
    body = json.dumps(payload).encode("utf-8")
    return client.post(
        url,
        data=body,
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
        HTTP_X_QUIZ_SIGNATURE=sign_body(body),
    )


@integration_settings
class QuizLaunchTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="a@example.com", password="pw123456!")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_launch_returns_url_pointing_at_the_quiz(self):
        r = self.client.post("/api/v1/integrations/quiz/launch", {"return_to": "/avatar"})
        self.assertEqual(r.status_code, 201, r.data)
        url = r.data["data"]["launch_url"]
        self.assertTrue(url.startswith("https://quiz.example.com/sso/starkeep?"), url)
        # return_to is made absolute against OUR public base, not the caller's input.
        self.assertIn("return_to=https%3A%2F%2Fstarkeep.example.com%2Favatar", url)
        self.assertEqual(QuizLaunchTicket.objects.filter(user=self.user).count(), 1)

    def test_launch_requires_authentication(self):
        self.assertEqual(APIClient().post("/api/v1/integrations/quiz/launch").status_code, 401)

    def test_return_to_rejects_absolute_and_protocol_relative_urls(self):
        for bad in [
            "https://evil.com/steal",       # absolute
            "//evil.com",                   # protocol-relative
            "/\\evil.com",                  # backslash variant browsers also follow
            "avatar",                       # not rooted
            "/avatar\r\nX-Injected: 1",     # header splitting
        ]:
            r = self.client.post("/api/v1/integrations/quiz/launch", {"return_to": bad})
            self.assertEqual(r.status_code, 400, f"{bad!r} should be rejected, got {r.status_code}")

    def test_launching_again_retires_the_previous_unconsumed_ticket(self):
        first = self.client.post("/api/v1/integrations/quiz/launch").data["data"]["launch_url"]
        first_ticket = first.split("ticket=")[1].split("&")[0]
        self.client.post("/api/v1/integrations/quiz/launch")

        r = signed_post(APIClient(), "/api/v1/integrations/quiz/exchange", {"ticket": first_ticket})
        self.assertEqual(r.status_code, 410, "a superseded ticket must no longer be redeemable")


@integration_settings
class QuizExchangeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="b@example.com", password="pw123456!")
        self.avatar = self.user.avatar  # auto-created by the avatar signal
        self.avatar.alias = "DREAMWALKER"
        self.avatar.save()
        self.client = APIClient()
        self.ticket = QuizLaunchTicket.objects.create(
            user=self.user,
            avatar=self.avatar,
            return_to="/avatar",
            expires_at=timezone.now() + timedelta(seconds=120),
        )

    def exchange(self, ticket=None):
        return signed_post(
            self.client, "/api/v1/integrations/quiz/exchange", {"ticket": ticket or self.ticket.ticket}
        )

    def test_exchange_releases_identity(self):
        r = self.exchange()
        self.assertEqual(r.status_code, 200, r.data)
        data = r.data["data"]
        self.assertEqual(data["starkeep_user_id"], str(self.user.id))
        self.assertEqual(data["avatar_id"], str(self.avatar.id))
        self.assertEqual(data["email"], "b@example.com")
        self.assertEqual(data["alias"], "DREAMWALKER")
        self.assertFalse(data["has_archetype"])
        self.assertEqual(
            data["archetype_post_url"],
            f"https://starkeep.example.com/api/v1/avatars/{self.avatar.id}/archetype",
        )

    def test_ticket_is_single_use(self):
        self.assertEqual(self.exchange().status_code, 200)
        r = self.exchange()
        self.assertEqual(r.status_code, 410)
        self.assertIn("single-use", r.data["errors"]["detail"])

    def test_expired_ticket_is_gone(self):
        QuizLaunchTicket.objects.filter(pk=self.ticket.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self.exchange().status_code, 410)

    def test_unknown_ticket_is_404(self):
        self.assertEqual(self.exchange(ticket="nope-not-a-real-ticket").status_code, 404)

    def test_wrong_integration_token_is_rejected(self):
        body = json.dumps({"ticket": self.ticket.ticket}).encode()
        r = self.client.post(
            "/api/v1/integrations/quiz/exchange",
            data=body,
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer wrong-token",
            HTTP_X_QUIZ_SIGNATURE=sign_body(body),
        )
        self.assertEqual(r.status_code, 401)

    def test_tampered_body_fails_hmac(self):
        """Signature covers the bytes sent — swapping the body after signing must fail."""
        signed = json.dumps({"ticket": self.ticket.ticket}).encode()
        tampered = json.dumps({"ticket": "someone-elses-ticket"}).encode()
        r = self.client.post(
            "/api/v1/integrations/quiz/exchange",
            data=tampered,
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
            HTTP_X_QUIZ_SIGNATURE=sign_body(signed),
        )
        self.assertEqual(r.status_code, 401)
        self.assertIn("HMAC", r.data["errors"]["detail"])

    def test_missing_signature_is_rejected(self):
        r = self.client.post(
            "/api/v1/integrations/quiz/exchange",
            data=json.dumps({"ticket": self.ticket.ticket}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
        )
        self.assertEqual(r.status_code, 401)

    @override_settings(QUIZ_INTEGRATION_TOKEN="", QUIZ_REPO_WEBHOOK_SECRET="")
    def test_unconfigured_deployment_fails_closed(self):
        """An empty secret must reject everything, never accept everything."""
        r = self.client.post(
            "/api/v1/integrations/quiz/exchange",
            data=json.dumps({"ticket": self.ticket.ticket}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer ",
        )
        self.assertEqual(r.status_code, 401)


@integration_settings
class ArchetypeIngestTests(TestCase):
    """The results webhook — validation, DEC-012 pre-fill, and replay handling."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(email="c@example.com", password="pw123456!")
        self.avatar = self.user.avatar
        self.client = APIClient()
        self.url = f"/api/v1/avatars/{self.avatar.id}/archetype"

    def payload(self, **overrides):
        results = {
            "sun_sign": "aries",
            "moon_sign": "cancer",
            "rising_sign": "capricorn",
            "mercury_sign": "gemini",
            "venus_sign": "taurus",
            "mars_sign": "leo",
            "jupiter_sign": "sagittarius",
            "saturn_sign": "aquarius",
            "uranus_sign": "scorpio",
            "neptune_sign": "sagittarius",
            "pluto_sign": "libra",
            "midheaven_sign": "libra",
            "jung_archetype": "magician",
            "mbti": "INFP",
            "recommended_heroic_path": "dreamwalker",
            "recommended_learning_path": "divergent",
            "purpose_seed": "Self-Actualization Architect",
        }
        results.update(overrides.pop("results", {}))
        base = {
            "version": "1.1",
            "quiz_run_id": "qr_abc123",
            "completed_at": "2026-04-25T14:23:00Z",
            "results": results,
            "raw": {"answers": [1, 2, 3]},
        }
        base.update(overrides)
        return base

    def test_full_ingest_populates_profile_and_prefills_paths(self):
        r = signed_post(self.client, self.url, self.payload())
        self.assertEqual(r.status_code, 201, r.data)

        profile = ArchetypeProfile.objects.get(avatar=self.avatar)
        # raw_quiz_output holds the quiz's own output, not our envelope (§7).
        self.assertEqual(profile.raw_quiz_output, {"answers": [1, 2, 3]})

        self.avatar.refresh_from_db()
        self.assertEqual(self.avatar.heroic_path, "dreamwalker")     # DEC-012
        self.assertEqual(self.avatar.learning_path, "divergent")

    def test_all_twelve_chart_placements_are_stored(self):
        signed_post(self.client, self.url, self.payload())
        profile = ArchetypeProfile.objects.get(avatar=self.avatar)
        for field in CHART_SIGN_FIELDS:
            self.assertTrue(getattr(profile, field), f"{field} was not stored")
        self.assertEqual(profile.mercury_sign, "gemini")
        self.assertEqual(profile.pluto_sign, "libra")

    def test_chart_is_twelve_ordered_glyph_annotated_placements(self):
        """
        The grid is exactly the twelve the quiz computes. The Imum Coeli and
        Descendant are derivable but nothing renders them, so they are not in
        the contract; the North Node has no source at all.
        """
        signed_post(self.client, self.url, self.payload())
        self.client.force_authenticate(self.user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200, r.data)
        data = r.data["data"]

        self.assertEqual(len(data["chart"]), 12)
        self.assertNotIn("ic_sign", data)
        self.assertNotIn("descendant_sign", data)

        chart = {p["key"]: p for p in data["chart"]}
        self.assertEqual(chart["sun"]["glyph"], "☉")
        self.assertEqual(chart["sun"]["sign"], "aries")
        self.assertEqual(chart["rising"]["label"], "ASCENDANT")
        self.assertEqual(chart["midheaven"]["sign"], "libra")
        # Order is the authority for rendering, so assert it explicitly.
        self.assertEqual(
            [p["key"] for p in data["chart"]],
            ["sun", "moon", "rising", "mercury", "venus", "mars",
             "jupiter", "saturn", "uranus", "neptune", "pluto", "midheaven"],
        )

    def test_learning_path_absent_is_fine_and_leaves_the_choice_open(self):
        """
        The quiz does not produce recommended_learning_path — the user picks it
        themselves (DEC-012). An omitted field must not block ingest or invent
        a value.
        """
        payload = self.payload()
        del payload["results"]["recommended_learning_path"]
        r = signed_post(self.client, self.url, payload)
        self.assertEqual(r.status_code, 201, r.data)

        self.avatar.refresh_from_db()
        self.assertEqual(self.avatar.heroic_path, "dreamwalker")
        self.assertEqual(self.avatar.learning_path, "", "must stay unset for the user to choose")

    def test_deprecated_archetype_spellings_fold_to_canonical(self):
        """
        Only one name per archetype may reach the database. "sage" is a retired
        Starkeep path name (Truthseeker was once Sage), so storing it as an
        archetype too would blur the two taxonomies — and would do so again on
        any future path rename. Legacy callers are still accepted.
        """
        for sent, stored in (("hermit", "hermit"), ("sage", "hermit"),
                             ("Sage", "hermit"), ("outlaw", "rebel")):
            r = signed_post(
                self.client, self.url,
                self.payload(quiz_run_id=f"qr_{sent}", results={"jung_archetype": sent}),
            )
            self.assertIn(r.status_code, (200, 201), r.data)
            self.assertEqual(
                ArchetypeProfile.objects.get(avatar=self.avatar).jung_archetype, stored,
                f"{sent!r} should be stored as {stored!r}",
            )

    def test_purpose_seed_at_the_documented_limit_saves(self):
        """
        The model column was max_length=200 while the serializer allowed 500, so
        anything in between passed validation and then died on save.
        """
        seed = "x" * 500
        r = signed_post(self.client, self.url, self.payload(results={"purpose_seed": seed}))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(ArchetypeProfile.objects.get(avatar=self.avatar).purpose_seed), 500)

    def test_invalid_path_slug_is_rejected_rather_than_stored(self):
        r = signed_post(
            self.client, self.url, self.payload(results={"recommended_heroic_path": "wizard"})
        )
        self.assertEqual(r.status_code, 400, r.data)
        self.avatar.refresh_from_db()
        self.assertEqual(self.avatar.heroic_path, "", "a bad slug must not reach the avatar")
        self.assertFalse(ArchetypeProfile.objects.filter(avatar=self.avatar).exists())

    def test_replayed_run_id_is_idempotent(self):
        self.assertEqual(signed_post(self.client, self.url, self.payload()).status_code, 201)

        # Same run, different content — a retry of a delivery the quiz never saw
        # succeed. It must not overwrite what we stored.
        r = signed_post(
            self.client, self.url, self.payload(results={"purpose_seed": "Something Else"})
        )
        self.assertEqual(r.status_code, 200)
        profile = ArchetypeProfile.objects.get(avatar=self.avatar)
        self.assertEqual(profile.purpose_seed, "Self-Actualization Architect")

    def test_a_genuinely_new_run_does_update(self):
        signed_post(self.client, self.url, self.payload())
        r = signed_post(
            self.client,
            self.url,
            self.payload(quiz_run_id="qr_second", results={"mbti": "ENTJ"}),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ArchetypeProfile.objects.get(avatar=self.avatar).mbti, "ENTJ")

    def test_partial_results_are_accepted(self):
        """A quiz that only produces some fields is still a valid caller."""
        r = signed_post(
            self.client,
            self.url,
            {"version": "1.0", "quiz_run_id": "qr_partial", "results": {"mbti": "intj"}},
        )
        self.assertEqual(r.status_code, 201, r.data)
        profile = ArchetypeProfile.objects.get(avatar=self.avatar)
        self.assertEqual(profile.mbti, "INTJ")  # normalized
        self.assertEqual(profile.sun_sign, "")


@integration_settings
class ArchetypeBreakdownsTests(TestCase):
    """Interpretive copy from the quiz — accepted, capped, and echoed back."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(email="d@example.com", password="pw123456!")
        self.avatar = self.user.avatar
        self.client = APIClient()
        self.url = f"/api/v1/avatars/{self.avatar.id}/archetype"

    def payload(self, breakdowns):
        return {
            "version": "1.1",
            "quiz_run_id": "qr_bd",
            "results": {"sun_sign": "aries", "mbti": "INFP"},
            "breakdowns": breakdowns,
        }

    def test_breakdowns_are_stored_and_returned(self):
        r = signed_post(self.client, self.url, self.payload({
            "sun_sign": {"title": "Sun in Aries", "body": "Two paragraphs of copy."},
            "mbti": {"title": "INFP — The Mediator", "body": "More copy."},
        }))
        self.assertEqual(r.status_code, 201, r.data)
        stored = ArchetypeProfile.objects.get(avatar=self.avatar).breakdowns
        self.assertEqual(stored["sun_sign"]["title"], "Sun in Aries")
        self.assertEqual(r.data["data"]["breakdowns"]["mbti"]["body"], "More copy.")

    def test_unknown_breakdown_key_is_rejected_by_name(self):
        """A typo'd key must not vanish silently and look like our bug."""
        r = signed_post(self.client, self.url, self.payload({
            "sun_signn": {"title": "t", "body": "b"},
        }))
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn("sun_signn", r.data["errors"]["detail"])

    def test_oversized_body_is_rejected(self):
        r = signed_post(self.client, self.url, self.payload({
            "sun_sign": {"title": "t", "body": "x" * 12_001},
        }))
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn("exceeds", r.data["errors"]["detail"])

    def test_empty_body_entries_are_dropped(self):
        r = signed_post(self.client, self.url, self.payload({
            "sun_sign": {"title": "Sun in Aries", "body": "   "},
        }))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(ArchetypeProfile.objects.get(avatar=self.avatar).breakdowns, {})

    def test_breakdowns_are_optional(self):
        r = signed_post(self.client, self.url, {
            "version": "1.1", "quiz_run_id": "qr_none", "results": {"mbti": "INFP"},
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(ArchetypeProfile.objects.get(avatar=self.avatar).breakdowns, {})
