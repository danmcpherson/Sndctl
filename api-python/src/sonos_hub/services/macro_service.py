"""Service to manage Sonos macros."""

import json
import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from ..config import Settings
from ..models import Macro, MacroParameter
from .soco_cli_service import SocoCliService

logger = logging.getLogger(__name__)


class ImportResult:
    """Result of a macro import operation."""
    
    def __init__(self):
        self.success: bool = False
        self.message: str = ""
        self.imported_count: int = 0


class MacroService:
    """Service to manage Sonos macros."""
    
    def __init__(self, settings: Settings, soco_cli_service: SocoCliService):
        """Initialize the service.
        
        Args:
            settings: Application settings.
            soco_cli_service: The soco-cli service.
        """
        self._settings = settings
        self._soco_cli_service = soco_cli_service
        self._client: httpx.AsyncClient | None = None
        
        self._ensure_macros_file_exists()
    
    @property
    def _macros_file_path(self) -> Path:
        """Get the path to the macros file."""
        return self._settings.macros_file_path
    
    @property
    def _metadata_file_path(self) -> Path:
        """Get the path to the metadata file."""
        return self._settings.macros_metadata_path
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    def _ensure_macros_file_exists(self) -> None:
        """Ensure the macros file exists."""
        # Ensure directory exists
        directory = self._macros_file_path.parent
        if not directory.exists():
            directory.mkdir(parents=True)
            logger.info("Created data directory: %s", directory)
        
        if not self._macros_file_path.exists():
            default_content = """# SonosSoundHub Macros
# Format: macro_name = speaker action args : speaker action args
# Example: morning = Kitchen volume 40 : Kitchen play_favourite "Radio 4"

"""
            self._macros_file_path.write_text(default_content)
            logger.info("Created default macros file at %s", self._macros_file_path)
    
    def get_macros_file_info(self) -> dict:
        """Get information about the macros file."""
        return {
            "filePath": str(self._macros_file_path),
            "fileExists": self._macros_file_path.exists(),
        }
    
    async def get_all_macros(self) -> list[Macro]:
        """Get all macros from the file.
        
        Returns:
            List of macros.
        """
        macros: list[Macro] = []
        metadata = await self._load_metadata()
        
        try:
            lines = self._macros_file_path.read_text().splitlines()
            
            for line in lines:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                
                parts = stripped.split("=", 1)
                if len(parts) == 2:
                    name = parts[0].strip()
                    definition = parts[1].strip()
                    
                    macro = Macro(name=name, definition=definition)
                    
                    # Load metadata if available
                    if name in metadata:
                        meta = metadata[name]
                        macro.description = meta.get("description")
                        macro.category = meta.get("category")
                        macro.is_favorite = meta.get("isFavorite", False)
                        params = meta.get("parameters", [])
                        macro.parameters = [
                            MacroParameter(
                                position=p.get("position", 0),
                                name=p.get("name", ""),
                                description=p.get("description"),
                                type=p.get("type", "string"),
                                default_value=p.get("defaultValue"),
                            )
                            for p in params
                        ]
                    else:
                        # Auto-detect parameters
                        macro.parameters = self._detect_parameters(definition)
                    
                    macros.append(macro)
                    
        except Exception as e:
            logger.error("Failed to read macros file: %s", e)
        
        return macros
    
    async def get_macro(self, name: str) -> Macro | None:
        """Get a specific macro by name.
        
        Args:
            name: Macro name.
            
        Returns:
            The macro, or None if not found.
        """
        macros = await self.get_all_macros()
        for macro in macros:
            if macro.name.lower() == name.lower():
                return macro
        return None
    
    @staticmethod
    def _clean_share_links(definition: str) -> str:
        """Clean share links by removing Apple Music query parameters."""
        if not definition:
            return definition
        
        # Remove ?i= parameter from Apple Music URLs (track-specific parameter)
        cleaned = re.sub(
            r"(https://music\.apple\.com/[^\s:]+)\?i=[0-9]+",
            r"\1",
            definition,
            flags=re.IGNORECASE,
        )
        return cleaned
    
    async def save_macro(self, macro: Macro) -> bool:
        """Save or update a macro.
        
        Args:
            macro: The macro to save.
            
        Returns:
            True if saved successfully.
        """
        try:
            # Clean share links in the definition
            macro.definition = self._clean_share_links(macro.definition)
            
            macros = await self.get_all_macros()
            
            # Remove existing macro with same name
            macros = [m for m in macros if m.name.lower() != macro.name.lower()]
            macros.append(macro)
            
            # Write to file
            content = "# SonosSoundHub Macros\n"
            content += "# Format: macro_name = speaker action args : speaker action args\n\n"
            
            for m in sorted(macros, key=lambda x: x.name):
                if m.description:
                    content += f"# {m.description}\n"
                content += f"{m.name} = {m.definition}\n\n"
            
            self._macros_file_path.write_text(content)
            
            # Save metadata
            await self._save_metadata(macros)
            
            # Reload macros in soco-cli server
            await self.reload_macros()
            
            logger.info("Saved macro: %s", macro.name)
            return True
            
        except Exception as e:
            logger.error("Failed to save macro %s: %s", macro.name, e)
            return False
    
    async def delete_macro(self, name: str) -> bool:
        """Delete a macro.
        
        Args:
            name: Macro name.
            
        Returns:
            True if deleted successfully.
        """
        try:
            macros = await self.get_all_macros()
            original_count = len(macros)
            
            macros = [m for m in macros if m.name.lower() != name.lower()]
            
            if len(macros) == original_count:
                return False
            
            # Write to file
            content = "# SonosSoundHub Macros\n\n"
            
            for m in sorted(macros, key=lambda x: x.name):
                if m.description:
                    content += f"# {m.description}\n"
                content += f"{m.name} = {m.definition}\n\n"
            
            self._macros_file_path.write_text(content)
            
            # Save metadata
            await self._save_metadata(macros)
            
            # Reload macros in soco-cli server
            await self.reload_macros()
            
            logger.info("Deleted macro: %s", name)
            return True
            
        except Exception as e:
            logger.error("Failed to delete macro %s: %s", name, e)
            return False
    
    async def duplicate_macro(self, source_name: str) -> Macro | None:
        """Duplicate a macro with a new name.
        
        Args:
            source_name: Name of the source macro.
            
        Returns:
            The duplicated macro, or None if failed.
        """
        try:
            source_macro = await self.get_macro(source_name)
            if source_macro is None:
                logger.warning("Source macro not found: %s", source_name)
                return None
            
            # Generate a unique name for the duplicate
            macros = await self.get_all_macros()
            base_name = f"{source_name}_copy"
            new_name = base_name
            counter = 1
            
            while any(m.name.lower() == new_name.lower() for m in macros):
                counter += 1
                new_name = f"{base_name}_{counter}"
            
            # Create the duplicate macro
            duplicate_macro = Macro(
                name=new_name,
                definition=source_macro.definition,
                description=source_macro.description,
                category=source_macro.category,
                is_favorite=False,  # Don't duplicate favorite status
                parameters=source_macro.parameters,
            )
            
            # Save the duplicate
            if await self.save_macro(duplicate_macro):
                logger.info("Duplicated macro: %s -> %s", source_name, new_name)
                return duplicate_macro
            
            return None
            
        except Exception as e:
            logger.error("Failed to duplicate macro %s: %s", source_name, e)
            return None
    
    async def execute_macro(self, macro_name: str, arguments: list[str]) -> Any:
        """Execute a macro.
        
        Args:
            macro_name: Name of the macro.
            arguments: List of arguments.
            
        Returns:
            Response from soco-cli.
        """
        await self._soco_cli_service.ensure_server_running()
        
        try:
            client = await self._get_client()
            url = f"{self._soco_cli_service.server_url}/macro/{quote(macro_name)}"
            
            if arguments:
                encoded_args = "/".join(quote(arg) for arg in arguments)
                url += f"/{encoded_args}"
            
            logger.info("Executing macro: %s", url)
            
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.error(
                    "soco-cli request failed: GET %s => %d. Body: %s",
                    url, response.status_code, response.text
                )
                response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error("Failed to execute macro %s: %s", macro_name, e)
            raise
    
    async def reload_macros(self) -> bool:
        """Reload macros in the soco-cli server.
        
        Returns:
            True if reloaded successfully.
        """
        await self._soco_cli_service.ensure_server_running()
        
        try:
            client = await self._get_client()
            url = f"{self._soco_cli_service.server_url}/macros/reload"
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.error(
                    "soco-cli request failed: GET %s => %d. Body: %s",
                    url, response.status_code, response.text
                )
                return False
            
            logger.info("Reloaded macros in soco-cli server")
            return True
            
        except Exception as e:
            logger.error("Failed to reload macros: %s", e)
            return False
    
    @staticmethod
    def _detect_parameters(definition: str) -> list[MacroParameter]:
        """Detect parameters in a macro definition."""
        parameters: list[MacroParameter] = []
        matches = re.findall(r"%(\d+)", definition)
        
        seen: set[int] = set()
        for match in matches:
            position = int(match)
            if position not in seen:
                seen.add(position)
                parameters.append(MacroParameter(
                    position=position,
                    name=f"Parameter {position}",
                    type="string",
                ))
        
        return sorted(parameters, key=lambda p: p.position)
    
    async def _load_metadata(self) -> dict[str, dict]:
        """Load metadata from JSON file."""
        if not self._metadata_file_path.exists():
            return {}
        
        try:
            content = self._metadata_file_path.read_text()
            macros = json.loads(content)
            
            if not isinstance(macros, list):
                return {}
            
            # Filter out invalid macros and handle duplicates
            result: dict[str, dict] = {}
            for m in macros:
                if isinstance(m, dict) and m.get("name"):
                    name = m["name"]
                    if name not in result:
                        result[name] = m
            
            return result
            
        except Exception as e:
            logger.error("Failed to load macro metadata: %s", e)
            return {}
    
    async def _save_metadata(self, macros: list[Macro]) -> None:
        """Save metadata to JSON file."""
        try:
            data = [
                {
                    "name": m.name,
                    "description": m.description,
                    "category": m.category,
                    "isFavorite": m.is_favorite,
                    "parameters": [
                        {
                            "position": p.position,
                            "name": p.name,
                            "description": p.description,
                            "type": p.type,
                            "defaultValue": p.default_value,
                        }
                        for p in m.parameters
                    ],
                }
                for m in macros
            ]
            
            self._metadata_file_path.write_text(json.dumps(data, indent=2))
            
        except Exception as e:
            logger.error("Failed to save macro metadata: %s", e)
    
    async def get_macros_file_content(self) -> str:
        """Get the raw macros file content for export."""
        if not self._macros_file_path.exists():
            return ""
        return self._macros_file_path.read_text()
    
    async def import_macros(self, content: str, merge: bool = False) -> ImportResult:
        """Import macros from file content.
        
        Args:
            content: File content.
            merge: If True, merge with existing macros instead of replacing.
            
        Returns:
            Import result.
        """
        result = ImportResult()
        
        try:
            # Parse the imported content to validate it
            imported_macros = self._parse_macros_file(content)
            
            if not imported_macros:
                result.message = "No valid macros found in the imported file"
                return result
            
            if merge:
                # Merge with existing macros
                existing_content = await self.get_macros_file_content()
                existing_macros = self._parse_macros_file(existing_content)
                
                # Add new macros, skip existing ones
                new_macros: list[str] = []
                for name, definition in imported_macros.items():
                    if name.lower() not in {k.lower() for k in existing_macros}:
                        new_macros.append(f"{name} = {definition}")
                        result.imported_count += 1
                
                if new_macros:
                    # Append to existing file
                    append_content = "\n# Imported macros\n" + "\n".join(new_macros) + "\n"
                    with open(self._macros_file_path, "a") as f:
                        f.write(append_content)
                    result.message = (
                        f"Merged {result.imported_count} new macros "
                        f"(skipped {len(imported_macros) - result.imported_count} existing)"
                    )
                else:
                    result.message = "All macros already exist, nothing to import"
            else:
                # Replace entire file
                self._macros_file_path.write_text(content)
                result.imported_count = len(imported_macros)
                result.message = f"Imported {result.imported_count} macros (replaced existing file)"
            
            result.success = True
            
            # Reload macros in soco-cli
            await self.reload_macros()
            
        except Exception as e:
            logger.error("Failed to import macros: %s", e)
            result.message = f"Failed to import macros: {e}"
        
        return result
    
    @staticmethod
    def _parse_macros_file(content: str) -> dict[str, str]:
        """Parse macros file content into a dictionary."""
        macros: dict[str, str] = {}
        
        for line in content.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            
            equals_index = stripped.find("=")
            if equals_index > 0:
                name = stripped[:equals_index].strip()
                definition = stripped[equals_index + 1:].strip()
                if name and definition:
                    macros[name] = definition
        
        return macros
