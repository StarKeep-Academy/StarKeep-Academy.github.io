"""
apps/users/serializers.py

Auth serializers for register + login.
Validation errors automatically surface via starkeep_exception_handler → RFC 7807.
"""

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from allauth.account.models import EmailAddress
from .models import User


class RegisterSerializer(serializers.Serializer):
    email        = serializers.EmailField()
    password     = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(max_length=100, required=False, default="", allow_blank=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        email        = validated_data["email"]
        password     = validated_data["password"]
        display_name = validated_data.get("display_name", "").strip()

        user = User.objects.create_user(email=email, password=password)

        # Register email with allauth so social auth + email verification work
        EmailAddress.objects.create(user=user, email=email, primary=True, verified=False)

        # Avatar was created by signal in apps.avatar.signals.
        # Set display_name if provided at register time.
        if display_name:
            try:
                user.avatar.display_name = display_name
                user.avatar.save(update_fields=["display_name"])
            except Exception:
                pass

        return user


class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(
            request=self.context.get("request"),
            username=data["email"].lower().strip(),
            password=data["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        data["user"] = user
        return data
