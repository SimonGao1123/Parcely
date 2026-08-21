from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework import status
from .serializers import PresignRequestSerializer
from .models import Blob, PRESIGN_EXPIRES_SECONDS
from .s3 import s3_client
from django.conf import settings
import uuid
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


def _delete_s3_object(key: str) -> None:
    """Best-effort delete; logs and swallows errors so we still return the primary response."""
    try:
        s3_client().delete_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    except ClientError:
        logger.exception('failed to delete orphan s3 object: %s', key)
# Create your views here.

@api_view(['POST'])
def presign_upload(request):
    ser = PresignRequestSerializer(data=request.data)

    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    
    mime = ser.validated_data['mime']
    filename = ser.validated_data['filename']
    byte_size = ser.validated_data['byte_size']
    metadata = ser.validated_data['metadata']
    checksum = ser.validated_data['checksum']

    key = f'uploads/{request.user.id}/{uuid.uuid4()}/{filename}'

    
    upload_url = s3_client().generate_presigned_url(
        'put_object',
        Params={
            'Bucket': settings.AWS_S3_BUCKET,
            'Key': key,
            'ContentType': mime,
            'ContentLength': byte_size
        },
        ExpiresIn=PRESIGN_EXPIRES_SECONDS
    )

    blob = Blob.objects.create(
        key=key,
        mime=mime,
        byte_size=byte_size,
        metadata=metadata,
        uploader=request.user,
        checksum=checksum,
        confirmed=False,
        filename=filename
    )

    return Response({
        'blob_id': blob.id,
        'upload_url': upload_url,
        'expires_in': PRESIGN_EXPIRES_SECONDS,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def confirm_upload(request):
    if request.data.get('blob_id') is None:
        return Response({
            'error': 'blob_id is required'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        blob = Blob.objects.get(id=request.data['blob_id'])
    except Blob.DoesNotExist:
        return Response({
            'error': 'blob not found'
        }, status=status.HTTP_404_NOT_FOUND)

    if blob.uploader_id != request.user.id:
        return Response({
            'error': 'unauthorized'
        }, status=status.HTTP_403_FORBIDDEN)
    if blob.confirmed:
        return Response({
            'error': 'blob already confirmed'
        }, status=status.HTTP_400_BAD_REQUEST)
    if blob.is_expired():
        # window elapsed; the S3 URL no longer works either. Clean up both sides.
        _delete_s3_object(blob.key.name)
        blob.delete()
        return Response({
            'error': 'upload window expired'
        }, status=status.HTTP_410_GONE)

    key = blob.key.name

    try:
        head = s3_client().head_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    except ClientError as e:
        code = e.response['Error']['Code']
        if code == '404':
            # Nothing uploaded — the DB row is meaningless. Drop it.
            blob.delete()
            return Response({'error': 'blob not found in s3'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'error': 's3 error'}, status=status.HTTP_502_BAD_GATEWAY)

    # Any mismatch → object is untrusted; nuke S3 object + Blob row so nothing dangles.
    if head['ContentLength'] != blob.byte_size:
        _delete_s3_object(key)
        blob.delete()
        return Response({'error': 'byte size mismatch'}, status=status.HTTP_400_BAD_REQUEST)
    if head.get('ContentType') != blob.mime:
        _delete_s3_object(key)
        blob.delete()
        return Response({'error': 'mime type mismatch'}, status=status.HTTP_400_BAD_REQUEST)
    if head['ETag'].strip('"') != blob.checksum:
        _delete_s3_object(key)
        blob.delete()
        return Response({'error': 'checksum mismatch'}, status=status.HTTP_400_BAD_REQUEST)

    blob.confirmed = True
    blob.save()

    return Response({
        'message': 'blob confirmed',
        'blob_id': blob.id
    }, status=status.HTTP_200_OK)

@api_view(['DELETE'])
def delete_blob(request):
    if request.data.get('blob_id') is None:
        return Response({
            'error': 'blob_id is required'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        blob = Blob.objects.get(id=request.data['blob_id'])
    except Blob.DoesNotExist:
        return Response({
            'error': 'blob not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    if blob.uploader_id != request.user.id:
        return Response({
            'error': 'unauthorized'
        }, status=status.HTTP_403_FORBIDDEN)
    
    if not blob.confirmed:
        return Response({
            'error': 'blob not confirmed'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    _delete_s3_object(blob.key.name)
    blob.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)