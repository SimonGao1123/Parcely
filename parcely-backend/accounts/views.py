from django.shortcuts import render, get_object_or_404
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from accounts.serializers import MeSerializer, SendOTPEmailSerializer
from rest_framework import status
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import HttpResponse
from svix.webhooks import Webhook, WebhookVerificationError
from django.conf import settings
from accounts.models import AppUser, EmailVerification, OTP_TTL
from accounts.clerk import create_clerk_user, update_clerk_user, delete_clerk_user
from store.models import StoreFront
import secrets
import string
# Create your views here.

@api_view(['GET'])
def me(request):
    return Response(MeSerializer(request.user).data)


@csrf_exempt
@require_POST
def clerk_webhook(request):
    headers = {
        'svix-id': request.headers.get('svix-id', ''),
        'svix-timestamp': request.headers.get('svix-timestamp', ''),
        'svix-signature': request.headers.get('svix-signature', ''),
    }

    try:
        event = Webhook(settings.CLERK_WEBHOOK_SECRET).verify(request.body, headers)
    except WebhookVerificationError as e:
        return HttpResponse('Invalid signature', status=400)
    
    event_type = event['type']
    data = event['data']
    clerk_id = data['id']

    if event_type == 'user.created':
        create_clerk_user(clerk_id, data)
    elif event_type == 'user.updated':
        update_clerk_user(clerk_id, data)
    elif event_type == 'user.deleted':
        delete_clerk_user(clerk_id)
    # Unknown event types are acknowledged so Clerk doesn't retry.
    return HttpResponse(status=204)

OTP_KEY_SALT = 'accounts.EmailVerification.code'


def _generate_otp() -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def _hash_otp(code: str) -> str:
    # Keyed with SECRET_KEY rather than a bare digest: a 6-digit code is only
    # 10^6 values, so a plain SHA256 of it is reversible by lookup table the
    # moment the rows leak, and the attempts counter never sees such an attacker.
    return salted_hmac(OTP_KEY_SALT, code, algorithm='sha256').hexdigest()


class SendOTPEmailAPIView(APIView):
    # Guests check out without an account, so the IsClerkAuthenticated default
    # would 403 exactly the callers this exists for.
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront, slug=kwargs['storefront_slug'], is_draft=False
        )
        seller = storefront.owner

        serializer = SendOTPEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # An address that already belongs to an account may only be verified by
        # whoever is signed in as it, otherwise a guest could transact as them.
        # iexact because AppUser.email is stored verbatim from Clerk, so a case
        # variant would slip past an exact match.
        existing_user = AppUser.objects.filter(email__iexact=email).first()
        if existing_user and request.user.id != existing_user.id:
            return Response(
                {'detail': 'Sign in to verify this email address.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        code = _generate_otp()

        with transaction.atomic():
            EmailVerification.objects.filter(
                email=email, seller=seller, consumed_at__isnull=True
            ).update(consumed_at=timezone.now())
            verification = EmailVerification.objects.create(
                email=email, seller=seller, code_hash=_hash_otp(code),
            )

        # Sent only once the row is committed; inside the transaction a rollback
        # would leave the buyer holding a code that no row can verify.
        send_mail(
            subject=f'Your {storefront.title} verification code',
            message=(
                f'Your verification code is {code}\n\n'
                f'It expires in {int(OTP_TTL.total_seconds() // 60)} minutes.'
            ),
            from_email=None,
            recipient_list=[email],
        )

        return Response({'expires_at': verification.expires_at})
