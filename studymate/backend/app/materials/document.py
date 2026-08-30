from __future__ import annotations

import io
import re
import zipfile
from html import unescape

from docx import Document
from pypdf import PdfReader

from backend.app.errors import AppError

SUPPORTED_MIME = {
    "pdf": {"application/pdf"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    "txt": {"text/plain"},
}
MAX_ARCHIVE_EXPANDED_BYTES = 100 * 1024 * 1024


def validate_upload(filename: str, mime_type: str, content: bytes) -> str:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_MIME:
        raise AppError(400, "MATERIAL_TYPE_UNSUPPORTED", "Upload a PDF, DOCX, PPTX, or TXT file.")
    if mime_type not in SUPPORTED_MIME[extension]:
        raise AppError(400, "MATERIAL_MIME_INVALID", "The declared file type is not allowed.")
    if extension == "txt":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise AppError(
                400, "MATERIAL_SIGNATURE_INVALID", "The text file is not valid UTF-8 text."
            ) from error
        if b"\x00" in content:
            raise AppError(
                400, "MATERIAL_SIGNATURE_INVALID", "The text file is not valid UTF-8 text."
            )
        return extension
    if extension == "pdf":
        if not content.startswith(b"%PDF-"):
            raise AppError(
                400, "MATERIAL_SIGNATURE_INVALID", "The file content does not match its extension."
            )
        return extension
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            total_size = sum(item.file_size for item in archive.infolist())
            if total_size > MAX_ARCHIVE_EXPANDED_BYTES:
                raise AppError(
                    413,
                    "MATERIAL_ARCHIVE_TOO_LARGE",
                    "The expanded document is too large to process safely.",
                )
            names = set(archive.namelist())
    except (zipfile.BadZipFile, ValueError) as error:
        raise AppError(
            400, "MATERIAL_SIGNATURE_INVALID", "The file content does not match its extension."
        ) from error
    required = "word/document.xml" if extension == "docx" else "ppt/presentation.xml"
    if "[Content_Types].xml" not in names or required not in names:
        raise AppError(
            400, "MATERIAL_SIGNATURE_INVALID", "The file content does not match its extension."
        )
    return extension


def normalize_text(text: str) -> str:
    text = text.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\t\f\v ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return "".join(character for character in text if character in "\n\t" or ord(character) >= 32)


def extract_document(content: bytes, extension: str) -> str:
    if extension == "txt":
        text = content.decode("utf-8")
    elif extension == "docx":
        document = Document(io.BytesIO(content))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    elif extension == "pptx":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:

            def slide_number(name: str) -> int:
                match = re.search(r"\d+", name)
                return int(match.group()) if match else 0

            slides = sorted(
                (
                    name
                    for name in archive.namelist()
                    if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
                ),
                key=slide_number,
            )
            text = "\n".join(
                unescape(value)
                for name in slides
                for value in re.findall(
                    r"<a:t[^>]*>([\s\S]*?)</a:t>", archive.read(name).decode("utf-8")
                )
            )
    else:
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    result = normalize_text(text)
    if not result:
        raise AppError(422, "MATERIAL_TEXT_EMPTY", "No readable text was found in this file.")
    return result


def chunk_text(text: str, max_words: int = 420, overlap_words: int = 60) -> list[str]:
    overlap = min(overlap_words, max_words - 1)
    tokens = re.findall(r"[\u3400-\u9fff]|[\w]+|[^\s]", normalize_text(text), flags=re.UNICODE)
    chunks: list[str] = []
    step = max_words - overlap
    for start in range(0, len(tokens), step):
        chunk = " ".join(tokens[start : start + max_words])
        if chunk:
            chunks.append(chunk)
        if start + max_words >= len(tokens):
            break
    return chunks
