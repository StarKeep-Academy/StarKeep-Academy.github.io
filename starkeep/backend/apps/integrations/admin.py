from django.contrib import admin

from .models import QuizLaunchTicket


@admin.register(QuizLaunchTicket)
class QuizLaunchTicketAdmin(admin.ModelAdmin):
    """Read-only — this table is an audit trail, not something to hand-edit."""

    list_display = ("id", "user", "avatar", "created_at", "expires_at", "consumed_at", "consumed_ip")
    list_filter = ("consumed_at", "created_at")
    search_fields = ("user__email", "ticket")
    readonly_fields = (
        "ticket", "user", "avatar", "return_to",
        "expires_at", "consumed_at", "consumed_ip", "created_at", "updated_at",
    )

    def has_add_permission(self, request):
        return False
