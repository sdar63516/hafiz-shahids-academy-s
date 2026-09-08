let DB=null,current=null,studentToken=localStorage.getItem('hsa_student_token')||'',timer=null;
let otpExpiresAt=0;
const $=id=>document.getElementById(id); const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
async function api(url,opt={}){opt.headers={...(opt.headers||{}),...(studentToken?{'x-student-token':studentToken}:{})};const r=await fetch(url,opt);let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||'Something went wrong');return j}
async function loadPublic(){DB=await (await fetch('/api/public-state')).json();}
async function loadStudent(){const j=await api('/api/student-state');DB={...DB,...j};current=j.user;localStorage.setItem('hsa_user',JSON.stringify(current));renderHeader();}
function applyBranding(){const logo=DB?.settings?.logo||'/academy-logo.png'; for(const id of ['brandMark','loginBrandMark']){const e=$(id);if(e){e.innerHTML=`<img src="${logo}" alt="Academy logo">`;e.classList.add('logo-mark');}}}
function renderHeader(){applyBranding();if(!current)return;$('ownerPanel')?.classList.toggle('hidden',current.role!=='superadmin');$('userName').textContent=current.name||'Student';$('topAvatar').textContent=(current.name||'S').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();$('notifDot').style.display=(DB.notifications||[]).some(n=>!n.read)?'block':'none'}
function toast(t){const e=$('toast');e.className='toast';e.textContent=t;setTimeout(()=>e.className='',3200)}
function openModal(html){$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')};function closeModal(){clearInterval(timer);$('modal').classList.add('hidden')}
function showAdminLogin(){location.href='/admin.html'}
$('nameForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const r=await fetch('/api/auth/student-id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('studentName').value})});
    const j=await r.json(); if(!r.ok) throw Error(j.error||'Unable to continue');
    localStorage.setItem('hsa_last_student_name', j.name); localStorage.setItem('hsa_last_student_id', j.studentId); $('studentId').value=j.studentId;
    $('studentIdDisplay').textContent=j.studentId;
    $('registrationToken').value=j.registrationToken||'';
    $('studentLoginForm').classList.remove('hidden');
    $('nameForm').classList.add('hidden');
    const isNew=!!j.needsPassword;
    $('studentPassword').value='';
    $('studentPassword').autocomplete=isNew?'new-password':'current-password';
    $('studentPassword').placeholder=isNew?'Create a password (8+ characters)':'Enter your password';
    $('studentPasswordLabel').textContent=isNew?'Create password':'Password';
    $('studentSubmitButton').textContent=isNew?'Create Account & Enter →':'Login to Student Dashboard →';
    $('studentPassword').focus();
    toast(j.isNew?'Student account created. Your Student ID is ready.':'Student found. Enter your password.');
  }catch(err){toast(err.message)}
});
$('studentLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const id=$('studentId').value, password=$('studentPassword').value, regToken=$('registrationToken').value;
    if(password.length < 8){ toast('Please enter a valid password.'); $('studentPassword').focus(); return; }
    let j;
    if(regToken){
      const r=await fetch('/api/auth/student-register-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({registrationToken:regToken,password})});
      j=await r.json(); if(!r.ok) throw Error(j.error||'Unable to create account');
    }else{
      const r=await fetch('/api/auth/student-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:id,password})});
      j=await r.json(); if(!r.ok) throw Error(j.error||'Student ID or password is incorrect');
    }
    studentToken=j.token; localStorage.setItem('hsa_student_token',studentToken); current=j.user;
    await loadPublic(); await loadStudent();
    $('loginGate').classList.add('hidden'); $('app').classList.remove('hidden'); go('home');
  }catch(err){toast(err.message)}
});
function showLastStudentSuggestion(){const n=localStorage.getItem('hsa_last_student_name'),id=localStorage.getItem('hsa_last_student_id');const box=$('lastStudentSuggestion');if(box&&n&&id){box.innerHTML=`<button type="button" class="outline suggestion-btn" onclick="useLastStudent()">Continue as <b>${String(n).replace(/[&<>]/g,'')}</b> · ${id}</button>`;box.classList.remove('hidden')}}
function useLastStudent(){const n=localStorage.getItem('hsa_last_student_name');if(n){$('studentName').value=n;$('nameForm').requestSubmit();}}
function backToName(){$('studentLoginForm').classList.add('hidden');$('nameForm').classList.remove('hidden');$('studentPassword').value='';$('registrationToken').value='';$('studentId').value=''}


// ---------------- Student dashboard navigation helpers ----------------
function course(id){ return (DB?.courses||[]).find(c=>String(c.id)===String(id)); }
function enrollment(courseId){
  return (current?.enrollments||[]).find(e=>String(e.courseId)===String(courseId));
}
function active(courseId){
  if(current?.role==='superadmin') return !!course(courseId);
  const special=String(current?.name||'').toLowerCase().replace(/[^a-z0-9]/g,'')==='hafizshahid';
  if(special) return !!course(courseId);
  const e=enrollment(courseId);
  return !!e && e.status==='active' && new Date(e.endDate)>=new Date();
}
function progress(courseId){
  const value=Number((current?.progress||{})[courseId]||0);
  return Math.max(0,Math.min(100,value));
}
function go(page){
  if(!current){ return; }
  const routes={
    home:renderHome,
    courses:renderCourses,
    purchased:renderPurchased,
    materials:renderMaterials,
    downloads:renderDownloads,
    assignments:renderAssignments,
    live:renderLive,
    certificates:renderCertificates,
    profile:renderProfile,
    settings:renderSettings,
    notifications:renderNotifications
  };
  const render=routes[page]||renderHome;
  const result=render();
  document.querySelectorAll('[data-nav]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.nav===page);
  });
  document.getElementById('sidebar')?.classList.remove('open');
  return result;
}
function toggleSidebar(){
  document.getElementById('sidebar')?.classList.toggle('open');
}
function logout(){
  studentToken='';
  current=null;
  localStorage.removeItem('hsa_student_token');
  localStorage.removeItem('hsa_user');
  document.getElementById('app')?.classList.add('hidden');
  document.getElementById('loginGate')?.classList.remove('hidden');
  document.getElementById('nameForm')?.classList.remove('hidden');
  document.getElementById('studentLoginForm')?.classList.add('hidden');
  document.getElementById('studentName')?.focus();
}

function startLatestPostsSlider(){
  const el=document.getElementById('latestPostsSlider');
  if(!el || el.dataset.autoSlide==='1' || el.children.length<2) return;
  el.dataset.autoSlide='1';
  let timer=setInterval(()=>{
    if(!document.body.contains(el)){clearInterval(timer);return;}
    const card=el.querySelector('.latest-post-card');
    if(!card)return;
    const step=card.getBoundingClientRect().width+12;
    const atEnd=el.scrollLeft+el.clientWidth>=el.scrollWidth-8;
    el.scrollTo({left:atEnd?0:el.scrollLeft+step,behavior:'smooth'});
  },3500);
  el.addEventListener('mouseenter',()=>clearInterval(timer));
  el.addEventListener('touchstart',()=>clearInterval(timer),{passive:true});
}
function latestPostCard(p){return `<article class="latest-post-card"><img src="${p.image||'/shahid.jpg'}" alt="Post"><div class="latest-post-card-body"><b>${p.title||''}</b><p>${p.text||''}</p><small>${new Date(p.createdAt).toLocaleDateString('en-IN')}</small></div></article>`;}
function renderHome(){
  const posts=DB.posts||[];
  const mine=(current.enrollments||[]).filter(e=>e.status==='active');
  const postHtml=posts.slice(0,6).map(latestPostCard).join('')||'<div class="empty">No posts yet.</div>';
  $('content').innerHTML=`<section class="hero reveal"><div class="hero-copy"><div class="eyebrow">HAFIZ SHAHID'S ACADEMY</div><h1>Learn today.<br><span>Grow for life.</span></h1><p>Recorded classes, live Zoom sessions, assignments, study material and certificates — built around your learning journey.</p><div class="row"><button class="primary" onclick="go('courses')">Explore Courses →</button><button class="outline" onclick="go('purchased')">My Learning</button></div><div class="hero-pills"><span>✓ Student ID Login</span><span>✓ Verified Payments</span><span>✓ 80% Certificate</span></div></div><div class="hero-photo" style="background-image:url('${DB.settings.heroImage||'/shahid.jpg'}')"><div class="photo-tag">Hafiz Shahid<br><small>Founder & Educator</small></div></div></section><div class="feature-strip"><div>🎥<b>Recorded Classes</b><span>Upload MP4 or YouTube</span></div><div>📹<b>Live Classes</b><span>Join through Zoom</span></div><div>📝<b>Assignments</b><span>Submit & get graded</span></div><div>🏆<b>Certificates</b><span>Unlock at 80%</span></div></div><div class="page-head"><div><div class="eyebrow">YOUR JOURNEY</div><h1>Welcome, ${current.name||'Student'}</h1><p>Your active courses and latest academy updates.</p></div><button class="outline" onclick="go('notifications')">Notifications</button></div><div class="grid home-main-grid"><div class="card"><h3>Purchased Courses</h3>${mine.length?mine.map(e=>learningCard(e)).join(''):'<div class="empty">No purchased courses yet.<br><button class="primary" style="margin-top:12px" onclick="go(\'courses\')">Find a Course</button></div>'}</div><div class="card latest-posts-card"><div class="latest-posts-head"><h3>Latest Posts</h3><span class="latest-posts-hint">Swipe / slide</span></div><div class="latest-posts-slider" id="latestPostsSlider">${postHtml}</div></div></div>`;
  startLatestPostsSlider();
}
function learningCard(e){const c=course(e.courseId);return `<div class="learning-card"><div class="thumb" style="background-image:url('${c?.image||'/shahid.jpg'}')"></div><div><span class="badge">${c?.category||'Course'}</span><h3>${c?.title||e.courseTitle}</h3><div class="small">Access until ${new Date(e.endDate).toLocaleDateString('en-IN')}</div><div class="progress" style="margin-top:10px"><i style="width:${progress(e.courseId)}%"></i></div><div class="small" style="margin-top:5px">${progress(e.courseId)}% complete</div></div><button class="primary" onclick="openCourse('${e.courseId}')">Continue</button></div>`}
function renderCourses(){const cs=DB.courses||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">ACADEMY CATALOG</div><h1>Explore Courses</h1><p>Choose a course, submit your details and pay securely through the academy QR.</p></div><input class="search" id="courseSearch" placeholder="Search courses…" oninput="filterCourses()"></div><div id="courseGrid" class="course-grid">${cs.map(courseCard).join('')}</div>`}
function courseCard(c){const own=active(c.id),expired=enrollment(c.id)&&!own;return `<article class="course-card reveal"><div class="course-img" style="background-image:url('${c.image||'/shahid.jpg'}')"><span>${c.category}</span>${expired?'<em class="expired">Expired</em>':''}</div><div class="course-body"><h3>${c.title}</h3><div class="small">${c.startDate?'Starts: '+new Date(c.startDate).toLocaleDateString('en-IN'):'Start date not announced'}</div><p>${c.description}</p><div class="meta"><span>★ 4.9</span><span>${c.level}</span><span>${c.duration}</span></div><div class="price"><b>${money(c.price)}</b><s>${money(c.oldPrice)}</s></div><div class="row">${own?`<button class="primary" onclick="openCourse('${c.id}')">Open Course</button>`:`<button class="outline" onclick="viewCourse('${c.id}')">View</button><button class="primary" onclick="startPurchase('${c.id}')">Buy Now</button>`}</div></div></article>`}
function filterCourses(){const q=$('courseSearch').value.toLowerCase();$('courseGrid').innerHTML=DB.courses.filter(c=>(c.title+c.category+c.description).toLowerCase().includes(q)).map(courseCard).join('')}
function viewCourse(id){const c=course(id);openModal(`<div class="eyebrow">${c.category.toUpperCase()}</div><h2>${c.title}</h2><p>${c.description}</p><div class="info-grid"><div class="info"><small>Duration</small><b>${c.duration}</b></div><div class="info"><small>Level</small><b>${c.level}</b></div><div class="info"><small>Lessons</small><b>${c.lessons.length}</b></div><div class="info"><small>Price</small><b>${money(c.price)}</b></div></div><div class="locked"><b>Course access is unlocked after payment verification.</b><br><small>After you pay, upload the real payment screenshot and wait for academy approval.</small></div><button class="primary wide" onclick="startPurchase('${id}')">Continue to Purchase</button>`)}
function startPurchase(id){if(!current)return;const c=course(id);openModal(`<div class="eyebrow">STEP 1 OF 2 • STUDENT DETAILS</div><h2>Join ${c.title}</h2><p>Fill your current details. These details will reach the academy with your payment request.</p><form class="form" onsubmit="submitApplication(event,'${id}')"><label>Full name</label><input id="fn" value="${current.name==='New Student'?'':current.name||''}" required><label>Country</label><select id="ac"><option value="+91">India +91</option><option value="+92">Pakistan +92</option><option value="+1">USA/Canada +1</option><option value="+44">UK +44</option><option value="+971">UAE +971</option></select><label>Current 10-digit mobile number</label><input id="ph" value="${(current.phone||'').replace(/^\+\d+/,'')}" inputmode="numeric" maxlength="10" required><label>Email (optional)</label><input id="em" type="email" value="${current.email||''}"><label>Address</label><input id="addr" placeholder="Village / locality / full address"><label>City / District</label><input id="city"><label>Qualification / class</label><input id="qual"><label>Profile photo</label><input id="pf" type="file" accept="image/*"><button class="primary">Continue to Payment →</button></form>`)}
async function submitApplication(e,id){e.preventDefault();const fd=new FormData();fd.append('courseId',id);fd.append('fullName',$('fn').value);fd.append('country',$('ac').value);fd.append('email',$('em').value);fd.append('address',$('addr').value);fd.append('city',$('city').value);fd.append('qualification',$('qual').value);if($('pf').files[0])fd.append('profile',$('pf').files[0]);try{const j=await api('/api/application',{method:'POST',body:fd});current.name=j.application.fullName;current.email=j.application.email;localStorage.setItem('hsa_user',JSON.stringify(current));openPayment(id,j.application.id)}catch(err){toast(err.message)}}
function openPayment(id,applicationId){const c=course(id);openModal(`<div class="eyebrow">STEP 2 OF 2 • PAYMENT</div><h2>Scan & Pay</h2><p><b>${c.title}</b> — <strong>${money(c.price)}</strong></p><div class="qr-wrap"><img src="/payment-qr.jpg" alt="Academy UPI QR"><b>UPI ID</b><div>${DB.settings.upiId}</div></div><div class="timer" id="payTimer">20:00</div><div class="notice">The QR payment window stays open for <b>20 minutes</b>. Pay from your own UPI app, then upload the actual screenshot and UTR. <b>Access is never unlocked from the screenshot alone.</b></div><form class="form" onsubmit="submitPayment(event,'${id}')"><label>UPI transaction reference / UTR</label><input id="utr" placeholder="Enter UTR / transaction ID"><label>Real payment screenshot</label><input id="shot" type="file" accept="image/*" required><button class="primary">Submit for Verification</button></form>`);startTimer(1200)}
function startTimer(sec){clearInterval(timer);timer=setInterval(()=>{sec--;const e=$('payTimer');if(e)e.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(sec<=0){clearInterval(timer);toast('Payment window expired. Start again if needed.')}},1000)}
async function submitPayment(e,id){e.preventDefault();const fd=new FormData();fd.append('courseId',id);fd.append('utr',$('utr').value);fd.append('screenshot',$('shot').files[0]);try{await api('/api/payment',{method:'POST',body:fd});closeModal();toast('Payment submitted. We will verify the money and unlock your course.');await loadStudent();go('purchased')}catch(err){toast(err.message)}}
function openCourse(id){if(!active(id)){const e=enrollment(id);toast(e?'This course access has expired.':'Please purchase the course first.');return}const c=course(id),e=enrollment(id)||{endDate:'2099-12-31T23:59:59.000Z'};const lessons=c.lessons||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">COURSE WORKSPACE</div><h1>${c.title}</h1><p>Course start: ${c.startDate?new Date(c.startDate).toLocaleDateString('en-IN'):'Available now'} • Access ends ${new Date(e.endDate).toLocaleDateString('en-IN')}</p></div><button class="outline" onclick="go('purchased')">Back</button></div><div class="course-shell"><aside class="card course-outline"><b>Recorded Classes</b><small>${lessons.length} lessons</small><div id="lessonList">${lessons.map((l,i)=>`<button onclick="watchLesson('${id}','${l.id}')">${i+1}. ${l.title}</button>`).join('')||'<div class="empty">No lessons uploaded yet.</div>'}</div></aside><section><div class="player-placeholder locked"><h3>Select a lesson</h3><p>Choose a recorded class from the list.</p></div><div class="course-tabs"><button onclick="renderCourseMaterials('${id}')">Study Material</button><button onclick="renderCourseAssignments('${id}')">Assignments</button><button onclick="renderCourseLive('${id}')">Live Classes</button></div><div id="courseSub"></div></section></div>`;}
function watchLesson(cid,lid){const c=course(cid),l=c.lessons.find(x=>x.id===lid);if(!l)return;const media=l.type==='upload'?`<div class="video-frame"><video controls playsinline preload="metadata" controlsList="nodownload" src="${l.video}"></video></div>`:`<iframe src="${youtubeEmbed(l.video)}" allowfullscreen></iframe>`;$('content').querySelector('.player-placeholder').outerHTML=`<div class="player">${media}<div class="player-body"><b>${l.title}</b><p>${l.description||''}</p></div></div>`;toast('Lesson opened. Mark it complete when you finish.');$('content').querySelector('.course-tabs').insertAdjacentHTML('afterend',`<div class="row" style="margin-top:14px"><button class="primary" onclick="completeLesson('${cid}')">Mark Lesson Complete</button></div>`)}
function youtubeEmbed(url){try{const u=new URL(url);let id=u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop();return `https://www.youtube.com/embed/${id}?rel=0`}catch{return ''}}
async function completeLesson(cid){const p=Math.min(100,progress(cid)+10);try{await api('/api/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:cid,progress:p})});await loadStudent();toast(p>=80?'80% reached — certificate unlocked!':`Progress updated to ${p}%`);openCourse(cid)}catch(err){toast(err.message)}}
function renderCourseMaterials(cid){$('courseSub').innerHTML=(DB.materials||[]).filter(m=>m.courseId===cid).map(m=>`<div class="material-item"><div><b>${m.title}</b><div class="small">${m.originalName}</div></div><a class="primary" href="${m.file}" download>Download</a></div>`).join('')||'<div class="empty">No material uploaded yet.</div>'}
function renderCourseAssignments(cid){const arr=(DB.assignments||[]).filter(a=>a.courseId===cid);$('courseSub').innerHTML=arr.map(a=>{const s=DB.submissions.find(x=>x.assignmentId===a.id);return `<div class="assignment-item"><div><span class="badge">${a.points} points</span><h3>${a.title}</h3><p>${a.description}</p><small>Due: ${a.dueDate||'No date'} ${s?`• ${s.status} ${s.score!==null?'• '+s.score+'/'+a.points:''}`:''}</small></div><button class="primary" onclick="submitAssignment('${a.id}')">${s?'Update':'Submit'}</button></div>`}).join('')||'<div class="empty">No assignments yet.</div>'}
function renderCourseLive(cid){$('courseSub').innerHTML=(DB.liveClasses||[]).filter(l=>l.courseId===cid).map(l=>`<div class="live-item"><div><b>${l.title}</b><div class="small">${l.date} • ${l.time}</div></div><a class="primary" href="${l.zoom}" target="_blank">Join Zoom</a></div>`).join('')||'<div class="empty">No live class scheduled.</div>'}
function receiptButton(e){const r=(DB.receipts||[]).find(x=>x.paymentId===e.paymentId);return r?`<button class="outline" onclick="window.open('/api/receipt/${r.id}','_blank')">Receipt</button>`:''}
function renderPurchased(){$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">MY LEARNING</div><h1>Purchased Courses</h1><p>Only verified and currently active courses are available here.</p></div></div><div class="course-grid">${(current.enrollments||[]).map(e=>{const c=course(e.courseId),ok=active(e.courseId);return `<article class="course-card"><div class="course-img" style="background-image:url('${c?.image||'/shahid.jpg'}')"><span>${ok?'ACTIVE':'EXPIRED'}</span></div><div class="course-body"><h3>${c?.title||e.courseTitle}</h3><div class="small">Joined: ${new Date(e.joiningDate).toLocaleDateString('en-IN')}</div><div class="small">Ends: ${new Date(e.endDate).toLocaleDateString('en-IN')}</div><div class="progress" style="margin:13px 0"><i style="width:${progress(e.courseId)}%"></i></div><div class="row">${ok?`<button class="primary" onclick="openCourse('${e.courseId}')">Continue Learning</button>`:`<button class="outline" disabled>Access Closed</button>`}${receiptButton(e)}</div></div></article>`}).join('')||'<div class="empty">No purchased courses yet.</div>'}</div>`}
function renderMaterials(){const arr=DB.materials||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">RESOURCES</div><h1>Study Material</h1></div></div><div class="material-list">${arr.map(m=>`<div class="material-item"><div><span class="badge">${course(m.courseId)?.title||''}</span><h3>${m.title}</h3><small>${m.originalName}</small></div><a class="primary" href="${m.file}" download>Download</a></div>`).join('')||'<div class="empty">No study material for your active courses.</div>'}</div>`}
function renderDownloads(){renderMaterials()}
function renderAssignments(){const arr=DB.assignments||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">PRACTICE</div><h1>Assignments</h1></div></div><div class="assignment-list">${arr.map(a=>{const s=DB.submissions.find(x=>x.assignmentId===a.id);return `<div class="assignment-item"><div><span class="badge">${course(a.courseId)?.title||''}</span><h3>${a.title}</h3><p>${a.description}</p><small>Due: ${a.dueDate||'No date'} ${s?`• ${s.status}`:''}</small></div><button class="primary" onclick="submitAssignment('${a.id}')">${s?'Update':'Submit'}</button></div>`}).join('')||'<div class="empty">No assignments available.</div>'}</div>`}
function submitAssignment(id){const a=DB.assignments.find(x=>x.id===id),s=DB.submissions.find(x=>x.assignmentId===id);openModal(`<div class="eyebrow">ASSIGNMENT</div><h2>${a.title}</h2><p>${a.description}</p><form class="form" onsubmit="sendAssignment(event,'${id}')"><label>Your answer</label><textarea id="ans" rows="8" required>${s?.answer||''}</textarea><label>File (optional)</label><input id="afile" type="file"><button class="primary">Submit Assignment</button></form>`)}
async function sendAssignment(e,id){e.preventDefault();const fd=new FormData();fd.append('assignmentId',id);fd.append('answer',$('ans').value);if($('afile').files[0])fd.append('file',$('afile').files[0]);try{await api('/api/assignment/submit',{method:'POST',body:fd});closeModal();await loadStudent();renderAssignments();toast('Assignment submitted!')}catch(err){toast(err.message)}}
function renderLive(){const arr=DB.liveClasses||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">LIVE LEARNING</div><h1>Live Classes</h1><p>Join scheduled Zoom sessions for your active courses.</p></div></div><div class="live-list">${arr.map(l=>`<div class="live-item"><div class="datebox"><b>${new Date(l.date).getDate()}</b><span>${new Date(l.date).toLocaleString('en',{month:'short'})}</span></div><div class="live-main"><span class="badge">${course(l.courseId)?.title||''}</span><h3>${l.title}</h3><small>${l.time}</small></div><a class="primary" href="${l.zoom}" target="_blank">Join Zoom</a></div>`).join('')||'<div class="empty">No live classes scheduled.</div>'}</div>`}
async function renderCertificates(){const j=await api('/api/certificates');$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">ACHIEVEMENT</div><h1>My Certificate</h1><p>Certificates unlock automatically at 80% course completion.</p></div></div>${j.certificates.map(c=>`<div class="certificate card"><div class="cert-badge"><img src="/academy-logo.png" alt="Hafiz Shahid Academy logo"></div><div><div class="eyebrow">CERTIFICATE OF COMPLETION</div><h2>${c.courseTitle}</h2><p>This certifies that <b>${c.studentName}</b> completed at least 80% of the course.</p><div class="small">Certificate No: ${c.certificateNo} • Issued: ${new Date(c.issuedAt).toLocaleDateString('en-IN')}</div></div><button class="primary" onclick="printCertificate(${JSON.stringify(c).replace(/"/g,'&quot;')})">Print</button></div>`).join('')||'<div class="empty">Reach 80% progress to unlock your certificate.</div>'}`}
function printCertificate(c){const w=window.open('','_blank');w.document.write(`<html><head><title>${c.certificateNo}</title><style>body{font-family:Georgia;background:#f4f7fb;padding:40px}.box{background:#fff;border:12px solid #0a1b35;padding:70px;text-align:center;max-width:850px;margin:auto}.gold{color:#c9981b}h1{font-size:42px}</style></head><body><div class="box"><div class="gold">HAFIZ SHAHID'S ACADEMY</div><h1>Certificate of Completion</h1><p>This certificate is proudly presented to</p><h2>${c.studentName}</h2><p>for completing at least 80% of</p><h2 class="gold">${c.courseTitle}</h2><p>Certificate No. ${c.certificateNo}</p><button onclick="window.print()">Print / Save PDF</button></div></body></html>`);w.document.close()}
function renderProfile(){const e=(current.enrollments||[]);$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">MY ACCOUNT</div><h1>About Me</h1><p>Your verified student identity and learning details.</p></div></div><div class="profile"><div class="card profile-side"><img src="${current.profilePhoto||'/shahid.jpg'}"><h3>${current.name}</h3><div class="badge">Verified phone ${current.phone}</div></div><div class="card"><h3>Profile details</h3><form class="form" onsubmit="saveProfile(event)"><label>Full name</label><input id="pn" value="${current.name||''}" required><label>Email</label><input id="pe" type="email" value="${current.email||''}"><label>Country</label><select id="pc"><option value="+91">India +91</option><option value="+92">Pakistan +92</option><option value="+1">USA/Canada +1</option><option value="+44">UK +44</option></select><label>Verified mobile number</label><input id="pp" value="${current.phone||''}" readonly><label>About me</label><textarea id="pa">${current.about||''}</textarea><label>Profile photo</label><input id="pph" type="file" accept="image/*"><button class="primary">Save Profile</button></form></div></div>`}
async function saveProfile(e){e.preventDefault();const fd=new FormData();fd.append('name',$('pn').value);fd.append('email',$('pe').value);fd.append('country',$('pc').value);fd.append('phone',$('pp').value);fd.append('about',$('pa').value);if($('pph').files[0])fd.append('profile',$('pph').files[0]);try{const j=await api('/api/auth/profile',{method:'POST',body:fd});current=j.user;await loadStudent();toast('Profile updated');renderProfile()}catch(err){toast(err.message)}}
function renderSettings(){$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">ACCOUNT</div><h1>Settings</h1><p>Simple controls for your demo account.</p></div></div><div class="card"><h3>Security</h3><p class="small">Your Student ID and password protect your account. Keep your login details private and sign out on shared devices.</p><button class="outline" onclick="logout()">Sign out this device</button></div>`}
function renderNotifications(){const arr=DB.notifications||[];$('content').innerHTML=`<div class="page-head"><div><div class="eyebrow">UPDATES</div><h1>Notifications</h1><p>New classes, material, payments and certificates.</p></div></div><div class="notification-list">${arr.map(n=>`<div class="notification-item"><span class="notif-icon">${n.type==='certificate'?'🏆':n.type==='payment'?'💳':'🔔'}</span><div><b>${n.title}</b><p>${n.text}</p><small>${new Date(n.createdAt).toLocaleString('en-IN')}</small></div></div>`).join('')||'<div class="empty">No notifications.</div>'}</div>`}
async function boot(){
  await loadPublic(); applyBranding(); showLastStudentSuggestion();
  const q=new URLSearchParams(location.search), preview=q.get('adminPreview');
  if(preview){try{const r=await fetch('/api/auth/student-preview?token='+encodeURIComponent(preview));const j=await r.json();if(!r.ok)throw Error(j.error||'Preview expired');studentToken=j.token;localStorage.setItem('hsa_student_token',studentToken);current=j.user;history.replaceState({},'',location.pathname);await loadStudent();$('loginGate').classList.add('hidden');$('app').classList.remove('hidden');go('home');return}catch(err){toast(err.message)}}
  if(studentToken){try{await loadStudent();$('loginGate').classList.add('hidden');$('app').classList.remove('hidden');go('home');return}catch{localStorage.removeItem('hsa_student_token');studentToken=''}}
}
boot();
