"""Everything that decides whether a PageBlock's JSON is legal.

    schema.py      pydantic models for style, layout and per-kind content
    validators.py  the callables PageBlock's fields point at, plus grid overlap
    context.py     resolves the ids inside block content to the objects they name

One package because they are a single chain: a field validator calls a schema, and a
schema change that does not move its validator with it is the way these drift apart.

Nothing is re-exported here. store.models imports store.blocks.validators at module
level, so an __init__ that pulled in context.py - which imports store.models - would
close an import cycle.
"""
