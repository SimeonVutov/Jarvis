const { useState, useEffect } = React;

function HomePage({ enabledApps }) {
  const [dashData,     setDashData]     = useState(null);
  const [weather,      setWeather]      = useState(null);
  const [greeting,     setGreeting]     = useState("");
  const [greetLoading, setGreetLoading] = useState(true);
  const [newsSnippets, setNewsSnippets] = useState([]);

  useEffect(() => {
    api("/api/dashboard").then(setDashData).catch(() => {});
    api("/api/weather").then(setWeather).catch(() => {});
    api("/api/home/greeting").then(d => { setGreeting(d.greeting || ""); setGreetLoading(false); }).catch(() => setGreetLoading(false));
    api("/api/news").then(news => {
      const items = [];
      Object.values(news).forEach(feeds =>
        Object.values(feeds).forEach(f => { if (f.items?.length) items.push({ src: f.name, title: f.items[0].title, link: f.items[0].link }); })
      );
      setNewsSnippets(items.slice(0, 3));
    }).catch(() => {});
  }, []);

  async function markDone(id) {
    await jsonPatch(`/api/reminders/${id}/done`);
    setDashData(d => d ? { ...d, reminders: d.reminders.filter(r => r.id !== id) } : d);
  }

  if (!dashData) return <PageLoading />;

  const { fitness, reminders = [], weekday, date: dateStr, user_name, period } = dashData;
  const ft = fitness?.today;
  const fy = fitness?.yesterday;

  // Build summary chips from available data
  const fitnessEnabled   = !enabledApps || enabledApps.has("fitness");
  const remindersEnabled = !enabledApps || enabledApps.has("remind");
  const newsEnabled      = !enabledApps || enabledApps.has("news");

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
      {/* Hero section with AI greeting */}
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
              <div key={i} className="hero-chip" style={{ animationDelay: `${i * 0.06}s` }}>
                <span>{c.icon}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Three-column info grid */}
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
                    <div className="hourly-time">{String(h.time).padStart(4, "0").replace(/(\d{2})(\d{2})/, "$1:$2")}</div>
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

        {/* Reminders — only if app enabled */}
        {remindersEnabled && <div className="card">
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
                <button className="reminder-done" onClick={() => markDone(r.id)}>✓</button>
              </div>
            );
          })}
        </div>}

        {/* Top news — only if app enabled */}
        {newsEnabled && <div className="card">
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
        </div>}
      </div>
    </div>
  );
}
