"""Re-exports every view in the package so urls.py has one import per app, not per file.

Kept complete on purpose - a partial barrel is what made urls.py reach past it into the
submodules for the three names that were missing.
"""

from store.views.page import (
    CreatePageAPIView,
    DeletePageAPIView,
    PageDetailAPIView,
    PageListAPIView,
    UpdatePageAPIView,
)
from store.views.pageblock import (
    PageBlockBatchAPIView,
    PageBlockCreateAPIView,
    PageBlockDeleteAPIView,
    PageBlockLayoutAPIView,
    PageBlockUpdateAPIView,
)
from store.views.storefront import (
    AllStoreFrontAPIView,
    DeleteStoreFrontAPIView,
    StoreFrontDetailAPIView,
    StoreFrontListCreateAPIView,
    UpdateStoreFrontAPIView,
)

__all__ = [
    "AllStoreFrontAPIView",
    "CreatePageAPIView",
    "DeletePageAPIView",
    "DeleteStoreFrontAPIView",
    "PageBlockBatchAPIView",
    "PageBlockCreateAPIView",
    "PageBlockDeleteAPIView",
    "PageBlockLayoutAPIView",
    "PageBlockUpdateAPIView",
    "PageDetailAPIView",
    "PageListAPIView",
    "StoreFrontDetailAPIView",
    "StoreFrontListCreateAPIView",
    "UpdatePageAPIView",
    "UpdateStoreFrontAPIView",
]
