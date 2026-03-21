const { useState, useEffect, useRef } = React;

const HOUR_H      = 60;
const DAYS_LABEL  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const PRIO_ORDER  = { high:0, mid:1, low:2 };
const DEF_COLORS  = { high:"#ef4444", mid:"#f59e0b", low:"#64748b" };

// ── Pure helpers ───────────────────────────────────────────────────────────────

function timeToMin(t) { if(!t)return 0; const[h,m]=t.split(":").map(Number); return h*60+m; }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function firstDow(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }

function buildGrid(year, month) {
  const dim=daysInMonth(year,month), fdow=firstDow(year,month);
  const pm=month===0?11:month-1, py=month===0?year-1:year;
  const nm=month===11?0:month+1, ny=month===11?year+1:year;
  const dipm=daysInMonth(py,pm);
  const fmt=(d,y2,m2)=>`${y2}-${String(m2+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const cells=[];
  for(let i=fdow-1;i>=0;i--) cells.push({dateStr:fmt(dipm-i,py,pm),day:dipm-i,cur:false});
  for(let d=1;d<=dim;d++)     cells.push({dateStr:fmt(d,year,month),day:d,cur:true});
  let nd=1;
  while(cells.length<42){ cells.push({dateStr:fmt(nd,ny,nm),day:nd,cur:false}); nd++; }
  return cells;
}

function computeLayout(items) {
  if(!items.length)return[];
  const sorted=[...items].sort((a,b)=>a.startMin-b.startMin);
  const groups=[];
  let grp=[sorted[0]],maxEnd=sorted[0].endMin;
  for(let i=1;i<sorted.length;i++){
    if(sorted[i].startMin<maxEnd){grp.push(sorted[i]);maxEnd=Math.max(maxEnd,sorted[i].endMin);}
    else{groups.push(grp);grp=[sorted[i]];maxEnd=sorted[i].endMin;}
  }
  groups.push(grp);
  const layout={};
  for(const g of groups){
    const cols=[];
    for(const item of g){
      const key=`${item._type}_${item.id}`;
      let col=cols.findIndex(e=>e<=item.startMin);
      if(col===-1){col=cols.length;cols.push(item.endMin);}else cols[col]=item.endMin;
      layout[key]={col,total:0};
    }
    for(const item of g) layout[`${item._type}_${item.id}`].total=cols.length;
  }
  return sorted.map(item=>({
    ...item,
    col:      layout[`${item._type}_${item.id}`]?.col   ??0,
    totalCols:layout[`${item._type}_${item.id}`]?.total ??1,
  }));
}

// ── ItemModal ─────────────────────────────────────────────────────────────────

function ItemModal({modal,groups,pColors,onClose,onSave}){
  const isEdit=modal.mode==="edit", isTask=modal.type==="task";
  const[form,setForm]=useState({
    title:modal.data?.title||"", description:modal.data?.description||"",
    date:modal.data?.date||new Date().toISOString().slice(0,10),
    start_time:modal.data?.start_time||"", end_time:modal.data?.end_time||"",
    duration_minutes:modal.data?.duration_minutes||"",
    priority:modal.data?.priority||"mid", group_id:modal.data?.group_id||"",
  });
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  async function submit(){
    if(!form.title.trim()){alert("Title required");return;}
    const payload={title:form.title.trim(),description:form.description.trim(),date:form.date,priority:form.priority};
    if(isTask){
      if(form.start_time)       payload.start_time=form.start_time;
      if(form.duration_minutes) payload.duration_minutes=parseInt(form.duration_minutes);
      if(form.group_id)         payload.group_id=parseInt(form.group_id);
    } else {
      payload.start_time=form.start_time;
      payload.end_time=form.end_time;
    }
    await onSave(isEdit?modal.data.id:null,payload);
  }
  const overnight=!isTask&&form.start_time&&form.end_time&&form.end_time<form.start_time;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:24,width:460,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--cyan)",fontFamily:"var(--head)",marginBottom:16}}>
          {isEdit?"Edit":"New"} {isTask?"Task":"Event"}
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>TITLE</div>
          <input className="input" value={form.title} onChange={e=>f("title",e.target.value)} autoFocus />
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>DESCRIPTION</div>
          <textarea className="input" value={form.description} onChange={e=>f("description",e.target.value)} rows={2} style={{resize:"vertical"}} />
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>DATE</div>
          <input className="input" type="date" value={form.date} onChange={e=>f("date",e.target.value)} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>{isTask?"START (opt)":"START"}</div>
            <input className="input" type="time" value={form.start_time} onChange={e=>f("start_time",e.target.value)} />
          </div>
          {isTask?(
            <div>
              <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>DURATION (min)</div>
              <input className="input" type="number" min={1} placeholder="60" value={form.duration_minutes} onChange={e=>f("duration_minutes",e.target.value)} />
            </div>
          ):(
            <div>
              <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>END</div>
              <input className="input" type="time" value={form.end_time} onChange={e=>f("end_time",e.target.value)} />
            </div>
          )}
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:6}}>PRIORITY</div>
          <div style={{display:"flex",gap:8}}>
            {["high","mid","low"].map(p=>(
              <button key={p} onClick={()=>f("priority",p)} style={{flex:1,padding:"6px 0",borderRadius:6,fontSize:11,fontFamily:"var(--mono)",
                background:form.priority===p?pColors[p]:"var(--bg3)",color:form.priority===p?"#fff":"var(--text2)",
                border:`1px solid ${form.priority===p?pColors[p]:"var(--border)"}`,cursor:"pointer",fontWeight:form.priority===p?700:400}}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {isTask&&groups.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>GROUP</div>
            <select className="input" value={form.group_id} onChange={e=>f("group_id",e.target.value)}>
              <option value="">No group</option>
              {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        {overnight&&(
          <div style={{fontSize:11,color:"var(--text3)",background:"var(--bg3)",borderRadius:6,padding:"6px 10px",marginBottom:10}}>
            ⏱ Overnight event — shown on both days in the timeline.
          </div>
        )}
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={submit}>{isEdit?"Save":"Create"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── CalendarSettingsPanel ─────────────────────────────────────────────────────

function CalendarSettingsPanel({settings,groups,onSave,onGroupsChange}){
  const[form,setForm]=useState({
    context_days_before: settings.context_days_before ?? 7,
    context_days_ahead:  settings.context_days_ahead  ?? 30,
    priority_labels:     settings.priority_labels     || {high:"High",mid:"Medium",low:"Low"},
    priority_colors:     settings.priority_colors     || {...DEF_COLORS},
  });
  const[ng,setNg]=useState({name:"",color:"#00c8f0"});
  const[saved,setSaved]=useState(false);

  async function save(){
    // Only send the fields the backend SettingsUpdate knows about
    await jsonPut("/api/calendar/settings",{
      context_days_before: form.context_days_before,
      context_days_ahead:  form.context_days_ahead,
    });
    onSave(form);
    setSaved(true);
    setTimeout(()=>setSaved(false),1500);
  }
  async function addGrp(){if(!ng.name.trim())return;await jsonPost("/api/calendar/groups",ng);setNg({name:"",color:"#00c8f0"});onGroupsChange();}
  async function delGrp(id){if(!confirm("Remove group? Tasks will become ungrouped."))return;await httpDel(`/api/calendar/groups/${id}`);onGroupsChange();}

  return(
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title">Calendar Settings</div>

      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--text2)",marginBottom:8}}>AI context window — days sent to the assistant each conversation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>DAYS BEFORE TODAY</div>
            <input className="input" type="number" min={0} max={90}
                   value={form.context_days_before}
                   onChange={e=>setForm(f=>({...f,context_days_before:Math.max(0,parseInt(e.target.value)||0)}))} />
          </div>
          <div>
            <div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)",marginBottom:4}}>DAYS AHEAD</div>
            <input className="input" type="number" min={1} max={90}
                   value={form.context_days_ahead}
                   onChange={e=>setForm(f=>({...f,context_days_ahead:Math.max(1,parseInt(e.target.value)||1)}))} />
          </div>
        </div>
        <div style={{fontSize:10,color:"var(--text3)",marginTop:6}}>
          With these settings the AI will see {form.context_days_before + form.context_days_ahead + 1} days of your calendar per message.
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--text2)",marginBottom:8}}>Priority labels and colours</div>
        {["high","mid","low"].map(p=>(
          <div key={p} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <input type="color" value={form.priority_colors?.[p]||DEF_COLORS[p]}
                   onChange={e=>setForm(f=>({...f,priority_colors:{...f.priority_colors,[p]:e.target.value}}))}
                   style={{width:30,height:28,borderRadius:4,border:"none",cursor:"pointer",background:"none",padding:0}} />
            <input className="input" value={form.priority_labels?.[p]||p}
                   onChange={e=>setForm(f=>({...f,priority_labels:{...f.priority_labels,[p]:e.target.value}}))}
                   style={{flex:1}} placeholder={p} />
          </div>
        ))}
      </div>

      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--text2)",marginBottom:8}}>Task groups</div>
        {groups.map(g=>(
          <div key={g.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,padding:"5px 8px",background:"var(--bg3)",borderRadius:6}}>
            <div style={{width:11,height:11,borderRadius:"50%",background:g.color,flexShrink:0}} />
            <span style={{flex:1,fontSize:12,color:"var(--text)"}}>{g.name}</span>
            <button className="btn btn-danger btn-sm" onClick={()=>delGrp(g.id)}>✕</button>
          </div>
        ))}
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <input type="color" value={ng.color} onChange={e=>setNg(g=>({...g,color:e.target.value}))}
                 style={{width:34,height:32,border:"none",cursor:"pointer",background:"none",padding:0}} />
          <input className="input" placeholder="New group name…" value={ng.name}
                 onChange={e=>setNg(g=>({...g,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addGrp()} style={{flex:1}} />
          <button className="btn btn-primary btn-sm" onClick={addGrp}>Add</button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} style={{minWidth:120}}>
        {saved ? "✓ Saved" : "Save settings"}
      </button>
    </div>
  );
}

// ── CalendarPage ──────────────────────────────────────────────────────────────

function CalendarPage() {
  const now=new Date(), todayS=now.toISOString().slice(0,10);
  const[year,setYear]       =useState(now.getFullYear());
  const[month,setMonth]     =useState(now.getMonth());
  const[sel,setSel]         =useState(todayS);
  const[tasks,setTasks]     =useState([]);
  const[events,setEvents]   =useState([]);
  const[groups,setGroups]   =useState([]);
  const[calCfg,setCalCfg]   =useState({context_days_before:7,context_days_ahead:30,priority_labels:{high:"High",mid:"Medium",low:"Low"},priority_colors:{...DEF_COLORS}});
  const[modal,setModal]     =useState(null);
  const[showCfg,setShowCfg] =useState(false);
  const tlRef=useRef(null);

  useEffect(()=>{loadMonth();},[year,month]);
  useEffect(()=>{loadGroups();loadCfg();},[]);
  useEffect(()=>{if(tlRef.current)tlRef.current.scrollTop=7*HOUR_H;},[sel]);

  async function loadMonth(){
    const data=await api(`/api/calendar/month?year=${year}&month=${month+1}`).catch(()=>({}));
    // Flatten the {dateStr:{tasks,events}} dict → two flat arrays with date injected
    // Backend uses "level" field; frontend uses "priority" — map here
    const allTasks=[], allEvents=[];
    Object.entries(data).forEach(([dateStr,{tasks=[],events=[]}])=>{
      tasks.forEach(t=>allTasks.push({...t,date:dateStr,priority:t.level||t.priority||"low"}));
      events.forEach(e=>allEvents.push({...e,date:e.start_date||dateStr,priority:e.level||e.priority||"low"}));
    });
    setTasks(allTasks); setEvents(allEvents);
  }
  async function loadGroups(){setGroups(await api("/api/calendar/groups").catch(()=>[])); }
  async function loadCfg(){const s=await api("/api/calendar/settings").catch(()=>null);if(s)setCalCfg(s);}

  async function saveTask(id,data){
    // Map frontend "priority" → backend "level"
    const payload={...data,level:data.priority||data.level||"low"};
    if(id)await jsonPut(`/api/calendar/tasks/${id}`,payload);
    else  await jsonPost("/api/calendar/tasks",payload);
    loadMonth(); setModal(null);
  }
  async function saveEvent(id,data){
    // Backend expects start_date not date; map priority→level
    const payload={...data,start_date:data.start_date||data.date,level:data.priority||data.level||"low"};
    if(id)await jsonPut(`/api/calendar/events/${id}`,payload);
    else  await jsonPost("/api/calendar/events",payload);
    loadMonth(); setModal(null);
  }
  async function delTask(id){if(!confirm("Delete task?"))return;await httpDel(`/api/calendar/tasks/${id}`);loadMonth();}
  async function delEvent(id){if(!confirm("Delete event?"))return;await httpDel(`/api/calendar/events/${id}`);loadMonth();}
  async function toggleDone(task){
    await jsonPatch(`/api/calendar/tasks/${task.id}/done`,{done:!task.done});
    setTasks(p=>p.map(t=>t.id===task.id?{...t,done:!task.done}:t));
  }

  const pColor=p=>calCfg.priority_colors?.[p]||DEF_COLORS[p];
  const pLabel=p=>calCfg.priority_labels?.[p]||p;
  const gColor=gid=>groups.find(g=>g.id===gid)?.color||null;
  const gName =gid=>groups.find(g=>g.id===gid)?.name||null;

  function prevM(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}
  function nextM(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}

  function cellItems(dateStr){
    return[
      ...events.filter(e=>e.date===dateStr).map(e=>({...e,_type:"event"})),
      ...tasks .filter(t=>t.date===dateStr).map(t=>({...t,_type:"task"})),
    ].sort((a,b)=>PRIO_ORDER[a.priority]-PRIO_ORDER[b.priority]).slice(0,3);
  }

  // Timeline items
  const selTasks  =tasks .filter(t=>t.date===sel);
  const selEvents =events.filter(e=>e.date===sel);
  const untimedTasks=selTasks.filter(t=>!t.start_time).sort((a,b)=>PRIO_ORDER[a.priority]-PRIO_ORDER[b.priority]);

  const timedItems=[
    ...selEvents.map(e=>({...e,_type:"event",startMin:timeToMin(e.start_time),endMin:e.end_time<e.start_time?24*60:timeToMin(e.end_time)})),
    ...selTasks.filter(t=>t.start_time).map(t=>({...t,_type:"task",startMin:timeToMin(t.start_time),endMin:t.duration_minutes?timeToMin(t.start_time)+t.duration_minutes:timeToMin(t.start_time)+30})),
  ];

  const prevDate=new Date(new Date(sel+"T12:00:00").getTime()-86400000).toISOString().slice(0,10);
  const prevOverflow=events.filter(e=>e.date===prevDate&&e.end_time<e.start_time).map(e=>({
    ...e,_type:"event",_overflow:true,startMin:0,endMin:timeToMin(e.end_time),
  }));

  const laidOut=computeLayout([...prevOverflow,...timedItems]);
  const cells=buildGrid(year,month);
  const selLabel=new Date(sel+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  return(
    <div className="pad">

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={prevM}>←</button>
        <div style={{fontSize:18,fontWeight:700,color:"var(--text)",fontFamily:"var(--head)",minWidth:190,textAlign:"center"}}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={nextM}>→</button>
        <input type="number" className="input" value={year} onChange={e=>setYear(Number(e.target.value))} style={{width:76,padding:"4px 8px",fontSize:12}} />
        <div style={{flex:1}}/>
        <button className="btn btn-ghost btn-sm" onClick={()=>setModal({mode:"create",type:"task",data:{date:sel}})}>+ Task</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>setModal({mode:"create",type:"event",data:{date:sel}})}>+ Event</button>
        <button className="btn btn-ghost btn-sm" title="Settings" onClick={()=>setShowCfg(s=>!s)}>⚙</button>
      </div>

      {showCfg&&<CalendarSettingsPanel settings={calCfg} groups={groups} onSave={s=>{setCalCfg(s);setShowCfg(false);}} onGroupsChange={loadGroups} />}

      {/* DOW headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
        {DAYS_LABEL.map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:9,fontFamily:"var(--mono)",color:"var(--text3)",padding:"3px 0",letterSpacing:1,textTransform:"uppercase"}}>{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:18}}>
        {cells.map(cell=>{
          const isToday=cell.dateStr===todayS, isSel=cell.dateStr===sel;
          const top=cellItems(cell.dateStr);
          return(
            <div key={cell.dateStr} onClick={()=>setSel(cell.dateStr)}
                 style={{minHeight:80,background:isSel?"rgba(0,200,240,.1)":"var(--bg2)",
                         border:`1px solid ${isToday?"var(--cyan)":isSel?"rgba(0,200,240,.4)":"var(--border)"}`,
                         borderRadius:6,padding:"4px 5px",cursor:"pointer",opacity:cell.cur?1:0.3,transition:"background .1s"}}
                 onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="rgba(255,255,255,.03)";}}
                 onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isSel?"rgba(0,200,240,.1)":"var(--bg2)";}}>
              <div style={{textAlign:"right",fontSize:10,fontFamily:"var(--mono)",color:isToday?"var(--cyan)":"var(--text2)",fontWeight:isToday?700:400,marginBottom:2}}>
                {cell.day}
              </div>
              {top.map((item,i)=>(
                <div key={`${item._type}_${item.id}_${i}`} style={{display:"flex",alignItems:"center",gap:3,marginBottom:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:pColor(item.priority),flexShrink:0}}/>
                  <span style={{fontSize:9,color:"var(--text2)",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",flex:1,
                                textDecoration:item.done?"line-through":"none",opacity:item.done?.6:1}}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Day detail */}
      <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--cyan)",fontFamily:"var(--head)",marginBottom:12}}>{selLabel}</div>

        {/* Untimed tasks */}
        {untimedTasks.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)",letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>Untimed tasks</div>
            {untimedTasks.map(task=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",background:"var(--bg2)",
                                         borderRadius:7,marginBottom:5,borderLeft:`3px solid ${pColor(task.priority)}`}}>
                <input type="checkbox" checked={!!task.done} onChange={()=>toggleDone(task)} style={{cursor:"pointer",flexShrink:0}}/>
                {task.group_id&&<div style={{width:8,height:8,borderRadius:"50%",background:gColor(task.group_id),flexShrink:0}} title={gName(task.group_id)}/>}
                <span style={{flex:1,fontSize:12,color:"var(--text)",textDecoration:task.done?"line-through":"none",opacity:task.done?.6:1}}>{task.title}</span>
                {task.group_id&&<span style={{fontSize:9,color:"var(--text3)"}}>{gName(task.group_id)}</span>}
                <span style={{fontSize:9,color:pColor(task.priority),fontFamily:"var(--mono)",flexShrink:0}}>{pLabel(task.priority)}</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>setModal({mode:"edit",type:"task",data:task})} style={{padding:"1px 6px",fontSize:10}}>✎</button>
                <button className="btn btn-danger btn-sm" onClick={()=>delTask(task.id)} style={{padding:"1px 6px",fontSize:10}}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>24h Timeline</div>
        <div ref={tlRef} style={{height:580,overflowY:"auto",position:"relative",border:"1px solid var(--border)",borderRadius:8,background:"var(--bg2)"}}>
          <div style={{position:"relative",height:24*HOUR_H,display:"flex"}}>

            {/* Hour labels */}
            <div style={{width:46,flexShrink:0,position:"relative",background:"var(--bg2)",zIndex:3}}>
              {Array.from({length:25},(_,h)=>h).map(h=>(
                <div key={h} style={{position:"absolute",top:h*HOUR_H-7,left:0,right:4,fontSize:9,fontFamily:"var(--mono)",color:"var(--text3)",textAlign:"right"}}>
                  {String(h).padStart(2,"0")}:00
                </div>
              ))}
            </div>

            {/* Grid */}
            <div style={{flex:1,position:"relative",marginLeft:4}}>
              {Array.from({length:25},(_,h)=>h).map(h=>(
                <div key={h} style={{position:"absolute",top:h*HOUR_H,left:0,right:0,height:1,
                  background:h%6===0?"rgba(255,255,255,.07)":"rgba(255,255,255,.025)",zIndex:1}}/>
              ))}
              {Array.from({length:24},(_,h)=>h).map(h=>(
                <div key={`hh${h}`} style={{position:"absolute",top:h*HOUR_H+HOUR_H/2,left:0,right:0,height:1,background:"rgba(255,255,255,.015)",zIndex:1}}/>
              ))}

              {/* Now line */}
              {sel===todayS&&(()=>{
                const pct=(now.getHours()*60+now.getMinutes())/(24*60);
                return <div style={{position:"absolute",top:pct*24*HOUR_H,left:0,right:0,height:2,background:"var(--cyan)",zIndex:5,boxShadow:"0 0 6px var(--cyan)"}}/>;
              })()}

              {laidOut.length===0&&untimedTasks.length===0&&(
                <div style={{position:"absolute",top:"40%",left:0,right:0,textAlign:"center",color:"var(--text3)",fontSize:12,userSelect:"none"}}>Nothing scheduled</div>
              )}

              {laidOut.map(item=>{
                const top2=(item.startMin/60)*HOUR_H;
                const height=Math.max(22,((item.endMin-item.startMin)/60)*HOUR_H);
                const wp=100/item.totalCols, lp=item.col*wp;
                const gc=item._type==="task"&&item.group_id?gColor(item.group_id):null;
                const bdr=gc||pColor(item.priority);
                const isOver=!!item._overflow;
                return(
                  <div key={`${item._type}_${item.id}`}
                       style={{position:"absolute",top:top2,left:`calc(${lp}% + 1px)`,
                               width:`calc(${wp}% - 3px)`,height,
                               background:isOver?"rgba(0,200,240,.03)":item._type==="task"?"var(--bg3)":"rgba(0,200,240,.06)",
                               border:`1px solid ${pColor(item.priority)}`,
                               borderLeft:`3px solid ${bdr}`,
                               borderRadius:5,padding:"3px 6px",boxSizing:"border-box",
                               overflow:"hidden",opacity:isOver?.4:item.done?.55:1,zIndex:2}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:1}}>
                      {item._type==="task"&&!isOver&&(
                        <input type="checkbox" checked={!!item.done} onClick={e=>e.stopPropagation()} onChange={()=>toggleDone(item)} style={{flexShrink:0,cursor:"pointer"}}/>
                      )}
                      <span style={{fontSize:10,fontWeight:600,color:"var(--text)",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",flex:1,textDecoration:item.done?"line-through":"none"}}>
                        {item.title}
                      </span>
                      {!isOver&&<>
                        <button onClick={e=>{e.stopPropagation();setModal({mode:"edit",type:item._type,data:item});}}
                                style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",padding:"0 2px",fontSize:9,lineHeight:1}}>✎</button>
                        <button onClick={e=>{e.stopPropagation();item._type==="task"?delTask(item.id):delEvent(item.id);}}
                                style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",padding:"0 2px",fontSize:9,lineHeight:1}}>✕</button>
                      </>}
                    </div>
                    {height>36&&(
                      <div style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--mono)"}}>
                        {item.start_time}{item.end_time?`–${item.end_time}`:""}
                        {item._type==="task"&&item.duration_minutes?` (${item.duration_minutes}m)`:""}
                      </div>
                    )}
                    {height>52&&item.group_id&&(
                      <div style={{fontSize:9,color:gColor(item.group_id)||"var(--text3)",marginTop:2}}>● {gName(item.group_id)}</div>
                    )}
                    {isOver&&height>28&&<div style={{fontSize:9,color:"var(--text3)",fontStyle:"italic"}}>from prev day</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {modal&&(
        <ItemModal modal={modal} groups={groups} pColors={calCfg.priority_colors||DEF_COLORS}
                   onClose={()=>setModal(null)}
                   onSave={modal.type==="task"?saveTask:saveEvent}/>
      )}
    </div>
  );
}
