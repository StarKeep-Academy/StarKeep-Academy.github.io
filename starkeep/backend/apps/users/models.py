"""
apps/users/models.py

Email-only User model. No username — allauth handles email auth.
UUID primary key for VR-client stability (DEC-006).
"""

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from apps.common.models import UUIDModel
from .managers import UserManager


class User(UUIDModel, AbstractBaseUser, PermissionsMixin):
    email      = models.EmailField(unique=True)
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.email
