"""
apps/avatar/signals.py

create_avatar_for_new_user — fires on User.post_save(created=True)
archetype_updated           — custom signal emitted after quiz results are saved
                              (used by: future lux, missions listeners — DEC-009)
"""

from django.db.models.signals import post_save
from django.dispatch import receiver, Signal
from django.conf import settings

from .models import Avatar

# Emitted by ArchetypeWebhookView after saving quiz results.
# Provides: sender=ArchetypeProfile, instance=profile, avatar=avatar
archetype_updated = Signal()


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_avatar_for_new_user(sender, instance, created, **kwargs):
    if created:
        Avatar.objects.create(user=instance)
