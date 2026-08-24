from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Annotated, Literal, Self, Optional
from store.constants import GRID_COLUMNS

HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] # ensures hex color is valid
FONT_FAMILIES = Literal["Inter", "Roboto", "Playfair Display", "Roboto Mono"] # TODO: add more font families
class StoreFrontStyle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    background_color: HexColor
    font_family: FONT_FAMILIES
    font_scale: Annotated[float, Field(ge=0.5, le=3.0)]
    font_color: HexColor
    line_spacing: Annotated[float, Field(ge=0.5, le=3.0)]


class PageBlockStyle(BaseModel): # only store overrides; missing keys inherit from StoreFrontStyle
    model_config = ConfigDict(extra='forbid')
    background_color: Optional[HexColor] = None
    font_family: Optional[FONT_FAMILIES] = None
    font_scale: Optional[Annotated[float, Field(ge=0.5, le=3.0)]] = None
    font_color: Optional[HexColor] = None
    line_spacing: Optional[Annotated[float, Field(ge=0.5, le=3.0)]] = None
    alignment: Optional[Literal["left", "center", "right"]] = "left"
    padding: Optional[Annotated[float, Field(ge=0, le=100)]] = None

class PageBlockLayoutPerDevice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    row_start: Annotated[int, Field(ge=0)]
    row_span: Annotated[int, Field(ge=1)] # 1 row span means height = height of 1 row

    col_start: Annotated[int, Field(ge=0, lt=GRID_COLUMNS)] # 0 indexed
    col_span: Annotated[int, Field(ge=1, le=GRID_COLUMNS)] # 1 column span means width = width of 1 column
    @model_validator(mode="after")
    def check_col_bounds(self) -> Self:
        if self.col_start + self.col_span > GRID_COLUMNS:
            raise ValueError(
                f"col_start + col_span must be <= {GRID_COLUMNS} "
                f"(got {self.col_start} + {self.col_span})"
            )
        return self

class PageBlockLayout(BaseModel):
    model_config = ConfigDict(extra='forbid')
    desktop: PageBlockLayoutPerDevice
    tablet: Optional[PageBlockLayoutPerDevice] = None
    mobile: Optional[PageBlockLayoutPerDevice] = None


# PAGE BLOCK CONTENT SCHEMAS
class MediaBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    media_id: int

class ProductBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: int

class GalleryBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    gallery_ids: list[int]

class SlideshowBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slideshow_ids: list[int]

class TextBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str


CONTENT_SCHEMAS: dict[str, type[BaseModel]] = {
    "media": MediaBlockContent,
    "product": ProductBlockContent,
    "gallery": GalleryBlockContent,
    "slideshow": SlideshowBlockContent,
    "text": TextBlockContent,
}


