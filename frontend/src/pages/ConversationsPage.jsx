const { useState, useEffect } = React;

function ConversationsPage() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => { api("/api/conversations").then(setSessions).catch(() => {}); }, []);

  async function openConversation(id) {
    setActiveId(id);
    const data = await api(`/api/conversations/${id}`);
    setMessages(data || []);
  }

  async function deleteConversation(id) {
    await httpDel(`/api/conversations/${id}`);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  }

  return (
    <div className="convs-layout">
      <div className="convs-list">
        {sessions.map(s => (
          <div key={s.id} className={`conv-item${activeId === s.id ? " active" : ""}`} onClick={() => openConversation(s.id)}>
            <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)", marginBottom:2 }}>
              {s.date} · {s.msg_count || 0} msgs
            </div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {s.summary}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span className={`tag tag-${s.mode || "general"}`}>{(s.mode || "general").toUpperCase()}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteConversation(s.id); }}
                style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:11 }}
              >✕</button>
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding:14, color:"var(--text3)", fontSize:11, fontFamily:"var(--mono)" }}>No conversations yet</div>
        )}
      </div>

      <div className="conv-view">
        {!activeId && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--text3)", fontSize:13 }}>
            Select a conversation
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="msg-block">
            <div className={`msg-role ${m.role}`}>{m.role === "user" ? "You" : "Jarvis"} · {m.mode || "general"} · {m.ts?.substring(0, 16) || ""}</div>
            <div className={`msg-content ${m.role}`}>{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
