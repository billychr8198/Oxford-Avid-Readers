# The Reader's Register

A personal reading tracker where reading builds a university. Log the pages and
chapters of every book you finish, and watch the University of Oxford climb from a
struggling institution to first in the world.

Everything runs in the browser. No build step, no server, no account, no tracking.
Your register is saved in your own browser's local storage and never leaves your device.

---

## How it works

| You do this | This happens |
|---|---|
| Finish a chapter | A notable Oxford alumnus is admitted to Convocation, drawn at random |
| Finish chapter 151 and beyond | One Oxford Union lecture opens for every 3 further chapters |
| Read past 390 chapters | Every extra chapter adds **+3%** to all seven indicators |
| Read a page | The seven indicators advance by **0.25%** of their remaining gap |
| Archive a book | **3 colleges** open on the plan of Oxford |
| Archive 13 books | Oxford is declared the best university in the world |

The numbers interlock exactly: **150 alumni** (one per chapter) → **80 lectures ×
3 chapters = 240** more → **390** chapters total, after which surplus chapters pay a
bonus. **39 colleges ÷ 3 per book = 13 books.**

### The seven indicators

Each page closes 0.25% of the gap between a struggling institution and a world-leading
one, so early progress is quick and the last stretch grinds. At the default rate, full
standing takes **5,207 pages** — roughly thirteen 400-page books.

| Indicator | Starts at | World-class target | Behaviour |
|---|---|---|---|
| Endowment | £45m | £8.4bn | Moves first; benefactions compound |
| Annual income | £68m | £3.05bn | Follows the endowment |
| Acceptance rate | 92% | 15.6% | Falls as reputation rises |
| QS world ranking | #1,401 | #1 | The stubbornest number; moves last |
| Graduate employability | 18.4 | 100.0 | Employers notice early |
| Academic reputation | 12.7 | 100.0 | Built slowly |
| Sustainability | 9.5 | 100.0 | Lags hardest — medieval stone is slow to retrofit |

Money and rankings interpolate in log space, which is how they actually move. Each
indicator bends the same underlying progress curve by its own exponent, so they diverge
realistically rather than marching in lockstep.

### Randomisation

At first run each reader gets a random seed, which shuffles three private queues
(alumni, lectures, colleges). Unlocks are drawn from the front of those queues, so:

- every draw is random,
- **nothing ever repeats** — not within a book, not across all thirteen,
- each reader gets a different order,
- and the same reader's order is stable across sessions.

Unlocks are recomputed from your totals rather than accumulated, so un-ticking a chapter
cleanly releases exactly what it granted. Nothing drifts or double-counts.

---

## Tabs

- **Register** — the masthead, your tallies, what the next chapter buys, the seven
  indicators, and a feed of recent unlocks.
- **Reading** — add books, log pages, tick chapters, write reviews, rate, archive.
- **Library** — the archive of everything you have finished.
- **Alumni** — all 150, locked until admitted, each with its full written entry.
- **Colleges** — an interactive plan of Oxford. Drag to pan, scroll or pinch to zoom,
  tap a college for its write-up and photograph.
- **Lectures** — 80 Oxford Union talks, embedded through `youtube-nocookie.com` and
  loaded only when you press play.
- **Settings** — every rule above is editable and applies immediately.

---

## Settings

All of these are live; changing one recomputes the register on the spot.

- Reader name
- Theme (Night / Day) and Motion (Full / Calm)
- Show or hide the names of locked alumni
- Confirm before removing a book
- Advance per page, bonus per surplus chapter, alumni to admit, chapters per lecture,
  colleges per archived book, books to finish the game
- Restore the brief's defaults
- Export your register to JSON, import it back, or erase everything

---

## Running it

Open `index.html`. That is all — it works straight from the file system.

To publish on GitHub Pages:

1. Create a repository and push these files to the default branch.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch
   and the `/ (root)` folder.
3. Your site appears at `https://<user>.github.io/<repo>/`.

All paths are relative, so it works in a subdirectory. `.nojekyll` is included so GitHub
serves every file untouched.

---

## Layout

```
index.html              the shell
styles.css              design system: Oxford blue, vellum, gilt, oxblood
js/core.js              storage, seeded RNG, unlock engine, indicator maths
js/map.js               georeferenced plan of Oxford, collision-avoiding labels
js/ui.js                views, rendering, events
data/alumni.js          150 entries parsed from the source markdown
data/colleges.js        39 entries with real coordinates and founding years
data/videos.js          80 Oxford Union lectures
assets/oxford-mark.png  the full lockup, used in the rail
assets/oxford-crest.png the crest and laurels: masthead, ceremony, favicon
assets/oxford-plan.jpg  the georeferenced street plan
assets/alumni/          149 portraits
assets/colleges/        38 college photographs
```

Data is served as plain `window.X = …` scripts rather than JSON so the page also works
from `file://`, where `fetch` would be blocked by CORS.

---

## Content and credits

- Alumni entries and college write-ups are parsed directly from the supplied markdown.
- Portraits and college photographs come from the supplied archive, resized and
  recompressed from 196 MB to about 17 MB so the repository stays within GitHub's limits.
- Two entries have no image — **Thomas Bradwardine** and **Green Templeton College** —
  and are given a generated armorial plate instead.
- The base plan is OpenStreetMap data, © OpenStreetMap contributors, licensed
  [ODbL](https://www.openstreetmap.org/copyright). Colleges are positioned by real
  latitude and longitude, fitted to the plan through two control points.
- Lectures are embedded from the Oxford Union's YouTube channel.
- The crest and wordmark artwork is fan made by **Billy Christopher**. It ships as a
  transparent PNG (the supplied file's black ground was cut out) and is always presented
  on a dark plate, since it was drawn for a dark background and would otherwise lose the
  white lettering on its ring against the vellum theme.
- The University of Oxford name, crest and motto are the University's. This is an
  unofficial fan project, not affiliated with or endorsed by the University.

## Typefaces

Cormorant Garamond (display), Spectral (body), IBM Plex Mono (figures and labels),
loaded from Google Fonts with system serif and monospace fallbacks.

## Browser support

Any current version of Chrome, Firefox, Safari or Edge, on desktop or mobile. If local
storage is unavailable, the register still runs for the session and Settings says so —
export before closing the tab.
