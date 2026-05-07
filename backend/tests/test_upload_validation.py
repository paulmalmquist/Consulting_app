"""Tests for upload_validation — Stage 1 and Stage 1b checks."""

import pytest
from app.services.upload_validation import (
    validate_init_upload,
    validate_complete_upload,
    MAX_UPLOAD_BYTES,
)

# ---------------------------------------------------------------------------
# validate_init_upload
# ---------------------------------------------------------------------------

class TestInitUploadAllowed:
    def test_pdf_allowed(self):
        validate_init_upload("report.pdf", "application/pdf")

    def test_xlsx_allowed(self):
        validate_init_upload("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    def test_xls_allowed(self):
        validate_init_upload("data.xls", "application/vnd.ms-excel")

    def test_docx_allowed(self):
        validate_init_upload("contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    def test_csv_allowed(self):
        validate_init_upload("export.csv", "text/csv")

    def test_csv_text_plain_allowed(self):
        validate_init_upload("export.csv", "text/plain")

    def test_png_allowed(self):
        validate_init_upload("screenshot.png", "image/png")

    def test_jpg_allowed(self):
        validate_init_upload("photo.jpg", "image/jpeg")

    def test_jpeg_allowed(self):
        validate_init_upload("photo.jpeg", "image/jpeg")

    def test_webp_allowed(self):
        validate_init_upload("image.webp", "image/webp")

    def test_txt_allowed(self):
        validate_init_upload("notes.txt", "text/plain")

    def test_md_allowed(self):
        validate_init_upload("readme.md", "text/markdown")

    def test_json_allowed(self):
        validate_init_upload("config.json", "application/json")

    def test_uppercase_extension_allowed(self):
        # Extension matching is case-insensitive
        validate_init_upload("REPORT.PDF", "application/pdf")

    def test_docx_with_zip_mime(self):
        # OOXML files are ZIP-based; zip MIME is tolerated for docx/xlsx
        validate_init_upload("contract.docx", "application/zip")

    def test_xlsx_with_zip_mime(self):
        validate_init_upload("data.xlsx", "application/zip")


class TestInitUploadRejected:
    def test_zip_rejected(self):
        with pytest.raises(ValueError, match="not supported"):
            validate_init_upload("archive.zip", "application/zip")

    def test_exe_rejected(self):
        with pytest.raises(ValueError, match="not supported"):
            validate_init_upload("malware.exe", "application/octet-stream")

    def test_no_extension_rejected(self):
        with pytest.raises(ValueError, match="not supported"):
            validate_init_upload("noextension", "application/octet-stream")

    def test_svg_rejected(self):
        with pytest.raises(ValueError, match="not supported"):
            validate_init_upload("icon.svg", "image/svg+xml")

    def test_mime_mismatch_rejected(self):
        # .pdf with image MIME — rejected
        with pytest.raises(ValueError, match="not valid for"):
            validate_init_upload("report.pdf", "image/png")

    def test_png_with_pdf_mime_rejected(self):
        with pytest.raises(ValueError, match="not valid for"):
            validate_init_upload("screenshot.png", "application/pdf")

    def test_size_cap_rejected_413_signal(self):
        oversized = MAX_UPLOAD_BYTES + 1
        with pytest.raises(ValueError, match="exceeds the 25 MB limit"):
            validate_init_upload("big.pdf", "application/pdf", byte_size=oversized)

    def test_size_exactly_at_cap_allowed(self):
        validate_init_upload("edge.pdf", "application/pdf", byte_size=MAX_UPLOAD_BYTES)

    def test_size_none_skips_cap_check(self):
        # byte_size=None means client didn't send size — skip cap check
        validate_init_upload("unknown_size.pdf", "application/pdf", byte_size=None)


# ---------------------------------------------------------------------------
# validate_complete_upload
# ---------------------------------------------------------------------------

class TestCompleteUploadSizeCap:
    def test_oversized_rejected(self):
        with pytest.raises(ValueError, match="exceeds the 25 MB limit"):
            validate_complete_upload("file.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1)

    def test_at_cap_allowed(self):
        validate_complete_upload("file.pdf", "application/pdf", MAX_UPLOAD_BYTES)

    def test_zero_bytes_allowed(self):
        # Edge case: empty file still passes size check (content check is separate)
        validate_complete_upload("empty.pdf", "application/pdf", 0)


class TestCompleteUploadMimeCrossCheck:
    def test_pdf_matches(self):
        validate_complete_upload("doc.pdf", "application/pdf", 1000)

    def test_xlsx_matches(self):
        validate_complete_upload(
            "data.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            1000,
        )

    def test_docx_zip_mime_allowed(self):
        validate_complete_upload("contract.docx", "application/zip", 1000)

    def test_mime_mismatch_rejected(self):
        with pytest.raises(ValueError, match="mismatch"):
            validate_complete_upload("doc.pdf", "image/png", 1000)

    def test_png_with_pdf_mime_rejected(self):
        with pytest.raises(ValueError, match="mismatch"):
            validate_complete_upload("screen.png", "application/pdf", 1000)


class TestCompleteUploadMagicBytes:
    def test_pdf_magic_matches(self):
        header = b"%PDF-1.4 ..."
        validate_complete_upload("report.pdf", "application/pdf", 5000, header_bytes=header)

    def test_png_magic_matches(self):
        header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        validate_complete_upload("shot.png", "image/png", 5000, header_bytes=header)

    def test_jpeg_magic_matches(self):
        header = b"\xff\xd8\xff" + b"\x00" * 13
        validate_complete_upload("photo.jpg", "image/jpeg", 5000, header_bytes=header)

    def test_ooxml_zip_magic_matches_docx(self):
        header = b"PK\x03\x04" + b"\x00" * 12
        validate_complete_upload(
            "contract.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            5000,
            header_bytes=header,
        )

    def test_ooxml_zip_magic_matches_xlsx(self):
        header = b"PK\x03\x04" + b"\x00" * 12
        validate_complete_upload(
            "data.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            5000,
            header_bytes=header,
        )

    def test_pdf_magic_mismatch_png_mime_rejected(self):
        header = b"%PDF-1.4 ..."
        with pytest.raises(ValueError, match="signature mismatch"):
            validate_complete_upload("shot.png", "image/png", 5000, header_bytes=header)

    def test_png_magic_mismatch_pdf_ext_rejected(self):
        header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        with pytest.raises(ValueError, match="signature mismatch"):
            validate_complete_upload("report.pdf", "application/pdf", 5000, header_bytes=header)

    def test_no_magic_on_csv_passes(self):
        # CSV has no magic bytes — cross-check only
        header = b"name,email,amount\n"
        validate_complete_upload("export.csv", "text/csv", 500, header_bytes=header)

    def test_webp_magic_passes(self):
        # WEBP: RIFF....WEBP
        header = b"RIFF\x00\x00\x00\x00WEBP"
        validate_complete_upload("image.webp", "image/webp", 5000, header_bytes=header)
