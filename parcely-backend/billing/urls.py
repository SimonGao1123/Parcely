from django.urls import path

from billing.views.onboarding import start_onboarding, sync_onboarding_status

urlpatterns = [
    path('onboarding/', start_onboarding, name='stripe-onboarding'),
    path('onboarding/sync/', sync_onboarding_status, name='stripe-onboarding-sync'),
]
