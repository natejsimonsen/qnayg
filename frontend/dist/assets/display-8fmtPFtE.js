import{i as l}from"./theme-Dz6HwMwx.js";l();const p=new URLSearchParams(window.location.search),d=p.get("code");d||(window.location.href="/");let i=[];async function u(){const t=await fetch(`/api/events/${d}`);if(!t.ok){document.getElementById("event-name").textContent="Event not found";return}const n=await t.json();document.getElementById("event-name").textContent=n.name,document.title=n.name;const e=await fetch(`/api/events/${d}/questions`);e.ok&&(i=await e.json(),a()),r()}function a(){const t=document.getElementById("questions-list");if(i.length===0){t.innerHTML='<p class="empty-state">Waiting for questions...</p>';return}const n=[...i].sort((e,s)=>s.votes-e.votes);t.innerHTML="",n.forEach((e,s)=>{const o=document.createElement("div");o.className=`display-card ${s===0?"top-question":""}`,o.id=`q-${e.id}`,o.innerHTML=`
      <div class="display-rank">${s+1}</div>
      <div class="display-content">
        <p class="display-text">${c(e.text)}</p>
        <div class="display-meta">
          <span class="display-author">${c(e.author_name)}</span>
          <span class="display-votes">▲ ${e.votes}</span>
        </div>
      </div>
    `,t.appendChild(o)})}function r(){const t=new EventSource(`/api/events/${d}/stream`);t.onmessage=n=>{const e=JSON.parse(n.data);if(e.type==="question_new")i.push(e.question),a();else if(e.type==="vote_updated"){const s=i.find(o=>o.id===e.question_id);s&&(s.votes=e.votes,a())}else e.type==="question_answered"&&(i=i.filter(s=>s.id!==e.question_id),a())},t.onerror=()=>setTimeout(r,3e3)}function c(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}u();
