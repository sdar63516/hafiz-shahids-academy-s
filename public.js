let STATE={courses:[],posts:[],announcements:[],settings:{}};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function money(n){return '₹'+Number(n||0).toLocaleString('en-IN')}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
function date(v){if(!v)return '';const d=new Date(v);return isNaN(d)?'':d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
async function load(){
  try{
    const r=await fetch('/api/public-state',{cache:'no-store'});
    if(!r.ok)throw new Error('Academy server is not responding.');
    STATE=await r.json();
    STATE.courses=Array.isArray(STATE.courses)?STATE.courses:[];
    STATE.posts=Array.isArray(STATE.posts)?STATE.posts:[];
    STATE.announcements=Array.isArray(STATE.announcements)?STATE.announcements:[];
    STATE.settings=STATE.settings||{};
    render();
  }catch(e){
    console.error(e);
    $('#coursesGrid').innerHTML='<div class="loading">Unable to load the academy right now. Please refresh in a moment.</div>';
    toast(e.message);
  }
}
function render(){
  const s=STATE.settings;
  document.title=s.academyName||"Hafiz Shahid's Academy";
  $('#heroTagline').textContent=s.tagline||'Practical learning, clear guidance and useful skills — built for students who want to grow.';
  $('#heroCardTitle').textContent=s.tagline||'Learn • Practice • Grow';
  if(s.heroImage)$('#heroImage').src=s.heroImage;
  $('#aboutTitle').textContent=s.academyName||"Hafiz Shahid's Academy";
  $('#aboutText').textContent=s.about||'A simple place for practical education, skill development and continuous learning.';
  renderCourses();renderUpdates();renderDoubtCourses();
}
function renderDoubtCourses(){
  const el=$('#doubtCourse');
  if(!el)return;
  el.innerHTML='<option value="">General question</option>'+STATE.courses.map(c=>`<option value="${esc(c.id)}">${esc(c.title||'Course')}</option>`).join('');
}
async function submitPublicDoubt(e){
  e.preventDefault();
  const payload={name:$('#doubtName').value.trim(),email:$('#doubtEmail').value.trim(),phone:$('#doubtPhone').value.trim(),courseId:$('#doubtCourse').value,subject:$('#doubtSubject').value.trim(),message:$('#doubtMessage').value.trim()};
  if(!payload.name||!payload.email||!payload.subject||!payload.message){toast('Please fill all required fields.');return}
  const btn=$('#doubtForm button[type="submit"]');
  const old=btn.textContent;btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch('/api/public-doubt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Unable to send your doubt.');
    $('#doubtForm').reset();
    toast('Your doubt has been sent successfully.');
  }catch(err){toast(err.message||'Could not send your doubt.')}
  finally{btn.disabled=false;btn.textContent=old}
}
function renderCourses(){
  const el=$('#coursesGrid');
  if(!STATE.courses.length){el.innerHTML='<div class="loading">Courses will appear here soon.</div>';return}
  el.innerHTML=STATE.courses.map(c=>{
    const img=c.image||'/academy-mark.png';
    const lessons=Array.isArray(c.lessons)?c.lessons.length:0;
    return `<article class="course">
      <div class="course-img"><img src="${esc(img)}" alt="${esc(c.title)}" onerror="this.src='/academy-mark.png'"><span class="tag">${esc(c.category||c.level||'Course')}</span></div>
      <div class="course-body"><h3>${esc(c.title||'Course')}</h3><p>${esc(c.description||'Explore this academy course for structured learning and practical skills.')}</p>
      <div class="meta"><span>${esc(c.level||'All levels')}</span><span>${esc(c.duration||'Flexible')}</span>${lessons?`<span>${lessons} lessons</span>`:''}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span class="price">${money(c.price)}${c.oldPrice?` <del>${money(c.oldPrice)}</del>`:''}</span><button class="btn small" onclick="openCourse('${encodeURIComponent(String(c.id||''))}')">View Details</button></div></div>
    </article>`;
  }).join('');
}
function renderUpdates(){
  const a=[...STATE.announcements].sort((x,y)=>new Date(y.createdAt||0)-new Date(x.createdAt||0));
  const p=[...STATE.posts].sort((x,y)=>new Date(y.createdAt||0)-new Date(x.createdAt||0));
  $('#announcements').innerHTML=a.length?a.map(x=>`<article class="update"><h4>${esc(x.title||'Announcement')}</h4><p>${esc(x.text||'')}</p><span class="date">${date(x.createdAt)}</span></article>`).join(''):'<div class="loading">No announcements yet.</div>';
  $('#posts').innerHTML=p.length?p.map(x=>`<article class="update">${x.image?`<img class="post-image" src="${esc(x.image)}" alt="">`:''}<h4>${esc(x.title||'Academy Post')}</h4><p>${esc(x.text||'')}</p><span class="date">${date(x.createdAt)}</span></article>`).join(''):'<div class="loading">No posts yet.</div>';
}
function openCourse(encoded){
  let id='';try{id=decodeURIComponent(encoded)}catch{id=encoded}
  const c=STATE.courses.find(x=>String(x.id)===String(id));
  if(!c){toast('Course details are unavailable.');return}
  const lessons=Array.isArray(c.lessons)?c.lessons:[];
  $('#modalBody').innerHTML=`<div class="eyebrow">${esc(c.category||'ACADEMY COURSE')}</div><h2 id="modalTitle">${esc(c.title||'Course')}</h2>
  <p style="color:var(--muted);line-height:1.8">${esc(c.description||'')}</p>
  <div class="meta"><span><b>Level:</b> ${esc(c.level||'All levels')}</span><span><b>Duration:</b> ${esc(c.duration||'Flexible')}</span><span><b>Fee:</b> ${money(c.price)}</span></div>
  <h3 style="color:var(--navy)">Course Syllabus</h3>
  ${lessons.length?`<ol class="syllabus">${lessons.map(l=>`<li>${esc(l.title||l.name||'Lesson')}</li>`).join('')}</ol>`:'<p style="color:var(--muted)">Syllabus details will be updated by the academy.</p>'}`;
  $('#courseModal').classList.remove('hidden');document.body.style.overflow='hidden';
}
function closeCourse(){$('#courseModal').classList.add('hidden');document.body.style.overflow=''}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCourse()});
$('#courseModal').addEventListener('click',e=>{if(e.target.id==='courseModal')closeCourse()});
$('#year').textContent=new Date().getFullYear();
load();
