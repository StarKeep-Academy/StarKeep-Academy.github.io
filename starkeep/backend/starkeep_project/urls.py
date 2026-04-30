"""
Starkeep Academy — Root URL Config.

All REST endpoints live under /api/v1/.
allauth handles OAuth web redirects at /accounts/.
Admin at /admin/.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    # allauth web OAuth callbacks (used by social login redirect flow)
    path("accounts/", include("allauth.urls")),
    # v1 REST API
    path("api/v1/", include("apps.users.urls")),
    path("api/v1/", include("apps.avatar.urls")),
    path("api/v1/", include("apps.starmap.urls")),
    # Future apps mount here as they ship:
    # Phase 5: path("api/v1/", include("apps.lux.urls")),
    # Phase 6: path("api/v1/", include("apps.academy.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
