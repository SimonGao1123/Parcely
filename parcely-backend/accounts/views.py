from django.shortcuts import render, get_object_or_404
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from accounts.serializers import MeSerializer, SendOTPEmailSerializer, VerifyEmailSerializer
from rest_framework import status
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import HttpResponse
from svix.webhooks import Webhook, WebhookVerificationError
from django.conf import settings
from accounts.models import AppUser, Customer, EmailVerification, OTP_TTL
from accounts.buyer_session import BUYER_SESSION_MAX_AGE, issue_buyer_token
from accounts.clerk import create_clerk_user, update_clerk_user, delete_clerk_user
from cart.serializers import CartSerializer
from cart.services import find_cart
from store.models import StoreFront
import secrets
import string
# Create your views here.
MAX_ATTEMPTS = 3

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

        if request.user.is_authenticated and request.user.email.lower() != email:
            return Response({"error": "You are not authorized to verify this email address."}, status=status.HTTP_403_FORBIDDEN)
            # if you are logged in MUST verify with logged in email
        
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

class VerifyEmailAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront, slug=kwargs['storefront_slug'], is_draft=False
        )
        seller = storefront.owner

        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code = serializer.validated_data['code']

        if request.user.is_authenticated and request.user.email.lower() != email:
            return Response({"error": "You are not authorized to verify this email address."}, status=status.HTTP_403_FORBIDDEN)
            # if you are logged in MUST verify with logged in email
        
        with transaction.atomic():
            # Locked across the read-check-increment: attempts is the only
            # brute-force defence on a 6-digit code, and unlocked parallel
            # guesses each read the same count and write back the same value.
            # Newest row, because two concurrent sends can leave more than one
            # unconsumed - the invalidating UPDATE cannot lock a row the other
            # transaction has not inserted yet.
            existing = EmailVerification.objects.select_for_update().filter(
                email=email, seller=seller, consumed_at__isnull=True, expires_at__gt=timezone.now()
            ).order_by('-created_at').first()

            if not existing:
                return Response({"error": "Invalid email or code"}, status=status.HTTP_400_BAD_REQUEST)

            if not constant_time_compare(existing.code_hash, _hash_otp(code)):
                existing.attempts += 1

                if existing.attempts >= MAX_ATTEMPTS:
                    existing.delete() # just delete if max attempts reached

                    return Response({"error": "Max attempts reached"}, status=status.HTTP_400_BAD_REQUEST)
                existing.save()

                return Response({"error": "Invalid code"}, status=status.HTTP_400_BAD_REQUEST)

            now = timezone.now()
            existing.consumed_at = now
            existing.save()

            # Linked only when the verified address is this account's own. A
            # signed-in user verifying some other address would otherwise
            # collide with uniq_customer_seller_user. AppUser.email is stored
            # verbatim from Clerk, hence the lower().
            link_user = (
                request.user
                if request.user.is_authenticated and request.user.email.lower() == email
                else None
            )

            customer, created = Customer.objects.get_or_create(
                seller=seller, email=email,
                defaults={"email_verified_at": now, "user": link_user},
            )
            if not created:
                customer.email_verified_at = now
                fields = ["email_verified_at", "updated_at"]
                # Never take over a row already linked to someone else.
                if link_user and customer.user_id is None:
                    customer.user = link_user
                    fields.append("user")
                try:
                    # Savepointed because the guard above only rules the collision
                    # out while AppUser.email still matches the address the row was
                    # linked under - changing it at Clerk reopens the case. Without
                    # the savepoint the IntegrityError poisons the outer
                    # transaction, rolling back the consumption and burning the
                    # buyer's code.
                    with transaction.atomic():
                        customer.save(update_fields=fields)
                except IntegrityError:
                    customer.refresh_from_db()

            # Inside the block because find_cart takes row locks, and with
            # request.user rather than customer.user: a guest's cart is owned by
            # its token, and handing find_cart a freshly linked user would claim
            # that cart and null the token the browser is still holding.
            cart = find_cart(
                storefront,
                request.user if request.user.is_authenticated else None,
                request.headers.get("X-Public-Cart-ID"),
            )
            cart_data = CartSerializer(cart).data if cart else None

        # Minted after commit: a rolled back transaction must not hand out a
        # token naming a customer that was never written.
        return Response(
            {
                "buyer_session": issue_buyer_token(customer),
                "expires_in": BUYER_SESSION_MAX_AGE,
                "cart": cart_data,
            },
            status=status.HTTP_200_OK,
        )