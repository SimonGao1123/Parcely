import secrets
def generate_public_session_id():
    return secrets.token_urlsafe(32) # 256 bits, must be unguessable, not merely unique

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
