from rest_framework.permissions import BasePermission


class IsClerkAuthenticated(BasePermission):
    """Grants access only when the ClerkAuthMiddleware set a real AppUser on request.user."""

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(user and getattr(user, 'is_authenticated', False))
