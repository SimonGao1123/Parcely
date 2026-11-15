"""The seller's view of who bought from one storefront.

Every view resolves the storefront through owner=request.user first, so another user's
slug is a 404 - the same answer products/views.py and requireStorefrontOwner give - and
nothing below it can be reached for a store the caller does not own. Clerk-only, through
the project default permission.
"""

import logging

import stripe
from django.db.models import Count, Exists, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Customer
from billing.connect_api import _client
from billing.models import (
    ENDED_SUBSCRIPTION_STATUSES,
    LIVE_SUBSCRIPTION_STATUSES,
    Order,
    Payment,
    Subscription,
)
from billing.serializers import (
    SellerCustomerSerializer,
    SellerPaymentSerializer,
    SellerSubscriptionSerializer,
)
from billing.views.purchases import payments_for, subscriptions_for
from billing.webhooks.payment_events import mark_subscription_ended
from store.models import StoreFront

logger = logging.getLogger(__name__)


def _owned_storefront(request, kwargs):
    return get_object_or_404(
        StoreFront, slug=kwargs["storefront_slug"], owner=request.user
    )


class StoreOrdersAPIView(generics.ListAPIView):
    serializer_class = SellerPaymentSerializer

    def get_queryset(self):
        storefront = _owned_storefront(self.request, self.kwargs)
        touching = Order.objects.filter(plan__product__storefront=storefront).values("payment")
        return payments_for(Customer.objects.filter(seller=storefront.owner_id)).filter(
            pk__in=touching
        ).select_related("customer")


class StoreSubscriptionsAPIView(generics.ListAPIView):
    serializer_class = SellerSubscriptionSerializer

    def get_queryset(self):
        storefront = _owned_storefront(self.request, self.kwargs)
        qs = subscriptions_for(Customer.objects.filter(seller=storefront.owner_id)).filter(
            product__storefront=storefront
        ).select_related("customer")
        wanted = self.request.query_params.get("status")
        if wanted == "live":
            qs = qs.filter(status__in=LIVE_SUBSCRIPTION_STATUSES)
        elif wanted == "ended":
            qs = qs.exclude(status__in=LIVE_SUBSCRIPTION_STATUSES)
        return qs


def _count(queryset):
    """A correlated COUNT, so per-customer figures don't multiply across joins."""
    return Coalesce(
        Subquery(
            queryset.order_by().values("customer").annotate(n=Count("pk")).values("n"),
            output_field=IntegerField(),
        ),
        0,
    )


def _customers_of(storefront):
    store_orders = Order.objects.filter(plan__product__storefront=storefront)
    store_payments = Payment.objects.filter(
        customer=OuterRef("pk"), pk__in=store_orders.values("payment")
    )
    live = Subscription.objects.filter(
        customer=OuterRef("pk"), status__in=LIVE_SUBSCRIPTION_STATUSES
    )
    return (
        Customer.objects.filter(seller=storefront.owner_id)
        .filter(
            Exists(store_orders.filter(customer=OuterRef("pk")))
            | Exists(Subscription.objects.filter(
                customer=OuterRef("pk"), product__storefront=storefront
            ))
        )
        .annotate(
            payment_count=_count(store_payments),
            total_spent_cents=Coalesce(
                Subquery(
                    store_payments.order_by()
                    .values("customer")
                    .annotate(total=Sum("amount_cents"))
                    .values("total"),
                    output_field=IntegerField(),
                ),
                0,
            ),
            live_subscription_count=_count(live.filter(product__storefront=storefront)),
            seller_live_subscription_count=_count(live),
        )
        .order_by("-created_at", "-id")
    )


class StoreCustomersAPIView(generics.ListAPIView):
    serializer_class = SellerCustomerSerializer

    def get_queryset(self):
        return _customers_of(_owned_storefront(self.request, self.kwargs))


def _customer_response(storefront, customer_id):
    customer = _customers_of(storefront).filter(pk=customer_id).first()
    return Response(SellerCustomerSerializer(customer).data if customer else None)


class RemoveCustomerAPIView(APIView):
    """Cancel a buyer's live subscriptions and refuse them at checkout.

    Not a delete - payments, orders and subscriptions PROTECT the row, and the seller's
    records need it. Covers every storefront the seller owns, because a Customer is per
    seller: a buyer removed at one store and still subscribed at another is not removed.
    """

    def post(self, request, *args, **kwargs):
        storefront = _owned_storefront(request, kwargs)
        customer = get_object_or_404(
            Customer, pk=kwargs["customer_id"], seller=request.user
        )

        # Blocked before cancelling, so a checkout cannot start while the loop runs.
        if customer.blocked_at is None:
            Customer.objects.filter(pk=customer.pk).update(blocked_at=timezone.now())

        account_id = request.user.stripe_account_id
        subscription_ids = (
            Subscription.objects.filter(
                customer=customer, status__in=LIVE_SUBSCRIPTION_STATUSES
            )
            .values_list("stripe_subscription_id", flat=True)
            .distinct()
        )

        failed = []
        for subscription_id in subscription_ids:
            try:
                stripe_sub = _client.v1.subscriptions.cancel(
                    subscription_id, {}, {"stripe_account": account_id}
                )
            except stripe.InvalidRequestError:
                # Most often already cancelled at Stripe, with our row not yet told.
                # Copy Stripe's answer if it is terminal; otherwise it really failed.
                try:
                    stripe_sub = _client.v1.subscriptions.retrieve(
                        subscription_id, {}, {"stripe_account": account_id}
                    )
                except stripe.StripeError:
                    stripe_sub = None
                if stripe_sub is None or stripe_sub.status not in ENDED_SUBSCRIPTION_STATUSES:
                    logger.warning("Could not cancel %s", subscription_id)
                    failed.append(subscription_id)
                    continue
            except stripe.StripeError:
                logger.warning("Could not cancel %s", subscription_id)
                failed.append(subscription_id)
                continue
            # Written now rather than left to customer.subscription.deleted, so the seller
            # sees the result. The webhook writes the same values when it lands.
            mark_subscription_ended(stripe_sub)

        if failed:
            # The block stands and the cancelled ones stay cancelled. Running it again only
            # touches the subscriptions still live, so a retry finishes the job.
            return Response(
                {"detail": f"Blocked, but {len(failed)} subscription(s) could not be cancelled. Try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return _customer_response(storefront, customer.pk)


class UnblockCustomerAPIView(APIView):
    """Lets the buyer check out again. Resubscribes no one."""

    def post(self, request, *args, **kwargs):
        storefront = _owned_storefront(request, kwargs)
        customer = get_object_or_404(
            Customer, pk=kwargs["customer_id"], seller=request.user
        )
        Customer.objects.filter(pk=customer.pk).update(blocked_at=None)
        return _customer_response(storefront, customer.pk)
