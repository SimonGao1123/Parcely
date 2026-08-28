from django.db.models import Q


def visible_storefront_q(user, prefix: str = "") -> Q:
    """Storefronts a caller may read: published ones, plus their own drafts.

    The owner clause is conditional because Q(owner=AnonymousUser()) raises —
    anonymous callers get the published-only half.

    `prefix` walks a relation, e.g. "storefront__" when filtering Pages.
    """
    q = Q(**{f"{prefix}is_draft": False})
    if getattr(user, "is_authenticated", False):
        q |= Q(**{f"{prefix}owner": user})
    return q
