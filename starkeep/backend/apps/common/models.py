"""
apps/common/models.py

Base abstract models used by every other app.
Import these, never the concrete apps above them.
"""

import uuid
from django.db import models


class UUIDModel(models.Model):
    """All Starkeep models use UUID primary keys for VR-client stability."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimestampedModel(UUIDModel):
    """Standard audit fields. Every model should inherit from this."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
