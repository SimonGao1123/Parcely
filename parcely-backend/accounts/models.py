from django.db import models
from common.models import TimestampedModel
# Create your models here.

# TODO: add stripe integration id's for user after integration is setup
class AppUser(TimestampedModel):
    email = models.EmailField(unique=True, db_index=True)
    clerk_id = models.CharField(max_length=255, unique=True, db_index=True)
    username = models.CharField(max_length=255, unique=True, db_index=True)
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255)
    profile_picture = models.URLField(blank=True, null=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
