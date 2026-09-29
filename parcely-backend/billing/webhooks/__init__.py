"""Stripe webhook intake, split the way Stripe splits it.

Two endpoints, two payload formats, two registries, and the modules here map onto them
one to one:

    views.py              both endpoints - signature check, StripeEvent row, dispatch
    account_lifecycle.py  platform endpoint - v2 thin events, writes AppUser
    fulfilment.py         connect endpoint - v1 snapshot events, writes money models

The registries are deliberately not merged. v2 type strings look like
`v2.core.account.closed` and v1 ones like `account.updated`; one namespace holding both
invites reading a v1 event as its v2 near-namesake, and the payload shapes are unrelated.

Nothing is re-exported here on purpose - importers name the module they mean, so the
endpoint a handler belongs to is visible at the import site.
"""
