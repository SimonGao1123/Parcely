from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import AppUser, CardPaymentsStatus
from billing import connect, handlers


@api_view(['POST'])
def start_onboarding(request):
    """Return a Stripe-hosted onboarding link for the signed-in seller.

    Takes no body - the seller is request.user. Accepting an account id would be an
    IDOR. DRF's defaults already supply Clerk auth, so request.user is an AppUser.
    """
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    user = request.user

    if user.stripe_account_id:
        # Converge before gating, because every check below reads the local status and
        # there is no Connect webhook endpoint yet to keep it honest. A seller who
        # finished onboarding but closed the tab before the return URL fired is still
        # `restricted` here, so without this they get refused a storefront and pushed
        # back through onboarding they already completed - and every retry reads the
        # same stale row, so there is no way out. One extra Stripe call on an explicit
        # button press is a fair price.
        handlers.refresh_card_payments_status(user.stripe_account_id)
        # Refetched because that writes via a queryset UPDATE.
        user = AppUser.objects.get(pk=user.pk)

    if user.card_payments_status == CardPaymentsStatus.UNSUPPORTED:
        return Response(
            {"detail": "This Stripe account is closed."},
            status=status.HTTP_409_CONFLICT,
        )

    if user.can_sell:
        # Null url rather than an error, so the frontend has one code path.
        return Response({
            "url": None,
            "stripe_account_id": user.stripe_account_id,
            "card_payments_status": user.card_payments_status,
        })

    with transaction.atomic():
        # Locked because two concurrent requests could otherwise both see a null
        # stripe_account_id and each create a connected account, orphaning one. The
        # lock spans a Stripe call, which is acceptable on a once-per-seller endpoint.
        user = AppUser.objects.select_for_update().get(pk=user.pk)

        if user.stripe_account_id:
            account_id = user.stripe_account_id
        else:
            account = connect.create_connected_account(user)
            account_id = account.id
            # include= was passed on create, so the status is already here.
            user.stripe_account_id = account_id
            user.card_payments_status = connect.merchant_status(account)
            user.save(update_fields=[
                "stripe_account_id", "card_payments_status", "updated_at",
            ])

    # Always account_onboarding, never account_update: Stripe rejects
    # account_update until onboarding has actually completed ("Valid types for this
    # account are [account_onboarding]"), and can_sell returned above, so everyone
    # reaching this line is by definition still onboarding. account_update belongs
    # to a future "manage Stripe details" action for sellers who are already active.
    #
    # Minting a link is not a mutation - it is Stripe's documented refresh
    # behaviour, so a double click is idempotent by construction.
    url = connect.create_onboarding_link(account_id, use_case_type="account_onboarding")

    return Response({
        "url": url,
        "stripe_account_id": account_id,
        "card_payments_status": user.card_payments_status,
    })


@api_view(['POST'])
def sync_onboarding_status(request):
    """Converge the signed-in seller's status with Stripe's and report the result.

    Stripe's return_url is not a completion signal - the seller can close the flow
    early, and capability_status_updated may not have landed yet. Refetching here
    makes the profile page truthful the moment they come back rather than whenever
    the webhook arrives.
    """
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Off request.user, never the body - accepting an account id would let any
    # seller read another's state.
    account_id = request.user.stripe_account_id
    if not account_id:
        # Not an error: the seller may have bounced through the return URL before an
        # account ever existed. Nothing to converge, so report the absence.
        return Response({"stripe_account_id": None, "card_payments_status": None})

    handlers.refresh_card_payments_status(account_id)

    # Refetched because refresh_card_payments_status writes via a queryset UPDATE, so
    # the in-memory request.user still carries the pre-sync status.
    user = AppUser.objects.get(pk=request.user.pk)
    return Response({
        "stripe_account_id": user.stripe_account_id,
        "card_payments_status": user.card_payments_status,
    })
