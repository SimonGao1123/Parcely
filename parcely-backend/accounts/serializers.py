from rest_framework import serializers
from accounts.models import AppUser

class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ['id', 'email', 'first_name', 'last_name', 'created_at', 'updated_at', 'profile_picture']
        read_only_fields = ['id', 'created_at', 'updated_at']