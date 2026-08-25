"""
apps/integrations/urls.py

Mounted at /api/v1/ — no trailing slashes, matching the rest of the API.
"""

from django.urls import path

from .views import QuizExchangeView, QuizLaunchView

urlpatterns = [
    path("integrations/quiz/launch", QuizLaunchView.as_view(), name="quiz-launch"),
    path("integrations/quiz/exchange", QuizExchangeView.as_view(), name="quiz-exchange"),
]
