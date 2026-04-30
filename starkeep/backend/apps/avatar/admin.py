from django.contrib import admin
from .models import Avatar, ArchetypeProfile


@admin.register(Avatar)
class AvatarAdmin(admin.ModelAdmin):
    list_display  = ("alias", "display_name", "level", "heroic_path", "learning_path", "user")
    list_filter   = ("heroic_path", "learning_path")
    search_fields = ("alias", "display_name", "user__email")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields   = ("user",)


@admin.register(ArchetypeProfile)
class ArchetypeProfileAdmin(admin.ModelAdmin):
    list_display  = ("avatar", "jung_archetype", "mbti", "quiz_version", "completed_at")
    search_fields = ("avatar__alias",)
    readonly_fields = ("id", "created_at", "updated_at")
