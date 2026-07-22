# Waypoint

Waypoint is a private-first personal goal tracker that turns large goals into clear, nested steps. It is responsive on phones and computers and includes an installable web-app manifest.

## What it does

- Create, edit, complete, and delete goals.
- Break any goal into sub-goals, then keep nesting steps as deeply as needed.
- Roll completed steps up into automatic goal and overall progress.
- Track target dates and overdue goals.
- See goal deadlines in a responsive in-app month calendar.
- Add private calendar events alongside goal deadlines.
- Export deadlines and events as an `.ics` file for Google Calendar, Apple Calendar, Outlook, and other calendar apps.
- Surface one suggested next step on the Today view.
- Search goals and keep a record of completed goals.
- Save automatically in the current browser.
- Export a JSON backup and restore it on another device.
- Work offline after the installed app has been opened once.

## Privacy and device behavior

Waypoint has no account, analytics, or cloud database. Goal and calendar data is stored only in the browser on the current device. Use **Backup** on one device and **Restore** on another to transfer a copy. The two copies do not automatically sync.

Calendar export creates an importable copy in another calendar app; it is not automatic two-way sync. A future two-way sync option would require signing into a calendar provider and granting calendar access.

## Run locally

This project uses Node.js 22+.

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal.

## Build

```bash
npm run build
```

## Build downloadable desktop apps with GitHub

The project includes a separate static desktop entry point, a Tauri 2 wrapper, and a manual GitHub Actions workflow. GitHub can build Windows, macOS, and Linux installers without requiring Rust or Visual Studio on your computer.

See [`GITHUB_BUILD_GUIDE.md`](GITHUB_BUILD_GUIDE.md) for the complete click-by-click walkthrough.

The main commands used by the cloud build are:

```bash
npm run desktop:build
npm run tauri build
```

## Install on a device

After the app is served over HTTPS:

- **iPhone/iPad:** open it in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open it in Chrome and choose **Install app**.
- **Windows/macOS:** open it in Chrome or Edge and use the install icon in the address bar.

## Main files

- `app/GoalTracker.tsx` — goal and calendar data, local storage, calendar export, and interactions.
- `app/globals.css` — responsive mobile and desktop design.
- `public/manifest.webmanifest` — installable app settings.
- `public/sw.js` — offline app shell caching.
