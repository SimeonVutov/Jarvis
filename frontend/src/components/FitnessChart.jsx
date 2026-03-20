// SVG line chart for fitness data.
// Renders calories as a solid cyan line and weight as a dashed orange line.

function FitnessChart({ items }) {
  if (!items || items.length === 0) {
    return <div className="no-data">No data for this period.</div>;
  }

  const W = 700, H = 170, PAD_LEFT = 50, PAD_TOP = 14, PAD_RIGHT = 10, PAD_BOTTOM = 26;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP  - PAD_BOTTOM;

  const calories = items.map(f => f.calories || null);
  const weights  = items.map(f => f.weight   || null);

  const maxCal = Math.max(...calories.filter(Boolean), 2500);
  const validW = weights.filter(Boolean);
  const minWgt = validW.length ? Math.min(...validW) - 2 : 50;
  const maxWgt = validW.length ? Math.max(...validW) + 2 : 100;
  const wgtRange = maxWgt - minWgt || 10;

  const n  = items.length;
  const xOf  = i => PAD_LEFT + (n > 1 ? (i * chartW) / (n - 1) : chartW / 2);
  const yOfCal = v => PAD_TOP + chartH - (v / maxCal) * chartH;
  const yOfWgt = v => PAD_TOP + chartH - ((v - minWgt) / wgtRange) * chartH;

  function buildPath(points) {
    let d = ""; let started = false;
    for (const [x, y] of points) {
      if (y === null) { started = false; continue; }
      d += started ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
      started = true;
    }
    return d;
  }

  const calPoints = items.map((f, i) => [xOf(i), f.calories ? yOfCal(f.calories) : null]);
  const wgtPoints = items.map((f, i) => [xOf(i), f.weight   ? yOfWgt(f.weight)   : null]);
  const calPath   = buildPath(calPoints);
  const wgtPath   = buildPath(wgtPoints);
  const labelEvery = Math.ceil(n / 9);

  return (
    <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 8px 6px", marginBottom: 12, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={PAD_LEFT} y1={PAD_TOP + chartH * t} x2={W - PAD_RIGHT} y2={PAD_TOP + chartH * t}
                stroke="rgba(26,45,74,0.5)" strokeWidth="1" />
        ))}

        {/* Calorie axis labels (left) */}
        {[0, 0.5, 1].map((t, i) => (
          <text key={i} x={PAD_LEFT - 5} y={PAD_TOP + chartH * t + 4}
                textAnchor="end" fontSize="9" fill="var(--text3)">
            {Math.round(maxCal * (1 - t))}
          </text>
        ))}

        {/* Weight axis labels (right) */}
        {validW.length > 0 && [0, 1].map((t, i) => (
          <text key={i} x={W - PAD_RIGHT + 3} y={PAD_TOP + chartH * t + 4}
                textAnchor="start" fontSize="8" fill="rgba(240,120,48,0.7)">
            {t === 0 ? Math.round(maxWgt) : Math.round(minWgt)}
          </text>
        ))}

        {/* Calorie line + dots */}
        {calPath && (
          <>
            <path d={calPath} fill="none" stroke="var(--cyan)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
            {calPoints.map(([x, y], i) => y !== null && (
              <circle key={i} cx={x} cy={y} r="3.5" fill="var(--cyan)" opacity="0.9" />
            ))}
          </>
        )}

        {/* Weight line + dots */}
        {wgtPath && (
          <>
            <path d={wgtPath} fill="none" stroke="var(--orange)" strokeWidth="2"
                  strokeDasharray="5,3" strokeLinecap="round" strokeLinejoin="round" />
            {wgtPoints.map(([x, y], i) => y !== null && (
              <circle key={i} cx={x} cy={y} r="3" fill="var(--orange)" opacity="0.85" />
            ))}
          </>
        )}

        {/* X-axis date labels */}
        {items.map((f, i) => i % labelEvery === 0 && (
          <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--text3)">
            {f.date.slice(5)}
          </text>
        ))}
      </svg>

      <div style={{ display: "flex", gap: 14, marginTop: 3, paddingLeft: PAD_LEFT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text3)" }}>
          <div style={{ width: 16, height: 2, background: "var(--cyan)", borderRadius: 1 }} />
          <span>Calories</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text3)" }}>
          <svg width="16" height="6">
            <line x1="0" y1="3" x2="16" y2="3" stroke="var(--orange)" strokeWidth="2" strokeDasharray="4,2" />
          </svg>
          <span>Weight</span>
        </div>
      </div>
    </div>
  );
}
