const { useState, useEffect, useRef } = React;

function MemoryPage() {
  const [items,   setItems]   = useState([]);
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => { loadMemories(""); }, []);

  async function loadMemories(q) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 80 });
      if (q) params.set("q", q);
      const data = await api("/api/memories?" + params);
      setItems(data || []);
    } catch {}
    setLoading(false);
  }

  function onSearch(value) {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => loadMemories(value), 350);
  }

  async function deleteMemory(id) {
    await httpDel(`/api/memories/${id}`);
    setItems(prev => prev.filter(m => m.id !== id));
  }

  return (
    <div className="pad">
      <div className="section-head">Memory Store</div>
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
        <input className="input" placeholder="Search memories…" value={query} onChange={e => onSearch(e.target.value)} style={{ flex:1 }} />
        {loading && <Spinner />}
      </div>
      <table className="mem-table">
        <thead>
          <tr><th>Date</th><th>Category</th><th>Content</th><th></th></tr>
        </thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id}>
              <td style={{ fontFamily:"var(--mono)", whiteSpace:"nowrap", color:"var(--text3)" }}>{m.ts?.substring(0, 10)}</td>
              <td><span className={`tag tag-${m.tags?.split(",")[0] || "general"}`}>{m.category}</span></td>
              <td>{m.content}</td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => deleteMemory(m.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && !loading && (
            <tr><td colSpan={4} style={{ color:"var(--text3)", padding:"14px 10px" }}>No memories found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
