import io


def test_upload_pdf(client, monkeypatch, tmp_path):
    # Ensure upload path doesn't write into the real repo tree.
    from app.api.v1 import knowledge as knowledge_mod

    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(knowledge_mod, "UPLOAD_DIR", str(upload_dir))

    def fake_process_pdf(file_path: str, filename: str):
        return {"text_file": filename.replace(".pdf", ".txt"), "pages": 1, "processed_at": "0", "keywords": []}

    monkeypatch.setattr(knowledge_mod.service, "process_pdf", fake_process_pdf)

    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    files = {"file": ("manual.PDF", io.BytesIO(pdf_bytes), "application/pdf")}
    res = client.post("/api/v1/knowledge/upload", files=files)
    assert res.status_code == 200
    assert res.json()["status"] == "success"


def test_reject_non_pdf(client):
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    res = client.post("/api/v1/knowledge/upload", files=files)
    assert res.status_code == 400
