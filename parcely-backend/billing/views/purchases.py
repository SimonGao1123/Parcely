"""A buyer's own purchases.

Two doors onto the same lists:
    billing/purchases/...                  signed in, every seller the buyer ever paid
    storefronts/<slug>/purchases/...       one seller - signed in, or a purchases token

A signed-in buyer owns the Customers linked to them and the ones under their Clerk email.
Clerk has verified that address, and it is what catches a guest purchase made before the
account existed. A guest gets only the one Customer their purchases-scope code proved.
The checkout token is never accepted here; see accounts/buyer_session.py.
"""

from django.db.models import Case, IntegerField, Prefetch, Q, When
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.buyer_session import purchases_buyer_from_request
from accounts.models import Customer
from billing.models import LIVE_SUBSCRIPTION_STATUSES, Order, Payment, Subscription
from billing.serializers import PaymentSerializer, SubscriptionSerializer
from store.models import StoreFront


def signed_in_customers(user):
    return Customer.objects.filter(Q(user=user) | Q(email__iexact=user.email))


def payments_for(customers):
    return (
        Payment.objects.filter(customer__in=customers)
        .prefetch_related(
            Prefetch(
                "orders",
                queryset=Order.objects.select_related("plan__product__storefront").order_by("id"),
            )
        )
        .order_by("-created_at", "-id")
    )


def subscriptions_for(customers):
    return (
        Subscription.objects.filter(customer__in=customers)
        .select_related("plan", "product__storefront")
        .prefetch_related(
            Prefetch(
                "orders",
                queryset=Order.objects.select_related("payment").order_by("-created_at"),
            )
        )
        # Live first: the one a buyer is still paying for matters more than one they left.
        .annotate(
            _ended=Case(
                When(status__in=LIVE_SUBSCRIPTION_STATUSES, then=0),
                default=1,
                output_field=IntegerField(),
            )
        )
        .order_by("_ended", "-created_at", "-id")
    )


class MySubscriptionsAPIView(generics.ListAPIView):
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        return subscriptions_for(signed_in_customers(self.request.user))


class MyPaymentsAPIView(generics.ListAPIView):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return payments_for(signed_in_customers(self.request.user))


class _StorePurchasesAPIView(generics.ListAPIView):
    """AllowAny because a guest is identified by the purchases token, not Clerk."""

    permission_classes = [AllowAny]

    def _customers(self):
        storefront = get_object_or_404(
            StoreFront, slug=self.kwargs["storefront_slug"], is_draft=False
        )
        if self.request.user.is_authenticated:
            return signed_in_customers(self.request.user).filter(seller=storefront.owner_id)
        customer = purchases_buyer_from_request(self.request, storefront)
        if customer is None:
            return None
        return Customer.objects.filter(pk=customer.pk)

    def list(self, request, *args, **kwargs):
        customers = self._customers()
        if customers is None:
            return Response(
                {"detail": "Verify your email to see your purchases."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        self._customer_qs = customers
        return super().list(request, *args, **kwargs)


class StoreSubscriptionsAPIView(_StorePurchasesAPIView):
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        return subscriptions_for(self._customer_qs)


class StorePaymentsAPIView(_StorePurchasesAPIView):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return payments_for(self._customer_qs)
