from pydantic import BaseModel, ValidationError as PydanticValidationError
from django.core.exceptions import ValidationError
class ImageMetadata(BaseModel):
    width: int
    height: int

class VideoMetadata(BaseModel):
    duration: float
    width: int
    height: int

MIME_SCHEMAS = {
    'image': ImageMetadata,
    'video': VideoMetadata,
}

def validate_metadata(metadata: dict, mime: str):
    if not mime:
        raise ValidationError("MIME is required")
    
    top = mime.split('/', 1)[0]

    schema = MIME_SCHEMAS[top]

    if schema is None:
        raise ValidationError(f"Invalid MIME type: {mime}")
    
    if not metadata:
        raise ValidationError(f"Metadata is required for {mime}")
    
    try:
        schema.model_validate(metadata)
    except PydanticValidationError as e:
        raise ValidationError({
            'metadata': [
                f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()
            ]
        })


        