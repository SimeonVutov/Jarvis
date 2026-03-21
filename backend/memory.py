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


def store_memory(
    con: sqlite3.Connection,
    category: str,
    content: str,
    tags: str = "",
) -> None:
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO memories(ts,category,content,tags) VALUES(?,?,?,?)",
        (ts, category, encrypt(content), tags),
    )
    con.commit()
    if state.CHROMA_COL:
        try:
            rid = str(cur.lastrowid)
            state.CHROMA_COL.add(documents=[content], metadatas=[{"category": category, "tags": tags}], ids=[rid])
            state.CHROMA_COL.update(ids=[rid], documents=[rid])
        except Exception:
            pass


def recall_memories(
    con: sqlite3.Connection,
    query: str,
    n: int = 6,
    allowed_tags: set[str] | None = None,
) -> list[str]:
    """
    Recalls relevant memories using ChromaDB semantic search.

    allowed_tags: if provided, only memories whose tags field matches one of
    the allowed tags are returned. This is how disabled apps are excluded —
    the chat route passes only tags from enabled apps.

    None means no filtering (return everything).
    """
    if not state.CHROMA_COL:
        return []
    try:
        results = state.CHROMA_COL.query(query_texts=[query], n_results=min(n * 2, 20))
        ids     = results["ids"][0] if results["ids"] else []
        metas   = results["metadatas"][0] if results["metadatas"] else []
        valid_ids = [int(i) for i in ids if i.isdigit()]
        if not valid_ids:
            return []

        # Filter by allowed tags before hitting the DB
        if allowed_tags is not None:
            filtered_ids = []
            for rid, meta in zip(ids, metas):
                if not rid.isdigit():
                    continue
                tag = meta.get("tags", "")
                # conversation memories are always included (chat is core)
                # other memories only if their tag is in the allowed set
                if tag == "" or tag in allowed_tags or meta.get("category") == "conversation":
                    filtered_ids.append(int(rid))
            valid_ids = filtered_ids[:n]

        if not valid_ids:
            return []

        placeholders = ",".join("?" * len(valid_ids))
        rows = con.execute(  # nosec B608 — placeholders only, no user data in SQL string
            f"SELECT content, tags FROM memories WHERE id IN ({placeholders})",
            valid_ids,
        ).fetchall()

        # Final tag filter at DB level (belt-and-suspenders)
        results_out = []
        for r in rows:
            tag = r["tags"] or ""
            if allowed_tags is None or tag in allowed_tags or tag == "" or r["tags"] == "conversation":
                content = safe_decrypt(r["content"])
                if content:
                    results_out.append(content)
            if len(results_out) >= n:
                break

        return results_out
    except Exception:
        return []
