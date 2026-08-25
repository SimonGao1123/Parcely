from django.urls import path
from products.views import (
    ProductListCreateAPIView,
    ProductUpdateAPIView,
    ProductDeleteAPIView,
    PlanCreateAPIView,
    PlanUpdateAPIView,
    PlanDeleteAPIView,
)

# sub path urls from storefronts/<str:storefront_slug>/products/
urlpatterns = [
    path('', ProductListCreateAPIView.as_view(), name='product-list-create'),
    path('<int:id>/update/', ProductUpdateAPIView.as_view(), name='product-update'),
    path('<int:id>/delete/', ProductDeleteAPIView.as_view(), name='product-delete'),

    path('<int:product_id>/plans/create/', PlanCreateAPIView.as_view(), name='plan-create'),
    path('<int:product_id>/plans/<int:id>/update/', PlanUpdateAPIView.as_view(), name='plan-update'),
    path('<int:product_id>/plans/<int:id>/delete/', PlanDeleteAPIView.as_view(), name='plan-delete'),
]