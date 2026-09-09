from pathlib import Path
p=Path('/mnt/data/hsa_edit2/server.js')
s=p.read_text()
# insert chunk upload endpoints after upload middleware/static area, before public-state
needle="app.get('/api/public-state',(req,res)=>res.json(publicState()));"
insert=r'''// Chunked video upload: keeps the admin UI responsive and avoids one huge request timing out.
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
app.post('/api/admin/lesson-uploaded',requireAdmin,async(req,res)=>{
  const d=load(),c=d.courses.find(x=>x.id===req.body.courseId);
  if(!c)return res.status(404).json({error:'Course not found'});
  const l={id:id('LESSON'),title:String(req.body.title||'').trim(),type:'upload',video:String(req.body.video||''),description:req.body.description||'',free:String(req.body.free)==='true'};
  if(!l.title||!l.video)return res.status(400).json({error:'Lesson title and uploaded video are required.'});
  c.lessons=c.lessons||[];c.lessons.push(l);await save(d);res.json({ok:true,lesson:l});
});
setInterval(()=>{const cutoff=Date.now()-30*60*1000;for(const [k,v] of videoUploads){if(v.createdAt<cutoff){try{fs.unlinkSync(v.temp)}catch{}videoUploads.delete(k)}}},10*60*1000).unref();

'''
if needle not in s: raise SystemExit('needle missing')
s=s.replace(needle,insert+needle)
p.write_text(s)

# patch admin JS addLesson to chunk upload and generic saving UI
p=Path('/mnt/data/hsa_edit2/admin.html'); s=p.read_text()
old="async function addLesson(e){e.preventDefault();const fd=new FormData();fd.append('courseId',$('lcourse').value);fd.append('title',$('ltitle').value);fd.append('type',$('ltype').value);fd.append('video',$('lyoutube').value);fd.append('description',$('ldesc').value);fd.append('free',$('lfree').checked);fd.append('uploadType','videos');if($('lfile').files[0])fd.append('file',$('lfile').files[0]);try{await api('/api/admin/lesson',{method:'POST',body:fd});e.target.reset();lessonType();toast('Recorded class added and active students notified.');await refresh()}catch(e){toast(e.message)}}"
new=r'''async function addLesson(e){
  e.preventDefault();
  const btn=e.target.querySelector('button[type="submit"]')||e.target.querySelector('button.primary');
  const old=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const file=$('lfile').files[0];
    if(file && $('ltype').value==='upload'){
      const started=await api('/api/admin/video-upload/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size})});
      const chunkSize=4*1024*1024; let sent=0;
      while(sent<file.size){
        const blob=file.slice(sent,Math.min(sent+chunkSize,file.size));
        const r=await fetch('/api/admin/video-upload/chunk',{method:'POST',headers:{'x-admin-token':adminToken,'x-upload-id':started.uploadId,'Content-Type':'application/octet-stream'},body:blob});
        let j={};try{j=await r.json()}catch{} if(!r.ok)throw Error(j.error||'Video upload failed.');
        sent+=blob.size;
        if(btn)btn.textContent=`Uploading… ${Math.round(sent/file.size*100)}%`;
      }
      const done=await api('/api/admin/video-upload/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:started.uploadId})});
      await api('/api/admin/lesson-uploaded',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:$('lcourse').value,title:$('ltitle').value,video:done.video,description:$('ldesc').value,free:$('lfree').checked})});
    }else{
      const fd=new FormData();fd.append('courseId',$('lcourse').value);fd.append('title',$('ltitle').value);fd.append('type',$('ltype').value);fd.append('video',$('lyoutube').value);fd.append('description',$('ldesc').value);fd.append('free',$('lfree').checked);fd.append('uploadType','videos');
      await api('/api/admin/lesson',{method:'POST',body:fd});
    }
    e.target.reset();lessonType();toast('Recorded class saved successfully.');await refresh();
  }catch(err){toast(err.message||'Unable to save recorded class.');}
  finally{if(btn){btn.disabled=false;btn.textContent=old||'Save';}}
}'''
if old not in s: print('old addLesson not found')
else: s=s.replace(old,new)
# Generic admin api: no-cache, timeout not needed; add Accept and avoid stale GETs
s=s.replace("async function api(u,o={}){o.headers={...(o.headers||{}),...(adminToken?{'x-admin-token':adminToken}:{})};const r=await fetch(u,o);", "async function api(u,o={}){o.headers={Accept:'application/json',...(o.headers||{}),...(adminToken?{'x-admin-token':adminToken}:{})};if(o.method==='GET'||!o.method)o.cache='no-store';const r=await fetch(u,o);")
p.write_text(s)
