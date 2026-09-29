from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from accounts.models import AppUser
from common.models import TimestampedModel
from products.models import Plan
from store.models import StoreFront


class Cart(TimestampedModel):
    # Nullable so an anonymous cart can be claimed on sign-in later. Today every
    # cart is token-owned and this stays null.
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="carts", null=True, blank=True)
    # The cart's credential, not merely its name: whoever presents it gets the
    # cart. Minted server-side, never taken from the request.
    public_session_id = models.CharField(max_length=255, null=True, blank=True)
    storefront = models.ForeignKey(StoreFront, on_delete=models.CASCADE, related_name="carts")

    # Written when a Checkout Session is created, so the handler for that session can find
    # the cart it came from and clear it once the money has moved.
    stripe_checkout_session_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        # One cart per owner per storefront. Conditional because a cart has
        # exactly one of the two owners, so the other column is null on every
        # row and plain unique_together would index nulls that never collide.
        constraints = [
            models.UniqueConstraint(
                fields=["user", "storefront"],
                condition=Q(user__isnull=False),
                name="unique_user_cart_per_storefront",
            ),
            models.UniqueConstraint(
                fields=["public_session_id", "storefront"],
                condition=Q(public_session_id__isnull=False),
                name="unique_session_cart_per_storefront",
            ),
        ]

    def clean(self):
        super().clean()
        # Both set would let a shared browser replay the token into the signed-in
        # user's cart; neither set would make the row unreachable.
        if bool(self.user_id) == bool(self.public_session_id):
            raise ValidationError("A cart must have either a user or a public session id, not both")

        # if self.user and self.user == self.storefront.owner:
        #     raise ValidationError("A cart cannot be owned by the storefront owner")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Cart for {self.user.email if self.user else self.public_session_id} at {self.storefront.name}"


class CartItem(TimestampedModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="cart_items")  # not buying a product, buying just a plan
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("cart", "plan")

    def clean(self):
        super().clean()
        if self.quantity < 1:
            raise ValidationError("Quantity must be at least 1")

        if self.plan.product.storefront != self.cart.storefront:
            raise ValidationError("Plan must be from the same storefront as the cart")

        # Subscriptions are bought one at a time, straight from the product page. A cart
        # holding one would drag the whole Checkout Session into subscription mode, since
        # Stripe refuses a recurring price in payment mode - so five one-time items would
        # be billed on a subscription's first invoice. Trials make it worse: Stripe puts
        # them on the subscription rather than the line, so two plans with different trials
        # in one cart have no valid session between them.
        if self.plan.product.is_subscription:
            raise ValidationError(
                "Subscriptions are bought directly, not through the cart"
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Cart item for {self.cart.user.email if self.cart.user else self.cart.public_session_id} at {self.cart.storefront.name} - {self.plan.title} x {self.quantity}"
