# Hafiz Shahid's Academy V4 — complete live deployment for beginners

## PART A — What you are going to do

You will use 3 websites:

1. GitHub — stores your code.
2. Neon — stores your academy database.
3. Render — runs your Node.js website and gives you a public HTTPS URL.

You do NOT need to buy hosting for this setup.

---

## PART B — Before uploading to GitHub

### 1. Download and extract this ZIP

Extract it. Inside you will see a folder named `hsa_v3`.

### 2. Open `hsa_v3` in VS Code

The folder must directly contain:

```text
package.json
server.js
db.js
render.yaml
public/
data/
```

Do not upload the outer ZIP folder as an extra level.

### 3. Migrate your current demo data

If you already added students/courses/teachers/payments in your working V3:

- Open your OLD working V3 folder.
- Open `data/db.json`.
- Copy that file.
- Replace V4's `data/db.json` with your old file.

Do this BEFORE the first V4 deployment. On the first database startup, V4 uses `data/db.json` as the seed if the PostgreSQL table is empty.

Do not copy `.env` or `node_modules` into GitHub.

---

## PART C — Create your free Neon database

### 4. Open Neon

Go to:

https://neon.com/

Create an account or sign in.

### 5. Create a project

Click **New Project**.

Use a name such as:

`hafiz-shahids-academy`

Create the project.

### 6. Copy the database connection string

Open your Neon project.

Click **Connect**.

Choose the connection-string option and copy the full PostgreSQL URL.

It looks similar to:

```text
postgresql://username:password@hostname/database?sslmode=require&channel_binding=require
```

KEEP THIS PRIVATE. Do not post it in WhatsApp, GitHub, screenshots or this chat.

You do NOT need to create tables manually. V4 creates its table automatically.

---

## PART D — Create GitHub repository

### 7. Open GitHub

Go to:

https://github.com/

Sign in.

### 8. Create a new repository

Click **+** → **New repository**.

Repository name:

`hafiz-shahids-academy`

You can choose Private. Private is recommended.

Click **Create repository**.

### 9. Upload the project

Open the new empty repository.

Click **Add file** → **Upload files**.

Open your V4 `hsa_v3` folder on your computer.

Select ALL files/folders inside it and drag them into GitHub.

The GitHub root must look like:

```text
package.json
server.js
db.js
render.yaml
README.md
public/
data/
```

IMPORTANT: `package.json` must NOT be inside another `hsa_v3` folder on GitHub.

Scroll down and click **Commit changes**.

---

## PART E — Create Render website

### 10. Open Render

Go to:

https://render.com/

Sign in with GitHub.

### 11. Create Web Service

Click **New +** → **Web Service**.

Connect your GitHub account if Render asks.

Select:

`hafiz-shahids-academy`

Click **Connect**.

### 12. Enter these settings

Name:

`hafiz-shahids-academy`

Runtime:

`Node`

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Plan:

`Free` (if available in your Render workspace).

Health Check Path:

```text
/api/health
```

### 13. DO NOT deploy yet if you have not added the database environment variable

Scroll to **Environment Variables**.

Add:

```text
NODE_ENV = production
```

```text
DATABASE_URL = YOUR_NEON_CONNECTION_STRING
```

```text
ADMIN_EMAIL = admin@hafizshahidsacademy.com
```

```text
ADMIN_PASSWORD = CREATE_A_STRONG_PASSWORD
```

```text
SUPER_ADMIN_PHONE = 9858866415
```

```text
DEMO_OTP = 123456
```

For `ADMIN_PASSWORD`, use your own strong password. Do NOT use the demo password on a public website.

### 14. Create the service

Click **Create Web Service**.

Render will install the packages and start the website.

Wait for the deployment to become **Live**.

---

## PART F — Check whether the database is connected

### 15. Open the Render URL

Render gives you a URL similar to:

```text
https://hafiz-shahids-academy.onrender.com
```

The exact URL will be shown by Render.

### 16. Test the health URL

Open:

```text
https://YOUR-RENDER-URL.onrender.com/api/health
```

You should see JSON containing:

```json
{
  "ok": true,
  "mode": "postgres"
}
```

If it says `"mode":"file"`, DATABASE_URL was not added correctly.

---

## PART G — Open the actual academy

Student website:

```text
https://YOUR-RENDER-URL.onrender.com/
```

Admin panel:

```text
https://YOUR-RENDER-URL.onrender.com/admin.html
```

---

## PART H — Super Admin login

Your Super Admin phone:

`9858866415`

Current demo OTP:

`123456`

After Super Admin login, the account has access to all courses.

The Admin panel also contains:

- Dashboard
- Applications
- Payments
- Students
- Courses
- Recorded Classes
- Study Material
- Assignments
- Live / Zoom
- Homepage Posts
- Branding
- Teachers
- Manual Messaging
- Notifications

---

## PART I — IMPORTANT about free hosting

Render Free web services can spin down after inactivity and wake up on the next request.

Render Free web-service files are ephemeral. Uploaded files in `public/uploads` can disappear after restarts/redeploys.

Therefore:

- Use YouTube links for recorded classes when possible.
- Do not treat local uploaded videos/PDFs as permanent production storage.
- Use object storage/CDN for permanent media in the next upgrade.

Neon is being used for the database because Render's Free Postgres currently expires after 30 days.

---

## PART J — If Render shows an error

Open:

Render → your service → **Logs**

Copy the red error lines or take a screenshot and send it to ChatGPT.

Do not randomly change commands.

The correct commands are:

```text
Build: npm install
Start: npm start
```

---

## PART K — If you want to update the website later

After the first deployment:

1. Change the files in VS Code.
2. Upload/commit the changed files to GitHub.
3. Render automatically deploys the new commit if Auto Deploy is enabled.
4. Wait for the new deploy to become Live.

Do not delete your Neon project when updating the website. The PostgreSQL data remains separate from the Render web service.
