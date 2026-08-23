"""
Starkeep Academy — Django Settings
Reads all secrets from environment. Never hardcode credentials here.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Loads backend/.env into the process environment if present — copy
# .env.example to .env and fill in real values for local dev. In prod, real
# env vars set on the host/container take precedence (load_dotenv doesn't
# overwrite vars that are already set), so this is dev-convenience only.
load_dotenv(BASE_DIR / ".env")

# ─── Security ────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# ─── Apps ────────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.apple",
]

# DEC-009: dependency order must be respected
# common → users → avatar → {starmap, academy, missions} → lux
LOCAL_APPS = [
    "apps.common",
    "apps.users",
    "apps.avatar",
    "apps.starmap",
    "apps.missions",
    "apps.academy",
    "apps.lux",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

SITE_ID = 1

# ─── Auth ────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "users.User"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = "email"
ACCOUNT_EMAIL_VERIFICATION = os.environ.get("ACCOUNT_EMAIL_VERIFICATION", "mandatory")
LOGIN_REDIRECT_URL = "/api/v1/auth/me"

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
        "APP": {
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
            "secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
            "key": "",
        },
    },
    "apple": {
        "APP": {
            "client_id": os.environ.get("APPLE_CLIENT_ID", ""),
            "secret": os.environ.get("APPLE_CLIENT_SECRET", ""),
            "key": os.environ.get("APPLE_KEY_ID", ""),
            "certificate_key": os.environ.get("APPLE_PRIVATE_KEY", ""),
        }
    },
}

# ─── REST Framework ──────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.common.exceptions.starkeep_exception_handler",
}

# ─── JWT ─────────────────────────────────────────────────────────────────────
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ─── Channels (WebSocket) ─────────────────────────────────────────────────────
ASGI_APPLICATION = "starkeep_project.asgi.application"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [os.environ.get("REDIS_URL", "redis://localhost:6379/0")],
        },
    },
}

# ─── Database ────────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "starkeep"),
        "USER": os.environ.get("DB_USER", "starkeep"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Cache / Redis ───────────────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://localhost:6379/1"),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

# ─── CORS ────────────────────────────────────────────────────────────────────
# 8081/3000 = mobile app's Expo dev server (native + web preview). 5500 = the
# frontend-web static dev server (VS Code Live Server default; adjust if you
# serve it differently, e.g. `python -m http.server`). :8000 covers urls.py's
# DEBUG-only block that serves frontend-web/ from runserver itself — the page
# is same-origin then, but config.js pins the API at localhost:8000, so
# loading the 127.0.0.1 spelling that runserver prints is still a cross-origin
# request. In production this env var must be set to the real frontend
# domain(s) — localhost origins are dev-only.
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:8081,http://localhost:3000,http://localhost:5500,"
    "http://localhost:8000,http://127.0.0.1:8000",
).split(",")
CORS_ALLOW_CREDENTIALS = True

# ─── AI Microservice ─────────────────────────────────────────────────────────
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8001")
AI_SERVICE_TIMEOUT = int(os.environ.get("AI_SERVICE_TIMEOUT", "10"))

# ─── LUX Economy ─────────────────────────────────────────────────────────────
# DEC-003: LVM constants — change these only with a decision record
LUX_SCALE = 5               # BaseLUX = RawScore × SCALE
LUX_MILESTONE_CAP = 30      # Hard cap per milestone (manifesto §5.2)
LUX_LEVEL_COST = 5          # LUX consumed per level-up (manifesto §5.3)

# ─── External Integrations ───────────────────────────────────────────────────
QUIZ_REPO_WEBHOOK_SECRET = os.environ.get("QUIZ_REPO_WEBHOOK_SECRET", "")
QUIZ_REPO_BASE_URL       = os.environ.get("QUIZ_REPO_BASE_URL", "")
QUIZ_INTEGRATION_TOKEN   = os.environ.get("QUIZ_INTEGRATION_TOKEN", "")
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")

# ─── Static / Media ──────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ─── Middleware ──────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "starkeep_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─── Email ───────────────────────────────────────────────────────────────────
# Dev: prints to console. Prod: set EMAIL_BACKEND=sendgrid_backend.SendgridBackend
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@starkeep.io")

# ─── Internationalization ────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
