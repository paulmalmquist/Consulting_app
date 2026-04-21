"""Outlook Assistant for Mac v1."""

from .config import AppConfig, load_config
from .outlook_client import OutlookClient

__all__ = ["AppConfig", "OutlookClient", "load_config"]
