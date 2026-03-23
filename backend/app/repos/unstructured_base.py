"""Vendor-neutral interface for unstructured (file) storage."""

from abc import ABC, abstractmethod


class UnstructuredRepository(ABC):
    """Abstract base for object/file storage backends."""

    @abstractmethod
    def generate_signed_upload_url(
        self, bucket: str, storage_key: str, content_type: str, expires_in: int = 3600
    ) -> str:
        """Return a pre-signed URL the client can PUT a file to."""
        ...

    @abstractmethod
    def generate_signed_download_url(
        self, bucket: str, storage_key: str, expires_in: int = 3600
    ) -> str:
        """Return a pre-signed URL the client can GET a file from."""
        ...

    @abstractmethod
    def delete_object(self, bucket: str, storage_key: str) -> None:
        """Delete an object from the bucket."""
        ...
