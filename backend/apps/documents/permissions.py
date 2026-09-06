from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """
    Allows access only to admin or employee accounts — the people
    actually processing documents. Citizens can view their own
    documents through a separate, more restricted view.
    """

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ('admin', 'employee')
        )