# Contributing to RHEL Fieldbook

The fieldbook is plain HTML, CSS, and JavaScript. There is no framework and no
bundler. Keep it that way: improvements should remain readable from view-source
and usable from any static file server.

## Before you start

```bash
npm install
npm run validate
npm run test:node
```

For browser checks, install the Playwright browser once and run the smoke suite:

```bash
npx playwright install chromium
npm run test:e2e
```

`npm test` runs the validator and all Node tests. The CI workflow also regenerates
`sw.js`, checks that the committed file is current, and runs Playwright.

## Content model

The curriculum is data, not JavaScript template strings.

```
assets/data/lessons/
├── index.json                 # ordered lesson manifest
├── storage-lvm/
│   ├── lesson.json            # metadata, objectives, lab, quiz
│   ├── 01.html                # section body
│   ├── 02.html
│   └── 03.html
└── ...
```

`assets/js/lessons-loader.js` is the only runtime loader. It fetches the manifest,
loads each `lesson.json`, fetches each section body, attaches executable lab checks,
and installs the lessons into `RHEL.lessons`. Keep lesson bodies as semantic HTML
fragments: headings start at `<h3>`, and do not add a second page `<h1>`.

### `lesson.json` schema

```json
{
  "id": "storage-lvm",
  "module": "m05",
  "title": "LVM, capacity, and swap",
  "subtitle": "One-sentence promise.",
  "minutes": 42,
  "difficulty": "Operator",
  "tags": ["LVM", "PV", "VG", "LV"],
  "objectives": [
    "Explain the PV, VG, and LV layers"
  ],
  "ex200": [
    {
      "objective": 0,
      "exam": "local-storage",
      "evidence": "Read pvs, vgs, lvs, and lsblk as one stack."
    }
  ],
  "versionNotes": [
    "Name the RHEL 9 and RHEL 10 difference explicitly when one exists. Mention RHEL 10 here even when the workflow is unchanged."
  ],
  "sections": [
    { "title": "The LVM stack", "file": "01.html" }
  ],
  "commands": [
    { "cmd": "sudo lvs", "desc": "Show logical volumes.", "category": "LVM" }
  ],
  "lab": {
    "title": "Build a volume group from a spare disk",
    "scenario": "A disposable machine has a spare disk.",
    "minutes": 25,
    "steps": [
      {
        "text": "Create a GPT label on /dev/sdb.",
        "cmd": "sudo parted --script /dev/sdb mklabel gpt",
        "verify": "parted -s /dev/sdb print shows gpt.",
        "check": "sandbox"
      }
    ],
    "check": { "title": "Verify the stack", "body": "Run pvs, vgs, lvs, findmnt." }
  },
  "quiz": [
    {
      "q": "Which layer is created first?",
      "options": ["Logical volume", "Volume group", "Physical volume", "Filesystem"],
      "answer": 2,
      "why": "A PV initializes a block device for LVM; a VG then pools PVs."
    }
  ]
}
```

Rules enforced by `scripts/validate-content.js`:

- Every lesson appears exactly once in `index.json` and exactly one live module.
- Section files are numbered `NN.html`, exist, are non-empty, and match their declared titles.
- Each lesson has objectives, command cards, a lab with verification prompts, and at least three explained quiz questions.
- Quiz `answer` indices are in range and option positions stay balanced after deterministic shuffling.
- Command card `cmd` strings are unique across the whole curriculum.
- Every Level 02 objective has exactly one `ex200` mapping with evidence, and every mapping points at a real EX200 objective id.
- Every Level 02 lesson has `versionNotes`, mentions RHEL 10, and the required diagrams include inline SVG.
- Lab steps that declare `"check": "sandbox"` have a matching predicate in `assets/js/lab-checks.js` at the same step index.

### Adding a lesson

1. Add the id to `assets/data/lessons/index.json`.
2. Create the lesson directory and `lesson.json` plus numbered HTML bodies.
3. Add the id to the correct module's `lessons` array in `assets/js/data.js`.
4. If the lab uses `"check": "sandbox"`, add the predicate in
   `assets/js/lab-checks.js` under the lesson id and matching step index. A predicate
   receives the sandbox machine and must return a boolean.
5. Add any new sandbox commands under `assets/js/sandbox/`, register them in the
   command index, and add the script to `index.html` **before** `shell.js`.
6. Run `npm run validate` and `npm run test:node`.
7. Run `npm run build:sw` before committing so offline caches include the new files.

### Level status

A level is shown as live only when its lessons pass the validator. Do not flip
`status: 'live'` in `assets/js/data.js` until the new module lessons, EX200 mappings,
version notes, labs, quizzes, and sandbox checks are complete.

### RHEL 9 and RHEL 10

Keep release differences explicit. Prefer a short `versionNotes` list over vague
"newer versions may differ" prose. When a command or default changed, name both
releases and the observable difference. Do not add a version note that claims a
difference you have not verified.

## Design and accessibility

- Reuse the existing design tokens and components in `assets/css/style.css`.
- Preserve focus management, keyboard support, reduced-motion behavior, and the
  command palette (`Ctrl`/`Cmd` + `K`).
- Lesson content must remain readable without JavaScript-enhanced sandbox features.
- Print styles must keep cheat sheets and certificates usable on paper.

## JavaScript modules

`assets/js/app.js` is the boot entry. Runtime concerns are split into:

```
assets/js/app/
├── state.js       # localStorage schema, migration, normalization
├── router.js      # hash routes, navigation state, document titles
├── views.js       # labs, commands, roadmap, printable sheets
├── palette.js     # command palette search and keyboard navigation
└── review.js      # Leitner schedule, session view, grading
```

Shared state is the stable `store.state` object exported by `state.js`. Mutate it;
do not reassign it. Module scripts require an HTTP origin, so use `./serve.sh`.

## Sandbox commands

The sandbox is a simulation, not a security boundary. New commands should:

- mutate only the plain-JSON machine state;
- set evidence markers when a lab check needs to observe a side effect;
- return realistic exit codes and stderr;
- handle `sudo` through the existing shell identity layer rather than checking a
  string prefix;
- work when loaded in Node for the test suite.

Run the plain Node suites after touching parser, permissions, or commands.

## Pull requests

Keep changes focused. Include the validation output in the description, update
`sw.js` with `npm run build:sw`, and mention any RHEL 9 / RHEL 10 behavior you
could not verify in a lab. Never commit secrets, personal progress exports, or
screenshots containing personal data.
