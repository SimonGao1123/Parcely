from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from store.access import visible_storefront_q
from store.models import StoreFront

from .models import Cart, CartItem
from .serializers import CartItemSerializer, CartSerializer
from .services import generate_public_session_id, merge_carts


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
        # The header is a lookup key only. An unrecognised token gets a fresh
        # server-minted one rather than being adopted: letting the caller name its
        # own cart would let it pick a guessable id and hand out access.
        token = request.headers.get("X-Public-Cart-ID")
        user = request.user if request.user.is_authenticated else None

        # Looked up separately rather than as one OR: a signed-in shopper carrying
        # a token has two distinct carts, and a single query would return an
        # arbitrary one of them.
        token_cart = (
            Cart.objects.select_for_update().filter(storefront=storefront, public_session_id=token).first()
            if token
            else None
        )

        if user is None:
            return token_cart or Cart.objects.create(
                storefront=storefront, public_session_id=generate_public_session_id()
            )

        user_cart = Cart.objects.select_for_update().filter(storefront=storefront, user=user).first()

        if token_cart is None:
            return user_cart or Cart.objects.create(storefront=storefront, user=user)

        if user_cart is None:
            # Claim rather than merge: nothing to merge into, so the anonymous
            # cart just changes owner and loses its token.
            token_cart.user = user
            token_cart.public_session_id = None
            token_cart.save()
            return token_cart

        merge_carts(token_cart, user_cart)
        return user_cart


class UpdateDeleteCartItemAPIView(APIView):
    """
    Can only edit quantity, can delete item by writing quantity of 0 (2 in one)
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def patch(self, request, *args, **kwargs):
        if not request.data.get("quantity"):
            return Response({"error": "Quantity is required"}, status=status.HTTP_400_BAD_REQUEST)
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )
        cart_item = get_object_or_404(
            CartItem.objects.filter(cart__storefront=storefront),
            id=kwargs["cart_item_id"],
        )
        # ONLY can edit quantity, can delete item by writing quantity of 0 (2 in one)
        if request.data.get("quantity") == 0:
            cart_item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        cart_item.quantity = request.data.get("quantity")
        cart_item.save()
        return Response(CartItemSerializer(cart_item).data, status=status.HTTP_200_OK)

class ClearCartAPIView(APIView):
    permission_classes = [AllowAny]
    @transaction.atomic
    def delete(self, request, *args, **kwargs):
        storefront = get_object_or_404(
            StoreFront.objects.filter(visible_storefront_q(request.user)),
            slug=kwargs["storefront_slug"],
        )
        public_session_id = request.headers.get("X-Public-Cart-ID")
        if not request.user.is_authenticated and not public_session_id:
            return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        
        if request.user.is_authenticated:
            cart = get_object_or_404(
                Cart.objects.filter(storefront=storefront, user=request.user),
            )
            cart.items.all().delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        
        cart = get_object_or_404(
            Cart.objects.filter(storefront=storefront, public_session_id=public_session_id),
        )
        cart.items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
        
