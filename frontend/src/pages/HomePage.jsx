// HomePage.jsx — Free-form widget grid
//
// DRAG ARCHITECTURE:
//   Grid → grid moves: pointer events (pointerdown/move/up on window).
//     pointermove ALWAYS fires. No HTML5 drag, no stale closures.
//     Widget fades to 0.3 opacity while dragging, grid shows live overlay.
//
//   Palette → grid adds: HTML5 drag (dragstart on palette card).
//     Wrap container has onDragOver + onDrop — these receive events via
//     bubbling (no capture div needed, no z-index issues).
//
//   Both paths write to refs before committing so state is always current.
//
// LAYOUT: each item stores explicit gridRow + gridCol. CSS grid uses
//   grid-column: col+1 / span cols; grid-row: row+1 / span rows.
//   No auto-flow — gaps are intentional and allowed.

const { useState, useEffect, useRef, useMemo } = React;

const COLS  = 12;
const ROW_H = 140;   // must match grid-auto-rows in widgets.css
const GAP   = 12;    // must match gap in widgets.css
const PAD   = 16;    // left+right padding of .widget-grid

// ── Migrate old items (no gridCol/gridRow) to explicit positions ───────
function migrateLayout(raw) {
  const occ = new Set();
  function tryPlace(cols, rows) {
    for (let r = 0; r < 100; r++)
      for (let c = 0; c <= COLS - cols; c++) {
        let ok = true;
        L: for (let dr = 0; dr < rows; dr++)
          for (let dc = 0; dc < cols; dc++)
            if (occ.has(`${r+dr},${c+dc}`)) { ok = false; break L; }
        if (ok) {
          for (let dr = 0; dr < rows; dr++)
            for (let dc = 0; dc < cols; dc++)
              occ.add(`${r+dr},${c+dc}`);
          return { gridRow: r, gridCol: c };
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
    return { ...item, ...tryPlace(item.cols||4, item.rows||1) };
  });
}

// ── Build set of occupied "row,col" strings ────────────────────────────
function buildOccupied(layout, excludeId = null) {
  const occ = new Set();
  for (const w of layout) {
    if (w.instanceId === excludeId || w.gridCol == null) continue;
    for (let r = w.gridRow; r < w.gridRow + (w.rows||1); r++)
      for (let c = w.gridCol; c < w.gridCol + (w.cols||4); c++)
        occ.add(`${r},${c}`);
  }
  return occ;
}

// ── Convert clientX/Y to {row,col} relative to grid wrap ──────────────
function mouseToCell(clientX, clientY, wrapEl) {
  if (!wrapEl) return null;
  const rect  = wrapEl.getBoundingClientRect();
  const cellW = (rect.width - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const x = clientX - rect.left - PAD;
  const y = clientY - rect.top  + wrapEl.scrollTop;
  if (x < 0 || y < 0) return null;
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(x / (cellW + GAP)))),
    row: Math.max(0, Math.floor(y / (ROW_H + GAP))),
  };
}

// ── Check if dragCols×dragRows fits at (row,col) ───────────────────────
function fitsAt(occ, row, col, dragCols, dragRows) {
  if (col + dragCols > COLS) return false;
  for (let dr = 0; dr < dragRows; dr++)
    for (let dc = 0; dc < dragCols; dc++)
      if (occ.has(`${row+dr},${col+dc}`)) return false;
  return true;
}

// ── Visual grid overlay ────────────────────────────────────────────────
function GridOverlay({ layout, excludeId, dragCols, dragRows, hoverCell, totalRows }) {
  const occ  = useMemo(() => buildOccupied(layout, excludeId), [layout, excludeId]);
  const fits = useMemo(() => {
    if (!hoverCell) return null;
    return fitsAt(occ, hoverCell.row, hoverCell.col, dragCols, dragRows);
  }, [hoverCell, occ, dragCols, dragRows]);

  const cells = [];
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < COLS; c++) {
      const isOcc = occ.has(`${r},${c}`);
      const inFP  = hoverCell &&
        r >= hoverCell.row && r < hoverCell.row + dragRows &&
        c >= hoverCell.col && c < hoverCell.col + dragCols;
      let bg, border;
      if      (inFP && fits === true)  { bg="rgba(0,200,240,.22)";   border="2px solid rgba(0,200,240,.85)"; }
      else if (inFP && fits === false) { bg="rgba(240,64,96,.25)";   border="2px solid rgba(240,64,96,.75)"; }
      else if (isOcc)                  { bg="rgba(240,64,96,.06)";   border="1px dashed rgba(240,64,96,.22)"; }
      else                             { bg="rgba(0,200,240,.025)";  border="1px dashed rgba(0,200,240,.13)"; }
      cells.push(
        <div key={`${r}-${c}`} style={{
          gridColumn: `${c+1}`, gridRow: `${r+1}`,
          background: bg, border, borderRadius: 8,
          transition: "background .07s, border-color .07s",
        }} />
      );
    }
  }
  return (
    <div style={{
      position:"absolute", top:0, left:0, right:0,
      display:"grid",
      gridTemplateColumns:`repeat(${COLS},1fr)`,
      gridTemplateRows:`repeat(${totalRows},${ROW_H}px)`,
      gap:GAP, padding:`0 ${PAD}px`,
      zIndex:1, pointerEvents:"none",
    }}>
      {cells}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// HomePage
// ══════════════════════════════════════════════════════════════════════
function HomePage({ enabledApps }) {
  const [layout,    setLayout]    = useState(null);
  const [editMode,  setEditMode]  = useState(false);
  const [hoverCell, setHoverCell] = useState(null);
  const [sizeOf,    setSizeOf]    = useState(null);

  // Pointer-drag state (grid→grid moves)
  const [ptrDragId,   setPtrDragId]   = useState(null);  // instanceId
  const [ptrDragSize, setPtrDragSize] = useState(null);  // {cols,rows}

  // Refs — always current, safe to read inside event listeners
  const layoutRef      = useRef(null);
  const ptrDragIdRef   = useRef(null);
  const ptrDragSizeRef = useRef(null);
  const palDragIdRef   = useRef(null);   // for HTML5 palette drag
  const palDragSizeRef = useRef(null);
  const hoverCellRef   = useRef(null);
  const wrapRef        = useRef(null);

  const isDragging = ptrDragId !== null || palDragIdRef.current !== null;

  // ── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api("/api/home/layout")
      .then(d => {
        const raw = d.layout?.length ? d.layout : [...DEFAULT_LAYOUT];
        const ml  = migrateLayout(raw);
        setLayout(ml);
        layoutRef.current = ml;
      })
      .catch(() => {
        const ml = migrateLayout([...DEFAULT_LAYOUT]);
        setLayout(ml);
        layoutRef.current = ml;
      });
  }, []);

  // Keep layoutRef current whenever layout changes
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  // ── Close size popover on outside click ──────────────────────────────
  useEffect(() => {
    function close(e) { if (!e.target.closest?.(".size-popover")) setSizeOf(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // ── Pointer-drag: pointermove + pointerup on window ──────────────────
  useEffect(() => {
    function onMove(e) {
      if (!ptrDragIdRef.current && !palDragIdRef.current) return;
      const cell = mouseToCell(e.clientX, e.clientY, wrapRef.current);
      hoverCellRef.current = cell;
      setHoverCell(cell ? { ...cell } : null);
    }

    function onUp(e) {
      const dragId = ptrDragIdRef.current;
      if (!dragId) return;  // not a pointer drag

      const cell   = hoverCellRef.current;
      const layout = layoutRef.current;
      const size   = ptrDragSizeRef.current;

      if (cell && layout && size) {
        const { row, col }   = cell;
        const { cols, rows } = size;
        const occ = buildOccupied(layout, dragId);
        if (fitsAt(occ, row, col, cols, rows)) {
          const nl = layout.map(w =>
            w.instanceId === dragId ? { ...w, gridRow: row, gridCol: col } : w
          );
          setLayout(nl);
          layoutRef.current = nl;
          jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
        }
      }

      // clear
      ptrDragIdRef.current   = null;
      ptrDragSizeRef.current = null;
      hoverCellRef.current   = null;
      setPtrDragId(null);
      setPtrDragSize(null);
      setHoverCell(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
    };
  }, []);  // runs once — reads from refs, never stale

  // ── Persist ──────────────────────────────────────────────────────────
  function persist(nl) {
    setLayout(nl);
    layoutRef.current = nl;
    jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
  }

  function removeWidget(iid) { persist(layoutRef.current.filter(w => w.instanceId !== iid)); }

  function resizeWidget(iid, cols, rows) {
    persist(layoutRef.current.map(w => w.instanceId === iid ? { ...w, cols, rows } : w));
    setSizeOf(null);
  }

  // ── Pointer drag start (grid widget) ─────────────────────────────────
  function onWidgetPointerDown(e, item) {
    if (!editMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    ptrDragIdRef.current   = item.instanceId;
    ptrDragSizeRef.current = { cols: item.cols, rows: item.rows };
    setPtrDragId(item.instanceId);
    setPtrDragSize({ cols: item.cols, rows: item.rows });
  }

  // ── HTML5 drag: palette card ─────────────────────────────────────────
  function onPaletteDragStart(e, widgetId) {
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    palDragIdRef.current   = widgetId;
    palDragSizeRef.current = def ? { cols: def.defaultCols, rows: def.defaultRows } : { cols:4, rows:1 };
    e.dataTransfer.effectAllowed = "copy";
  }

  function onPaletteDragEnd() {
    palDragIdRef.current   = null;
    palDragSizeRef.current = null;
    hoverCellRef.current   = null;
    setHoverCell(null);
  }

  // ── Wrap: dragover + drop (for palette → grid, via bubbling) ─────────
  function onWrapDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!palDragIdRef.current) return;
    const cell = mouseToCell(e.clientX, e.clientY, wrapRef.current);
    hoverCellRef.current = cell;
    setHoverCell(cell ? { ...cell } : null);
  }

  function onWrapDrop(e) {
    e.preventDefault();
    const palId = palDragIdRef.current;
    if (!palId) return;

    const cell   = mouseToCell(e.clientX, e.clientY, wrapRef.current) || hoverCellRef.current;
    const layout = layoutRef.current;
    const size   = palDragSizeRef.current;

    if (cell && layout && size) {
      const { row, col }   = cell;
      const { cols, rows } = size;
      const occ = buildOccupied(layout);
      if (fitsAt(occ, row, col, cols, rows)) {
        const def = WIDGET_REGISTRY.find(w => w.id === palId);
        if (def) {
          const nl = [...layout, {
            instanceId: `w${Date.now()}`,
            widgetId: palId,
            cols: def.defaultCols,
            rows: def.defaultRows,
            gridRow: row,
            gridCol: col,
          }];
          setLayout(nl);
          layoutRef.current = nl;
          jsonPut("/api/home/layout", { layout: nl }).catch(() => {});
        }
      }
    }

    palDragIdRef.current   = null;
    palDragSizeRef.current = null;
    hoverCellRef.current   = null;
    setHoverCell(null);
  }

  // ── Add widget at first free spot (palette button click) ─────────────
  function addWidget(widgetId) {
    const def    = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!def) return;
    const layout = layoutRef.current || [];
    const occ    = buildOccupied(layout);
    for (let r = 0; r < 20; r++)
      for (let c = 0; c <= COLS - def.defaultCols; c++)
        if (fitsAt(occ, r, c, def.defaultCols, def.defaultRows)) {
          persist([...layout, {
            instanceId: `w${Date.now()}`,
            widgetId,
            cols: def.defaultCols,
            rows: def.defaultRows,
            gridRow: r,
            gridCol: c,
          }]);
          return;
        }
  }

  if (!layout) return <PageLoading />;

  const totalRows = Math.max(8, ...layout.map(i => (i.gridRow||0) + (i.rows||1))) + 3;
  const isPtrDrag = ptrDragId !== null;
  const isPalDrag = false; // we track via ref, use it for overlay
  const showOverlay = isPtrDrag || (ptrDragId === null && hoverCell !== null);

  const dragCols = ptrDragSize?.cols || palDragSizeRef.current?.cols || 1;
  const dragRows = ptrDragSize?.rows || palDragSizeRef.current?.rows || 1;

  const availableWidgets = WIDGET_REGISTRY.filter(def =>
    !def.app || !enabledApps || enabledApps.has(def.app)
  );

  return (
    <div className="home-root">
      {/* Top bar */}
      <div className="home-topbar">
        {editMode && (
          <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--mono)" }}>
            Click &amp; drag widgets to move · drag from library to add · × to remove
          </span>
        )}
        <button
          className={`btn ${editMode?"btn-primary":"btn-ghost"} btn-sm`}
          onClick={e => { e.stopPropagation(); setEditMode(m=>!m); setSizeOf(null); }}
        >
          {editMode ? "✓ Done editing" : "⊞ Customize"}
        </button>
      </div>

      {/* Body */}
      <div className="home-body">
        <div
          ref={wrapRef}
          className="widget-grid-wrap"
          onDragOver={onWrapDragOver}
          onDrop={onWrapDrop}
          onDragLeave={e => {
            // Only clear hover when truly leaving the wrap
            if (!wrapRef.current?.contains(e.relatedTarget)) {
              hoverCellRef.current = null;
              setHoverCell(null);
            }
          }}
        >
          {/* Visual overlay — below widgets, pointer-events:none */}
          {hoverCell && (
            <GridOverlay
              layout={layout}
              excludeId={ptrDragId}
              dragCols={dragCols}
              dragRows={dragRows}
              hoverCell={hoverCell}
              totalRows={totalRows}
            />
          )}

          {/* Widget grid — explicit CSS grid, no auto-flow */}
          <div
            className="widget-grid"
            style={{ position:"relative", zIndex:10, gridAutoFlow:"unset" }}
          >
            {layout.map(item => {
              const def  = WIDGET_REGISTRY.find(w => w.id === item.widgetId);
              const Comp = WIDGET_COMPONENTS[item.widgetId];
              if (!def || !Comp) return null;
              const isDragging = item.instanceId === ptrDragId;
              return (
                <div
                  key={item.instanceId}
                  className={["widget-cell", isDragging?"dragging":""].filter(Boolean).join(" ")}
                  style={{
                    gridColumn: `${(item.gridCol??0)+1} / span ${item.cols}`,
                    gridRow:    `${(item.gridRow??0)+1} / span ${item.rows}`,
                    opacity:    isDragging ? 0.3 : 1,
                    cursor:     editMode   ? "grab" : "default",
                    transition: "opacity .15s",
                  }}
                  onPointerDown={e => onWidgetPointerDown(e, item)}
                >
                  {editMode && (
                    <div className="widget-bar" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
                      <span className="widget-drag-handle">⠿</span>
                      <span className="widget-bar-name">{def.name}</span>
                      <div className="widget-bar-actions">
                        <div style={{ position:"relative" }}>
                          <button
                            className="widget-bar-btn"
                            onClick={e => {
                              e.stopPropagation();
                              setSizeOf(s => s===item.instanceId ? null : item.instanceId);
                            }}
                          >{item.cols}×{item.rows}</button>
                          {sizeOf===item.instanceId && (
                            <div className="size-popover" onClick={e=>e.stopPropagation()}>
                              {def.sizes.map(s=>(
                                <button
                                  key={`${s.cols}x${s.rows}`}
                                  className={`size-opt${s.cols===item.cols&&s.rows===item.rows?" size-active":""}`}
                                  onClick={()=>resizeWidget(item.instanceId,s.cols,s.rows)}
                                >
                                  <span style={{fontFamily:"var(--mono)"}}>{s.cols}×{s.rows}</span>
                                  <span>{s.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="widget-bar-btn widget-remove" onPointerDown={e=>e.stopPropagation()} onClick={()=>removeWidget(item.instanceId)}>×</button>
                      </div>
                    </div>
                  )}
                  <div className="widget-content" style={{ pointerEvents: ptrDragId ? "none" : "auto" }}>
                    <Comp cols={item.cols} rows={item.rows} enabledApps={enabledApps} />
                  </div>
                </div>
              );
            })}

            {layout.length===0 && (
              <div style={{ gridColumn:"span 12", textAlign:"center", padding:48, color:"var(--text3)", fontSize:13 }}>
                No widgets yet. Click <strong style={{color:"var(--text)"}}>⊞ Customize</strong> to add some.
              </div>
            )}
          </div>
        </div>

        {/* Palette */}
        {editMode && (
          <div className="widget-panel" onClick={e=>e.stopPropagation()}>
            <div className="widget-panel-head">Widget Library</div>
            <div className="widget-panel-scroll">
              {availableWidgets.map(def => {
                const Comp = WIDGET_COMPONENTS[def.id];
                return (
                  <div
                    key={def.id}
                    className="palette-card"
                    draggable
                    onDragStart={e=>onPaletteDragStart(e,def.id)}
                    onDragEnd={onPaletteDragEnd}
                  >
                    <div className="palette-preview">
                      {Comp
                        ? <Comp cols={def.defaultCols} rows={Math.min(def.defaultRows,2)} preview enabledApps={enabledApps}/>
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
                        style={{width:"100%",justifyContent:"center",marginTop:4}}
                        onClick={()=>addWidget(def.id)}
                      >+ Add to home</button>
                    </div>
                  </div>
                );
              })}
              {availableWidgets.length===0 && (
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
