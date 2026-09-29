import stripe
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.buyer_session import buyer_from_request
from billing import capacity, stripe_checkout
from billing.models import LIVE_SUBSCRIPTION_STATUSES, Subscription
from cart.models import Cart
from cart.services import find_cart
from products.models import Plan
from store.models import StoreFront


class _BuyerCheckoutAPIView(APIView):
    """Shared front door for both checkout flows.

    The buyer session token is the identity here, not Clerk - shoppers need no account.
    Without AllowAny the project-wide default would 403 every guest.
    """
    permission_classes = [AllowAny]

    @staticmethod
    def _storefront_and_buyer(request, kwargs):
        """(storefront, customer, error_response) - the caller returns the error if set."""
        storefront = get_object_or_404(
            StoreFront, slug=kwargs["storefront_slug"], is_draft=False
        )

        # Re-reads the Customer scoped to this storefront's owner rather than trusting the
        # token's payload, so a token minted at another seller cannot transact here.
        customer = buyer_from_request(request, storefront)
        if customer is None:
            return storefront, None, Response(
                {"detail": "Verify your email before checking out."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not storefront.owner.can_sell:
            return storefront, None, Response(
                {"detail": "This store cannot accept payments yet."},
                status=status.HTTP_409_CONFLICT,
            )

        return storefront, customer, None


class CreateCheckoutSessionAPIView(_BuyerCheckoutAPIView):
    """One-time purchases only.

    Always payment mode. Subscriptions cannot reach here - the cart refuses to hold them -
    so there is no capacity to check, no trial to apply and no reservation to take. All of
    that lives on the subscription endpoint below, the only one that can oversell anything.
    """

    def post(self, request, *args, **kwargs):
        storefront, customer, error = self._storefront_and_buyer(request, kwargs)
        if error:
            return error

        # Atomic only around find_cart, which takes row locks and may claim or merge.
        with transaction.atomic():
            cart = find_cart(
                storefront,
                request.user if request.user.is_authenticated else None,
                request.headers.get("X-Public-Cart-ID"),
            )
            if cart is None:
                return Response(
                    {"cart": "No cart to check out."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            items = list(cart.items.select_related("plan__product").order_by("id"))

        if not items:
            return Response(
                {"cart": "Your cart is empty."}, status=status.HTTP_400_BAD_REQUEST
            )

        if any(not i.plan.stripe_price_id for i in items):
            return Response(
                {"cart": "Some items are not available for purchase right now."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            session = stripe_checkout.create_cart_session(
                customer=customer, cart=cart, items=items, storefront=storefront
            )
        except stripe.StripeError:
            return Response(
                {"detail": "Could not start checkout, try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Through the queryset rather than cart.save(): full_clean has nothing to add here,
        # and this cannot trip over a cart another request has since touched.
        Cart.objects.filter(pk=cart.pk).update(stripe_checkout_session_id=session.id)

        return Response({"url": session.url, "session_id": session.id})


class CreateSubscriptionCheckoutSessionAPIView(_BuyerCheckoutAPIView):
    """Buy one subscription directly, with no cart involved.

    A cart cannot express this purchase. Stripe puts a trial on the subscription rather
    than on a line item, and one session creates at most one subscription, so two plans
    with different trials in one basket have no valid session between them. One plan per
    session removes the conflict rather than rejecting the buyer for it.
    """

    def post(self, request, *args, **kwargs):
        storefront, customer, error = self._storefront_and_buyer(request, kwargs)
        if error:
            return error

        plan_id = request.data.get("plan_id")
        if plan_id is None:
            return Response(
                {"plan_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Scoped to the storefront in the lookup, so a plan from another seller is a 404
        # rather than a leak that it exists at all.
        plan = get_object_or_404(
            Plan.objects.select_related("product"),
            id=plan_id,
            product__storefront=storefront,
        )

        if not plan.product.is_active:
            return Response(
                {"plan_id": "This product is not for sale."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not plan.product.is_subscription:
            return Response(
                {"plan_id": "This is a one-time product - add it to the cart instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not plan.stripe_price_id:
            return Response(
                {"plan_id": "This plan is not available for purchase right now."},
                status=status.HTTP_409_CONFLICT,
            )

        # Without this the buyer pays on Stripe's page and the webhook then collides with
        # uniq_subscription_customer_product_live - a charge with no subscription row. This
        # check is what keeps a real buyer from ever reaching that constraint.
        if Subscription.objects.filter(
            customer=customer,
            product_id=plan.product_id,
            status__in=LIVE_SUBSCRIPTION_STATUSES,
        ).exists():
            return Response(
                {"plan_id": f"You are already subscribed to {plan.product.name}."},
                status=status.HTTP_409_CONFLICT,
            )

        # Last, because it is the only step that writes. Every cheap rejection above
        # happens before a row is locked.
        try:
            with transaction.atomic():
                reservation = capacity.claim(customer, plan)
        except capacity.CapacityFull as full:
            return Response(
                {"plan_id": f"No spots left for {full.product.name}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Outside the transaction on purpose: holding the Product row lock across a network
        # round trip would queue every checkout on a popular product behind the slowest
        # buyer's connection. billing/views/onboarding.py does span a Stripe call with a
        # lock, but justifies it as once-per-seller, which this is not.
        try:
            session = stripe_checkout.create_subscription_session(
                customer=customer,
                plan=plan,
                storefront=storefront,
                reservation=reservation,
            )
        except stripe.StripeError:
            # Otherwise a failed call sits on a capacity slot for the full 30 minutes.
            capacity.release(reservation)
            return Response(
                {"detail": "Could not start checkout, try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        capacity.attach_session(reservation, session.id)

        return Response({"url": session.url, "session_id": session.id})
