from django.core import signing

from accounts.models import Customer

# Proves "this browser verified this email at this seller". Deliberately not a
# table: the only power it grants is creating a Checkout Session for its own
# Customer, and the card is entered on Stripe's hosted page, so a stolen token
# buys *for* the victim rather than from them. Managing purchases - cancelling a
# subscription, swapping a card - is a real privilege and must demand a fresh
# code instead of accepting this.
BUYER_SESSION_SALT = "accounts.buyer_session"
BUYER_SESSION_MAX_AGE = 60 * 60
BUYER_SESSION_HEADER = "X-Buyer-Session"


def issue_buyer_token(customer) -> str:
    # signing.dumps signs but does not encrypt, so the payload is readable by
    # whoever holds it - ids only, and everything else is re-read from the row.
    return signing.dumps(
        {"customer_id": customer.id, "seller_id": customer.seller_id},
        salt=BUYER_SESSION_SALT,
    )


def read_buyer_customer(token, storefront) -> Customer | None:
    """The Customer this token names at this storefront, or None."""
    if not token:
        return None

    try:
        payload = signing.loads(
            token, salt=BUYER_SESSION_SALT, max_age=BUYER_SESSION_MAX_AGE
        )
    except signing.BadSignature:
        # Covers SignatureExpired too - a caller cannot act on the difference
        # without learning whether the token was ever genuine.
        return None

    # Matched against the row rather than the payload's own seller_id: the
    # signature proves we minted the token, not that it was minted for this
    # seller, and one seller's token must not transact on another's storefront.
    return Customer.objects.filter(
        id=payload["customer_id"], seller_id=storefront.owner_id
    ).first()


def buyer_from_request(request, storefront) -> Customer | None:
    return read_buyer_customer(request.headers.get(BUYER_SESSION_HEADER), storefront)
