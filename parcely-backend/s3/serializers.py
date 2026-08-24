from rest_framework import serializers
from .models import Blob

class PresignRequestSerializer(serializers.Serializer):
    mime = serializers.CharField(required=True)
    filename = serializers.CharField(required=True)
    byte_size = serializers.IntegerField(required=True, min_value = 1, max_value = 10 * 1024 * 1024) # 10 MB
    metadata = serializers.JSONField(required=True)
    checksum = serializers.CharField(required=True)

    def validate_mime(self, value):
        if not (value.startswith(('image/', 'video/'))):
            raise serializers.ValidationError('invalid mime type')
        return value

class BlobSerializer(serializers.ModelSerializer): # only for serializing blobs NO DESERIALIZATION
    kind = serializers.SerializerMethodField()
    
    url = serializers.SerializerMethodField()

    
    class Meta:
        model = Blob
        fields = ['id', 'url', 'kind', 'metadata']
        read_only_fields = ['id', 'url', 'kind', 'metadata']

    def get_kind(self, obj):
        return obj.mime.split('/')[0] # extracts image / video
    
    def get_url(self, obj):
        return obj.key.url # extracts url from key (presigned)