import copy

from django.db import models, transaction
from s3.models import Blob
from accounts.models import AppUser
from common.models import TimestampedModel
from store.constants import RESERVED_PAGE_SLUGS
from store.validators import validate_style, validate_page_block_style, validate_page_block_layout, validate_page_block_content, validate_page_layout, normalize_page_block_style, normalize_page_block_layout
from django.utils.text import slugify
from django.core.exceptions import ValidationError
def default_storefront_style():
    return {
        "background_color": "#ffffff",
        "font_family": "Inter",
        "font_scale": 1.0,
        "font_color": "#000000",
        "line_spacing": 1.5,
    }
def default_page_block_style():
    return {
        "background_color": None,
        "font_family": None,
        "font_scale": None,
        "font_color": None,
        "line_spacing": None,
        "alignment": "left",
        "padding": None,
    }

class Currency(models.TextChoices): # can be expanded to include other currencies
    USD = "usd", "USD"
    EUR = "eur", "EUR"
    CAD = "cad", "CAD"

class Theme(models.TextChoices):
    MINIMALIST = "minimalist", "Minimalist"
    PROFESSIONAL = "professional", "Professional"
    ARTIST = "artist", "Artist"
    CONTEMPORARY = "contemporary", "Contemporary"
    TIMELESS = "timeless", "Timeless"

class BlockType(models.TextChoices):
    TEXT = "text", "Text"
    MEDIA = "media", "Media" # can be a image or a video
    PRODUCT = "product", "Product"
    GALLERY = "gallery", "Gallery"
    SLIDESHOW = "slideshow", "Slideshow"
    LINK = "link", "Link" # media and/or text pointing at another page

# Create your models here.

class StoreFront(TimestampedModel):
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="storefronts")
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)

    slug = models.SlugField(unique=True, max_length=255, db_index=True)

    theme = models.CharField(max_length=255, choices=Theme.choices, default=Theme.MINIMALIST)

    # every product in a storefront is priced in this one currency, so a cart
    # total is a plain sum
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)

    style = models.JSONField(
        default=default_storefront_style,
        validators=[validate_style],
    ) # only runs on full clean

    banner_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    homepage = models.ForeignKey("Page", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    is_draft = models.BooleanField(default=True)

    def __init__(self, *args, **kwargs): # keep track of previous state so only run validation for homepage
        super().__init__(*args, **kwargs)
        self._original_title = self.title
    def __str__(self):
        return self.title
    
    def clean(self): # checks if homepage referencing is actually part of storefront
        super().clean()
        # Creation only. A seller whose capability later degrades to `restricted`
        # must keep editing and unpublishing the storefronts they already own -
        # gating every save would strand them behind a transient Stripe state.
        #
        # owner_id, not owner: full_clean() still calls clean() after
        # clean_fields() has collected errors, so on a missing owner `self.owner`
        # would raise RelatedObjectDoesNotExist and surface as a 500.
        if self._state.adding and self.owner_id and not self.owner.can_sell:
            raise ValidationError("Finish Stripe onboarding before creating a storefront.")

        if self.homepage and self.homepage.storefront_id != self.pk:
            raise ValidationError("Homepage must belong to this storefront")
        # a product page is hidden from the navbar, so it would be a homepage
        # with no way back to the rest of the storefront
        if self.homepage and self.homepage.product_id is not None:
            raise ValidationError("Homepage cannot be a product page")

        if self.banner_image is not None and self.banner_image.uploader != self.owner:
            raise ValidationError("Banner image must be uploaded by the storefront owner")
        if self.banner_image is not None and not self.banner_image.mime.startswith('image/'):
            raise ValidationError("Banner image must be an image")
        if self.logo_image is not None and self.logo_image.uploader != self.owner:
            raise ValidationError("Logo image must be uploaded by the storefront owner")
        if self.logo_image is not None and not self.logo_image.mime.startswith('image/'):
            raise ValidationError("Logo image must be an image")
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        title_changed = self.title != self._original_title
        if is_new or title_changed:
            self.slug = self._generate_slug()
        self.full_clean()
        result = super().save(*args, **kwargs)
        # refresh baseline only after a successful save; a failing full_clean
        # or DB error must not leave the baseline out of sync with the DB.
        self._original_title = self.title

        # automatically create homepage for storefront on initial creation.
        # Page is defined below this class, but resolves fine here: this runs at
        # call time, long after the module finishes importing.
        if is_new:
            page = Page.objects.create(storefront=self, title="Home")
            # queryset update rather than self.save(): re-entering save() here
            # would recurse, and full_clean() would re-validate a row already known good
            StoreFront.objects.filter(pk=self.pk).update(homepage=page)
            self.homepage = page
        return result

    def _generate_slug(self):
        base = slugify(self.title)[:250] or "storefront" # slugify takes title e.g. "My Store" and returns "my-store"
        slug = base
        n = 1
        while StoreFront.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            n += 1
            slug = f"{base}-{n}"
        return slug

class Page(TimestampedModel):
    storefront = models.ForeignKey(StoreFront, on_delete=models.CASCADE, related_name="pages")

    slug = models.SlugField(max_length=255, db_index=True)

    title = models.CharField(max_length=255)
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    # Set only by create_product_page, and null for every hand-made page. A
    # product page is skipped by the navbar and listed in the products tab
    # instead. String reference because products.models imports this module, so
    # a real import would cycle at startup.
    product = models.OneToOneField(
        "products.Product", on_delete=models.CASCADE, null=True, blank=True, related_name="page",
    )

    def __init__(self, *args, **kwargs): # keep track of previous state so only run validation for page content
        super().__init__(*args, **kwargs)
        self._original_title = self.title
    def __str__(self):
        return self.title
    def clean(self):
        super().clean()
        if self.pk: # skip on first create — no blocks exist yet
            validate_page_layout(self.blocks.all())
        if self.logo_image is not None and self.logo_image.uploader != self.storefront.owner:
            raise ValidationError("Logo image must be uploaded by the storefront owner")
        if self.logo_image is not None and not self.logo_image.mime.startswith('image/'):
            raise ValidationError("Logo image must be an image")
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        title_changed = self.title != self._original_title
        if is_new or title_changed:
            self.slug = self._generate_slug()
        self.full_clean()
        result = super().save(*args, **kwargs)
        # refresh baseline only after a successful save; a failing full_clean
        # or DB error must not leave the baseline out of sync with the DB.
        self._original_title = self.title
        return result

    def _generate_slug(self):
        base = slugify(self.title)[:250] or "page"
        slug = base
        n = 1
        # a reserved slug is treated as taken: product pages are named after the
        # product and never pass through the frontend's reserved-name guard
        while slug in RESERVED_PAGE_SLUGS or Page.objects.filter(slug=slug, storefront=self.storefront).exclude(pk=self.pk).exists():
            n += 1
            slug = f"{base}-{n}"
        return slug
    
    class Meta:
        unique_together = ("slug", "storefront")
        indexes = [
            models.Index(fields=["storefront", "slug"]),
        ]

class PageBlock(TimestampedModel):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="blocks")

    kind = models.CharField(max_length=255, choices=BlockType.choices)

    content = models.JSONField() # required, kind-specific fields validated in save()

    style = models.JSONField(default=default_page_block_style, validators=[validate_page_block_style])

    layout = models.JSONField(validators=[validate_page_block_layout]) # required, must include desktop

    def __init__(self, *args, **kwargs): # keep track of previous state so only run validation for page block content
        # if content ACTUALLY changes, then need to validate new ids passed in are valid / authed correctly
        super().__init__(*args, **kwargs)
        # deepcopy: a plain assignment aliases the same dict, so an in-place
        # mutation (content['product_id'] = x) would update the baseline too and
        # silently skip reference validation on save.
        self._original_content = copy.deepcopy(self.content)
        self._original_kind = self.kind
    @transaction.atomic
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        content_changed = (
            self.content != self._original_content or
            self.kind != self._original_kind
        )
        if is_new or content_changed:
            validate_page_block_content(self.content, self.kind, self.page.storefront)
        # fill omitted optional keys with explicit nulls before persisting
        self.style = normalize_page_block_style(self.style)
        self.layout = normalize_page_block_layout(self.layout)
        self.full_clean()
        super().save(*args, **kwargs)
        validate_page_layout(self.page.blocks.all()) # includes self post-save; rolls back on overlap
        # refresh baselines only after the full save + post-save validation succeed;
        # the atomic block rolls back the DB on failure, so the baseline must too.
        self._original_content = copy.deepcopy(self.content)
        self._original_kind = self.kind