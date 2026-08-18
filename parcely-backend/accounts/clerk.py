import jwt
from jwt import PyJWKClient
from django.conf import settings


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
        raise InvalidClerkToken(f"Invalid Clerk token: {e}")

# request to clerk api to get user details

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
    

    primary_id = user.get("primary_email_address_id")
    emails = user.get("email_addresses", [])

    user["email_address"] = ""
    for e in emails:
        if e["id"] == primary_id:
            user["email_address"] = e["email_address"]
            break
    else:
        if emails:
            user["email_address"] = emails[0]["email_address"]
        else:
            user["email_address"] = None

    return user