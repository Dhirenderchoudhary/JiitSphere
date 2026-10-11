# JiitSphere Connect

Lets students sign in to JiitSphere with their JIIT Google account.

Google only accepts the college's sign-in client on the official portal, so
JiitSphere can't show that button itself. When a student clicks **Continue with
Google** on JiitSphere, this extension opens the portal in a new tab. The
student signs in there as usual. The extension passes the portal session back
to the JiitSphere tab and closes the portal tab.

It only hands over a session for a portal tab that JiitSphere opened. Logins on
the portal at any other time are ignored.

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension` folder.
3. Open JiitSphere at `http://localhost:3000/login` or `https://jiitsphere.com/login`.

To support another JiitSphere domain, add it to the third `matches` list in
`manifest.json`.

## Publish to the Chrome Web Store

Bump `version` in `manifest.json`, then build the upload zip from this folder:

```sh
zip -r ../jiitsphere-connect.zip . -x README.md
```
