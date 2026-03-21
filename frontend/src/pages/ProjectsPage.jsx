const { useState, useEffect, useRef } = React;

function ProjectsPage() {
  const [projects,   setProjects]   = useState([]);
  const [active,     setActive]     = useState(null);
  const [files,      setFiles]      = useState([]);
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newColor,   setNewColor]   = useState("#00c8f0");
  const [pasteOpen,  setPasteOpen]  = useState(false);
  const [pasteName,  setPasteName]  = useState("");
  const [pasteText,  setPasteText]  = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [editFile,   setEditFile]   = useState(null);
  const dropRef      = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { api("/api/projects").then(setProjects).catch(() => {}); }, []);

  async function openProject(project) {
    setActive(project);
    const data = await api(`/api/projects/${project.id}/files`).catch(() => []);
    setFiles(data || []);
  }

  async function createProject() {
    if (!newName) return;
    const created = await jsonPost("/api/projects", { name: newName, description: newDesc, color: newColor });
    setProjects(prev => [created, ...prev]);
    setActive(created); setFiles([]);
    setCreating(false); setNewName(""); setNewDesc("");
  }

  async function deleteProject(id) {
    if (!confirm("Delete project and all its files?")) return;
    await httpDel(`/api/projects/${id}`);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (active?.id === id) { setActive(null); setFiles([]); }
  }

  async function uploadFile(file) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const created = await fetch(`/api/projects/${active.id}/files/upload`, { method: "POST", body: fd }).then(r => r.json());
      setFiles(prev => [created, ...prev]);
    } catch (e) { alert("Upload error: " + e.message); }
    setUploading(false);
  }

  async function savePaste() {
    if (!pasteName || !pasteText) return;
    setUploading(true);
    try {
      const created = await jsonPost(`/api/projects/${active.id}/files/text`, { filename: pasteName, content: pasteText, mime_type: "text/plain" });
      setFiles(prev => [created, ...prev]);
      setPasteName(""); setPasteText(""); setPasteOpen(false);
    } catch (e) { alert("Error: " + e.message); }
    setUploading(false);
  }

  async function openEditor(file) {
    if (file.is_binary) { downloadFile(file.id, file.filename); return; }
    try {
      const data = await api(`/api/projects/${active.id}/files/${file.id}/content`);
      setEditFile({ ...file, initialContent: data.content || "" });
    } catch (e) { alert("Error: " + e.message); }
  }

  function downloadFile(fid) {
    window.open(`/api/projects/${active.id}/files/${fid}/download`, "_blank");
  }

  async function deleteFile(fid) {
    await httpDel(`/api/projects/${active.id}/files/${fid}`);
    setFiles(prev => prev.filter(f => f.id !== fid));
  }

  function onDrop(e) {
    e.preventDefault();
    dropRef.current?.classList.remove("drag-over");
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  }

  return (
    <div className="projects-layout">
      {/* Project list */}
      <div className="project-list-panel">
        <div className="project-list-header">
          <span style={{ fontFamily:"var(--head)", fontSize:12, fontWeight:700, color:"var(--text)" }}>Projects</span>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}>+ New</button>
        </div>

        {creating && (
          <div style={{ padding:"11px 12px", borderBottom:"1px solid var(--border)", background:"var(--bg2)" }}>
            <input className="input" placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom:7 }} autoFocus />
            <input className="input" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} style={{ marginBottom:9 }} />
            <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)", marginBottom:5 }}>Color</div>
            <div className="color-row" style={{ marginBottom:9 }}>
              {PROJECT_COLORS.map(c => (
                <div key={c} className={`color-swatch${newColor === c ? " selected" : ""}`} style={{ background:c }} onClick={() => setNewColor(c)} />
              ))}
            </div>
            <div style={{ display:"flex", gap:7 }}>
              <button className="btn btn-primary btn-sm" onClick={createProject} disabled={!newName}>Create</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="project-list-scroll">
          {projects.length === 0 && <div style={{ padding:"14px 12px", color:"var(--text3)", fontSize:11, fontFamily:"var(--mono)" }}>No projects yet</div>}
          {projects.map(p => (
            <div key={p.id} className={`project-item${active?.id === p.id ? " active" : ""}`} onClick={() => openProject(p)}>
              <div className="project-dot" style={{ background: p.color || "var(--cyan)" }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div className="project-name">{p.name}</div>
                {p.description && <div style={{ fontSize:10, color:"var(--text3)", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.description}</div>}
              </div>
              <span className="project-count">{p.file_count || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Project detail */}
      <div className="project-detail">
        {!active ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", flexDirection:"column", gap:10, color:"var(--text3)" }}>
            <div style={{ fontSize:32, opacity:.25 }}>◧</div>
            <div style={{ fontFamily:"var(--head)", fontSize:14 }}>Select or create a project</div>
            <div style={{ fontSize:11, fontFamily:"var(--mono)" }}>Store notes, files, and references per subject</div>
          </div>
        ) : (
          <>
            <div className="project-detail-header">
              <div style={{ display:"flex", alignItems:"center", gap:11, flexWrap:"wrap" }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background: active.color || "var(--cyan)", flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"var(--head)", fontSize:16, fontWeight:700, color:"var(--text)" }}>{active.name}</div>
                  {active.description && <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>{active.description}</div>}
                </div>
                <div style={{ display:"flex", gap:7, flexShrink:0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPasteOpen(!pasteOpen)}>📋 Paste</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <><Spinner size={10} /> Uploading…</> : "📁 Upload"}
                  </button>
                  <input ref={fileInputRef} type="file" multiple style={{ display:"none" }} onChange={e => Array.from(e.target.files).forEach(uploadFile)} />
                  <button className="btn btn-danger btn-sm" onClick={() => deleteProject(active.id)}>Delete</button>
                </div>
              </div>

              {pasteOpen && (
                <div style={{ marginTop:12, background:"var(--bg2)", borderRadius:8, padding:12, border:"1px solid var(--border)" }}>
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    <input className="input" placeholder="Filename e.g. notes.md" value={pasteName} onChange={e => setPasteName(e.target.value)} style={{ flex:1 }} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={savePaste} disabled={!pasteName || !pasteText || uploading}>
                      {uploading ? "Saving…" : "Save"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPasteOpen(false)}>Cancel</button>
                  </div>
                  <textarea className="paste-area" placeholder="Paste notes, code, or any text here…" value={pasteText} onChange={e => setPasteText(e.target.value)} />
                </div>
              )}
            </div>

            <div className="project-files-area">
              <div ref={dropRef} className="drop-zone"
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add("drag-over"); }}
                onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize:22, marginBottom:4 }}>📂</div>
                <div className="drop-zone-text">Drop files here or click to upload</div>
                <div style={{ fontSize:10, color:"var(--text3)", marginTop:3 }}>PDFs, images, code, any format</div>
              </div>

              {files.length === 0 && <div style={{ color:"var(--text3)", fontSize:12.5, padding:"6px 0" }}>No files yet.</div>}
              {files.map(f => (
                <div key={f.id} className="file-item">
                  <div className="file-icon">{fileIcon(f.mime_type)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="file-name">{f.filename}</div>
                    <div className="file-meta">{fmtBytes(f.size_bytes)} · {f.mime_type} · {f.created_at?.substring(0, 10)}</div>
                  </div>
                  {!f.is_binary && <button className="btn btn-ghost btn-sm" onClick={() => openEditor(f)} style={{ marginRight:5 }}>✏ Edit</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(f.id)} style={{ marginRight:5 }}>⬇</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteFile(f.id)}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* File editor modal */}
      {editFile && (
        <FileEditorModal
          file={editFile}
          projectId={active.id}
          onClose={() => setEditFile(null)}
          onSaved={(id, content) => {
            setFiles(prev => prev.map(f => f.id === id ? { ...f, size_bytes: content.length } : f));
          }}
        />
      )}
    </div>
  );
}
