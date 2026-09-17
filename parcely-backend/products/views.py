from contextlib import contextmanager

import stripe
from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import APIException

from products import stripe_catalog
from products.models import Product, Plan
from products.serializers import ProductSummarySerializer, PlanSerializer
from products.services import create_product_page
from products.stripe_catalog import PRICE_FIELDS, PRODUCT_SYNC_FIELDS
from store.models import StoreFront


# ProductSummarySerializer reads: display_image (FK) + plans (reverse FK).
# `storefront` in the serializer is rendered as PK — no JOIN needed.
PRODUCT_SELECT_RELATED = ('display_image',)
PRODUCT_PREFETCH = Prefetch('plans')

# For write paths (create/update), Product.clean() reads self.storefront.owner,
# so pre-join owner to avoid an extra query on save(). The catalog sync reads the
# same chain for the connected account id.
PRODUCT_WRITE_SELECT_RELATED = ('display_image', 'storefront__owner')

# Plan write paths resolve the seller through product -> storefront -> owner.
PLAN_WRITE_SELECT_RELATED = ('product__storefront__owner',)


class StripeUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = 'Stripe rejected the catalog change. Nothing was saved, try again.'


class SellerNotOnboarded(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Finish Stripe onboarding before editing the catalog.'


@contextmanager
def stripe_guard():
    """Turns a Stripe failure into a response instead of a 500.

    Raised inside the surrounding atomic block on purpose: the rollback is the point.
    A committed row with no stripe_price_id looks sellable and fails at checkout,
    which the buyer discovers; an orphaned prod_/price_ that no row references is
    inert. Of the two, prefer the orphan.
    """
    try:
        yield
    except stripe_catalog.StripeAccountMissing as exc:
        raise SellerNotOnboarded() from exc
    except stripe.StripeError as exc:
        raise StripeUnavailable() from exc


def _snapshot(model, pk, fields):
    """Field values as the database currently holds them.

    Read before serializer.save(), because DRF assigns onto serializer.instance in
    place - afterwards the "old" value is the new one and every comparison is equal.
    """
    return model.objects.filter(pk=pk).values(*fields).first() or {}


def _changed(old, obj, fields):
    return any(old.get(f) != getattr(obj, f) for f in fields)


class ProductListCreateAPIView(generics.ListCreateAPIView):
    """
    MUST BE AUTHED, CREATE NEW PRODUCT AND VIEW ALL PRODUCTS FOR A SPECIFIC STOREFRONT
    """
    serializer_class = ProductSummarySerializer
    # Unpaginated, unlike the storefront lists. Both callers - the catalogue
    # screen and the editor's product picker - need every product, and a picker
    # that silently stopped at PAGE_SIZE would hide the rest with no way to
    # reach them. Products are bounded per storefront in a way storefronts are
    # not.
    pagination_class = None

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

    # atomic so a product can never exist without the page that displays it
    # No Stripe call: the local Product is never pushed (STRIPE.md §2.1), and a
    # product has no plans yet at creation time.
    @transaction.atomic
    def perform_create(self, serializer):
        storefront = get_object_or_404(
            StoreFront,
            slug=self.kwargs['storefront_slug'],
            owner=self.request.user,
        )
        product = serializer.save(storefront=storefront)
        create_product_page(product)


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

    @transaction.atomic
    def perform_update(self, serializer):
        old = _snapshot(Product, serializer.instance.pk, PRODUCT_SYNC_FIELDS)
        product = serializer.save()
        # Fans out because every child plan's Stripe Product takes its name,
        # description and active flag from here. Gated so that a PATCH of
        # max_capacity or display_image costs no round trips at all.
        if _changed(old, product, PRODUCT_SYNC_FIELDS):
            with stripe_guard():
                stripe_catalog.resync_product(product)


class ProductDeleteAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHED, ONLY DELETE PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = ProductSummarySerializer
    lookup_field = 'id'

    # select_related for the owner's account id, which the archive calls need and
    # which is unreachable once the rows are gone.
    def get_queryset(self):
        return Product.objects.select_related('storefront__owner').filter(
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        # Read the children first. Django's cascade collector deletes Plan rows
        # without calling Plan.delete(), so after the delete below there is no way
        # left to learn which Stripe objects belonged to this product.
        account_id = instance.storefront.owner.stripe_account_id
        stripe_ids = stripe_catalog.child_stripe_ids(instance)
        instance.delete()
        if account_id:
            with stripe_guard():
                for stripe_product_id, stripe_price_id in stripe_ids:
                    stripe_catalog.archive_plan_objects(
                        account_id, stripe_product_id, stripe_price_id
                    )


class PlanCreateAPIView(generics.CreateAPIView):
    """
    MUST BE AUTHED, CREATE NEW PLAN FOR SPECIFIC PRODUCT UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        product = get_object_or_404(
            Product.objects.select_related('storefront__owner'),
            id=self.kwargs['product_id'],
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )
        plan = serializer.save(product=product)
        with stripe_guard():
            stripe_catalog.create_plan_objects(plan)
        plan.save(update_fields=['stripe_product_id', 'stripe_price_id', 'updated_at'])


class PlanUpdateAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHED, ONLY UPDATE PLANS UNDER PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer
    lookup_field = 'id'

    # select_related('product') because Plan.clean() reads self.product.is_subscription on save.
    def get_queryset(self):
        return Plan.objects.select_related(*PLAN_WRITE_SELECT_RELATED).filter(
            product__storefront__slug=self.kwargs['storefront_slug'],
            product__storefront__owner=self.request.user,
            product__id=self.kwargs['product_id'],
        )

    @transaction.atomic
    def perform_update(self, serializer):
        old = _snapshot(Plan, serializer.instance.pk, (*PRICE_FIELDS, 'title'))
        plan = serializer.save()

        with stripe_guard():
            if _changed(old, plan, PRICE_FIELDS):
                # Prices are immutable in Stripe, so an edit means a new Price and
                # the old one archived - which is what keeps existing subscribers
                # billing at the amount they agreed to.
                stripe_catalog.replace_plan_price(plan)
                plan.save(update_fields=[
                    'stripe_product_id', 'stripe_price_id', 'updated_at',
                ])
            elif old.get('title') != plan.title:
                # Product name is the only other thing a plan edit can move, and
                # the Stripe Product is mutable.
                stripe_catalog.update_plan_product(plan)


class PlanDeleteAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHED, ONLY DELETE PLANS UNDER PRODUCTS UNDER STOREFRONT OWNED BY THE AUTHED USER
    """
    serializer_class = PlanSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Plan.objects.select_related(*PLAN_WRITE_SELECT_RELATED).filter(
            product__storefront__slug=self.kwargs['storefront_slug'],
            product__storefront__owner=self.request.user,
            product__id=self.kwargs['product_id'],
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        account_id = instance.product.storefront.owner.stripe_account_id
        stripe_product_id = instance.stripe_product_id
        stripe_price_id = instance.stripe_price_id
        instance.delete()
        if account_id:
            with stripe_guard():
                stripe_catalog.archive_plan_objects(
                    account_id, stripe_product_id, stripe_price_id
                )
