# Minimal Focus Pomodoro

Animated pomodoro timer with GIF or YouTube atmospheres (with mute/unmute + volume), optional YouTube background music with volume/mute, Tailwind styling, and optional Gemini quote generation for break inspiration.

## Features
- Focus / Short Break / Long Break modes with animated progress ring.
- Atmosphere selector for each category (focus, break) with thumbnails and YouTube badges.
- Manage Atmosphere panel: add (upload GIF/image or paste YouTube video/playlist/live), rename, replace image/link, delete (keeps at least one per category), collapse/expand.
- YouTube atmospheres can be toggled mute/unmute and adjusted with a volume slider from the Manage panel; separate YouTube background music input with its own volume/mute/clear controls.
- One-click master mute/unmute plus a persistent top-right settings toggle for quick access.
- Optional Gemini quote generator during breaks (needs API key).
- Settings (times, atmospheres, YouTube sound, music, Gemini API key) persist in browser localStorage for next visits.

## Getting started
```bash
npm install
npm run dev
```
Open the URL from the terminal (default http://localhost:5173).

## Build
```bash
npm run build
npm run preview
```

## Gemini setup (optional)
1) Get an API key from Google AI Studio.  
2) In the Manage Atmosphere panel, paste the key into the “Gemini API Key” field (stored in your browser localStorage).  
3) Quotes generate only in break modes; button is disabled while the timer is running.

## Usage tips
- Switch modes with the buttons at the bottom.
- Pick an Atmosphere via the thumbnails; Manage panel lets you add/edit/delete, upload images/GIFs or use YouTube links, toggle/adjust YouTube sound, and set/volume/mute/clear background music from YouTube.
- Collapse/expand the Manage panel using the header button (sound toggle lives inside).
- Timer controls: Play/Pause in the center, Reset on the left. Quotes clear when switching modes.

## Tech stack
- Vite + React 19
- Tailwind CSS
- lucide-react icons
