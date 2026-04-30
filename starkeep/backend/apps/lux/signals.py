"""
apps/lux/signals.py

DEC-009: LUX sits at the bottom of the dependency graph.
It subscribes to signals from other apps. Nothing imports from lux.

Signals handled:
  - starmap.milestone_validated → issue LUX
  - missions.mission_completed  → issue LUX (phase 5+, stub here)

Signal senders must pass:
  milestone_validated(sender, milestone, validated_by, **kwargs)
"""

from django.db.models.signals import post_save
from django.dispatch import Signal, receiver
from django.db import transaction

# ─── Custom Signals (defined here, emitted by other apps) ─────────────────────
# Starmap emits this when a milestone is approved.
# args: milestone (Milestone instance), validated_by (User instance)
milestone_validated = Signal()

# Missions will emit this in phase 5+. Stub here so lux is ready.
mission_completed = Signal()


# ─── Wallet Bootstrap ─────────────────────────────────────────────────────────
# DEC-009: lux → avatar is the allowed import direction.
# Wallet is created here (in lux) when Avatar is created (in avatar).
@receiver(post_save, sender="avatar.Avatar")
def create_wallet_for_new_avatar(sender, instance, created, **kwargs):
    if created:
        from apps.lux.models import Wallet
        Wallet.objects.get_or_create(avatar=instance)


# ─── Handlers ─────────────────────────────────────────────────────────────────
@receiver(milestone_validated)
def handle_milestone_validated(sender, milestone, validated_by, **kwargs):
    """
    On milestone approval:
    1. Run LVM formula on stored scores
    2. Consume first 5 LUX for level-up
    3. Credit remainder to wallet as LUX+
    4. Create immutable Transaction records
    5. Auto-create social post (VR-relevant)
    6. Push WebSocket notification to user
    """
    from apps.lux.scoring import compute_lux, lux_after_level_up, LVMInput, VSM
    from apps.lux.models import Wallet, Transaction, TransactionType, TransactionCharge
    from apps.avatar.models import Avatar

    scores_raw = milestone.lvm_scores
    if not scores_raw:
        # Admin forgot to fill in scores — skip silently, log warning
        import logging
        logging.getLogger("starkeep.lux").warning(
            f"Milestone {milestone.id} approved without LVM scores. Skipping LUX issuance."
        )
        return

    scores = LVMInput(
        i=scores_raw.get("i", 0),
        s=scores_raw.get("s", 0),
        u=scores_raw.get("u", 0),
        r=scores_raw.get("r", 0),
        h=scores_raw.get("h", 0),
        vsm=scores_raw.get("vsm", VSM.BASIC),
    )

    from django.conf import settings
    result = compute_lux(
        scores,
        scale=getattr(settings, "LUX_SCALE", 5),
        cap=getattr(settings, "LUX_MILESTONE_CAP", 30),
    )

    level_cost = getattr(settings, "LUX_LEVEL_COST", 5)
    levels_gained, wallet_lux = lux_after_level_up(result.issued_lux, level_cost)

    avatar = milestone.avatar
    wallet, _ = Wallet.objects.get_or_create(avatar=avatar)

    with transaction.atomic():
        # Level-up consumption transaction
        if levels_gained > 0:
            lux_for_level = levels_gained * level_cost
            Transaction.objects.create(
                wallet=wallet,
                type=TransactionType.LEVEL_UP,
                charge=TransactionCharge.CONSUMED,
                amount=lux_for_level,
                source_milestone=milestone,
                lvm_scores=scores_raw,
                metadata={"level_reached": avatar.level + levels_gained},
                hero_action_type=_infer_hero_action_type(milestone),
            )
            Avatar.objects.filter(pk=avatar.pk).update(
                level=avatar.level + levels_gained
            )

        # Wallet credit transaction
        if wallet_lux > 0:
            Transaction.objects.create(
                wallet=wallet,
                type=TransactionType.ISSUANCE,
                charge=TransactionCharge.POSITIVE,
                amount=wallet_lux,
                source_milestone=milestone,
                lvm_scores=scores_raw,
                hero_action_type=_infer_hero_action_type(milestone),
                metadata={"validated_by": str(validated_by.pk) if validated_by else None},
            )
            Wallet.objects.filter(pk=wallet.pk).update(
                positive_balance=wallet.positive_balance + wallet_lux,
                total_earned_lifetime=wallet.total_earned_lifetime + result.issued_lux,
            )

    # Dispatch post-commit: social post + WebSocket notification
    # Using post_save deferred tasks (phase 5 adds Celery; v1 does it synchronously)
    _dispatch_milestone_events(milestone, result.issued_lux, levels_gained)


def _infer_hero_action_type(milestone) -> str:
    """
    Derives a hero_action_type string from the milestone's avatar heroic path.
    VR uses this to trigger appropriate spatial effects.
    Maps to strings the VR client will recognise — do not change without VR team coordination.
    """
    path = milestone.avatar.heroic_path
    mapping = {
        "earthwatcher": "ecological_impact",
        "peacebringer":  "humanitarian_impact",
        "storyteller":   "creative_impact",
        "innovator":     "technological_impact",
        "dreamwalker":   "philosophical_impact",
        "truthseeker":   "academic_impact",
    }
    return mapping.get(path, "community_impact")


def _dispatch_milestone_events(milestone, lux_issued: int, levels_gained: int):
    """
    Post-validation side effects:
    - Create social post (VR feed subscribes to this)
    - Push WebSocket notification
    In v1 these run synchronously. Phase 7+ moves them to Celery tasks.
    """
    # TODO phase 5: social post creation
    # from apps.academy.models import SocialPost
    # SocialPost.objects.create(...)

    # TODO phase 5: WebSocket push
    # from channels.layers import get_channel_layer
    # channel_layer = get_channel_layer()
    # async_to_sync(channel_layer.group_send)(...)
    pass
