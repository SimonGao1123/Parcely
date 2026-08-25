from django.core.exceptions import (
    NON_FIELD_ERRORS,
    ValidationError as DjangoValidationError,
)
from rest_framework import exceptions
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler as drf_exception_handler


def _as_drf_validation_error(exc: DjangoValidationError) -> exceptions.ValidationError:
    # message_dict only exists when the error was built from a dict; Django raises
    # AttributeError otherwise, so hasattr is the documented way to branch.
    if hasattr(exc, 'message_dict'):
        detail = {
            api_settings.NON_FIELD_ERRORS_KEY if field == NON_FIELD_ERRORS else field: messages
            for field, messages in exc.message_dict.items()
        }
    else:
        detail = {api_settings.NON_FIELD_ERRORS_KEY: exc.messages}
    return exceptions.ValidationError(detail)


def api_exception_handler(exc, context):
    """DRF's default handler only translates APIException, Http404 and Django's
    PermissionDenied. Model-layer validation (full_clean, clean, and the validators
    in store.validators / s3.metadata_schema) raises Django's ValidationError, which
    would otherwise escape as an unhandled 500 rendered as an HTML page."""
    if isinstance(exc, DjangoValidationError):
        exc = _as_drf_validation_error(exc)
    return drf_exception_handler(exc, context)
