"""
apps/integrations/dev_stub_urls.py

Routes for the DEBUG-only local quiz stub. Mounted at /dev/quiz-stub/ from
starkeep_project/urls.py. See dev_stub.py for what this is and why.
"""

from django.urls import path

from . import dev_stub

urlpatterns = [
    path("sso/starkeep", dev_stub.sso_entry, name="dev-quiz-stub-sso"),
    path("submit", dev_stub.submit, name="dev-quiz-stub-submit"),
]
