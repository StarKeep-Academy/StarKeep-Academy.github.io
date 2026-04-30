"""
apps/starmap/admin.py

Admin registration for Star Map models.
Milestone admin is the main workspace for Phase 3 manual validation (DEC-003).
"""

from django.contrib import admin
from .models import ConstellationPath, Constellation, Milestone, Evidence


class EvidenceInline(admin.TabularInline):
    model  = Evidence
    extra  = 0
    fields = ["type", "payload", "label", "created_at"]
    readonly_fields = ["created_at"]


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display   = ["title", "avatar", "status", "constellation", "lux_issued", "created_at"]
    list_filter    = ["status", "source"]
    search_fields  = ["title", "avatar__alias"]
    readonly_fields = ["created_at", "updated_at", "validated_at"]
    inlines        = [EvidenceInline]
    fieldsets = [
        (None, {"fields": ["avatar", "title", "description", "source", "constellation"]}),
        ("Status", {"fields": ["status", "rejection_feedback"]}),
        ("Validation", {"fields": ["validated_by", "validated_at", "lvm_scores", "lux_issued"]}),
        ("Placement", {"fields": ["x", "y"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"]}),
    ]


@admin.register(Constellation)
class ConstellationAdmin(admin.ModelAdmin):
    list_display  = ["name", "avatar", "path", "symbol", "completed_at"]
    list_filter   = ["path"]
    search_fields = ["name", "avatar__alias"]


@admin.register(ConstellationPath)
class ConstellationPathAdmin(admin.ModelAdmin):
    list_display  = ["name", "avatar", "created_at"]
    search_fields = ["name", "avatar__alias"]


@admin.register(Evidence)
class EvidenceAdmin(admin.ModelAdmin):
    list_display  = ["type", "milestone", "label", "created_at"]
    list_filter   = ["type"]
