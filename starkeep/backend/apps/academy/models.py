"""
apps/academy/models.py

Guild, Alliance, Channel, Message.

DEC-001: Schema ships in v1 to avoid migration churn in phase 6.
UI is stubbed. Chat consumers are prepared but not connected.

Image 2 reference:
  - Left sidebar: starred channels, channel list, DMs
  - Center: message thread
  - Right: AvatarPortrait card (reuse from avatar feature)
"""

from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel
from apps.avatar.models import Avatar, HeroicPath


# ─── Guild ────────────────────────────────────────────────────────────────────
class Guild(TimestampedModel):
    """
    A cohort organized around a Heroic Path.
    Students who share a Heroic Path are grouped into Guilds.
    Phase 6+: elected council, governance, missions, exhibitions.
    """
    name         = models.CharField(max_length=100, unique=True)
    heroic_path  = models.CharField(max_length=20, choices=HeroicPath.choices)
    description  = models.TextField(blank=True)
    slug         = models.SlugField(unique=True)
    member_count = models.PositiveIntegerField(default=0)  # cached, recomputed on join/leave

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class GuildRole(models.TextChoices):
    MEMBER  = "member",  "Member"
    OFFICER = "officer", "Officer"
    COUNCIL = "council", "Council"


class GuildMembership(TimestampedModel):
    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name="guild_memberships")
    guild  = models.ForeignKey(Guild, on_delete=models.CASCADE, related_name="memberships")
    role   = models.CharField(max_length=20, choices=GuildRole.choices, default=GuildRole.MEMBER)

    class Meta:
        unique_together = [("avatar", "guild")]


# ─── Channel ──────────────────────────────────────────────────────────────────
class ChannelType(models.TextChoices):
    PUBLIC  = "public",  "Public channel"
    PRIVATE = "private", "Private channel"
    DM      = "dm",      "Direct message"


class Channel(TimestampedModel):
    """
    A text channel. Lives within a Guild or as a DM between avatars.
    WebSocket consumer: /ws/channels/{channel_id}/  (phase 6+)

    Image 2: #social-media, #design-team, #team-finance are examples.
    """
    guild   = models.ForeignKey(Guild, on_delete=models.CASCADE, null=True, blank=True, related_name="channels")
    name    = models.CharField(max_length=80, blank=True)   # empty for DMs
    type    = models.CharField(max_length=20, choices=ChannelType.choices)
    topic   = models.CharField(max_length=250, blank=True)  # Image 2: "Track and coordinate social media"
    members = models.ManyToManyField(Avatar, through="ChannelMembership", related_name="channels")

    class Meta:
        ordering = ["name"]


class ChannelMembership(TimestampedModel):
    avatar  = models.ForeignKey(Avatar, on_delete=models.CASCADE)
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE)
    starred = models.BooleanField(default=False)   # Image 2: "Starred" section in sidebar

    class Meta:
        unique_together = [("avatar", "channel")]


# ─── Message ──────────────────────────────────────────────────────────────────
class Message(TimestampedModel):
    """
    A chat message. Delivered via WebSocket in real time (phase 6+).
    Rich text body matches Image 2 composer toolbar:
    Bold, Italic, Strike, Code, Link, Lists, Quote, Emoji, Attachment.
    """
    channel    = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name="messages")
    author     = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name="messages")
    body       = models.TextField()        # rich text / markdown
    edited_at  = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # soft delete

    class Meta:
        ordering = ["created_at"]

    @property
    def is_deleted(self):
        return self.deleted_at is not None
