import stripe
from django.conf import settings

from accounts.models import AppUser

# The one client in the process - billing.views.stripeWebhooks imports this rather
# than building a second.
_client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)

# v2 Accounts omit configuration/requirements/identity unless asked for by name.
# Without this the response carries configuration=None, so attribute access raises
# AttributeError on None rather than returning empty.
MERCHANT_INCLUDE = ["configuration.merchant"]

# Stripe rejects the create outright without this: "The field identity.country is
# required before setting configuration.merchant." We collect no country from the
# seller yet, so every account is established here. ISO 3166-1 alpha-2, lowercase.
DEFAULT_COUNTRY = "us"


def create_connected_account(
    user: AppUser, *, country: str = DEFAULT_COUNTRY
) -> stripe.v2.core.Account:
    """Create the seller's connected account - the payout destination for every
    storefront they own.

    defaults.responsibilities cannot be changed once the merchant configuration is
    applied, so altering it later means re-onboarding every seller.

    identity.country is the same kind of one-way door: it decides which identity
    fields apply, how Stripe validates the account, and the payout rails. A seller
    who needs a different country needs a different account, so this becomes a real
    signup question the moment there is a non-US seller.

    entity_type is deliberately left unset - Stripe's hosted onboarding asks for it,
    and guessing wrong changes how the account is validated.
    """
    return _client.v2.core.accounts.create({
        "contact_email": user.email,
        "display_name": user.username,
        "dashboard": "full",
        "identity": {"country": country},
        "defaults": {
            "responsibilities": {
                "fees_collector": "stripe",
                "losses_collector": "stripe",
            },
        },
        "configuration": {
            "merchant": {
                "capabilities": {"card_payments": {"requested": True}},
            },
        },
        # Lets a webhook resolve the seller when it arrives before our create()
        # response has been persisted.
        "metadata": {"app_user_id": str(user.id)},
        # Seeds card_payments_status from this response, no second round-trip.
        "include": MERCHANT_INCLUDE,
    })


def retrieve_account(account_id: str) -> stripe.v2.core.Account:
    """Always goes through MERCHANT_INCLUDE. Do not use fetch_related_object() on a
    webhook notification instead - it issues a bare GET whose configuration is None.
    """
    return _client.v2.core.accounts.retrieve(account_id, {"include": MERCHANT_INCLUDE})


def merchant_status(account: stripe.v2.core.Account) -> str | None:
    """The card_payments *capability* status.

    Not to be confused with configuration.merchant.card_payments, which is unrelated
    AVS/CVC decline settings.
    """
    merchant = account.configuration.merchant
    if merchant is None:
        return None
    return merchant.capabilities.card_payments.status


def create_onboarding_link(account_id: str, *, use_case_type: str) -> str:
    """use_case_type is "account_onboarding" for a new account or "account_update"
    for one already created. The nested params key repeats that same string.

    Links are single-use and short-lived, so these are minted on demand rather than
    stored - Stripe's refresh_url contract expects exactly that.
    """
    link = _client.v2.core.account_links.create({
        "account": account_id,
        "use_case": {
            "type": use_case_type,
            use_case_type: {
                "configurations": ["merchant"],
                "refresh_url": f"{settings.FRONTEND_URL}/onboarding/stripe/refresh",
                "return_url": f"{settings.FRONTEND_URL}/onboarding/stripe/return",
            },
        },
    })
    return link.url
