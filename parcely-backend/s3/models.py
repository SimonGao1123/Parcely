from django.db import models
from django.utils import timezone
from datetime import timedelta
from accounts.models import AppUser
from common.models import TimestampedModel
from .metadata_schema import validate_metadata
from django.core.validators import MinValueValidator, MaxValueValidator
import uuid
# Create your models here.

PRESIGN_EXPIRES_SECONDS = 60 * 15  # 15 min — must match ExpiresIn on presign call


def blob_upload_path(instance, filename):
    return f"uploads/{instance.uploader.id}/{uuid.uuid4()}/{filename}"


def default_expires_at():
    return timezone.now() + timedelta(seconds=PRESIGN_EXPIRES_SECONDS)


class Blob(TimestampedModel):
    # FileField defaults to max_length=100, but the key is
    # uploads/<id>/<uuid4>/<filename> — ~47 chars of prefix plus a filename that
    # may itself be 255. S3 allows 1024-byte keys, so 512 is the binding limit.
    key = models.FileField(upload_to=blob_upload_path, max_length=512)
    confirmed = models.BooleanField(default=False)
    checksum = models.CharField(max_length=255)
    mime = models.CharField(max_length=255)
    filename = models.CharField(max_length=255)
    byte_size = models.BigIntegerField(
        validators = [MinValueValidator(0), MaxValueValidator(10 * 1024 * 1024)]
    ) # 10 MB
    metadata = models.JSONField(default=dict)
    uploader = models.ForeignKey(AppUser, on_delete=models.CASCADE)
    expires_at = models.DateTimeField(default=default_expires_at, db_index=True)

    def is_expired(self) -> bool:
        return not self.confirmed and self.expires_at < timezone.now()


    def __str__(self):
        return self.key
    
    def clean(self):
        super().clean()
        
        validate_metadata(self.metadata, self.mime)
    
    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
