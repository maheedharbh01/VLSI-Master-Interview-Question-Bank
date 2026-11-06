const TOTAL_QUESTIONS = VLSI_DOMAINS.reduce((n,d)=>n+d.questions.length,0);
const $ = id => document.getElementById(id);
const STORE = {done:"vlsi_master_done_v1", saved:"vlsi_master_saved_v1", theme:"vlsi_master_theme_v1", days:"vlsi_master_days_v1", last:"vlsi_master_last_v1"};
const lsGet = (k,fb)=>{try{const v=localStorage.getItem(k);return v===null?fb:v;}catch(e){return fb;}};
const lsSet = (k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
const lsJSON = (k,fb)=>{try{return JSON.parse(lsGet(k,"")||JSON.stringify(fb));}catch(e){return fb;}};
let completed = new Set(lsJSON(STORE.done,[]));
let bookmarks = new Set(lsJSON(STORE.saved,[]));
let studyDays = new Set(lsJSON(STORE.days,[]));
let currentDomain = null, currentView = "dashboard", qFilter = "all", trackFilter = "all", qotdId = null, toastTimer;

/* ---------- Tracks: every domain belongs to a colour-coded track ---------- */
const TRACKS = [
  {key:"digital",name:"Digital & RTL",emoji:"🧩",c1:"#2f6bff",c2:"#00c2ff",tag:"Logic, HDL, synthesis & circuit fundamentals",ids:[2,3,4,5,9,10]},
  {key:"verif",name:"Verification",emoji:"🧪",c1:"#8b3dff",c2:"#ff4fd8",tag:"UVM, assertions, formal & coverage closure",ids:[6,7,32,34,36]},
  {key:"timing",name:"Timing & Signoff",emoji:"⏱️",c1:"#00b8a9",c2:"#2ee6a8",tag:"STA, SDC, CTS, crosstalk & timing closure",ids:[8,12,23,38,39]},
  {key:"dft",name:"DFT & Test",emoji:"🩺",c1:"#ff3d81",c2:"#ff8a5c",tag:"Scan, ATPG, BIST, ATE & production test",ids:[11,22,27,33]},
  {key:"pd",name:"Physical Design",emoji:"🗺️",c1:"#12b76a",c2:"#4be0a0",tag:"Floorplan, place, route & physical verification",ids:[13,20,25,40]},
  {key:"analog",name:"Analog, RF & Memory",emoji:"📡",c1:"#ff4757",c2:"#ff9f43",tag:"Analog CMOS, data converters, RF & memories",ids:[15,16,17,18]},
  {key:"power",name:"Power & Reliability",emoji:"⚡",c1:"#f5b700",c2:"#ff8a00",tag:"Low power, IR drop, ESD, safety & thermal",ids:[14,19,21,35,41,42,43,49]},
  {key:"soc",name:"SoC, FPGA & Packaging",emoji:"🚀",c1:"#00a8ff",c2:"#6a5cff",tag:"Architecture, FPGA flows, chiplets & 3D ICs",ids:[26,30,31]},
  {key:"device",name:"Device & Process",emoji:"🔬",c1:"#ff6a1a",c2:"#ffb02e",tag:"Semiconductor physics, FinFET/GAA & modeling",ids:[1,24,44,45,50]},
  {key:"mfg",name:"Manufacturing & EDA",emoji:"🏭",c1:"#7ccf00",c2:"#18c964",tag:"Yield, fab, post-silicon debug & EDA algorithms",ids:[28,29,37,46,47,48]}
];
const trackOf = id => TRACKS.find(t=>t.ids.includes(Number(id))) || TRACKS[0];
const trackVars = t => `--c1:${t.c1};--c2:${t.c2}`;
const LEVELS = [
  [0,"Wafer Rookie"],[25,"Transistor Tinkerer"],[100,"Logic Builder"],[250,"RTL Ranger"],[500,"Timing Tamer"],
  [1000,"Silicon Sage"],[2000,"Tapeout Titan"],[3500,"Fab Legend"],[5000,"VLSI Master"]
];

/* ---------- helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const hl = (text,term) => {
  if(!term||term.length<2)return esc(text);
  return String(text??"").split(new RegExp("("+reEsc(term)+")","gi")).map((p,i)=>i%2?`<mark>${esc(p)}</mark>`:esc(p)).join("");
};
const niceName = n => { const s=String(n).trim(); return /[&,\-]$/.test(s)?s.replace(/\s*[&,\-]$/,"")+"…":s; };
const allQuestions = () => VLSI_DOMAINS.flatMap(d=>d.questions.map(q=>({...q,domainId:d.id,domainName:d.name})));
const getQuestion = id => { for(const d of VLSI_DOMAINS){const q=d.questions.find(x=>x.id===id);if(q)return {...q,domainId:d.id,domainName:d.name};}return null; };
const doneIn = d => d.questions.filter(q=>completed.has(q.id)).length;
const percent = d => d.questions.length ? Math.round(doneIn(d)/d.questions.length*100):0;
const todayKey = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const dayKey = off => { const d=new Date(); d.setDate(d.getDate()-off); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
function streak(){ let i=studyDays.has(dayKey(0))?0:1,n=0; while(studyDays.has(dayKey(i))){n++;i++;} return n; }
function levelInfo(done){
  let i=0; for(let k=0;k<LEVELS.length;k++) if(done>=LEVELS[k][0]) i=k;
  const next=LEVELS[i+1]; const base=LEVELS[i][0];
  return {index:i,name:LEVELS[i][1],next,base,pct:next?Math.round((done-base)/(next[0]-base)*100):100};
}
function formatAnswer(answer,term){
  const parts=String(answer??"").split(/(Example \/ follow-up:|Example \/ application:|Example:|Follow-up:)/);
  const meta={"Example / follow-up:":["ex","💡 Example"],"Example:":["ex","💡 Example"],"Example / application:":["app","🛠️ Application"],"Follow-up:":["fu","🎯 Follow-up"]};
  let html=`<p class="ans-main">${hl(parts[0].trim(),term)}</p>`;
  for(let i=1;i<parts.length;i+=2){
    const m=meta[parts[i]],txt=(parts[i+1]||"").trim(); if(!txt)continue;
    html+=`<div class="ans-chip ${m[0]}"><b>${m[1]}</b><span>${hl(txt,term)}</span></div>`;
  }
  return html;
}

/* ---------- state & stats ---------- */
function saveState(){
  lsSet(STORE.done,JSON.stringify([...completed]));lsSet(STORE.saved,JSON.stringify([...bookmarks]));
  lsSet(STORE.days,JSON.stringify([...studyDays]));updateStats();
}
function updateStats(){
  const done=completed.size, saved=bookmarks.size, pct=Math.round(done/TOTAL_QUESTIONS*100), li=levelInfo(done);
  $("completedCount").textContent=done.toLocaleString();$("bookmarkCount").textContent=saved.toLocaleString();
  $("navBookmarks").textContent=saved;$("navCompleted").textContent=done;
  $("sidePercent").textContent=pct+"%";$("sideProgressBar").style.width=pct+"%";
  $("sideProgressText").textContent=`${done.toLocaleString()} of ${TOTAL_QUESTIONS.toLocaleString()} completed`;
  $("sideLevelBadge").textContent="LV "+(li.index+1);$("sideLevelName").textContent=li.name;
  $("levelName").textContent=li.name;$("levelSub").textContent=`Level ${li.index+1} · ${(done*10).toLocaleString()} XP`;
  $("xpBar").style.width=li.pct+"%";
  $("xpText").textContent=li.next?`${li.next[0]-done} more to reach “${li.next[1]}”`:"Maximum level reached — you are a VLSI Master! 🏆";
  $("levelRing").style.setProperty("--p",pct);$("ringText").textContent=pct+"%";
  $("streakCount").textContent=streak();$("xpTotal").textContent=(done*10).toLocaleString();
  $("domainsDone").textContent=VLSI_DOMAINS.filter(d=>percent(d)===100).length;
  const last=lsGet(STORE.last,"");const cb=$("continueBtn");
  const ld=VLSI_DOMAINS.find(d=>String(d.id)===last);
  cb.classList.toggle("hidden",!ld);if(ld)cb.textContent="▶ Continue · Domain "+String(ld.id).padStart(2,"0");
}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400);}

/* ---------- confetti ---------- */
function confetti(count=90){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const cv=$("confetti"),ctx=cv.getContext("2d");cv.width=innerWidth;cv.height=innerHeight;
  const cols=["#ff4fa3","#ff8a3d","#ffd23f","#2ee6a8","#00c2ff","#8b3dff","#ff4757"];
  const ps=Array.from({length:count},()=>({x:innerWidth/2+(Math.random()-.5)*260,y:innerHeight*.62,vx:(Math.random()-.5)*13,vy:-Math.random()*15-5,s:Math.random()*7+4,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:cols[Math.random()*cols.length|0],l:1}));
  (function tick(){
    ctx.clearRect(0,0,cv.width,cv.height);let alive=false;
    for(const p of ps){p.vy+=.42;p.x+=p.vx;p.y+=p.vy;p.vx*=.992;p.r+=p.vr;p.l-=.011;if(p.l>0&&p.y<cv.height+20){alive=true;ctx.save();ctx.globalAlpha=Math.max(p.l,0);ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);ctx.restore();}}
    if(alive)requestAnimationFrame(tick);else ctx.clearRect(0,0,cv.width,cv.height);
  })();
}

/* ---------- renderers ---------- */
function domainCard(d){
  const p=percent(d),t=trackOf(d.id);
  return `<article class="domain-card" data-domain="${d.id}" tabindex="0" role="button" aria-label="Open ${esc(niceName(d.name))}" style="${trackVars(t)}">
    <div class="domain-card-top"><span class="domain-symbol">${t.emoji}</span><span class="domain-number">DOMAIN ${String(d.id).padStart(2,"0")}</span></div>
    <span class="track-pill">${esc(t.name)}</span>
    <h3>${esc(niceName(d.name))}</h3><p>${esc(t.tag)}</p>
    <div class="domain-card-bottom"><span>${d.questions.length} questions · ${doneIn(d)} done</span><b>${p===100?"🏆 Mastered":p+"% →"}</b></div>
    <div class="card-progress"><span style="width:${p}%"></span></div></article>`;
}
function renderDomains(target,arr){$(target).innerHTML=arr.map(domainCard).join("")||`<div class="empty-state"><div class="empty-icon">🔎</div><h3>No domains found</h3><p>Try another search term or track.</p></div>`;}
function renderTracks(){
  $("trackGrid").innerHTML=TRACKS.map(t=>{
    const ds=VLSI_DOMAINS.filter(d=>t.ids.includes(d.id)),tot=ds.reduce((n,d)=>n+d.questions.length,0),dn=ds.reduce((n,d)=>n+doneIn(d),0),p=tot?Math.round(dn/tot*100):0;
    return `<button class="track-tile" data-track="${t.key}" style="${trackVars(t)}"><span class="tt-emoji">${t.emoji}</span><strong>${t.name}</strong><small>${ds.length} domains · ${tot} Qs</small><div class="tt-bar"><span style="width:${p}%"></span></div><em>${p}%</em></button>`;
  }).join("");
  $("trackFilters").innerHTML=`<button class="chip-btn ${trackFilter==="all"?"active":""}" data-track="all" style="--c1:#7c5cff;--c2:#38bdf8">🌈 All tracks</button>`+TRACKS.map(t=>`<button class="chip-btn ${trackFilter===t.key?"active":""}" data-track="${t.key}" style="${trackVars(t)}">${t.emoji} ${t.name}</button>`).join("");
}
function showView(view){
  currentView=view;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const viewEl=$(view+"View");if(viewEl)viewEl.classList.add("active");
  document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const labels={dashboard:"Dashboard",domains:"All domains",questions:currentDomain?niceName(currentDomain.name):"Questions",bookmarks:"Bookmarks",completed:"Completed",search:"Search results"};
  $("breadcrumbs").innerHTML=`<span>Workspace</span><b>/</b><strong>${esc(labels[view]||view)}</strong>`;
  $("sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}
function openDomain(id,keepFilters){
  currentDomain=VLSI_DOMAINS.find(d=>d.id===Number(id));if(!currentDomain)return;
  const t=trackOf(currentDomain.id);
  lsSet(STORE.last,String(currentDomain.id));
  $("questionsView").setAttribute("style",trackVars(t));
  $("bannerEmoji").textContent=t.emoji;
  $("domainEyebrow").textContent="DOMAIN "+String(currentDomain.id).padStart(2,"0")+" · "+t.name.toUpperCase();
  $("domainTitle").textContent=niceName(currentDomain.name);$("domainDescription").textContent=t.tag+" — "+currentDomain.questions.length+" interview questions with answers.";
  $("domainQuestionTotal").textContent=currentDomain.questions.length;
  if(!keepFilters){$("questionSearch").value="";qFilter="all";setTabs();}
  renderDomainQuestions();showView("questions");updateStats();
}
function qCard(q,withDomain=false,term=""){
  const isDone=completed.has(q.id),isSaved=bookmarks.has(q.id),t=trackOf(q.domainId);
  return `<article class="question-card ${isDone?"is-done":""}" id="card-${q.id}" data-qid="${q.id}" style="${trackVars(t)}">
    <button class="question-head" type="button" aria-expanded="false">
      <span class="q-number">${String(q.number).padStart(3,"0")}</span>
      <span class="q-title">${withDomain?`<span class="q-domain">${t.emoji} DOMAIN ${String(q.domainId).padStart(2,"0")} · ${esc(niceName(q.domainName))}</span>`:""}${hl(q.question,term)}</span>
      <span class="question-actions">
        <span class="icon-btn ${isSaved?"saved":""}" data-action="bookmark" title="Bookmark question" role="button" aria-label="Bookmark">${isSaved?"★":"☆"}</span>
        <span class="icon-btn ${isDone?"done":""}" title="${isDone?"Completed":"Not completed"}">${isDone?"✓":"○"}</span>
      </span><span class="q-chevron">⌄</span>
    </button>
    <div class="answer-panel"><div class="answer-label">ANSWER</div><div class="answer-text">${formatAnswer(q.answer,term)}</div>
      <div class="answer-footer">
        <button class="small-action ${isDone?"is-done":""}" data-action="done">${isDone?"✓ Understood":"✓ Mark as understood"}</button>
        <button class="small-action" data-action="copy">▢ Copy answer</button>
        <button class="small-action ${isSaved?"is-saved":""}" data-action="bookmark">${isSaved?"★ Remove bookmark":"☆ Bookmark"}</button>
      </div>
    </div></article>`;
}
function wireQuestionList(container){
  $(container).querySelectorAll(".question-card").forEach(card=>{
    const head=card.querySelector(".question-head");
    head.addEventListener("click",e=>{
      if(e.target.closest('[data-action="bookmark"]')){toggleBookmark(card.dataset.qid);return;}
      const open=card.classList.toggle("open");head.setAttribute("aria-expanded",String(open));
    });
    card.querySelectorAll(".answer-footer [data-action]").forEach(btn=>btn.addEventListener("click",e=>{
      e.stopPropagation();const action=btn.dataset.action,id=card.dataset.qid;
      if(action==="bookmark")toggleBookmark(id);
      if(action==="done")toggleDone(id);
      if(action==="copy"){const q=getQuestion(id);navigator.clipboard?.writeText(`${q.question}\n\n${q.answer}`).then(()=>toast("📋 Question and answer copied")).catch(()=>toast("Clipboard access unavailable"));}
    }));
  });
}
function renderQuestionCards(target,questions,withDomain=false,term=""){
  const el=$(target),openIds=new Set([...el.querySelectorAll(".question-card.open")].map(c=>c.dataset.qid));
  el.innerHTML=questions.map(q=>qCard(q,withDomain,term)).join("");
  el.querySelectorAll(".question-card").forEach(c=>{if(openIds.has(c.dataset.qid)){c.classList.add("open");c.querySelector(".question-head").setAttribute("aria-expanded","true");}});
  wireQuestionList(target);
}
function renderDomainQuestions(){
  const term=$("questionSearch").value.trim().toLowerCase();
  const qs=currentDomain.questions.filter(q=>{
    if(term&&!(q.question+" "+q.answer).toLowerCase().includes(term))return false;
    if(qFilter==="todo")return !completed.has(q.id);
    if(qFilter==="done")return completed.has(q.id);
    if(qFilter==="saved")return bookmarks.has(q.id);
    return true;
  }).map(q=>({...q,domainId:currentDomain.id,domainName:currentDomain.name}));
  renderQuestionCards("questionList",qs,false,term);
  const p=percent(currentDomain);$("domainProgressBar").style.width=p+"%";$("domainProgressText").textContent=p+"% completed";
  $("questionResultCount").textContent=`${qs.length} of ${currentDomain.questions.length} questions`;
  $("listFooterText").textContent=`Showing ${qs.length} questions`;
  if(!qs.length)$("questionList").innerHTML=`<div class="empty-state"><div class="empty-icon">🎉</div><h3>Nothing here</h3><p>No questions match this filter.</p></div>`;
}
function setTabs(){document.querySelectorAll("#qTabs .tab").forEach(b=>b.classList.toggle("active",b.dataset.filter===qFilter));}
function toggleBookmark(id){bookmarks.has(id)?bookmarks.delete(id):bookmarks.add(id);saveState();toast(bookmarks.has(id)?"⭐ Added to bookmarks":"Removed bookmark");refreshCurrentList();}
function toggleDone(id){
  const q=getQuestion(id),before=percent(VLSI_DOMAINS.find(d=>d.id===q.domainId)),lvBefore=levelInfo(completed.size).index;
  if(completed.has(id)){completed.delete(id);toast("Marked as not completed");}
  else{
    completed.add(id);studyDays.add(todayKey());
    const d=VLSI_DOMAINS.find(x=>x.id===q.domainId),lvNow=levelInfo(completed.size);
    if(percent(d)===100&&before<100){confetti(220);toast("🏆 Domain mastered: "+niceName(d.name));}
    else if(lvNow.index>lvBefore){confetti(180);toast(`🎉 Level up! You are now a ${lvNow.name}`);}
    else{confetti(36);toast(["✅ Nice one! +10 XP","🔥 Keep it rolling! +10 XP","⚡ Concept unlocked! +10 XP","🚀 Brilliant! +10 XP"][completed.size%4]);}
  }
  saveState();refreshCurrentList();
}
function refreshCurrentList(){
  if(currentView==="questions")renderDomainQuestions();
  if(currentView==="bookmarks")renderBookmarks();
  if(currentView==="completed")renderCompleted();
  if(currentView==="search")runSearch($("globalSearch").value,true);
  if(currentView==="dashboard")renderDashboard();
  if(currentView==="domains")filterDomains();
}
function renderBookmarks(){
  const qs=[...bookmarks].map(getQuestion).filter(Boolean);
  $("bookmarkEmpty").classList.toggle("hidden",qs.length>0);renderQuestionCards("bookmarkList",qs,true);
}
function renderCompleted(){
  const qs=[...completed].map(getQuestion).filter(Boolean);
  $("completedEmpty").classList.toggle("hidden",qs.length>0);renderQuestionCards("completedList",qs,true);
}
function filterDomains(){
  const term=$("domainSearch").value.toLowerCase().trim();
  const arr=VLSI_DOMAINS.filter(d=>{
    if(trackFilter!=="all"&&trackOf(d.id).key!==trackFilter)return false;
    return !term||(niceName(d.name)+" "+trackOf(d.id).name+" "+trackOf(d.id).tag).toLowerCase().includes(term);
  });
  $("domainResultCount").textContent=`${arr.length} domain${arr.length===1?"":"s"}`;renderDomains("allDomains",arr);renderTracks();
}
function runSearch(term,silent){
  const query=term.trim().toLowerCase();if(!query)return;
  const results=[];
  outer:for(const d of VLSI_DOMAINS){
    for(const q of d.questions){
      if((q.question+" "+q.answer+" "+d.name).toLowerCase().includes(query)){
        results.push({...q,domainId:d.id,domainName:d.name});
        if(results.length>=250)break outer;
      }
    }
  }
  $("searchSummary").textContent=`${results.length}${results.length===250?"+":""} matching questions for “${term}”.`;
  $("searchEmpty").classList.toggle("hidden",results.length>0);renderQuestionCards("searchList",results,true,term.trim());
  if(!silent)showView("search");
}

/* ---------- dashboard extras ---------- */
function pickQotd(shuffle){
  const all=allQuestions();
  if(shuffle||!qotdId){
    if(shuffle){qotdId=all[Math.random()*all.length|0].id;}
    else{let h=0;for(const c of todayKey())h=(h*31+c.charCodeAt(0))>>>0;qotdId=all[h%all.length].id;}
  }
  const q=getQuestion(qotdId),t=trackOf(q.domainId);
  $("qotd").setAttribute("style",trackVars(t));
  $("qotdDomain").textContent=`${t.emoji} Domain ${String(q.domainId).padStart(2,"0")} · ${niceName(q.domainName)}`;
  $("qotdQuestion").textContent=q.question;
  $("qotdAnswer").innerHTML=formatAnswer(q.answer,"");$("qotdAnswer").classList.add("hidden");$("qotdReveal").textContent="Reveal answer";
}
const FEATURED=[10,6,8,13,11,31];
function renderDashboard(){renderDomains("featuredDomains",FEATURED.map(id=>VLSI_DOMAINS.find(d=>d.id===id)).filter(Boolean));renderTracks();}
function openQuestion(id){
  const q=getQuestion(id);if(!q)return;
  openDomain(q.domainId);
  setTimeout(()=>{const c=$("card-"+id);if(!c)return;c.classList.add("open","flash");c.querySelector(".question-head").setAttribute("aria-expanded","true");c.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>c.classList.remove("flash"),2000);},60);
}

/* ---------- theme & init ---------- */
function initTheme(){document.body.classList.toggle("dark",lsGet(STORE.theme,"light")==="dark");updateThemeLabel();}
function updateThemeLabel(){
  const dark=document.body.classList.contains("dark");$("themeText").textContent=dark?"Light theme":"Dark theme";$("themeIcon").textContent=dark?"☀️":"🌙";
}
function init(){
  $("totalDomains").textContent=VLSI_DOMAINS.length;$("totalQuestions").textContent=TOTAL_QUESTIONS.toLocaleString();
  $("domainNavCount").textContent=VLSI_DOMAINS.length;
  initTheme();pickQotd(false);renderDashboard();renderDomains("allDomains",VLSI_DOMAINS);updateStats();
  document.addEventListener("click",e=>{
    const card=e.target.closest(".domain-card");if(card){openDomain(card.dataset.domain);return;}
    const tt=e.target.closest(".track-tile");if(tt){trackFilter=tt.dataset.track;$("domainSearch").value="";filterDomains();showView("domains");return;}
    const cb=e.target.closest(".chip-btn");if(cb){trackFilter=cb.dataset.track;filterDomains();}
  });
  document.addEventListener("keydown",e=>{
    const card=e.target.closest?.(".domain-card");if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openDomain(card.dataset.domain);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("globalSearch").focus();}
    if(e.key==="Escape"){$("globalSearch").blur();$("sidebar").classList.remove("open");}
  });
  document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.addEventListener("click",()=>{
    const v=b.dataset.view;showView(v);if(v==="bookmarks")renderBookmarks();if(v==="completed")renderCompleted();if(v==="domains"){trackFilter="all";filterDomains();}if(v==="dashboard")renderDashboard();
  }));
  $("brandHome").addEventListener("click",e=>{e.preventDefault();renderDashboard();showView("dashboard");});
  $("exploreBtn").addEventListener("click",()=>{trackFilter="all";filterDomains();showView("domains");});
  $("viewAllBtn").addEventListener("click",()=>{trackFilter="all";filterDomains();showView("domains");});
  $("continueBtn").addEventListener("click",()=>openDomain(lsGet(STORE.last,"1")));
  $("randomBtn").addEventListener("click",()=>{const all=allQuestions();openQuestion(all[Math.random()*all.length|0].id);});
  $("randomInDomain").addEventListener("click",()=>{if(!currentDomain)return;qFilter="all";setTabs();$("questionSearch").value="";renderDomainQuestions();openQuestion(currentDomain.questions[Math.random()*currentDomain.questions.length|0].id);});
  $("qotdShuffle").addEventListener("click",()=>pickQotd(true));
  $("qotdReveal").addEventListener("click",()=>{const a=$("qotdAnswer"),h=a.classList.toggle("hidden");$("qotdReveal").textContent=h?"Reveal answer":"Hide answer";});
  $("qotdOpen").addEventListener("click",()=>openQuestion(qotdId));
  $("domainSearch").addEventListener("input",filterDomains);
  $("questionSearch").addEventListener("input",renderDomainQuestions);
  $("qTabs").addEventListener("click",e=>{const b=e.target.closest(".tab");if(!b)return;qFilter=b.dataset.filter;setTabs();renderDomainQuestions();});
  $("backDomains").addEventListener("click",()=>{filterDomains();showView("domains");});
  $("expandAll").addEventListener("click",()=>{$("questionList").querySelectorAll(".question-card").forEach(c=>{c.classList.add("open");c.querySelector(".question-head").setAttribute("aria-expanded","true");});});
  $("collapseAll").addEventListener("click",()=>{$("questionList").querySelectorAll(".question-card").forEach(c=>{c.classList.remove("open");c.querySelector(".question-head").setAttribute("aria-expanded","false");});});
  $("topBtn").addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
  $("themeToggle").addEventListener("click",()=>{const dark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",dark);lsSet(STORE.theme,dark?"dark":"light");updateThemeLabel();});
  $("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter")runSearch(e.target.value);});
  $("globalSearch").addEventListener("input",e=>{if(e.target.value.trim().length>=3)runSearch(e.target.value);});
}
init();
