"""Pushes the local catalog to each seller's connected account.

STRIPE.md §2.1: every `Plan` becomes its own Stripe Product paired with one Price.
The local `Product` is never pushed - it stays grouping and display metadata. The
obvious mapping (Product -> Product, Plan -> Price) loses per-plan receipts, because
the Price name is never rendered and `nickname` is dashboard-internal.

Nothing here belongs in `Plan.save()`: a cascade delete or any implicit save would
fire a network call. `billing/views/onboarding.py` set the convention of calling
Stripe from the view.
"""

from django.db.models import Q

from billing.connect import _client
from products.models import Plan

# Everything that decides the Stripe Price. Changing any of them cannot update the
# Price in place (§2.2) - it forces archive-and-recreate.
PRICE_FIELDS = ("price_cents", "billing_interval", "billing_interval_count")

# Everything on the local Product that the Stripe Product mirrors. A PATCH touching
# only max_capacity or display_image must not cost a round trip per plan.
PRODUCT_SYNC_FIELDS = ("name", "description", "is_active")


class StripeAccountMissing(Exception):
    """The seller has no connected account, so there is nowhere to push to."""


def _account_id(product) -> str:
    account_id = product.storefront.owner.stripe_account_id
    if not account_id:
        # Never let this reach Stripe as None. An absent stripe_account creates the
        # object on the *platform* account instead of erroring, which silently puts
        # one seller's catalog in the shared account.
        raise StripeAccountMissing(
            f"Storefront {product.storefront_id} owner has no stripe_account_id"
        )
    return account_id


def _product_name(plan) -> str:
    # "Coffee — Small" rather than "Coffee", so two plans under one product do not
    # produce indistinguishable receipts.
    if plan.title:
        return f"{plan.product.name} — {plan.title}"
    return plan.product.name


def _metadata(plan) -> dict:
    # Mirrors the app_user_id already on connected accounts. These are the only
    # handle on an object orphaned by a rollback after Stripe returned.
    return {
        "plan_id": str(plan.id),
        "product_id": str(plan.product_id),
        "storefront_id": str(plan.product.storefront_id),
    }


def _price_params(plan) -> dict:
    params = {
        "product": plan.stripe_product_id,
        "unit_amount": plan.price_cents,
        # From the storefront, never the plan - that centralization is what keeps
        # every line item on one invoice in a single currency, which Stripe requires.
        "currency": plan.product.storefront.currency.lower(),
        "metadata": _metadata(plan),
    }
    if plan.product.is_subscription:
        # In Stripe the one-time/recurring distinction lives here, not on the
        # Product. recurring.trial_period_days does exist but is deliberately
        # unset: it only applies to subscriptions created with the legacy
        # trial_from_plan=true, so setting it here would look like it worked and
        # silently do nothing. Checkout passes subscription_data.trial_period_days.
        #
        # interval_count has a Stripe ceiling of 3 years / 36 months / 156 weeks
        # that Plan only validates as >= 1, so an out-of-range value fails here
        # rather than at save time.
        params["recurring"] = {
            "interval": plan.billing_interval,
            "interval_count": plan.billing_interval_count,
        }
    return params


def _price_idempotency_key(plan) -> str:
    # Scopes the key to the price-defining tuple so a retry after a failed COMMIT
    # returns the object Stripe already made instead of minting a second one, while
    # a genuine price edit still gets a new Price.
    parts = [str(plan.id)] + [str(getattr(plan, f)) for f in PRICE_FIELDS]
    return "plan-price-" + "-".join(parts)


def create_plan_objects(plan) -> None:
    """Create the Stripe Product and Price for a new plan, writing both ids.

    Does not save - the caller owns the transaction and the UPDATE.
    """
    account_id = _account_id(plan.product)
    options = {"stripe_account": account_id}

    stripe_product = _client.v1.products.create(
        {
            "name": _product_name(plan),
            "description": plan.product.description,
            "active": plan.product.is_active,
            "metadata": _metadata(plan),
        },
        options,
    )
    plan.stripe_product_id = stripe_product.id

    stripe_price = _client.v1.prices.create(
        _price_params(plan),
        {**options, "idempotency_key": _price_idempotency_key(plan)},
    )
    plan.stripe_price_id = stripe_price.id


def update_plan_product(plan) -> None:
    """Push name/description/active to the Stripe Product. Mutable, so a plain update."""
    if not plan.stripe_product_id:
        return
    _client.v1.products.update(
        plan.stripe_product_id,
        {
            "name": _product_name(plan),
            "description": plan.product.description,
            "active": plan.product.is_active,
        },
        {"stripe_account": _account_id(plan.product)},
    )


def replace_plan_price(plan) -> None:
    """Archive the current Price and point the plan at a new one.

    Stripe Prices are immutable (§2.2). Archiving rather than deleting is what lets
    existing subscribers keep billing on the old amount, which is why `Order` and
    `Subscription` snapshot stripe_price_id instead of reading through this FK.
    """
    account_id = _account_id(plan.product)
    options = {"stripe_account": account_id}

    old_price_id = plan.stripe_price_id
    if not plan.stripe_product_id:
        # Never synced - there is nothing to replace, so this is a first push.
        create_plan_objects(plan)
        return

    stripe_price = _client.v1.prices.create(
        _price_params(plan),
        {**options, "idempotency_key": _price_idempotency_key(plan)},
    )
    plan.stripe_price_id = stripe_price.id

    if old_price_id:
        _client.v1.prices.update(old_price_id, {"active": False}, options)


def archive_plan_objects(account_id: str, stripe_product_id, stripe_price_id) -> None:
    """Deactivate a plan's Stripe objects.

    Takes ids rather than a Plan because the row is usually already gone by the time
    this runs. Price first: archiving the Product while its Price is still active
    leaves a window where a checkout can start on a price about to be orphaned.

    Archive, never delete - Stripe refuses to delete objects that have been used, and
    an archived Price stays readable so old invoices still render.
    """
    options = {"stripe_account": account_id}
    if stripe_price_id:
        _client.v1.prices.update(stripe_price_id, {"active": False}, options)
    if stripe_product_id:
        _client.v1.products.update(stripe_product_id, {"active": False}, options)


def resync_product(product) -> None:
    """Re-push every child plan's Stripe Product after the local Product changed.

    Only the Product half moves: name, description and active all derive from the
    local Product, while nothing here can alter a Price.
    """
    plans = (
        Plan.objects
        .filter(product=product)
        .exclude(Q(stripe_product_id__isnull=True) | Q(stripe_product_id=""))
    )
    for plan in plans:
        # The instances come from a filter on `product`, so priming the cache saves a
        # query per plan in _product_name and _account_id.
        plan.product = product
        update_plan_product(plan)


def child_stripe_ids(product) -> list[tuple]:
    """Every child plan's (product_id, price_id), read before a delete.

    Django's cascade collector never calls Plan.delete(), so deleting a Product drops
    these rows without giving any per-plan hook a chance to read them.
    """
    return list(
        Plan.objects.filter(product=product).values_list(
            "stripe_product_id", "stripe_price_id"
        )
    )
