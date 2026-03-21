const { useState, useEffect, useRef } = React;

function weatherIcon(desc = "") {
  const d = desc.toLowerCase();
  if (d.includes("thunder"))                         return "⛈";
  if (d.includes("snow"))                            return "❄️";
  if (d.includes("sleet") || d.includes("drizzle")) return "🌦";
  if (d.includes("rain"))                            return "🌧";
  if (d.includes("cloud"))                           return "☁️";
  if (d.includes("fog")  || d.includes("mist"))     return "🌫";
  if (d.includes("overcast"))                        return "🌥";
  return "☀️";
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tgt   = new Date(dateStr + "T00:00:00"); tgt.setHours(0,0,0,0);
  return Math.round((tgt - today) / 86400000);
}

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff <    60) return "just now";
  if (diff <  3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function HomePage({ enabledApps }) {
  const [dashData,     setDashData]     = useState(null);
  const [weather,      setWeather]      = useState(null);
  const [greeting,     setGreeting]     = useState("");
  const [greetLoading, setGreetLoading] = useState(true);
  const [newsSnippets, setNewsSnippets] = useState([]);

  // Journal state
  const [entries,      setEntries]      = useState([]);
  const [draft,        setDraft]        = useState("");
  const [posting,      setPosting]      = useState(false);
  const [expanded,     setExpanded]     = useState(null); // id of expanded entry
  const textRef = useRef(null);

  useEffect(() => {
    api("/api/dashboard").then(setDashData).catch(() => {});
    api("/api/weather").then(setWeather).catch(() => {});
    api("/api/home/greeting")
      .then(d => { setGreeting(d.greeting || ""); setGreetLoading(false); })
      .catch(() => setGreetLoading(false));
    api("/api/news").then(news => {
      const items = [];
      Object.values(news).forEach(feeds =>
        Object.values(feeds).forEach(f => {
          if (f.items?.length) items.push({ src: f.name, title: f.items[0].title, link: f.items[0].link });
        })
      );
      setNewsSnippets(items.slice(0, 3));
    }).catch(() => {});
    loadEntries();
  }, []);

  async function loadEntries() {
    const rows = await api("/api/journal?limit=20").catch(() => []);
    setEntries(rows);
  }

  async function submitEntry() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    await jsonPost("/api/journal", { content: text }).catch(() => {});
    setDraft("");
    setPosting(false);
    loadEntries();
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    await httpDel(`/api/journal/${id}`).catch(() => {});
    setEntries(e => e.filter(x => x.id !== id));
  }

  function handleKey(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitEntry();
  }

  if (!dashData) return <PageLoading />;

  const { fitness, reminders = [], weekday, date: dateStr, user_name, period } = dashData;
  const ft = fitness?.today;
  const fy = fitness?.yesterday;

  const fitnessEnabled   = !enabledApps || enabledApps.has("fitness");
  const remindersEnabled = !enabledApps || enabledApps.has("remind");
  const newsEnabled      = !enabledApps || enabledApps.has("news");
  const journalEnabled   = !enabledApps || enabledApps.has("journal");

  const chips = [];
  if (weather && !weather.error)
    chips.push({ icon: weatherIcon(weather.desc), text: `${weather.temp_c}° · ${weather.desc}` });
  if (fitnessEnabled) {
    if (ft?.workout)      chips.push({ icon: "🏋️", text: ft.workout });
    else if (fy?.workout) chips.push({ icon: "🏋️", text: `Yesterday: ${fy.workout}` });
    if (ft?.calories)     chips.push({ icon: "🔥", text: `${ft.calories} kcal` });
  }
  if (remindersEnabled && reminders.length > 0) {
    const r = reminders[0];
    const d = daysUntil(r.due_date);
    chips.push({ icon: "📅", text: `${d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d}d`}: ${r.title}` });
  }

  return (
    <div className="pad">

      {/* Hero greeting */}
      <div className="home-hero">
        <div className="hero-date">{weekday}, {dateStr}</div>
        <div className={`hero-greeting${greetLoading ? " loading" : ""}`}>
          {greetLoading
            ? <><Spinner size={12} style={{ verticalAlign:"middle", marginRight:8 }} /> Thinking…</>
            : greeting || `Good ${period || "day"}, ${user_name}.`
          }
        </div>
        {chips.length > 0 && (
          <div className="hero-chips">
            {chips.map((c, i) => (
              <div key={i} className="hero-chip" style={{ animationDelay:`${i * 0.06}s` }}>
                <span>{c.icon}</span><span>{c.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="home-grid">
        {/* Weather */}
        <div className="card">
          <div className="card-title">Weather — {weather?.city || "…"}</div>
          {weather && !weather.error ? (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10 }}>
                <div className="weather-temp">{weather.temp_c}°</div>
                <div>
                  <div className="weather-desc">{weatherIcon(weather.desc)} {weather.desc}</div>
                  <div className="weather-sub">Feels {weather.feels_like}° · {weather.humidity}% · {weather.wind_kmph} km/h</div>
                  <div className="weather-sub">↑{weather.max_c}° ↓{weather.min_c}°</div>
                </div>
              </div>
              <div className="hourly-list">
                {(weather.hourly || []).map((h, i) => (
                  <div key={i} className="hourly-item">
                    <div className="hourly-time">{String(h.time).padStart(4,"0").replace(/(\d{2})(\d{2})/,"$1:$2")}</div>
                    <div className="hourly-temp">{h.temp}°</div>
                    <div>{weatherIcon(h.desc)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="no-data">Weather unavailable</div>
          )}
        </div>

        {/* Reminders */}
        {remindersEnabled && (
          <div className="card">
            <div className="card-title">Upcoming</div>
            {reminders.length === 0 && <div className="no-data">No upcoming reminders</div>}
            {reminders.map(r => {
              const d   = daysUntil(r.due_date);
              const cls = d <= 1 ? "urgent" : d <= 3 ? "soon" : "";
              const when = d === 0 ? "TODAY" : d === 1 ? "Tomorrow" : `In ${d}d`;
              return (
                <div key={r.id} className={`reminder-item ${cls}`}>
                  <span className="reminder-when">{when}</span>
                  <span className="reminder-title">{r.title}</span>
                  <button className="reminder-done" onClick={async () => {
                    await jsonPatch(`/api/reminders/${r.id}/done`);
                    setDashData(d => d ? { ...d, reminders: d.reminders.filter(x => x.id !== r.id) } : d);
                  }}>✓</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Top news */}
        {newsEnabled && (
          <div className="card">
            <div className="card-title">Top stories</div>
            {newsSnippets.length === 0 && <div className="no-data">No news sources configured</div>}
            {newsSnippets.map((n, i) => (
              <div key={i} style={{ padding:"6px 0", borderBottom:"1px solid rgba(26,45,74,.4)" }}>
                <div style={{ fontSize:10, color:"var(--cyan)", fontFamily:"var(--mono)", marginBottom:2 }}>{n.src}</div>
                <a href={n.link || "#"} target="_blank" rel="noreferrer"
                   style={{ fontSize:12, color:"var(--text)", textDecoration:"none", lineHeight:1.4, display:"block" }}>
                  {n.title}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Journal — merged into home */}
      {journalEnabled && (
        <div style={{ marginTop:24 }}>
          <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--mono)", letterSpacing:1,
                        textTransform:"uppercase", marginBottom:10 }}>Personal Notes</div>

          {/* Write box */}
          <div className="card" style={{ marginBottom:14 }}>
            <textarea
              ref={textRef}
              className="input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Write a note, thought, or log… (Ctrl+Enter to save)"
              rows={3}
              style={{ width:"100%", resize:"vertical", marginBottom:8, fontFamily:"var(--mono)", fontSize:12 }}
            />
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              {draft && (
                <button className="btn btn-ghost btn-sm" onClick={() => setDraft("")}>Clear</button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={submitEntry}
                disabled={posting || !draft.trim()}
              >
                {posting ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>

          {/* Recent entries */}
          {entries.length === 0 && (
            <div className="no-data" style={{ padding:"16px 0" }}>No notes yet</div>
          )}
          {entries.map(e => (
            <div key={e.id} className="card"
                 style={{ marginBottom:8, padding:"10px 14px", cursor:"pointer" }}
                 onClick={() => setExpanded(ex => ex === e.id ? null : e.id)}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--mono)",
                                marginBottom:4 }}>
                    {new Date(e.ts).toLocaleDateString("en-GB", {
                      weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"
                    })} · {timeAgo(e.ts)}
                    {e.topic && e.topic !== "journal" && (
                      <span style={{ marginLeft:8, color:"var(--cyan)", fontSize:10 }}>{e.topic}</span>
                    )}
                  </div>
                  <div style={{
                    fontSize:13, color:"var(--text)", lineHeight:1.5, whiteSpace:"pre-wrap",
                    overflow: expanded === e.id ? "visible" : "hidden",
                    display:  expanded === e.id ? "block" : "-webkit-box",
                    WebkitLineClamp: expanded === e.id ? "unset" : 2,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {e.content}
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={ev => { ev.stopPropagation(); deleteEntry(e.id); }}
                  style={{ flexShrink:0, padding:"2px 7px", fontSize:11 }}
                  title="Delete"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
