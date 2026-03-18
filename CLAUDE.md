# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run preview` — Preview production build

No test framework is configured.

## Tech Stack

React 19 + Vite 7 + Tailwind CSS 3 + lucide-react icons. JavaScript (not TypeScript). UI text is primarily in Thai.

## Architecture

This is a single-page Pomodoro timer app with ambient atmosphere features. The entire application lives in **one monolithic component**: `src/App.jsx` (~1,500 lines).

### Core Systems in App.jsx

1. **Timer** — Three modes (Focus 25min / Short Break 5min / Long Break 15min) with SVG progress ring, breathing animation, and customizable durations (1-180 min). Mode config uses `MODES` constant with color-coded ring borders (rose/teal/indigo, safelisted in `tailwind.config.js`).

2. **Atmosphere Manager** — Each mode has its own set of backgrounds (GIF/image URLs or YouTube video/playlist embeds). Users can add, edit, delete atmospheres. Image uploads use blob URLs tracked via `blobUrlsRef` with cleanup on unmount.

3. **Audio System** — Two independent YouTube players (`bgPlayerRef` for background video, `musicPlayerRef` for background music) loaded via YouTube IFrame API (lazy singleton pattern). Master mute toggle preserves per-source volume state. Quality is force-escalated every 4 seconds via interval.

4. **Gemini AI Quotes** — Optional Google Gemini API integration for break-mode inspiration quotes. API key stored in localStorage (`geminiApiKey`). Uses exponential backoff retry.

5. **Persistence** — All state saved to localStorage under key `minimal-focus-state-v1`. Blob URLs are sanitized on reload.

### YouTube API Pattern

The YouTube IFrame API is loaded lazily via a singleton promise (`loadYouTubeAPI()`). Helper functions `parseYouTubeLink` and `buildYouTubeEmbed` handle various YouTube URL formats (video, playlist, shorts, live). Players are created/destroyed imperatively through refs.
