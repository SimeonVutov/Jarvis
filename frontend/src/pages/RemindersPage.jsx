const { useState, useEffect } = React;

function RemindersPage() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [date,  setDate]  = useState("");
  const [desc,  setDesc]  = useState("");

  useEffect(() => { api("/api/reminders").then(setItems).catch(() => {}); }, []);

  async function addReminder() {
    if (!title || !date) return;
    const created = await jsonPost("/api/reminders", { title, due_date: date, description: desc });
    setItems(prev => [...prev, created].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setTitle(""); setDate(""); setDesc("");
  }

  async function markDone(id) {
    await jsonPatch(`/api/reminders/${id}/done`);
    setItems(prev => prev.filter(r => r.id !== id));
  }

  async function deleteReminder(id) {
    await httpDel(`/api/reminders/${id}`);
    setItems(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="pad">
      <div className="section-head">Reminders</div>

      <div className="card" style={{ marginBottom:18 }}>
        <div className="card-title">Add reminder</div>
        <div className="reminder-form">
          <div className="form-field">
            <label className="form-label">Title</label>
            <input className="input" placeholder="e.g. Submit assignment" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Due date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">Description</label>
            <input className="input" placeholder="Optional" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="form-field" style={{ justifyContent:"flex-end" }}>
            <label className="form-label">&nbsp;</label>
            <button className="btn btn-primary" onClick={addReminder} disabled={!title || !date}>Add</button>
          </div>
        </div>
      </div>

      {items.length === 0 && <div className="no-data">No upcoming reminders.</div>}
      {items.map(r => {
        const d    = daysUntil(r.due_date);
        const cls  = d <= 1 ? "urgent" : d <= 3 ? "soon" : "";
        const when = d === 0 ? "TODAY" : d === 1 ? "Tomorrow" : d < 0 ? `${Math.abs(d)}d overdue` : `In ${d}d`;
        return (
          <div key={r.id} className={`reminder-item ${cls}`} style={{ marginBottom:6 }}>
            <span className="reminder-when">{when}</span>
            <span className="reminder-title">
              <strong>{r.title}</strong>{r.description ? " — " + r.description : ""}
            </span>
            <button className="reminder-done" onClick={() => markDone(r.id)}>✓ Done</button>
            <button className="reminder-done" onClick={() => deleteReminder(r.id)} style={{ marginLeft:4 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
