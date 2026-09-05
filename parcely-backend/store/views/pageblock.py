from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from store.block_context import block_reference_context
from store.models import Page, PageBlock
from store.serializers import (
    PageBlockBatchSerializer,
    PageBlockSerializer,
    PageLayoutSerializer,
)
from store.validators import normalize_page_block_layout, validate_page_layout

# note you CANNOT open a pageblock by itself, only can open a page then the page's pageblocks


def _owned_page(user, storefront_slug, page_slug):
    # select_related('storefront') so PageBlock.save() → validate_page_block_content
    # can reach page.storefront without an extra query.
    return get_object_or_404(
        Page.objects.select_related('storefront'),
        slug=page_slug,
        storefront__slug=storefront_slug,
        storefront__owner=user,
    )


def _apply_layout(page, submitted):
    """Move many blocks at once, then check the page-wide overlap invariant once.

    `submitted` maps block id to layout. Blocks left out keep their layout but
    still take part in the check, which is what makes a partial payload safe.
    Returns the page's blocks with the new layouts applied.
    """
    blocks = list(page.blocks.all())
    unknown = set(submitted) - {block.id for block in blocks}
    if unknown:
        raise ValidationError({'blocks': f'Not on this page: {sorted(unknown)}'})

    now = timezone.now()
    dirty = []
    for block in blocks:
        if block.id in submitted:
            # bulk_update skips save(), so its two side effects have to happen
            # here: normalize_ runs the pydantic validation and fills omitted
            # optional keys with explicit nulls, and updated_at is auto_now,
            # which bulk_update does not honour.
            block.layout = normalize_page_block_layout(submitted[block.id])
            block.updated_at = now
            dirty.append(block)

    PageBlock.objects.bulk_update(dirty, ['layout', 'updated_at'])
    validate_page_layout(blocks)
    return blocks


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
        block = serializer.save(page=page)

        # get_serializer_context() ran before the block existed, so the context
        # is empty and resolved_content would come back null. It is only read
        # when serializer.data is accessed, which happens after this returns —
        # so filling the context in here is still in time.
        serializer.context.update(block_reference_context([block], page.storefront))


class PageBlockUpdateAPIView(generics.UpdateAPIView):
    """
    MUST BE AUTHENTICATED, UPDATE SPECIFIC PAGE BLOCK OWNED BY THE AUTHENTICATED USER

    `layout` is writable here, but prefer PageBlockLayoutAPIView for moves: this
    view saves one block at a time, and PageBlock.save() re-validates the whole
    page after each write, so any rearrangement whose intermediate state overlaps
    (a swap, most obviously) can't be expressed as a sequence of these.
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

    def perform_update(self, serializer):
        # Same ordering as PageBlockCreateAPIView.perform_create: the context has
        # to be filled after the write, because the new content is what decides
        # which references need resolving.
        block = serializer.save()
        serializer.context.update(
            block_reference_context([block], block.page.storefront)
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


class PageBlockLayoutAPIView(APIView):
    """
    MUST BE AUTHENTICATED, REPOSITION MANY BLOCKS OF ONE PAGE IN A SINGLE REQUEST

    Exists because overlap is a page-wide invariant: PageBlock.save() re-checks
    every block after each individual write, so a rearrangement sent as N separate
    PATCHes has to be collision-free at every step, which a swap never is. Here
    the whole batch lands first and is validated once.
    """

    @transaction.atomic
    def patch(self, request, storefront_slug, page_slug):
        page = _owned_page(request.user, storefront_slug, page_slug)

        payload = PageLayoutSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        submitted = {item['id']: item['layout'] for item in payload.validated_data['blocks']}

        blocks = _apply_layout(page, submitted)
        return Response({'blocks': [{'id': b.id, 'layout': b.layout} for b in blocks]})


class PageBlockBatchAPIView(APIView):
    """
    MUST BE AUTHENTICATED, COMMIT A WHOLE EDITING SESSION FOR ONE PAGE IN ONE REQUEST

    The editor holds every change locally until the owner presses Save, so a
    session can delete, move, edit and add blocks all at once. Sent as separate
    requests those can half-apply — deletes land, a create fails, and the page is
    left in a state the owner never asked for. One transaction is the only place
    that can hold them together.

    Order is load-bearing, because PageBlock.save() re-validates the page-wide
    overlap invariant after every individual write:

      1. deletes  — frees the cells a move or a create is about to take
      2. layout   — existing blocks reach their final positions before anything
                    new is placed
      3. updates  — content/style only; layout is already settled
      4. creates  — every remaining cell is now genuinely free
    """

    @transaction.atomic
    def patch(self, request, storefront_slug, page_slug):
        page = _owned_page(request.user, storefront_slug, page_slug)

        payload = PageBlockBatchSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # scoped to the page, so an id from someone else's storefront deletes
        # nothing rather than 404ing the whole save
        page.blocks.filter(id__in=data['deletes']).delete()

        _apply_layout(page, {item['id']: item['layout'] for item in data['layout']})

        by_id = {block.id: block for block in page.blocks.all()}
        for item in data['updates']:
            block = by_id.get(item['id'])
            if block is None:
                raise ValidationError({'updates': f"Not on this page: {item['id']}"})
            # partial so an update carrying only style leaves content alone
            serializer = PageBlockSerializer(block, data=item, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()

        for item in data['creates']:
            serializer = PageBlockSerializer(data=item)
            serializer.is_valid(raise_exception=True)
            serializer.save(page=page)

        # The whole page comes back, not just what changed: the client's new
        # blocks carry local placeholder ids, and replacing its state wholesale
        # is what reconciles them without any id mapping.
        blocks = list(page.blocks.all())
        context = block_reference_context(blocks, page.storefront)
        return Response({'blocks': PageBlockSerializer(blocks, many=True, context=context).data})

