"""
apps/starmap/tests/test_writes.py

Smoke test for the Phase 4 write endpoints: create -> evidence -> submit ->
edges -> split, covering the full flow end to end against a real (test) DB.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class MilestoneWriteFlowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(email="t@example.com", password="pw123456!")
        self.avatar = self.user.avatar  # auto-created via avatar signal
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_evidence_submit_edges_split_flow(self):
        # 1. Create constellation — server assigns angle_deg/radius
        r = self.client.post("/api/v1/constellations", {"name": "Test Arc", "symbol": "wolf"})
        self.assertEqual(r.status_code, 201, r.data)
        const_id = r.data["data"]["id"]
        self.assertIsNotNone(r.data["data"]["angle_deg"])
        self.assertEqual(r.data["data"]["edges"], [])

        # 2. Create milestone
        r = self.client.post("/api/v1/milestones", {"title": "Build a thing", "constellation_id": const_id})
        self.assertEqual(r.status_code, 201, r.data)
        m1_id = r.data["data"]["id"]
        self.assertEqual(r.data["data"]["status"], "pending")
        self.assertEqual(r.data["data"]["planets"], [])

        # 3. PATCH planets -> auto pending->active
        r = self.client.patch(
            f"/api/v1/milestones/{m1_id}", {"planets": [{"label": "Step 1", "done": True, "order": 1}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["data"]["status"], "active")

        # 4. Add evidence
        r = self.client.post(f"/api/v1/milestones/{m1_id}/evidence", {"type": "text", "payload": "did the thing"})
        self.assertEqual(r.status_code, 201, r.data)

        # 5. Submit
        r = self.client.post(f"/api/v1/milestones/{m1_id}/submit")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["data"]["status"], "submitted")

        # 5b. Submitting again should fail cleanly (StarkeepError -> 400, not a 500)
        r = self.client.post(f"/api/v1/milestones/{m1_id}/submit")
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIsNotNone(r.data["errors"])

        # 6. Second + third milestone, wire an edge chain
        r = self.client.post("/api/v1/milestones", {"title": "Second step", "constellation_id": const_id})
        m2_id = r.data["data"]["id"]
        r = self.client.post("/api/v1/milestones", {"title": "Third step", "constellation_id": const_id})
        m3_id = r.data["data"]["id"]

        r = self.client.post(
            f"/api/v1/constellations/{const_id}/edges",
            {"edges": [{"from": m1_id, "to": m2_id}, {"from": m2_id, "to": m3_id}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data["data"]["edges"]), 2)

        # 6b. Cycle rejected with a clean 400 (not a 500)
        r = self.client.post(
            f"/api/v1/constellations/{const_id}/edges",
            {"edges": [{"from": m1_id, "to": m2_id}, {"from": m2_id, "to": m1_id}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.data)

        # 6c. Edge referencing a milestone outside the constellation is rejected
        r = self.client.post("/api/v1/milestones", {"title": "Unrelated"})  # no constellation
        m_outside_id = r.data["data"]["id"]
        r = self.client.post(
            f"/api/v1/constellations/{const_id}/edges",
            {"edges": [{"from": m1_id, "to": m_outside_id}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.data)

        # Restore the valid chain (previous 400s left the last-good edges as-is,
        # since the endpoint validates before mutating anything)
        r = self.client.post(
            f"/api/v1/constellations/{const_id}/edges",
            {"edges": [{"from": m1_id, "to": m2_id}, {"from": m2_id, "to": m3_id}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)

        # 7. Split m3 (no planets, no evidence) -> parent consumed
        r = self.client.post(
            f"/api/v1/milestones/{m3_id}/split",
            {"offshoots": [{"title": "Part A"}, {"title": "Part B"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["data"]["consumed_parent"])
        self.assertIsNone(r.data["data"]["parent"])
        offshoot_ids = [o["id"] for o in r.data["data"]["offshoots"]]
        self.assertEqual(len(offshoot_ids), 2)

        r = self.client.get(f"/api/v1/milestones/{m3_id}")
        self.assertEqual(r.status_code, 404)  # consumed parent is gone

        # Edges now route m2 -> offshoot1 -> offshoot2 (chain took m3's slot)
        r = self.client.get(f"/api/v1/constellations/{const_id}")
        edge_pairs = {(e["from"], e["to"]) for e in r.data["data"]["edges"]}
        self.assertIn((m2_id, offshoot_ids[0]), edge_pairs)
        self.assertIn((offshoot_ids[0], offshoot_ids[1]), edge_pairs)
        self.assertNotIn(m3_id, [x for pair in edge_pairs for x in pair])

        # 8. Split m1 (has a planet, no evidence-independent... it DOES have
        # evidence from step 4) with ALL its planets promoted -> parent
        # survives (evidence alone keeps it alive even with zero planets left)
        r = self.client.post(
            f"/api/v1/milestones/{m1_id}/split",
            {"offshoots": [{"title": "Step 1 offshoot", "source_planet_order": 1}]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(r.data["data"]["consumed_parent"])
        self.assertIsNotNone(r.data["data"]["parent"])
        self.assertEqual(r.data["data"]["parent"]["planets"], [])

        # 9. Delete m2 -> edges heal around it
        r = self.client.delete(f"/api/v1/milestones/{m2_id}")
        self.assertEqual(r.status_code, 204)
        r = self.client.get(f"/api/v1/constellations/{const_id}")
        remaining_ids = {s["id"] for s in r.data["data"]["stars"]} | set()
        edge_pairs_after = {(e["from"], e["to"]) for e in r.data["data"]["edges"]}
        self.assertNotIn(m2_id, [x for pair in edge_pairs_after for x in pair])
