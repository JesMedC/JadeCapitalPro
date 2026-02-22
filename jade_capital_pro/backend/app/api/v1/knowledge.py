from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import os
import shutil
from ...services.knowledge_service import KnowledgeBaseService

router = APIRouter(prefix="/knowledge", tags=["Base de Conocimiento"])
service = KnowledgeBaseService()

UPLOAD_DIR = "docs/knowledge_base/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos PDF.")
    
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Procesar para la base de conocimiento
    result = service.process_pdf(file_path, filename)
    if result:
        return {"status": "success", "message": f"{filename} procesado e indexado.", "data": result}
    
    raise HTTPException(status_code=500, detail="Error al procesar el documento.")

@router.get("/list")
def list_knowledge():
    return service.get_knowledge_summary()

@router.get("/search")
def search_knowledge(query: str):
    index = service.get_index()
    results = []
    for filename, data in index.items():
        if query.lower() in filename.lower() or any(query.lower() in kw.lower() for kw in data.get('keywords', [])):
            results.append({"filename": filename, **data})
    return results


class EnablePayload(BaseModel):
    filename: str
    enabled: bool


@router.patch("/enable")
def set_enabled(payload: EnablePayload):
    try:
        return service.set_enabled(payload.filename, payload.enabled)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
