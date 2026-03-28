// HomePage.jsx — Customizable widget grid
// Grid overlay uses onDragEnter on each cell slot — works correctly with HTML5 drag API
// (mousemove does NOT fire during drag, so we use drag events on the slots themselves)

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const COLS      = 12;
const SLOT_ROWS = 10;  // rows of ghost slots to render

// ── Compute which (row,col) each widget occupies ────────────────────
function buildOccupiedSet(layout) {
  const occupied = new Set();
  const placed   = [];
  let curR = 0, curC = 0;

  for (const item of layout) {
    const cols = item.cols || 4;
    const rows = item.rows || 1;
    let found  = false;

    outer:
    for (let r = curR; r < curR + 200; r++) {
      const startC = r === curR ? curC : 0;
      for (let c = startC; c <= COLS - cols; c++) {
        let free = true;
        for (let dr = 0; dr < rows && free; dr++)
          for (let dc = 0; dc < cols && free; dc++)
            if (occupied.has(`${r+dr},${c+dc}`)) free = false;
        if (free) {
          placed.push({ ...item, gridR: r, gridC: c });
          for (let dr = 0; dr < rows; dr++)
            for (let dc = 0; dc < cols; dc++)
              occupied.add(`${r+dr},${c+dc}`);
          curR = r; curC = c + cols;
          if (curC >= COLS) { curR++; curC = 0; }
          found = true;
          break outer;
        }
      }
      curR = r + 1; curC = 0;
    }
    if (!found) placed.push({ ...item, gridR: 0, gridC: 0 });
  }
  return { occupiedSet: occupied, placed };
}

// ── Grid slot overlay — cells are real drag targets ──────────────────
// Each 1×1 slot has onDragEnter; we track which slot is hovered and
// highlight the widget footprint (green=fits, red=blocked).
function GridOverlay({ layout, dragCols, dragRows }) {
  const [hoverCell, setHoverCell] = useState(null);  // {r, c}

  const { occupiedSet } = useMemo(() => buildOccupiedSet(layout || []), [layout]);

  function fitsAt(r, c) {
    if (c + dragCols > COLS) return false;
    for (let dr = 0; dr < dragRows; dr++)
      for (let dc = 0; dc < dragCols; dc++)
        if (occupiedSet.has(`${r+dr},${c+dc}`)) return false;
    return true;
  }

  const ok = hoverCell ? fitsAt(hoverCell.r, hoverCell.c) : null;

  const cells = [];
  for (let r = 0; r < SLOT_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isOcc = occupiedSet.has(`${r},${c}`);

      let bg = "rgba(0,200,240,.025)";
      let border = "1px dashed rgba(0,200,240,.15)";

      if (hoverCell) {
        const inFP = r >= hoverCell.r && r < hoverCell.r + dragRows &&
                     c >= hoverCell.c && c < hoverCell.c + dragCols;
        if (inFP) {
          bg     = ok ? "rgba(0,200,240,.18)"  : "rgba(240,64,96,.2)";
          border = ok ? "1px solid rgba(0,200,240,.6)" : "1px solid rgba(240,64,96,.5)";
        } else if (isOcc) {
          bg     = "rgba(240,64,96,.07)";
          border = "1px dashed rgba(240,64,96,.2)";
        }
      } else if (isOcc) {
        bg     = "rgba(240,64,96,.05)";
        border = "1px dashed rgba(240,64,96,.15)";
      }

      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            gridColumn: "span 1",
            gridRow:    "span 1",
            borderRadius: 8,
            background: bg,
            border,
            transition: "background .08s, border-color .08s",
            cursor: "crosshair",
          }}
          onDragEnter={e => { e.preventDefault(); setHoverCell({ r, c }); }}
          onDragOver={e  => { e.preventDefault(); }}
          onDragLeave={e => {
            // Only clear if truly leaving the overlay (not just crossing between cells)
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
              setHoverCell(null);
            }
          }}
        />
      );
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridAutoRows: "140px",
        gap: 12,
        padding: "0 16px",
        zIndex: 4,
        pointerEvents: "none",
      }}
      onDragLeave={() => setHoverCell(null)}
    >
      {cells.map(c => React.cloneElement(c, { style: { ...c.props.style, pointerEvents: "all" } }))}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────
function HomePage({ enabledApps }) {
  const [layout,      setLayout]      = useState(null);
  const [editMode,    setEditMode]    = useState(false);
  const [dragSrcIdx,  setDragSrcIdx]  = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [palDrag,     setPalDrag]     = useState(null);
  const [dragSize,    setDragSize]    = useState(null);
  const [sizeOf,      setSizeOf]      = useState(null);

  useEffect(() => {
    api("/api/home/layout")
      .then(d => setLayout(d.layout?.length ? d.layout : [...DEFAULT_LAYOUT]))
      .catch(() => setLayout([...DEFAULT_LAYOUT]));
  }, []);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest?.(".size-popover")) setSizeOf(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    function onEnd() {
      setDragSrcIdx(null); setDragOverIdx(null);
      setPalDrag(null);    setDragSize(null);
    }
    document.addEventListener("dragend", onEnd);
    return () => document.removeEventListener("dragend", onEnd);
  }, []);

  function persist(nl) {
    setLayout(nl);
    jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
  }

  function addWidget(widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!def) return;
    persist([...(layout || []), {
      instanceId: `w${Date.now()}`,
      widgetId,
      cols: def.defaultCols,
      rows: def.defaultRows,
    }]);
  }

  function removeWidget(iid) { persist((layout || []).filter(w => w.instanceId !== iid)); }

  function resizeWidget(iid, cols, rows) {
    persist((layout || []).map(w => w.instanceId === iid ? { ...w, cols, rows } : w));
    setSizeOf(null);
  }

  function gDragStart(e, idx, item) {
    setDragSrcIdx(idx);
    setDragSize({ cols: item.cols, rows: item.rows });
    e.dataTransfer.effectAllowed = "move";
  }
  function gDragOver(e, idx) { e.preventDefault(); setDragOverIdx(idx); }
  function gDrop(e, idx) {
    e.preventDefault();
    if (dragSrcIdx !== null && dragSrcIdx !== idx) {
      const nl = [...(layout || [])];
      const [itm] = nl.splice(dragSrcIdx, 1);
      nl.splice(idx, 0, itm);
      persist(nl);
    } else if (palDrag) {
      addWidget(palDrag);
    }
    setDragSrcIdx(null); setDragOverIdx(null);
    setPalDrag(null);    setDragSize(null);
  }
  function pDragStart(e, widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    setPalDrag(widgetId);
    setDragSize(def ? { cols: def.defaultCols, rows: def.defaultRows } : null);
    e.dataTransfer.effectAllowed = "copy";
  }

  const isDragging = dragSrcIdx !== null || palDrag !== null;

  if (!layout) return <PageLoading />;

  const availableWidgets = WIDGET_REGISTRY.filter(def =>
    !def.app || !enabledApps || enabledApps.has(def.app)
  );

  return (
    <div className="home-root">
      {/* Top bar */}
      <div className="home-topbar">
        {editMode && (
          <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
            Drag to reorder · drag from library to add · × to remove
          </span>
        )}
        <button
          className={`btn ${editMode?"btn-primary":"btn-ghost"} btn-sm`}
          onClick={e => { e.stopPropagation(); setEditMode(m => !m); setSizeOf(null); }}
        >
          {editMode ? "✓ Done editing" : "⊞ Customize"}
        </button>
      </div>

      {/* Body */}
      <div className="home-body">
        <div className="widget-grid-wrap">

          {/* Grid overlay — only shown while dragging */}
          {isDragging && dragSize && (
            <GridOverlay
              layout={layout}
              dragCols={dragSize.cols}
              dragRows={dragSize.rows}
            />
          )}

          {/* Widget grid */}
          <div
            className="widget-grid"
            style={{ position: "relative", zIndex: 10 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (palDrag) { addWidget(palDrag); setPalDrag(null); setDragSize(null); }
            }}
          >
            {layout.map((item, idx) => {
              const def  = WIDGET_REGISTRY.find(w => w.id === item.widgetId);
              const Comp = WIDGET_COMPONENTS[item.widgetId];
              if (!def || !Comp) return null;

              return (
                <div
                  key={item.instanceId}
                  className={[
                    "widget-cell",
                    dragOverIdx === idx ? "drag-over" : "",
                    dragSrcIdx  === idx ? "dragging"  : "",
                    isDragging           ? "in-drag-mode" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ gridColumn:`span ${item.cols}`, gridRow:`span ${item.rows}` }}
                  draggable={editMode}
                  onDragStart={e => { e.stopPropagation(); gDragStart(e, idx, item); }}
                  onDragOver={e  => { e.stopPropagation(); gDragOver(e, idx); }}
                  onDrop={e      => { e.stopPropagation(); gDrop(e, idx); }}
                >
                  {editMode && (
                    <div className="widget-bar" onClick={e => e.stopPropagation()}>
                      <span className="widget-drag-handle" title="Drag to reorder">⠿</span>
                      <span className="widget-bar-name">{def.name}</span>
                      <div className="widget-bar-actions">
                        <div style={{ position:"relative" }}>
                          <button
                            className="widget-bar-btn"
                            onClick={e => {
                              e.stopPropagation();
                              setSizeOf(s => s === item.instanceId ? null : item.instanceId);
                            }}
                          >{item.cols}×{item.rows}</button>
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
                        <button className="widget-bar-btn widget-remove" onClick={() => removeWidget(item.instanceId)}>×</button>
                      </div>
                    </div>
                  )}
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
        </div>

        {/* Palette */}
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
                    onDragEnd={() => { setPalDrag(null); setDragSize(null); }}
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
                        {def.sizes.map(s=>(
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
