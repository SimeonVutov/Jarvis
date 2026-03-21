const { useState, useEffect } = React;

function StatsPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/api/stats").then(setData).catch(() => {}); }, []);
  if (!data) return <PageLoading />;

  const totals = data.totals || {};
  const usage  = data.usage_by_mode || [];
  const maxU   = Math.max(...usage.map(u => u.total), 1);

  return (
    <div className="pad">
      <div className="section-head">Statistics</div>

      <div className="stat-cards">
        {[["Sessions", totals.sessions], ["Messages", totals.messages], ["Journal", totals.journal], ["Memories", totals.memories]].map(([label, n], i) => (
          <div key={i} className="stat-card" style={{ animationDelay:`${i * 0.07}s` }}>
            <div className="stat-num">{n || 0}</div>
            <div className="stat-lbl">{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-title">Messages by mode</div>
        {usage.map((u, i) => (
          <div key={i} className="bar-row">
            <div className="bar-label">{u.mode || "general"}</div>
            <div className="bar-track">
              <div className={`bar-fill bar-${u.mode || "general"}`} style={{ width: `${((u.total / maxU) * 100).toFixed(0)}%` }}>
                {u.total}
              </div>
            </div>
          </div>
        ))}
        {usage.length === 0 && <div className="no-data">No data yet.</div>}
      </div>

      <div className="card">
        <div className="card-title">Configured models</div>
        {Object.entries(data.models || {}).map(([k, v]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}>
            <span className={`tag tag-${k}`}>{k.toUpperCase()}</span>
            <span style={{ fontFamily:"var(--mono)", fontSize:11.5, color:"var(--text2)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
