from accounts.clerk import verify_clerk_token, fetch_clerk_user
from accounts.models import AppUser
from accounts.clerk import InvalidClerkToken
from rest_framework.response import JSONResponse
from django.contrib.auth.models import AnonymousUser
class ClerkAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # request phase
        auth = request.headers.get('Authorization', '')
        
        if not auth.startswith('Bearer '):
            request.user = AnonymousUser()
            return self.get_response(request)
        
        try:
            payload = verify_clerk_token(auth[7:].strip())
        except InvalidClerkToken as e:
            response = JSONResponse({"error": "Invalid clerk token"}, status=401)
            return response
        
        clerk_id = payload['sub']
        try:
            user = AppUser.objects.get(clerk_id=clerk_id)
        except AppUser.DoesNotExist:
            # fetch clerk user details and create new app user, treat clerk as source of truth not our db
            clerk_user = fetch_clerk_user(clerk_id)

            if not all([clerk_user['email_address'], clerk_user['username'], clerk_user['first_name'], clerk_user['last_name']]):
                response = JSONResponse({"error": "Invalid clerk user details"}, status=400)
                return response
            user, _ = AppUser.objects.get_or_create( # get or create is atomic, so we don't need to worry about race conditions
            # first request will create then subsequent requests will get the created user, cannot accidentally create 2 users at same time
                clerk_id = clerk_id,
                defaults = {
                    'email': clerk_user['email_address'],
                    'username': clerk_user['username'],
                    'first_name': clerk_user['first_name'],
                    'last_name': clerk_user['last_name'],
                    'profile_picture': clerk_user['image_url'] or None
                }
            )
        request.user = user


        # response phase
        return self.get_response(request)