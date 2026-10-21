import secrets
import string

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User, AccessLog


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