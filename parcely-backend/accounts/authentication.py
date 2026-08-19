from rest_framework.authentication import BaseAuthentication


class ClerkMiddlewareAuthentication(BaseAuthentication):
    """Passes the user that ClerkAuthMiddleware attached to the Django request
    through to DRF, so DRF doesn't overwrite it with AnonymousUser."""

    def authenticate(self, request):
        user = getattr(request._request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return None
        return (user, None)
