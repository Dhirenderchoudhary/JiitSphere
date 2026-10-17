# Security policy

JiitSphere holds students' sessions with the official JIIT web portal, so
security problems are taken seriously.

## Reporting a problem

Please do not open a public issue. Report it privately through GitHub: open the
repository's **Security** tab and choose **Report a vulnerability**. Include
what you found, the steps to reproduce it, and what an attacker could do with
it.

You should hear back within a week. Once a fix is deployed, you will be
credited in the fix unless you prefer not to be.

## What is in scope

- jiitsphere.com and its API
- The JiitSphere Connect browser extension
- The code in this repository

Problems in the official JIIT web portal itself belong to JIIT, not to this
project.

## How student data is protected

- Portal sessions saved for restarts are encrypted with AES-256-GCM, with a key
  derived from the server's `AUTH_SECRET`.
- A Google sign-in captured by the extension is accepted only after the portal
  confirms the token belongs to the same student.
- Phone link codes are single use, expire after two minutes, and are stored
  only as hashes.
- The extension hands over a sign-in only from a portal tab JiitSphere opened.
