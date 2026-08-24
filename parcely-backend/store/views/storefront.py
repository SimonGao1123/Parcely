from rest_framework import generics
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch

from store.models import StoreFront, Page
from store.serializers import StoreFrontSummarySerializer, StoreFrontSerializer
from store.filters import StoreFrontFilter


# Forward FKs on StoreFront — one JOIN each, use select_related.
# `homepage__logo_image` because PageSummarySerializer reads logo_image off homepage.
SUMMARY_SELECT_RELATED = (
    "owner",
    "banner_image",
    "logo_image",
    "homepage",
    "homepage__logo_image",
)

# Full detail also lists `pages` (reverse FK). Prefetch pages with their logo_image
# pre-joined so PageSummarySerializer doesn't trigger N+1.
PAGES_PREFETCH = Prefetch(
    "pages",
    queryset=Page.objects.select_related("logo_image"),
)


class StoreFrontListCreateAPIView(generics.ListCreateAPIView):
    """
    MUST BE AUTHENTICATED
    Creating storefront to authed user AND viewing all storefront for the authed user
    """
    serializer_class = StoreFrontSummarySerializer
    filterset_class = StoreFrontFilter

    def get_queryset(self):
        return (
            StoreFront.objects
            .select_related(*SUMMARY_SELECT_RELATED)
            .filter(owner=self.request.user)
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class AllStoreFrontAPIView(generics.ListAPIView):
    """
    DONT HAVE TO BE AUTHENTICATED, VIEW ALL STOREFRONTS
    """
    serializer_class = StoreFrontSummarySerializer
    permission_classes = [AllowAny]
    queryset = StoreFront.objects.select_related(*SUMMARY_SELECT_RELATED)


class StoreFrontDetailAPIView(generics.RetrieveAPIView):
    """
    DONT HAVE TO BE AUTHENTICATED, VIEW SPECIFIC STOREFRONT
    """
    serializer_class = StoreFrontSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"
    queryset = (
        StoreFront.objects
        .select_related(*SUMMARY_SELECT_RELATED)
        .prefetch_related(PAGES_PREFETCH)
    )


class UpdateStoreFrontAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHENTICATED, UPDATE SPECIFIC STOREFRONT WHICH MUST BE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = StoreFrontSummarySerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            StoreFront.objects
            .select_related(*SUMMARY_SELECT_RELATED)
            .filter(owner=self.request.user)
        )

class DeleteStoreFrontAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHENTICATED, DELETE SPECIFIC STOREFRONT WHICH MUST BE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = StoreFrontSummarySerializer
    lookup_field = 'slug'

    def get_queryset(self):
        return (
            StoreFront.objects
            .select_related(*SUMMARY_SELECT_RELATED)
            .filter(owner=self.request.user)
        )