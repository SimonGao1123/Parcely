from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from store.access import visible_storefront_q
from store.models import StoreFront

from .models import Cart, CartItem
from .serializers import CartItemSerializer, CartSerializer
from .services import find_cart, generate_public_session_id, is_adoptable_token


def _caller(request):
    return (
        request.user if request.user.is_authenticated else None,
        request.headers.get("X-Public-Cart-ID"),
    )


class CreateCartItemAPIView(APIView):
    # Shopping does not require an account; the cart token is the only identity.
    # Without this the project-wide IsClerkAuthenticated default would 403 every
    # anonymous shopper.
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )

        serializer = CartItemSerializer(data=request.data, context={"storefront": storefront})
        serializer.is_valid(raise_exception=True)
        plan = serializer.validated_data["plan"]
        quantity = serializer.validated_data["quantity"]

        cart = self._resolve_cart(request, storefront)

        # Adding a plan already in the cart tops it up rather than colliding with
        # the (cart, plan) unique constraint. Safe as a read-modify-write because
        # _resolve_cart holds a row lock on the cart for the transaction.
        #
        # A subscription is the exception: one is the only legal quantity, so
        # pressing add again leaves the cart as it is instead of failing
        # validation on the way to a quantity it can never have.
        item = CartItem.objects.filter(cart=cart, plan=plan).first()
        if item is None:
            CartItem.objects.create(cart=cart, plan=plan, quantity=quantity)
        elif not plan.product.is_subscription:
            item.quantity += quantity
            item.save()

        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _resolve_cart(request, storefront):
        user, token = _caller(request)

        cart = find_cart(storefront, user, token)
        if cart is not None:
            return cart

        # get_or_create rather than create: select_for_update cannot lock a row
        # that does not exist yet, so two simultaneous first adds would otherwise
        # race each other into the unique constraint.
        if user is not None:
            cart, _ = Cart.objects.get_or_create(storefront=storefront, user=user)
            return cart

        # A session id the server minted keys a new cart at this storefront —
        # that is how one session spans storefronts. Anything else, including a
        # token whose carts have all expired, starts a new session.
        session_id = token if is_adoptable_token(token) else generate_public_session_id()
        cart, _ = Cart.objects.get_or_create(storefront=storefront, public_session_id=session_id)
        return cart


class UpdateDeleteCartItemAPIView(APIView):
    """
    Can only edit quantity. A quantity of 0 removes the item, so the client can
    decrement to nothing without a second endpoint.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def patch(self, request, *args, **kwargs):
        storefront, cart_item = self._owned_item(request, kwargs)

        quantity = request.data.get("quantity")
        if quantity is None:
            return Response({"quantity": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"quantity": "Must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)

        # Handled before the serializer because zero is a delete signal here, not
        # a quantity — the model's minimum of one would reject it.
        if quantity == 0:
            cart_item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Through the serializer rather than a direct save so the subscription
        # rule comes back as a 400 naming the field. Model validation raises
        # Django's ValidationError, which DRF does not translate, so saving
        # directly turns a bad quantity into a 500.
        serializer = CartItemSerializer(
            cart_item,
            data={"quantity": quantity},
            partial=True,
            context={"storefront": storefront},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def delete(self, request, *args, **kwargs):
        _, cart_item = self._owned_item(request, kwargs)
        cart_item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _owned_item(request, kwargs):
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )
        cart_item = get_object_or_404(
            CartItem.objects.select_related("cart", "plan__product").filter(cart__storefront=storefront),
            id=kwargs["cart_item_id"],
        )

        cart = cart_item.cart
        token = request.headers.get("X-Public-Cart-ID")

        if cart.user_id is not None:
            owned = request.user.is_authenticated and cart.user_id == request.user.id
        elif cart.public_session_id:
            owned = bool(token) and cart.public_session_id == token
        else:
            # Unreachable through save(), which enforces one owner or the other,
            # but a queryset .update() skips full_clean. An ownerless cart
            # belongs to nobody rather than to everybody.
            owned = False

        if not owned:
            # 404 over 403: whether this id names a row on someone else's cart is
            # not the caller's business.
            raise Http404

        return storefront, cart_item


class ClearCartAPIView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def delete(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )
        user, token = _caller(request)

        # Resolved the same way as every other endpoint, so a shopper who added
        # anonymously and then signed in can still clear the cart they built.
        cart = find_cart(storefront, user, token)
        if cart is None:
            raise Http404

        cart.items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GetCartAPIView(APIView):
    permission_classes = [AllowAny]

    # Atomic because resolving can claim or merge, and because find_cart locks
    # the rows it returns.
    @transaction.atomic
    def get(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )
        user, token = _caller(request)

        # Deliberately does not create: a page view, including a crawler's,
        # should never leave a cart row behind.
        cart = find_cart(storefront, user, token)
        if cart is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
