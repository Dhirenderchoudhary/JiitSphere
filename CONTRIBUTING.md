# Contributing to JiitSphere

Thanks for helping. This guide covers setting up, what a pull request needs to
pass, and how changes are reviewed.

## Setting up

You need Node.js 22, pnpm 10 and a MongoDB database (local or Atlas).

```bash
git clone https://github.com/Dhirenderchoudhary/JiitSphere.git
cd JiitSphere
pnpm install
```

Then follow the backend and web READMEs to fill in their `.env` files and start
both: [backend](backend/README.md), [web](web/README.md). To work on portal
sign-in, load `extension/` unpacked in Chrome; see the
[extension README](extension/README.md).

You do not need a JIIT account for most work. **Try Demo** on the login page
shows the dashboard with sample data, and the backend tests replace the portal
with a mock.

## Making a change

1. Branch from `main`.
2. Keep each pull request to one change, so it can be reviewed and reverted on
   its own.
3. Add or update tests for behavior you change. A test should call the code
   the way its users do and check a literal result.
4. Fill in the pull request template: what changed, why, and how you checked it.

Pushing to `main` deploys to production, so every change goes through a pull
request.

## Checks

A pre-commit hook formats and lints the files you stage, and a pre-push hook
runs every test. CI runs the same checks on each pull request:

```bash
pnpm run lint:all   # ESLint for backend and web
pnpm run test:all   # Jest for backend and web
```

Each package also has `format:check` for Prettier, and the web app must pass
`pnpm run build`. A pull request needs all of these green before it is merged.

## Commit messages

Write the subject as a short imperative sentence that says what changes for a
user, for example "Retry a portal request once when the portal briefly fails".
Use the body to explain why, and what you measured or checked.

## Handling student data

The backend holds students' JIIT portal sessions. Never log a portal token, a
JiitSphere token or a student's personal details, and never commit real
credentials or `.env` files. Report security problems privately, as described
in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [GPL-3.0-or-later](LICENSE) license.
