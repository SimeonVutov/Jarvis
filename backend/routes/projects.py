import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, encrypt_bytes, decrypt_bytes, safe_decrypt
from backend.schemas import ProjectCreate, TextFileCreate, FileContentUpdate

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


# ── Projects ───────────────────────────────────────────────────────────────────

@router.get("/api/projects")
async def list_projects():
    _require_auth()
    con  = get_connection()
    rows = con.execute("""
        SELECT p.*, COUNT(f.id) AS file_count
        FROM projects p
        LEFT JOIN project_files f ON f.project_id = p.id
        GROUP BY p.id ORDER BY p.id DESC
    """).fetchall()
    con.close()
    return [
        {**dict(r), "name": safe_decrypt(r["name"]), "description": safe_decrypt(r["description"])}
        for r in rows
    ]


@router.post("/api/projects")
async def create_project(body: ProjectCreate):
    _require_auth()
    con = get_connection()
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO projects(name,description,color,created_at) VALUES(?,?,?,?)",
        (encrypt(body.name), encrypt(body.description), body.color, ts),
    )
    con.commit()
    pid = cur.lastrowid
    con.close()
    return {"id": pid, "name": body.name, "description": body.description,
            "color": body.color, "created_at": ts, "file_count": 0}


@router.put("/api/projects/{pid}")
async def update_project(pid: int, body: ProjectCreate):
    _require_auth()
    con = get_connection()
    con.execute(
        "UPDATE projects SET name=?,description=?,color=? WHERE id=?",
        (encrypt(body.name), encrypt(body.description), body.color, pid),
    )
    con.commit()
    con.close()
    return {"success": True}


@router.delete("/api/projects/{pid}")
async def delete_project(pid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM project_files WHERE project_id=?", (pid,))
    con.execute("DELETE FROM projects WHERE id=?", (pid,))
    con.commit()
    con.close()
    return {"deleted": pid}


# ── Files ──────────────────────────────────────────────────────────────────────

@router.get("/api/projects/{pid}/files")
async def list_files(pid: int):
    _require_auth()
    con  = get_connection()
    rows = con.execute(
        "SELECT id,filename,mime_type,size_bytes,is_binary,created_at FROM project_files WHERE project_id=? ORDER BY id DESC",
        (pid,),
    ).fetchall()
    con.close()
    return [{**dict(r), "filename": safe_decrypt(r["filename"])} for r in rows]


@router.post("/api/projects/{pid}/files/text")
async def add_text_file(pid: int, body: TextFileCreate):
    _require_auth()
    con  = get_connection()
    ts   = datetime.datetime.now().isoformat()
    size = len(body.content.encode())
    cur  = con.execute(
        "INSERT INTO project_files(project_id,filename,mime_type,size_bytes,content,is_binary,created_at) VALUES(?,?,?,?,?,0,?)",
        (pid, encrypt(body.filename), body.mime_type, size, encrypt(body.content), ts),
    )
    con.commit()
    fid = cur.lastrowid
    con.close()
    return {"id": fid, "filename": body.filename, "mime_type": body.mime_type,
            "size_bytes": size, "created_at": ts}


@router.post("/api/projects/{pid}/files/upload")
async def upload_file(pid: int, file: UploadFile = File(...)):
    _require_auth()
    data  = await file.read()
    fname = file.filename or "upload"
    mime  = file.content_type or "application/octet-stream"
    ts    = datetime.datetime.now().isoformat()
    try:
        content  = encrypt(data.decode("utf-8"))
        is_binary = 0
    except Exception:
        content   = encrypt_bytes(data)
        is_binary = 1
    con = get_connection()
    cur = con.execute(
        "INSERT INTO project_files(project_id,filename,mime_type,size_bytes,content,is_binary,created_at) VALUES(?,?,?,?,?,?,?)",
        (pid, encrypt(fname), mime, len(data), content, is_binary, ts),
    )
    con.commit()
    fid = cur.lastrowid
    con.close()
    return {"id": fid, "filename": fname, "mime_type": mime, "size_bytes": len(data), "created_at": ts}


@router.get("/api/projects/{pid}/files/{fid}/content")
async def get_file_content(pid: int, fid: int):
    _require_auth()
    con = get_connection()
    row = con.execute(
        "SELECT * FROM project_files WHERE id=? AND project_id=?", (fid, pid)
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "File not found")
    if row["is_binary"]:
        raise HTTPException(400, "Binary file — use /download")
    return {
        "content":   safe_decrypt(row["content"]),
        "filename":  safe_decrypt(row["filename"]),
        "mime_type": row["mime_type"],
    }


@router.put("/api/projects/{pid}/files/{fid}/content")
async def update_file_content(pid: int, fid: int, body: FileContentUpdate):
    _require_auth()
    con = get_connection()
    row = con.execute("SELECT id FROM project_files WHERE id=? AND project_id=?", (fid, pid)).fetchone()
    if not row:
        raise HTTPException(404, "File not found")
    con.execute(
        "UPDATE project_files SET content=?,size_bytes=? WHERE id=?",
        (encrypt(body.content), len(body.content.encode()), fid),
    )
    con.commit()
    con.close()
    return {"success": True}


@router.get("/api/projects/{pid}/files/{fid}/download")
async def download_file(pid: int, fid: int):
    _require_auth()
    con = get_connection()
    row = con.execute(
        "SELECT * FROM project_files WHERE id=? AND project_id=?", (fid, pid)
    ).fetchone()
    con.close()
    if not row:
        raise HTTPException(404, "File not found")
    fname = safe_decrypt(row["filename"])
    mime  = row["mime_type"] or "text/plain"
    data  = (
        decrypt_bytes(row["content"])
        if row["is_binary"]
        else safe_decrypt(row["content"]).encode("utf-8")
    )
    return Response(
        content=data, media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.delete("/api/projects/{pid}/files/{fid}")
async def delete_file(pid: int, fid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM project_files WHERE id=? AND project_id=?", (fid, pid))
    con.commit()
    con.close()
    return {"deleted": fid}
