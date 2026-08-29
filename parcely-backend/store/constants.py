GRID_COLUMNS = 12

# /<storefront>/settings and /<storefront>/products are static routes on the
# frontend, so they win over the dynamic /<storefront>/<page>. A page slugged
# either would be unreachable at its public URL.
RESERVED_PAGE_SLUGS = frozenset({"settings", "products"})
