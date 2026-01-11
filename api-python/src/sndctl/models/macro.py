"""Macro-related Pydantic models."""

from pydantic import ConfigDict

from .sonos import CamelCaseModel


class MacroParameter(CamelCaseModel):
    """Parameter definition for a macro."""
    
    position: int  # 1-12
    name: str = ""
    description: str | None = None
    type: str = "string"  # string, speaker, volume, etc.
    default_value: str | None = None


class Macro(CamelCaseModel):
    """Represents a Sonos macro."""
    
    name: str = ""
    definition: str = ""
    description: str | None = None
    category: str | None = None
    is_favorite: bool = False
    parameters: list[MacroParameter] = []


class MacroExecuteRequest(CamelCaseModel):
    """Request to execute a macro."""
    
    macro_name: str = ""
    arguments: list[str] = []
