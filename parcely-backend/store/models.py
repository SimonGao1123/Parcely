from django.db import models, transaction
from s3.models import Blob
from accounts.models import AppUser
from common.models import TimestampedModel
from store.validators import validate_style, validate_page_block_style, validate_page_block_layout, validate_page_block_content, validate_page_layout
from django.utils.text import slugify
from django.core.exceptions import ValidationError

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

    style = models.JSONField(default=dict, validators=[validate_style]) # only runs on full clean

    banner_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    homepage = models.ForeignKey("Page", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    def __str__(self):
        return self.title
    
    def clean(self): # checks if homepage referencing is actually part of storefront
        super().clean()
        if self.homepage and self.homepage.storefront_id != self.pk:
            raise ValidationError("Homepage must belong to this storefront")
    
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
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.title
    def clean(self):
        super().clean()
        if self.pk: # skip on first create — no blocks exist yet
            validate_page_layout(self.blocks.all())
    
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
            models.Index(fields=["slug", "storefront"]),
        ]

class PageBlock(TimestampedModel):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="blocks")

    kind = models.CharField(max_length=255, choices=BlockType.choices)

    content = models.JSONField(default=dict)

    style = models.JSONField(default=dict, validators=[validate_page_block_style])

    layout = models.JSONField(default=dict, validators=[validate_page_block_layout])

    @transaction.atomic
    def save(self, *args, **kwargs):
        validate_page_block_content(self.content, self.kind)
        self.full_clean()
        super().save(*args, **kwargs)
        validate_page_layout(self.page.blocks.all()) # includes self post-save; rolls back on overlap