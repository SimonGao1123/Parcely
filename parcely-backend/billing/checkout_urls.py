"""The buyer-facing checkout flow, mounted under storefronts/<storefront_slug>/checkout/.

Separate from billing/urls.py because the two have different audiences and different
mount points: that one is the seller's onboarding under /billing/, this one is the
buyer's and only makes sense nested inside a storefront.

The OTP routes are accounts' views but live here rather than in accounts/urls.py for two
reasons. They are storefront-scoped, so they have to nest under this prefix, and they are
step one of checkout - verifying the buyer's email is what lets billing attach a Stripe
Customer before a session is created.
"""

from django.urls import path

from accounts.views import SendOTPEmailAPIView, VerifyEmailAPIView
from billing.views.checkout import (
    CreateCheckoutSessionAPIView,
    CreateSubscriptionCheckoutSessionAPIView,
)

urlpatterns = [
    path('send-otp/', SendOTPEmailAPIView.as_view(), name='send-otp-email'),
    path('verify-email/', VerifyEmailAPIView.as_view(), name='verify-email'),
    path('session/', CreateCheckoutSessionAPIView.as_view(), name='checkout-session'),
    path(
        'subscription/',
        CreateSubscriptionCheckoutSessionAPIView.as_view(),
        name='checkout-subscription',
    ),
]
