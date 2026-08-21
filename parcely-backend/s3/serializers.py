from rest_framework import serializers
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
