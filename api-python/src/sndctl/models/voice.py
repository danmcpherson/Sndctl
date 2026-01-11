"""Voice-related Pydantic models."""

from .sonos import CamelCaseModel


class ApiKeyRequest(CamelCaseModel):
    """Request to save an API key."""
    
    api_key: str = ""
