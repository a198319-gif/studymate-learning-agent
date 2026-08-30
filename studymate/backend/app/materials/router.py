from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import Settings
from backend.app.db import Database, get_session
from backend.app.errors import AppError
from backend.app.materials.service import (
    create_material,
    get_owned,
    process_material,
    public_material,
)
from backend.app.materials.vectors import VectorStore
from backend.app.models import Material, User
from backend.app.security import get_current_user, require_csrf

router = APIRouter(prefix="/api/materials", tags=["materials"])


def _process(request: Request, material_id: str) -> None:
    database: Database = request.app.state.database
    vectors: VectorStore = request.app.state.vector_store
    with database.session_scope() as session:
        process_material(session, vectors, material_id)


@router.get("")
def list_materials(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    materials = session.scalars(
        select(Material).where(Material.user_id == user.id).order_by(Material.created_at.desc())
    ).all()
    return {"materials": [public_material(material) for material in materials]}


@router.get("/{material_id}")
def get_material(
    material_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    return {"material": public_material(get_owned(session, user.id, material_id))}


@router.post("", status_code=201, dependencies=[Depends(require_csrf)])
async def upload_material(
    request: Request,
    background_tasks: BackgroundTasks,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> dict[str, object]:
    settings: Settings = request.app.state.settings
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise AppError(413, "MATERIAL_FILE_TOO_LARGE", "The uploaded file is too large.")
    if not file.filename:
        raise AppError(400, "MATERIAL_FILE_REQUIRED", "Choose a file to upload.")
    material = create_material(
        session,
        user.id,
        Path(settings.data_directory) / "uploads",
        file.filename,
        file.content_type or "application/octet-stream",
        content,
    )
    result = public_material(material)
    background_tasks.add_task(_process, request, material.id)
    return {"material": result}


@router.delete("/{material_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_material(
    request: Request,
    material_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    material = get_owned(session, user.id, material_id)
    request.app.state.vector_store.delete_material(user.id, material.id)
    Path(material.storage_path).unlink(missing_ok=True)
    session.delete(material)
    session.commit()
    return Response(status_code=204)
