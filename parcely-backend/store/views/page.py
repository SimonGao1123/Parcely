from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from store.models import Page, PageBlock, StoreFront
from store.serializers import PageSerializer, PageSummarySerializer
from store.access import visible_storefront_q
from store.block_context import block_reference_context
# Forward FKs read by PageSerializer (which nests StoreFrontSummarySerializer,
# which reads homepage.logo_image).
SELECT_FIELDS = (
    'logo_image',
    'storefront',
    'storefront__owner',
    'storefront__banner_image',
    'storefront__logo_image',
    'storefront__homepage',
    'storefront__homepage__logo_image',
)
# `blocks` is a reverse FK. `content` is a JSONField, not a relation — can't be prefetched.
BLOCKS_PREFETCH = Prefetch('blocks', queryset=PageBlock.objects.all())


class PageDetailAPIView(generics.RetrieveAPIView):
    """
    UNAUTHENTICATED, VIEW SPECIFIC PAGE + ALL BLOCKS
    """
    serializer_class = PageSerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        return (
            Page.objects
            .select_related(*SELECT_FIELDS)
            .prefetch_related(BLOCKS_PREFETCH)
            .filter(storefront__slug=self.kwargs['storefront_slug'])
            # pages of a draft storefront 404 for everyone but its owner. this is
            # also what keeps products private: get_serializer_context resolves
            # them into resolved_content, and that's their only public route out.
            .filter(visible_storefront_q(self.request.user, 'storefront__'))
        )
    
    # memoize get_object so DRF retrieve() and get_serializer_context()
    # don't each fire a sep query
    def get_object(self):
        if not hasattr(self, '_object'):
            self._object = super().get_object()
        return self._object # store as self._object
    
    def get_serializer_context(self):
        ctx = super().get_serializer_context()

        page = self.get_object() # uses memoized and retrieved also uses memoized
        ctx.update(block_reference_context(page.blocks.all(), page.storefront)) # blocks already prefetched
        return ctx



class CreatePageAPIView(generics.CreateAPIView):
    """
    MUST BE AUTHENTICATED, CREATE NEW PAGE FOR SPECIFIC STOREFRONT
    """
    serializer_class = PageSummarySerializer

    def perform_create(self, serializer):
        storefront = get_object_or_404(
            StoreFront,
            slug=self.kwargs['storefront_slug'],
            owner=self.request.user,
        )
        serializer.save(storefront=storefront)


class UpdatePageAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHENTICATED, UPDATE SPECIFIC PAGE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageSummarySerializer
    lookup_field = 'slug'

    def get_queryset(self):
        # select_related('logo_image') because the PATCH response serializes it.
        return Page.objects.select_related('logo_image').filter(
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )


class DeletePageAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHENTICATED, DELETE SPECIFIC PAGE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageSummarySerializer
    lookup_field = 'slug'

    # No select_related: DELETE returns 204 with no body, so nothing is serialized.
    def get_queryset(self):
        return Page.objects.filter(
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )
    def destroy(self, request, *args, **kwargs):
        page = self.get_object()
        if page.storefront.homepage == page:
            return Response(status=status.HTTP_400_BAD_REQUEST, data={"detail": "Cannot delete homepage"})
        self.perform_destroy(page)
        return Response(status=status.HTTP_204_NO_CONTENT)
