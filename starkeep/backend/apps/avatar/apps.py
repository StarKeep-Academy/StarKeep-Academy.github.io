from django.apps import AppConfig


class AvatarConfig(AppConfig):
    name = "apps.avatar"
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = "Avatar"

    def ready(self):
        import apps.avatar.signals  # noqa: F401 — registers post_save → Avatar creation
