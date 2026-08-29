from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Annotated, Literal, Self, Optional
from store.constants import GRID_COLUMNS

# CSS Color 4 hex forms: #RGB, #RGBA, #RRGGBB, #RRGGBBAA. 5 and 7 digits are
# not valid hex colors, so the lengths are enumerated rather than ranged.
HexColor = Annotated[str, Field(pattern=r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")]
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

class LinkBlockContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    page_id: int # the page navigated to; its slug is resolved at read time
    media_id: Optional[int] = None
    text: Optional[str] = None

    @model_validator(mode="after")
    def check_has_body(self) -> Self:
        if self.media_id is None and not (self.text or "").strip():
            raise ValueError("A link needs media, text, or both")
        return self


CONTENT_SCHEMAS: dict[str, type[BaseModel]] = {
    "media": MediaBlockContent,
    "product": ProductBlockContent,
    "gallery": GalleryBlockContent,
    "slideshow": SlideshowBlockContent,
    "text": TextBlockContent,
    "link": LinkBlockContent,
}
