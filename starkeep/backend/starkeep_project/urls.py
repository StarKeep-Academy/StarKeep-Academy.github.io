"""
Starkeep Academy — Root URL Config.

All REST endpoints live under /api/v1/.
allauth handles OAuth web redirects at /accounts/.
Admin at /admin/.
"""

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

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

    # Dev convenience only: serve frontend-web/ from the same origin as the
    # API, so `runserver` alone gives you the whole app at the URL it prints
    # — no second static server and no cross-origin hop. frontend-web/ is
    # still a standalone client that deploys as its own static site
    # (DEC-005 amendment); this block is DEBUG-only and never runs in prod.
    # Keep it last: the catch-all must not shadow admin/, accounts/, or
    # api/v1/ above it.
    FRONTEND_WEB_DIR = settings.BASE_DIR.parent / "frontend-web"
    urlpatterns += [
        path("", serve, {"document_root": FRONTEND_WEB_DIR, "path": "index.html"}),
        re_path(r"^(?P<path>.*)$", serve, {"document_root": FRONTEND_WEB_DIR}),
    ]
