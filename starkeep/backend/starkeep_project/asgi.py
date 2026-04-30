"""
ASGI config — Django Channels for WebSocket + HTTP.
Channels handles: /ws/* → WebSocket consumers
Django handles:   everything else → HTTP
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "starkeep_project.settings")

django_asgi_app = get_asgi_application()

# WS consumers are registered here as apps build them out.
# Phase 5: add lux.consumers | Phase 6: add academy.consumers
websocket_urlpatterns: list = []

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
