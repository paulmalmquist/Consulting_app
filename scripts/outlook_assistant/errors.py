"""Exception types for the Outlook Assistant."""

from __future__ import annotations


class OutlookAssistantError(RuntimeError):
    """Base exception for this package."""


class ConfigError(OutlookAssistantError):
    """Raised when local configuration cannot be loaded or validated."""


class OutlookUnavailableError(OutlookAssistantError):
    """Raised when Outlook automation is unavailable on the current system."""


class OutlookPermissionError(OutlookAssistantError):
    """Raised when macOS blocks Apple Events or related access."""


class OutlookOperationError(OutlookAssistantError):
    """Raised when an AppleScript-backed Outlook action fails."""


class PendingActionError(OutlookAssistantError):
    """Raised when the pending action queue is invalid or cannot be used."""
