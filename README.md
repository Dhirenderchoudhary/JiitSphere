# JiitSphere

JiitSphere is a site for students of Jaypee Institute of Information Technology,
Noida. It puts study material and your portal data (attendance, grades, exams)
in one place, and it is live at https://jiitsphere.com.

## What it does

**Study material.** Notes, slides, previous year papers and lab files, sorted by
degree, branch, year, semester, subject and type. PDFs and slides open in the
browser. Signing in with a college Google account (`@mail.jiit.ac.in`) gives
full access; guests get five views or downloads first.

**Portal data.** Attendance for every subject, with the day-by-day record and how
many classes you can still miss, plus grades, exam schedules, registered
subjects, fees and your profile. It all comes from the official JIIT web portal.

**Signing in to the portal.** The JIIT portal now signs students in with Google
only, and Google only allows that on the portal's own page. The JiitSphere
Connect extension for Chrome and Edge opens the portal, lets you sign in there
as usual, and hands the session back to JiitSphere. Phones can't run
extensions, so portal data needs a computer; everything else works on a phone.
Try Demo shows the dashboard with sample data and no account.

**Install as an app.** On Android and iPhone the site offers to install itself to
the home screen and then opens full screen.

## How the repository is laid out

| Folder | What it is | Where it runs |
|---|---|---|
| `web/` | Next.js 14 site (App Router, Tailwind CSS) | Vercel |
| `backend/` | Express API: study material, portal sessions, admin | Render |
| `extension/` | JiitSphere Connect, a Manifest V3 Chrome extension | Chrome Web Store |

Study material metadata lives in MongoDB. The files are on Cloudflare R2 behind
`files.jiitsphere.com`; the backend talks to R2 through its S3-compatible API.
Portal sessions are kept in memory on the backend and expire on their own.

## Running it locally

You need Node.js 22, pnpm and a MongoDB database (local or Atlas).

```bash
git clone https://github.com/Dhirenderchoudhary/JiitSphere.git
cd JiitSphere
pnpm install
```

Start the API:

```bash
cd backend
cp .env.example .env    # fill in MONGODB_URI, AUTH_SECRET and the storage keys
pnpm run dev
```

The backend checks its environment on startup and stops with a message naming
anything that is missing.

In a second terminal, start the site:

```bash
cd web
cp .env.local.example .env.local
pnpm run dev
```

The site runs on http://localhost:3000. To try portal sign-in locally, load
`extension/` unpacked in Chrome; its README explains the one change it needs for
localhost.

## Tests and checks

From the repository root:

```bash
pnpm run test:all    # backend and web tests
pnpm run lint:all    # ESLint for both packages
```

The same checks run on every pull request, and a Git hook runs the tests before
each push.

`pnpm --filter jiit-study-material-backend bench:portal` measures how long the
portal dashboard takes to load against a fake portal with a fixed delay per
request. Pass the delay in milliseconds as the first argument.

## Adding study material

Material is imported from a folder tree or from the storage bucket, both laid
out by degree, branch, year, semester and subject.

```bash
cd backend
pnpm run import:s3 StudyMaterial/ --dry-run    # preview an import from the bucket
pnpm run import:s3 StudyMaterial/              # import it
pnpm run import:folder <path> --dry-run        # preview an import from a folder
pnpm run normalize:metadata                    # report inconsistent metadata
pnpm run normalize:metadata:apply              # fix it
```

The first argument is the bucket prefix or folder. Pass it before any flags; a
bare `--` would be read as the prefix.

## Deploying

Merging to `main` deploys the site on Vercel and the API on Render.

If a bad backend deploy reaches production, roll it back from GitHub: open
Actions, choose **Deploy JiitSphere**, click **Run workflow**, and enter the ID of
the last good deploy from the Render dashboard (it looks like `dep-...`).

The Chrome extension is published separately. Its README covers building the
upload and the store listing.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
