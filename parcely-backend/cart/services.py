import re
import secrets

from .models import Cart

# token_urlsafe(32) is always 43 URL-safe characters, so anything else was not
# minted here.
PUBLIC_SESSION_ID_RE = re.compile(r"[A-Za-z0-9_-]{43}")


def generate_public_session_id():
    return secrets.token_urlsafe(32) # 256 bits, must be unguessable, not merely unique


def is_adoptable_token(token):
    # A token may name a cart at a storefront it has never been used on — that is
    # how one session spans storefronts. It may not name a cart the server never
    # minted, so the id has to already exist somewhere before it can be adopted.
    # Without the shape check an over-long header would reach the max_length=255
    # column and surface as a 500 rather than a rejection.
    if not token or not PUBLIC_SESSION_ID_RE.fullmatch(token):
        return False
    return Cart.objects.filter(public_session_id=token).exists()


def find_cart(storefront, user, token):
    # Lookup only — callers that may create decide that for themselves, so a
    # page view never writes a cart row.
    #
    # The two owners are looked up separately rather than as one OR: a signed-in
    # shopper carrying a token has two distinct carts, and a single query would
    # return an arbitrary one of them.
    token_cart = (
        Cart.objects.select_for_update().filter(storefront=storefront, public_session_id=token).first()
        if token
        else None
    )

    if user is None:
        return token_cart

    user_cart = Cart.objects.select_for_update().filter(storefront=storefront, user=user).first()

    if token_cart is None:
        return user_cart

    if user_cart is None:
        # Claim rather than merge: nothing to merge into, so the anonymous cart
        # changes owner. It loses its token, but the session keeps it — the same
        # id still owns this shopper's carts at other storefronts.
        token_cart.user = user
        token_cart.public_session_id = None
        token_cart.save()
        return token_cart

    merge_carts(token_cart, user_cart)
    return user_cart


def merge_carts(source, target):
    # Signing in with a cart already waiting: the two must collapse, because
    # the owner-per-storefront constraint forbids keeping both and dropping
    # either would lose whatever the shopper picked out.
    target_items = {item.plan_id: item for item in target.items.all()}

    for item in source.items.select_related("plan__product"):
        existing = target_items.get(item.plan_id)
        if existing is None:
            item.cart = target
            item.save()
        elif not item.plan.product.is_subscription:
            existing.quantity += item.quantity
            existing.save()
        # A subscription already in the target stays at its single allowed
        # unit; the duplicate goes with the source cart below.

    source.delete()
