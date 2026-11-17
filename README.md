# RHEL Fieldbook

A polished, offline-first field guide for learning Red Hat Enterprise Linux from the first prompt to production operations. It is an independent study project: no account, no tracking, and no build step.

**Live volumes:** Level 01 — Foundations and Level 02 — Operator. The complete five-level path is mapped on the roadmap, with Levels 03–05 reserved for future volumes.

## Run it

The app is plain HTML, CSS, and JavaScript. Any static file server works. ES modules, the JSON curriculum loader, and the service worker all require an HTTP origin.

```bash
cd rhel-fieldbook
python3 -m http.server 8799 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8799/>. Or use the included helper:

```bash
./serve.sh
# optional: ./serve.sh 9000
```

## What is inside

| Area | Detail |
| --- | --- |
| Levels | 5 mapped, Levels 01 and 02 live |
| Modules | 10 — 4 Foundations modules, 6 Operator modules |
| Lessons | 25 — 16 Foundations lessons, 9 Operator lessons |
| Objectives | 125 checkable outcomes |
| EX200 mapping | Every Level 02 objective mapped to the published EX200 skill catalog |
| Labs | 25 guided labs, 130 steps, every step with a verification prompt |
| Quiz questions | 75 with explained answers and balanced option positions |
| Command reference | 236 unique commands, linked back to lessons |
| Broken Systems | 5 live incidents with goal checks, hint ladders, and scoring |
| Review | 547 cards — 75 quiz questions plus 236 commands in both directions |
| Final exam | 30 module-balanced questions, one live practical, printable certificate |
| Cheat sheets | Printable, offline revision sheet for all 25 lessons |
| Storage | Progress is saved in `localStorage` on the device |

### Level 01 — Foundations

1. **Orientation** — `orientation`, `shell`, `help`, `filesystem`
2. **Daily driver** — `files`, `text`, `users`, `permissions`
3. **Systems** — `processes`, `packages`, `services`, `network`
4. **Operations** — `storage`, `bash`, `security`, `troubleshooting`

### Level 02 — Operator

5. **Storage engineering** — partitions, XFS, LVM, swap, and `fstab`
6. **Access and privilege** — SSH keys, `sshd` policy, sudoers, and least privilege
7. **Service management** — systemd units, drop-ins, timers, and the journal
8. **Packages and repositories** — DNF repositories, modules, history, and rollback
9. **Network and firewall** — NetworkManager, static addressing, routes, and firewalld
10. **Text and automation** — `find`, `grep`, `sed`, `awk`, `tar`, and `cron`

Every lesson includes objectives, an EX200 alignment table where applicable, RHEL 9 and RHEL 10 notes, a reading section with inline diagrams, a command deck, a hands-on lab, and a checkpoint quiz.

## Features

- Hash-routed single-page app with deep links to every lesson, lab section, scenario, review session, exam, and cheat sheet.
- Progress tracking for lesson completion, objective checklists, lab steps, lab completion, and quiz answers.
- Command palette (`Ctrl`/`Cmd` + `K`) with keyboard navigation over lessons, commands, labs, scenarios, and pages.
- Searchable and filterable command index and lab library across both live levels.
- Export and import progress as a validated JSON file from the Curriculum page.
- Stateful simulated RHEL sandbox with a real shell parser, writable virtual filesystem, permissions, users, packages, services, mounts, LVM, DNF modules, NetworkManager, firewalld, systemd timers, cron, SELinux state, and `help`.
- Lab steps can auto-pass from sandbox evidence, with a manual override for work done in a real VM.
- Sandbox state and snapshots persist in `localStorage`; use Reset, Snapshot, and Restore from the terminal panel.
- **Broken Systems** (`#/scenarios`): five incident scenarios load a fresh, broken machine state, run a live goal check, offer a three-level hint ladder, and score time plus hints. Best and latest results persist.
- **Spaced review** (`#/review`): a Leitner schedule for quiz questions and command flashcards in both directions (command → meaning and meaning → command). The header shows the due-today count, and a session can mix or filter card types.
- **Final exam** (`#/exam`): 30 timed questions balanced across the four Foundations modules, a practical sandbox task checked against live machine state, a per-module skills breakdown, and a printable certificate at 80% plus a passing practical.
- **Objective mastery** (`#/mastery`): all 80 Foundations objectives mapped to checkpoint, lab-step, and manual evidence. The mastery map stays scoped to the exam modules; Level 02 journals are tracked separately.
- **Printable cheat sheets** (`#/cheatsheets`): objectives, lab intent, command decks, and version notes for every live lesson, with page-break-aware print styles.
- Tab completion for command names and filesystem paths.
- Deterministic quiz option shuffling so answer positions stay balanced.
- Light and dark themes with persistence.
- Responsive layout for desktop, tablet, and phone.
- PWA manifest, PNG icons, and a generated service worker for offline use after the first visit.
- Reduced-motion support and visible focus styles.

## Project layout

```
rhel-fieldbook/
├── index.html                    # App shell, header, palette, sandbox
├── manifest.webmanifest          # PWA metadata
├── sw.js                         # Generated offline cache (do not hand-edit)
├── serve.sh                      # Tiny local server helper
├── package.json
├── playwright.config.js
├── .github/workflows/ci.yml      # Validate, test, build, deploy Pages
├── scripts/
│   ├── validate-content.js       # Dependency-free curriculum checks
│   └── build-sw.js               # Hashed service-worker cache generator
├── tests/
│   ├── helpers/curriculum.js     # JSON/HTML loader for Node tests
│   ├── e2e/smoke.spec.js         # Playwright routing, state, palette, sandbox
│   ├── sandbox-parser.test.js    # Plain Node parser and shell tests
│   ├── sandbox-permissions.test.js
│   └── features.test.js          # Scenarios, review, exam, practical, levels
└── assets/
    ├── css/style.css             # Design system, diagrams, print rules
    ├── data/lessons/             # Manifest, lesson JSON, numbered HTML bodies
    ├── favicon.svg
    ├── icons/                    # 192/512 PNG and maskable PWA icons
    └── js/
        ├── app.js                # Boot entry: render, events, scenario/exam actions
        ├── app/                  # State, router, views, palette, review modules
        │   ├── state.js
        │   ├── router.js
        │   ├── views.js
        │   ├── palette.js
        │   └── review.js
        ├── data.js               # Levels, modules, EX200 catalog, lesson order
        ├── lessons-loader.js     # The single JSON/HTML curriculum loader
        ├── lab-checks.js         # Executable sandbox lab predicates
        ├── quiz-order.js         # Deterministic, balanced quiz option order
        ├── sandbox/              # Stateful simulated RHEL machine
        │   ├── vfs.js            # Virtual filesystem and permission checks
        │   ├── machine.js        # Seed state, users, packages, persistence
        │   ├── parser.js         # Quotes, pipes, connectors, expansion
        │   ├── commands.js       # Command registry and file helpers
        │   ├── commands-*.js     # Text, filesystem, identity, system, ops
        │   ├── shell.js          # Execution, redirects, sudo/su, completion
        │   └── index.js          # Panel UI, reset/snapshot/restore, public API
        └── features.js           # Scenarios, review schedule, exam, mastery data
```

Classic scripts load in this order: data → lab checks → quiz order → sandbox modules → features → curriculum loader. `app.js` is an ES module and starts after the curriculum fetch resolves. The sandbox keeps a plain-JSON machine state; `vfs.js` and `machine.js` are pure and Node-loadable.

## Content architecture

Lesson content lives in `assets/data/lessons/`, not in JavaScript strings. Each lesson has a `lesson.json` and numbered HTML section bodies. `assets/js/lessons-loader.js` fetches the manifest once, loads all lesson metadata and bodies, attaches executable sandbox checks by step index, and installs the curriculum into `RHEL.lessons`. The loader also exposes `RHEL.installCurriculum(records)` so Node tests and embedded hosts can load the same data synchronously.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full lesson schema and the content checklist.

### Adding or editing a lesson

1. Add the lesson id to `assets/data/lessons/index.json`.
2. Create `assets/data/lessons/<id>/lesson.json` and its numbered HTML bodies.
3. Add the id to the correct module in `assets/js/data.js`.
4. Add lab predicates to `assets/js/lab-checks.js` for any step marked `"check": "sandbox"`.
5. Add required sandbox commands and evidence markers.
6. Run `npm run validate` and `npm run test:node`.
7. Run `npm run build:sw` before committing.

A level is marked `status: 'live'` only when its lessons pass the validator. Level 02 is live because all nine lessons, EX200 mappings, RHEL 9/10 notes, lab checks, and quizzes are complete.

Practice features live in `assets/js/features.js`. Each scenario has an `id`, `title`, `story`, `patch(sys)`, `goal(sys)`, three `hints`, a `timeTarget` in seconds, and a related `lesson`. Scenario patches run against a fresh sandbox seed, so they are deterministic and leave the goal unresolved. Review cards are generated at runtime from lesson quizzes and the deduplicated command index. The final exam draws 30 questions with Foundations module quotas (8/8/7/7) and checks its practical task directly against machine state.

## Validate and test

```bash
npm install
npm run validate        # curriculum, EX200 coverage, quiz balance, lab checks
npm run test:node       # scenarios, review, exam, sandbox parser, permissions
npm run test:e2e        # Playwright routing, persistence, palette, sandbox, print
npm test                # validate + all Node tests
```

The validator checks lesson ids, module mappings, manifest consistency, section bodies, Level 02 EX200 completeness, RHEL 9/10 notes, inline SVG diagrams, command uniqueness, quiz explanations, quiz answer positions, lab verification prompts, and executable lab checks. It exits non-zero on failure.

The Node suites use the real JSON/HTML curriculum through `tests/helpers/curriculum.js`. The parser tests cover quoting, connectors, pipes, redirects, expansion, globs, completion, and `$?`. The permission tests cover root-only files, `sudo`, mode bits, ACLs, directory traversal, setgid inheritance, and the sticky bit. The feature tests verify all five scenarios start broken and resolve with their intended fixes, review scheduling, exam balance, the live practical check, and Level 02 completeness.

### Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

1. `npm ci`
2. content validation
3. Node tests
4. `node scripts/build-sw.js` and a clean-diff check on `sw.js`
5. Playwright smoke tests on Chromium
6. deployment to GitHub Pages from `main`

`sw.js` is generated from file contents, not hand-edited. `scripts/build-sw.js` walks the deployable tree, hashes every file, writes a content-derived cache name, and emits the full precache list. If you change any cached asset, run `npm run build:sw`.

## Notes and limits

- Progress is per browser and per device. Clearing site data resets it.
- The validated progress export includes lesson/lab/quiz state, Broken Systems results, the review schedule, and final-exam history.
- The terminal is a simulation, but it is stateful. It never touches the real machine; state and snapshots live in `localStorage`. Use Reset for a clean seed and Snapshot/Restore before destructive practice.
- `sudo` in the sandbox is simulated for practice; it is not a security boundary.
- Sandbox lab checks are heuristics over the simulated machine. A manual checkbox remains available for work done in a real VM.
- The syllabus is aligned with RHEL 9 and RHEL 10 concepts, but always verify against the documentation for your exact release.

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

RHEL Fieldbook is an independent educational project. It is not affiliated with, endorsed by, or sponsored by Red Hat, Inc. Red Hat, Red Hat Enterprise Linux, and RHEL are trademarks of Red Hat, Inc. All other trademarks belong to their respective owners.
