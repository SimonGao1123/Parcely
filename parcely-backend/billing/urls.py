from django.urls import path

from billing.views.onboarding import start_onboarding, sync_onboarding_status
from billing.views.purchases import MyPaymentsAPIView, MySubscriptionsAPIView

urlpatterns = [
    path('onboarding/', start_onboarding, name='stripe-onboarding'),
    path('onboarding/sync/', sync_onboarding_status, name='stripe-onboarding-sync'),
    path('purchases/orders/', MyPaymentsAPIView.as_view(), name='my-purchases-orders'),
    path(
        'purchases/subscriptions/',
        MySubscriptionsAPIView.as_view(),
        name='my-purchases-subscriptions',
    ),
]
