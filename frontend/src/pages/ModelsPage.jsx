// ModelsPage owns all download state and polling internally.
// It does NOT share pull data with App — App only receives a boolean callback.
// This prevents the constant App re-renders that were causing UI flashing on other pages.

const { useState, useEffect, useRef } = React;

const MODEL_CATALOGUE = [
  // General
  { name:"llama3.3:70b",           desc:"Llama 3.3 70B — Meta flagship",               size:"43 GB",  cat:"general" },
  { name:"llama3.1:8b",            desc:"Llama 3.1 8B — best all-round",               size:"5 GB",   cat:"general" },
  { name:"llama3.2:3b",            desc:"Llama 3.2 3B — lightweight & fast",           size:"2 GB",   cat:"general" },
  { name:"llama3.2:1b",            desc:"Llama 3.2 1B — ultra lightweight",            size:"1.3 GB", cat:"general" },
  { name:"mistral:7b-instruct",    desc:"Mistral 7B — sharp and concise",              size:"4.5 GB", cat:"general" },
  { name:"mistral-nemo:12b",       desc:"Mistral Nemo 12B — strong reasoning",         size:"7 GB",   cat:"general" },
  { name:"gemma2:2b",              desc:"Gemma 2 2B — Google, very fast",              size:"1.6 GB", cat:"general" },
  { name:"gemma2:9b",              desc:"Gemma 2 9B — Google, strong reasoning",       size:"5.5 GB", cat:"general" },
  { name:"gemma2:27b",             desc:"Gemma 2 27B — Google flagship",               size:"16 GB",  cat:"general" },
  { name:"qwen2.5:0.5b",           desc:"Qwen 2.5 0.5B — smallest Qwen",              size:"400 MB", cat:"general" },
  { name:"qwen2.5:1.5b",           desc:"Qwen 2.5 1.5B — very fast",                  size:"1 GB",   cat:"general" },
  { name:"qwen2.5:3b",             desc:"Qwen 2.5 3B — fast and multilingual",        size:"2 GB",   cat:"general" },
  { name:"qwen2.5:7b",             desc:"Qwen 2.5 7B — multilingual, balanced",       size:"5 GB",   cat:"general" },
  { name:"qwen2.5:14b",            desc:"Qwen 2.5 14B — strong multilingual",         size:"9 GB",   cat:"general" },
  { name:"qwen2.5:32b",            desc:"Qwen 2.5 32B — very capable",                size:"20 GB",  cat:"general" },
  { name:"qwen2.5:72b",            desc:"Qwen 2.5 72B — Qwen flagship",               size:"47 GB",  cat:"general" },
  { name:"phi4:14b",               desc:"Phi-4 14B — Microsoft small model",          size:"9 GB",   cat:"general" },
  { name:"phi3.5:3.8b",            desc:"Phi-3.5 3.8B — Microsoft compact",           size:"2.2 GB", cat:"general" },
  { name:"command-r:35b",          desc:"Command R 35B — Cohere, RAG optimised",      size:"20 GB",  cat:"general" },
  { name:"aya:8b",                 desc:"Aya 8B — Cohere multilingual (23 langs)",    size:"5 GB",   cat:"general" },
  { name:"aya:35b",                desc:"Aya 35B — Cohere multilingual, larger",      size:"20 GB",  cat:"general" },
  // Coding
  { name:"qwen2.5-coder:0.5b",     desc:"Qwen 2.5 Coder 0.5B — tiny code model",     size:"400 MB", cat:"coding"  },
  { name:"qwen2.5-coder:1.5b",     desc:"Qwen 2.5 Coder 1.5B — fast code",           size:"1 GB",   cat:"coding"  },
  { name:"qwen2.5-coder:3b",       desc:"Qwen 2.5 Coder 3B — solid small coder",     size:"2 GB",   cat:"coding"  },
  { name:"qwen2.5-coder:7b",       desc:"Qwen 2.5 Coder 7B — best 7B coder",         size:"4.5 GB", cat:"coding"  },
  { name:"qwen2.5-coder:14b",      desc:"Qwen 2.5 Coder 14B — stronger coder",       size:"9 GB",   cat:"coding"  },
  { name:"qwen2.5-coder:32b",      desc:"Qwen 2.5 Coder 32B — top open coder",       size:"20 GB",  cat:"coding"  },
  { name:"codellama:7b",           desc:"Code Llama 7B — Meta code model",            size:"4.5 GB", cat:"coding"  },
  { name:"codellama:13b",          desc:"Code Llama 13B — Meta code, larger",         size:"8 GB",   cat:"coding"  },
  { name:"codellama:34b",          desc:"Code Llama 34B — Meta code flagship",        size:"20 GB",  cat:"coding"  },
  { name:"deepseek-coder-v2:16b",  desc:"DeepSeek Coder V2 16B — systems code",      size:"9 GB",   cat:"coding"  },
  { name:"starcoder2:3b",          desc:"StarCoder2 3B — Hugging Face, fast",         size:"2 GB",   cat:"coding"  },
  { name:"starcoder2:7b",          desc:"StarCoder2 7B — Hugging Face",               size:"4.5 GB", cat:"coding"  },
  { name:"starcoder2:15b",         desc:"StarCoder2 15B — Hugging Face flagship",     size:"9 GB",   cat:"coding"  },
  // Reasoning / study
  { name:"deepseek-r1:1.5b",       desc:"DeepSeek R1 1.5B — tiny chain-of-thought",  size:"1.1 GB", cat:"study"   },
  { name:"deepseek-r1:7b",         desc:"DeepSeek R1 7B — chain-of-thought",         size:"5 GB",   cat:"study"   },
  { name:"deepseek-r1:8b",         desc:"DeepSeek R1 8B — Llama distilled",          size:"5 GB",   cat:"study"   },
  { name:"deepseek-r1:14b",        desc:"DeepSeek R1 14B — deep reasoning",          size:"9 GB",   cat:"study"   },
  { name:"deepseek-r1:32b",        desc:"DeepSeek R1 32B — very strong reasoning",   size:"20 GB",  cat:"study"   },
  { name:"deepseek-r1:70b",        desc:"DeepSeek R1 70B — flagship reasoning",      size:"43 GB",  cat:"study"   },
  { name:"qwq:32b",                desc:"QwQ 32B — Qwen reasoning model",            size:"20 GB",  cat:"study"   },
  // Embeddings
  { name:"nomic-embed-text",       desc:"Nomic Embed — required for memory search",  size:"270 MB", cat:"embed"   },
  { name:"mxbai-embed-large",      desc:"MixedBread Embed Large — strong",           size:"670 MB", cat:"embed"   },
  { name:"all-minilm",             desc:"All MiniLM — fast sentence embeddings",     size:"45 MB",  cat:"embed"   },
  // Vision
  { name:"llava:7b",               desc:"LLaVA 7B — vision + language",              size:"5 GB",   cat:"vision"  },
  { name:"llava:13b",              desc:"LLaVA 13B — vision + language, stronger",   size:"8 GB",   cat:"vision"  },
  { name:"llava-llama3:8b",        desc:"LLaVA Llama3 8B — best open vision",        size:"5.5 GB", cat:"vision"  },
  { name:"moondream:1.8b",         desc:"Moondream 1.8B — tiny vision model",        size:"1.7 GB", cat:"vision"  },
  { name:"minicpm-v:8b",           desc:"MiniCPM-V 8B — efficient multimodal",       size:"5.5 GB", cat:"vision"  },
];

const CAT_LABELS = {
  general:"General", coding:"Coding", study:"Reasoning",
  embed:"Embeddings", vision:"Vision",
};

function ModelsPage({ onActiveChange }) {
  const [models,     setModels]     = useState([]);
  const [configured, setConfigured] = useState({});
  const [pulls,      setPulls]      = useState({});
  const [searchQ,    setSearchQ]    = useState("");
  const [study,      setStudy]      = useState("");
  const [coding,     setCoding]     = useState("");
  const [general,    setGeneral]    = useState("");
  const [assigning,  setAssigning]  = useState(false);
  const [assignOk,   setAssignOk]   = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    loadModels();
    resumePolling();
    return () => clearInterval(pollRef.current);
  }, []);

  async function loadModels() {
    const data = await api("/api/models").catch(() => null);
    if (!data) return;
    setModels(data.models || []);
    setConfigured(data.configured || {});
    setStudy(data.configured?.study   || "");
    setCoding(data.configured?.coding || "");
    setGeneral(data.configured?.general || "");
  }

  // Called on mount — checks if downloads were already running before we navigated here
  async function resumePolling() {
    const data = await api("/api/models/pull/all").catch(() => ({}));
    setPulls(data);
    const active = Object.values(data).some(v => v.status === "downloading" || v.status === "queued");
    if (active) startPolling();
    onActiveChange(active);
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const data = await api("/api/models/pull/all").catch(() => null);
      if (!data) return;
      setPulls(data);
      const active = Object.values(data).some(v => v.status === "downloading" || v.status === "queued");
      onActiveChange(active);
      if (!active) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 1500);
  }

  async function startDownload(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await jsonPost("/api/models/pull", { name: trimmed });
      const all = await api("/api/models/pull/all");
      setPulls(all);
      onActiveChange(true);
      startPolling();
    } catch (e) {
      alert("Could not start download: " + e.message);
    }
    setSearchQ("");
  }

  async function pauseDownload(name) {
    await jsonPost(`/api/models/pull/pause/${encodeURIComponent(name)}`).catch(() => {});
  }

  async function cancelDownload(name) {
    await jsonPost(`/api/models/pull/cancel/${encodeURIComponent(name)}`).catch(() => {});
    setTimeout(async () => {
      const all = await api("/api/models/pull/all").catch(() => ({}));
      setPulls(all);
      const active = Object.values(all).some(v => v.status === "downloading" || v.status === "queued");
      onActiveChange(active);
    }, 2000);
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
      setAssignOk(true);
      setTimeout(() => setAssignOk(false), 2000);
    } catch (e) {
      alert("Error: " + e.message);
    }
    setAssigning(false);
  }

  const installedNames  = new Set(models.map(m => m.name));
  const configuredNames = Object.values(configured);
  const modelNames      = models.map(m => m.name);

  const activeDownloads = Object.entries(pulls).filter(([, v]) => v.status === "downloading" || v.status === "queued");
  const doneDownloads   = Object.entries(pulls).filter(([, v]) => v.status === "done");
  const errorDownloads  = Object.entries(pulls).filter(([, v]) => v.status === "error");

  // Live autocomplete: filter by query, hide already installed
  const q = searchQ.toLowerCase().trim();
  const suggestions = q.length === 0 ? [] : MODEL_CATALOGUE.filter(m =>
    !installedNames.has(m.name) &&
    (m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.cat.includes(q))
  );

  // Group suggestions by category
  const grouped = suggestions.reduce((acc, m) => {
    if (!acc[m.cat]) acc[m.cat] = [];
    acc[m.cat].push(m);
    return acc;
  }, {});

  return (
    <div className="pad">
      <div className="section-head">Model Manager</div>

      {/* Active downloads */}
      {activeDownloads.length > 0 && (
        <div className="card" style={{ marginBottom:14 }}>
          <div className="card-title">Active downloads</div>
          {activeDownloads.map(([name, info]) => (
            <div key={name} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--text)", flex:1 }}>{name}</span>
                <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
                  {info.paused ? "⏸ Paused" : (info.status_text || info.status)}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => pauseDownload(name)}>
                  {info.paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => cancelDownload(name)}>✕ Cancel</button>
              </div>
              <div className="pull-bar-track">
                <div className="pull-bar-fill" style={{ width:`${info.pct || 0}%` }} />
              </div>
              <div className="pull-pct">
                {info.pct || 0}%
                {info.total > 0 ? ` · ${fmtBytes(info.completed || 0)} / ${fmtBytes(info.total)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done banners */}
      {doneDownloads.map(([name]) => (
        <div key={name} style={{ background:"rgba(0,201,122,.1)", border:"1px solid rgba(0,201,122,.25)", borderRadius:8, padding:"10px 14px", marginBottom:10, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:"var(--green)", fontFamily:"var(--mono)", fontSize:12, flex:1 }}>✓ {name} downloaded</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { loadModels(); setPulls(p => { const n={...p}; delete n[name]; return n; }); }}>
            Refresh list
          </button>
        </div>
      ))}

      {/* Error banners */}
      {errorDownloads.map(([name, info]) => (
        <div key={name} style={{ background:"rgba(240,64,96,.1)", border:"1px solid rgba(240,64,96,.25)", borderRadius:8, padding:"10px 14px", marginBottom:10, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:"var(--red)", fontFamily:"var(--mono)", fontSize:12, flex:1 }}>✗ {name}: {info.error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setPulls(p => { const n={...p}; delete n[name]; return n; })}>Dismiss</button>
        </div>
      ))}

      {/* Model assignment */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-title">Assign models to modes</div>
        <div className="assign-grid">
          {[["study","STUDY",setStudy,study],["coding","CODING",setCoding,coding],["general","GENERAL",setGeneral,general]].map(([mode, label, setter, val]) => (
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
        <button className="btn btn-primary" style={{ marginTop:10 }} onClick={saveAssignment} disabled={assigning}>
          {assigning ? "Saving…" : assignOk ? "✓ Saved" : "Apply assignment"}
        </button>
        <div style={{ fontSize:10, color:"var(--text3)", marginTop:6, fontFamily:"var(--mono)" }}>
          Takes effect on the next conversation. No restart needed.
        </div>
      </div>

      {/* Download search */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-title">Download a model</div>
        <input
          className="input"
          placeholder="Type to search — e.g.  llama  ·  deepseek  ·  qwen  ·  coder"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && searchQ.trim() && startDownload(searchQ)}
          autoComplete="off"
          style={{ marginBottom: 8 }}
        />

        {/* Grouped autocomplete results */}
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, fontFamily:"var(--mono)", color:"var(--text3)", letterSpacing:"1px", textTransform:"uppercase", marginBottom:5, paddingLeft:2 }}>
              {CAT_LABELS[cat] || cat}
            </div>
            <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
              {items.map((m, i) => (
                <div
                  key={m.name}
                  onClick={() => startDownload(m.name)}
                  style={{
                    display:"flex", alignItems:"center", gap:12, padding:"9px 14px",
                    cursor:"pointer", transition:"background .12s",
                    borderBottom: i < items.length - 1 ? "1px solid rgba(26,45,74,.4)" : "none",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,200,240,.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--cyan)", marginBottom:2 }}>{m.name}</div>
                    <div style={{ fontSize:11, color:"var(--text3)" }}>{m.desc}</div>
                  </div>
                  <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)", flexShrink:0 }}>{m.size}</div>
                  <div style={{ fontSize:10, color:"var(--cyan2)", flexShrink:0, fontFamily:"var(--mono)" }}>⬇</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Query with no match — offer direct pull */}
        {q.length > 0 && suggestions.length === 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"var(--bg3)", borderRadius:7, marginBottom:8 }}>
            <span style={{ fontSize:12, color:"var(--text2)", flex:1 }}>
              No catalogue match for{" "}
              <span style={{ fontFamily:"var(--mono)", color:"var(--cyan)" }}>{searchQ}</span>
              {" "}— press Enter to pull directly from Ollama.
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => startDownload(searchQ)}>Pull</button>
          </div>
        )}

        <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
          Downloads continue in the background if you navigate away.{" "}
          Full library at <a href="https://ollama.com/library" target="_blank" rel="noreferrer" style={{ color:"var(--cyan)" }}>ollama.com/library</a>
        </div>
      </div>

      {/* Installed models */}
      <div style={{ fontSize:10, fontWeight:600, letterSpacing:"2px", color:"var(--text3)", textTransform:"uppercase", marginBottom:10, fontFamily:"var(--mono)" }}>
        Installed models
      </div>
      <div className="model-grid">
        {models.map(m => {
          const roles = Object.entries(configured)
            .filter(([k, v]) => v === m.name && k !== "embed")
            .map(([k]) => k);
          return (
            <div key={m.name} className="model-card">
              {roles.map(r => <span key={r} className="config-badge">⚙ {r}</span>)}
              <div className="model-name">{m.name}</div>
              <div className="model-meta">{fmtSize(m.size)}{m.family ? " · " + m.family : ""}</div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => deleteModel(m.name)}
                disabled={roles.length > 0}
                title={roles.length > 0 ? "Unassign this model before removing" : ""}
              >Remove</button>
            </div>
          );
        })}
        {models.length === 0 && (
          <div className="no-data" style={{ gridColumn:"1/-1" }}>No models found — is Ollama running?</div>
        )}
      </div>
    </div>
  );
}
