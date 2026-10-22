from rest_framework import generics, status, filters
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.pagination import PageNumberPagination

from django.db.models import Q

from .models import User, AccessLog
from .serializers import RegisterSerializer, UserSerializer, CreateEmployeeSerializer, AccessLogSerializer, generate_temp_password
from .permissions import IsAdmin
from .services import link_guest_documents
from apps.documents.permissions import IsStaffUser

from django.contrib.auth import get_user_model

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT login serializer to allow login via email or username,
    and returns the logged-in user's role and basic info alongside tokens.
    """
    def validate(self, attrs):
        # Kunin ang username/email input mula sa request
        username_or_email = attrs.get(self.username_field)
        password = attrs.get('password')
        
        User = get_user_model()
        user = None
        
        # Suriin kung ang inilagay ay email
        if '@' in username_or_email:
            try:
                user_obj = User.objects.get(email=username_or_email)
                attrs[self.username_field] = user_obj.username # I-map sa actual username ng Django
            except User.DoesNotExist:
                pass
                
        data = super().validate(attrs) # Ito ang mag-a-authenticate
        data['user'] = UserSerializer(self.user).data
        return data

def _client_ip(request):
    # Prefer the original client IP from a forwarding header (dev proxy /
    # future reverse proxy in front of this server), fall back to the
    # direct connection address.
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or '0.0.0.0'


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]  # anyone can attempt to log in

    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '')
        matched_user = User.objects.filter(email__iexact=email).first() if email else None
        ip_address = _client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]

        try:
            # On bad credentials, TokenObtainSerializer.validate() raises
            # AuthenticationFailed — it does NOT return a 401 Response — so
            # that has to be caught here, not read off a response status.
            response = super().post(request, *args, **kwargs)
        except Exception:
            AccessLog.objects.create(
                user=matched_user, action=AccessLog.Action.LOGIN_FAILED,
                ip_address=ip_address, user_agent=user_agent,
            )
            raise

        AccessLog.objects.create(
            user=matched_user, action=AccessLog.Action.LOGIN,
            ip_address=ip_address, user_agent=user_agent,
        )

        # Automatic Guest-to-User Account Linking — citizens only (a guest
        # document's guest_email is only ever a citizen concept); cheap
        # no-op for everyone else and for citizens with nothing to link.
        if matched_user and matched_user.role == User.Role.CITIZEN:
            linked_count = link_guest_documents(matched_user)
            if linked_count:
                AccessLog.objects.create(
                    user=matched_user, action=AccessLog.Action.GUEST_DOCUMENTS_LINKED,
                    detail=f"Linked {linked_count} guest document request(s) to account {matched_user.email} on login.",
                    ip_address=ip_address, user_agent=user_agent,
                )
                response.data['linked_guest_documents'] = linked_count

        return response


class RegisterView(generics.CreateAPIView):
    """
    POST /api/accounts/register/
    Citizen self-registration only.
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]  # anyone (not logged in) can register

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Automatic Guest-to-User Account Linking — any document requested
        # as a guest under this same email, before the account existed,
        # gets attached to it right away.
        linked_count = link_guest_documents(user)
        if linked_count:
            AccessLog.objects.create(
                user=user, action=AccessLog.Action.GUEST_DOCUMENTS_LINKED,
                detail=f"Linked {linked_count} guest document request(s) to newly registered account {user.email}.",
                ip_address=_client_ip(request), user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            )

        return Response(
            {
                "message": "Account created successfully.",
                "user": UserSerializer(user).data,
                "linked_guest_documents": linked_count,
            },
            status=status.HTTP_201_CREATED
        )


class MeView(APIView):
    """
    GET /api/accounts/me/
    Returns the currently logged-in user's info.
    Frontend calls this after refresh to know who's logged in and their role.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
    
class UserPagination(PageNumberPagination):
    page_size = 10  # matches your "maximum 10" pagination spec

class UserListView(generics.ListAPIView):
    """
    GET /api/accounts/users/?role=citizen|employee&status=active|inactive
    Admin only. Powers the Users and Archive tables.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    pagination_class = UserPagination

    def get_queryset(self):
        qs = User.objects.all().order_by('-date_joined')

        role = self.request.query_params.get('role')
        if role in ('citizen', 'employee', 'admin'):
            qs = qs.filter(role=role)
        else:
            qs = qs.filter(role='citizen')  # default tab, matches your spec

        status_param = self.request.query_params.get('status')
        if status_param == 'active':
            qs = qs.filter(is_active=True)
        elif status_param == 'inactive':
            qs = qs.filter(is_active=False)

        return qs


class CitizenSearchView(APIView):
    """
    GET /api/accounts/citizens/search/?q=<2+ chars>
    Staff-facing lookup used when creating a document request on behalf of
    a citizen, so it can be linked to their account (see
    CreateDocumentSerializer.requested_by). Deliberately separate from the
    admin-only UserListView/Users table — employees get just enough to pick
    the right person, not the full account-management list.
    """
    permission_classes = [IsStaffUser]

    def get(self, request):
        query = (request.query_params.get('q') or '').strip()
        if len(query) < 2:
            return Response([])

        citizens = User.objects.filter(role='citizen').filter(
            Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query)
        ).order_by('first_name', 'last_name')[:10]

        return Response([
            {"id": c.id, "full_name": c.full_name, "email": c.email}
            for c in citizens
        ])


class CreateEmployeeView(generics.CreateAPIView):
    """
    POST /api/accounts/users/create-employee/
    Admin only. Creates Employee or Admin accounts directly. The response's
    temporary_password is only ever returned this once — it isn't stored
    anywhere in plaintext or retrievable again afterward.
    """
    serializer_class = CreateEmployeeSerializer
    permission_classes = [IsAdmin]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Account created successfully.",
                "user": UserSerializer(user).data,
                "temporary_password": serializer.temp_password,
            },
            status=status.HTTP_201_CREATED,
        )


class ToggleUserActiveView(APIView):
    """
    PATCH /api/accounts/users/<id>/toggle-active/
    Admin only. Deactivate sends a user to Archive; Reactivate brings them back.
    """
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user == request.user:
            return Response({"detail": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = not user.is_active
        user.save()
        return Response(UserSerializer(user).data)


class ResetUserPasswordView(APIView):
    """
    PATCH /api/accounts/users/<id>/reset-password/
    Admin only. Generates a brand-new secure temporary password for the
    account and returns it exactly once, mirroring CreateEmployeeView's
    one-time-reveal pattern — this is the supported way to re-issue
    credentials. There is no endpoint that returns an existing password:
    it's hashed via set_password() and never stored in a recoverable form,
    so the only way to "view" a user's password is to reset it.
    """
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        temp_password = generate_temp_password()
        user.set_password(temp_password)
        user.save()

        return Response({
            "message": "Password reset successfully.",
            "user": UserSerializer(user).data,
            "temporary_password": temp_password,
        })

class UpdateUserView(generics.UpdateAPIView):
    """
    PATCH /api/accounts/users/<id>/update/
    Admin only. Lets the admin edit office/position/name for an existing account.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    http_method_names = ['patch']

    def get_serializer(self, *args, **kwargs):
        kwargs['partial'] = True  # allow updating just some fields, not all required
        return super().get_serializer(*args, **kwargs)
    
    
class OfficialsListView(generics.ListAPIView):
    """
    GET /api/accounts/officials/
    Employees/admins that have a 'position' set — powers the Officials cards page.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return User.objects.filter(role__in=['employee', 'admin']).exclude(position__isnull=True).exclude(position='').order_by('first_name')


class AccessLogPagination(PageNumberPagination):
    page_size = 20


class AccessLogListView(generics.ListAPIView):
    """
    GET /api/accounts/access-logs/?action=login|logout|login_failed|view_document|scan_qr|other
    Admin-only system-wide audit trail — currently populated by LoginView
    (login/login_failed). Ordered newest-first via AccessLog.Meta.ordering.
    """
    serializer_class = AccessLogSerializer
    permission_classes = [IsAdmin]
    pagination_class = AccessLogPagination

    def get_queryset(self):
        qs = AccessLog.objects.select_related('user')
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        return qs
