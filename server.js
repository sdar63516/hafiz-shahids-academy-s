const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { initStore, load, save, flush } = require('./db');

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const UPLOAD_ROOT = path.join(ROOT, 'uploads');
for (const f of ['videos','materials','assignments','payments','profiles','covers','branding']) fs.mkdirSync(path.join(UPLOAD_ROOT,f), {recursive:true});

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
  if(u?.role==='superadmin') return !!d.courses.find(c=>c.id===courseId);
  const e=(u.enrollments||[]).find(x=>x.courseId===courseId && x.status==='active');
  return !!e && new Date(e.endDate) >= new Date();
}
function sanitizeUser(u){
  if(!u) return null;
  const {password,otp,...safe}=u;
  return safe;
}
function publicState(){
  const d=load();
  return {settings:d.settings,courses:d.courses,posts:d.posts,announcements:d.announcements};
}
function studentState(u){
  const d=load();
  const owner=u.role==='superadmin';
  const mine=owner ? d.courses.map(c=>({courseId:c.id,courseTitle:c.title,joiningDate:new Date().toISOString(),endDate:'2099-12-31T23:59:59.000Z',status:'active',active:true})) : (u.enrollments||[]).filter(e=>e.status==='active').map(e=>({...e,active:new Date(e.endDate)>=new Date()}));
  const allowed=owner ? ()=>true : (cid)=>mine.some(e=>e.courseId===cid && e.active);
  return {settings:d.settings,courses:d.courses,materials:d.materials.filter(m=>allowed(m.courseId)),assignments:d.assignments.filter(a=>allowed(a.courseId)),submissions:d.submissions.filter(s=>s.studentId===u.id),liveClasses:d.liveClasses.filter(l=>allowed(l.courseId)),announcements:d.announcements,posts:d.posts,notifications:d.notifications.filter(n=>n.studentId===u.id),receipts:d.receipts.filter(r=>r.studentId===u.id),user:sanitizeUser(u)};
}
function adminState(){
  const d=load();
  return {settings:d.settings,users:d.users.map(sanitizeUser),courses:d.courses,payments:d.payments,applications:d.applications,materials:d.materials,assignments:d.assignments,submissions:d.submissions,liveClasses:d.liveClasses,announcements:d.announcements,posts:d.posts,notifications:d.notifications,receipts:d.receipts,certificates:d.certificates,teachers:d.teachers.map(sanitizeUser),messageLogs:d.messageLogs};
}
function requireStudent(req,res,next){ const token=req.headers['x-student-token']; const d=load(); const u=d.users.find(x=>x.sessionToken===token&&(x.role==='student'||x.role==='superadmin')); if(!u)return res.status(401).json({error:'Session expired. Please login again.'}); req.user=u; next(); }
function requireAdmin(req,res,next){ const token=req.headers['x-admin-token']; if(!adminSessions.has(token))return res.status(401).json({error:'Admin login required.'}); req.admin=true; next(); }

const adminSessions=new Set();
const studentSessions=new Set();
const pendingOtps=new Map();
const storage=multer.diskStorage({
 destination:(req,file,cb)=>{
   const type=req.body.uploadType||'materials';
   cb(null,path.join(UPLOAD_ROOT,['videos','materials','assignments','payments','profiles','covers','branding'].includes(type)?type:'materials'));
 },
 filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g,'_')}`)
});
const upload=multer({storage,limits:{fileSize:100*1024*1024}});
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(ROOT));

app.get('/api/public-state',(req,res)=>res.json(publicState()));
app.get('/api/health',(req,res)=>res.json({ok:true,academy:"Hafiz Shahid's Academy",mode:process.env.DATABASE_URL?'postgres':'local',time:new Date().toISOString()}));

// Free-demo OTP policy: without an SMS provider, OTP delivery cannot be truly private.
// The first two student accounts use the requested demo codes; later accounts get a random code
// stored only in memory for the 15-minute request window. Replace this with an SMS provider for production.
function demoStudentOtp(d, key){
  const existing=d.users.find(u=>u.phone===key);
  if(existing?.demoOtp) return String(existing.demoOtp);
  const count=d.users.filter(u=>u.role==='student').length;
  if(count===0) return '123456';
  if(count===1) return '6789';
  return String(crypto.randomInt(100000,1000000));
}
function validOtpFormat(otp){ return /^\\d{4,6}$/.test(String(otp)); }

// Phone OTP. Demo intentionally returns the OTP in the response so the project can be tested without a paid SMS gateway.
app.post('/api/auth/request-otp',(req,res)=>{
  const country=String(req.body.country||'+91');
  const phone=String(req.body.phone||'').replace(/\D/g,'');
  if(phone.length!==10)return res.status(400).json({error:'Enter a valid 10-digit mobile number.'});
  const key=country+phone;
  const d=load();
  const otp=demoStudentOtp(d,key);
  pendingOtps.set(key,{otp,expires:Date.now()+15*60*1000,attempts:0,requestedAt:Date.now()});
  res.json({ok:true,message:'Demo OTP generated. A real SMS gateway is required for private OTP delivery.',demoOtp:otp,expiresIn:900});
});
app.post('/api/auth/verify-otp',(req,res)=>{
  const country=String(req.body.country||'+91');
  const phone=String(req.body.phone||'').replace(/\D/g,'');
  const otp=String(req.body.otp||'').trim();
  const key=country+phone; const p=pendingOtps.get(key);
  if(!validOtpFormat(otp))return res.status(400).json({error:'Enter a 4-6 digit OTP.'});
  if(!p||Date.now()>p.expires)return res.status(401).json({error:'OTP expired. Request a new OTP.'});
  p.attempts++; if(p.attempts>5)return res.status(429).json({error:'Too many OTP attempts.'});
  if(otp!==p.otp)return res.status(401).json({error:'Invalid OTP.'});
  pendingOtps.delete(key);
  const d=load();
  const OWNER_PHONE='+91'+String(process.env.SUPER_ADMIN_PHONE||'9858866415').replace(/\D/g,'');
  let u=d.users.find(x=>x.phone===key);
  if(key===OWNER_PHONE){
    if(!u){u={id:'SUPER-ADMIN-001',name:'Hafiz Shahid',phone:key,email:'',role:'superadmin',status:'active',purchased:[],enrollments:[],progress:{},createdAt:new Date().toISOString()};d.users.push(u);} else {u.role='superadmin';u.status='active';}
    u.enrollments=d.courses.map(c=>({courseId:c.id,courseTitle:c.title,joiningDate:new Date().toISOString(),endDate:'2099-12-31T23:59:59.000Z',status:'active',paymentId:'SUPER-ADMIN'}));
    u.purchased=d.courses.map(c=>c.id);
    u.sessionToken=crypto.randomBytes(24).toString('hex');
    save(d); return res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u),superAdmin:true});
  }
  if(!u){
    u={id:id('STU'),name:'New Student',phone:key,email:'',role:'student',status:'pending',purchased:[],enrollments:[],progress:{},demoOtp:p.otp,createdAt:new Date().toISOString()};
    d.users.push(u);
  }
  // One active session per phone/account. A fresh login invalidates the old device session.
  u.sessionToken=crypto.randomBytes(24).toString('hex');
  save(d);
  res.json({ok:true,token:u.sessionToken,user:sanitizeUser(u)});
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
  const already=d.applications.find(a=>a.studentId===u.id&&a.courseId===course.id&&['Pending','Payment Pending'].includes(a.status));
  if(already)return res.status(409).json({error:'You already have an application for this course.'});
  const a={id:id('APP'),studentId:u.id,courseId:course.id,courseTitle:course.title,fullName:req.body.fullName||u.name,phone:u.phone,email:req.body.email||u.email||'',country:req.body.country||'+91',address:req.body.address||'',city:req.body.city||'',qualification:req.body.qualification||'',profilePhoto:req.file?'/uploads/profiles/'+req.file.filename:(u.profilePhoto||''),status:'Payment Pending',createdAt:new Date().toISOString()};
  d.applications.unshift(a); save(d); res.json({ok:true,application:a});
});

app.post('/api/payment',requireStudent,upload.single('screenshot'),(req,res)=>{
  const d=load(),course=d.courses.find(c=>c.id===req.body.courseId),u=d.users.find(x=>x.id===req.user.id);
  if(!course||!u)return res.status(404).json({error:'Course or student not found'});
  if(!req.file)return res.status(400).json({error:'Payment screenshot is required.'});
  const appn=d.applications.find(a=>a.studentId===u.id&&a.courseId===course.id&&a.status==='Payment Pending');
  if(!appn)return res.status(400).json({error:'Submit the course application form first.'});
  const p={id:id('PAY'),studentId:u.id,studentName:u.name,courseId:course.id,courseTitle:course.title,amount:Number(course.price),utr:String(req.body.utr||''),screenshot:'/uploads/payments/'+req.file.filename,status:'Pending',createdAt:new Date().toISOString()};
  appn.status='Payment Submitted'; appn.paymentId=p.id; d.payments.unshift(p);
  d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'payment',title:'Payment submitted',text:`Your payment for ${course.title} is waiting for academy verification.`,createdAt:new Date().toISOString()});
  save(d); res.json({ok:true,payment:p});
});

app.get('/api/admin/check',requireAdmin,(req,res)=>res.json({ok:true}));

app.post('/api/admin/request-otp',(req,res)=>{
  const phone=String(req.body.phone||'').replace(/\D/g,'');
  if(phone!==String(process.env.SUPER_ADMIN_PHONE||'9858866415').replace(/\D/g,''))return res.status(403).json({error:'Only the Super Admin phone can use this login.'});
  const d=load(); const key='+91'+phone,otp='123456'; pendingOtps.set('ADMIN:'+key,{otp,expires:Date.now()+15*60*1000,attempts:0});
  res.json({ok:true,demoOtp:otp,academy:d.settings?.academyName||"Hafiz Shahid's Academy",expiresIn:900});
});
app.post('/api/admin/verify-otp',(req,res)=>{
  const phone=String(req.body.phone||'').replace(/\D/g,''); const otp=String(req.body.otp||'').trim(); const key='+91'+phone; const p=pendingOtps.get('ADMIN:'+key); if(!validOtpFormat(otp))return res.status(400).json({error:'Enter a valid OTP.'});
  if(phone!==String(process.env.SUPER_ADMIN_PHONE||'9858866415').replace(/\D/g,''))return res.status(403).json({error:'Only the Super Admin phone can use this login.'});
  if(!p||Date.now()>p.expires)return res.status(401).json({error:'OTP expired. Request a new OTP.'}); if(otp!==p.otp)return res.status(401).json({error:'Invalid OTP.'}); pendingOtps.delete('ADMIN:'+key);
  const d=load(); let u=d.users.find(x=>x.phone===key); if(!u){u={id:'SUPER-ADMIN-001',name:'Hafiz Shahid',phone:key,email:'',role:'superadmin',status:'active',enrollments:[],purchased:[],progress:{},createdAt:new Date().toISOString()};d.users.push(u);} u.role='superadmin';u.status='active';u.enrollments=d.courses.map(c=>({courseId:c.id,courseTitle:c.title,joiningDate:new Date().toISOString(),endDate:'2099-12-31T23:59:59.000Z',status:'active',paymentId:'SUPER-ADMIN'}));u.purchased=d.courses.map(c=>c.id);
  const token=crypto.randomBytes(32).toString('hex'); adminSessions.add(token); u.adminSessionIssuedAt=new Date().toISOString(); save(d); res.json({ok:true,token,admin:sanitizeUser(u),superAdmin:true});
});

app.post('/api/admin/login',(req,res)=>res.status(410).json({error:'Password admin login is disabled. Use the Super Admin phone OTP.'}));
app.get('/api/admin-state',requireAdmin,(req,res)=>res.json(adminState()));

app.post('/api/admin/payment/:id/approve',requireAdmin,(req,res)=>{
  const d=load(),p=d.payments.find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.status==='Approved')return res.json({ok:true});
  const u=d.users.find(x=>x.id===p.studentId),c=d.courses.find(x=>x.id===p.courseId); if(!u||!c)return res.status(404).json({error:'Student/course missing'});
  const start=new Date(); const end=new Date(addDays(start,durationDays(c.duration)));
  u.status='active'; u.enrollments=u.enrollments||[];
  const existing=u.enrollments.find(e=>e.courseId===c.id);
  const enrollment={courseId:c.id,courseTitle:c.title,joiningDate:start.toISOString(),endDate:end.toISOString(),status:'active',paymentId:p.id,amount:p.amount};
  if(existing)Object.assign(existing,enrollment); else u.enrollments.push(enrollment);
  u.purchased=[...new Set([...(u.purchased||[]),c.id])];
  p.status='Approved'; p.approvedAt=start.toISOString(); p.joiningDate=start.toISOString(); p.endDate=end.toISOString();
  const appn=d.applications.find(a=>a.paymentId===p.id); if(appn)appn.status='Approved';
  const receipt={id:id('REC'),studentId:u.id,studentName:u.name,courseId:c.id,courseTitle:c.title,amount:p.amount,utr:p.utr,paymentDate:start.toISOString(),joiningDate:start.toISOString(),endDate:end.toISOString(),receiptNo:'HSA-'+Date.now()};
  d.receipts.unshift(receipt);
  d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'course',title:'Course unlocked',text:`${c.title} is now active until ${end.toLocaleDateString('en-IN')}. Your receipt is ready.`,createdAt:start.toISOString()});
  d.notifications.unshift({id:id('MAIL'),studentId:u.id,type:'email',title:'Email notification queued',text:`Payment received for ${c.title}. Receipt ${receipt.receiptNo} generated.`,createdAt:start.toISOString(),channel:'email'});
  save(d); res.json({ok:true,receipt});
});
app.post('/api/admin/payment/:id/reject',requireAdmin,(req,res)=>{ const d=load(),p=d.payments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});p.status='Rejected';p.rejectedAt=new Date().toISOString();const a=d.applications.find(x=>x.paymentId===p.id);if(a)a.status='Payment Pending';d.notifications.unshift({id:id('NOT'),studentId:p.studentId,type:'payment',title:'Payment needs attention',text:'Your payment submission was rejected. Please contact the academy and resubmit.',createdAt:new Date().toISOString()});save(d);res.json({ok:true}); });


app.post('/api/admin/teacher',requireAdmin,upload.single('photo'),(req,res)=>{const d=load();const t={id:id('TEACH'),name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),email:String(req.body.email||'').trim(),subject:String(req.body.subject||'').trim(),role:'teacher',photo:req.file?'/uploads/profiles/'+req.file.filename:'',createdAt:new Date().toISOString()};if(!t.name)return res.status(400).json({error:'Teacher name is required.'});d.teachers.unshift(t);save(d);res.json({ok:true,teacher:t});});
app.post('/api/admin/teacher/:id/delete',requireAdmin,(req,res)=>{const d=load();d.teachers=d.teachers.filter(t=>t.id!==req.params.id);save(d);res.json({ok:true});});
app.post('/api/admin/message-log',requireAdmin,(req,res)=>{const d=load();const item={id:id('MSG'),channel:req.body.channel||'whatsapp',audience:req.body.audience||'individual',studentIds:Array.isArray(req.body.studentIds)?req.body.studentIds:[],subject:req.body.subject||'',message:req.body.message||'',createdAt:new Date().toISOString()};d.messageLogs.unshift(item);save(d);res.json({ok:true,message:item});});

app.post('/api/admin/course',requireAdmin,upload.single('cover'),(req,res)=>{
  const d=load(); const c={id:id('COURSE'),title:req.body.title,category:req.body.category||'General',price:Number(req.body.price||0),oldPrice:Number(req.body.oldPrice||0),description:req.body.description||'',level:req.body.level||'All Levels',duration:req.body.duration||'30 days',image:req.file?'/uploads/covers/'+req.file.filename:(req.body.image||''),startDate:req.body.startDate||'',lessons:[],createdAt:new Date().toISOString()}; d.courses.push(c); save(d); res.json({ok:true,course:c});
});
app.post('/api/admin/course/:id/edit',requireAdmin,upload.single('cover'),(req,res)=>{const d=load(),c=d.courses.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Course not found'});for(const k of ['title','category','description','level','duration','startDate'])if(req.body[k]!==undefined)c[k]=req.body[k];if(req.body.price!==undefined)c.price=Number(req.body.price);if(req.body.oldPrice!==undefined)c.oldPrice=Number(req.body.oldPrice);if(req.file)c.image='/uploads/covers/'+req.file.filename;else if(req.body.image)c.image=req.body.image;save(d);res.json({ok:true,course:c});});
app.post('/api/admin/course/:id/delete',requireAdmin,(req,res)=>{const d=load();d.courses=d.courses.filter(c=>c.id!==req.params.id);save(d);res.json({ok:true});});

app.post('/api/admin/lesson',requireAdmin,upload.single('file'),(req,res)=>{const d=load(),c=d.courses.find(x=>x.id===req.body.courseId);if(!c)return res.status(404).json({error:'Course not found'});let type=req.body.type||'youtube',video=req.body.video||'';if(req.file){type='upload';video='/uploads/videos/'+req.file.filename;}const l={id:id('LESSON'),title:req.body.title,type,video,free:req.body.free==='true',description:req.body.description||'',createdAt:new Date().toISOString()};c.lessons=c.lessons||[];c.lessons.push(l);d.notifications.push(...d.users.filter(u=>u.role==='student'&&isActiveEnrollment(d,u,c.id)).map(u=>({id:id('NOT'),studentId:u.id,type:'class',title:'New recorded class',text:`A new class “${l.title}” was added to ${c.title}.`,createdAt:new Date().toISOString(),channel:'in-app'})));save(d);res.json({ok:true,lesson:l});});
app.post('/api/admin/material',requireAdmin,upload.single('file'),(req,res)=>{const d=load();if(!req.file)return res.status(400).json({error:'File required'});const m={id:id('MAT'),courseId:req.body.courseId,title:req.body.title,file:'/uploads/materials/'+req.file.filename,originalName:req.file.originalname,size:req.file.size,createdAt:new Date().toISOString()};d.materials.unshift(m);d.notifications.push(...d.users.filter(u=>u.role==='student'&&isActiveEnrollment(d,u,m.courseId)).map(u=>({id:id('NOT'),studentId:u.id,type:'material',title:'New study material',text:`New study material “${m.title}” is available.`,createdAt:new Date().toISOString()})));save(d);res.json({ok:true,material:m});});
app.post('/api/admin/assignment',requireAdmin,(req,res)=>{const d=load();const a={id:id('ASG'),courseId:req.body.courseId,title:req.body.title,description:req.body.description||'',dueDate:req.body.dueDate||'',points:Number(req.body.points||10)};d.assignments.unshift(a);save(d);res.json({ok:true,assignment:a});});
app.post('/api/assignment/submit',requireStudent,upload.single('file'),(req,res)=>{const d=load(),a=d.assignments.find(x=>x.id===req.body.assignmentId);if(!a)return res.status(404).json({error:'Assignment not found'});if(!isActiveEnrollment(d,req.user,a.courseId))return res.status(403).json({error:'Course access is inactive.'});const old=d.submissions.find(x=>x.assignmentId===a.id&&x.studentId===req.user.id);const item={id:old?old.id:id('SUB'),assignmentId:a.id,studentId:req.user.id,answer:req.body.answer||'',file:req.file?'/uploads/assignments/'+req.file.filename:(old?.file||''),status:'Submitted',submittedAt:new Date().toISOString(),score:null,feedback:''};if(old)Object.assign(old,item);else d.submissions.push(item);save(d);res.json({ok:true,submission:item});});
app.post('/api/admin/submission/:id/grade',requireAdmin,(req,res)=>{const d=load(),s=d.submissions.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Submission not found'});s.score=Number(req.body.score||0);s.feedback=req.body.feedback||'';s.status='Graded';d.notifications.unshift({id:id('NOT'),studentId:s.studentId,type:'assignment',title:'Assignment graded',text:`Your assignment has been graded: ${s.score} points.`,createdAt:new Date().toISOString()});save(d);res.json({ok:true});});
app.post('/api/admin/live',requireAdmin,(req,res)=>{const d=load();const l={id:id('LIVE'),courseId:req.body.courseId,title:req.body.title,date:req.body.date,time:req.body.time,zoom:req.body.zoom,recording:req.body.recording||'',status:'Upcoming'};d.liveClasses.unshift(l);d.notifications.push(...d.users.filter(u=>u.role==='student'&&isActiveEnrollment(d,u,l.courseId)).map(u=>({id:id('NOT'),studentId:u.id,type:'live',title:'New live class scheduled',text:`${l.title} is scheduled for ${l.date} at ${l.time}.`,createdAt:new Date().toISOString()})));save(d);res.json({ok:true,live:l});});
app.post('/api/admin/announcement',requireAdmin,(req,res)=>{const d=load();const a={id:id('ANN'),title:req.body.title,text:req.body.text,createdAt:new Date().toISOString()};d.announcements.unshift(a);save(d);res.json({ok:true,announcement:a});});
app.post('/api/admin/post',requireAdmin,upload.single('imageFile'),(req,res)=>{const d=load();const p={id:id('POST'),title:req.body.title,text:req.body.text||'',image:req.file?'/uploads/materials/'+req.file.filename:(req.body.image||''),createdAt:new Date().toISOString()};d.posts.unshift(p);save(d);res.json({ok:true,post:p});});
app.post('/api/admin/branding',requireAdmin,upload.fields([{name:'hero',maxCount:1},{name:'logo',maxCount:1}]),(req,res)=>{const d=load();d.settings=d.settings||{};for(const [field,files] of Object.entries(req.files||{})){if(files[0])d.settings[field==='hero'?'heroImage':'logo']='/uploads/branding/'+files[0].filename;}if(req.body.academyName)d.settings.academyName=req.body.academyName;if(req.body.tagline)d.settings.tagline=req.body.tagline;save(d);res.json({ok:true,settings:d.settings});});
app.post('/api/admin/settings',requireAdmin,(req,res)=>{const d=load();d.settings={...d.settings,...req.body};save(d);res.json({ok:true,settings:d.settings});});
app.post('/api/progress',requireStudent,(req,res)=>{const d=load(),u=d.users.find(x=>x.id===req.user.id),cid=req.body.courseId;if(!isActiveEnrollment(d,u,cid))return res.status(403).json({error:'Course access is inactive.'});const p=Math.max(0,Math.min(100,Number(req.body.progress||0)));u.progress=u.progress||{};u.progress[cid]=p;if(p>=80){const existing=d.certificates.find(c=>c.studentId===u.id&&c.courseId===cid);if(!existing){const c=d.courses.find(c=>c.id===cid);d.certificates.unshift({id:id('CERT'),certificateNo:'HSA-CERT-'+Date.now(),studentId:u.id,studentName:u.name,courseId:cid,courseTitle:c?.title||'',issuedAt:new Date().toISOString(),progress:p});d.notifications.unshift({id:id('NOT'),studentId:u.id,type:'certificate',title:'Certificate unlocked',text:`Congratulations! Your ${c?.title||'course'} certificate is ready at 80% completion.`,createdAt:new Date().toISOString()});}}save(d);res.json({ok:true,progress:p});});
app.get('/api/certificates',requireStudent,(req,res)=>{const d=load();res.json({certificates:d.certificates.filter(c=>c.studentId===req.user.id)});});

app.get('/api/receipt/:id',requireStudent,(req,res)=>{const d=load(),r=d.receipts.find(x=>x.id===req.params.id&&x.studentId===req.user.id);if(!r)return res.status(404).send('Receipt not found');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>${r.receiptNo}</title><style>body{font-family:Arial;background:#f4f7fb;padding:30px}.box{max-width:720px;margin:auto;background:#fff;padding:35px;border-radius:18px;box-shadow:0 15px 50px #0001}h1{color:#0a1b35}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}.ok{color:#087f5b;font-weight:bold}</style></head><body><div class="box"><h1>Hafiz Shahid's Academy</h1><p>Payment Receipt</p><div class="row"><b>Receipt No.</b><span>${r.receiptNo}</span></div><div class="row"><b>Student</b><span>${r.studentName}</span></div><div class="row"><b>Course</b><span>${r.courseTitle}</span></div><div class="row"><b>Amount Paid</b><span>₹${Number(r.amount).toLocaleString('en-IN')}</span></div><div class="row"><b>Payment Date</b><span>${new Date(r.paymentDate).toLocaleString('en-IN')}</span></div><div class="row"><b>Joining Date</b><span>${new Date(r.joiningDate).toLocaleDateString('en-IN')}</span></div><div class="row"><b>Course Access Ends</b><span>${new Date(r.endDate).toLocaleDateString('en-IN')}</span></div><div class="row"><b>UTR</b><span>${r.utr||'—'}</span></div><p class="ok">Payment verified • Course access activated</p><button onclick="window.print()">Print / Save PDF</button></div></body></html>`);});

app.get('/api/admin/logout',requireAdmin,(req,res)=>{adminSessions.delete(req.headers['x-admin-token']);res.json({ok:true});});
app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'index.html')));

async function start(){
  try {
    const store = await initStore();
    app.listen(PORT,'0.0.0.0',()=>console.log(`Hafiz Shahid's Academy running on port ${PORT} (${store.mode} storage)`));
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}
process.on('SIGTERM', async ()=>{ try{ await flush(); } finally { process.exit(0); } });
process.on('SIGINT', async ()=>{ try{ await flush(); } finally { process.exit(0); } });
start();
