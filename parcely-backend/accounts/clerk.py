import jwt
from jwt import PyJWKClient
from django.conf import settings

from accounts.models import AppUser
import requests

# JWKS endpoint, clerk exposes per app
# format: https://<app-domain>.clerk.accounts.dev/.well-known/jwks.json
# Get from clerk dashboard, API Keys -> Application -> JWKS URL

_jwks_client = PyJWKClient(settings.CLERK_JWKS_URL, cache_keys=True)

class InvalidClerkToken(Exception):
    pass

def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk JWT return payload, raises invalid clerk token on failure"""
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token).key

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=['RS256'],
            issuer=settings.CLERK_ISSUER,
            options={'verify_aud': False}
        )
        return payload
    except jwt.PyJWTError as e:
        raise InvalidClerkToken(f"Invalid Clerk token: {e}") from e

# request to clerk api to get user details

def obtain_primary_email(user: dict) -> str:
    primary_id = user.get("primary_email_address_id")
    emails = user.get("email_addresses", [])
    for e in emails:
        if e["id"] == primary_id:
            return e["email_address"]
    else:
        if emails:
            return emails[0]["email_address"]
        else:
            raise ValueError("No email addresses found")

CLERK_API_BASE = "https://api.clerk.com/v1"

def _headers():
    return {'Authorization': f'Bearer {settings.CLERK_SECRET_KEY}'}

def fetch_clerk_user(clerk_id: str) -> dict:
    res = requests.get(
        f"{CLERK_API_BASE}/users/{clerk_id}",
        headers=_headers(),
        timeout=5
    )
    res.raise_for_status()
    user = res.json()
    
    user["email_address"] = obtain_primary_email(user)
    return user

def update_clerk_user(clerk_id: str, data: dict) -> AppUser | None:
    user = AppUser.objects.filter(clerk_id=clerk_id).first()
    if user is None:
        return None
    user.email = obtain_primary_email(data)
    user.profile_picture = data.get("image_url")
    user.username = data.get("username")
    user.first_name = data.get("first_name")
    user.last_name = data.get("last_name")
    user.save()
    return user

def create_clerk_user(clerk_id: str, data: dict) -> dict:
    user, _ = AppUser.objects.get_or_create(
        clerk_id=clerk_id,
        defaults={
            "email": obtain_primary_email(data),
            "profile_picture": data.get("image_url", None),
            "username": data.get("username"),
            "first_name": data.get("first_name"),
            "last_name": data.get("last_name")
        }
    )
    return user

def delete_clerk_user(clerk_id: str) -> None:
    AppUser.objects.filter(clerk_id=clerk_id).delete()