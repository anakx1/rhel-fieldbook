/* Module 03 — Systems */

RHEL.lessons.processes = {
  id: 'processes',
  module: 'm03',
  title: 'Processes, signals, jobs',
  subtitle: 'See what is running, stop it politely, and understand what systemd already knows.',
  minutes: 26,
  difficulty: 'Core',
  tags: ['ps', 'top', 'signals', 'jobs', 'systemd'],
  objectives: [
    'List and filter processes by user, name, and resource use',
    'Interpret process states, parents, and load averages',
    'Send the right signal with kill and pkill',
    'Move work between foreground and background',
    'Use systemd tools to see a service as a group of processes'
  ],
  sections: [
    {
      title: 'A process is a running program',
      body: `
        <p>Every process has a <strong>PID</strong>, a parent PID, an owner, a state, and a command line. PID 1 on RHEL is <code>systemd</code>, which adopts or reaps orphaned processes and manages services. A process lineage is called a tree for a reason.</p>
        <div class="code-label"><span>terminal · process inventory</span></div>
        <pre><code>ps -ef
ps aux
pgrep -a sshd
ps -eo pid,ppid,user,stat,%cpu,%mem,cmd --sort=-%cpu | head</code></pre>
        <p><code>ps -ef</code> uses BSD-style full format. <code>ps aux</code> is the common BSD syntax. Both are fine; pick one and learn to read it. <code>pgrep -a</code> finds processes by name and prints the full command line.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>State</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>R</code></td><td>Running or runnable.</td></tr>
              <tr><td><code>S</code></td><td>Interruptible sleep, waiting for an event.</td></tr>
              <tr><td><code>D</code></td><td>Uninterruptible sleep, often I/O. Cannot be killed until it returns.</td></tr>
              <tr><td><code>T</code></td><td>Stopped by a job-control signal.</td></tr>
              <tr><td><code>Z</code></td><td>Zombie: exited, waiting for its parent to reap it.</td></tr>
            </tbody>
          </table>
        </div>
        <p>A single <code>D</code> state process can indicate a storage problem. A pile of <code>Z</code> processes usually points to a broken parent, not a broken child. The state column is diagnostic, not decorative.</p>
      `
    },
    {
      title: 'Signals: ask, then insist',
      body: `
        <p>Signals are asynchronous notifications to a process. The important ones:</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Signal</th><th>Number</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>SIGTERM</code></td><td>15</td><td>Polite request to terminate. The default for <code>kill</code>.</td></tr>
              <tr><td><code>SIGINT</code></td><td>2</td><td>Interrupt from Ctrl+C.</td></tr>
              <tr><td><code>SIGHUP</code></td><td>1</td><td>Hangup; often used to ask a daemon to reload configuration.</td></tr>
              <tr><td><code>SIGKILL</code></td><td>9</td><td>Immediate, unblockable termination. No cleanup.</td></tr>
              <tr><td><code>SIGSTOP</code></td><td>19</td><td>Pause a process. Cannot be caught or ignored.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="code-label"><span>terminal · terminate with escalating force</span></div>
        <pre><code>kill -TERM 4242
kill 4242
kill -9 4242
pkill -TERM -u analyst sleep</code></pre>
        <p>Always try <code>SIGTERM</code> first. It gives the process a chance to flush buffers, close files, and release locks. <code>SIGKILL</code> is for a process that is genuinely stuck or ignoring termination — it can leave corrupted state or stale lock files. Killing a database with <code>-9</code> is not a normal maintenance action.</p>
        <p>Use <code>pkill</code> carefully: it matches broadly. <code>pkill -u analyst sleep</code> is narrower than <code>pkill sleep</code>. Run <code>pgrep -a</code> with the same pattern first to see exactly what would be targeted.</p>
      `
    },
    {
      title: 'Foreground, background, and the terminal',
      body: `
        <p>A foreground process owns your terminal input. A background job runs without blocking the prompt but may still be tied to the terminal session.</p>
        <div class="code-label"><span>terminal · job control</span></div>
        <pre><code>sleep 300 &amp;
jobs
fg %1
bg %1
kill %1</code></pre>
        <p>The ampersand starts a job in the background. <code>Ctrl+Z</code> suspends the current foreground job — it does not terminate it. <code>bg</code> resumes it in the background; <code>fg</code> brings it back. The percent sign addresses a job, not a PID.</p>
        <p><code>nohup</code> makes a command ignore SIGHUP and detaches it from the terminal's hangup behavior. It is useful for quick lab work, but it is not a service manager. Production workloads belong in a systemd unit, where restarts, logging, dependencies, and resource limits are explicit.</p>
        <div class="callout tip">
          <div class="callout-title">Use tmux for long sessions</div>
          <p>SSH sessions drop. A terminal multiplexer such as <code>tmux</code> keeps the shell alive on the remote host and lets you reconnect. It is more reliable than hoping a background job survives.</p>
        </div>
      `
    },
    {
      title: 'Resources and the systemd view',
      body: `
        <p>CPU and memory questions are usually about trends, not a single snapshot. <code>top</code> shows live processes sorted by CPU; press <code>M</code> to sort by memory, <code>P</code> by CPU, and <code>q</code> to quit. <code>free -h</code> shows memory and swap; <code>vmstat 1</code> shows runnable processes, blocked processes, swap activity, and I/O over time.</p>
        <div class="code-label"><span>terminal · resource snapshot</span></div>
        <pre><code>uptime
free -h
vmstat 1 5
systemd-cgtop</code></pre>
        <p><code>systemd-cgtop</code> groups resource use by control group, which is often more useful than a flat process list. A service is a cgroup; its memory and CPU are managed as a unit. <code>systemctl status service</code> also shows the service's main PID and recent log lines.</p>
        <p>Do not confuse <strong>load average</strong> with CPU percentage. Load counts runnable and uninterruptible processes. A load of 8 on an 8-core system can be saturated; a load of 8 on a 2-core system is heavily oversubscribed. On Linux, high load can also mean processes stuck in <code>D</code> state waiting for disk.</p>
      `
    }
  ],
  commands: [
    { cmd: 'ps -ef', desc: 'List every process with full command lines.', category: 'Processes' },
    { cmd: 'pgrep -a name', desc: 'Find processes by name with arguments.', category: 'Processes' },
    { cmd: 'top', desc: 'Live process and resource monitor.', category: 'Processes' },
    { cmd: 'free -h', desc: 'Show memory and swap in human units.', category: 'Processes' },
    { cmd: 'vmstat 1 5', desc: 'Sample system activity once per second, five times.', category: 'Processes' },
    { cmd: 'kill -TERM PID', desc: 'Politely ask a process to terminate.', category: 'Processes' },
    { cmd: 'kill -9 PID', desc: 'Force termination. Last resort.', category: 'Processes' },
    { cmd: 'pkill -u user name', desc: 'Signal processes by owner and name.', category: 'Processes' },
    { cmd: 'jobs', desc: 'List background jobs in the current shell.', category: 'Processes' },
    { cmd: 'systemd-cgtop', desc: 'Show resource use by systemd cgroup.', category: 'Processes' }
  ],
  lab: {
    title: 'Practice polite termination',
    scenario: 'Create a controlled process, inspect it, move it around, and stop it without resorting to SIGKILL.',
    minutes: 12,
    steps: [
      { text: 'Start a long sleep in the background.', cmd: 'sleep 600 &amp;', verify: 'The shell prints a job number and PID.' },
      { text: 'List jobs and locate the process independently.', cmd: 'jobs && pgrep -a sleep' },
      { text: 'Inspect the process parent and state.', cmd: 'ps -o pid,ppid,stat,etime,cmd -p $(pgrep -n sleep)' },
      { text: 'Send SIGTERM and confirm it exits.', cmd: 'kill -TERM $(pgrep -n sleep) && jobs' },
      { text: 'Check memory and load for context.', cmd: 'free -h && uptime' }
    ]
  },
  quiz: [
    {
      q: 'Which signal should you try first to stop a service process?',
      options: ['SIGKILL (9)', 'SIGTERM (15)', 'SIGSTOP (19)', 'SIGINT (2)'],
      answer: 1,
      why: 'SIGTERM asks the process to terminate cleanly. SIGKILL cannot be caught and skips cleanup.'
    },
    {
      q: 'What does Ctrl+Z do to a foreground process?',
      options: ['Kills it', 'Suspends it', 'Restarts it', 'Detaches it from systemd'],
      answer: 1,
      why: 'Ctrl+Z sends SIGTSTP, suspending the job. Use bg to resume in the background or fg to return.'
    },
    {
      q: 'What does a high load average with low CPU usage often indicate?',
      options: ['Too many idle processes', 'Processes blocked on I/O in D state', 'A DNS failure', 'The firewall is disabled'],
      answer: 1,
      why: 'Linux load includes uninterruptible tasks. Storage stalls can push load up while CPU sits idle.'
    }
  ]
};

RHEL.lessons.packages = {
  id: 'packages',
  module: 'm03',
  title: 'Packages and repositories',
  subtitle: 'Install software from signed repositories, inspect what owns a file, and undo a transaction.',
  minutes: 29,
  difficulty: 'Core',
  tags: ['dnf', 'rpm', 'repositories', 'packages', 'subscription'],
  objectives: [
    'Explain the roles of DNF and RPM',
    'Inspect repositories and package metadata',
    'Install, remove, and update software with DNF',
    'Query installed files and verify package integrity',
    'Use transaction history to understand or reverse a change'
  ],
  sections: [
    {
      title: 'Two tools, two jobs',
      body: `
        <p><strong>RPM</strong> is the package format and the low-level database. <strong>DNF</strong> is the dependency resolver and repository client that drives RPM. Think of RPM as the container and DNF as the logistics system.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Tool</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>Install from a repository</td><td>dnf</td><td><code>dnf install httpd</code></td></tr>
              <tr><td>Search available packages</td><td>dnf</td><td><code>dnf search web server</code></td></tr>
              <tr><td>Show package details</td><td>dnf</td><td><code>dnf info httpd</code></td></tr>
              <tr><td>List installed packages</td><td>rpm</td><td><code>rpm -qa</code></td></tr>
              <tr><td>Find the owner of a file</td><td>rpm</td><td><code>rpm -qf /usr/sbin/httpd</code></td></tr>
              <tr><td>List files in a package</td><td>rpm / dnf</td><td><code>rpm -ql httpd</code></td></tr>
            </tbody>
          </table>
        </div>
        <p>Packages are cryptographically signed. DNF verifies repository metadata and package signatures by default; do not disable GPG checking to make an error disappear. If a third-party repository has a bad key, fix the trust relationship or do not use the repository.</p>
        <p>On a subscribed RHEL system, <code>subscription-manager</code> attaches entitlements and configures the appropriate repositories. Cloud and developer images may already be registered. Verify with:</p>
        <div class="code-label"><span>terminal · repository state</span></div>
        <pre><code>sudo subscription-manager status
dnf repolist
ls /etc/yum.repos.d/</code></pre>
      `
    },
    {
      title: 'Look before you install',
      body: `
        <p>Good package hygiene starts with a query. Find the exact name, confirm the source repository, and read what the package provides before changing the system.</p>
        <div class="code-label"><span>terminal · package reconnaissance</span></div>
        <pre><code>dnf search httpd
dnf info httpd
dnf provides /usr/sbin/httpd
dnf repoquery -l httpd</code></pre>
        <p><code>dnf info</code> shows version, release, architecture, repository, size, license, and a summary. The repository name is important: a package from an untrusted third-party repo is a different risk decision from one in the base RHEL repositories.</p>
        <p>For installed packages, RPM answers precise questions:</p>
        <div class="code-label"><span>terminal · installed package queries</span></div>
        <pre><code>rpm -qa | grep httpd
rpm -qi httpd
rpm -ql httpd | head
rpm -qf /etc/httpd/conf/httpd.conf
rpm -V httpd</code></pre>
        <p><code>rpm -V</code> verifies file metadata against the package database. It can reveal modified permissions, missing files, or changed checksums. Configuration files often show as modified — that is expected. Unexplained changes in binaries are not.</p>
      `
    },
    {
      title: 'Change software as a transaction',
      body: `
        <p>DNF resolves dependencies and presents a transaction. Read it. Confirm that the package count, download size, and removals match your intent, especially on a production host.</p>
        <div class="code-label"><span>terminal · install, update, remove</span></div>
        <pre><code>sudo dnf install httpd
sudo dnf update
sudo dnf remove httpd
sudo dnf history
sudo dnf history info 42
sudo dnf history undo 42</code></pre>
        <p><code>dnf update</code> without arguments updates all installed packages. That may be correct for a routine patch window and wrong for a targeted fix. For a single package, name it: <code>sudo dnf update openssl</code>. Use <code>dnf check-update</code> to preview available updates without applying them.</p>
        <p>Every transaction gets a history ID. This is invaluable during an incident: you can see what changed, when, and by which user. Undo is not magic — it attempts to reverse the transaction, and dependency conflicts may prevent a clean rollback. Snapshots and tested backups remain the real safety net.</p>
        <div class="callout warn">
          <div class="callout-title">Do not pipe the internet into your shell</div>
          <p>Adding random repositories or running vendor install scripts bypasses signed package policy and change tracking. Prefer official repositories; if you must add a third party, document the source and trust decision.</p>
        </div>
      `
    },
    {
      title: 'Groups, streams, and verification',
      body: `
        <p>Some software is best installed as a group of packages. RHEL provides package groups for common roles:</p>
        <div class="code-label"><span>terminal · package groups</span></div>
        <pre><code>dnf group list
sudo dnf group install "Development Tools"
dnf group info "Development Tools"</code></pre>
        <p>RHEL 9 also exposes <strong>module streams</strong> for selected application versions, such as alternative language runtimes. Check what is available before assuming a version:</p>
        <div class="code-label"><span>terminal · module streams</span></div>
        <pre><code>dnf module list
dnf module info nodejs</code></pre>
        <p>Streams are being reworked in RHEL 10 as application streams and newer DNF behavior. Treat version-specific module commands as something to verify on the system in front of you, not something to paste blindly from an old blog post.</p>
        <p>Finally, verify the baseline. <code>rpm -Va</code> checks every installed package and can take time; it is a useful audit step on a quiet system. <code>dnf check-update</code> tells you what is pending. <code>dnf history</code> tells you what happened.</p>
      `
    }
  ],
  commands: [
    { cmd: 'dnf repolist', desc: 'List enabled repositories.', category: 'Packages' },
    { cmd: 'dnf search httpd', desc: 'Search package names and summaries.', category: 'Packages' },
    { cmd: 'dnf info httpd', desc: 'Show package metadata and source repository.', category: 'Packages' },
    { cmd: 'dnf provides */sshd', desc: 'Find a package that supplies a file or command.', category: 'Packages' },
    { cmd: 'sudo dnf install httpd', desc: 'Install a package and its dependencies.', category: 'Packages' },
    { cmd: 'sudo dnf remove httpd', desc: 'Remove a package and unneeded dependencies.', category: 'Packages' },
    { cmd: 'sudo dnf update openssl', desc: 'Update a specific package.', category: 'Packages' },
    { cmd: 'dnf check-update', desc: 'Preview available updates.', category: 'Packages' },
    { cmd: 'rpm -qa', desc: 'List all installed packages.', category: 'Packages' },
    { cmd: 'rpm -qf /usr/sbin/sshd', desc: 'Find the package that owns a file.', category: 'Packages' },
    { cmd: 'rpm -V httpd', desc: 'Verify installed files against package metadata.', category: 'Packages' },
    { cmd: 'dnf history', desc: 'List package transactions.', category: 'Packages' }
  ],
  lab: {
    title: 'Trace a package end to end',
    scenario: 'Install a web server from a trusted repository, inspect exactly what it placed on disk, then remove it cleanly.',
    minutes: 18,
    steps: [
      { text: 'Confirm repositories are available and locate httpd.', cmd: 'dnf repolist && dnf info httpd', verify: 'Note the repository name, version, and architecture.' },
      { text: 'Install httpd, reading the transaction summary before confirming.', cmd: 'sudo dnf install httpd' },
      { text: 'Find the package owner of the main binary and list package files.', cmd: 'rpm -qf /usr/sbin/httpd && rpm -ql httpd | head -n 20' },
      { text: 'Query the service unit and configuration file ownership.', cmd: 'rpm -ql httpd | grep -E "(service|conf)$"' },
      { text: 'Review the transaction history and remove the package.', cmd: 'dnf history | head && sudo dnf remove httpd' }
    ]
  },
  quiz: [
    {
      q: 'Which command finds the installed package that owns /usr/sbin/sshd?',
      options: ['dnf install /usr/sbin/sshd', 'rpm -qf /usr/sbin/sshd', 'dnf history /usr/sbin/sshd', 'rpm -ql /usr/sbin/sshd'],
      answer: 1,
      why: 'rpm -qf queries the RPM database for the owning package. dnf provides works for available packages too.'
    },
    {
      q: 'What is the safest first step before a large dnf update?',
      options: ['Disable GPG checks', 'Review check-update and the transaction, and ensure a rollback path', 'Delete the DNF cache', 'Remove old kernels'],
      answer: 1,
      why: 'Preview the change and know how to recover. Disabling signature checks is never the answer.'
    },
    {
      q: 'What does dnf history provide?',
      options: ['A list of shell commands', 'A record of package transactions with IDs', 'The kernel boot log', 'Firewall rules'],
      answer: 1,
      why: 'DNF transactions are recorded with IDs, users, and package changes, enabling inspection and attempted undo.'
    }
  ]
};

RHEL.lessons.services = {
  id: 'services',
  module: 'm03',
  title: 'Services and the journal',
  subtitle: 'systemd is the operating system’s control plane. Learn to ask it what is true.',
  minutes: 27,
  difficulty: 'Core',
  tags: ['systemd', 'systemctl', 'journalctl', 'services', 'boot'],
  objectives: [
    'Explain units, targets, and the difference between active and enabled',
    'Start, stop, restart, enable, and mask services',
    'Read service state and logs with systemctl and journalctl',
    'Find failed units and investigate this boot',
    'Understand when a daemon-reload is required'
  ],
  sections: [
    {
      title: 'Units are the vocabulary',
      body: `
        <p>systemd manages <strong>units</strong>: services, sockets, timers, mounts, targets, and more. A unit is described by a file, usually under <code>/usr/lib/systemd/system/</code> for packages or <code>/etc/systemd/system/</code> for local overrides.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Unit type</th><th>Purpose</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td><code>.service</code></td><td>A long-running daemon or oneshot task.</td><td><code>sshd.service</code></td></tr>
              <tr><td><code>.socket</code></td><td>Socket activation; starts a service on demand.</td><td><code>sshd.socket</code></td></tr>
              <tr><td><code>.timer</code></td><td>Scheduled activation, a modern cron alternative.</td><td><code>dnf-makecache.timer</code></td></tr>
              <tr><td><code>.mount</code></td><td>A filesystem mount managed by systemd.</td><td><code>home.mount</code></td></tr>
              <tr><td><code>.target</code></td><td>A grouping or boot milestone.</td><td><code>multi-user.target</code></td></tr>
            </tbody>
          </table>
        </div>
        <p><strong>Active</strong> means running now. <strong>Enabled</strong> means configured to start at boot. They are independent. A service can be active but not enabled — it will disappear after reboot. A service can be enabled but failed — it tried to start and did not.</p>
        <div class="code-label"><span>terminal · ask the three questions</span></div>
        <pre><code>systemctl status sshd
systemctl is-active sshd
systemctl is-enabled sshd</code></pre>
      `
    },
    {
      title: 'Start, enable, restart, mask',
      body: `
        <p><code>systemctl</code> is the control interface. Use <code>sudo</code> for changes.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Command</th><th>Effect</th></tr></thead>
            <tbody>
              <tr><td><code>systemctl start sshd</code></td><td>Start now, do not change boot behavior.</td></tr>
              <tr><td><code>systemctl enable --now sshd</code></td><td>Enable at boot and start now.</td></tr>
              <tr><td><code>systemctl restart sshd</code></td><td>Stop then start. Disrupts active connections.</td></tr>
              <tr><td><code>systemctl reload sshd</code></td><td>Ask the service to reload config if supported. Less disruptive.</td></tr>
              <tr><td><code>systemctl disable sshd</code></td><td>Remove boot activation. Does not stop the current process.</td></tr>
              <tr><td><code>systemctl mask sshd</code></td><td>Prevent any start, even by dependency. Stronger than disable.</td></tr>
              <tr><td><code>systemctl unmask sshd</code></td><td>Remove the mask.</td></tr>
            </tbody>
          </table>
        </div>
        <p>After editing a unit file, run <code>sudo systemctl daemon-reload</code>. systemd caches unit definitions; without the reload, your changes may not be seen. After changing the unit's <em>configuration file</em>, reload or restart the service itself — those are different layers.</p>
        <div class="callout warn">
          <div class="callout-title">Restarting SSH is risky</div>
          <p>If you are connected over SSH, restarting <code>sshd</code> can drop your session. On modern OpenSSH, existing sessions often survive, but do not bet your only access on it. Keep a console path open.</p>
        </div>
      `
    },
    {
      title: 'Journald: the first place to look',
      body: `
        <p>systemd captures service output in the <strong>journal</strong>. <code>journalctl</code> reads it with filtering that flat files cannot match.</p>
        <div class="code-label"><span>terminal · journal queries</span></div>
        <pre><code>journalctl -u sshd
journalctl -u sshd --since "1 hour ago"
journalctl -u sshd -f
journalctl -p err -b
journalctl --since today --until "10:00"</code></pre>
        <p><code>-u</code> filters by unit, <code>--since</code> and <code>--until</code> narrow time, <code>-f</code> follows, <code>-p err</code> filters by priority, and <code>-b</code> limits to the current boot. <code>-b -1</code> reads the previous boot if persistent storage is enabled.</p>
        <p>By default, the journal may be volatile and live in <code>/run/log/journal</code>. To retain logs across reboots, create <code>/var/log/journal</code> and restart <code>systemd-journald</code>. Capacity is managed by <code>journald.conf</code>; on a busy host, plan disk usage deliberately.</p>
        <p>Traditional text logs are still useful. rsyslog may write <code>/var/log/messages</code>, <code>/var/log/secure</code>, and application-specific files. The journal often has the same events, with more structure.</p>
      `
    },
    {
      title: 'Boot targets and failed units',
      body: `
        <p>A <strong>target</strong> is a boot milestone. The default on a server is usually <code>multi-user.target</code>; a graphical desktop uses <code>graphical.target</code>. Targets replace the old runlevel model but are not just renamed runlevels.</p>
        <div class="code-label"><span>terminal · inspect boot state</span></div>
        <pre><code>systemctl get-default
systemctl list-units --type=target
systemctl --failed
systemctl list-units --type=service --state=running</code></pre>
        <p><code>systemctl --failed</code> is one of the highest-value commands on a new system. It shows units that tried and failed, even if the rest of the boot succeeded. Investigate with <code>systemctl status</code> and <code>journalctl -u</code>.</p>
        <p>To change the default target:</p>
        <div class="code-label"><span>terminal · change default boot target</span></div>
        <pre><code>sudo systemctl set-default multi-user.target</code></pre>
        <p>Do not use <code>systemctl isolate</code> casually on a remote production host. Isolating a target stops units that are not part of the new target, which can terminate your access. In later levels you will practice recovery in a lab with console access.</p>
      `
    }
  ],
  commands: [
    { cmd: 'systemctl status sshd', desc: 'Show service state, PID, and recent log lines.', category: 'Services' },
    { cmd: 'systemctl is-active sshd', desc: 'Print whether the service is running now.', category: 'Services' },
    { cmd: 'systemctl is-enabled sshd', desc: 'Print whether the service starts at boot.', category: 'Services' },
    { cmd: 'sudo systemctl enable --now httpd', desc: 'Enable at boot and start immediately.', category: 'Services' },
    { cmd: 'sudo systemctl restart httpd', desc: 'Restart a service. Disruptive.', category: 'Services' },
    { cmd: 'sudo systemctl daemon-reload', desc: 'Reload unit definitions after editing them.', category: 'Services' },
    { cmd: 'systemctl --failed', desc: 'List units that failed to start.', category: 'Services' },
    { cmd: 'journalctl -u sshd --since "1 hour ago"', desc: 'Read recent logs for one unit.', category: 'Services' },
    { cmd: 'journalctl -p err -b', desc: 'Show error-priority messages from this boot.', category: 'Services' },
    { cmd: 'systemctl get-default', desc: 'Show the default boot target.', category: 'Services' }
  ],
  lab: {
    title: 'Investigate a service like an operator',
    scenario: 'Answer the four questions: is it running, will it start at boot, what does it say, and what else failed?',
    minutes: 14,
    steps: [
      { text: 'Inspect SSH state and boot posture.', cmd: 'systemctl status sshd && systemctl is-enabled sshd', verify: 'Note active vs enabled separately.' },
      { text: 'Read the last 20 journal lines for SSH.', cmd: 'journalctl -u sshd -n 20 --no-pager' },
      { text: 'List every failed unit on the system.', cmd: 'systemctl --failed', verify: 'An empty list is a valid and useful result.' },
      { text: 'Show the default boot target and running services.', cmd: 'systemctl get-default && systemctl list-units --type=service --state=running | head' },
      { text: 'Install a service package, enable it, verify it, then disable it.', cmd: 'sudo dnf install -y httpd && sudo systemctl enable --now httpd && systemctl is-active httpd && sudo systemctl disable --now httpd' }
    ]
  },
  quiz: [
    {
      q: 'What is the difference between active and enabled?',
      options: ['They are identical', 'Active means running now; enabled means starts at boot', 'Enabled means running now; active means installed', 'Active applies only to timers'],
      answer: 1,
      why: 'A service can be running without being enabled, or enabled but currently stopped or failed.'
    },
    {
      q: 'Which command shows logs for a single systemd unit?',
      options: ['journalctl -u sshd', 'systemctl logs sshd', 'tail -f sshd', 'dmesg -u sshd'],
      answer: 0,
      why: 'journalctl -u filters the journal by unit. Add --since, -f, or -p for more control.'
    },
    {
      q: 'When must you run systemctl daemon-reload?',
      options: ['After every service restart', 'After editing a unit file', 'After reading the journal', 'After installing any package'],
      answer: 1,
      why: 'systemd caches unit definitions. daemon-reload makes it re-read unit files from disk.'
    }
  ]
};

RHEL.lessons.network = {
  id: 'network',
  module: 'm03',
  title: 'Network without panic',
  subtitle: 'Addresses, routes, ports, DNS, and a firewall you should not switch off.',
  minutes: 30,
  difficulty: 'Core',
  tags: ['network', 'ip', 'nmcli', 'ss', 'firewalld', 'DNS'],
  objectives: [
    'Inspect interfaces, addresses, routes, and connection profiles',
    'Configure a basic connection with nmcli',
    'Find listening ports and the processes behind them',
    'Test DNS and application-layer connectivity',
    'Open a service in firewalld without disabling the firewall'
  ],
  sections: [
    {
      title: 'The four facts of network triage',
      body: `
        <p>When "the network is down," establish four facts before changing anything: the interface, the address, the route, and the name resolution. Most problems live in one of those layers.</p>
        <div class="code-label"><span>terminal · interfaces and addresses</span></div>
        <pre><code>ip addr
ip route
nmcli device status
nmcli connection show</code></pre>
        <p><code>ip addr</code> shows interfaces, link state, MAC addresses, and IPv4/IPv6 addresses. <code>ip route</code> shows the routing table; the line marked <code>default</code> is the gateway used for off-subnet traffic. If the default route is missing, local communication may work while the internet does not.</p>
        <p>On RHEL, NetworkManager owns network configuration. <code>nmcli</code> is the supported command-line interface. A <strong>device</strong> is the hardware or virtual interface; a <strong>connection</strong> is a profile applied to it. A device can have multiple profiles, but only one active connection at a time.</p>
        <div class="callout note">
          <div class="callout-title">Files vs profiles</div>
          <p>Do not hand-edit <code>/etc/sysconfig/network-scripts/ifcfg-*</code> on RHEL 9+ unless you have a specific legacy reason. Use <code>nmcli</code> so NetworkManager remains the source of truth.</p>
        </div>
      `
    },
    {
      title: 'A safe nmcli change',
      body: `
        <p>Changing networking over SSH can cut your own connection. In a lab, use the console. The pattern is: inspect, modify, bring up, verify.</p>
        <div class="code-label"><span>terminal · static IPv4 profile</span></div>
        <pre><code>nmcli connection show "Wired connection 1"
sudo nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses 192.0.2.50/24 \
  ipv4.gateway 192.0.2.1 \
  ipv4.dns 192.0.2.53
sudo nmcli connection up "Wired connection 1"
ip addr show</code></pre>
        <p>For DHCP, set <code>ipv4.method auto</code> and clear the manual addresses. <code>nmcli connection modify</code> changes the stored profile; <code>connection up</code> applies it. You can also use <code>nmcli device reapply</code> for some changes without a full reconnect, but a lab is the place to learn the difference.</p>
        <p>Hostname identity is separate from IP addressing. Use <code>hostnamectl hostname rhel01.example.com</code> to set the static hostname, and ensure DNS or <code>/etc/hosts</code> can resolve it.</p>
      `
    },
    {
      title: 'Ports, DNS, and reachability',
      body: `
        <p>An application can be running but not listening where you expect. <code>ss</code> is the modern socket inspector:</p>
        <div class="code-label"><span>terminal · listening sockets</span></div>
        <pre><code>ss -tulpn
ss -tan state established
ss -tlnp | grep :22</code></pre>
        <p><code>-t</code> TCP, <code>-u</code> UDP, <code>-l</code> listening, <code>-n</code> numeric ports, <code>-p</code> process. The process column requires privilege for sockets owned by other users. A service bound only to <code>127.0.0.1</code> will not accept remote connections even if the port is open locally.</p>
        <p>DNS is a frequent culprit. Test resolution separately from reachability:</p>
        <div class="code-label"><span>terminal · resolution and reachability</span></div>
        <pre><code>getent hosts server.example.com
cat /etc/resolv.conf
ping -c 3 192.0.2.50
curl -I http://server.example.com</code></pre>
        <p><code>getent hosts</code> uses the system's name service switch, which is what applications actually use. <code>dig</code> or <code>host</code> queries DNS directly but may not reflect <code>/etc/hosts</code> or other name service sources. Test with the same mechanism the application uses.</p>
        <p><code>ping</code> proves ICMP reachability, not application health. A host can block ICMP and still serve HTTP. <code>curl -I</code> checks the application layer; <code>ss</code> checks the listener; <code>ip route</code> checks the path. Use the layer that matches the symptom.</p>
      `
    },
    {
      title: 'firewalld: open the door, keep the wall',
      body: `
        <p>RHEL ships with <strong>firewalld</strong> enabled. It is not an obstacle to work around; it is part of the service deployment. Open only the service or port that is required.</p>
        <div class="code-label"><span>terminal · inspect and open a service</span></div>
        <pre><code>sudo firewall-cmd --state
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
sudo firewall-cmd --list-services</code></pre>
        <p><code>--permanent</code> writes to the persistent configuration. Without it, the change is runtime-only and disappears on reload or reboot. Many "it worked yesterday" firewall stories are missing <code>--permanent</code>; many "it still doesn't work" stories are missing <code>--reload</code>.</p>
        <p>For a nonstandard port, add it explicitly: <code>--add-port=8080/tcp</code>. Prefer service definitions when available because they carry the correct ports and protocol semantics. Disabling the firewall to test is a bad habit that eventually reaches production.</p>
        <div class="callout warn">
          <div class="callout-title">Do not stop firewalld to prove a point</div>
          <p>If stopping the firewall "fixes" the problem, you have learned that the rule set is involved. Now inspect zones, services, ports, and source addresses — and add the narrowest rule that works.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'ip addr', desc: 'Show interfaces and assigned addresses.', category: 'Network' },
    { cmd: 'ip route', desc: 'Show the routing table and default gateway.', category: 'Network' },
    { cmd: 'nmcli device status', desc: 'Show network devices and connection state.', category: 'Network' },
    { cmd: 'nmcli connection show', desc: 'List saved connection profiles.', category: 'Network' },
    { cmd: 'nmcli connection modify ...', desc: 'Change a profile; apply with connection up.', category: 'Network' },
    { cmd: 'ss -tulpn', desc: 'List listening TCP/UDP sockets with processes.', category: 'Network' },
    { cmd: 'getent hosts server', desc: 'Resolve a name using the system name service.', category: 'Network' },
    { cmd: 'ping -c 3 host', desc: 'Test ICMP reachability.', category: 'Network' },
    { cmd: 'curl -I http://host', desc: 'Test an HTTP endpoint and show headers.', category: 'Network' },
    { cmd: 'firewall-cmd --list-all', desc: 'Show the active firewalld zone and rules.', category: 'Network' },
    { cmd: 'sudo firewall-cmd --permanent --add-service=http', desc: 'Persistently allow HTTP in the active zone.', category: 'Network' },
    { cmd: 'sudo firewall-cmd --reload', desc: 'Apply persistent firewalld changes.', category: 'Network' }
  ],
  lab: {
    title: 'Read the network from the inside out',
    scenario: 'A web service is unreachable from another host. Gather evidence layer by layer before changing anything.',
    minutes: 18,
    steps: [
      { text: 'Record interfaces, addresses, and default route.', cmd: 'ip -br addr && ip route', verify: 'Identify the interface with the default gateway.' },
      { text: 'Inspect NetworkManager device and connection state.', cmd: 'nmcli device status && nmcli -f NAME,DEVICE,STATE connection show' },
      { text: 'Check whether a web server is listening and on which address.', cmd: 'sudo ss -tlnp | grep -E ":(80|443)\\b"' },
      { text: 'Test DNS resolution through the system resolver.', cmd: 'getent hosts localhost' },
      { text: 'Inspect the firewall zone and list allowed services.', cmd: 'sudo firewall-cmd --get-active-zones && sudo firewall-cmd --list-all', verify: 'If http is missing, that is a candidate cause — but confirm the listener first.' }
    ]
  },
  quiz: [
    {
      q: 'Which command shows listening TCP sockets with processes?',
      options: ['ip route', 'ss -tlnp', 'nmcli device status', 'getent hosts'],
      answer: 1,
      why: 'ss -tlnp filters TCP, listening, numeric, with process information. ip route shows the routing table.'
    },
    {
      q: 'A service is listening only on 127.0.0.1:8080. Can a remote host connect?',
      options: ['Yes, loopback is public', 'No, loopback is local to the host', 'Only over IPv6', 'Only if firewalld is disabled'],
      answer: 1,
      why: '127.0.0.1 is the loopback address. A remote client cannot reach a socket bound only there.'
    },
    {
      q: 'What happens if you add a firewalld rule without --permanent?',
      options: ['It is rejected', 'It applies at runtime but may disappear on reload or reboot', 'It permanently blocks all traffic', 'It restarts the network'],
      answer: 1,
      why: 'Runtime changes are temporary. Use --permanent and reload to keep the rule.'
    }
  ]
};