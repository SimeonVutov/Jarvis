const { useState, useEffect } = React;

function ModelsPage({ pulls, setPulls }) {
  const [models,    setModels]    = useState([]);
  const [configured, setConfigured] = useState({});
  const [pullInput, setPullInput] = useState("");
  const [searchQ,   setSearchQ]   = useState("");
  const [study,     setStudy]     = useState("");
  const [coding,    setCoding]    = useState("");
  const [general,   setGeneral]   = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignOk,  setAssignOk]  = useState(false);

  useEffect(() => { loadModels(); }, []);

  async function loadModels() {
    const data = await api("/api/models").catch(() => null);
    if (!data) return;
    setModels(data.models || []);
    setConfigured(data.configured || {});
    setStudy(data.configured?.study   || "");
    setCoding(data.configured?.coding || "");
    setGeneral(data.configured?.general || "");
  }

  async function startDownload(name) {
    if (!name.trim()) return;
    await jsonPost("/api/models/pull", { name: name.trim() }).catch(e => alert("Error: " + e.message));
    setPullInput("");
  }

  async function pauseDownload(name) {
    await jsonPost(`/api/models/pull/pause/${encodeURIComponent(name)}`).catch(() => {});
  }

  async function cancelDownload(name) {
    await jsonPost(`/api/models/pull/cancel/${encodeURIComponent(name)}`).catch(() => {});
    setTimeout(() => setPulls(p => { const n = { ...p }; delete n[name]; return n; }), 3000);
  }

  async function deleteModel(name) {
    if (!confirm(`Remove ${name}?`)) return;
    await httpDel(`/api/models/${encodeURIComponent(name)}`).catch(e => alert(e.message));
    loadModels();
  }

  async function saveAssignment() {
    setAssigning(true);
    try {
      const result = await jsonPut("/api/models/assign", { study, coding, general });
      setConfigured(result.models || {});
      setAssignOk(true); setTimeout(() => setAssignOk(false), 2000);
    } catch (e) { alert("Error: " + e.message); }
    setAssigning(false);
  }

  const configuredNames  = Object.values(configured);
  const modelNames       = models.map(m => m.name);
  const activeDownloads  = Object.entries(pulls).filter(([, v]) => v.status === "downloading" || v.status === "queued");
  const doneDownloads    = Object.entries(pulls).filter(([, v]) => v.status === "done");
  const errorDownloads   = Object.entries(pulls).filter(([, v]) => v.status === "error");

  const filteredPopular  = POPULAR_MODELS.filter(m =>
    !searchQ || m.name.toLowerCase().includes(searchQ.toLowerCase()) || m.desc.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="pad">
      <div className="section-head">Model Manager</div>

      {/* Active downloads */}
      {activeDownloads.length > 0 && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-title">Active downloads</div>
          {activeDownloads.map(([name, info]) => (
            <div key={name} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--text)", flex:1 }}>{name}</span>
                <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>{info.status_text || info.status}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => pauseDownload(name)}>
                  {info.paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => cancelDownload(name)}>✕ Cancel</button>
              </div>
              <div className="pull-bar-track">
                <div className="pull-bar-fill" style={{ width: `${info.pct || 0}%` }} />
              </div>
              <div className="pull-pct">{info.pct || 0}%{info.total > 0 ? ` · ${fmtBytes(info.completed || 0)} / ${fmtBytes(info.total)}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* Done notifications */}
      {doneDownloads.map(([name]) => (
        <div key={name} style={{ background:"rgba(0,201,122,.1)", border:"1px solid rgba(0,201,122,.25)", borderRadius:8, padding:"10px 14px", marginBottom:10, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:"var(--green)", fontFamily:"var(--mono)", fontSize:12 }}>✓ {name} downloaded successfully</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { loadModels(); setPulls(p => { const n={...p}; delete n[name]; return n; }); }}>
            Refresh list
          </button>
        </div>
      ))}

      {/* Error notifications */}
      {errorDownloads.map(([name, info]) => (
        <div key={name} style={{ background:"rgba(240,64,96,.1)", border:"1px solid rgba(240,64,96,.25)", borderRadius:8, padding:"10px 14px", marginBottom:10 }}>
          <span style={{ color:"var(--red)", fontFamily:"var(--mono)", fontSize:12 }}>✗ {name}: {info.error}</span>
        </div>
      ))}

      {/* Model assignment */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title">Assign models to modes</div>
        <div className="assign-grid">
          {[["study","STUDY",setStudy,study], ["coding","CODING",setCoding,coding], ["general","GENERAL",setGeneral,general]].map(([mode, label, setter, val]) => (
            <div key={mode} className="assign-card">
              <div className={`assign-label ${mode}`}>{label}</div>
              <div className="assign-current">{configured[mode] || "—"}</div>
              <select className="input" style={{ fontSize:11, padding:"5px 8px" }} value={val} onChange={e => setter(e.target.value)}>
                <option value="">— select —</option>
                {modelNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={saveAssignment} disabled={assigning}>
          {assigning ? "Saving…" : assignOk ? "✓ Saved" : "Apply Assignment"}
        </button>
        <div style={{ fontSize:10, color:"var(--text3)", marginTop:7, fontFamily:"var(--mono)" }}>
          Changes take effect on the next conversation. No restart needed.
        </div>
      </div>

      {/* Search & pull */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title">Download a model</div>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input className="input" placeholder="Search models or type a name…" value={pullInput}
            onChange={e => { setPullInput(e.target.value); setSearchQ(e.target.value); }}
            onKeyDown={e => e.key === "Enter" && startDownload(pullInput)}
            style={{ flex:1 }} />
          <button className="btn btn-primary" onClick={() => startDownload(pullInput)} disabled={!pullInput.trim()}>
            Download
          </button>
        </div>
        <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)", marginBottom:10 }}>
          Downloads run in the background — navigate freely. Browse at{" "}
          <a href="https://ollama.com/library" target="_blank" rel="noreferrer" style={{ color:"var(--cyan)" }}>ollama.com/library</a>
        </div>
        <div className="popular-grid">
          {filteredPopular.map(m => (
            <div key={m.name} className="popular-card" onClick={() => startDownload(m.name)}>
              <div className="popular-name">{m.name}</div>
              <div className="popular-desc">{m.desc}</div>
              <div className="popular-size">{m.size}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Installed models */}
      <div className="model-grid">
        {models.map(m => {
          const roles = Object.entries(configured).filter(([k, v]) => v === m.name && k !== "embed").map(([k]) => k);
          return (
            <div key={m.name} className="model-card">
              {roles.map(r => <span key={r} className="config-badge">⚙ {r}</span>)}
              <div className="model-name">{m.name}</div>
              <div className="model-meta">{fmtSize(m.size)}{m.family ? " · " + m.family : ""}</div>
              <button className="btn btn-danger btn-sm" onClick={() => deleteModel(m.name)} disabled={roles.length > 0} title={roles.length > 0 ? "Unassign first" : ""}>
                Remove
              </button>
            </div>
          );
        })}
        {models.length === 0 && <div className="no-data" style={{ gridColumn:"1/-1" }}>No models found — is Ollama running?</div>}
      </div>
    </div>
  );
}
