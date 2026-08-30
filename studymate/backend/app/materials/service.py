from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.errors import AppError
from backend.app.materials.document import chunk_text, extract_document, validate_upload
from backend.app.materials.vectors import VectorStore
from backend.app.models import Material, MaterialStatus, ProcessingJob, ProcessingStage


def public_material(material: Material) -> dict[str, object]:
    return {
        "id": material.id,
        "originalName": material.original_name,
        "mimeType": material.mime_type,
        "extension": material.extension,
        "size": material.size,
        "status": material.status.value,
        "chunkCount": material.chunk_count,
        "processingError": material.processing_error,
        "createdAt": material.created_at,
        "updatedAt": material.updated_at,
    }


def get_owned(session: Session, user_id: str, material_id: str) -> Material:
    material = session.scalar(
        select(Material).where(Material.id == material_id, Material.user_id == user_id)
    )
    if material is None:
        raise AppError(404, "MATERIAL_NOT_FOUND", "Material not found.")
    return material


def create_material(
    session: Session,
    user_id: str,
    upload_directory: Path,
    filename: str,
    mime_type: str,
    content: bytes,
) -> Material:
    extension = validate_upload(filename, mime_type, content)
    safe_name = Path(filename.replace("\\", "/")).name
    stored_name = f"{uuid4().hex}.{extension}"
    user_directory = upload_directory / user_id
    user_directory.mkdir(parents=True, exist_ok=True)
    storage_path = user_directory / stored_name
    storage_path.write_bytes(content)
    material = Material(
        user_id=user_id,
        original_name=safe_name,
        stored_name=stored_name,
        storage_path=str(storage_path.resolve()),
        mime_type=mime_type,
        extension=extension,
        size=len(content),
        checksum=hashlib.sha256(content).hexdigest(),
        status=MaterialStatus.PROCESSING,
    )
    session.add(material)
    session.flush()
    session.add(
        ProcessingJob(material_id=material.id, user_id=user_id, stage=ProcessingStage.QUEUED)
    )
    try:
        session.commit()
        session.refresh(material)
    except Exception:
        session.rollback()
        storage_path.unlink(missing_ok=True)
        raise
    return material


def process_material(session: Session, vectors: VectorStore, material_id: str) -> None:
    material = session.get(Material, material_id)
    if material is None:
        return
    job = session.scalar(select(ProcessingJob).where(ProcessingJob.material_id == material_id))
    try:
        if job:
            job.stage = ProcessingStage.EXTRACTING
        content = Path(material.storage_path).read_bytes()
        text = extract_document(content, material.extension)
        if job:
            job.stage = ProcessingStage.CHUNKING
        chunks = chunk_text(text)
        if not chunks:
            raise AppError(422, "MATERIAL_TEXT_EMPTY", "No readable text was found in this file.")
        if job:
            job.stage = ProcessingStage.EMBEDDING
        vectors.replace_material(material.user_id, material.id, material.original_name, chunks)
        if job:
            job.stage = ProcessingStage.COMPLETE
        material.status = MaterialStatus.READY
        material.chunk_count = len(chunks)
        material.processing_error = None
        session.commit()
    except Exception as error:
        vectors.delete_material(material.user_id, material.id)
        code = error.code if isinstance(error, AppError) else "MATERIAL_PROCESSING_FAILED"
        if job:
            job.stage = ProcessingStage.FAILED
            job.error_code = code
        material.status = MaterialStatus.FAILED
        material.processing_error = code
        session.commit()
