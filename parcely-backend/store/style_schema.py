from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated, Literal
HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] # ensures hex color is valid
FONT_FAMILIES = Literal["Inter", "Roboto", "Playfair Display", "Roboto Mono"] # TODO: add more font families
class StoreFrontStyle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    background_color: HexColor
    font_family: FONT_FAMILIES
    font_scale: Annotated[float, Field(ge=0.5, le=3.0)]
    font_color: HexColor
    line_spacing: Annotated[float, Field(ge=0.5, le=3.0)]


class PageBlockStyle(StoreFrontStyle):
    alignment = Literal["left", "center", "right"]
    padding: Annotated[float, Field(ge=0, le=100)]
    margin: Annotated[float, Field(ge=0, le=100)]
    width: Annotated[float, Field(ge=0, le=100)]
    height: Annotated[float, Field(ge=0, le=100)]
    left_bound: Annotated[float, Field(ge=0, le=100)]
    top_bound: Annotated[float, Field(ge=0, le=100)] # percentage of page width and height, left and top
    # tell us exactly where on the page block will be positioned