# RHEL Fieldbook

A polished, offline-friendly field guide for learning Red Hat Enterprise Linux from the first prompt to production operations. It is an independent study project: no account, no tracking, and no build step.

**Live volume: Level 01 — Foundations.** The full five-level path is mapped on the roadmap, with Levels 02–05 reserved for future volumes.

## Run it

The app is plain HTML, CSS, and JavaScript. Any static file server works.

```bash
cd rhel-fieldbook
python -m http.server 8799 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8799/>.

Or use the included helper:

```bash
./serve.sh
# optional: ./serve.sh 9000
```

You can also open `index.html` directly, but serving over HTTP enables the service worker, offline caching, and the installable PWA experience.

## What is inside

| Area | Detail |
| --- | --- |
| Levels | 5 mapped, Level 01 complete |
| Modules | 4 — Orientation, Daily driver, Systems, Operations |
| Lessons | 16 |
| Objectives | 80 checkable outcomes |
| Labs | 16 guided labs, 82 steps, every step with a verification prompt |
| Quiz questions | 48 with explained answers and balanced option positions |
| Command reference | 157 unique commands, linked back to lessons |
| Storage | Progress is saved in `localStorage` on the device |

### Level 01 modules

1. **Orientation** — `orientation`, `shell`, `help`, `filesystem`
2. **Daily driver** — `files`, `text`, `users`, `permissions`
3. **Systems** — `processes`, `packages`, `services`, `network`
4. **Operations** — `storage`, `bash`, `security`, `troubleshooting`

Each lesson includes objectives, a reading section, a command deck, a hands-on lab, and a checkpoint quiz.

## Features

- Hash-routed single-page app with deep links to every lesson.
- Progress tracking for lesson completion, objective checklists, lab steps, lab completion, and quiz answers.
- Command palette (`Ctrl`/`Cmd` + `K`) with keyboard navigation.
- Searchable and filterable command index and lab library.
- Export and import progress as a validated JSON file from the Curriculum page.
- Simulated read-only RHEL terminal sandbox with a virtual filesystem and `help`.
- Deterministic quiz option shuffling so answer positions stay balanced.
- Light and dark themes with persistence.
- Responsive layout for desktop, tablet, and phone.
- PWA manifest, PNG icons, and service worker for offline use after the first visit.
- Reduced-motion support and visible focus styles.

## Project layout

```
rhel-fieldbook/
├── index.html                  # App shell, header, palette, sandbox
├── manifest.webmanifest        # PWA metadata
├── sw.js                       # Offline cache
├── serve.sh                    # Tiny local server helper
├── scripts/
│   └── validate-content.js     # Dependency-free content checks
└── assets/
    ├── css/style.css           # Design system and responsive rules
    ├── favicon.svg
    ├── icons/                  # 192/512 PNG and maskable PWA icons
    └── js/
        ├── data.js             # Levels, modules, lessons order, certifications
        ├── lessons-orientation.js
        ├── lessons-operations.js
        ├── lessons-systems.js
        ├── lessons-practice.js
        ├── quiz-order.js       # Deterministic, balanced quiz option order
        ├── sandbox.js          # Simulated terminal and virtual filesystem
        └── app.js              # Routing, rendering, state, filters, palette
```

Scripts load in order: data → lesson modules → quiz order → sandbox → app.

## Editing content

Lesson content lives in the four `lessons-*.js` files. A lesson is a key in `RHEL.lessons` with `title`, `module`, `objectives`, `sections`, `commands`, `lab`, and `quiz`. Add the lesson id to the relevant module and `RHEL.lessonOrder` in `data.js` so navigation, progress, and the command index pick it up.

When changing cached assets, bump `CACHE` in `sw.js` so returning visitors receive the new files.

## Validate content

Run the dependency-free content validator after editing lessons or quiz data:

```bash
node scripts/validate-content.js
```

It checks that every lesson id exists and is mapped to a module, quiz answer indices are in range, command cards are unique, every lab step has a verification prompt, and the rendered quiz answer positions stay balanced. The command exits non-zero on failure.

## Notes and limits

- Progress is per browser and per device. Clearing site data resets it.
- The terminal is a simulation. It is intentionally read-only and never touches the real machine. Use a disposable VM for the labs.
- `sudo` in the sandbox is simulated for practice; it is not a security boundary.
- The syllabus is aligned with RHEL 9 and RHEL 10 concepts, but always verify against the documentation for your exact release.

## Disclaimer

RHEL Fieldbook is an independent educational project. It is not affiliated with, endorsed by, or sponsored by Red Hat, Inc. Red Hat, Red Hat Enterprise Linux, and RHEL are trademarks of Red Hat, Inc. All other trademarks belong to their respective owners.
