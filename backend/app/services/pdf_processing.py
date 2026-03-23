from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


@dataclass
class PageText:
    page: int
    text: str
    source: str  # text|ocr


class OCRUnavailableError(RuntimeError):
    pass


class PDFProcessor:
    def extract_pages(self, pdf_bytes: bytes) -> list[PageText]:
        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / "input.pdf"
            pdf_path.write_bytes(pdf_bytes)

            reader = PdfReader(str(pdf_path))
            pages: list[PageText] = []
            for i, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                if text:
                    pages.append(PageText(page=i, text=text, source="text"))
                    continue

                ocr_text = self._ocr_page(pdf_path, i)
                pages.append(PageText(page=i, text=ocr_text.strip(), source="ocr"))

            return pages

    def _ocr_page(self, pdf_path: Path, page_no: int) -> str:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir) / f"page-{page_no}"
            render_cmd = [
                "pdftoppm",
                "-f",
                str(page_no),
                "-singlefile",
                "-png",
                str(pdf_path),
                str(base),
            ]
            ocr_cmd = ["tesseract", f"{base}.png", "stdout"]
            try:
                subprocess.run(render_cmd, check=True, capture_output=True, text=True)
                out = subprocess.run(ocr_cmd, check=True, capture_output=True, text=True)
            except FileNotFoundError as e:
                raise OCRUnavailableError("pdftoppm/tesseract not installed") from e
            except subprocess.CalledProcessError as e:
                raise OCRUnavailableError(f"OCR command failed: {e.stderr[:300]}") from e

            return out.stdout
