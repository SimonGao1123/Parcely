from accounts.clerk import verify_clerk_token, fetch_clerk_user
from accounts.models import AppUser
from accounts.clerk import InvalidClerkToken
from django.http import JsonResponse
from django.contrib.auth.models import AnonymousUser
import requests
from accounts.clerk import create_clerk_user
class ClerkAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Skip auth entirely for webhook endpoints (signed via Svix, no user context).
        if request.path.startswith('/webhooks/') or request.path.startswith('/clerk/webhook'):
            request.user = AnonymousUser()
            return self.get_response(request)

        # request phase
        auth = request.headers.get('Authorization', '')

        if not auth.startswith('Bearer '):
            request.user = AnonymousUser()
            return self.get_response(request)
        
        try:
            payload = verify_clerk_token(auth[7:].strip())
        except InvalidClerkToken as e:
            response = JsonResponse({"error": "Invalid clerk token"}, status=401)
            return response
        
        clerk_id = payload['sub']
        try:
            user = AppUser.objects.get(clerk_id=clerk_id)
        except AppUser.DoesNotExist:
            # fetch clerk user details and create new app user, treat clerk as source of truth not our db
            try:
                clerk_user = fetch_clerk_user(clerk_id)
            except requests.HTTPError as e:
                if e.response.status_code == 404:
                    return JsonResponse({"error": "Clerk user not found"}, status=404)
                return JsonResponse({"error": "Failed to fetch clerk user details"}, status=502)
            except requests.RequestException:
                return JsonResponse({"error": "Clerk API unreachable"}, status=502)

            if not all([clerk_user['email_address'], clerk_user['username'], clerk_user['first_name'], clerk_user['last_name']]):
                response = JsonResponse({"error": "Invalid clerk user details"}, status=400)
                return response
            user = create_clerk_user(clerk_id, clerk_user) 
        request.user = user


        # response phase
        return self.get_response(request)