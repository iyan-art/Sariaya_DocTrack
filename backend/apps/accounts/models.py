from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """
    Custom manager for our User model.
    Required because we use email instead of username,
    and Django doesn't know how to create users without
    this manager telling it how.
    """

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)  # hashes the password, never store plain text
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        # This is what runs when you type: python manage.py createsuperuser
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)

        if extra_fields.get('is_staff') is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get('is_superuser') is not True:
            raise ValueError("Superuser must have is_superuser=True")

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model for QR-Track.
    Replaces Django's default User entirely.
    AbstractBaseUser gives us password hashing + login basics.
    PermissionsMixin gives us is_superuser, groups, permissions
    (needed so Django admin site still works normally).
    """

    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        EMPLOYEE = 'employee', 'Employee'
        CITIZEN = 'citizen', 'Citizen'

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CITIZEN, db_index=True)


    # NEW — only meaningful for admin/employee accounts
    office = models.CharField(max_length=100, blank=True, null=True)
    position = models.CharField(max_length=100, blank=True, null=True)

    # Unique staff/admin identifier, e.g. 'EMP-2026-0012' — assigned
    # automatically on save() for admin/employee accounts only (see below).
    # Citizens never get one; it stays null for them.
    employee_id = models.CharField(max_length=20, unique=True, null=True, blank=True, db_index=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    def save(self, *args, **kwargs):
        if not self.employee_id and self.role in (self.Role.ADMIN, self.Role.EMPLOYEE):
            self.employee_id = self._generate_employee_id()
        super().save(*args, **kwargs)

    @classmethod
    def _generate_employee_id(cls):
        """
        Next sequential 'EMP-<year>-<seq>' id, resetting the sequence each
        calendar year (EMP-2026-0001 ... EMP-2026-0012, then EMP-2027-0001
        the following year). Not race-safe under true concurrent creation —
        acceptable here since SQLite serializes writes and employee accounts
        are created one at a time by a single admin — a collision would
        simply raise on save() thanks to the unique constraint rather than
        silently duplicating an id.
        """
        prefix = f"EMP-{timezone.now().year}-"
        last_id = (
            cls.objects.filter(employee_id__startswith=prefix)
            .order_by('-employee_id')
            .values_list('employee_id', flat=True)
            .first()
        )
        next_seq = int(last_id.rsplit('-', 1)[1]) + 1 if last_id else 1
        return f"{prefix}{next_seq:04d}"

    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class AccessLog(models.Model):
    """
    System-wide audit trail of who did what, from where.
    Kept separate from DocumentLog (which is document-specific) so it can
    also capture logins/logouts and other actions with no document involved.
    """

    class Action(models.TextChoices):
        LOGIN = 'login', 'Login'
        LOGOUT = 'logout', 'Logout'
        LOGIN_FAILED = 'login_failed', 'Login Failed'
        VIEW_DOCUMENT = 'view_document', 'Viewed Document'
        SCAN_QR = 'scan_qr', 'Scanned QR Code'
        DELETE_DOCUMENT = 'delete_document', 'Deleted Document'
        # Automatic Guest-to-User Account Linking — see
        # accounts/services.py::link_guest_documents(), run on both
        # registration and login.
        GUEST_DOCUMENTS_LINKED = 'guest_documents_linked', 'Guest Documents Linked'
        OTHER = 'other', 'Other'

    # SET_NULL (not CASCADE) so deleting a user doesn't erase the audit trail,
    # and nullable so failed-login attempts by unknown emails can still be logged.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='access_logs',
    )
    action = models.CharField(max_length=30, choices=Action.choices, db_index=True)
    ip_address = models.GenericIPAddressField()
    user_agent = models.CharField(max_length=255, blank=True)
    # Free-text context for actions that need more than "who/when" to be
    # useful in review — e.g. which tracking number a DELETE_DOCUMENT entry
    # is about, since the Document itself is gone by the time anyone reads
    # this (that's also why this lives here and not on DocumentLog, which
    # CASCADE-deletes with its Document and would vanish right along with
    # the very action it's supposed to record).
    detail = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        who = self.user.email if self.user else 'Unknown'
        return f"{who} — {self.action} @ {self.timestamp:%Y-%m-%d %H:%M}"