// HomePage.jsx — Free-form widget grid with live drag preview
//
// Architecture:
//   - Each widget stores explicit gridCol + gridRow (free-form, gaps allowed)
//   - VISUAL overlay: z-index below widgets, pointer-events:none — shows colored cells
//   - CAPTURE overlay: single transparent div, z-index ABOVE widgets, only active
//     while dragging. dragover fires on it continuously; we compute the hovered cell
//     from e.clientX/Y against the grid's bounding rect. This is the only reliable
//     way to track mouse position during an HTML5 drag (mousemove doesn't fire).
//   - On drop: place widget at hovered cell if valid, persist to backend.

const { useState, useEffect, useRef, useMemo } = React;

const COLS  = 12;
const ROW_H = 140;   // px — must match grid-auto-rows in CSS
const GAP   = 12;    // px — must match gap in CSS
const PAD   = 16;    // px — left/right padding of .widget-grid

// ── Migrate old layout items (no gridCol/gridRow) ──────────────────────
function migrateLayout(raw) {
  const occ = new Set();

  function tryPlace(cols, rows) {
    for (let r = 0; r < 100; r++) {
      for (let c = 0; c <= COLS - cols; c++) {
        let ok = true;
        outerCheck:
        for (let dr = 0; dr < rows; dr++)
          for (let dc = 0; dc < cols; dc++)
            if (occ.has(`${r+dr},${c+dc}`)) { ok = false; break outerCheck; }
        if (ok) {
          for (let dr = 0; dr < rows; dr++)
            for (let dc = 0; dc < cols; dc++)
              occ.add(`${r+dr},${c+dc}`);
          return { gridRow: r, gridCol: c };
        }
      }
    }
    return { gridRow: 0, gridCol: 0 };
  }

  return raw.map(item => {
    if (item.gridCol != null && item.gridRow != null) {
      for (let dr = 0; dr < (item.rows||1); dr++)
        for (let dc = 0; dc < (item.cols||4); dc++)
          occ.add(`${item.gridRow+dr},${item.gridCol+dc}`);
      return item;
    }
    return { ...item, ...tryPlace(item.cols || 4, item.rows || 1) };
  });
}

// ── Build set of occupied "row,col" cells (optionally exclude one widget) ─
function buildOccupied(layout, excludeId = null) {
  const occ = new Set();
  for (const item of layout) {
    if (item.instanceId === excludeId) continue;
    if (item.gridCol == null) continue;
    for (let r = item.gridRow; r < item.gridRow + (item.rows||1); r++)
      for (let c = item.gridCol; c < item.gridCol + (item.cols||4); c++)
        occ.add(`${r},${c}`);
  }
  return occ;
}

// ── Convert mouse event to grid cell ──────────────────────────────────
// gridEl: the .widget-grid-wrap element (scrollable container)
function mouseToCell(e, gridEl) {
  if (!gridEl) return null;
  const rect  = gridEl.getBoundingClientRect();
  const cellW = (rect.width - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const x = e.clientX - rect.left - PAD;
  const y = e.clientY - rect.top  + gridEl.scrollTop;
  if (x < 0 || y < 0) return null;
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(x / (cellW + GAP)))),
    row: Math.max(0, Math.floor(y / (ROW_H + GAP))),
  };
}

// ── Visual grid overlay ────────────────────────────────────────────────
// Sits BELOW widgets (z-index 1, pointerEvents none).
// Shows: occupied=faint red, hover footprint=green/red, free=faint cyan.
function VisualOverlay({ layout, excludeId, dragCols, dragRows, hoverCell, totalRows }) {
  const occ = useMemo(
    () => buildOccupied(layout, excludeId),
    [layout, excludeId]
  );

  const fits = useMemo(() => {
    if (!hoverCell) return null;
    if (hoverCell.col + dragCols > COLS) return false;
    for (let dr = 0; dr < dragRows; dr++)
      for (let dc = 0; dc < dragCols; dc++)
        if (occ.has(`${hoverCell.row+dr},${hoverCell.col+dc}`)) return false;
    return true;
  }, [hoverCell, occ, dragCols, dragRows]);

  const cells = [];
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < COLS; c++) {
      const isOcc = occ.has(`${r},${c}`);
      const inFP  = hoverCell &&
        r >= hoverCell.row && r < hoverCell.row + dragRows &&
        c >= hoverCell.col && c < hoverCell.col + dragCols;

      let bg, border;
      if (inFP && fits === true) {
        bg = "rgba(0,200,240,.22)"; border = "2px solid rgba(0,200,240,.85)";
      } else if (inFP && fits === false) {
        bg = "rgba(240,64,96,.25)"; border = "2px solid rgba(240,64,96,.75)";
      } else if (isOcc) {
        bg = "rgba(240,64,96,.06)"; border = "1px dashed rgba(240,64,96,.22)";
      } else {
        bg = "rgba(0,200,240,.025)"; border = "1px dashed rgba(0,200,240,.13)";
      }

      cells.push(
        <div key={`${r}-${c}`} style={{
          gridColumn: `${c+1}`,
          gridRow:    `${r+1}`,
          background: bg,
          border,
          borderRadius: 8,
          transition: "background .07s, border-color .07s",
        }} />
      );
    }
  }

  return (
    <div style={{
      position: "absolute",
      top: 0, left: 0, right: 0,
      display: "grid",
      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      gridTemplateRows: `repeat(${totalRows}, ${ROW_H}px)`,
      gap: GAP,
      padding: `0 ${PAD}px`,
      zIndex: 1,          // below widgets
      pointerEvents: "none",
    }}>
      {cells}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────
function HomePage({ enabledApps }) {
  const [layout,    setLayout]    = useState(null);
  const [editMode,  setEditMode]  = useState(false);
  const [dragId,    setDragId]    = useState(null);   // instanceId being dragged (grid→grid)
  const [palDragId, setPalDragId] = useState(null);   // widgetId being dragged (palette→grid)
  const [dragSize,  setDragSize]  = useState(null);   // { cols, rows }
  const [hoverCell, setHoverCell] = useState(null);   // { row, col } under cursor
  const [sizeOf,    setSizeOf]    = useState(null);
  const wrapRef = useRef(null);   // .widget-grid-wrap

  const isDragging = dragId !== null || palDragId !== null;

  // ── Load layout ──────────────────────────────────────────────────────
  useEffect(() => {
    api("/api/home/layout")
      .then(d => {
        const raw = d.layout?.length ? d.layout : [...DEFAULT_LAYOUT];
        setLayout(migrateLayout(raw));
      })
      .catch(() => setLayout(migrateLayout([...DEFAULT_LAYOUT])));
  }, []);

  // Close size popover on outside click
  useEffect(() => {
    function close(e) {
      if (!e.target.closest?.(".size-popover")) setSizeOf(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Clear drag state on dragend (fires even if drop was cancelled)
  useEffect(() => {
    function onEnd() {
      setDragId(null); setPalDragId(null);
      setDragSize(null); setHoverCell(null);
    }
    document.addEventListener("dragend", onEnd);
    return () => document.removeEventListener("dragend", onEnd);
  }, []);

  function persist(nl) {
    setLayout(nl);
    jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
  }

  function removeWidget(iid) { persist(layout.filter(w => w.instanceId !== iid)); }

  function resizeWidget(iid, cols, rows) {
    persist(layout.map(w => w.instanceId === iid ? { ...w, cols, rows } : w));
    setSizeOf(null);
  }

  // ── Drag start (grid widget) ─────────────────────────────────────────
  function onWidgetDragStart(e, item) {
    e.stopPropagation();
    setDragId(item.instanceId);
    setDragSize({ cols: item.cols, rows: item.rows });
    e.dataTransfer.effectAllowed = "move";
  }

  // ── Drag start (palette) ─────────────────────────────────────────────
  function onPaletteDragStart(e, widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    setPalDragId(widgetId);
    setDragSize(def ? { cols: def.defaultCols, rows: def.defaultRows } : { cols: 4, rows: 1 });
    e.dataTransfer.effectAllowed = "copy";
  }

  // ── Capture layer: dragover ──────────────────────────────────────────
  // This is the ONLY dragover handler that matters during drag.
  // Fires continuously as mouse moves over the transparent top layer.
  function onCaptureDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cell = mouseToCell(e, wrapRef.current);
    setHoverCell(cell);
  }

  // ── Capture layer: drop ──────────────────────────────────────────────
  function onCaptureDrop(e) {
    e.preventDefault();
    if (!hoverCell || !dragSize) return;

    const { row, col } = hoverCell;
    const { cols, rows } = dragSize;

    // Check bounds
    if (col + cols > COLS) return;

    // Check availability (excluding the widget being moved)
    const occ = buildOccupied(layout, dragId ?? undefined);
    for (let dr = 0; dr < rows; dr++)
      for (let dc = 0; dc < cols; dc++)
        if (occ.has(`${row+dr},${col+dc}`)) return; // blocked

    if (dragId) {
      // Move existing widget to new position
      persist(layout.map(w =>
        w.instanceId === dragId ? { ...w, gridRow: row, gridCol: col } : w
      ));
    } else if (palDragId) {
      // Add new widget from palette
      const def = WIDGET_REGISTRY.find(w => w.id === palDragId);
      if (!def) return;
      persist([...layout, {
        instanceId: `w${Date.now()}`,
        widgetId: palDragId,
        cols: def.defaultCols,
        rows: def.defaultRows,
        gridRow: row,
        gridCol: col,
      }]);
    }

    setDragId(null); setPalDragId(null);
    setDragSize(null); setHoverCell(null);
  }

  function addWidget(widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!def) return;
    // Find first free spot
    const occ = buildOccupied(layout);
    let placed = false;
    for (let r = 0; r < 20 && !placed; r++) {
      for (let c = 0; c <= COLS - def.defaultCols && !placed; c++) {
        let ok = true;
        outerAdd:
        for (let dr = 0; dr < def.defaultRows; dr++)
          for (let dc = 0; dc < def.defaultCols; dc++)
            if (occ.has(`${r+dr},${c+dc}`)) { ok = false; break outerAdd; }
        if (ok) {
          persist([...layout, {
            instanceId: `w${Date.now()}`,
            widgetId,
            cols: def.defaultCols,
            rows: def.defaultRows,
            gridRow: r,
            gridCol: c,
          }]);
          placed = true;
        }
      }
    }
  }

  if (!layout) return <PageLoading />;

  // Compute overlay row count
  const totalRows = Math.max(
    8,
    ...layout.map(i => (i.gridRow || 0) + (i.rows || 1))
  ) + 3;

  const availableWidgets = WIDGET_REGISTRY.filter(def =>
    !def.app || !enabledApps || enabledApps.has(def.app)
  );

  return (
    <div className="home-root">
      {/* ── Top bar ── */}
      <div className="home-topbar">
        {editMode && (
          <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
            Drag to move · resize with size button · drag from library to add
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
        <div ref={wrapRef} className="widget-grid-wrap">

          {/* VISUAL overlay — always rendered during drag, sits below widgets */}
          {isDragging && dragSize && (
            <VisualOverlay
              layout={layout}
              excludeId={dragId}
              dragCols={dragSize.cols}
              dragRows={dragSize.rows}
              hoverCell={hoverCell}
              totalRows={totalRows}
            />
          )}

          {/* CAPTURE overlay — transparent, sits ABOVE widgets during drag */}
          {/* This is the only thing that receives dragover; calculates cell from mouse coords */}
          {isDragging && (
            <div
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                height: `${totalRows * (ROW_H + GAP)}px`,
                zIndex: 50,                      // above everything
                background: "transparent",
                cursor: "grabbing",
              }}
              onDragOver={onCaptureDragOver}
              onDrop={onCaptureDrop}
            />
          )}

          {/* Widget grid — explicit positioning, no auto-flow */}
          <div
            className="widget-grid"
            style={{
              position: "relative",
              zIndex: 10,
              gridAutoFlow: "unset",             // no auto-flow, explicit placement only
            }}
          >
            {layout.map(item => {
              const def  = WIDGET_REGISTRY.find(w => w.id === item.widgetId);
              const Comp = WIDGET_COMPONENTS[item.widgetId];
              if (!def || !Comp) return null;

              const isBeingDragged = item.instanceId === dragId;

              return (
                <div
                  key={item.instanceId}
                  className={[
                    "widget-cell",
                    isBeingDragged ? "dragging" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    gridColumn: `${(item.gridCol ?? 0) + 1} / span ${item.cols}`,
                    gridRow:    `${(item.gridRow ?? 0) + 1} / span ${item.rows}`,
                    opacity: isBeingDragged ? 0.3 : 1,
                    // Lower z-index during drag so capture overlay is on top
                    zIndex: isDragging ? 5 : "auto",
                  }}
                  draggable={editMode}
                  onDragStart={e => onWidgetDragStart(e, item)}
                >
                  {editMode && (
                    <div className="widget-bar" onClick={e => e.stopPropagation()}>
                      <span className="widget-drag-handle">⠿</span>
                      <span className="widget-bar-name">{def.name}</span>
                      <div className="widget-bar-actions">
                        <div style={{ position: "relative" }}>
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
                                  <span style={{ fontFamily:"var(--mono)" }}>{s.cols}×{s.rows}</span>
                                  <span>{s.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="widget-bar-btn widget-remove"
                          onClick={() => removeWidget(item.instanceId)}
                        >×</button>
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

        {/* Palette panel */}
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
                    onDragStart={e => onPaletteDragStart(e, def.id)}
                    onDragEnd={() => { setPalDragId(null); setDragSize(null); setHoverCell(null); }}
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
