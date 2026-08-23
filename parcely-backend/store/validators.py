from store.schema import StoreFrontStyle, PageBlockStyle, PageBlockLayout
from pydantic import ValidationError as PydanticValidationError
from django.core.exceptions import ValidationError

def validate_style(value: dict):
    try:
        StoreFrontStyle.model_validate(value)
        
    except PydanticValidationError as e:
        raise ValidationError(e.errors())

def validate_page_block_style(value: dict):
    try:
        PageBlockStyle.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError(e.errors())

def validate_page_block_layout(value: dict):
    try:
        PageBlockLayout.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError(e.errors())