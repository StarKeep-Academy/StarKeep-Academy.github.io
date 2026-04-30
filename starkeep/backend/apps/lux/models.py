"""
apps/lux/models.py

Immutable LUX ledger + wallet balance cache.

DEC-008: Transactions are append-only. Never UPDATE a transaction row.
The wallet balance is a materialized cache — recompute from ledger if in doubt.

VR NOTE (DEC-006): Wallet and transactions are served to VR clients.
Transaction.hero_action_type enables VR particle effects per transaction type.
"""

from django.db import models
from apps.common.models import TimestampedModel
from apps.avatar.models import Avatar


# ─── Wallet ───────────────────────────────────────────────────────────────────
class Wallet(TimestampedModel):
    """
    One wallet per avatar. Balances are cached here for fast reads.
    Recomputed from Transaction ledger if inconsistency is detected.
    """
    avatar = models.OneToOneField(Avatar, on_delete=models.CASCADE, related_name="wallet")

    # DEC-003: Two-charge model from manifesto §5
    positive_balance     = models.PositiveIntegerField(default=0)  # LUX+ (earned, non-cashable)
    negative_balance     = models.PositiveIntegerField(default=0)  # LUX- (received via transfer, cashable) — v2
    total_earned_lifetime = models.PositiveIntegerField(default=0) # monotonically increasing

    class Meta:
        verbose_name = "LUX Wallet"

    def __str__(self):
        return f"Wallet({self.avatar.alias}): {self.positive_balance} LUX+"


# ─── Transaction ─────────────────────────────────────────────────────────────
class TransactionType(models.TextChoices):
    ISSUANCE  = "issuance",  "LUX earned from validated milestone"
    LEVEL_UP  = "level_up",  "LUX consumed for level-up"
    TRANSFER  = "transfer",  "LUX+ sent to another avatar (v2)"
    DONATION  = "donation",  "LUX donated to mission/project (v2)"
    SPEND     = "spend",     "Cosmetic store purchase (v2+)"


class TransactionCharge(models.TextChoices):
    POSITIVE = "POS", "Positive (LUX+)"
    NEGATIVE = "NEG", "Negative (LUX-)"
    CONSUMED = "CON", "Consumed (level-up, non-cashable)"


class Transaction(TimestampedModel):
    """
    Immutable ledger entry. Never updated after creation.

    VR NOTE: hero_action_type lets VR trigger spatial effects.
    e.g. "community_impact" → golden particle burst in the sky above avatar.
    """
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name="transactions")

    type   = models.CharField(max_length=20, choices=TransactionType.choices)
    charge = models.CharField(max_length=3, choices=TransactionCharge.choices)
    amount = models.PositiveIntegerField()

    # Source tracking (nullable for non-milestone transactions)
    source_milestone = models.ForeignKey(
        "starmap.Milestone",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="lux_issuance",
    )

    # VR-relevant: what kind of heroic action generated this? (VR uses for effects)
    hero_action_type = models.CharField(max_length=50, blank=True)  # e.g. "community_impact"

    # LVM scores at time of issuance (denormalized for audit trail)
    lvm_scores = models.JSONField(default=dict)

    # Flexible metadata per transaction type
    metadata = models.JSONField(default=dict)
    # Issuance: { "validated_by": "admin_id" }
    # Transfer: { "recipient_avatar_id": "uuid" }
    # Level-up: { "level_reached": N }

    class Meta:
        ordering = ["-created_at"]
        # Enforce immutability at DB level via a trigger (add in migration)
        verbose_name = "LUX Transaction"

    def save(self, *args, **kwargs):
        # Enforce immutability: once created, a transaction cannot be modified.
        if self.pk:
            raise ValueError(
                "LUX transactions are immutable. "
                "Create a correcting transaction instead of modifying this one."
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.type} {self.charge} {self.amount} LUX ({self.wallet.avatar.alias})"
