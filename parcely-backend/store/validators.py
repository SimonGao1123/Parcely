from store.schema import (
    StoreFrontStyle,
    PageBlockStyle,
    PageBlockLayout,
    CONTENT_SCHEMAS,
)
from pydantic import ValidationError as PydanticValidationError
from django.core.exceptions import ValidationError


def _format_pydantic_errors(e: PydanticValidationError) -> list[str]:
    return [
        f"{'.'.join(str(p) for p in err['loc']) or '<root>'}: {err['msg']}"
        for err in e.errors()
    ]


def validate_style(value: dict):
    try:
        StoreFrontStyle.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError(_format_pydantic_errors(e))

def validate_page_block_style(value: dict):
    try:
        PageBlockStyle.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError(_format_pydantic_errors(e))

def validate_page_block_layout(value: dict):
    try:
        PageBlockLayout.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError(_format_pydantic_errors(e))

# Not a JSONField validator — call from PageBlock.clean() where `kind` is known.
def validate_page_block_content(value: dict, kind: str):
    schema = CONTENT_SCHEMAS.get(kind)
    if schema is None:
        raise ValidationError({"kind": f"Unknown block kind: {kind}"})
    try:
        schema.model_validate(value)
    except PydanticValidationError as e:
        raise ValidationError({"content": _format_pydantic_errors(e)})

def rect_overlap(a, b):
    if a["col_start"] >= b["col_start"] + b["col_span"] or b["col_start"] >= a["col_start"] + a["col_span"]:
        return False
    if a["row_start"] >= b["row_start"] + b["row_span"] or b["row_start"] >= a["row_start"] + a["row_span"]:
        return False
    return True

def validate_page_layout(blocks):
    # ensures no blocks are overlapping across each breakpoint
    for breakpoint in ("desktop", "tablet", "mobile"):
        positions = [
            (b.id, b.layout.get(breakpoint) or b.layout["desktop"])
            for b in blocks
        ]
        for i, (id_a, a) in enumerate(positions):
            for id_b, b in positions[i+1:]:
                if rect_overlap(a, b):
                    raise ValidationError({"layout": f"Blocks {id_a} and {id_b} overlap on {breakpoint}"})

