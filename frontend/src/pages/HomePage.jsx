// HomePage.jsx — Customizable widget grid with drag/drop, resize, and live grid overlay
// Grid overlay shows occupied cells (red) and valid drop zones (green/red based on fit)
// during any drag operation.

const { useState, useEffect, useRef, useMemo } = React;

// ── Compute where CSS auto-flow places each widget ──────────────────────────
// Returns array of { ...item, gridRow, gridCol } (0-indexed)
function computeGridPositions(layout) {
  const COLS = 12;
  const occupied = {};  // "r,c" → true

  function isFree(row, col, cols, rows) {
    if (col + cols > COLS) return false;
    for (let r = row; r < row + rows; r++)
      for (let c = col; c < col + cols; c++)
        if (occupied[`${r},${c}`]) return false;
    return true;
  }

  function occupy(row, col, cols, rows) {
    for (let r = row; r < row + rows; r++)
      for (let c = col; c < col + cols; c++)
        occupied[`${r},${c}`] = true;
  }

  const result = [];
  let cursorRow = 0, cursorCol = 0;

  for (const item of layout) {
    const { cols = 4, rows = 1 } = item;
    let placed = false;

    outer:
    for (let row = cursorRow; row < cursorRow + 200; row++) {
      const startCol = row === cursorRow ? cursorCol : 0;
      for (let col = startCol; col <= COLS - cols; col++) {
        if (isFree(row, col, cols, rows)) {
          result.push({ ...item, gridRow: row, gridCol: col });
          occupy(row, col, cols, rows);
          cursorRow = row;
          cursorCol = col + cols;
          if (cursorCol >= COLS) { cursorRow++; cursorCol = 0; }
          placed = true;
          break outer;
        }
      }
      cursorRow = row + 1; cursorCol = 0;
    }
    if (!placed) result.push({ ...item, gridRow: 0, gridCol: 0 });
  }

  return result;
}

// ── Grid overlay ─────────────────────────────────────────────────────────────
function GridOverlay({ layout, dragSize, gridWrapRef }) {
  const [hover, setHover] = useState(null);  // { row, col }

  const COLS = 12;
  const VISIBLE_ROWS = 8;
  const ROW_H = 152;  // 140px row + 12px gap
  const COL_W_FRAC = 1 / 12;

  const positions = useMemo(() => computeGridPositions(layout || []), [layout]);

  const occupiedSet = useMemo(() => {
    const s = new Set();
    positions.forEach(({ gridRow, gridCol, cols = 4, rows = 1 }) => {
      for (let r = gridRow; r < gridRow + rows; r++)
        for (let c = gridCol; c < gridCol + cols; c++)
          s.add(`${r},${c}`);
    });
    return s;
  }, [positions]);

  function fitsAt(row, col) {
    if (!dragSize) return true;
    if (col + dragSize.cols > COLS) return false;
    for (let r = row; r < row + dragSize.rows; r++)
      for (let c = col; c < col + dragSize.cols; c++)
        if (occupiedSet.has(`${r},${c}`)) return false;
    return true;
  }

  useEffect(() => {
    function onMove(e) {
      if (!gridWrapRef.current) return;
      const rect   = gridWrapRef.current.getBoundingClientRect();
      const padding = 16;
      const gap     = 12;
      const gw      = rect.width - padding * 2;
      const colW    = (gw - gap * (COLS - 1)) / COLS;
      const scrollY = gridWrapRef.current.scrollTop;

      const x = e.clientX - rect.left - padding;
      const y = e.clientY - rect.top  + scrollY;

      const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / (colW + gap))));
      const row = Math.max(0, Math.floor(y / ROW_H));
      setHover({ col, row });
    }

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [gridWrapRef]);

  const cells = [];
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      const isOcc = occupiedSet.has(key);

      let cellClass = "grid-overlay-cell";
      if (hover && dragSize) {
        const inFootprint =
          r >= hover.row && r < hover.row + dragSize.rows &&
          c >= hover.col && c < hover.col + dragSize.cols;
        if (inFootprint) {
          cellClass += fitsAt(hover.row, hover.col) ? " cell-hover-ok" : " cell-hover-bad";
        } else if (isOcc) {
          cellClass += " cell-occupied";
        }
      } else if (isOcc) {
        cellClass += " cell-occupied";
      }

      cells.push(
        <div key={key} className={cellClass} style={{ gridColumn: "span 1", gridRow: "span 1" }} />
      );
    }
  }

  return (
    <div className="grid-overlay" style={{ height: `${VISIBLE_ROWS * ROW_H}px` }}>
      {cells}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────────
function HomePage({ enabledApps }) {
  const [layout,      setLayout]      = useState(null);
  const [editMode,    setEditMode]    = useState(false);
  const [dragSrcIdx,  setDragSrcIdx]  = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [palDrag,     setPalDrag]     = useState(null);   // widgetId from palette
  const [dragSize,    setDragSize]    = useState(null);   // { cols, rows } of active drag
  const [sizeOf,      setSizeOf]      = useState(null);
  const gridWrapRef = useRef(null);

  useEffect(() => {
    api("/api/home/layout")
      .then(d => setLayout(d.layout?.length ? d.layout : [...DEFAULT_LAYOUT]))
      .catch(() => setLayout([...DEFAULT_LAYOUT]));
  }, []);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest(".size-popover") && !e.target.closest(".widget-bar-btn")) {
        setSizeOf(null);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Clear drag state when drag ends anywhere
  useEffect(() => {
    function onDragEnd() {
      setDragSrcIdx(null); setDragOverIdx(null);
      setPalDrag(null); setDragSize(null);
    }
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
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

  function removeWidget(iid) {
    persist((layout || []).filter(w => w.instanceId !== iid));
  }

  function resizeWidget(iid, cols, rows) {
    persist((layout || []).map(w => w.instanceId === iid ? { ...w, cols, rows } : w));
    setSizeOf(null);
  }

  // ── Grid drag (reorder) ────────────────────────────────────────────
  function gDragStart(e, idx, item) {
    setDragSrcIdx(idx);
    setDragSize({ cols: item.cols, rows: item.rows });
    e.dataTransfer.effectAllowed = "move";
  }
  function gDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }
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
    setPalDrag(null); setDragSize(null);
  }

  // ── Palette drag (add) ─────────────────────────────────────────────
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
      {/* ── Top bar ── */}
      <div className="home-topbar">
        {editMode && (
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            Drag to reorder · drag from library to add · × to remove
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

        {/* ── Grid wrap (scrollable, relative for overlay) ── */}
        <div
          ref={gridWrapRef}
          className="widget-grid-wrap"
        >
          {/* Grid overlay — visible during any drag */}
          {isDragging && (
            <GridOverlay
              layout={layout}
              dragSize={dragSize}
              gridWrapRef={gridWrapRef}
            />
          )}

          {/* Widget grid */}
          <div
            className={["widget-grid", palDrag ? "palette-drag" : ""].filter(Boolean).join(" ")}
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
                  ].filter(Boolean).join(" ")}
                  style={{
                    gridColumn: `span ${item.cols}`,
                    gridRow:    `span ${item.rows}`,
                    zIndex: isDragging ? 10 : undefined,
                  }}
                  draggable={editMode}
                  onDragStart={e => { e.stopPropagation(); gDragStart(e, idx, item); }}
                  onDragOver={e  => { e.stopPropagation(); gDragOver(e, idx); }}
                  onDrop={e      => { e.stopPropagation(); gDrop(e, idx); }}
                >
                  {/* Edit bar */}
                  {editMode && (
                    <div className="widget-bar" onClick={e => e.stopPropagation()}>
                      <span className="widget-drag-handle" title="Drag to reorder">⠿</span>
                      <span className="widget-bar-name">{def.name}</span>
                      <div className="widget-bar-actions">
                        {/* Size picker */}
                        <div style={{ position: "relative" }}>
                          <button
                            className="widget-bar-btn"
                            title="Resize"
                            onClick={e => {
                              e.stopPropagation();
                              setSizeOf(s => s === item.instanceId ? null : item.instanceId);
                            }}
                          >
                            {item.cols}×{item.rows}
                          </button>
                          {sizeOf === item.instanceId && (
                            <div className="size-popover" onClick={e => e.stopPropagation()}>
                              {def.sizes.map(s => (
                                <button
                                  key={`${s.cols}x${s.rows}`}
                                  className={`size-opt${s.cols === item.cols && s.rows === item.rows ? " size-active" : ""}`}
                                  onClick={() => resizeWidget(item.instanceId, s.cols, s.rows)}
                                >
                                  <span style={{ fontFamily: "var(--mono)" }}>{s.cols}×{s.rows}</span>
                                  <span>{s.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="widget-bar-btn widget-remove"
                          title="Remove"
                          onClick={() => removeWidget(item.instanceId)}
                        >×</button>
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
              <div style={{ gridColumn: "span 12", textAlign: "center", padding: 48, color: "var(--text3)", fontSize: 13 }}>
                No widgets yet. Click <strong style={{ color: "var(--text)" }}>⊞ Customize</strong> to add some.
              </div>
            )}
          </div>
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
                    onDragEnd={() => { setPalDrag(null); setDragSize(null); }}
                  >
                    <div className="palette-preview">
                      {Comp
                        ? <Comp cols={def.defaultCols} rows={Math.min(def.defaultRows, 2)} preview enabledApps={enabledApps} />
                        : <div style={{ padding: 12, fontSize: 24 }}>{def.icon}</div>
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
                        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                        onClick={() => addWidget(def.id)}
                      >
                        + Add to home
                      </button>
                    </div>
                  </div>
                );
              })}
              {availableWidgets.length === 0 && (
                <div style={{ color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)", padding: 8 }}>
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
