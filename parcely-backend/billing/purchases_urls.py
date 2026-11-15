"""Storefront-scoped routes, mounted under storefronts/<storefront_slug>/.

purchases/ is the buyer's view of this one seller; dashboard/ is the seller's view of
this one storefront. Both nest here because both only mean anything inside a store.
"""

from django.urls import path

from billing.views import dashboard
from billing.views.purchases import StorePaymentsAPIView, StoreSubscriptionsAPIView

urlpatterns = [
    path('purchases/orders/', StorePaymentsAPIView.as_view(), name='store-purchases-orders'),
    path(
        'purchases/subscriptions/',
        StoreSubscriptionsAPIView.as_view(),
        name='store-purchases-subscriptions',
    ),
    path('dashboard/orders/', dashboard.StoreOrdersAPIView.as_view(), name='dashboard-orders'),
    path(
        'dashboard/subscriptions/',
        dashboard.StoreSubscriptionsAPIView.as_view(),
        name='dashboard-subscriptions',
    ),
    path(
        'dashboard/customers/',
        dashboard.StoreCustomersAPIView.as_view(),
        name='dashboard-customers',
    ),
    path(
        'dashboard/customers/<int:customer_id>/remove/',
        dashboard.RemoveCustomerAPIView.as_view(),
        name='dashboard-customer-remove',
    ),
    path(
        'dashboard/customers/<int:customer_id>/unblock/',
        dashboard.UnblockCustomerAPIView.as_view(),
        name='dashboard-customer-unblock',
    ),
]
