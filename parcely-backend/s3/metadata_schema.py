from pydantic import BaseModel, ConfigDict, ValidationError as PydanticValidationError
from django.core.exceptions import ValidationError


class ImageMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid')
    width: int
    height: int


class VideoMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid')
    duration: float
    width: int
    height: int


MIME_SCHEMAS = {
    'image': ImageMetadata,
    'video': VideoMetadata,
}


def validate_metadata(metadata: dict, mime: str):
    if not mime:
        raise ValidationError({'mime': 'MIME is required'})

    top = mime.split('/', 1)[0]
    schema = MIME_SCHEMAS.get(top)
    if schema is None:
        raise ValidationError({'mime': f'unsupported MIME type: {mime}'})

    if not metadata:
        raise ValidationError({'metadata': f'metadata is required for {mime}'})

    try:
        schema.model_validate(metadata)
    except PydanticValidationError as e:
        raise ValidationError({
            'metadata': [
                f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()
            ]
        })


        