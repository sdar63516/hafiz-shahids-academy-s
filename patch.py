from pathlib import Path
p=Path('/mnt/data/hsa_edit2/app.js')
s=p.read_text()
old="""$('content').innerHTML=`<section class=\"hero reveal\"><div class=\"hero-copy\"><div class=\"eyebrow\">HAFIZ SHAHID'S ACADEMY</div><h1>Learn today.<br><span>Grow for life.</span></h1><p>Recorded classes, live Zoom sessions, assignments, study material and certificates — built around your learning journey.</p><div class=\"row\"><button class=\"primary\" onclick=\"go('courses')\">Explore Courses →</button><button class=\"outline\" onclick=\"go('purchased')\">My Learning</button></div><div class=\"hero-pills\"><span>✓ Student ID Login</span><span>✓ Verified Payments</span><span>✓ 80% Certificate</span></div></div><div class=\"hero-photo\" style=\"background-image:url('${DB.settings.heroImage||'/shahid.jpg'}')\"><div class=\"photo-tag\">Hafiz Shahid<br><small>Founder & Educator</small></div></div></section><div class=\"feature-strip\"><div>🎥<b>Recorded Classes</b><span>Upload MP4 or YouTube</span></div><div>📹<b>Live Classes</b><span>Join through Zoom</span></div><div>📝<b>Assignments</b><span>Submit & get graded</span></div><div>🏆<b>Certificates</b><span>Unlock at 80%</span></div></div><div class=\"page-head\"><div><div class=\"eyebrow\">YOUR JOURNEY</div><h1>Welcome, ${current.name||'Student'}</h1><p>Your active courses and latest academy updates.</p></div><button class=\"outline\" onclick=\"go('notifications')\">Notifications</button></div><div class=\"grid home-main-grid\"><div class=\"card\"><h3>Purchased Courses</h3>${mine.length?mine.map(e=>learningCard(e)).join(''):'<div class=\"empty\">No purchased courses yet.<br><button class=\"primary\" style=\"margin-top:12px\" onclick=\"go(\\'courses\\')\">Find a Course</button></div>'}</div><div class=\"card latest-posts-card\"><div class=\"latest-posts-head\"><h3>Latest Posts</h3><span class=\"latest-posts-hint\">Swipe / slide</span></div><div class=\"latest-posts-slider\" id=\"latestPostsSlider\">${postHtml}</div></div></div>`;"""
# Instead locate exact assignment boundaries robustly
start=s.index("function renderHome(){")
end=s.index("\nfunction learningCard", start)
new="""function renderHome(){
  const posts=DB.posts||[];
  const mine=(current.enrollments||[]).filter(e=>e.status==='active');
  const postHtml=posts.slice(0,6).map(latestPostCard).join('')||'<div class=\"empty\">No posts yet.</div>';
  $('content').innerHTML=`<section class=\"hero reveal\"><div class=\"hero-copy\"><div class=\"eyebrow\">HAFIZ SHAHID'S ACADEMY</div><h1>Learn today.<br><span>Grow for life.</span></h1><p>Recorded classes, live Zoom sessions, assignments, study material and certificates — built around your learning journey.</p><div class=\"row\"><button class=\"primary\" onclick=\"go('courses')\">Explore Courses →</button><button class=\"outline\" onclick=\"go('purchased')\">My Learning</button></div><div class=\"hero-pills\"><span>✓ Student ID Login</span><span>✓ Verified Payments</span><span>✓ 80% Certificate</span></div></div><div class=\"hero-photo\" style=\"background-image:url('${DB.settings.heroImage||'/shahid.jpg'}')\"><div class=\"photo-tag\">Hafiz Shahid<br><small>Founder & Educator</small></div></div></section>
  <div class=\"feature-strip\"><button type=\"button\" onclick=\"go('purchased')\">🎥<b>Recorded Classes</b><span>Open your recorded lessons</span></button><button type=\"button\" onclick=\"go('live')\">📹<b>Live Classes</b><span>Open scheduled Zoom classes</span></button><button type=\"button\" onclick=\"go('assignments')\">📝<b>Assignments</b><span>Open and submit assignments</span></button><button type=\"button\" onclick=\"go('certificates')\">🏆<b>Certificates</b><span>Open your certificates</span></button></div>
  <div class=\"page-head\"><div><div class=\"eyebrow\">YOUR JOURNEY</div><h1>Welcome, ${current.name||'Student'}</h1><p>Your active courses and latest academy updates.</p></div><button class=\"outline\" onclick=\"go('notifications')\">Notifications</button></div>
  <section class=\"card dashboard-section purchased-dashboard-section\"><div class=\"section-title-row\"><div><h3>Purchased Courses</h3><p class=\"small\">Your active courses</p></div></div><div class=\"purchased-square-grid\">${mine.length?mine.map(e=>learningCard(e)).join(''):'<div class=\"empty\">No purchased courses yet.<br><button class=\"primary\" style=\"margin-top:12px\" onclick=\"go(\\'courses\\')\">Find a Course</button></div>'}</div></section>
  <section class=\"card dashboard-section latest-posts-dashboard-section\"><div class=\"latest-posts-head\"><div><h3>Latest Posts</h3><p class=\"small\">Swipe or slide to see the latest updates</p></div><span class=\"latest-posts-hint\">Swipe / slide</span></div><div class=\"latest-posts-slider\" id=\"latestPostsSlider\">${postHtml}</div></section>`;
  startLatestPostsSlider();
}"""
s=s[:start]+new+s[end:]
# Make purchased dashboard cards square via separate markup in learningCard only on home
old2="function learningCard(e){const c=course(e.courseId);return `<div class=\"learning-card\"><div class=\"thumb\" style=\"background-image:url('${c?.image||'/shahid.jpg'}')\"></div><div><span class=\"badge\">${c?.category||'Course'}</span><h3>${c?.title||e.courseTitle}</h3><div class=\"small\">Access until ${new Date(e.endDate).toLocaleDateString('en-IN')}</div><div class=\"progress\" style=\"margin-top:10px\"><i style=\"width:${progress(e.courseId)}%\"></i></div><div class=\"small\" style=\"margin-top:5px\">${progress(e.courseId)}% complete</div></div><button class=\"primary\" onclick=\"openCourse('${e.courseId}')\">Continue</button></div>`}"
new2="function learningCard(e){const c=course(e.courseId);return `<article class=\"learning-card\"><div class=\"thumb\" style=\"background-image:url('${c?.image||'/shahid.jpg'}')\"></div><div class=\"learning-card-body\"><span class=\"badge\">${c?.category||'Course'}</span><h3>${c?.title||e.courseTitle}</h3><div class=\"small\">Access until ${new Date(e.endDate).toLocaleDateString('en-IN')}</div><div class=\"progress\" style=\"margin-top:10px\"><i style=\"width:${progress(e.courseId)}%\"></i></div><div class=\"small\" style=\"margin-top:5px\">${progress(e.courseId)}% complete</div><button class=\"primary wide\" onclick=\"openCourse('${e.courseId}')\">Continue Learning</button></div></article>`}"
if old2 not in s: print('learningCard old not found')
else: s=s.replace(old2,new2)
# Make renderCertificates non-blocking route safe: go can handle Promise but set active immediately. Add return promise no change.
p.write_text(s)

# CSS append targeted dashboard layout
css=Path('/mnt/data/hsa_edit2/style.css')
c=css.read_text()
c += r'''

/* Dashboard layout requested: purchased courses full width + square cards, latest posts below. */
.home-main-grid{display:block!important}
.dashboard-section{width:100%;max-width:100%;margin:0 0 18px;overflow:hidden}
.section-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.section-title-row h3{margin:0}
.section-title-row p{margin:3px 0 0}
.purchased-square-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.purchased-square-grid .learning-card{display:flex;flex-direction:column;gap:0;border:1px solid var(--line);border-radius:16px;padding:0;overflow:hidden;background:#fff;min-width:0;height:100%}
.purchased-square-grid .learning-card .thumb{width:100%;height:auto;aspect-ratio:1/1;border-radius:0;background-position:center;background-size:cover;flex:none}
.purchased-square-grid .learning-card-body{padding:13px;display:flex;flex-direction:column;flex:1;min-width:0}
.purchased-square-grid .learning-card h3{font-size:15px;margin:7px 0;line-height:1.25}
.purchased-square-grid .learning-card .wide{margin-top:auto;padding-top:11px;padding-bottom:11px}
.feature-strip>button{font:inherit;text-align:left;cursor:pointer;border:1px solid var(--line);color:inherit}
@media(max-width:900px){.purchased-square-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.purchased-square-grid{grid-template-columns:1fr 1fr;gap:10px}.purchased-square-grid .learning-card h3{font-size:13px}.purchased-square-grid .learning-card-body{padding:10px}.purchased-square-grid .learning-card .wide{font-size:11px}.dashboard-section{padding:13px}}
@media(max-width:390px){.purchased-square-grid{grid-template-columns:1fr}}
'''
css.write_text(c)
