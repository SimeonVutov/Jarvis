import datetime
import sqlite3
from backend import state
from backend.config import get_chroma_dir
from backend.crypto import encrypt, safe_decrypt


def init_chroma() -> None:
    try:
        import chromadb
        from chromadb.utils import embedding_functions
        client = chromadb.PersistentClient(path=str(get_chroma_dir()))
        ef = embedding_functions.OllamaEmbeddingFunction(
            url="http://localhost:11434/api/embeddings",
            model_name=state.MODELS.get("embed", "nomic-embed-text"),
        )
        state.CHROMA_COL = client.get_or_create_collection("jarvis_memory", embedding_function=ef)
    except Exception as e:
        print(f"ChromaDB init failed (memory search disabled): {e}")
        state.CHROMA_COL = None


def store_memory(con: sqlite3.Connection, category: str, content: str, tags: str = "") -> None:
    ts = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO memories(ts,category,content,tags) VALUES(?,?,?,?)",
        (ts, category, encrypt(content), tags),
    )
    con.commit()
    if state.CHROMA_COL:
        try:
            rid = str(cur.lastrowid)
            state.CHROMA_COL.add(documents=[content], metadatas=[{"category": category}], ids=[rid])
            state.CHROMA_COL.update(ids=[rid], documents=[rid])
        except Exception:
            pass


def recall_memories(con: sqlite3.Connection, query: str, n: int = 6) -> list[str]:
    if not state.CHROMA_COL:
        return []
    try:
        results = state.CHROMA_COL.query(query_texts=[query], n_results=min(n, 10))
        ids = results["ids"][0] if results["ids"] else []
        valid_ids = [int(i) for i in ids if i.isdigit()]
        if not valid_ids:
            return []
        placeholders = ",".join("?" * len(valid_ids))
        rows = con.execute(
            f"SELECT content FROM memories WHERE id IN ({placeholders})", valid_ids
        ).fetchall()
        return [safe_decrypt(r["content"]) for r in rows if safe_decrypt(r["content"])]
    except Exception:
        return []
