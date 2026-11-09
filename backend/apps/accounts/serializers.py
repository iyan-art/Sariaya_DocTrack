import secrets
import string

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import NOTIFICATION_PREFERENCES, User, AccessLog
from .validators import CONTACT_NUMBER_ERROR, is_valid_contact_number


def generate_temp_password(length=None):
    """
    A random, secure temporary password — used when an admin creates a
    staff account (CreateEmployeeSerializer) or resets one
    (ResetUserPasswordView). Guarantees at least one uppercase letter, one
    lowercase letter, one digit, and one symbol — not just a statistical
    likelihood from a combined alphabet — and is built entirely from
    `secrets` (never `random`, which isn't cryptographically secure),
    including the final shuffle. Length is randomized between 8 and 10
    characters when not given explicitly.
    """
    if length is None:
        length = secrets.choice(range(8, 11))

    symbols = '!@#$%&*'
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(symbols),
    ]
    alphabet = string.ascii_letters + string.digits + symbols
    remaining_count = max(length - len(required), 0)
    chars = required + [secrets.choice(alphabet) for _ in range(remaining_count)]

    # Fisher-Yates shuffle via `secrets.randbelow`, so the four guaranteed
    # characters above don't predictably end up at the front of every
    # generated password.
    for i in range(len(chars) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]

    return ''.join(chars)


class RegisterSerializer(serializers.ModelSerializer):
    """
    Used ONLY for citizen self-registration.
    Admin/Employee accounts are never created through this serializer.
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'password', 'confirm_password']

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        # Force role to citizen — no matter what the frontend sends, this is the only
        # role self-registration can ever create.
        validated_data['role'] = User.Role.CITIZEN
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    """
    Used to return safe user info — e.g. after login, or for a 'who am I' endpoint.
    Never includes password.
    """
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'role', 'employee_id',
                  'office', 'position', 'is_active', 'date_joined']

class ProfileSerializer(serializers.ModelSerializer):
    """
    The signed-in user's own account, for the Profile & Settings page. Only
    names, email, contact number, and notification preferences are editable;
    role, office, and position stay under the admin's control.
    """
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'role', 'employee_id',
                  'office', 'position', 'contact_number', 'notification_preferences', 'date_joined']
        read_only_fields = ['id', 'role', 'employee_id', 'office', 'position', 'date_joined']

    def validate_first_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("First name is required.")
        return value.strip()

    def validate_last_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Last name is required.")
        return value.strip()

    def validate_email(self, value):
        email = User.objects.normalize_email(value.strip())
        if User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Another account already uses this email address.")
        return email

    def validate_contact_number(self, value):
        if value and not is_valid_contact_number(value):
            raise serializers.ValidationError(CONTACT_NUMBER_ERROR)
        return value

    def validate_notification_preferences(self, value):
        allowed = NOTIFICATION_PREFERENCES[self.instance.role]
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object of on/off settings.")
        unknown = [key for key in value if key not in allowed]
        if unknown:
            raise serializers.ValidationError(f"Unknown setting: {', '.join(unknown)}.")
        if any(not isinstance(on, bool) for on in value.values()):
            raise serializers.ValidationError("Each setting must be true or false.")
        # A partial update: merge into the saved settings.
        return {**self.instance.notification_preferences, **value}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['notification_preferences'] = [
            {'key': key, 'label': label, 'enabled': instance.wants_notification(key)}
            for key, label in NOTIFICATION_PREFERENCES[instance.role].items()
        ]
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate(self, attrs):
        user = self.context['request'].user
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        if attrs['new_password'] == attrs['current_password']:
            raise serializers.ValidationError({"new_password": "Choose a password different from your current one."})
        try:
            validate_password(attrs['new_password'], user)
        except Exception as exc:
            raise serializers.ValidationError({"new_password": list(getattr(exc, 'messages', [str(exc)]))})
        return attrs


class CreateEmployeeSerializer(serializers.ModelSerializer):
    """
    Admin-only. Creates Employee or Admin accounts directly (no email
    confirmation flow — matches your spec: admin creates these accounts).
    No password field — the admin never types one. create() generates a
    secure temporary password and stashes it on self.temp_password so the
    view can return it exactly once in the creation response.
    """
    role = serializers.ChoiceField(choices=[User.Role.EMPLOYEE, User.Role.ADMIN])

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'role', 'office', 'position']

    def validate(self, attrs):
        if attrs['role'] == User.Role.EMPLOYEE and not attrs.get('office'):
            raise serializers.ValidationError({"office": "Office is required for employee accounts."})
        return attrs

    def create(self, validated_data):
        self.temp_password = generate_temp_password()
        user = User(**validated_data)
        user.set_password(self.temp_password)
        user.save()
        return user


class AccessLogSerializer(serializers.ModelSerializer):
    """Powers the admin Access Logs / Audit Trail page."""
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    action_label = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AccessLog
        fields = ['id', 'user_email', 'user_name', 'action', 'action_label', 'detail', 'ip_address', 'user_agent', 'timestamp']

    def get_user_email(self, obj):
        return obj.user.email if obj.user else None

    def get_user_name(self, obj):
        return obj.user.full_name if obj.user else None