from django.shortcuts import get_object_or_404
from rest_framework import generics

from store.models import Page, PageBlock
from store.serializers import PageBlockSerializer

# note you CANNOT open a pageblock by itself, only can open a page then the page's pageblocks


class PageBlockCreateAPIView(generics.CreateAPIView):
    """
    MUST BE AUTHENTICATED, CREATE NEW PAGE BLOCK FOR SPECIFIC PAGE
    """
    serializer_class = PageBlockSerializer

    def perform_create(self, serializer):
        # select_related('storefront') so PageBlock.save() → validate_page_block_content
        # can access page.storefront without an extra query.
        page = get_object_or_404(
            Page.objects.select_related('storefront'),
            slug=self.kwargs['page_slug'],
            storefront__slug=self.kwargs['storefront_slug'],
            storefront__owner=self.request.user,
        )
        serializer.save(page=page)


class PageBlockUpdateAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHENTICATED, UPDATE SPECIFIC PAGE BLOCK OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageBlockSerializer
    lookup_field = 'id'

    def get_queryset(self):
        # select_related('page__storefront') for validate_page_block_content on save.
        return PageBlock.objects.select_related('page__storefront').filter(
            page__slug=self.kwargs['page_slug'],
            page__storefront__slug=self.kwargs['storefront_slug'],
            page__storefront__owner=self.request.user,
        )


class PageBlockDeleteAPIView(generics.DestroyAPIView):
    """
    MUST BE AUTHENTICATED, DELETE SPECIFIC PAGE BLOCK OWNED BY THE AUTHENTICATED USER
    """
    serializer_class = PageBlockSerializer
    lookup_field = 'id'

    # No select_related: DELETE doesn't serialize output, and save() isn't called.
    def get_queryset(self):
        return PageBlock.objects.filter(
            page__slug=self.kwargs['page_slug'],
            page__storefront__slug=self.kwargs['storefront_slug'],
            page__storefront__owner=self.request.user,
        )

