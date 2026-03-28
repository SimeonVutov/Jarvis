// HomePage.jsx — Customizable widget-based home page
// Requires globals from: api.js, utils.js, widgets.js, Widgets.jsx
// Layout is persisted to config.json via /api/home/layout

const { useState, useEffect, useRef } = React;

function HomePage({ enabledApps }) {
  const [layout,     setLayout]     = useState(null);   // null = loading
  const [editMode,   setEditMode]   = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState(null);   // grid reorder source index
  const [dragOverIdx,setDragOverIdx]= useState(null);
  const [palDrag,    setPalDrag]    = useState(null);   // widgetId dragged from palette
  const [sizeOf,     setSizeOf]     = useState(null);   // instanceId with size popover open

  useEffect(() => {
    api("/api/home/layout")
      .then(d => setLayout(d.layout?.length ? d.layout : [...DEFAULT_LAYOUT]))
      .catch(() => setLayout([...DEFAULT_LAYOUT]));
  }, []);

  // Close size popover on outside click
  useEffect(() => {
    function close() { setSizeOf(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  function persist(nl) {
    setLayout(nl);
    jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
  }

  function addWidget(widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!def) return;
    persist([...(layout||[]), {
      instanceId: `w${Date.now()}`,
      widgetId,
      cols: def.defaultCols,
      rows: def.defaultRows,
    }]);
  }

  function removeWidget(iid) {
    persist((layout||[]).filter(w => w.instanceId !== iid));
  }

  function resizeWidget(iid, cols, rows) {
    persist((layout||[]).map(w => w.instanceId === iid ? { ...w, cols, rows } : w));
    setSizeOf(null);
  }

  // ── Grid drag-to-reorder ───────────────────────────────────────────
  function gDragStart(e, idx) { setDragSrcIdx(idx); e.dataTransfer.effectAllowed = "move"; }
  function gDragOver(e, idx)  { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); }
  function gDrop(e, idx) {
    e.preventDefault();
    if (dragSrcIdx !== null && dragSrcIdx !== idx) {
      const nl = [...(layout||[])];
      const [itm] = nl.splice(dragSrcIdx, 1);
      nl.splice(idx, 0, itm);
      persist(nl);
    } else if (palDrag) {
      addWidget(palDrag);
    }
    setDragSrcIdx(null); setDragOverIdx(null); setPalDrag(null);
  }
  function gDragEnd() { setDragSrcIdx(null); setDragOverIdx(null); }

  // ── Palette drag-to-add ────────────────────────────────────────────
  function pDragStart(e, widgetId) { setPalDrag(widgetId); e.dataTransfer.effectAllowed = "copy"; }

  if (!layout) return <PageLoading />;

  const availableWidgets = WIDGET_REGISTRY.filter(def =>
    !def.app || !enabledApps || enabledApps.has(def.app)
  );

  return (
    <div className="home-root">
      {/* ── Top bar ── */}
      <div className="home-topbar">
        {editMode && (
          <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
            Drag widgets to reorder · drag from library to add · click × to remove
          </span>
        )}
        <button
          className={`btn ${editMode ? "btn-primary" : "btn-ghost"} btn-sm`}
          onClick={e => { e.stopPropagation(); setEditMode(m => !m); setSizeOf(null); }}
        >
          {editMode ? "✓ Done editing" : "⊞ Customize"}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="home-body">

        {/* ── Widget grid ── */}
        <div
          className="widget-grid"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (palDrag) { addWidget(palDrag); setPalDrag(null); } }}
        >
          {layout.map((item, idx) => {
            const def  = WIDGET_REGISTRY.find(w => w.id === item.widgetId);
            const Comp = WIDGET_COMPONENTS[item.widgetId];
            if (!def || !Comp) return null;

            return (
              <div
                key={item.instanceId}
                className={["widget-cell", dragOverIdx===idx?"drag-over":"", dragSrcIdx===idx?"dragging":""].filter(Boolean).join(" ")}
                style={{ gridColumn:`span ${item.cols}`, gridRow:`span ${item.rows}` }}
                draggable={editMode}
                onDragStart={e => { e.stopPropagation(); gDragStart(e, idx); }}
                onDragOver={e  => { e.stopPropagation(); gDragOver(e, idx);  }}
                onDrop={e      => { e.stopPropagation(); gDrop(e, idx);      }}
                onDragEnd={gDragEnd}
              >
                {/* Edit bar */}
                {editMode && (
                  <div className="widget-bar" onClick={e => e.stopPropagation()}>
                    <span className="widget-drag-handle" title="Drag to reorder">⠿</span>
                    <span className="widget-bar-name">{def.name}</span>
                    <div className="widget-bar-actions">
                      <div style={{ position:"relative" }}>
                        <button
                          className="widget-bar-btn"
                          title="Resize"
                          onClick={e => { e.stopPropagation(); setSizeOf(s => s===item.instanceId ? null : item.instanceId); }}
                        >
                          {item.cols}×{item.rows}
                        </button>
                        {sizeOf === item.instanceId && (
                          <div className="size-popover" onClick={e => e.stopPropagation()}>
                            {def.sizes.map(s => (
                              <button
                                key={`${s.cols}x${s.rows}`}
                                className={`size-opt${s.cols===item.cols&&s.rows===item.rows?" size-active":""}`}
                                onClick={() => resizeWidget(item.instanceId, s.cols, s.rows)}
                              >
                                <span style={{fontFamily:"var(--mono)"}}>{s.cols}×{s.rows}</span>
                                <span>{s.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="widget-bar-btn widget-remove" title="Remove" onClick={() => removeWidget(item.instanceId)}>×</button>
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="widget-content">
                  <Comp cols={item.cols} rows={item.rows} enabledApps={enabledApps} />
                </div>
              </div>
            );
          })}

          {layout.length === 0 && (
            <div style={{ gridColumn:"span 12", textAlign:"center", padding:48, color:"var(--text3)", fontSize:13 }}>
              No widgets yet. Click <strong style={{color:"var(--text)"}}>⊞ Customize</strong> to add some.
            </div>
          )}
        </div>

        {/* ── Palette panel ── */}
        {editMode && (
          <div className="widget-panel" onClick={e => e.stopPropagation()}>
            <div className="widget-panel-head">Widget Library</div>
            <div className="widget-panel-scroll">
              {availableWidgets.map(def => {
                const Comp = WIDGET_COMPONENTS[def.id];
                return (
                  <div
                    key={def.id}
                    className="palette-card"
                    draggable
                    onDragStart={e => pDragStart(e, def.id)}
                    onDragEnd={() => setPalDrag(null)}
                  >
                    <div className="palette-preview">
                      {Comp
                        ? <Comp cols={def.defaultCols} rows={Math.min(def.defaultRows,2)} preview enabledApps={enabledApps} />
                        : <div style={{padding:12,fontSize:24}}>{def.icon}</div>
                      }
                    </div>
                    <div className="palette-info">
                      <div className="palette-name">{def.icon} {def.name}</div>
                      <div className="palette-desc">{def.description}</div>
                      <div className="palette-sizes">
                        {def.sizes.map(s => (
                          <span key={`${s.cols}x${s.rows}`} className="palette-size-tag">{s.cols}×{s.rows}</span>
                        ))}
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ width:"100%", justifyContent:"center", marginTop:4 }}
                        onClick={() => addWidget(def.id)}
                      >+ Add to home</button>
                    </div>
                  </div>
                );
              })}
              {availableWidgets.length === 0 && (
                <div style={{color:"var(--text3)",fontSize:11,fontFamily:"var(--mono)",padding:8}}>
                  Enable apps in Settings to unlock more widgets.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
