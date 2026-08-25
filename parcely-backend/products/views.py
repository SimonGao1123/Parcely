from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics

from products.models import Product, Plan
from products.serializers import ProductSummarySerializer, PlanSerializer
from store.models import StoreFront


# ProductSummarySerializer reads: display_image (FK) + plans (reverse FK).
# `storefront` in the serializer is rendered as PK — no JOIN needed.
PRODUCT_SELECT_RELATED = ('display_image',)
PRODUCT_PREFETCH = Prefetch('plans')

# For write paths (create/update), Product.clean() reads self.storefront.owner,
# so pre-join owner to avoid an extra query on save().
PRODUCT_WRITE_SELECT_RELATED = ('display_image', 'storefront__owner')


class ProductListCreateAPIView(generics.ListCreateAPIView):
    """
    MUST BE AUTHED, CREATE NEW PRODUCT AND VIEW ALL PRODUCTS FOR A SPECIFIC STOREFRONT
    """
    serializer_class = ProductSummarySerializer

    def get_queryset(self):
        return (
            Product.objects
            .select_related(*PRODUCT_SELECT_RELATED)
            .prefetch_related(PRODUCT_PREFETCH)
            .filter(
                storefront__slug=self.kwargs['storefront_slug'],
                storefront__owner=self.request.user,
            )
        )

    def perform_create(self, serializer):
        storefront = get_object_or_404(
            StoreFront,
            slug=self.kwargs['storefront_slug'],
            owner=self.request.user,
        )
        serializer.save(storefront=storefront)


class ProductUpdateAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHED, ONLY UPDATE PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = ProductSummarySerializer
    lookup_field = 'id'

    def get_queryset(self):
        return (
            Product.objects
            .select_related(*PRODUCT_WRITE_SELECT_RELATED)
            .prefetch_related(PRODUCT_PREFETCH)
            .filter(
                storefront__slug=self.kwargs['storefront_slug'],
                storefront__owner=self.request.user,
            )
        )


class ProductDeleteAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHED, ONLY DELETE PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = ProductSummarySerializer
    lookup_field = 'id'

    # No select_related: DELETE returns 204 and does not call save()/clean().
    def get_queryset(self):
        return Product.objects.filter(
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )


class PlanCreateAPIView(generics.CreateAPIView):
    """
    MUST BE AUTHED, CREATE NEW PLAN FOR SPECIFIC PRODUCT UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs['product_id'],
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )
        serializer.save(product=product)


class PlanUpdateAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHED, ONLY UPDATE PLANS UNDER PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer
    lookup_field = 'id'

    # select_related('product') because Plan.clean() reads self.product.is_subscription on save.
    def get_queryset(self):
        return Plan.objects.select_related('product').filter(
            product__storefront__slug=self.kwargs['storefront_slug'],
            product__storefront__owner=self.request.user,
            product__id=self.kwargs['product_id'],
        )


class PlanDeleteAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHED, ONLY DELETE PLANS UNDER PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer
    lookup_field = 'id'

    # No select_related: DELETE returns 204 and does not call save()/clean().
    def get_queryset(self):
        return Plan.objects.filter(
            product__storefront__slug=self.kwargs['storefront_slug'],
            product__storefront__owner=self.request.user,
            product__id=self.kwargs['product_id'],
        )
