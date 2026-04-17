# Manga/Manhwa Reader

A comprehensive Manga and Manhwa reader web application that aggregates content from multiple sources including MangaDex, MangaHere, ComicK, and others.

## Architecture

- **Frontend:** React 19 + TypeScript, Tailwind CSS 4, Framer Motion, Shadcn UI components
- **Backend:** Express.js server (`server.ts`) acting as a proxy for manga APIs and images to bypass CORS/Referer restrictions
- **Build Tool:** Vite 6
- **Database/Auth:** Firebase (Firestore for caching/library, Firebase Auth for users)
- **AI:** Google Gemini (`@google/genai`) for metadata/recommendations
- **Package Manager:** npm

## Project Structure

```
/
├── server.ts          # Express server + Vite middleware (dev) / static serving (prod)
├── vite.config.ts     # Vite configuration
├── src/
│   ├── components/    # UI components (Navbar, MangaCard, shadcn/ui)
│   ├── pages/         # Main pages (Home, Search, ManhwaDetails, Reader, Library)
│   ├── services/      # API orchestrators (MangaDex, MangaHere, ComicK, etc.)
│   ├── lib/           # Firebase setup, utilities
│   └── hooks/         # Custom React hooks
├── firebase-applet-config.json  # Firebase project configuration
└── firestore.rules    # Firestore security rules
```

## Running the App

- **Development:** `npm run dev` — starts Express + Vite dev server on port 5000
- **Build:** `npm run build` — builds the React frontend to `dist/`
- **Production:** `npx tsx server.ts` with `NODE_ENV=production` — serves built files

## Key Features

- Multi-source manga aggregation with orchestrator pattern
- Image proxy server to bypass CDN restrictions
- Firebase-backed user library and search caching
- Chapter reader with multiple source fallbacks

## MangaHere Integration Notes

MangaHere mobile site (`newm.mangahere.cc`) uses P.A.C.K.E.R obfuscation for chapter images:
- **Variable name:** `newImgs` (NOT `newImgList` — completely different from older desktop format)
- **Page count:** `var imagecount=N` (NOT `total_pages`)
- **CDN URL format:** `//zjcdn.mangahere.org/store/manga/{comicid}/{chapter}.0/compressed/{filename}.jpg`
- **Extraction:** `depackPACKER()` function in both `mangahereService.ts` and `server.ts` decodes the eval(function(p,a,c,k,e,d){}) block
- **URL regex:** Must exclude backslashes (`[^'"\\]`) because `\'` escape sequences in packed JS leave a trailing `\` before closing quotes
- **Fallback:** Per-page proxy via `/api/proxy-mangahere-image` extracts correct image from each page's packed JS

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini API key for AI features
- `APP_URL` — The hosted URL of the app

## Ports

- Port 5000: Combined Express + Vite server (frontend + API proxy)
