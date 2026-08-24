from django.db.models import Prefetch
from store.models import Page, PageBlock, StoreFront
from store.serializers import PageSerializer
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from store.serializers import PageSummarySerializer
SELECT_FIELDS = {
    'logo_image',
    'storefront',
    'storefront__owner',
    'storefront__banner_image',
    'storefront__logo_image',
    'storefront__homepage',
}
PREFETCH_FIELDS = Prefetch(
    'blocks',
    queryset=PageBlock.objects.prefetch_related('content')
)

class PageDetailAPIView(generics.RetrieveAPIView):
    """
    UNAUTHENTICATED, VIEW SPECIFIC PAGE + ALL BLOCKS
    """
    serializer_class = PageSerializer
    lookup_field = 'slug'
    queryset = (
        Page.objects
        .select_related(*SELECT_FIELDS)
        .prefetch_related(PREFETCH_FIELDS)
    )
    permission_classes = [AllowAny]

    def get_queryset(self):
        return self.queryset.filter(storefront__slug=self.kwargs['storefront_slug'])

class CreatePageAPIView(generics.CreateAPIView):
    """
    MUST BE AUTHENTICATED, CREATE NEW PAGE FOR SPECIFIC STOREFRONT
    """
    serializer_class = PageSummarySerializer 

    def perform_create(self, serializer):
        # check if storefront is OWNER by current user
        storefront_slug = self.kwargs['storefront_slug']
        storefront = StoreFront.objects.filter(slug=storefront_slug, owner=self.request.user).first()
        if not storefront:
            raise PermissionDenied("You are not the owner of this storefront")
        serializer.save(storefront_id=storefront.id)

class UpdatePageAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHENTICATED, UPDATE SPECIFIC PAGE WHICH MUST BE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageSummarySerializer 
    lookup_field = 'slug'

    def get_queryset(self):
        return Page.objects.filter(storefront__slug=self.kwargs['storefront_slug'], storefront__owner=self.request.user)

class DeletePageAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHENTICATED, DELETE SPECIFIC PAGE WHICH MUST BE OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageSummarySerializer
    lookup_field = 'slug'

    def get_queryset(self):
        return Page.objects.filter(storefront__slug=self.kwargs['storefront_slug'], storefront__owner=self.request.user)