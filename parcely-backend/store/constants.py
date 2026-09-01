GRID_COLUMNS = 12

# /<storefront>/settings, /products and /cart are static routes on the frontend,
# so they win over the dynamic /<storefront>/<page>. A page slugged any of them
# would be unreachable at its public URL.
RESERVED_PAGE_SLUGS = frozenset({"settings", "products", "cart"})
