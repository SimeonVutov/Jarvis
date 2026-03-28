// Widgets.jsx — All Home Page widget components
// Each component accepts: cols, rows, preview (bool), enabledApps
// preview=true → static fake data, no API calls (used in the palette)
// WIDGET_COMPONENTS map at the bottom links registry ids → components

const { useState, useEffect } = React;

/* ═══════════════════════════════════════════════════════════════════
   1. Greeting Widget
   ═══════════════════════════════════════════════════════════════════ */
function GreetingWidget({ cols, rows, preview }) {
  const [dash,  setDash]  = useState(null);
  const [greet, setGreet] = useState("");
  const [wthr,  setWthr]  = useState(null);
  const [ldg,   setLdg]   = useState(true);

  useEffect(() => {
    if (preview) { setLdg(false); return; }
    api("/api/dashboard").then(setDash).catch(() => {});
    api("/api/weather").then(setWthr).catch(() => {});
    api("/api/home/greeting")
      .then(d => { setGreet(d.greeting || ""); setLdg(false); })
      .catch(() => setLdg(false));
  }, []);

  if (preview) return (
    <div className="wg-pad" style={{ justifyContent: "center" }}>
      <div className="wg-micro">Saturday, March 21</div>
      <div className="wg-title" style={{ fontSize: 13 }}>
        Good morning — OS exam tomorrow. ☀️ 14° outside. Gym logged.
      </div>
    </div>
  );

  const chips = [];
  if (wthr && !wthr.error)              chips.push({ icon: weatherIcon(wthr.desc), text: `${wthr.temp_c}°` });
  if (dash?.fitness?.today?.calories)   chips.push({ icon: "🔥", text: `${dash.fitness.today.calories} kcal` });
  if (dash?.fitness?.today?.workout)    chips.push({ icon: "🏋️", text: dash.fitness.today.workout });

  return (
    <div className="wg-pad" style={{ justifyContent: "center" }}>
      <div className="wg-micro">{dash?.weekday}, {dash?.date}</div>
      <div className="wg-title" style={{ fontSize: rows > 1 ? 18 : 15 }}>
        {ldg
          ? <><Spinner size={11} style={{ verticalAlign: "middle", marginRight: 6 }} />Thinking…</>
          : greet || `Good ${dash?.period || "day"}, ${dash?.user_name || ""}.`
        }
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 7, marginTop: 6, flexWrap: "wrap" }}>
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

/* ═══════════════════════════════════════════════════════════════════
   2. Weather Widget
   ═══════════════════════════════════════════════════════════════════ */
function WeatherWidget({ cols, rows, preview }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (!preview) api("/api/weather").then(setData).catch(() => {}); }, []);

  if (preview) return (
    <div className="wg-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 300, color: "var(--cyan)", fontFamily: "var(--mono)" }}>14°</div>
        <div>
          <div style={{ fontSize: 12, color: "var(--text)" }}>☀️ Clear sky</div>
          <div style={{ fontSize: 10, color: "var(--text3)" }}>Feels 12° · Den Haag</div>
        </div>
      </div>
    </div>
  );

  if (!data)        return <div className="wg-pad"><div className="wg-empty">Loading…</div></div>;
  if (data.error)   return <div className="wg-pad"><div className="wg-empty">Weather unavailable</div></div>;

  const mini = rows === 1;
  return (
    <div className="wg-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: mini ? 0 : 8 }}>
        <div className="weather-temp" style={{ fontSize: mini ? 26 : 36 }}>{data.temp_c}°</div>
        <div>
          <div className="weather-desc">{weatherIcon(data.desc)} {data.desc}</div>
          <div className="weather-sub">Feels {data.feels_like}° · {data.humidity}% · {data.wind_kmph} km/h</div>
          {!mini && <div className="weather-sub">↑{data.max_c}° ↓{data.min_c}°</div>}
        </div>
      </div>
      {!mini && data.hourly && (
        <div className="hourly-list" style={{ marginTop: 4 }}>
          {data.hourly.map((h, i) => (
            <div key={i} className="hourly-item">
              <div className="hourly-time">{String(h.time).padStart(4,"0").replace(/(\d{2})(\d{2})/,"$1:$2")}</div>
              <div className="hourly-temp">{h.temp}°</div>
              <div>{weatherIcon(h.desc)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. Fitness Today Widget
   ═══════════════════════════════════════════════════════════════════ */
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
      date: new Date().toISOString().slice(0,10),
      calories: cal ? +cal : null,
      weight:   wt  ? +wt  : null,
      workout:  wo  || null,
    }).catch(() => {});
    setSaving(false); setLogOpen(false); setCal(""); setWt(""); setWo("");
    api("/api/dashboard").then(setDash).catch(() => {});
  }

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Fitness — Today</div>
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
        <div><span className="wg-big" style={{ color:"var(--cyan)" }}>2100</span><span className="wg-micro"> kcal</span></div>
        <div><span className="wg-big" style={{ color:"var(--orange)" }}>84.0</span><span className="wg-micro"> kg</span></div>
        <span className="wg-micro">🏋️ chest</span>
      </div>
    </div>
  );

  const ft = dash?.fitness?.today;
  const showLog = rows > 1;

  return (
    <div className="wg-pad" style={{ gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="wg-micro">Fitness — Today</div>
        {showLog && (
          <button className="btn btn-ghost btn-sm" style={{ padding:"1px 8px",fontSize:11 }}
            onClick={() => setLogOpen(l => !l)}>
            {logOpen ? "Cancel" : "+ Log"}
          </button>
        )}
      </div>
      {ft ? (
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"baseline" }}>
          {ft.calories && <div><span className="wg-big" style={{color:"var(--cyan)"}}>{ft.calories}</span><span className="wg-micro"> kcal</span></div>}
          {ft.weight   && <div><span className="wg-big" style={{color:"var(--orange)"}}>{ft.weight}</span><span className="wg-micro"> kg</span></div>}
          {ft.workout  && <span className="wg-micro">🏋️ {ft.workout}</span>}
        </div>
      ) : (
        <div className="wg-empty">Nothing logged today</div>
      )}
      {logOpen && showLog && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
          <input className="input" placeholder="kcal"    value={cal} onChange={e=>setCal(e.target.value)} style={{width:64}} />
          <input className="input" placeholder="kg"      value={wt}  onChange={e=>setWt(e.target.value)}  style={{width:56}} />
          <input className="input" placeholder="workout" value={wo}  onChange={e=>setWo(e.target.value)}  style={{flex:1,minWidth:80}} />
          <button className="btn btn-primary btn-sm" onClick={log} disabled={saving||(!cal&&!wt&&!wo)}>
            {saving ? "…" : "Log"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. Fitness Chart Widget
   ═══════════════════════════════════════════════════════════════════ */
function FitnessChartWidget({ cols, rows, preview }) {
  const [items, setItems] = useState([]);
  useEffect(() => { if (!preview) api("/api/fitness?period=week").then(setItems).catch(() => {}); }, []);

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Weekly Fitness</div>
      <div style={{ fontSize:11, color:"var(--text3)", marginTop:8, fontFamily:"var(--mono)" }}>
        Calorie & weight chart — 7 days
      </div>
    </div>
  );

  return (
    <div className="wg-pad" style={{ height:"100%" }}>
      <div className="wg-micro" style={{ marginBottom:6 }}>Weekly Fitness</div>
      <div style={{ flex:1, minHeight:0 }}>
        <FitnessChart items={items} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. Reminders Widget
   ═══════════════════════════════════════════════════════════════════ */
function RemindersWidget({ cols, rows, preview }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!preview) api("/api/reminders")
      .then(d => setItems((d||[]).slice(0, rows > 1 ? 6 : 1)))
      .catch(() => {});
  }, []);

  async function done(id) {
    await jsonPatch(`/api/reminders/${id}/done`);
    setItems(p => p.filter(r => r.id !== id));
  }

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Upcoming</div>
      {[{t:"Submit OS report",d:"In 2d"},{t:"Gym — leg day",d:"Today"}].map((r,i)=>(
        <div key={i} className="reminder-item" style={{margin:"3px 0"}}>
          <span className="reminder-when">{r.d}</span>
          <span className="reminder-title">{r.t}</span>
        </div>
      ))}
    </div>
  );

  // Mini: single row — show only the next reminder
  if (rows === 1) {
    if (!items.length) return <div className="wg-pad"><div className="wg-empty">No upcoming reminders</div></div>;
    const r = items[0]; const d = daysUntil(r.due_date);
    const when = d===0?"TODAY":d===1?"Tomorrow":`In ${d}d`;
    return (
      <div className="wg-pad">
        <div className="wg-micro">Next Reminder</div>
        <div className="reminder-item">
          <span className="reminder-when">{when}</span>
          <span className="reminder-title">{r.title}</span>
          <button className="reminder-done" onClick={()=>done(r.id)}>✓</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wg-pad">
      <div className="wg-micro" style={{marginBottom:6}}>Upcoming Reminders</div>
      {items.length===0 && <div className="wg-empty">No upcoming reminders</div>}
      {items.map(r => {
        const d = daysUntil(r.due_date);
        const cls = d<=1?"urgent":d<=3?"soon":"";
        const when = d===0?"TODAY":d===1?"Tomorrow":d<0?`${Math.abs(d)}d overdue`:`In ${d}d`;
        return (
          <div key={r.id} className={`reminder-item ${cls}`} style={{marginBottom:4}}>
            <span className="reminder-when">{when}</span>
            <span className="reminder-title">{r.title}</span>
            <button className="reminder-done" onClick={()=>done(r.id)}>✓</button>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   6. Calendar Today Widget
   ═══════════════════════════════════════════════════════════════════ */
function CalendarTodayWidget({ cols, rows, preview }) {
  const [data, setData] = useState({ tasks:[], events:[] });

  useEffect(() => {
    if (preview) return;
    const today = new Date().toISOString().slice(0,10);
    api(`/api/calendar/items?date=${today}`)
      .then(d => setData(d || { tasks:[], events:[] }))
      .catch(() => {});
  }, []);

  async function toggleDone(id, done) {
    await jsonPatch(`/api/calendar/tasks/${id}/done`);
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id===id ? {...t, done:!done} : t) }));
  }

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Today's Schedule</div>
      {[{t:"OS lecture notes",done:false},{t:"Submit assignment",done:true}].map((t,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",fontSize:11,borderBottom:"1px solid rgba(26,45,74,.3)"}}>
          <span style={{color:t.done?"var(--green)":"var(--text3)"}}>{t.done?"✓":"○"}</span>
          <span style={{color:"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.t}</span>
        </div>
      ))}
      <div style={{fontSize:11,color:"var(--cyan)",marginTop:4}}>◈ PostNL 19:00–19:10</div>
    </div>
  );

  const LEVEL_CLR = { high:"var(--red)", mid:"var(--orange)", low:"var(--text3)", not_important:"var(--border2)" };
  const nothing = data.tasks.length===0 && data.events.length===0;

  return (
    <div className="wg-pad">
      <div className="wg-micro" style={{marginBottom:6}}>Today's Schedule</div>
      {nothing && <div className="wg-empty">Nothing scheduled today</div>}
      {data.tasks.map(t => (
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0",borderBottom:"1px solid rgba(26,45,74,.3)"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:LEVEL_CLR[t.level]||"var(--text3)",flexShrink:0}} />
          <span style={{flex:1,fontSize:12,color:"var(--text)",textDecoration:t.done?"line-through":"none",opacity:t.done?.6:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
          <button onClick={()=>toggleDone(t.id,t.done)} style={{background:"none",border:"none",cursor:"pointer",color:t.done?"var(--green)":"var(--text3)",fontSize:13,padding:"0 2px"}}>{t.done?"✓":"○"}</button>
        </div>
      ))}
      {data.events.map(e => (
        <div key={e.id} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0",borderBottom:"1px solid rgba(26,45,74,.3)"}}>
          <span style={{fontSize:10,color:"var(--cyan)",fontFamily:"var(--mono)",flexShrink:0}}>{e.start_time||"all"}</span>
          <span style={{flex:1,fontSize:12,color:"var(--cyan)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>◈ {e.title}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   7. News Headlines Widget
   ═══════════════════════════════════════════════════════════════════ */
function NewsWidget({ cols, rows, preview }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (preview) return;
    api("/api/news").then(news => {
      const all = [];
      Object.values(news||{}).forEach(feeds =>
        Object.values(feeds).forEach(f => {
          if (f.items?.length) all.push({ src:f.name, title:f.items[0].title, link:f.items[0].link });
        })
      );
      setItems(all.slice(0, rows>1 ? 6 : 3));
    }).catch(() => {});
  }, []);

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Latest Headlines</div>
      {["EU announces new AI regulations","Dutch housing market hits record","NVDA reports record earnings"].map((t,i)=>(
        <div key={i} style={{fontSize:11,color:"var(--text2)",padding:"3px 0",borderBottom:"1px solid rgba(26,45,74,.3)"}}>{t}</div>
      ))}
    </div>
  );

  return (
    <div className="wg-pad">
      <div className="wg-micro" style={{marginBottom:6}}>Latest Headlines</div>
      {items.length===0 && <div className="wg-empty">No news sources configured</div>}
      {items.map((n,i) => (
        <div key={i} style={{padding:"4px 0",borderBottom:"1px solid rgba(26,45,74,.3)"}}>
          <div style={{fontSize:9,color:"var(--cyan)",fontFamily:"var(--mono)",marginBottom:1}}>{n.src}</div>
          <a href={n.link||"#"} target="_blank" rel="noreferrer"
            style={{fontSize:12,color:"var(--text)",textDecoration:"none",lineHeight:1.3,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:rows===1?"nowrap":"normal"}}>
            {n.title}
          </a>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   8. Journal Widget
   ═══════════════════════════════════════════════════════════════════ */
function JournalWidget({ cols, rows, preview }) {
  const [entries, setEntries] = useState([]);
  const [draft,   setDraft]   = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!preview) api("/api/journal?limit=8").then(setEntries).catch(() => {});
  }, []);

  async function save() {
    const t = draft.trim(); if (!t) return;
    setPosting(true);
    await jsonPost("/api/journal", { content: t }).catch(() => {});
    setDraft(""); setPosting(false);
    api("/api/journal?limit=8").then(setEntries).catch(() => {});
  }

  async function del(id) {
    await httpDel(`/api/journal/${id}`).catch(() => {});
    setEntries(e => e.filter(x => x.id !== id));
  }

  if (preview) return (
    <div className="wg-pad">
      <div className="wg-micro">Personal Notes</div>
      <div style={{fontSize:10,color:"var(--text3)",padding:"5px 0",borderBottom:"1px solid rgba(26,45,74,.3)"}}>Write a note, thought, or log…</div>
      <div style={{fontSize:11,color:"var(--text2)",padding:"3px 0"}}>Today · Reviewed OS scheduling chapter, need to re-read…</div>
    </div>
  );

  const showEntries = rows >= 3;

  return (
    <div className="wg-pad" style={{gap:8}}>
      <div className="wg-micro">Personal Notes</div>
      <textarea
        className="input" value={draft} onChange={e=>setDraft(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))save();}}
        placeholder="Write a note… (Ctrl+Enter to save)"
        rows={2} style={{resize:"vertical",fontSize:12,fontFamily:"var(--mono)",width:"100%"}}
      />
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={posting||!draft.trim()}>
          {posting?"Saving…":"Save"}
        </button>
      </div>
      {showEntries && entries.map(e => (
        <div key={e.id} style={{padding:"5px 0",borderBottom:"1px solid rgba(26,45,74,.3)",display:"flex",gap:8,alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:2}}>
              {new Date(e.ts).toLocaleDateString("en-GB",{day:"numeric",month:"short"})} · {timeAgo(e.ts)}
            </div>
            <div style={{fontSize:12,color:"var(--text)",lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{e.content}</div>
          </div>
          <button onClick={()=>del(e.id)} style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",fontSize:11,padding:"2px 4px",flexShrink:0}}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   9. Quick Stats Widget
   ═══════════════════════════════════════════════════════════════════ */
function QuickStatsWidget({ cols, rows, preview }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (!preview) api("/api/stats").then(setData).catch(() => {}); }, []);

  if (preview) return (
    <div className="wg-pad" style={{flexDirection:"row",gap:16,alignItems:"center",flexWrap:"wrap"}}>
      {[["248","Sessions"],["1.2k","Messages"],["89","Memories"]].map(([n,l])=>(
        <div key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,color:"var(--cyan)",fontFamily:"var(--mono)"}}>{n}</div>
          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)",letterSpacing:1}}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );

  const t = data?.totals || {};
  const stats = [["Sessions",t.sessions||0],["Messages",t.messages||0],["Memories",t.memories||0]];
  if (cols >= 6) stats.push(["Journal",t.journal||0]);

  return (
    <div className="wg-pad" style={{flexDirection:"row",gap:18,alignItems:"center",flexWrap:"wrap"}}>
      {stats.map(([l,n])=>(
        <div key={l} style={{textAlign:"center",minWidth:48}}>
          <div style={{fontSize:24,fontWeight:700,color:"var(--cyan)",fontFamily:"var(--mono)",lineHeight:1}}>{n}</div>
          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)",letterSpacing:1,marginTop:3}}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Component map — must be defined AFTER all component functions above.
   Key matches the id field in WIDGET_REGISTRY (widgets.js).
   To add a new widget: define the component above, add it here.
   ═══════════════════════════════════════════════════════════════════ */
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
