import boto3
from django.conf import settings
from botocore.config import Config
def s3_client():
    return boto3.client(
        's3',
        region_name=settings.AWS_S3_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,

        config=Config(
            signature_version='s3v4',
            retries={
                'max_attempts': 3,
                'mode': 'standard',
            },
        ),
    )