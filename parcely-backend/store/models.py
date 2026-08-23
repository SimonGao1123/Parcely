from django.db import models
from s3.models import Blob
from users.models import AppUser
from utils.models import TimestampedModel
from store.validators import validate_style
from django.utils.text import slugify
from django.core.exceptions import ValidationError

class Theme(models.TextChoices):
    MINIMALIST = "minimalist", "Minimalist"
    PROFESSIONAL = "professional", "Professional"
    ARTIST = "artist", "Artist"
    CONTEMPORARY = "contemporary", "Contemporary"
    TIMELESS = "timeless", "Timeless"

# Create your models here.

class StoreFront(TimestampedModel):
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="storefronts")
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)

    slug = models.SlugField(unique=True, max_length=255)

    theme = models.CharField(max_length=255, choices=Theme.choices, default=Theme.MINIMALIST)

    style = models.JSONField(default=dict, validators=[validate_style]) # only runs on full clean

    banner_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True)
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True)

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

    slug = models.SlugField(unique=True, max_length=255)

    title = models.CharField(max_length=255)
    logo_image = models.ForeignKey(Blob, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.title
    
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