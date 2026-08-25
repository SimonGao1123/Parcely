from django.db import models, transaction
from s3.models import Blob
from accounts.models import AppUser
from common.models import TimestampedModel
from store.validators import validate_style, validate_page_block_style, validate_page_block_layout, validate_page_block_content, validate_page_layout
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

# Create your models here.

class StoreFront(TimestampedModel):
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="storefronts")
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)

    slug = models.SlugField(unique=True, max_length=255, db_index=True)

    theme = models.CharField(max_length=255, choices=Theme.choices, default=Theme.MINIMALIST)

    style = models.JSONField(
        default=default_storefront_style,
        validators=[validate_style],
    ) # only runs on full clean

    banner_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    homepage = models.ForeignKey("Page", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    def __str__(self):
        return self.title
    
    def clean(self): # checks if homepage referencing is actually part of storefront
        super().clean()
        if self.homepage and self.homepage.storefront_id != self.pk:
            raise ValidationError("Homepage must belong to this storefront")
        
        if self.banner_image is not None and self.banner_image.uploader != self.owner:
            raise ValidationError("Banner image must be uploaded by the storefront owner")
        if self.banner_image is not None and not self.banner_image.mime.startswith('image/'):
            raise ValidationError("Banner image must be an image")
        if self.logo_image is not None and self.logo_image.uploader != self.owner:
            raise ValidationError("Logo image must be uploaded by the storefront owner")
        if self.logo_image is not None and not self.logo_image.mime.startswith('image/'):
            raise ValidationError("Logo image must be an image")
    
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generate_slug() # currently slug is generated on creation, not changed on update
        self.full_clean()
        return super().save(*args, **kwargs)
    
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
        if not self.slug:
            self.slug = self._generate_slug() # currently slug is generated on creation, not changed on update
        
        self.full_clean()
        return super().save(*args, **kwargs)
    
    def _generate_slug(self):
        base = slugify(self.title)[:250] or "page"
        slug = base
        n = 1
        while Page.objects.filter(slug=slug, storefront=self.storefront).exclude(pk=self.pk).exists():
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

    style = models.JSONField(default=dict, validators=[validate_page_block_style])

    layout = models.JSONField(validators=[validate_page_block_layout]) # required, must include desktop

    @transaction.atomic
    def save(self, *args, **kwargs):
        validate_page_block_content(self.content, self.kind, self.page.storefront)
        self.full_clean()
        super().save(*args, **kwargs)
        validate_page_layout(self.page.blocks.all()) # includes self post-save; rolls back on overlap