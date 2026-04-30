"""
WSGI config for starkeep_project.
Used by some deployment tooling. Primary server is ASGI (Daphne + Channels).
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "starkeep_project.settings")

application = get_wsgi_application()
