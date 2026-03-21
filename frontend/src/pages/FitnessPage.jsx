const { useState, useEffect } = React;

function FitnessPage() {
  const [items,   setItems]   = useState([]);
  const [period,  setPeriod]  = useState("month");
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [cal,     setCal]     = useState("");
  const [weight,  setWeight]  = useState("");
  const [workout, setWorkout] = useState("");
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    api(`/api/fitness?period=${period}`).then(setItems).catch(() => {});
  }, [period]);

  async function logEntry() {
    if (!date) return;
    setSaving(true);
    try {
      await jsonPost("/api/fitness", {
        date,
        calories: cal    ? parseInt(cal)      : null,
        weight:   weight ? parseFloat(weight) : null,
        workout,
      });
      api(`/api/fitness?period=${period}`).then(setItems);
      setCal(""); setWeight(""); setWorkout("");
    } catch {}
    setSaving(false);
  }

  return (
    <div className="pad">
      <div className="section-head">Fitness & Nutrition</div>

      {/* Log form */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Log entry</div>
        <div className="fitness-log-grid">
          <div className="form-field">
            <label className="form-label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Calories</label>
            <input className="input" type="number" placeholder="kcal" value={cal} onChange={e => setCal(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Weight kg</label>
            <input className="input" type="number" step="0.1" placeholder="kg" value={weight} onChange={e => setWeight(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Workout</label>
            <input className="input" placeholder="e.g. chest, legs…" value={workout} onChange={e => setWorkout(e.target.value)} />
          </div>
          <div className="form-field" style={{ justifyContent:"flex-end" }}>
            <label className="form-label">&nbsp;</label>
            <button className="btn btn-primary" onClick={logEntry} disabled={saving || !date}>
              {saving ? "…" : "Log"}
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div className="card-title" style={{ marginBottom:0 }}>History</div>
          <div style={{ display:"flex", gap:6 }}>
            {["week", "month", "year"].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding:"4px 12px", borderRadius:6, border:"1px solid",
                  borderColor: period === p ? "var(--cyan)" : "var(--border)",
                  background:  period === p ? "rgba(0,200,240,.1)" : "none",
                  color:       period === p ? "var(--cyan)" : "var(--text3)",
                  fontSize:"11px", fontFamily:"var(--mono)", cursor:"pointer", transition:"all .15s",
                }}
              >
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <FitnessChart items={items} />
      </div>

      {/* Table */}
      <table className="mem-table">
        <thead>
          <tr><th>Date</th><th>Calories</th><th>Weight</th><th>Workout</th></tr>
        </thead>
        <tbody>
          {[...items].reverse().map(f => (
            <tr key={f.date}>
              <td style={{ fontFamily:"var(--mono)" }}>{f.date}</td>
              <td style={{ color:"var(--cyan)",   fontFamily:"var(--mono)" }}>{f.calories || "—"}</td>
              <td style={{ color:"var(--orange)", fontFamily:"var(--mono)" }}>{f.weight ? f.weight + " kg" : "—"}</td>
              <td>{f.workout || "—"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} style={{ color:"var(--text3)", padding:"14px 10px" }}>No entries yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
