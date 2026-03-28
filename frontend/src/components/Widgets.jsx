// Widgets.jsx — All Home Page widget components
// Each component receives: cols, rows, preview (bool), enabledApps
// Size determines the DESIGN (layout + content), not just how much space is used.
// preview=true → static fake data, no API calls (used in the palette panel)

const { useState, useEffect, useRef } = React;

// ── Size classifier ────────────────────────────────────────────────────────────
// Returns a string that widgets use to pick their layout variant.
function sz(cols, rows) {
  if (rows === 1 && cols <= 3)  return "tiny";
  if (rows === 1)               return "mini";
  if (rows === 2 && cols <= 4)  return "compact";
  if (rows === 2 && cols <= 6)  return "standard";
  if (rows === 2)               return "wide";
  return "tall";                // rows >= 3
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GREETING
// ══════════════════════════════════════════════════════════════════════════════
function GreetingWidget({ cols, rows, preview }) {
  const [dash,  setDash]  = useState(null);
  const [greet, setGreet] = useState("");
  const [wthr,  setWthr]  = useState(null);
  const [ldg,   setLdg]   = useState(!preview);

  useEffect(() => {
    if (preview) return;
    api("/api/dashboard").then(setDash).catch(() => {});
    api("/api/weather").then(setWthr).catch(() => {});
    api("/api/home/greeting")
      .then(d => { setGreet(d.greeting || ""); setLdg(false); })
      .catch(() => setLdg(false));
  }, []);

  const chips = [];
  if (wthr && !wthr.error)             chips.push({ icon: weatherIcon(wthr.desc), text: `${wthr.temp_c}°` });
  if (dash?.fitness?.today?.calories)  chips.push({ icon: "🔥", text: `${dash.fitness.today.calories} kcal` });
  if (dash?.fitness?.today?.workout)   chips.push({ icon: "🏋️", text: dash.fitness.today.workout });

  if (preview) return (
    <div className="wg-pad" style={{ justifyContent: "center" }}>
      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginBottom: 6 }}>
        Saturday, March 28
      </div>
      <div style={{ fontSize: cols >= 8 ? 16 : 13, color: "var(--text)", lineHeight: 1.5 }}>
        Good morning — OS exam tomorrow. ☀️ 14° outside. Gym logged.
      </div>
      {cols >= 8 && (
        <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
          {[{ icon: "☀️", text: "14°" }, { icon: "🔥", text: "2100 kcal" }].map((c, i) => (
            <div key={i} className="hero-chip" style={{ fontSize: 11, padding: "3px 10px" }}>
              <span>{c.icon}</span><span>{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const s = sz(cols, rows);
  const textSize = s === "tall" ? 20 : cols >= 8 ? 16 : 14;

  return (
    <div className="wg-pad" style={{ justifyContent: "center" }}>
      <div className="wg-micro">{dash?.weekday}, {dash?.date}</div>
      <div style={{ fontSize: textSize, color: "var(--text)", lineHeight: 1.5, marginTop: 4 }}>
        {ldg
          ? <><Spinner size={11} style={{ verticalAlign: "middle", marginRight: 6 }} />Thinking…</>
          : greet || `Good ${dash?.period || "day"}, ${dash?.user_name || ""}.`
        }
      </div>
      {(s !== "tiny" && s !== "mini" && chips.length > 0) && (
        <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
          {chips.map((c, i) => (
            <div key={i} className="hero-chip" style={{ fontSize: 11, padding: "3px 10px" }}>
              <span>{c.icon}</span><span>{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. WEATHER — 5 distinct visual designs
// ══════════════════════════════════════════════════════════════════════════════
function WeatherWidget({ cols, rows, preview }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (!preview) api("/api/weather").then(setData).catch(() => {}); }, []);

  const fake = {
    temp_c: 9, feels_like: 6, humidity: 62, wind_kmph: 29,
    max_c: 12, min_c: 4, desc: "Partly cloudy", city: "Den Haag",
    hourly: [
      { time: "600",  temp: 7, desc: "Cloudy" },
      { time: "900",  temp: 8, desc: "Partly cloudy" },
      { time: "1200", temp: 9, desc: "Partly cloudy" },
      { time: "1500", temp: 9, desc: "Cloudy" },
      { time: "1800", temp: 8, desc: "Rain" },
      { time: "2100", temp: 7, desc: "Rain" },
    ],
  };
  const d = preview ? fake : data;
  if (!d) return <div className="wg-pad"><div className="wg-empty">{data?.error ? "Unavailable" : "Loading…"}</div></div>;

  const s = sz(cols, rows);

  // tiny (3×1): icon + temp on one line
  if (s === "tiny") return (
    <div className="wg-pad" style={{ flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center" }}>
      <span style={{ fontSize: 30 }}>{weatherIcon(d.desc)}</span>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--mono)", lineHeight: 1 }}>{d.temp_c}°</div>
        <div style={{ fontSize: 9, color: "var(--text3)" }}>{d.city}</div>
      </div>
    </div>
  );

  // mini (wider row): icon + temp + conditions, all inline
  if (s === "mini") return (
    <div className="wg-pad" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 38 }}>{weatherIcon(d.desc)}</span>
      <div>
        <div style={{ fontSize: 32, fontWeight: 300, fontFamily: "var(--mono)", lineHeight: 1 }}>{d.temp_c}°</div>
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{d.desc}</div>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>Feels {d.feels_like}°</div>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>{d.humidity}% · {d.wind_kmph}km/h</div>
        <div style={{ fontSize: 11, color: "var(--cyan)", fontFamily: "var(--mono)" }}>↑{d.max_c}° ↓{d.min_c}°</div>
      </div>
    </div>
  );

  // compact (≤4×2): large temp card, full conditions, no hourly
  if (s === "compact") return (
    <div className="wg-pad">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
        <div>
          <div style={{ fontSize: 52, fontWeight: 200, fontFamily: "var(--mono)", lineHeight: 1, color: "var(--text)" }}>
            {d.temp_c}°
          </div>
          <div style={{ fontSize: 11, color: "var(--cyan)", fontFamily: "var(--mono)", marginTop: 4 }}>
            ↑{d.max_c}° ↓{d.min_c}°
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 8 }}>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 6 }}>
            {weatherIcon(d.desc)} {d.desc}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>Feels like {d.feels_like}°</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>{d.humidity}% humidity</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>{d.wind_kmph} km/h wind</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: "auto", paddingTop: 8 }}>{d.city}</div>
    </div>
  );

  // standard (≤6×2): current conditions + 4-hour strip
  if (s === "standard") return (
    <div className="wg-pad" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="weather-temp">{d.temp_c}°</div>
        <div>
          <div className="weather-desc">{weatherIcon(d.desc)} {d.desc}</div>
          <div className="weather-sub">Feels {d.feels_like}° · {d.humidity}% · {d.wind_kmph} km/h</div>
          <div className="weather-sub">↑{d.max_c}° ↓{d.min_c}° · {d.city}</div>
        </div>
      </div>
      <hr className="wg-divider" />
      <div className="hourly-list">
        {(d.hourly || []).slice(0, 4).map((h, i) => (
          <div key={i} className="hourly-item">
            <div className="hourly-time">{String(h.time).padStart(4,"0").replace(/(\d{2})(\d{2})/,"$1:$2")}</div>
            <div className="hourly-temp">{h.temp}°</div>
            <div>{weatherIcon(h.desc)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // wide (>6×2) or tall: full hourly forecast
  return (
    <div className="wg-pad" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="weather-temp" style={{ fontSize: s === "tall" ? 54 : 36 }}>{d.temp_c}°</div>
        <div>
          <div className="weather-desc" style={{ fontSize: s === "tall" ? 15 : 13 }}>
            {weatherIcon(d.desc)} {d.desc}
          </div>
          <div className="weather-sub">Feels {d.feels_like}° · {d.humidity}% humidity · {d.wind_kmph} km/h</div>
          <div className="weather-sub">↑{d.max_c}° ↓{d.min_c}° · {d.city}</div>
        </div>
      </div>
      <hr className="wg-divider" />
      <div className="hourly-list" style={{ flexWrap: s === "tall" ? "wrap" : "nowrap" }}>
        {(d.hourly || []).map((h, i) => (
          <div key={i} className="hourly-item" style={s === "tall" ? { flex: "1 0 52px", textAlign: "center" } : {}}>
            <div className="hourly-time">{String(h.time).padStart(4,"0").replace(/(\d{2})(\d{2})/,"$1:$2")}</div>
            {s === "tall" && <div style={{ fontSize: 20, margin: "4px 0" }}>{weatherIcon(h.desc)}</div>}
            <div className="hourly-temp">{h.temp}°</div>
            {s !== "tall" && <div style={{ fontSize: 12 }}>{weatherIcon(h.desc)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. FITNESS TODAY — micro / standard / full
// ══════════════════════════════════════════════════════════════════════════════
function FitnessTodayWidget({ cols, rows, preview }) {
  const [dash,    setDash]    = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [cal,     setCal]     = useState("");
  const [wt,      setWt]      = useState("");
  const [wo,      setWo]      = useState("");
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { if (!preview) api("/api/dashboard").then(setDash).catch(() => {}); }, []);

  async function log() {
    setSaving(true);
    await jsonPost("/api/fitness", {
      date: new Date().toISOString().slice(0, 10),
      calories: cal ? +cal : null, weight: wt ? +wt : null, workout: wo || null,
    }).catch(() => {});
    setSaving(false); setLogOpen(false); setCal(""); setWt(""); setWo("");
    api("/api/dashboard").then(setDash).catch(() => {});
  }

  const fakeFt = { calories: 2100, weight: 84.0, workout: "chest press" };
  const fakeFy = { calories: 1950, weight: 84.2, workout: "legs" };
  const ft = preview ? fakeFt : dash?.fitness?.today;
  const fy = preview ? fakeFy : dash?.fitness?.yesterday;
  const s  = sz(cols, rows);
  const showForm = rows >= 2;
  const showYest = cols >= 6 && rows >= 2;

  // tiny / mini: inline numbers only
  if (s === "tiny" || s === "mini") return (
    <div className="wg-pad" style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div className="wg-micro" style={{ width: "100%", marginBottom: -4 }}>Fitness · Today</div>
      {ft ? (
        <>
          {ft.calories && <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--cyan)" }}>{ft.calories}</span>
            <span className="wg-micro">kcal</span>
          </div>}
          {ft.weight && <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--orange)" }}>{ft.weight}</span>
            <span className="wg-micro">kg</span>
          </div>}
          {ft.workout && s !== "tiny" && <span className="wg-micro">🏋️ {ft.workout}</span>}
        </>
      ) : <div className="wg-empty">Nothing logged today</div>}
    </div>
  );

  return (
    <div className="wg-pad" style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="wg-micro">Fitness · Today</div>
        {showForm && !preview && (
          <button className="btn btn-ghost btn-sm" style={{ padding: "1px 8px", fontSize: 11 }}
            onClick={() => setLogOpen(l => !l)}>
            {logOpen ? "Cancel" : "+ Log"}
          </button>
        )}
      </div>

      {ft ? (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          {ft.calories && <div>
            <span style={{ fontSize: 28, fontWeight: 300, fontFamily: "var(--mono)", color: "var(--cyan)" }}>{ft.calories}</span>
            <span className="wg-micro" style={{ marginLeft: 4 }}>kcal</span>
          </div>}
          {ft.weight && <div>
            <span style={{ fontSize: 28, fontWeight: 300, fontFamily: "var(--mono)", color: "var(--orange)" }}>{ft.weight}</span>
            <span className="wg-micro" style={{ marginLeft: 4 }}>kg</span>
          </div>}
          {ft.workout && <span className="wg-micro">🏋️ {ft.workout}</span>}
        </div>
      ) : (
        <div className="wg-empty">Nothing logged today</div>
      )}

      {showYest && fy && (
        <div style={{ fontSize: 11, color: "var(--text3)", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
          Yesterday: {fy.calories && `${fy.calories} kcal`}
          {fy.weight && ` · ${fy.weight} kg`}
          {fy.workout && ` · ${fy.workout}`}
        </div>
      )}

      {logOpen && showForm && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <input className="input" placeholder="kcal"    value={cal} onChange={e => setCal(e.target.value)} style={{ width: 64 }} />
          <input className="input" placeholder="kg"      value={wt}  onChange={e => setWt(e.target.value)}  style={{ width: 56 }} />
          <input className="input" placeholder="workout" value={wo}  onChange={e => setWo(e.target.value)}  style={{ flex: 1, minWidth: 80 }} />
          <button className="btn btn-primary btn-sm" onClick={log} disabled={saving || (!cal && !wt && !wo)}>
            {saving ? "…" : "Log"}
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. FITNESS CHART
// ══════════════════════════════════════════════════════════════════════════════
function FitnessChartWidget({ cols, rows, preview }) {
  const [items, setItems] = useState([]);
  useEffect(() => { if (!preview) api("/api/fitness?period=week").then(setItems).catch(() => {}); }, []);

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro" style={{ marginBottom: 8 }}>Weekly Fitness · 7 days</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>
        Calorie &amp; weight trend chart
      </div>
    </div>
  );

  return (
    <div className="wg-pad" style={{ height: "100%" }}>
      <div className="wg-micro" style={{ marginBottom: 6 }}>Weekly Fitness</div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FitnessChart items={items} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. REMINDERS — next-only / list / list+add
// ══════════════════════════════════════════════════════════════════════════════
function RemindersWidget({ cols, rows, preview }) {
  const [items,  setItems]  = useState([]);
  const [adding, setAdding] = useState(false);
  const [title,  setTitle]  = useState("");
  const [date,   setDate]   = useState("");

  useEffect(() => {
    if (!preview) api("/api/reminders").then(d => setItems((d || []).slice(0, 8))).catch(() => {});
  }, []);

  async function done(id) {
    await jsonPatch(`/api/reminders/${id}/done`);
    setItems(p => p.filter(r => r.id !== id));
  }

  async function add() {
    if (!title || !date) return;
    const r = await jsonPost("/api/reminders", { title, due_date: date });
    setItems(p => [...p, r].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setTitle(""); setDate(""); setAdding(false);
  }

  const fakeItems = [
    { id: 1, title: "Submit OS report",   due_date: new Date().toISOString().slice(0,10) },
    { id: 2, title: "Gym — leg day",      due_date: new Date(Date.now()+86400000).toISOString().slice(0,10) },
    { id: 3, title: "Algorithm homework", due_date: new Date(Date.now()+172800000).toISOString().slice(0,10) },
  ];
  const list = preview ? fakeItems : items;
  const s = sz(cols, rows);

  // tiny / mini: next reminder only
  if (s === "tiny" || s === "mini") {
    const r = list[0];
    if (!r) return <div className="wg-pad"><div className="wg-micro">Reminders</div><div className="wg-empty">All clear ✓</div></div>;
    const d = daysUntil(r.due_date);
    const when = d === 0 ? "TODAY" : d === 1 ? "Tomorrow" : `In ${d}d`;
    const cls  = d <= 0 ? "urgent" : d <= 2 ? "soon" : "";
    return (
      <div className="wg-pad" style={{ justifyContent: "center" }}>
        <div className="wg-micro" style={{ marginBottom: 6 }}>Next Reminder</div>
        <div className={`reminder-item ${cls}`} style={{ margin: 0 }}>
          <span className="reminder-when">{when}</span>
          <span className="reminder-title">{r.title}</span>
          {!preview && <button className="reminder-done" onClick={() => done(r.id)}>✓</button>}
        </div>
        {list.length > 1 && <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 6 }}>+{list.length - 1} more</div>}
      </div>
    );
  }

  const showAdd = (s === "wide" || (s === "standard" && rows >= 2) || s === "tall") && !preview;
  const maxVisible = s === "tall" ? 8 : s === "wide" ? 6 : 4;

  return (
    <div className="wg-pad" style={{ gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="wg-micro">Upcoming Reminders</div>
        {showAdd && (
          <button className="btn btn-ghost btn-sm" style={{ padding: "1px 8px", fontSize: 11 }}
            onClick={() => setAdding(a => !a)}>
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="input" placeholder="Reminder…" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} autoFocus />
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 130 }} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!title || !date}>Add</button>
        </div>
      )}

      {list.length === 0 && <div className="wg-empty">All clear ✓</div>}
      {list.slice(0, maxVisible).map(r => {
        const d = daysUntil(r.due_date);
        const cls  = d <= 0 ? "urgent" : d <= 2 ? "soon" : "";
        const when = d === 0 ? "TODAY" : d === 1 ? "Tomorrow" : d < 0 ? `${Math.abs(d)}d overdue` : `In ${d}d`;
        return (
          <div key={r.id} className={`reminder-item ${cls}`} style={{ margin: 0 }}>
            <span className="reminder-when">{when}</span>
            <span className="reminder-title">{r.title}</span>
            {!preview && <button className="reminder-done" onClick={() => done(r.id)}>✓</button>}
          </div>
        );
      })}
      {list.length > maxVisible && (
        <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)" }}>+{list.length - maxVisible} more</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. CALENDAR TODAY — summary / list / timeline
// ══════════════════════════════════════════════════════════════════════════════
function CalendarTodayWidget({ cols, rows, preview }) {
  const [data, setData] = useState({ tasks: [], events: [] });

  useEffect(() => {
    if (preview) return;
    const today = new Date().toISOString().slice(0, 10);
    api(`/api/calendar/items?date=${today}`)
      .then(d => setData(d || { tasks: [], events: [] }))
      .catch(() => {});
  }, []);

  async function toggleDone(id, done) {
    await jsonPatch(`/api/calendar/tasks/${id}/done`);
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === id ? { ...t, done: !done } : t) }));
  }

  const fakeData = {
    tasks: [
      { id: 1, title: "OS lecture notes", level: "high", done: false, start_time: "10:00" },
      { id: 2, title: "Submit assignment", level: "mid",  done: true,  start_time: "14:00" },
      { id: 3, title: "Guitar practice",  level: "low",  done: false,  start_time: null },
    ],
    events: [
      { id: 1, title: "PostNL delivery", level: "mid", start_time: "19:00", end_time: "19:10" },
    ],
  };
  const d = preview ? fakeData : data;
  const s = sz(cols, rows);
  const LEVEL_CLR = { high: "var(--red)", mid: "var(--orange)", low: "var(--text3)", not_important: "var(--border2)" };
  const nothing = d.tasks.length === 0 && d.events.length === 0;
  const doneCount = d.tasks.filter(t => t.done).length;

  // compact: summary header + first few items
  if (s === "tiny" || s === "compact") {
    return (
      <div className="wg-pad" style={{ gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="wg-micro">Today's Schedule</div>
          {d.tasks.length > 0 && (
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--cyan)" }}>
              {doneCount}/{d.tasks.length} done
            </div>
          )}
        </div>
        {nothing && <div className="wg-empty">Nothing scheduled ✓</div>}
        {d.tasks.slice(0, 3).map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", borderBottom: "1px solid rgba(26,45,74,.3)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL_CLR[t.level] || "var(--text3)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: "var(--text)", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? .6 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
            </span>
            {!preview && <button onClick={() => toggleDone(t.id, t.done)} style={{ background: "none", border: "none", cursor: "pointer", color: t.done ? "var(--green)" : "var(--text3)", fontSize: 12, padding: "0 2px" }}>{t.done ? "✓" : "○"}</button>}
          </div>
        ))}
        {d.events.slice(0, 1).map(e => (
          <div key={e.id} style={{ display: "flex", gap: 7, padding: "3px 0", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--cyan)", fontFamily: "var(--mono)", flexShrink: 0 }}>{e.start_time || "◈"}</span>
            <span style={{ fontSize: 12, color: "var(--cyan)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
          </div>
        ))}
      </div>
    );
  }

  // standard / wide: full list with time labels
  if (s === "standard" || s === "wide") return (
    <div className="wg-pad" style={{ gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <div className="wg-micro">Today's Schedule</div>
        {d.tasks.length > 0 && (
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--cyan)" }}>{doneCount}/{d.tasks.length} done</div>
        )}
      </div>
      {nothing && <div className="wg-empty">Nothing scheduled today ✓</div>}
      {d.tasks.map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(26,45,74,.25)" }}>
          {t.start_time && <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", width: 32, flexShrink: 0 }}>{t.start_time}</span>}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL_CLR[t.level] || "var(--text3)", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: "var(--text)", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? .5 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.title}
          </span>
          {!preview && <button onClick={() => toggleDone(t.id, t.done)} style={{ background: "none", border: "none", cursor: "pointer", color: t.done ? "var(--green)" : "var(--text3)", fontSize: 13 }}>{t.done ? "✓" : "○"}</button>}
        </div>
      ))}
      {d.events.map(e => (
        <div key={e.id} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(26,45,74,.25)", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "var(--cyan)", fontFamily: "var(--mono)", width: 32, flexShrink: 0 }}>{e.start_time || ""}</span>
          <span style={{ fontSize: 10, color: "var(--cyan)" }}>◈</span>
          <span style={{ flex: 1, fontSize: 12, color: "var(--cyan)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
          {e.end_time && <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", flexShrink: 0 }}>{e.end_time}</span>}
        </div>
      ))}
    </div>
  );

  // tall (rows>=3): full timeline with hour labels + overdue section
  return (
    <div className="wg-pad" style={{ gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="wg-micro">Today's Schedule</div>
        {d.tasks.length > 0 && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--cyan)" }}>{doneCount}/{d.tasks.length} done</div>}
      </div>
      {nothing && <div className="wg-empty">Nothing scheduled today ✓</div>}
      {d.tasks.filter(t => !t.start_time).length > 0 && (
        <>
          <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 1 }}>UNTIMED</div>
          {d.tasks.filter(t => !t.start_time).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: LEVEL_CLR[t.level] }} />
              <span style={{ flex: 1, fontSize: 12, color: "var(--text)", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? .5 : 1 }}>{t.title}</span>
              {!preview && <button onClick={() => toggleDone(t.id, t.done)} style={{ background: "none", border: "none", cursor: "pointer", color: t.done ? "var(--green)" : "var(--text3)", fontSize: 13 }}>{t.done ? "✓" : "○"}</button>}
            </div>
          ))}
          <hr className="wg-divider" />
        </>
      )}
      {d.tasks.filter(t => t.start_time).concat(d.events).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")).map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderLeft: `3px solid ${item.level ? LEVEL_CLR[item.level] : "var(--cyan)"}`, paddingLeft: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", width: 36, flexShrink: 0 }}>{item.start_time}</span>
          <span style={{ flex: 1, fontSize: 12, color: item.level ? "var(--text)" : "var(--cyan)", textDecoration: item.done ? "line-through" : "none", opacity: item.done ? .5 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {!item.level && "◈ "}{item.title}
          </span>
          {!preview && item.level && <button onClick={() => toggleDone(item.id, item.done)} style={{ background: "none", border: "none", cursor: "pointer", color: item.done ? "var(--green)" : "var(--text3)", fontSize: 13 }}>{item.done ? "✓" : "○"}</button>}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. NEWS HEADLINES — ticker / compact / standard
// ══════════════════════════════════════════════════════════════════════════════
function NewsWidget({ cols, rows, preview }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (preview) return;
    api("/api/news").then(news => {
      const all = [];
      Object.values(news || {}).forEach(feeds =>
        Object.values(feeds).forEach(f => {
          if (f.items?.length) all.push({ src: f.name, title: f.items[0].title, link: f.items[0].link });
        })
      );
      setItems(all.slice(0, 8));
    }).catch(() => {});
  }, []);

  const fakeItems = [
    { src: "World",  title: "EU announces new AI regulations framework",       link: "#" },
    { src: "Tech",   title: "NVIDIA reports record Q4 earnings on AI demand",  link: "#" },
    { src: "NL",     title: "Dutch housing market sees first cooling in years", link: "#" },
    { src: "World",  title: "IMF upgrades global growth forecast for 2026",     link: "#" },
  ];
  const list = preview ? fakeItems : items;
  const s = sz(cols, rows);

  // tiny: just the top headline, no source
  if (s === "tiny") {
    const h = list[0];
    return (
      <div className="wg-pad" style={{ justifyContent: "center" }}>
        <div className="wg-micro" style={{ marginBottom: 4 }}>Top Story</div>
        {h
          ? <a href={h.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--text)", textDecoration: "none", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{h.title}</a>
          : <div className="wg-empty">No news sources configured</div>
        }
      </div>
    );
  }

  // mini (row=1, wider): source + headline in a scrolling-ticker style
  if (s === "mini") {
    return (
      <div className="wg-pad" style={{ gap: 5 }}>
        <div className="wg-micro">Latest Headlines</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
          {list.slice(0, 4).map((h, i) => (
            <div key={i} style={{ flexShrink: 0, maxWidth: 200, padding: "4px 10px", background: "var(--bg3)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 9, color: "var(--cyan)", fontFamily: "var(--mono)", marginBottom: 3 }}>{h.src}</div>
              <a href={h.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--text)", textDecoration: "none", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.title}</a>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxItems = s === "wide" ? 6 : s === "tall" ? 8 : 4;

  return (
    <div className="wg-pad" style={{ gap: 6 }}>
      <div className="wg-micro" style={{ marginBottom: 4 }}>Latest Headlines</div>
      {list.length === 0 && <div className="wg-empty">No news sources configured</div>}
      {list.slice(0, maxItems).map((h, i) => (
        <div key={i} style={{ padding: "5px 0", borderBottom: "1px solid rgba(26,45,74,.35)" }}>
          <div style={{ fontSize: 9, color: "var(--cyan)", fontFamily: "var(--mono)", marginBottom: 2 }}>{h.src}</div>
          <a href={h.link || "#"} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: "var(--text)", textDecoration: "none", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: s === "tall" ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {h.title}
          </a>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. JOURNAL — write-only / write + entries
// ══════════════════════════════════════════════════════════════════════════════
function JournalWidget({ cols, rows, preview }) {
  const [entries, setEntries] = useState([]);
  const [draft,   setDraft]   = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!preview) api("/api/journal?limit=6").then(setEntries).catch(() => {});
  }, []);

  async function save() {
    const t = draft.trim(); if (!t) return;
    setPosting(true);
    await jsonPost("/api/journal", { content: t }).catch(() => {});
    setDraft(""); setPosting(false);
    api("/api/journal?limit=6").then(setEntries).catch(() => {});
  }

  async function del(id) {
    await httpDel(`/api/journal/${id}`).catch(() => {});
    setEntries(e => e.filter(x => x.id !== id));
  }

  const s = sz(cols, rows);
  const showEntries = rows >= 3;
  const textRows = rows >= 3 ? 3 : 2;

  if (preview) return (
    <div className="wg-pad" style={{ gap: 7 }}>
      <div className="wg-micro">Personal Notes</div>
      <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
        Write a note, thought, or log…
      </div>
      {showEntries && (
        <div style={{ fontSize: 11, color: "var(--text2)", padding: "4px 0", borderTop: "1px solid var(--border)" }}>
          Today · Reviewed OS scheduling chapter, need to re-read…
        </div>
      )}
    </div>
  );

  return (
    <div className="wg-pad" style={{ gap: 8 }}>
      <div className="wg-micro">Personal Notes</div>
      <textarea
        className="input" value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}
        placeholder="Write a note… (Ctrl+Enter to save)"
        rows={textRows} style={{ resize: "none", fontSize: 12, fontFamily: "var(--mono)", width: "100%" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={posting || !draft.trim()}>
          {posting ? "Saving…" : "Save"}
        </button>
      </div>
      {showEntries && entries.map(e => (
        <div key={e.id} style={{ padding: "5px 0", borderTop: "1px solid rgba(26,45,74,.3)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginBottom: 2 }}>
              {new Date(e.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {timeAgo(e.ts)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {e.content}
            </div>
          </div>
          <button onClick={() => del(e.id)} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 11, padding: "2px 4px", flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. QUICK STATS — 3 clear size variants
// ══════════════════════════════════════════════════════════════════════════════
function QuickStatsWidget({ cols, rows, preview }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (!preview) api("/api/stats").then(setData).catch(() => {}); }, []);

  const fake = { totals: { sessions: 248, messages: 1247, memories: 89, journal: 34 }, usage_by_mode: [
    { mode: "general", total: 600 }, { mode: "coding", total: 400 }, { mode: "study", total: 247 },
  ]};
  const d = preview ? fake : data;
  const t = d?.totals || {};
  const usage = d?.usage_by_mode || [];
  const s = sz(cols, rows);

  // tiny: just 3 numbers, no labels below
  if (s === "tiny") return (
    <div className="wg-pad" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}>
      {[["Sessions", t.sessions || 0, "var(--cyan)"], ["Messages", t.messages || 0, "var(--text)"], ["Memories", t.memories || 0, "var(--text3)"]].map(([l, n, c]) => (
        <div key={l} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: c, lineHeight: 1 }}>{n}</div>
          <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 0.5, marginTop: 2 }}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );

  // mini (wider row): 4 numbers with a mode breakdown bar
  if (s === "mini") {
    const total = usage.reduce((s, u) => s + u.total, 0) || 1;
    return (
      <div className="wg-pad" style={{ gap: 8 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline", flexWrap: "wrap" }}>
          {[["SESSIONS", t.sessions, "var(--cyan)"], ["MESSAGES", t.messages, "var(--text)"], ["MEMORIES", t.memories, "var(--text3)"], ["JOURNAL", t.journal, "var(--text3)"]].filter(([,n]) => n !== undefined).map(([l, n, c]) => (
            <div key={l}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: c, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 0.5, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        {usage.length > 0 && (
          <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 6 }}>
            {usage.map(u => (
              <div key={u.mode} title={`${u.mode}: ${u.total}`} style={{
                flex: u.total / total,
                background: u.mode === "general" ? "var(--cyan)" : u.mode === "coding" ? "var(--orange)" : "var(--purple)",
              }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // compact / standard / larger: numbers + mode bars with labels
  const maxU = Math.max(...usage.map(u => u.total), 1);
  return (
    <div className="wg-pad" style={{ gap: 10 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[["Sessions", t.sessions, "var(--cyan)"], ["Messages", t.messages, "var(--text)"], ["Memories", t.memories, "var(--text3)"]].map(([l, n, c]) => (
          <div key={l} style={{ textAlign: "center", minWidth: 52 }}>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--mono)", color: c, lineHeight: 1 }}>{n || 0}</div>
            <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 0.5, marginTop: 3 }}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>
      {rows >= 2 && usage.length > 0 && (
        <>
          <hr className="wg-divider" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {usage.map(u => (
              <div key={u.mode} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 42, fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", textAlign: "right", flexShrink: 0 }}>
                  {u.mode.toUpperCase().slice(0, 3)}
                </div>
                <div style={{ flex: 1, height: 8, background: "var(--bg3)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${(u.total / maxU * 100).toFixed(0)}%`,
                    background: u.mode === "general" ? "var(--cyan)" : u.mode === "coding" ? "var(--orange)" : "var(--purple)",
                  }} />
                </div>
                <div style={{ width: 28, fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", textAlign: "right", flexShrink: 0 }}>
                  {u.total}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Component map — key = WIDGET_REGISTRY id
// ══════════════════════════════════════════════════════════════════════════════
const WIDGET_COMPONENTS = {
  "greeting":       GreetingWidget,
  "weather":        WeatherWidget,
  "fitness-today":  FitnessTodayWidget,
  "fitness-chart":  FitnessChartWidget,
  "reminders":      RemindersWidget,
  "calendar-today": CalendarTodayWidget,
  "news-headlines": NewsWidget,
  "journal":        JournalWidget,
  "quick-stats":    QuickStatsWidget,
};
