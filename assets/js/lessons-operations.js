/* Module 02 — Daily driver */

RHEL.lessons.files = {
  id: 'files',
  module: 'm02',
  title: 'Create, copy, move, remove',
  subtitle: 'File operations with a safety habit, plus globs, metadata, and archives.',
  minutes: 25,
  difficulty: 'Starter',
  tags: ['files', 'cp', 'mv', 'rm', 'tar', 'globbing'],
  objectives: [
    'Create files and directory trees without surprises',
    'Copy, move, and remove files with the right flags',
    'Inspect metadata with file and stat',
    'Use shell globs and brace expansion safely',
    'Create and inspect tar archives'
  ],
  sections: [
    {
      title: 'Create first, inspect always',
      body: `
        <p>Creating files is easy. Creating them in the wrong place, with the wrong owner, is also easy. Start by making a deliberate directory tree:</p>
        <div class="code-label"><span>terminal · build a workspace</span></div>
        <pre><code>mkdir -p ~/lab/notes ~/lab/logs ~/lab/archive
touch ~/lab/notes/day1.txt
ls -lR ~/lab</code></pre>
        <p><code>mkdir -p</code> creates missing parents and does not fail if the target already exists. <code>touch</code> updates timestamps, or creates an empty file if none exists. <code>ls -R</code> walks recursively; use it on small trees, not on <code>/</code>.</p>
        <p>Before acting on an unfamiliar file, ask what it actually is and when it changed:</p>
        <div class="code-label"><span>terminal · inspect metadata</span></div>
        <pre><code>file ~/lab/notes/day1.txt
stat ~/lab/notes/day1.txt
du -h ~/lab/notes/day1.txt</code></pre>
        <p><code>file</code> reads magic bytes and guesses the content type. <code>stat</code> reports inode number, size, permissions, and three timestamps: access, modify, and change. <code>du</code> reports disk usage, which can differ from apparent size because of block allocation, sparse files, and compression.</p>
        <div class="callout note">
          <div class="callout-title">Size is not one number</div>
          <p>The apparent size from <code>stat</code> is not always the space consumed on disk. Use <code>du</code> for block usage and <code>df</code> for filesystem capacity.</p>
        </div>
      `
    },
    {
      title: 'Copy, move, remove — with intent',
      body: `
        <p><code>cp</code> copies content. <code>mv</code> renames or relocates. <code>rm</code> unlinks. The first two are generally reversible; the last one usually is not.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Command</th><th>Behavior</th></tr></thead>
            <tbody>
              <tr><td><code>cp file copy</code></td><td>Copy a file. Existing destination is overwritten without asking.</td></tr>
              <tr><td><code>cp -i file copy</code></td><td>Prompt before overwriting.</td></tr>
              <tr><td><code>cp -r dir newdir</code></td><td>Copy a directory recursively. Does not preserve ownership/timestamps by default.</td></tr>
              <tr><td><code>cp -a dir backup</code></td><td>Archive mode: recursive, preserves mode, ownership where permitted, timestamps, links, and ACLs.</td></tr>
              <tr><td><code>mv old new</code></td><td>Rename or move. Same-filesystem moves are metadata operations and are fast.</td></tr>
              <tr><td><code>rm file</code></td><td>Remove a file. No trash can by default.</td></tr>
              <tr><td><code>rm -i file</code></td><td>Prompt before removal.</td></tr>
            </tbody>
          </table>
        </div>
        <p>There is no recycle bin for the shell. Build the reflex of checking the target before pressing Enter:</p>
        <div class="code-label"><span>terminal · a safer rm workflow</span></div>
        <pre><code>ls -ld ~/lab/old-project
rm -ri ~/lab/old-project</code></pre>
        <p>Aliases can make <code>rm</code> interactive for your user, but aliases do not apply inside scripts, during <code>sudo</code>, or when another user runs the command. Safety has to live in the habit, not in an alias.</p>
        <div class="callout warn">
          <div class="callout-title">The two commands that end careers</div>
          <p>Be extremely careful with <code>rm -rf</code> and <code>dd</code>. A misplaced space or an unset variable can widen the target. In scripts, quote paths and use <code>set -u</code> so an empty variable cannot become an empty path.</p>
        </div>
      `
    },
    {
      title: 'Globs and brace expansion',
      body: `
        <p>Wildcards expand in the shell before the command runs. They match filenames in the current directory, not file contents.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Pattern</th><th>Matches</th></tr></thead>
            <tbody>
              <tr><td><code>*</code></td><td>Any number of characters, including none.</td></tr>
              <tr><td><code>?</code></td><td>Exactly one character.</td></tr>
              <tr><td><code>[abc]</code></td><td>One character from the set.</td></tr>
              <tr><td><code>[0-9]</code></td><td>One digit.</td></tr>
              <tr><td><code>{notes,logs}</code></td><td>Brace expansion produces two separate arguments.</td></tr>
              <tr><td><code>file{1..5}.txt</code></td><td>file1.txt through file5.txt.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Brace expansion happens before globbing and works even when files do not exist yet:</p>
        <div class="code-label"><span>terminal · dry-run expansion</span></div>
        <pre><code>echo ~/lab/{notes,logs}
touch ~/lab/notes/day{1..3}.txt
ls ~/lab/notes</code></pre>
        <p>Use <code>echo</code> first when you are unsure. It shows what the shell would expand without running the real command. Hidden files require an explicit dot: <code>*</code> does not match <code>.bashrc</code>, while <code>.*</code> does — and it also matches <code>.</code> and <code>..</code>, which is why recursive deletions with <code>.*</code> are dangerous.</p>
      `
    },
    {
      title: 'Archives: pack a tree, verify the pack',
      body: `
        <p><code>tar</code> is the standard way to bundle a directory tree. Compression is layered on top with gzip, xz, or zstd.</p>
        <div class="code-label"><span>terminal · create, inspect, extract</span></div>
        <pre><code>tar -czf ~/lab/notes-backup.tar.gz -C ~/lab notes
tar -tzf ~/lab/notes-backup.tar.gz
mkdir -p ~/lab/restore
tar -xzf ~/lab/notes-backup.tar.gz -C ~/lab/restore</code></pre>
        <p>Read the flags as a sentence: <code>c</code> create, <code>x</code> extract, <code>t</code> list, <code>z</code> gzip, <code>f</code> file. <code>-C</code> changes directory for the operation, so the archive contains <code>notes/</code> rather than an absolute path. This makes archives portable and prevents extraction from scattering files across the filesystem.</p>
        <p>Always list an archive before extracting it, especially if it came from somewhere else. A malicious archive can contain absolute paths or <code>..</code> traversal. <code>tar -tzf</code> is a cheap inspection step.</p>
        <div class="callout tip">
          <div class="callout-title">Backups are not archives</div>
          <p>An archive is a bundle. A backup is a restore plan with retention, verification, and off-host storage. We will build the real thing in later levels.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'mkdir -p ~/lab/{notes,logs}', desc: 'Create a directory tree, including parents.', category: 'Files' },
    { cmd: 'touch file.txt', desc: 'Create an empty file or update timestamps.', category: 'Files' },
    { cmd: 'file file.txt', desc: 'Identify content type from magic bytes.', category: 'Files' },
    { cmd: 'stat file.txt', desc: 'Show inode, size, mode, and timestamps.', category: 'Files' },
    { cmd: 'cp -a source backup', desc: 'Copy recursively while preserving metadata.', category: 'Files' },
    { cmd: 'mv old new', desc: 'Rename or relocate a file.', category: 'Files' },
    { cmd: 'rm -ri directory', desc: 'Remove recursively with confirmation prompts.', category: 'Files' },
    { cmd: 'tar -czf backup.tar.gz -C ~/lab notes', desc: 'Create a gzip-compressed tar archive.', category: 'Files' },
    { cmd: 'tar -tzf backup.tar.gz', desc: 'List an archive without extracting it.', category: 'Files' }
  ],
  lab: {
    title: 'Build, inspect, archive, restore',
    scenario: 'Practice a complete file lifecycle. The restore step is what proves the backup actually worked.',
    minutes: 16,
    steps: [
      { text: 'Create a project tree with three subdirectories.', cmd: 'mkdir -p ~/lab/fieldbook/{notes,logs,archive}', verify: 'ls -R ~/lab/fieldbook should show all three.' },
      { text: 'Create three dated notes using brace expansion.', cmd: 'touch ~/lab/fieldbook/notes/day{1..3}.txt', verify: 'ls ~/lab/fieldbook/notes should show day1.txt, day2.txt, and day3.txt.' },
      { text: 'Add a line to the first note and inspect its metadata.', cmd: 'echo "first observation" &gt; ~/lab/fieldbook/notes/day1.txt && stat ~/lab/fieldbook/notes/day1.txt', verify: 'stat should show a non-zero size and a recent modification time for day1.txt.' },
      { text: 'Archive the notes directory with gzip and list the archive.', cmd: 'tar -czf ~/lab/fieldbook/archive/notes.tar.gz -C ~/lab/fieldbook notes && tar -tzf ~/lab/fieldbook/archive/notes.tar.gz', verify: 'You should see notes/, notes/day1.txt, and the others.' },
      { text: 'Restore the archive into a clean directory and compare.', cmd: 'mkdir -p ~/lab/fieldbook/restore && tar -xzf ~/lab/fieldbook/archive/notes.tar.gz -C ~/lab/fieldbook/restore && diff -r ~/lab/fieldbook/notes ~/lab/fieldbook/restore/notes', verify: 'diff should print nothing. Silence means the trees match.' }
    ]
  },
  quiz: [
    {
      q: 'Which cp option best preserves ownership, permissions, timestamps, and links?',
      options: ['-r', '-f', '-a', '-v'],
      answer: 2,
      why: 'Archive mode (-a) combines recursive copying with metadata preservation. It is the right default for backups.'
    },
    {
      q: 'What does tar -tzf archive.tar.gz do?',
      options: ['Extracts the archive', 'Lists the archive contents', 'Deletes the archive', 'Creates a new archive'],
      answer: 1,
      why: 't lists, z handles gzip, f names the archive file. Listing first is a safe inspection step.'
    },
    {
      q: 'Why is rm -rf with an unquoted variable dangerous in a script?',
      options: ['rm cannot expand variables', 'An empty variable can turn the target into a broader path', 'It always deletes the home directory', 'It disables SELinux'],
      answer: 1,
      why: 'If the variable is empty, the path can collapse. Quoting plus set -u prevents the worst case.'
    }
  ]
};

RHEL.lessons.text = {
  id: 'text',
  module: 'm02',
  title: 'Read, search, reshape',
  subtitle: 'Pipes and text tools turn raw output into an answer.',
  minutes: 27,
  difficulty: 'Starter',
  tags: ['grep', 'pipes', 'redirection', 'logs', 'awk'],
  objectives: [
    'Read files with cat, less, head, and tail',
    'Redirect stdout and stderr, and build pipelines',
    'Search text with grep and simple patterns',
    'Extract and summarize data with cut, sort, uniq, and wc',
    'Triage a log file without opening an editor'
  ],
  sections: [
    {
      title: 'Read only as much as you need',
      body: `
        <p><code>cat</code> dumps a file to the terminal. It is perfect for short files and terrible for a 2 GB log. Use the right viewer:</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Command</th><th>Use</th></tr></thead>
            <tbody>
              <tr><td><code>cat file</code></td><td>Small files, or feeding content into a pipe.</td></tr>
              <tr><td><code>less file</code></td><td>Paged reading with search. <code>/pattern</code>, <code>n</code>, <code>q</code>.</td></tr>
              <tr><td><code>head -n 20 file</code></td><td>First 20 lines.</td></tr>
              <tr><td><code>tail -n 20 file</code></td><td>Last 20 lines.</td></tr>
              <tr><td><code>tail -f file</code></td><td>Follow new lines as they arrive. Ctrl+C to stop.</td></tr>
              <tr><td><code>wc -l file</code></td><td>Count lines.</td></tr>
            </tbody>
          </table>
        </div>
        <p>On RHEL, logs are increasingly in the systemd journal rather than flat files. <code>journalctl</code> provides its own paging and filtering. Flat files still exist — authentication often lands in <code>/var/log/secure</code>, and application logs may live under <code>/var/log/&lt;app&gt;/</code>.</p>
        <p><code>less</code> is worth learning properly. It does not load the entire file into memory the way an editor might, it preserves the terminal, and it lets you search without modifying anything. Use <code>less +F file</code> for a follow mode that behaves like <code>tail -f</code>.</p>
      `
    },
    {
      title: 'Redirection and pipes',
      body: `
        <p>Every process has three standard streams: <strong>stdin</strong> (0), <strong>stdout</strong> (1), and <strong>stderr</strong> (2). Redirection changes where they go. This is the mechanism behind most useful one-liners.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Syntax</th><th>Effect</th></tr></thead>
            <tbody>
              <tr><td><code>cmd &gt; file</code></td><td>Send stdout to file, truncating it first.</td></tr>
              <tr><td><code>cmd &gt;&gt; file</code></td><td>Append stdout to file.</td></tr>
              <tr><td><code>cmd 2&gt; error.log</code></td><td>Send stderr to a file.</td></tr>
              <tr><td><code>cmd 2&gt;&amp;1</code></td><td>Send stderr to wherever stdout currently points.</td></tr>
              <tr><td><code>cmd &gt; out.log 2&gt;&amp;1</code></td><td>Send both streams to the same file.</td></tr>
              <tr><td><code>cmd &gt; /dev/null</code></td><td>Discard stdout. <code>/dev/null</code> is the bit bucket.</td></tr>
              <tr><td><code>cmd1 | cmd2</code></td><td>Pipe stdout of cmd1 into stdin of cmd2.</td></tr>
              <tr><td><code>cmd | tee file</code></td><td>Write to the terminal and to a file at the same time.</td></tr>
            </tbody>
          </table>
        </div>
        <p>A pipe connects processes; it does not create a temporary file. This is why pipelines can process enormous data with small memory footprints. Each stage should do one job well.</p>
        <div class="code-label"><span>terminal · stdout, stderr, and a pipe</span></div>
        <pre><code>ls /etc /does-not-exist &gt; /tmp/out.txt 2&gt; /tmp/err.txt
cat /tmp/out.txt
cat /tmp/err.txt
grep -i error /var/log/messages | tail -n 5</code></pre>
        <div class="callout note">
          <div class="callout-title">Order matters</div>
          <p><code>cmd 2&gt;&amp;1 &gt; file</code> does not do what most people expect. Redirections are evaluated left to right; send stdout first, then point stderr at it: <code>cmd &gt; file 2&gt;&amp;1</code>.</p>
        </div>
      `
    },
    {
      title: 'grep, cut, sort, uniq',
      body: `
        <p><strong>grep</strong> finds lines. Learn four flags and you can answer most log questions:</p>
        <div class="code-label"><span>terminal · grep patterns</span></div>
        <pre><code>grep -i "failed" /var/log/secure
grep -n "error" /var/log/messages
grep -v "^#" /etc/ssh/sshd_config
grep -r "Listen" /etc/httpd/</code></pre>
        <p><code>-i</code> ignores case, <code>-n</code> prints line numbers, <code>-v</code> inverts the match, and <code>-r</code> searches recursively. Add <code>-E</code> for extended regular expressions. Always quote patterns that contain spaces or shell metacharacters.</p>
        <p><strong>cut</strong> extracts columns. <strong>sort</strong> orders lines. <strong>uniq</strong> collapses adjacent duplicates, which is why it is almost always paired with <code>sort</code>. <strong>wc</strong> counts lines, words, or bytes.</p>
        <div class="code-label"><span>terminal · summarize users by shell</span></div>
        <pre><code>cut -d: -f7 /etc/passwd | sort | uniq -c | sort -nr</code></pre>
        <p>Read that pipeline left to right: split each passwd line on colons, take the seventh field (the login shell), sort identical values together, count adjacent duplicates, then sort by count descending. This is the pattern behind a huge amount of operational reporting.</p>
        <p><code>awk</code> is the next step when column logic needs conditions or arithmetic. For now, recognize it:</p>
        <div class="code-label"><span>terminal · a first awk</span></div>
        <pre><code>awk -F: '$3 &gt;= 1000 { print $1, $3, $7 }' /etc/passwd</code></pre>
        <p>That prints local regular users: username, UID, and shell. Do not worry about mastering awk yet. The point is that text tools compose.</p>
      `
    },
    {
      title: 'A calm log triage',
      body: `
        <p>When something fails, resist the urge to open a giant file and scroll. Narrow the question:</p>
        <ol>
          <li><strong>When</strong> did it fail? Use <code>journalctl --since</code> or filter timestamps.</li>
          <li><strong>Which unit or service</strong> is involved? Filter by unit or process.</li>
          <li><strong>What changed</strong> just before? Look at the last successful event and the first error.</li>
          <li><strong>What is the exact error</strong>? Copy the first meaningful line, not the last cascading symptom.</li>
        </ol>
        <div class="code-label"><span>terminal · narrow the window</span></div>
        <pre><code>journalctl -u sshd --since "1 hour ago"
journalctl -p err -b
grep -i "failed\|denied" /var/log/secure | tail -n 20</code></pre>
        <p>The backslash in <code>failed\|denied</code> is basic regular expression alternation. With <code>grep -E</code>, write it as <code>"failed|denied"</code>. Either way, quote the pattern so the shell does not interpret the pipe.</p>
        <div class="callout tip">
          <div class="callout-title">Copy the raw evidence</div>
          <p>When escalating, include the exact command, timestamp, host, and unedited error. A screenshot cropped to one red line is not evidence.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'less /var/log/messages', desc: 'Read a large file with search and paging.', category: 'Text' },
    { cmd: 'tail -f /var/log/secure', desc: 'Follow new lines appended to a log.', category: 'Text' },
    { cmd: 'grep -in error /var/log/messages', desc: 'Search case-insensitively with line numbers.', category: 'Text' },
    { cmd: 'grep -r pattern /etc', desc: 'Search recursively through a directory.', category: 'Text' },
    { cmd: 'cut -d: -f1 /etc/passwd', desc: 'Extract the first colon-delimited field.', category: 'Text' },
    { cmd: 'sort file | uniq -c | sort -nr', desc: 'Count and rank duplicate lines.', category: 'Text' },
    { cmd: 'wc -l file', desc: 'Count lines in a file.', category: 'Text' },
    { cmd: 'cmd &gt; out.log 2&gt;&amp;1', desc: 'Capture stdout and stderr in one file.', category: 'Text' },
    { cmd: 'cmd | tee output.txt', desc: 'Display output and save a copy simultaneously.', category: 'Text' },
    { cmd: 'journalctl -p err -b', desc: 'Show error-priority journal entries from this boot.', category: 'Services' }
  ],
  lab: {
    title: 'Profile users and triage a log',
    scenario: 'Use only text tools. The objective is to produce a short answer from a large file without an editor.',
    minutes: 18,
    steps: [
      { text: 'Count all accounts in /etc/passwd.', cmd: 'wc -l /etc/passwd', verify: 'wc -l should print one count, typically between 20 and 60 on a lab VM.' },
      { text: 'List the login shells actually in use, ranked by frequency.', cmd: 'cut -d: -f7 /etc/passwd | sort | uniq -c | sort -nr', verify: 'The report should rank the login shells in use, usually /bin/bash and /sbin/nologin.' },
      { text: 'List local regular users with UID 1000 or higher.', cmd: 'awk -F: \'$3 &gt;= 1000 { print $1, $3, $7 }\' /etc/passwd', verify: 'Only accounts with UID 1000 or greater should appear, with username, UID, and shell.' },
      { text: 'Create a tiny log, add an error, and count matching lines.', cmd: 'printf "ok\\nERROR disk full\\nok\\n" &gt; /tmp/demo.log && grep -c "ERROR" /tmp/demo.log', verify: 'The count should be 1.' },
      { text: 'Save a filtered report while still seeing it on screen.', cmd: 'grep "ERROR" /tmp/demo.log | tee /tmp/error-report.txt', verify: 'tee should print the matching lines and create /tmp/error-report.txt; compare both.' }
    ]
  },
  quiz: [
    {
      q: 'Which redirection sends both stdout and stderr into app.log?',
      options: ['cmd > app.log', 'cmd 2> app.log', 'cmd > app.log 2>&1', 'cmd | app.log'],
      answer: 2,
      why: 'Redirect stdout to the file first, then point stderr at stdout. Order is significant.'
    },
    {
      q: 'Why is uniq usually paired with sort?',
      options: ['uniq only works on sorted input for duplicate detection', 'sort is required to read files', 'uniq cannot read stdin', 'sort encrypts the output'],
      answer: 0,
      why: 'uniq collapses adjacent duplicates. Sorting brings identical lines together so they can be counted correctly.'
    },
    {
      q: 'Which command searches a file case-insensitively and prints line numbers?',
      options: ['grep -vn', 'grep -in', 'grep -r', 'grep -c'],
      answer: 1,
      why: '-i ignores case and -n prints line numbers. -v inverts the match and -r searches recursively.'
    }
  ]
};

RHEL.lessons.users = {
  id: 'users',
  module: 'm02',
  title: 'Users, groups, and sudo',
  subtitle: 'Identity is the foundation of every permission decision on the system.',
  minutes: 28,
  difficulty: 'Core',
  tags: ['users', 'groups', 'sudo', 'passwd', 'identity'],
  objectives: [
    'Read the passwd and shadow identity files',
    'Create, modify, lock, and remove user accounts',
    'Manage group membership correctly',
    'Grant delegated privilege with sudo and sudoers drop-ins',
    'Explain the difference between su and sudo'
  ],
  sections: [
    {
      title: 'Identity is a number',
      body: `
        <p>Linux identifies accounts by <strong>UID</strong> and groups by <strong>GID</strong>. Names are a convenience for humans. The kernel checks numbers; the name service maps names to numbers.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Range</th><th>Typical use</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>root</td></tr>
              <tr><td>1–999</td><td>System accounts used by services</td></tr>
              <tr><td>1000+</td><td>Regular interactive users (default on RHEL)</td></tr>
            </tbody>
          </table>
        </div>
        <p>The local account database is <code>/etc/passwd</code>, readable by everyone. Each line has seven colon-separated fields:</p>
        <div class="code-label"><span>passwd format</span></div>
        <pre><code>name:password-placeholder:UID:GID:GECOS:home:login-shell</code></pre>
        <p>On a modern RHEL system, the password field contains <code>x</code> and the real hash lives in <code>/etc/shadow</code>, which only root can read. Never copy <code>/etc/shadow</code> into a report. Use <code>getent passwd student</code> and <code>getent group wheel</code> to query identity through the configured name service, which may include more than local files.</p>
        <div class="code-label"><span>terminal · inspect identity</span></div>
        <pre><code>id
id student
getent passwd student
getent group wheel</code></pre>
      `
    },
    {
      title: 'Create and modify accounts',
      body: `
        <p>Use <code>useradd</code> to create, <code>passwd</code> to set credentials, and <code>usermod</code> to change account attributes.</p>
        <div class="code-label"><span>terminal · create a user</span></div>
        <pre><code>sudo useradd -m -s /bin/bash analyst
sudo passwd analyst
id analyst</code></pre>
        <p><code>-m</code> creates the home directory from <code>/etc/skel</code>. <code>-s</code> sets the login shell. Without <code>-m</code>, a home directory may not be created — a classic source of "my shell config is missing" confusion. On RHEL, <code>useradd</code> also consults <code>/etc/login.defs</code> and <code>/etc/default/useradd</code> for defaults.</p>
        <p>Groups come in two flavors. A user's <strong>primary group</strong> is recorded in <code>/etc/passwd</code> and owns new files by default. <strong>Supplementary groups</strong> add access without changing the primary group. Use <code>-aG</code> to append; omitting <code>-a</code> replaces the entire supplementary list.</p>
        <div class="code-label"><span>terminal · groups and membership</span></div>
        <pre><code>sudo groupadd engineering
sudo usermod -aG engineering analyst
groups analyst
id analyst</code></pre>
        <div class="callout warn">
          <div class="callout-title">-a is not optional</div>
          <p><code>usermod -G wheel analyst</code> removes every supplementary group the user had. Always think <code>-aG</code> when adding a group.</p>
        </div>
        <p>Lock or remove accounts deliberately. <code>usermod -L</code> prefixes the password hash to lock it; <code>passwd -l</code> does similar. <code>userdel -r</code> removes the home directory and mail spool, which is destructive and may not be appropriate when audit or data retention applies.</p>
      `
    },
    {
      title: 'sudo is a policy engine',
      body: `
        <p><code>su</code> switches user identity and normally requires the target user's password. <code>sudo</code> runs one command as another user according to a policy, normally authenticating with your own password. sudo is auditable, granular, and the correct default on RHEL.</p>
        <p>On RHEL, members of the <code>wheel</code> group are typically granted full sudo access by the default configuration. Check before changing anything:</p>
        <div class="code-label"><span>terminal · inspect sudo rights</span></div>
        <pre><code>sudo -l
getent group wheel</code></pre>
        <p>Never edit <code>/etc/sudoers</code> directly with a normal editor. A syntax error can lock everyone out of privilege escalation. Use <code>visudo</code>, which validates the file before saving, or add a drop-in file under <code>/etc/sudoers.d/</code> with mode <code>0440</code>.</p>
        <div class="code-label"><span>example sudoers drop-in</span></div>
        <pre><code># /etc/sudoers.d/analyst
analyst ALL=(ALL) ALL
%engineering ALL=(ALL) /usr/bin/systemctl restart httpd</code></pre>
        <p>The first rule grants full sudo. The second grants only one command to a group. Least privilege is not about refusing to grant access; it is about granting the smallest access that does the job.</p>
        <div class="callout tip">
          <div class="callout-title">Audit trail</div>
          <p>sudo logs invocations. When something changes unexpectedly, "who ran what" is often answerable from the journal and sudo logs. Shared root passwords destroy that trail.</p>
        </div>
      `
    },
    {
      title: 'Account hygiene',
      body: `
        <p>Accounts accumulate. Service accounts, contractors, test users, and forgotten demos all become attack surface. Build a review habit.</p>
        <ul>
          <li><strong>Password aging</strong> — <code>chage -l user</code> shows last change, expiry, and warning periods. <code>chage -M 90 user</code> sets a maximum age.</li>
          <li><strong>Expiry</strong> — <code>chage -E 2026-12-31 user</code> disables an account on a date without deleting it.</li>
          <li><strong>No login shell</strong> — service accounts should use <code>/sbin/nologin</code> unless they truly need interactive access.</li>
          <li><strong>Locked, not deleted</strong> — for a departure or investigation, lock first and preserve evidence; delete after retention requirements are clear.</li>
          <li><strong>Review</strong> — list UID 0 accounts, accounts with empty passwords, and members of privileged groups.</li>
        </ul>
        <div class="code-label"><span>terminal · hygiene checks</span></div>
        <pre><code>awk -F: '$3 == 0 { print $1 }' /etc/passwd
sudo awk -F: '($2 == "" ) { print $1 }' /etc/shadow
getent group wheel</code></pre>
        <p>The first command finds every UID 0 account. There should be exactly one: root. A second UID 0 account is a backdoor until proven otherwise.</p>
      `
    }
  ],
  commands: [
    { cmd: 'id', desc: 'Show the current UID, GID, and group memberships.', category: 'Identity' },
    { cmd: 'getent passwd user', desc: 'Query a user through the name service.', category: 'Identity' },
    { cmd: 'getent group wheel', desc: 'Query group membership.', category: 'Identity' },
    { cmd: 'sudo useradd -m -s /bin/bash analyst', desc: 'Create a user with a home and Bash shell.', category: 'Identity' },
    { cmd: 'sudo passwd analyst', desc: 'Set or change a user password.', category: 'Identity' },
    { cmd: 'sudo groupadd engineering', desc: 'Create a group.', category: 'Identity' },
    { cmd: 'sudo usermod -aG engineering analyst', desc: 'Append a supplementary group membership.', category: 'Identity' },
    { cmd: 'sudo userdel -r analyst', desc: 'Remove a user and home directory. Destructive.', category: 'Identity' },
    { cmd: 'sudo -l', desc: 'List sudo privileges for the current user.', category: 'Identity' },
    { cmd: 'sudo visudo', desc: 'Safely edit and validate sudoers policy.', category: 'Identity' },
    { cmd: 'chage -l analyst', desc: 'Show password aging information.', category: 'Identity' }
  ],
  lab: {
    title: 'Provision a least-privilege operator',
    scenario: 'Create an account for a junior operator who needs one specific service restart right, not full root.',
    minutes: 18,
    steps: [
      { text: 'Create a group and a user with a home directory and Bash shell.', cmd: 'sudo groupadd ops && sudo useradd -m -s /bin/bash analyst && sudo passwd analyst', verify: 'id analyst should show the account and its groups.' },
      { text: 'Add the user to the ops group without removing existing memberships.', cmd: 'sudo usermod -aG ops analyst && groups analyst', verify: 'groups analyst should include ops plus every group the account already had.' },
      { text: 'Verify you can query the account through the name service.', cmd: 'getent passwd analyst', verify: 'getent passwd analyst should return the same entry as /etc/passwd.' },
      { text: 'Create a validated sudoers drop-in granting only the httpd restart command.', cmd: 'echo "%ops ALL=(ALL) /usr/bin/systemctl restart httpd" | sudo tee /etc/sudoers.d/ops-httpd && sudo chmod 0440 /etc/sudoers.d/ops-httpd', verify: 'Run sudo visudo -c to validate all sudoers files.' },
      { text: 'Inspect password aging and lock the account when finished.', cmd: 'sudo chage -l analyst && sudo passwd -l analyst', verify: 'chage -l should show the aging policy, and passwd -l should add a locked marker.' }
    ]
  },
  quiz: [
    {
      q: 'Which command adds analyst to the engineering group without removing other supplementary groups?',
      options: ['usermod -G engineering analyst', 'usermod -aG engineering analyst', 'groupmod -a analyst engineering', 'useradd -G engineering analyst'],
      answer: 1,
      why: '-aG appends. -G alone replaces the supplementary group list and can silently remove access.'
    },
    {
      q: 'Where are password hashes stored on a default RHEL system?',
      options: ['/etc/passwd', '/etc/group', '/etc/shadow', '/var/log/secure'],
      answer: 2,
      why: '/etc/shadow is restricted to root. /etc/passwd contains an x placeholder in the password field.'
    },
    {
      q: 'Why should sudoers be edited with visudo or a validated drop-in?',
      options: ['It compresses the file', 'A syntax error can break privilege escalation', 'It encrypts passwords', 'It removes audit logging'],
      answer: 1,
      why: 'visudo validates syntax before committing. A malformed sudoers file can lock out administrative access.'
    }
  ]
};

RHEL.lessons.permissions = {
  id: 'permissions',
  module: 'm02',
  title: 'Permissions, decoded',
  subtitle: 'Read mode strings, set least privilege, and know when ACLs are the honest answer.',
  minutes: 30,
  difficulty: 'Core',
  tags: ['chmod', 'chown', 'umask', 'ACL', 'permissions'],
  objectives: [
    'Decode a long listing into owner, group, and other permissions',
    'Change modes with symbolic and octal chmod',
    'Set ownership and reason about directory execute bits',
    'Calculate effective permissions from umask',
    'Use ACLs and recognize sticky, setgid, and setuid bits'
  ],
  sections: [
    {
      title: 'Read the mode string',
      body: `
        <p>A long listing starts with a ten-character mode string. The first character is the file type; the next nine are three triads of permissions.</p>
        <div class="code-label"><span>terminal · read a long listing</span></div>
        <pre><code>ls -l /etc/passwd /etc/shadow /var/log
-rw-r--r--. 1 root root 2841 Nov 12 10:14 /etc/passwd
----------. 1 root root 1842 Nov 12 10:14 /etc/shadow
drwxr-xr-x. 8 root root 4096 Nov 12 09:02 /var/log</code></pre>
        <p>Break <code>-rw-r--r--</code> into: type <code>-</code> (regular file), owner <code>rw-</code>, group <code>r--</code>, other <code>r--</code>. The trailing dot indicates an SELinux security context is present; it is not a permission.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Symbol</th><th>On a file</th><th>On a directory</th></tr></thead>
            <tbody>
              <tr><td><code>r</code> (4)</td><td>Read contents.</td><td>List names in the directory.</td></tr>
              <tr><td><code>w</code> (2)</td><td>Modify contents.</td><td>Create, rename, or delete entries.</td></tr>
              <tr><td><code>x</code> (1)</td><td>Execute the file.</td><td>Enter the directory and access known paths inside it.</td></tr>
            </tbody>
          </table>
        </div>
        <p>The directory execute bit is the one people miss. Without <code>x</code>, you cannot traverse a directory even if you can read its names. Without <code>r</code>, you can still open a file if you know its exact path and have <code>x</code>.</p>
      `
    },
    {
      title: 'chmod: symbolic and octal',
      body: `
        <p>There are two ways to set a mode, and both are worth knowing. Octal is compact and precise. Symbolic is readable and good for targeted changes.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Octal</th><th>Symbolic</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>640</code></td><td><code>u=rw,g=r,o=</code></td><td>Owner read/write, group read, others none.</td></tr>
              <tr><td><code>750</code></td><td><code>u=rwx,g=rx,o=</code></td><td>Owner full, group read/execute, others none.</td></tr>
              <tr><td><code>755</code></td><td><code>u=rwx,go=rx</code></td><td>Common for executables and public directories.</td></tr>
              <tr><td><code>644</code></td><td><code>u=rw,go=r</code></td><td>Common for regular files.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="code-label"><span>terminal · chmod patterns</span></div>
        <pre><code>chmod 640 report.txt
chmod u+x deploy.sh
chmod g-w,o= report.txt
chmod -R 750 ~/lab/fieldbook</code></pre>
        <p>The <code>-R</code> flag is powerful and blunt. Recursively applying <code>chmod 755</code> to a tree can make private files world-readable and remove execute bits from directories that need them. Preview with <code>find</code> first, then apply deliberately.</p>
        <div class="callout warn">
          <div class="callout-title">Do not chmod 777</div>
          <p>It does not "fix permissions." It grants every local account write access and hides the real ownership or group problem. Fix the group, use an ACL, or set the correct mode.</p>
        </div>
      `
    },
    {
      title: 'Ownership and umask',
      body: `
        <p>Ownership has two parts: user and group. <code>chown</code> changes both. Only root can give files to another user; a regular user may change group only to a group they belong to.</p>
        <div class="code-label"><span>terminal · ownership</span></div>
        <pre><code>sudo chown analyst:engineering report.txt
sudo chown -R analyst:engineering ~analyst/lab
ls -l report.txt</code></pre>
        <p>New files get a default mode modified by the <strong>umask</strong>. The base is <code>666</code> for files and <code>777</code> for directories; the umask is subtracted bitwise (not arithmetic subtraction). A umask of <code>022</code> produces <code>644</code> for files and <code>755</code> for directories.</p>
        <div class="code-label"><span>terminal · inspect and set umask</span></div>
        <pre><code>umask
umask 027
touch /tmp/umask-demo
ls -l /tmp/umask-demo</code></pre>
        <p>A umask of <code>027</code> yields <code>640</code> files and <code>750</code> directories: owner full, group read, others none. Set it in <code>~/.bashrc</code> for a user or <code>/etc/profile.d/</code> for a system-wide policy. Remember that umask only affects newly created objects, not existing ones.</p>
      `
    },
    {
      title: 'ACLs and special bits',
      body: `
        <p>Traditional permissions have exactly one owner and one group. When you need to grant a second user or a second group access, an <strong>access control list</strong> is the honest tool.</p>
        <div class="code-label"><span>terminal · grant a second group access</span></div>
        <pre><code>sudo setfacl -m g:audit:r report.txt
getfacl report.txt
sudo setfacl -m u:analyst:rw report.txt</code></pre>
        <p>An ACL entry appears as a <code>+</code> at the end of the mode string. <code>getfacl</code> shows the entries; <code>setfacl -x</code> removes them. Default ACLs on a directory can propagate access to newly created files.</p>
        <p>Three special bits deserve recognition:</p>
        <ul>
          <li><strong>sticky bit</strong> on a directory (<code>drwxrwxrwt</code>) lets users delete only their own files. This is why <code>/tmp</code> is shared safely. Set with <code>chmod +t</code>.</li>
          <li><strong>setgid</strong> on a directory makes new files inherit the directory's group. This is the standard shared-project pattern. Set with <code>chmod g+s</code>.</li>
          <li><strong>setuid</strong> on an executable runs it with the file owner's effective UID. It is potentially dangerous and should be rare. Find them with <code>find / -perm -4000 -type f</code>.</li>
        </ul>
        <div class="callout note">
          <div class="callout-title">SELinux is a second gate</div>
          <p>Traditional permissions and ACLs are not the whole story on RHEL. SELinux can deny access even when the mode bits allow it. You will learn to read <code>ls -Z</code>, <code>getenforce</code>, and AVC denials in the security lesson.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'ls -l file', desc: 'Show type, mode, owner, group, and size.', category: 'Permissions' },
    { cmd: 'chmod 640 file', desc: 'Set an exact octal mode.', category: 'Permissions' },
    { cmd: 'chmod u+x script.sh', desc: 'Add execute permission for the owner.', category: 'Permissions' },
    { cmd: 'chown analyst:engineering file', desc: 'Set user and group ownership.', category: 'Permissions' },
    { cmd: 'umask', desc: 'Show the current default permission mask.', category: 'Permissions' },
    { cmd: 'getfacl file', desc: 'Show access control list entries.', category: 'Permissions' },
    { cmd: 'setfacl -m u:analyst:rw file', desc: 'Grant a named user read/write via ACL.', category: 'Permissions' },
    { cmd: 'chmod g+s shared-dir', desc: 'Make new files inherit the directory group.', category: 'Permissions' },
    { cmd: 'find / -perm -4000 -type f', desc: 'Locate setuid executables. Audit carefully.', category: 'Permissions' }
  ],
  lab: {
    title: 'Build a shared project directory',
    scenario: 'Two groups need controlled access to one directory. Solve it without 777 and without changing the whole filesystem.',
    minutes: 20,
    steps: [
      { text: 'Create a shared directory, two groups, and a builder user.', cmd: 'sudo mkdir -p /srv/fieldbook && sudo groupadd builders && sudo groupadd auditors && sudo useradd -m -s /bin/bash builder && sudo usermod -aG builders builder', verify: 'groupadd and useradd should succeed; id builder should show the builders group.' },
      { text: 'Set ownership and a group-readable/writable mode.', cmd: 'sudo chown root:builders /srv/fieldbook && sudo chmod 2770 /srv/fieldbook', verify: 'ls -ld /srv/fieldbook should show drwxrws--- and the setgid s.' },
      { text: 'Create a file as a member of builders and confirm group inheritance.', cmd: 'sudo -u builder touch /srv/fieldbook/report.txt && ls -l /srv/fieldbook/report.txt', verify: 'The owner should be builder and the group should be builders, not the user primary group.' },
      { text: 'Grant auditors read access with an ACL instead of changing the mode.', cmd: 'sudo setfacl -m g:auditors:r /srv/fieldbook/report.txt && getfacl /srv/fieldbook/report.txt', verify: 'getfacl should show group:auditors:r-- on report.txt without changing the base mode.' },
      { text: 'Verify the base mode, ACL, and effective access.', cmd: 'ls -l /srv/fieldbook/report.txt && getfacl /srv/fieldbook/report.txt', verify: 'A + appears after the mode. The ACL lists auditors with r--.' }
    ]
  },
  quiz: [
    {
      q: 'What does chmod 750 grant?',
      options: ['rwxr-x---', 'rwxrwxrwx', 'rw-r-----', 'rwxr----x'],
      answer: 0,
      why: '7 = rwx, 5 = r-x, 0 = none. Owner gets rwx, group r-x, others nothing.'
    },
    {
      q: 'Why can a directory with mode 600 prevent access to a file inside it even if the file is world-readable?',
      options: ['The file is encrypted', 'Directory execute permission is needed to traverse it', 'The file has no inode', 'SELinux always blocks it'],
      answer: 1,
      why: 'To reach a known path inside a directory, you need execute (search) permission on the directory.'
    },
    {
      q: 'What is the standard way to let two groups share write access without making a directory world-writable?',
      options: ['chmod 777', 'set an ACL for the second group', 'disable SELinux', 'make every user root'],
      answer: 1,
      why: 'ACLs grant additional named users or groups precisely. 777 gives everyone write access and hides the design.'
    }
  ]
};