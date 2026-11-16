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
- Stateful simulated RHEL sandbox with a real shell parser, writable virtual filesystem, permissions, users, packages, services, mounts, SELinux state, and `help`.
- Lab steps can auto-pass from sandbox evidence, with a manual override for work done in a real VM.
- Sandbox state and snapshots persist in `localStorage`; use Reset, Snapshot, and Restore from the terminal panel.
- Tab completion for command names and filesystem paths.
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
├── tests/
│   ├── sandbox-parser.test.js  # Plain Node parser and shell tests
│   └── sandbox-permissions.test.js
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
        ├── sandbox/            # Stateful simulated RHEL machine
        │   ├── vfs.js          # Virtual filesystem and permission checks
        │   ├── machine.js      # Seed state, users, packages, persistence
        │   ├── parser.js       # Quotes, pipes, connectors, expansion
        │   ├── commands.js     # Command registry and file helpers
        │   ├── commands-*.js   # Text, filesystem, identity, system commands
        │   ├── shell.js        # Execution, redirects, sudo/su, completion
        │   └── index.js        # Panel UI, reset/snapshot/restore, public API
        └── app.js              # Routing, rendering, state, filters, palette
```

Scripts load in order: data → lesson modules → quiz order → sandbox modules → app.

The sandbox keeps a plain-JSON machine state. `vfs.js` and `machine.js` are pure and Node-loadable, which is how the tests exercise the parser and permission engine without a browser.

## Editing content

Lesson content lives in the four `lessons-*.js` files. A lesson is a key in `RHEL.lessons` with `title`, `module`, `objectives`, `sections`, `commands`, `lab`, and `quiz`. Add the lesson id to the relevant module and `RHEL.lessonOrder` in `data.js` so navigation, progress, and the command index pick it up.

When changing cached assets, bump `CACHE` in `sw.js` so returning visitors receive the new files.

Lab steps may include an optional `check(sys)` function. It receives the current sandbox machine state and returns a boolean; the UI auto-checks the step when true, while the checkbox remains a manual override for work done in a real VM. Checks should be small, defensive, and based on persistent state or the `sys.evidence` markers set by commands.

## Validate content

Run the dependency-free content validator after editing lessons or quiz data:

```bash
node scripts/validate-content.js
```

It checks that every lesson id exists and is mapped to a module, quiz answer indices are in range, command cards are unique, every lab step has a verification prompt, and the rendered quiz answer positions stay balanced. The command exits non-zero on failure.

Run the sandbox tests with plain Node (no dependencies):

```bash
node tests/sandbox-parser.test.js
node tests/sandbox-permissions.test.js
```

The parser tests cover quoting, connectors, pipes, redirects, expansion, globs, completion, and `$?`. The permission tests cover root-only files, `sudo`, mode bits, ACLs, directory traversal, setgid inheritance, and the sticky bit.

## Notes and limits

- Progress is per browser and per device. Clearing site data resets it.
- The terminal is a simulation, but it is stateful. It never touches the real machine; state and snapshots live in `localStorage`. Use Reset for a clean seed and Snapshot/Restore before destructive practice.
- `sudo` in the sandbox is simulated for practice; it is not a security boundary.
- Sandbox lab checks are heuristics over the simulated machine. A manual checkbox remains available for work done in a real VM.
- The syllabus is aligned with RHEL 9 and RHEL 10 concepts, but always verify against the documentation for your exact release.

## Disclaimer

RHEL Fieldbook is an independent educational project. It is not affiliated with, endorsed by, or sponsored by Red Hat, Inc. Red Hat, Red Hat Enterprise Linux, and RHEL are trademarks of Red Hat, Inc. All other trademarks belong to their respective owners.
