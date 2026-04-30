from django.apps import AppConfig


class LuxConfig(AppConfig):
    name = "apps.lux"
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = "LUX Economy"

    def ready(self):
        import apps.lux.signals  # noqa: F401 — registers milestone_validated + avatar wallet creation
