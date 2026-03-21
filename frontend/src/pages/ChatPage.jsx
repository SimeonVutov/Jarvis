const { useState, useEffect, useRef } = React;

function ChatPage() {
  const [sessions,    setSessions]    = useState([]);
  const [sessionId,   setSessionId]   = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const [streamText,  setStreamText]  = useState("");
  const [mode,        setMode]        = useState("general");
  const [searching,   setSearching]   = useState(false);
  const [modelNames,  setModelNames]  = useState({});
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef  = useRef(null);

  const hour   = new Date().getHours();
  const period = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  useEffect(() => {
    api("/api/conversations?limit=40").then(setSessions).catch(() => {});
    api("/api/stats").then(d => setModelNames(d.models || {})).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  function newChat() {
    setSessionId(null);
    setMessages([]);
    setStreamText("");
    setMode("general");
  }

  async function loadSession(id) {
    setSessionId(id);
    setMessages([]);
    setStreamText("");
    const data = await api(`/api/conversations/${id}`);
    setMessages(data || []);
  }

  function stopGeneration() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      // Keep whatever was streamed so far as a partial message
      if (streamText) {
        setMessages(prev => [...prev, {
          role: "assistant", content: streamText + " …[stopped]",
          ts: new Date().toISOString(), mode,
        }]);
        setStreamText("");
      }
      setStreaming(false);
      setSearching(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "22px";
    setMessages(prev => [...prev, { role: "user", content: text, ts: new Date().toISOString(), mode }]);
    setStreaming(true);
    setStreamText("");
    setSearching(false);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId, mode }),
        signal: controller.signal,
      });
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiText = "";
      let newSid  = sessionId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === "mode")   setMode(event.mode);
            if (event.type === "status" && event.text?.includes("Search")) setSearching(true);
            if (event.type === "delta")  { setSearching(false); aiText += event.delta; setStreamText(aiText); }
            if (event.type === "done")   { newSid = event.session_id; setSessionId(event.session_id); }
          } catch {}
        }
      }

      if (aiText) setMessages(prev => [...prev, { role: "assistant", content: aiText, ts: new Date().toISOString(), mode }]);
      setStreamText("");
      if (newSid && !sessions.find(s => s.id === newSid))
        api("/api/conversations?limit=40").then(setSessions).catch(() => {});

    } catch (e) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", content: "Connection error — is Ollama running?", ts: new Date().toISOString(), mode }]);
        setStreamText("");
      }
    }
    setStreaming(false);
    setSearching(false);
    abortRef.current = null;
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }
  function onInput(e) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "22px";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  const hasContent = messages.length > 0 || streamText;

  return (
    <div className="chat-shell">
      {/* Session list */}
      <div className="sessions-panel">
        <div className="sessions-header">
          <span style={{ fontFamily: "var(--head)", fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Sessions</span>
          <button
            style={{ background:"none", border:"1px solid var(--border2)", color:"var(--text3)", padding:"3px 9px", borderRadius:5, cursor:"pointer", fontSize:11, fontFamily:"var(--mono)", transition:"all .15s" }}
            onClick={newChat}
            onMouseEnter={e => { e.target.style.borderColor="var(--cyan)"; e.target.style.color="var(--cyan)"; }}
            onMouseLeave={e => { e.target.style.borderColor="var(--border2)"; e.target.style.color="var(--text3)"; }}
          >+ New</button>
        </div>
        <div className="sessions-list">
          {sessions.length === 0 && (
            <div style={{ color:"var(--text3)", fontSize:11, padding:12, fontFamily:"var(--mono)" }}>No history yet</div>
          )}
          {sessions.map(s => {
            const d    = daysUntil(s.date);
            const when = d === 0 ? "Today" : d === -1 ? "Yesterday" : s.date;
            return (
              <div key={s.id} className={`session-item${sessionId === s.id ? " active" : ""}`} onClick={() => loadSession(s.id)}>
                <div className="session-date">{when} · {s.msg_count || 0} msgs</div>
                <div className="session-summary">{s.summary || "Conversation"}</div>
                <span className={`tag tag-${s.mode || "general"}`}>{(s.mode || "general").toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-title">Good {period}, <span>let's work</span></div>
          <div className="chat-meta">
            <div className={`mode-badge ${mode}`}><div className="mode-dot" />{mode.toUpperCase()}</div>
            <span className="chat-model">{modelNames[mode] || ""}</span>
            {searching && <span className="searching">◉ searching…</span>}
          </div>
        </div>

        <div className="messages-area">
          {!hasContent && (
            <div className="empty-chat">
              <div className="empty-icon">◈</div>
              <div style={{ fontFamily:"var(--head)", fontSize:14 }}>Ask me anything</div>
              <div style={{ fontSize:11, fontFamily:"var(--mono)", color:"var(--text3)" }}>
                Mode auto-detects · web search · all encrypted
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.role}`}>
              {m.role === "user" ? (
                <div className="user-bubble">{m.content}</div>
              ) : (
                <div className="ai-wrap">
                  <div className="ai-avatar">J</div>
                  <div className="ai-body">
                    <div className="ai-label">JARVIS · {(m.mode || mode).toUpperCase()}</div>
                    <Markdown content={m.content} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {streamText && (
            <div className="msg-row assistant">
              <div className="ai-wrap">
                <div className="ai-avatar">J</div>
                <div className="ai-body">
                  <div className="ai-label">JARVIS · {mode.toUpperCase()}</div>
                  <Markdown content={streamText} />
                  <span className="cursor" />
                </div>
              </div>
            </div>
          )}

          {streaming && !streamText && !searching && (
            <div className="msg-row assistant">
              <div className="ai-wrap">
                <div className="ai-avatar">J</div>
                <div className="ai-body">
                  <div className="ai-label">JARVIS</div>
                  <span className="cursor" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={`Message Jarvis (${mode} mode)…`}
              value={input}
              onChange={onInput}
              onKeyDown={onKey}
              rows={1}
            />
            {streaming ? (
              <button className="send-btn is-stop" onClick={stopGeneration} title="Stop generation">■</button>
            ) : (
              <button className="send-btn" onClick={sendMessage} disabled={!input.trim()}>↑</button>
            )}
          </div>
          <div className="chat-hint">
            <span className="hint-text">↵ send · shift+↵ newline · ■ stop</span>
            {sessionId && <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>session #{sessionId}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
