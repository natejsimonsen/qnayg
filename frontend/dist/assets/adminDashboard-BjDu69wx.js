import{i as m}from"./theme-C-Ch8ZGE.js";m();const d=localStorage.getItem("token");d||(window.location.href="/");const c=JSON.parse(localStorage.getItem("user")||"{}");let o=[];async function s(t,n={}){const e=await fetch(t,{...n,headers:{"Content-Type":"application/json",Authorization:`Bearer ${d}`,...n.headers||{}}});return e.status===401?(l(),null):e}function l(){localStorage.removeItem("token"),localStorage.removeItem("user"),window.location.href="/"}async function i(){const t=await s("/api/mod/events");t&&(o=await t.json(),u())}function u(){document.getElementById("user-name").textContent=c.username||"";const t=document.getElementById("users-link");t&&(t.style.display=c.role==="superuser"?"inline-flex":"none");const n=document.getElementById("events-list");if(o.length===0){n.innerHTML='<p class="empty-state">No events yet. Create your first one!</p>';return}n.innerHTML="",o.forEach(e=>{const a=document.createElement("div");a.className="card event-card",a.innerHTML=`
      <div class="event-card-header">
        <div>
          <h3 class="event-name">${g(e.name)}</h3>
          <span class="event-code">Code: <strong>${e.code}</strong></span>
        </div>
        <span class="badge ${e.active?"badge-green":"badge-gray"}">${e.active?"Active":"Inactive"}</span>
      </div>
      <div class="event-card-actions">
        <a href="/event/?id=${e.id}" class="btn btn-primary btn-sm">Manage</a>
        <button onclick="toggleActive(${e.id}, ${!e.active})" class="btn btn-ghost btn-sm">
          ${e.active?"Deactivate":"Activate"}
        </button>
        <button onclick="deleteEvent(${e.id})" class="btn btn-danger btn-sm">Delete</button>
      </div>
    `,n.appendChild(a)})}window.toggleActive=async function(t,n){const e=o.find(a=>a.id===t);e&&(await s(`/api/mod/events/${t}`,{method:"PUT",body:JSON.stringify({name:e.name,active:n})}),i())};window.deleteEvent=async function(t){confirm("Delete this event? This cannot be undone.")&&(await s(`/api/mod/events/${t}`,{method:"DELETE"}),i())};const r=document.getElementById("create-form");r.addEventListener("submit",async t=>{t.preventDefault();const n=document.getElementById("event-name").value.trim();if(!n)return;const e=r.querySelector("[type=submit]");if(e.disabled)return;e.disabled=!0;const a=await s("/api/mod/events",{method:"POST",body:JSON.stringify({name:n})});e.disabled=!1,a&&a.ok&&(document.getElementById("event-name").value="",document.getElementById("create-section").classList.remove("open"),document.getElementById("show-create").classList.remove("active"),i())});document.getElementById("show-create").addEventListener("click",()=>{const t=document.getElementById("create-section"),n=document.getElementById("show-create"),e=!t.classList.contains("open");t.classList.toggle("open",e),n.classList.toggle("active",e)});document.getElementById("logout-btn").addEventListener("click",l);function g(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}i();
