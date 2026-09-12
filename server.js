const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { initStore, load, save, flush, passwordHash } = require('./db');

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const UPLOAD_ROOT = path.join(ROOT, 'uploads');
for (const f of ['videos','materials','assignments','payments','profiles','covers','branding']) fs.mkdirSync(path.join(UPLOAD_ROOT,f), {recursive:true});

// Brevo transactional email integration. The API key stays server-side and is never sent to the browser.
const BREVO_ENDPOINT='https://api.brevo.com/v3/smtp/email';
function brevoConfig(){return {apiKey:String(process.env.BREVO_API_KEY||'').trim(),fromEmail:String(process.env.BREVO_FROM_EMAIL||'').trim(),fromName:String(process.env.BREVO_FROM_NAME||"Hafiz Shahid's Academy").trim()||"Hafiz Shahid's Academy"};}
async function sendBrevoEmail({toEmail,toName,subject,htmlContent,textContent}){
  const cfg=brevoConfig();
  if(!cfg.apiKey)return {ok:false,skipped:true,reason:'BREVO_API_KEY is not configured.'};
  if(!cfg.fromEmail)return {ok:false,skipped:true,reason:'BREVO_FROM_EMAIL is not configured.'};
  if(!toEmail || !/^\S+@\S+\.\S+$/.test(String(toEmail)))return {ok:false,skipped:true,reason:'Recipient email is missing or invalid.'};
  try{
    const r=await fetch(BREVO_ENDPOINT,{method:'POST',headers:{accept:'application/json','api-key':cfg.apiKey,'content-type':'application/json'},body:JSON.stringify({sender:{name:cfg.fromName,email:cfg.fromEmail},to:[{email:String(toEmail).trim(),name:String(toName||'Student').trim()}],subject:String(subject||"Hafiz Shahid's Academy"),htmlContent:String(htmlContent||''),textContent:String(textContent||'')})});
    let body={};try{body=await r.json()}catch{}
    if(!r.ok)return {ok:false,status:r.status,reason:body?.message||body?.error||'Brevo email request failed.'};
    return {ok:true,messageId:body?.messageId||''};
  }catch(e){return {ok:false,reason:e?.message||'Brevo connection failed.'};}
}
async function logBrevoEmail(d,{studentId,toEmail,toName,subject,text,result,type='transactional'}){
  d.messageLogs=d.messageLogs||[];
  d.messageLogs.unshift({id:id('MAIL'),channel:'email',audience:'individual',studentIds:studentId?[studentId]:[],toEmail:String(toEmail||''),toName:String(toName||''),subject:String(subject||''),message:String(text||''),status:result?.ok?'sent':(result?.skipped?'skipped':'failed'),error:result?.reason||'',createdAt:new Date().toISOString(),type});
}
async function sendStudentEmail(d,u,subject,htmlContent,textContent,type='transactional'){
  const result=await sendBrevoEmail({toEmail:u?.email,toName:u?.name,subject,htmlContent,textContent});
  await logBrevoEmail(d,{studentId:u?.id,toEmail:u?.email,toName:u?.name,subject,text:textContent,result,type});
  return result;
}
async function sendCourseClassEmails(d,course,{title,kind,joinUrl,recordingUrl,description}){
  const students=d.users.filter(u=>u.role==='student'&&u.status==='active'&&isActiveEnrollment(d,u,course.id));
  let sent=0,skipped=0;
  for(const u of students){
    if(!u.email){await logBrevoEmail(d,{studentId:u.id,toEmail:'',toName:u.name,subject:`${kind}: ${title}`,text:`${title} — ${course.title}`,result:{skipped:true,reason:'Student email is not saved.'},type:'class-notification'});skipped++;continue;}
    const safeTitle=String(title||'Class').replace(/[<>]/g,''); const safeCourse=String(course.title||'Course').replace(/[<>]/g,'');
    const action=joinUrl?`<p><a href="${joinUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Join Class</a></p>`:recordingUrl?`<p><a href="${recordingUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Open Class</a></p>`:'';
    const text=`Hafiz Shahid's Academy\n\n${kind}: ${safeTitle}\nCourse: ${safeCourse}\n${description||''}\n${joinUrl?`Join: ${joinUrl}`:''}${recordingUrl?`Open: ${recordingUrl}`:''}`;
    const result=await sendStudentEmail(d,u,`${kind} • ${safeCourse}`,`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#12243d"><h2 style="margin:0 0 8px">Hafiz Shahid's Academy</h2><p style="color:#667085">${kind}</p><h1 style="font-size:25px;margin:10px 0">${safeTitle}</h1><p><b>Course:</b> ${safeCourse}</p><p>${String(description||'A new class is now available for your course.').replace(/\n/g,'<br>')}</p>${action}<p style="color:#667085;font-size:13px">This notification was sent automatically by the academy.</p></div>`,text,'class-notification');
    if(result.ok)sent++;else skipped++;
  }
  return {sent,skipped,total:students.length};
}

function id(prefix){ return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; }
function cleanPhone(country, phone){ return `${country||'+91'}${String(phone||'').replace(/\D/g,'')}`; }
function durationDays(text){
  const s=String(text||'').toLowerCase();
  const n=Number((s.match(/\d+/)||['30'])[0]);
  if (s.includes('year')) return n*365;
  if (s.includes('month')) return n*30;
  if (s.includes('week')) return n*7;
  return n || 30;
}
function addDays(date, days){ const d=new Date(date); d.setDate(d.getDate()+days); return d.toISOString(); }
function isActiveEnrollment(d,u,courseId){
  if(u?.role==='superadmin' || hasFullCourseAccess(u)) return !!d.courses.find(c=>c.id===courseId);
  const e=(u.enrollments||[]).find(x=>x.courseId===courseId && x.status==='active');
  return !!e && new Date(e.endDate) >= new Date();
}
function sanitizeUser(u){
  if(!u) return null;
  const {password,otp,passwordHash:_,studentPasswordHash:__,...safe}=u;
  return safe;
}
function hashPassword(password) {
  return passwordHash(String(password));
}
function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hex] = String(stored).split(':');
  try {
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function nextStudentId(d) {
  const nums = d.users.map(u => String(u.id||'').match(/^HSA-(\d{3,})$/i)).filter(Boolean).map(m => Number(m[1]));
  const n = Math.max(0, ...nums) + 1;
  return `HSA-${String(n).padStart(3,'0')}`;
}
function normalizeStudentName(name){
  return String(name||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
}
function hasFullCourseAccess(u){
  return u?.role === 'student' && normalizeStudentName(u.name) === 'hafizshahid';
}
function sameStudentName(a,b){ return normalizeStudentName(a)===normalizeStudentName(b); }
function removeUploadFile(url){
  if(!url || typeof url!=='string' || !url.startsWith('/uploads/')) return;
  const rel=url.replace(/^\/uploads\//,'');
  const target=path.resolve(UPLOAD_ROOT,rel);
  if(target.startsWith(path.resolve(UPLOAD_ROOT)+path.sep)) { try{ if(fs.existsSync(target)) fs.unlinkSync(target); }catch{} }
}
function findStudentByName(d, name) {
  const needle = String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
  if (!needle) return [];
  return d.users.filter(u => u.role === 'student' && u.status !== 'deleted' &&
    String(u.name||'').trim().toLowerCase().replace(/\s+/g,' ') === needle);
}

function publicState(){
  const d=load();
  d.settings=d.settings||{};
  if(!d.settings.siteVersion) d.settings.siteVersion='1.0.0';
  return {settings:d.settings,courses:d.courses,posts:d.posts,announcements:d.announcements};
}
function studentState(u){
  const d=load();
  const owner=u.role==='superadmin';
  const fullAccess=hasFullCourseAccess(u);
  const mine=(owner || fullAccess) ? d.courses.map(c=>({courseId:c.id,courseTitle:c.title,joiningDate:new Date().toISOString(),endDate:'2099-12-31T23:59:59.000Z',status:'active',active:true})) : (u.enrollments||[]).filter(e=>e.status==='active').map(e=>({...e,active:new Date(e.endDate)>=new Date()}));
  const allowed=(owner || fullAccess) ? ()=>true : (cid)=>mine.some(e=>e.courseId===cid && e.active);
  const safeUser=sanitizeUser(u); if(owner||fullAccess){safeUser.enrollments=mine;safeUser.purchased=d.courses.map(c=>c.id);} else {safeUser.enrollments=mine;}
  return {settings:d.settings,courses:d.courses,materials:d.materials.filter(m=>allowed(m.courseId)),assignments:d.assignments.filter(a=>allowed(a.courseId)),submissions:d.submissions.filter(s=>s.studentId===u.id),liveClasses:d.liveClasses.filter(l=>allowed(l.courseId)),announcements:d.announcements,posts:d.posts,notifications:d.notifications.filter(n=>!n.studentId||n.studentId===u.id),receipts:d.receipts.filter(r=>r.studentId===u.id),doubts:(d.doubts||[]).filter(x=>x.studentId===u.id),comments:(d.comments||[]).filter(x=>x.studentId===u.id||allowed(x.courseId)),user:safeUser};
}
function adminState(){
  const d=load();
  return {settings:d.settings,users:d.users.map(sanitizeUser),courses:d.courses,payments:d.payments,applications:d.applications,materials:d.materials,assignments:d.assignments,submissions:d.submissions,liveClasses:d.liveClasses,announcements:d.announcements,posts:d.posts,notifications:d.notifications,receipts:d.receipts,certificates:d.certificates,teachers:d.teachers.map(sanitizeUser),messageLogs:d.messageLogs,doubts:d.doubts||[],comments:d.comments||[]};
}
function requireStudent(req,res,next){ const token=req.headers['x-student-token']; const d=load(); const u=d.users.find(x=>x.sessionToken===token&&(x.role==='student'||x.role==='superadmin')); if(!u)return res.status(401).json({error:'Session expired. Please login again.'}); req.user=u; next(); }
function requireAdmin(req,res,next){ const token=req.headers['x-admin-token']; if(!adminSessions.has(token))return res.status(401).json({error:'Admin login required.'}); req.admin=true; next(); }

const adminSessions=new Set();
const studentSessions=new Set();
const pendingOtps=new Map();
const pendingStudentRegistrations=new Map();
const emailOtpSessions=new Map();
const storage=multer.diskStorage({
 destination:(req,file,cb)=>{
   // Multipart fields are not guaranteed to be parsed before the file field.
   // Always route by the actual field name first so uploads never land in the wrong folder.
   const routeHint=String(req.originalUrl||'');
   const byField={cover:'covers',syllabusFile:'materials',file:(routeHint.includes('/lesson')||req.body.uploadType==='videos'?'videos':'materials'),hero:'branding',logo:'branding',photo:'profiles',screenshot:'payments',imageFile:'materials'};
   let type=byField[file.fieldname] || req.body.uploadType || 'materials';
   if(!['videos','materials','assignments','payments','profiles','covers','branding'].includes(type)) type='materials';
   cb(null,path.join(UPLOAD_ROOT,type));
 },
 filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g,'_')}`)
});
const upload=multer({storage,limits:{fileSize:100*1024*1024}});
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true}));
// Render's local filesystem is ephemeral. Small images that must survive a restart
// are stored in Neon as data URLs. Large videos remain on Cloudinary.
function imageDataUrl(file){
  if(!file || !file.path) return '';
  try {
    const mime=String(file.mimetype||'image/jpeg').split(';')[0];
    if(!mime.startsWith('image/')) return '';
    const data=fs.readFileSync(file.path).toString('base64');
    try{fs.unlinkSync(file.path)}catch{}
    return `data:${mime};base64,${data}`;
  }catch{return '';}
}
function hydrateDurableImages(d){
  let changed=false;
  for(const p of d.posts||[]){
    if(typeof p.image==='string'&&p.image.startsWith('/uploads/materials/')){const file=path.join(ROOT,p.image.replace(/^\//,''));if(fs.existsSync(file)){const data=imageDataUrl({path:file,mimetype:'image/jpeg'});if(data){p.image=data;changed=true;}}}
  }
  for(const p of d.payments||[]){
    if(typeof p.screenshot==='string'&&p.screenshot.startsWith('/uploads/payments/')){const file=path.join(ROOT,p.screenshot.replace(/^\//,''));if(fs.existsSync(file)){const ext=path.extname(file).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';const data=imageDataUrl({path:file,mimetype:mime});if(data){p.screenshot=data;changed=true;}}}
  }
  return changed;
}
app.get('/uploads/covers/:file',(req,res,next)=>{
  const safe=path.basename(req.params.file);
  const cover=path.join(UPLOAD_ROOT,'covers',safe);
  const legacy=path.join(UPLOAD_ROOT,'materials',safe);
  if(fs.existsSync(cover)) return res.sendFile(cover);
  if(fs.existsSync(legacy)) return res.sendFile(legacy);
  next();
});
app.use('/uploads', express.static(UPLOAD_ROOT, {fallthrough:false, maxAge:'1h'}));
// Always make the public student website the root page. Admin remains /admin.html.
app.get('/',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));
app.use((req,res,next)=>{ if(req.path==='/' || /\.(html|js|css|webmanifest)$/.test(req.path)) res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); next(); });
app.use(express.static(ROOT));

// Cloudinary direct-video upload configuration. The browser uploads large videos
// directly to Cloudinary, so Render never has to receive/store the video bytes.
app.get('/api/admin/video-config',requireAdmin,(req,res)=>{
  const cloudName=String(process.env.CLOUDINARY_CLOUD_NAME||'').trim();
  const uploadPreset=String(process.env.CLOUDINARY_UPLOAD_PRESET||'').trim();
  res.json({configured:!!(cloudName&&uploadPreset),cloudName,uploadPreset});
});
app.get('/api/admin/brevo-status',requireAdmin,(req,res)=>{const c=brevoConfig();res.json({configured:!!(c.apiKey&&c.fromEmail),senderEmail:c.fromEmail?c.fromEmail.replace(/(^.).*(@.*$)/,'$1***$2'):'',senderName:c.fromName});});

// Chunked video upload: keeps the admin UI responsive and avoids one huge request timing out.
const videoUploads=new Map();
app.post('/api/admin/video-upload/start',requireAdmin,(req,res)=>{
  const name=path.basename(String(req.body?.name||'video.mp4')).replace(/[^a-zA-Z0-9._-]/g,'_')||'video.mp4';
  const uploadId=id('VID');
  const temp=path.join(UPLOAD_ROOT,'videos',`.${uploadId}.part`);
  fs.writeFileSync(temp,Buffer.alloc(0));
  videoUploads.set(uploadId,{temp,name,size:Number(req.body?.size||0),createdAt:Date.now()});
  res.json({ok:true,uploadId});
});
app.post('/api/admin/video-upload/chunk',requireAdmin,express.raw({type:'application/octet-stream',limit:'8mb'}),(req,res)=>{
  const uploadId=String(req.headers['x-upload-id']||'');
  const entry=videoUploads.get(uploadId);
  if(!entry)return res.status(404).json({error:'Video upload session not found.'});
  if(!Buffer.isBuffer(req.body))return res.status(400).json({error:'Invalid video chunk.'});
  fs.appendFileSync(entry.temp,req.body);
  res.json({ok:true,received:req.body.length});
});
app.post('/api/admin/video-upload/complete',requireAdmin,(req,res)=>{
  const uploadId=String(req.body?.uploadId||'');
  const entry=videoUploads.get(uploadId);
  if(!entry)return res.status(404).json({error:'Video upload session not found.'});
  if(!fs.existsSync(entry.temp))return res.status(404).json({error:'Uploaded video data not found.'});
  const finalName=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${entry.name}`;
  const finalPath=path.join(UPLOAD_ROOT,'videos',finalName);
  fs.renameSync(entry.temp,finalPath);
  videoUploads.delete(uploadId);
  res.json({ok:true,video:'/uploads/videos/'+finalName,size:fs.statSync(finalPath).size});
});
app.post('/api/admin/lesson-uploaded-edit',requireAdmin,async(req,res)=>{
  const d=load();let found=null;
  for(const c of d.courses){const l=(c.lessons||[]).find(x=>x.id===req.body.id);if(l){found={c,l};break;}}
  if(!found)return res.status(404).json({error:'Lesson not found'});
  const {c,l}=found;
  for(const k of ['title','description','thumbnail'])if(req.body[k]!==undefined)l[k]=req.body[k];
  if(req.body.video){removeUploadFile(l.video);l.type='upload';l.video=String(req.body.video);}
  l.free=String(req.body.free)==='true';
  const mail=req.body.video?await sendCourseClassEmails(d,c,{title:l.title,kind:'Recorded class updated',recordingUrl:l.video,description:l.description||'A recorded class has been updated in your course.'}):{sent:0,skipped:0,total:0};
  await save(d);res.json({ok:true,lesson:l,email:mail});
});
app.post('/api/admin/lesson-uploaded',requireAdmin,async(req,res)=>{
  const d=load(),c=d.courses.find(x=>x.id===req.body.courseId);
  if(!c)return res.status(404).json({error:'Course not found'});
  const l={id:id('LESSON'),title:String(req.body.title||'').trim(),type:'upload',video:String(req.body.video||''),description:req.body.description||'',free:String(req.body.free)==='true',thumbnail:String(req.body.thumbnail||'')};
  if(!l.title||!l.video)return res.status(400).json({error:'Lesson title and uploaded video are required.'});
  c.lessons=c.lessons||[];c.lessons.push(l);const mail=await sendCourseClassEmails(d,c,{title:l.title,kind:'New recorded class',recordingUrl:l.video,description:l.description||'A new recorded class is now available in your purchased course.'});await save(d);res.json({ok:true,lesson:l,email:mail});
});
setInterval(()=>{const cutoff=Date.now()-30*60*1000;for(const [k,v] of videoUploads){if(v.createdAt<cutoff){try{fs.unlinkSync(v.temp)}catch{}videoUploads.delete(k)}}},10*60*1000).unref();

app.get('/api/public-state',(req,res)=>res.json(publicState()));
app.get('/api/health',(req,res)=>res.json({ok:true,academy:"Hafiz Shahid's Academy",mode:process.env.DATABASE_URL?'postgres':'local',time:new Date().toISOString()}));

// Email OTP login. OTPs are short-lived and kept server-side only. Brevo credentials remain server-side.
function validEmail(v){return /^\S+@\S+\.\S+$/.test(String(v||'').trim());}
app.post('/api/auth/request-otp',async(req,res)=>{
  const d=load(); const name=String(req.body.name||'').trim().replace(/\s+/g,' '); const email=String(req.body.email||'').trim().toLowerCase();
  if(name.length<2)return res.status(400).json({error:'Please enter your full name.'});
  if(!validEmail(email))return res.status(400).json({error:'Please enter a valid email address.'});
  let u=findStudentByName(d,name)[0];
  if(u && u.status==='deleted')return res.status(404).json({error:'This student account is no longer active.'});
  if(!u){u={id:nextStudentId(d),name,phone:'',email,role:'student',status:'active',purchased:[],enrollments:[],progress:{},createdAt:new Date().toISOString()};d.users.push(u);}
  u.email=email;
  const otp=String(crypto.randomInt(100000,1000000)); const session=crypto.randomBytes(32).toString('hex');
  emailOtpSessions.set(session,{userId:u.id,email,otp,expiresAt:Date.now()+10*60*1000,attempts:0});
  const safeName=name.replace(/[<>]/g,'');
  const result=await sendBrevoEmail({toEmail:email,toName:name,subject:`Your login OTP • ${safeName}`,htmlContent:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#12243d"><h2>Hafiz Shahid's Academy</h2><p>Your one-time login verification code is:</p><div style="font-size:34px;font-weight:900;letter-spacing:8px;padding:18px;background:#f1f5ff;border-radius:14px;text-align:center">${otp}</div><p>This OTP expires in 10 minutes. Never share it with anyone.</p><p><b>Student ID:</b> ${u.id}</p></div>`,textContent:`Hafiz Shahid's Academy\n\nYour login OTP is ${otp}.\nStudent ID: ${u.id}\nThis OTP expires in 10 minutes.`});
  await logBrevoEmail(d,{studentId:u.id,toEmail:email,toName:name,subject:`Your login OTP • ${safeName}`,text:`Login OTP sent to ${email} for ${u.id}.`,result,type:'login-otp'});
  const ownerEmail=brevoConfig().fromEmail;
  if(result.ok && ownerEmail && ownerEmail.toLowerCase()!==email) await sendBrevoEmail({toEmail:ownerEmail,toName:'Academy Owner',subject:`Student login • ${u.id}`,htmlContent:`<p>A student login was requested.</p><p><b>Student:</b> ${safeName}<br><b>Student ID:</b> ${u.id}<br><b>Email:</b> ${email}</p>`,textContent:`Student login requested\nStudent: ${name}\nStudent ID: ${u.id}\nEmail: ${email}`});
  save(d); if(!result.ok)return res.status(503).json({error:'OTP could not be sent. Please check Brevo configuration.'});
  res.json({ok:true,studentId:u.id,expiresIn:600});
});
app.post('/api/auth/verify-otp',(req,res)=>{
  const d=load(); const studentId=String(req.body.studentId||'').trim().toUpperCase(); const email=String(req.body.email||'').trim().toLowerCase(); const otp=String(req.body.otp||'').trim();
  let key,entry; for(const [k,v] of emailOtpSessions.entries()) if(v.userId===studentId&&v.email===email){key=k;entry=v;break;}
  if(!entry||entry.expiresAt<Date.now()){if(key)emailOtpSessions.delete(key);return res.status(401).json({error:'OTP expired. Please request a new OTP.'});}
  if(entry.attempts>=5)return res.status(429).json({error:'Too many incorrect attempts. Please request a new OTP.'});
  if(entry.otp!==otp){entry.attempts++;return res.status(401).json({error:'Invalid OTP. Please check your email and try again.'});}
  const u=d.users.find(x=>x.role==='student'&&String(x.id).toUpperCase()===studentId); if(!u)return res.status(404).json({error:'Student account not found.'});
  u.email=email; u.sessionToken=crypto.randomBytes(32).toString('hex'); if(!u.rememberToken)u.rememberToken=crypto.randomBytes(32).toString('hex'); save(d); emailOtpSessions.delete(key); res.json({ok:true,token:u.sessionToken,rememberToken:u.rememberToken,user:sanitizeUser(u)});
});

app.post('/api/auth/remember-login',(req,res)=>{const d=load();const email=String(req.body.email||'').trim().toLowerCase();const rememberToken=String(req.body.rememberToken||'');if(!validEmail(email)||!rememberToken)return res.status(400).json({error:'Trusted login information is missing.'});const u=d.users.find(x=>x.role==='student'&&String(x.email||'').toLowerCase()===email&&String(x.rememberToken||'')===rememberToken&&x.status==='active');if(!u)return res.status(401).json({error:'This device login has expired. Please verify by OTP once again.'});u.sessionToken=crypto.randomBytes(32).toString('hex');save(d);res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u)});});

app.post('/api/auth/student-id',(req,res)=>{
  const d=load();
  const name=String(req.body.name||'').trim().replace(/\s+/g,' ');
  if(name.length<2) return res.status(400).json({error:'Please enter your full name.'});
  const matches=findStudentByName(d,name);
  if(matches.length>1) return res.status(409).json({error:'More than one student has this name. Please contact the academy.'});
  if(matches.length===1){
    const u=matches[0];
    if(u.status==='deleted') return res.status(404).json({error:'This student account is no longer active.'});
    if(!/^HSA-\d{3,}$/i.test(String(u.id||''))) { u.id=nextStudentId(d); save(d); }
    if(!u.studentPasswordHash){
      const token=crypto.randomBytes(32).toString('hex');
      pendingStudentRegistrations.set(token,{userId:u.id,expiresAt:Date.now()+15*60*1000});
      return res.json({ok:true,studentId:u.id,name:u.name,isNew:false,needsPassword:true,registrationToken:token,existing:true});
    }
    return res.json({ok:true,studentId:u.id,name:u.name,isNew:false,needsPassword:false,existing:true});
  }
  // A short-lived in-memory lock prevents two simultaneous clicks from creating two accounts for the same name.
  const key=normalizeStudentName(name);
  const pending=[...pendingStudentRegistrations.values()].find(x=>x.nameKey===key && x.expiresAt>Date.now());
  if(pending){
    return res.json({ok:true,studentId:pending.studentId,name:pending.name,isNew:false,needsPassword:true,registrationToken:pending.token,existing:true});
  }
  const idv=nextStudentId(d);
  const u={id:idv,name,phone:'',email:'',role:'student',status:'active',purchased:[],enrollments:[],progress:{},createdAt:new Date().toISOString()};
  d.users.push(u);
  const token=crypto.randomBytes(32).toString('hex');
  pendingStudentRegistrations.set(token,{userId:idv,studentId:idv,name, nameKey:key, token,expiresAt:Date.now()+15*60*1000});
  save(d);
  res.json({ok:true,studentId:idv,name,isNew:true,needsPassword:true,registrationToken:token,existing:false});
});
app.post('/api/auth/student-register-password',(req,res)=>{
  const token=String(req.body.registrationToken||'');
  const entry=pendingStudentRegistrations.get(token);
  if(!entry || entry.expiresAt<Date.now()){ pendingStudentRegistrations.delete(token); return res.status(400).json({error:'Registration session expired. Please start again.'}); }
  const password=String(req.body.password||'');
  if(password.length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
  const d=load();
  const u=d.users.find(x=>x.id===entry.userId && x.role==='student');
  if(!u) return res.status(404).json({error:'Student account could not be found.'});
  u.studentPasswordHash=hashPassword(password);
  u.sessionToken=crypto.randomBytes(32).toString('hex');
  pendingStudentRegistrations.delete(token);
  save(d);
  res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u),studentId:u.id});
});

app.post('/api/auth/student-login',(req,res)=>{
  const d=load();
  const studentId=String(req.body.studentId||'').trim().toUpperCase();
  const password=String(req.body.password||'');
  if(!/^HSA-\d{3,}$/.test(studentId)) return res.status(400).json({error:'Enter a valid Student ID, e.g. HSA-001.'});
  if(!password) return res.status(400).json({error:'Password is required.'});
  const u=d.users.find(x=>x.role==='student' && String(x.id||'').toUpperCase()===studentId);
  if(!u) return res.status(401).json({error:'Student ID or password is incorrect.'});
  if(!verifyPassword(password,u.studentPasswordHash)) return res.status(401).json({error:'Student ID or password is incorrect.'});
  u.sessionToken=crypto.randomBytes(32).toString('hex');
  save(d);
  res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u)});
});

app.post('/api/auth/change-password',requireStudent,(req,res)=>{
  const d=load(),u=d.users.find(x=>x.id===req.user.id);
  const current=String(req.body.currentPassword||''), next=String(req.body.newPassword||'');
  if(!verifyPassword(current,u.studentPasswordHash)) return res.status(401).json({error:'Current password is incorrect.'});
  if(next.length<8) return res.status(400).json({error:'New password must be at least 8 characters.'});
  u.studentPasswordHash=hashPassword(next);
  save(d);
  res.json({ok:true,message:'Password changed successfully.'});
});

app.post('/api/auth/profile',requireStudent,upload.single('profile'),(req,res)=>{
  const d=load(),u=d.users.find(x=>x.id===req.user.id);
  u.name=String(req.body.name||u.name).trim(); u.email=String(req.body.email||u.email||'').trim(); u.about=String(req.body.about||u.about||'');
  if(req.file)u.profilePhoto='/uploads/profiles/'+req.file.filename;
  save(d); res.json({ok:true,user:sanitizeUser(u)});
});
app.get('/api/student-state',requireStudent,(req,res)=>{
  const d=load(),u=d.users.find(x=>x.id===req.user.id); if(!u)return res.status(401).json({error:'Student not found'}); res.json(studentState(u));
});

app.post('/api/application',requireStudent,upload.single('profile'),(req,res)=>{
  const d=load(),u=d.users.find(x=>x.id===req.user.id),course=d.courses.find(c=>c.id===req.body.courseId);
  if(!course)return res.status(404).json({error:'Course not found'});
  const email=String(req.body.email||u.email||'').trim();
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'A valid email address is required so the academy can send course and class notifications.'});
  const already=d.applications.find(a=>a.studentId===u.id&&a.courseId===course.id&&['Pending','Payment Pending','Payment Submitted'].includes(a.status));
  if(already)return res.status(409).json({error:'You already have an application for this course.'});
  const now=new Date().toISOString();
  u.name=String(req.body.fullName||u.name).trim(); u.phone=cleanPhone(req.body.country,req.body.phone||u.phone); u.email=email;
  u.purchaseHistory=Array.isArray(u.purchaseHistory)?u.purchaseHistory:[];
  const a={id:id('APP'),studentId:u.id,courseId:course.id,courseTitle:course.title,fullName:u.name,phone:u.phone,email,country:req.body.country||'+91',address:req.body.address||'',city:req.body.city||'',qualification:req.body.qualification||'',profilePhoto:req.file?'/uploads/profiles/'+req.file.filename:(u.profilePhoto||''),status:'Payment Pending',createdAt:now};
  d.applications.unshift(a);
  u.purchaseHistory.unshift({applicationId:a.id,courseId:course.id,courseTitle:course.title,amount:Number(course.price),fullName:u.name,phone:u.phone,email,address:a.address,city:a.city,qualification:a.qualification,status:'Payment Pending',createdAt:now});
  save(d);res.json({ok:true,application:a});
});

app.post('/api/payment',requireStudent,upload.single('screenshot'),async(req,res)=>{
  const d=load(),course=d.courses.find(c=>c.id===req.body.courseId),u=d.users.find(x=>x.id===req.user.id);
  if(!course||!u)return res.status(404).json({error:'Course or student not found'});
  if(!req.file)return res.status(400).json({error:'Payment screenshot is required.'});
  if(!String(req.file.mimetype||'').startsWith('image/')){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Payment screenshot must be an image.'});}
  if(Number(req.file.size||0)>8*1024*1024){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Payment screenshot must be 8 MB or smaller.'});}
  const appn=d.applications.find(a=>a.studentId===u.id&&a.courseId===course.id&&a.status==='Payment Pending');
  if(!appn)return res.status(400).json({error:'Submit the course application form first.'});
  const screenshot=imageDataUrl(req.file);if(!screenshot)return res.status(400).json({error:'Could not save the payment screenshot. Please try again.'});
  const now=new Date().toISOString();
  const p={id:id('PAY'),studentId:u.id,studentName:u.name,courseId:course.id,courseTitle:course.title,amount:Number(course.price),utr:String(req.body.utr||'').trim(),screenshot,status:'Pending',createdAt:now,fullName:appn.fullName,phone:appn.phone,email:appn.email,address:appn.address,city:appn.city,qualification:appn.qualification,applicationId:appn.id};
  appn.status='Payment Submitted';appn.paymentId=p.id;d.payments.unshift(p);
  u.purchaseHistory=Array.isArray(u.purchaseHistory)?u.purchaseHistory:[];const h=u.purchaseHistory.find(x=>x.applicationId===appn.id);
  if(h){h.paymentId=p.id;h.utr=p.utr;h.screenshot=screenshot;h.status='Payment Submitted';h.paymentSubmittedAt=now;}else u.purchaseHistory.unshift({applicationId:appn.id,paymentId:p.id,courseId:course.id,courseTitle:course.title,amount:p.amount,fullName:u.name,phone:u.phone,email:u.email,address:appn.address,city:appn.city,qualification:appn.qualification,utr:p.utr,screenshot,status:'Payment Submitted',createdAt:now});
  d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'payment',title:'Payment submitted',text:`Your payment for ${course.title} is waiting for academy verification.`,createdAt:now});
  const emailResult=await sendStudentEmail(d,u,`Purchase received • ${course.title}`,`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#12243d"><h2>Hafiz Shahid's Academy</h2><h1>Purchase received</h1><p>We received your course purchase request for <b>${String(course.title).replace(/[<>]/g,'')}</b>.</p><p><b>Amount:</b> ₹${Number(course.price).toLocaleString('en-IN')}<br><b>UTR:</b> ${p.utr||'Not provided'}</p><p>Your payment is currently <b>Pending Verification</b>. Course access will be activated only after the academy verifies the payment.</p></div>`,`Hafiz Shahid's Academy\n\nPurchase received: ${course.title}\nAmount: ₹${Number(course.price).toLocaleString('en-IN')}\nUTR: ${p.utr||'Not provided'}\nStatus: Pending Verification`,'purchase-received');
  save(d);res.json({ok:true,payment:{...p,screenshot:'[saved securely]'},email:{sent:!!emailResult.ok,reason:emailResult.reason||''}});
});

app.get('/api/admin/check',requireAdmin,(req,res)=>res.json({ok:true}));

app.post('/api/admin/request-otp',(req,res)=>res.status(410).json({error:'Super Admin OTP login has been replaced by secure password login.'}));
app.post('/api/admin/verify-otp',(req,res)=>res.status(410).json({error:'Super Admin OTP login has been replaced by secure password login.'}));

app.post('/api/admin/login',(req,res)=>{
  const password=String(req.body.password||'');
  const configured=process.env.SUPER_ADMIN_PASSWORD;
  if(!configured) return res.status(500).json({error:'Super Admin password is not configured on Render. Add SUPER_ADMIN_PASSWORD in Environment Variables.'});
  if(!password || password.length!==configured.length || !crypto.timingSafeEqual(Buffer.from(password),Buffer.from(configured))) return res.status(401).json({error:'Incorrect admin password.'});
  const d=load();
  const ownerPhone='+91'+String(process.env.SUPER_ADMIN_PHONE||'').replace(/\D/g,'');
  let u=d.users.find(x=>x.role==='superadmin');
  if(!u){
    u={id:'SUPER-ADMIN-001',name:"Hafiz Shahid",phone:ownerPhone,email:'',role:'superadmin',status:'active',enrollments:[],purchased:[],progress:{},createdAt:new Date().toISOString()};
    d.users.push(u);
  }
  u.role='superadmin'; u.status='active';
  u.enrollments=d.courses.map(c=>({courseId:c.id,courseTitle:c.title,joiningDate:new Date().toISOString(),endDate:'2099-12-31T23:59:59.000Z',status:'active',paymentId:'SUPER-ADMIN'}));
  u.purchased=d.courses.map(c=>c.id);
  const token=crypto.randomBytes(32).toString('hex');
  adminSessions.add(token);
  save(d);
  res.json({ok:true,token,admin:sanitizeUser(u),superAdmin:true});
});

app.post('/api/admin/student',requireAdmin,(req,res)=>{
  const d=load();
  const name=String(req.body.name||'').trim().replace(/\s+/g,' ');
  if(!name)return res.status(400).json({error:'Student name is required.'});
  if(String(req.body.password||'').length<8)return res.status(400).json({error:'Password must be at least 8 characters.'});
  const existing=findStudentByName(d,name)[0];
  if(existing){
    existing.phone=cleanPhone(req.body.country,req.body.phone)||existing.phone;
    existing.email=String(req.body.email||'').trim()||existing.email;
    existing.studentPasswordHash=hashPassword(req.body.password);
    existing.status='active';
    save(d);
    return res.json({ok:true,user:sanitizeUser(existing),existing:true});
  }
  const u={id:nextStudentId(d),name,phone:cleanPhone(req.body.country,req.body.phone),email:String(req.body.email||'').trim(),role:'student',status:'active',purchased:[],enrollments:[],progress:{},studentPasswordHash:hashPassword(req.body.password),createdAt:new Date().toISOString()};
  d.users.push(u);save(d);res.json({ok:true,user:sanitizeUser(u),existing:false});
});
app.post('/api/admin/student/:id/delete',requireAdmin,(req,res)=>{
  const d=load();
  const u=d.users.find(x=>x.id===req.params.id && x.role==='student');
  if(!u)return res.status(404).json({error:'Student not found.'});
  u.status='deleted';
  delete u.sessionToken;
  for(const [token,entry] of pendingStudentRegistrations.entries()){ if(entry.userId===u.id) pendingStudentRegistrations.delete(token); }
  save(d);
  res.json({ok:true,message:'Student account deleted.'});
});

app.post('/api/admin/student/:id/password',requireAdmin,(req,res)=>{
  const d=load(),u=d.users.find(x=>x.id===req.params.id && x.role==='student');
  const next=String(req.body.password||'');
  if(!u)return res.status(404).json({error:'Student not found.'});
  if(next.length<8)return res.status(400).json({error:'Student password must be at least 8 characters.'});
  u.studentPasswordHash=hashPassword(next);
  save(d);
  res.json({ok:true,message:'Student password updated.'});
});

app.get('/api/admin-state',requireAdmin,(req,res)=>res.json(adminState()));

app.post('/api/admin/payment/:id/approve',requireAdmin,async(req,res)=>{
  const d=load(),p=d.payments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.status==='Approved')return res.json({ok:true});
  const u=d.users.find(x=>x.id===p.studentId),c=d.courses.find(x=>x.id===p.courseId);if(!u||!c)return res.status(404).json({error:'Student/course missing'});
  const start=new Date(),end=new Date(addDays(start,durationDays(c.validity||c.duration)));
  u.status='active';u.enrollments=u.enrollments||[];const existing=u.enrollments.find(e=>e.courseId===c.id);const enrollment={courseId:c.id,courseTitle:c.title,joiningDate:start.toISOString(),endDate:end.toISOString(),status:'active',paymentId:p.id,amount:p.amount};if(existing)Object.assign(existing,enrollment);else u.enrollments.push(enrollment);
  u.purchased=[...new Set([...(u.purchased||[]),c.id])];p.status='Approved';p.approvedAt=start.toISOString();p.joiningDate=start.toISOString();p.endDate=end.toISOString();
  const appn=d.applications.find(a=>a.paymentId===p.id);if(appn)appn.status='Approved';
  u.purchaseHistory=Array.isArray(u.purchaseHistory)?u.purchaseHistory:[];const history=u.purchaseHistory.find(x=>x.paymentId===p.id);
  const receipt={id:id('REC'),studentId:u.id,studentName:u.name,courseId:c.id,courseTitle:c.title,amount:p.amount,utr:p.utr,paymentDate:start.toISOString(),joiningDate:start.toISOString(),endDate:end.toISOString(),receiptNo:'HSA-'+Date.now()};
  if(history){history.status='Approved';history.approvedAt=start.toISOString();history.joiningDate=start.toISOString();history.endDate=end.toISOString();history.receiptNo=receipt.receiptNo;}
  d.receipts.unshift(receipt);d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'course',title:'Course unlocked',text:`${c.title} is now active until ${end.toLocaleDateString('en-IN')}. Your receipt is ready.`,createdAt:start.toISOString()});
  const emailResult=await sendStudentEmail(d,u,`Course approved • ${c.title}`,`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#12243d"><h2>Hafiz Shahid's Academy</h2><h1>Course access activated</h1><p>Your payment for <b>${String(c.title).replace(/[<>]/g,'')}</b> has been verified.</p><p><b>Amount:</b> ₹${Number(p.amount).toLocaleString('en-IN')}<br><b>Joining date:</b> ${start.toLocaleDateString('en-IN')}<br><b>Access until:</b> ${end.toLocaleDateString('en-IN')}<br><b>Receipt:</b> ${receipt.receiptNo}</p><p>You can now open the course from your student dashboard.</p></div>`,`Hafiz Shahid's Academy\n\nCourse access activated\nCourse: ${c.title}\nAmount: ₹${Number(p.amount).toLocaleString('en-IN')}\nJoining date: ${start.toLocaleDateString('en-IN')}\nAccess until: ${end.toLocaleDateString('en-IN')}\nReceipt: ${receipt.receiptNo}`,'course-approved');
  save(d);res.json({ok:true,receipt,email:{sent:!!emailResult.ok,reason:emailResult.reason||''}});
});
app.post('/api/admin/payment/:id/reject',requireAdmin,(req,res)=>{ const d=load(),p=d.payments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});p.status='Rejected';p.rejectedAt=new Date().toISOString();const a=d.applications.find(x=>x.paymentId===p.id);if(a)a.status='Payment Pending';d.notifications.unshift({id:id('NOT'),studentId:p.studentId,type:'payment',title:'Payment needs attention',text:'Your payment submission was rejected. Please contact the academy and resubmit.',createdAt:new Date().toISOString()});save(d);res.json({ok:true}); });


app.post('/api/admin/teacher',requireAdmin,upload.single('photo'),(req,res)=>{const d=load();const t={id:id('TEACH'),name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),email:String(req.body.email||'').trim(),subject:String(req.body.subject||'').trim(),role:'teacher',photo:req.file?'/uploads/profiles/'+req.file.filename:'',createdAt:new Date().toISOString()};if(!t.name)return res.status(400).json({error:'Teacher name is required.'});d.teachers.unshift(t);save(d);res.json({ok:true,teacher:t});});
app.post('/api/admin/teacher/:id/delete',requireAdmin,(req,res)=>{const d=load();d.teachers=d.teachers.filter(t=>t.id!==req.params.id);save(d);res.json({ok:true});});
app.post('/api/admin/message-log',requireAdmin,(req,res)=>{const d=load();const item={id:id('MSG'),channel:req.body.channel||'whatsapp',audience:req.body.audience||'individual',studentIds:Array.isArray(req.body.studentIds)?req.body.studentIds:[],subject:req.body.subject||'',message:req.body.message||'',createdAt:new Date().toISOString()};d.messageLogs.unshift(item);save(d);res.json({ok:true,message:item});});

app.post('/api/admin/course',requireAdmin,upload.fields([{name:'cover',maxCount:1},{name:'syllabusFile',maxCount:1}]),(req,res)=>{
  const d=load();
  const coverFile=req.files?.cover?.[0];
  const coverData=imageDataUrl(coverFile);
  const c={id:id('COURSE'),title:req.body.title,category:req.body.category||'General',price:Number(req.body.price||0),oldPrice:Number(req.body.oldPrice||0),description:req.body.description||'',level:req.body.level||'All Levels',duration:req.body.duration||'30 days',validity:req.body.validity||req.body.duration||'30 days',image:coverData||req.body.image||'',syllabusUrl:req.files?.syllabusFile?.[0]?'/uploads/materials/'+req.files.syllabusFile[0].filename:(req.body.syllabusUrl||''),startDate:req.body.startDate||'',lessons:[],createdAt:new Date().toISOString()};
  d.courses.push(c); save(d); res.json({ok:true,course:c});
});
app.post('/api/admin/course/:id/edit',requireAdmin,upload.fields([{name:'cover',maxCount:1},{name:'syllabusFile',maxCount:1}]),(req,res)=>{const d=load(),c=d.courses.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Course not found'});for(const k of ['title','category','description','level','duration','startDate'])if(req.body[k]!==undefined)c[k]=req.body[k];if(req.body.price!==undefined)c.price=Number(req.body.price);if(req.body.oldPrice!==undefined)c.oldPrice=Number(req.body.oldPrice);if(req.body.validity!==undefined)c.validity=req.body.validity;if(req.files?.cover?.[0]){if(typeof c.image==='string'&&c.image.startsWith('/uploads/'))removeUploadFile(c.image);const coverData=imageDataUrl(req.files.cover[0]);if(coverData)c.image=coverData;}else if(req.body.image)c.image=req.body.image;if(req.files?.syllabusFile?.[0])c.syllabusUrl='/uploads/materials/'+req.files.syllabusFile[0].filename;else if(req.body.syllabusUrl!==undefined)c.syllabusUrl=req.body.syllabusUrl;save(d);res.json({ok:true,course:c});});
app.post('/api/admin/course/:id/delete',requireAdmin,(req,res)=>{const d=load();d.courses=d.courses.filter(c=>c.id!==req.params.id);save(d);res.json({ok:true});});

app.post('/api/admin/lesson',requireAdmin,upload.single('file'),async(req,res)=>{
 const d=load(),c=d.courses.find(x=>x.id===req.body.courseId);if(!c)return res.status(404).json({error:'Course not found'});
 let type=req.body.type||'youtube',video=req.body.video||'';if(req.file){type='upload';video='/uploads/videos/'+req.file.filename;}
 if(video&&type==='youtube'&&!/^https?:\/\//i.test(video))return res.status(400).json({error:'Please enter a valid YouTube URL.'});
 const l={id:id('LESSON'),title:String(req.body.title||'').trim(),type,video,free:req.body.free==='true'||req.body.free===true,description:req.body.description||'',thumbnail:String(req.body.thumbnail||''),createdAt:new Date().toISOString()};
 if(!l.title)return res.status(400).json({error:'Lesson title is required.'});if(!l.video)return res.status(400).json({error:'Add a YouTube link or upload a video.'});
 c.lessons=c.lessons||[];c.lessons.push(l);const mail=await sendCourseClassEmails(d,c,{title:l.title,kind:l.type==='upload'?'New recorded class':'New YouTube class',recordingUrl:l.video,description:l.description||'A new class is now available in your purchased course.'});save(d);res.json({ok:true,lesson:l,email:mail});
});
app.post('/api/admin/lesson/:id/edit',requireAdmin,upload.single('file'),(req,res)=>{
 const d=load();let found=null;for(const c of d.courses){const l=(c.lessons||[]).find(x=>x.id===req.params.id);if(l){found={c,l};break;}}
 if(!found)return res.status(404).json({error:'Lesson not found'});const {c,l}=found;
 if(req.body.title!==undefined)l.title=String(req.body.title).trim();if(req.body.description!==undefined)l.description=req.body.description;if(req.body.free!==undefined)l.free=req.body.free==='true'||req.body.free===true;if(req.body.thumbnail!==undefined)l.thumbnail=String(req.body.thumbnail||'');
 if(req.file){removeUploadFile(l.video);l.type='upload';l.video='/uploads/videos/'+req.file.filename;}else if(req.body.video!==undefined&&req.body.video){l.type='youtube';l.video=req.body.video;}
 save(d);res.json({ok:true,lesson:l});
});
app.post('/api/admin/lesson/:id/delete',requireAdmin,(req,res)=>{const d=load();for(const c of d.courses){const idx=(c.lessons||[]).findIndex(x=>x.id===req.params.id);if(idx>=0){const l=c.lessons[idx];removeUploadFile(l.video);c.lessons.splice(idx,1);save(d);return res.json({ok:true});}}res.status(404).json({error:'Lesson not found'});});
app.post('/api/admin/material',requireAdmin,upload.single('file'),(req,res)=>{const d=load();if(!req.file)return res.status(400).json({error:'File required'});const m={id:id('MAT'),courseId:req.body.courseId,title:req.body.title,file:'/uploads/materials/'+req.file.filename,originalName:req.file.originalname,size:req.file.size,createdAt:new Date().toISOString()};d.materials.unshift(m);save(d);res.json({ok:true,material:m});});
app.post('/api/admin/material/:id/edit',requireAdmin,upload.single('file'),(req,res)=>{const d=load(),m=d.materials.find(x=>x.id===req.params.id);if(!m)return res.status(404).json({error:'Material not found'});if(req.body.title!==undefined)m.title=req.body.title;if(req.body.courseId!==undefined)m.courseId=req.body.courseId;if(req.file){removeUploadFile(m.file);m.file='/uploads/materials/'+req.file.filename;m.originalName=req.file.originalname;m.size=req.file.size;}save(d);res.json({ok:true,material:m});});
app.post('/api/admin/material/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.materials.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Material not found'});removeUploadFile(d.materials[i].file);d.materials.splice(i,1);save(d);res.json({ok:true});});
app.post('/api/admin/assignment',requireAdmin,(req,res)=>{const d=load();const a={id:id('ASG'),courseId:req.body.courseId,title:String(req.body.title||'').trim(),description:req.body.description||'',dueDate:req.body.dueDate||'',points:Number(req.body.points||10)};if(!a.title)return res.status(400).json({error:'Assignment title is required.'});d.assignments.unshift(a);save(d);res.json({ok:true,assignment:a});});
app.post('/api/admin/assignment/:id/edit',requireAdmin,(req,res)=>{const d=load(),a=d.assignments.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'Assignment not found'});for(const k of ['courseId','title','description','dueDate'])if(req.body[k]!==undefined)a[k]=req.body[k];if(req.body.points!==undefined)a.points=Number(req.body.points);save(d);res.json({ok:true,assignment:a});});
app.post('/api/admin/assignment/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.assignments.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Assignment not found'});d.assignments.splice(i,1);d.submissions=d.submissions.filter(s=>s.assignmentId!==req.params.id);save(d);res.json({ok:true});});
app.post('/api/assignment/submit',requireStudent,upload.single('file'),(req,res)=>{const d=load(),a=d.assignments.find(x=>x.id===req.body.assignmentId);if(!a)return res.status(404).json({error:'Assignment not found'});if(!isActiveEnrollment(d,req.user,a.courseId))return res.status(403).json({error:'Course access is inactive.'});const old=d.submissions.find(x=>x.assignmentId===a.id&&x.studentId===req.user.id);const item={id:old?old.id:id('SUB'),assignmentId:a.id,studentId:req.user.id,answer:req.body.answer||'',file:req.file?'/uploads/assignments/'+req.file.filename:(old?.file||''),status:'Submitted',submittedAt:new Date().toISOString(),score:null,feedback:''};if(old)Object.assign(old,item);else d.submissions.push(item);save(d);res.json({ok:true,submission:item});});
app.post('/api/admin/submission/:id/grade',requireAdmin,(req,res)=>{const d=load(),s=d.submissions.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Submission not found'});s.score=Number(req.body.score||0);s.feedback=req.body.feedback||'';s.status='Graded';d.notifications.unshift({id:id('NOT'),studentId:s.studentId,type:'assignment',title:'Assignment graded',text:`Your assignment has been graded: ${s.score} points.`,createdAt:new Date().toISOString()});save(d);res.json({ok:true});});
app.post('/api/admin/live',requireAdmin,async(req,res)=>{const d=load(),c=d.courses.find(x=>x.id===req.body.courseId);if(!c)return res.status(404).json({error:'Course not found'});const zoom=String(req.body.zoom||'').trim();if(!/^https?:\/\//i.test(zoom))return res.status(400).json({error:'Please enter a valid Zoom/meeting URL.'});const l={id:id('LIVE'),courseId:req.body.courseId,title:String(req.body.title||'').trim(),date:req.body.date,time:req.body.time,zoom,recording:req.body.recording||'',status:'Upcoming',createdAt:new Date().toISOString()};if(!l.title)return res.status(400).json({error:'Class title is required.'});d.liveClasses.unshift(l);const mail=await sendCourseClassEmails(d,c,{title:l.title,kind:'Live class scheduled',joinUrl:l.zoom,description:`Your live class is scheduled for ${l.date} at ${l.time}.`});save(d);res.json({ok:true,live:l,email:mail});});
app.post('/api/admin/live/:id/edit',requireAdmin,(req,res)=>{const d=load(),l=d.liveClasses.find(x=>x.id===req.params.id);if(!l)return res.status(404).json({error:'Live class not found'});for(const k of ['courseId','title','date','time','zoom','recording','status'])if(req.body[k]!==undefined)l[k]=req.body[k];save(d);res.json({ok:true,live:l});});
app.post('/api/admin/live/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.liveClasses.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Live class not found'});d.liveClasses.splice(i,1);save(d);res.json({ok:true});});
app.post('/api/admin/announcement',requireAdmin,(req,res)=>{const d=load();const a={id:id('ANN'),title:String(req.body.title||'').trim(),text:String(req.body.text||'').trim(),createdAt:new Date().toISOString()};if(!a.title)return res.status(400).json({error:'Notification title is required.'});d.announcements.unshift(a);save(d);res.json({ok:true,announcement:a});});
app.post('/api/admin/notification',requireAdmin,async(req,res)=>{const d=load();const title=String(req.body.title||'').trim(),text=String(req.body.text||'').trim(),studentId=String(req.body.studentId||'').trim();if(!title||!text)return res.status(400).json({error:'Notification title and message are required.'});const item={id:id('NOT'),studentId:studentId||'',type:String(req.body.type||'academy'),title,text,createdAt:new Date().toISOString(),read:false,readBy:[]};d.notifications.unshift(item);let mailed=0;if(String(req.body.emailStudents)==='true'){const recipients=d.users.filter(u=>u.role==='student'&&u.status==='active'&&(!studentId||u.id===studentId)&&u.email);for(const u of recipients){const r=await sendStudentEmail(d,u,title,`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#12243d"><h2>Hafiz Shahid's Academy</h2><h1>${title.replace(/[<>]/g,'')}</h1><p>${text.replace(/[<>]/g,'').replace(/\n/g,'<br>')}</p></div>`,`${title}\n\n${text}`,'notification');if(r.ok)mailed++;}}save(d);res.json({ok:true,notification:item,mailed});});
app.post('/api/admin/notification/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.notifications.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Notification not found'});d.notifications.splice(i,1);save(d);res.json({ok:true});});
app.post('/api/notification/:id/read',requireStudent,(req,res)=>{const d=load(),n=d.notifications.find(x=>x.id===req.params.id&&(!x.studentId||x.studentId===req.user.id));if(!n)return res.status(404).json({error:'Notification not found'});n.readBy=Array.isArray(n.readBy)?n.readBy:[];if(!n.readBy.includes(req.user.id))n.readBy.push(req.user.id);save(d);res.json({ok:true});});
app.post('/api/doubt',requireStudent,(req,res)=>{const d=load(),courseId=String(req.body.courseId||'');if(courseId&&!isActiveEnrollment(d,req.user,courseId))return res.status(403).json({error:'Course access is inactive.'});const q={id:id('DOUBT'),studentId:req.user.id,courseId,lessonId:String(req.body.lessonId||''),subject:String(req.body.subject||'').trim(),message:String(req.body.message||'').trim(),reply:'',status:'Open',createdAt:new Date().toISOString(),repliedAt:''};if(!q.message)return res.status(400).json({error:'Please write your doubt.'});d.doubts.unshift(q);d.notifications.unshift({id:id('NOT'),studentId:req.user.id,type:'doubt',title:'Doubt submitted',text:'Your doubt has been sent to the academy.',createdAt:new Date().toISOString(),read:false});save(d);res.json({ok:true,doubt:q});});
app.post('/api/admin/doubt/:id/reply',requireAdmin,(req,res)=>{const d=load(),q=d.doubts.find(x=>x.id===req.params.id);if(!q)return res.status(404).json({error:'Doubt not found'});q.reply=String(req.body.reply||'').trim();q.status=q.reply?'Answered':'Open';q.repliedAt=q.reply?new Date().toISOString():'';if(q.reply)d.notifications.unshift({id:id('NOT'),studentId:q.studentId,type:'doubt',title:'Your doubt was answered',text:q.reply,createdAt:new Date().toISOString(),read:false});save(d);res.json({ok:true,doubt:q});});
app.post('/api/admin/doubt/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.doubts.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Doubt not found'});d.doubts.splice(i,1);save(d);res.json({ok:true});});
app.post('/api/comment',requireStudent,(req,res)=>{const d=load(),courseId=String(req.body.courseId||''),lessonId=String(req.body.lessonId||'');if(courseId&&!isActiveEnrollment(d,req.user,courseId))return res.status(403).json({error:'Course access is inactive.'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'Comment cannot be empty.'});const c={id:id('COM'),studentId:req.user.id,studentName:req.user.name,courseId,lessonId,text,createdAt:new Date().toISOString()};d.comments.unshift(c);save(d);res.json({ok:true,comment:c});});
app.post('/api/admin/comment/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.comments.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Comment not found'});d.comments.splice(i,1);save(d);res.json({ok:true});});

app.post('/api/admin/post',requireAdmin,upload.single('imageFile'),(req,res)=>{const d=load();let image=req.body.image||'';if(req.file){if(!String(req.file.mimetype||'').startsWith('image/')){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Post image must be an image.'});}if(Number(req.file.size||0)>6*1024*1024){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Post image must be 6 MB or smaller.'});}image=imageDataUrl(req.file);if(!image)return res.status(400).json({error:'Could not save the post image.'});}const p={id:id('POST'),title:String(req.body.title||'').trim(),text:req.body.text||'',image,createdAt:new Date().toISOString()};if(!p.title)return res.status(400).json({error:'Post title is required.'});d.posts.unshift(p);save(d);res.json({ok:true,post:p});});
app.post('/api/admin/post/:id/edit',requireAdmin,upload.single('imageFile'),(req,res)=>{const d=load(),p=d.posts.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Post not found'});if(req.body.title!==undefined)p.title=req.body.title;if(req.body.text!==undefined)p.text=req.body.text;if(req.file){if(!String(req.file.mimetype||'').startsWith('image/')){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Post image must be an image.'});}if(Number(req.file.size||0)>6*1024*1024){try{fs.unlinkSync(req.file.path)}catch{};return res.status(400).json({error:'Post image must be 6 MB or smaller.'});}const data=imageDataUrl(req.file);if(!data)return res.status(400).json({error:'Could not save the post image.'});p.image=data;}else if(req.body.image!==undefined)p.image=req.body.image;save(d);res.json({ok:true,post:p});});
app.post('/api/admin/post/:id/delete',requireAdmin,(req,res)=>{const d=load(),i=d.posts.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Post not found'});removeUploadFile(d.posts[i].image);d.posts.splice(i,1);save(d);res.json({ok:true});});
app.post('/api/admin/branding',requireAdmin,upload.fields([{name:'hero',maxCount:1},{name:'logo',maxCount:1}]),(req,res)=>{const d=load();d.settings=d.settings||{};for(const [field,files] of Object.entries(req.files||{})){if(files[0])d.settings[field==='hero'?'heroImage':'logo']='/uploads/branding/'+files[0].filename;}if(req.body.academyName)d.settings.academyName=req.body.academyName;if(req.body.tagline)d.settings.tagline=req.body.tagline;save(d);res.json({ok:true,settings:d.settings});});
app.post('/api/admin/settings',requireAdmin,(req,res)=>{const d=load();d.settings={...d.settings,...req.body};save(d);res.json({ok:true,settings:d.settings});});
app.post('/api/progress',requireStudent,(req,res)=>{const d=load(),u=d.users.find(x=>x.id===req.user.id),cid=String(req.body.courseId||'');if(!isActiveEnrollment(d,u,cid))return res.status(403).json({error:'Course access is inactive.'});const c=d.courses.find(x=>x.id===cid);if(!c)return res.status(404).json({error:'Course not found.'});u.progress=u.progress||{};u.completedLessons=u.completedLessons||{};let p=Number(req.body.progress||0);if(req.body.lessonId){const lid=String(req.body.lessonId);const arr=Array.isArray(u.completedLessons[cid])?u.completedLessons[cid]:[];if(!arr.includes(lid))arr.push(lid);u.completedLessons[cid]=arr;const total=Math.max(1,(c.lessons||[]).length);p=Math.round(Math.min(100,arr.length/total*100));}p=Math.max(0,Math.min(100,p));u.progress[cid]=p;if(p>=80){const existing=d.certificates.find(x=>x.studentId===u.id&&x.courseId===cid);if(!existing){d.certificates.unshift({id:id('CERT'),certificateNo:'HSA-CERT-'+Date.now(),studentId:u.id,studentName:u.name,courseId:cid,courseTitle:c.title||'',issuedAt:new Date().toISOString(),progress:p});d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'certificate',title:'Certificate unlocked',text:`Congratulations! Your ${c.title||'course'} certificate is ready at 80% completion.`,createdAt:new Date().toISOString(),read:false});}}save(d);res.json({ok:true,progress:p,completedLessons:u.completedLessons[cid]||[]});});
app.get('/api/certificate/:certificateNo/verify',(req,res)=>{const d=load(),c=d.certificates.find(x=>String(x.certificateNo)===String(req.params.certificateNo));if(!c)return res.status(404).json({verified:false,error:'Certificate not found.'});res.json({verified:true,certificate:{certificateNo:c.certificateNo,studentName:c.studentName,courseTitle:c.courseTitle,issuedAt:c.issuedAt,progress:c.progress}});});
app.get('/api/certificates',requireStudent,(req,res)=>{const d=load();res.json({certificates:d.certificates.filter(c=>c.studentId===req.user.id)});});

app.get('/api/receipt/:id',requireStudent,(req,res)=>{const d=load(),r=d.receipts.find(x=>x.id===req.params.id&&x.studentId===req.user.id);if(!r)return res.status(404).send('Receipt not found');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>${r.receiptNo}</title><style>body{font-family:Arial;background:#f4f7fb;padding:30px}.box{max-width:720px;margin:auto;background:#fff;padding:35px;border-radius:18px;box-shadow:0 15px 50px #0001}h1{color:#0a1b35}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}.ok{color:#087f5b;font-weight:bold}</style></head><body><div class="box"><h1>Hafiz Shahid's Academy</h1><p>Payment Receipt</p><div class="row"><b>Receipt No.</b><span>${r.receiptNo}</span></div><div class="row"><b>Student</b><span>${r.studentName}</span></div><div class="row"><b>Course</b><span>${r.courseTitle}</span></div><div class="row"><b>Amount Paid</b><span>₹${Number(r.amount).toLocaleString('en-IN')}</span></div><div class="row"><b>Payment Date</b><span>${new Date(r.paymentDate).toLocaleString('en-IN')}</span></div><div class="row"><b>Joining Date</b><span>${new Date(r.joiningDate).toLocaleDateString('en-IN')}</span></div><div class="row"><b>Course Access Ends</b><span>${new Date(r.endDate).toLocaleDateString('en-IN')}</span></div><div class="row"><b>UTR</b><span>${r.utr||'—'}</span></div><p class="ok">Payment verified • Course access activated</p><button onclick="window.print()">Print / Save PDF</button></div></body></html>`);});

const adminPreviewTokens=new Map();
app.get('/api/admin/student/:id/preview',requireAdmin,(req,res)=>{const d=load(),u=d.users.find(x=>x.id===req.params.id&&x.role==='student'&&x.status==='active');if(!u)return res.status(404).json({error:'Student not found'});const courseId=String(req.query.courseId||'').trim();const token=crypto.randomBytes(32).toString('hex');adminPreviewTokens.set(token,{userId:u.id,expiresAt:Date.now()+10*60*1000});res.json({ok:true,url:'/?adminPreview='+token+(courseId?'&previewCourse='+encodeURIComponent(courseId):'')});});
app.get('/api/auth/student-preview',(req,res)=>{const token=String(req.query.token||''),entry=adminPreviewTokens.get(token);if(!entry||entry.expiresAt<Date.now()){adminPreviewTokens.delete(token);return res.status(401).json({error:'Preview expired.'});}const d=load(),u=d.users.find(x=>x.id===entry.userId&&x.role==='student'&&x.status==='active');adminPreviewTokens.delete(token);if(!u)return res.status(404).json({error:'Student not found'});u.sessionToken=crypto.randomBytes(32).toString('hex');save(d);res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u)});});

app.get('/api/admin/logout',requireAdmin,(req,res)=>{adminSessions.delete(req.headers['x-admin-token']);res.json({ok:true});});
app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));

async function start(){
  try {
    const store = await initStore();
    const d=load(); if(hydrateDurableImages(d)) await save(d);
    app.listen(PORT,'0.0.0.0',()=>console.log(`Hafiz Shahid's Academy running on port ${PORT} (${store.mode} storage)`));
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}
process.on('SIGTERM', async ()=>{ try{ await flush(); } finally { process.exit(0); } });
process.on('SIGINT', async ()=>{ try{ await flush(); } finally { process.exit(0); } });
start();
