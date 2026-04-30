from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display  = ("email", "is_active", "is_staff", "date_joined")
    list_filter   = ("is_active", "is_staff", "is_superuser")
    search_fields = ("email",)
    ordering      = ("-date_joined",)

    fieldsets = (
        (None,           {"fields": ("email", "password")}),
        ("Permissions",  {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates",        {"fields": ("date_joined", "last_login")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "password1", "password2"),
        }),
    )
    readonly_fields = ("date_joined", "last_login")
