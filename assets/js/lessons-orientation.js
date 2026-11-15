/* Module 01 — Orientation */

RHEL.lessons.orientation = {
  id: 'orientation',
  module: 'm01',
  title: 'Meet RHEL',
  subtitle: 'What enterprise Linux actually is, how to get a safe lab, and the map for everything that follows.',
  minutes: 18,
  difficulty: 'Starter',
  tags: ['RHEL', 'Linux', 'lifecycle', 'lab'],
  objectives: [
    'Explain the relationship between Linux, a distribution, and RHEL',
    'Identify a RHEL release from the system itself',
    'Describe why RHEL is built and supported differently from a hobby distro',
    'Choose a safe practice environment and take a snapshot',
    'See how this level maps to real administration work and RHCSA objectives'
  ],
  sections: [
    {
      title: 'Linux is a stack, not a single product',
      body: `
        <p>Linux is a <strong>kernel</strong>: the part of the system that talks to hardware, schedules processes, manages memory, and enforces isolation. The kernel on its own is not something you sit down and administer. It needs a userland — shells, libraries, package tools, services, configuration files — stacked on top.</p>
        <p>A <strong>distribution</strong> is a curated bundle of that kernel and userland, with opinions about how it should be installed, updated, secured, and supported. <strong>Red Hat Enterprise Linux</strong> is a distribution built for organizations that need a predictable platform: long support windows, certified hardware and software, stable interfaces, and a vendor to call when something breaks at 02:00.</p>
        <p>You will hear three layers named constantly:</p>
        <ul>
          <li><strong>Kernel</strong> — hardware, processes, memory, filesystems, networking primitives.</li>
          <li><strong>Userland</strong> — the programs and libraries you actually invoke: <code>bash</code>, <code>systemd</code>, <code>dnf</code>, <code>sshd</code>, <code>firewalld</code>.</li>
          <li><strong>Distribution</strong> — the policy that binds them: release cadence, defaults, security posture, package repositories, support lifecycle.</li>
        </ul>
        <p>An administrator works mostly in the second and third layers. The kernel matters when it leaks, panics, or refuses to see a disk — and then you will be very glad it is documented.</p>
      `
    },
    {
      title: 'What makes RHEL different',
      body: `
        <p>RHEL is deliberately conservative. Features arrive later than in Fedora, but they arrive with a lifecycle, a support statement, and a migration path. That trade is the entire point.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Concern</th><th>What RHEL optimizes for</th></tr></thead>
            <tbody>
              <tr><td>Stability</td><td>Stable major-version interfaces. Security fixes are backported instead of forcing a disruptive upgrade.</td></tr>
              <tr><td>Lifecycle</td><td>A published support window measured in years, with defined maintenance and extended-life phases.</td></tr>
              <tr><td>Ecosystem</td><td>Certified hardware, ISV applications, cloud images, and a partner catalog.</td></tr>
              <tr><td>Security</td><td>SELinux enforcing by default, signed packages, crypto policies, and a compliance story.</td></tr>
              <tr><td>Operations</td><td>Predictable defaults, automation-friendly tooling, and enterprise support channels.</td></tr>
            </tbody>
          </table>
        </div>
        <p>RHEL is not "the only Linux." Fedora is its fast-moving upstream community project. <strong>CentOS Stream</strong> is the rolling preview that sits directly upstream of the next RHEL minor release. Rebuilds such as Rocky Linux and AlmaLinux track RHEL source and are excellent for practice, but they are not identical products and do not include Red Hat support.</p>
        <div class="callout note">
          <div class="callout-title">Read the release, not the meme</div>
          <p>Commands differ subtly across versions. RHEL 9 and RHEL 10 both use systemd, SELinux, and the same administration model, but RHEL 10 moves to DNF5, newer container tooling, and a different default crypto posture. In this fieldbook, commands are written to work on both unless a version difference is called out.</p>
        </div>
      `
    },
    {
      title: 'Meet the machine in front of you',
      body: `
        <p>Before changing anything, establish the facts. Three files and one command tell you most of what you need to know about the platform.</p>
        <div class="code-label"><span>terminal · identify the release</span></div>
        <pre><code>cat /etc/redhat-release
cat /etc/os-release
uname -r
hostnamectl</code></pre>
        <p><code>/etc/redhat-release</code> is the short human-readable release string. <code>/etc/os-release</code> is the structured, script-friendly version used by tools across distributions. <code>uname -r</code> gives the running kernel; <code>hostnamectl</code> connects the hostname, operating system, kernel, architecture, and virtualization context in one view.</p>
        <p>You will also use <code>dnf</code> constantly. Check which generation you have before relying on a manual page from the internet:</p>
        <div class="code-label"><span>terminal · package manager generation</span></div>
        <pre><code>dnf --version</code></pre>
        <p>On RHEL 9 this reports DNF 4; on RHEL 10 it reports DNF5. Most everyday subcommands — <code>install</code>, <code>remove</code>, <code>search</code>, <code>info</code>, <code>repoquery</code> — remain familiar, but output and some flags are not identical.</p>
        <div class="callout tip">
          <div class="callout-title">A useful habit</div>
          <p>Write down the release, kernel, and architecture before you open a support case. "It's broken" becomes actionable when you can say exactly which system is broken.</p>
        </div>
      `
    },
    {
      title: 'Build a lab you are allowed to break',
      body: `
        <p>You need a disposable RHEL-family system. <strong>Never practice destructive commands on a production host.</strong> A lab is not a luxury; it is part of the method.</p>
        <ul>
          <li><strong>Red Hat Developer subscription</strong> — the official low-cost route for individuals. It provides RHEL entitlements and is ideal if you want the real product.</li>
          <li><strong>Cloud instance</strong> — fast to create and easy to destroy. Use a private security group and stop the instance when you are done.</li>
          <li><strong>Local virtual machine</strong> — KVM, VirtualBox, or another hypervisor. Take a snapshot before every lab. Snapshots are your undo button.</li>
          <li><strong>RHEL-compatible rebuild</strong> — Rocky Linux or AlmaLinux when you want a no-cost practice environment. The administration model is nearly identical, but verify vendor-specific tasks against RHEL documentation.</li>
        </ul>
        <p>Minimum comfortable lab: 2 vCPUs, 2–4 GB RAM, 20 GB disk, one network interface, and a snapshot called <code>clean-install</code>. If you are on a laptop, that is enough. You do not need a data center to learn the fundamentals.</p>
        <div class="callout warn">
          <div class="callout-title">Snapshot before you sudo</div>
          <p>Networking, boot, storage, and SELinux labs can make a machine unreachable. A snapshot turns a failed experiment into a two-minute reset instead of a rebuild.</p>
        </div>
      `
    },
    {
      title: 'How this fieldbook works',
      body: `
        <p>Every lesson follows the same rhythm: a small number of <strong>objectives</strong>, a plain-language explanation, a <strong>command deck</strong> you can copy, a <strong>lab</strong> with verification steps, and a short <strong>checkpoint</strong>. Completing a lesson is a deliberate act — mark it when you can do the work without following along.</p>
        <p>The terminal sandbox in the bottom-right corner is simulated and read-only. It is a place to build muscle memory and inspect example output, not a substitute for a real VM. When a lab asks you to change something, do it in your own lab system.</p>
        <p>Level 01 is the daily-driver layer. Later levels add storage engineering, containers, SELinux depth, Ansible, high availability, and production design. You do not have to finish every command in a lesson before moving on. You do have to be able to explain <em>why</em> the command works.</p>
      `
    }
  ],
  commands: [
    { cmd: 'cat /etc/redhat-release', desc: 'Show the short RHEL release string.', category: 'Orientation' },
    { cmd: 'cat /etc/os-release', desc: 'Show structured operating system identity.', category: 'Orientation' },
    { cmd: 'uname -r', desc: 'Print the running kernel release.', category: 'Orientation' },
    { cmd: 'hostnamectl', desc: 'Show hostname, OS, kernel, architecture, and virtualization.', category: 'Orientation' },
    { cmd: 'dnf --version', desc: 'Identify the DNF generation in use.', category: 'Packages' }
  ],
  lab: {
    title: 'Identify and snapshot your lab',
    scenario: 'Establish a baseline before you change anything. In a real incident, these are the first facts you collect.',
    minutes: 12,
    steps: [
      { text: 'Boot your RHEL lab VM or connect to your cloud instance. Confirm you are on the intended host.', cmd: 'hostnamectl', verify: 'Verify the hostname, operating system, and kernel are what you expect.' },
      { text: 'Read the short and structured release files. Note the major version.', cmd: 'cat /etc/redhat-release && cat /etc/os-release' },
      { text: 'Check the kernel and CPU architecture.', cmd: 'uname -r && uname -m' },
      { text: 'Confirm the package manager generation.', cmd: 'dnf --version' },
      { text: 'Take a hypervisor or cloud snapshot named clean-install. If you cannot snapshot, record how you would rebuild the machine.', verify: 'You should be able to return to this exact state after a failed lab.' }
    ]
  },
  quiz: [
    {
      q: 'Which file gives the short, human-readable RHEL release string?',
      options: ['/etc/os-release', '/etc/redhat-release', '/etc/kernel-release', '/var/log/redhat'],
      answer: 1,
      why: '/etc/redhat-release is the traditional short string. /etc/os-release is the structured, cross-distribution file.'
    },
    {
      q: 'What is the main reason an organization chooses RHEL over a fast-moving hobby distribution?',
      options: ['It has no package manager', 'It never receives updates', 'It offers a predictable, supported lifecycle and certified ecosystem', 'It disables the kernel'],
      answer: 2,
      why: 'RHEL trades speed for stability, support, certification, and a defined lifecycle — not for immutability.'
    },
    {
      q: 'What should you do before a networking or boot lab?',
      options: ['Disable SELinux first', 'Take a snapshot of the clean system', 'Delete /var/log', 'Switch to the root account permanently'],
      answer: 1,
      why: 'A snapshot is the fastest reliable undo. Disabling security controls first teaches the wrong habit.'
    }
  ]
};

RHEL.lessons.shell = {
  id: 'shell',
  module: 'm01',
  title: 'The shell, decoded',
  subtitle: 'Read the prompt, speak the grammar, and make the command line feel less like a password.',
  minutes: 22,
  difficulty: 'Starter',
  tags: ['bash', 'shell', 'ssh', 'prompt'],
  objectives: [
    'Read a shell prompt and know which user and directory you are in',
    'Break a command into its command name, options, and arguments',
    'Use tab completion, history, and keyboard shortcuts to work faster',
    'Connect to a remote RHEL host with SSH',
    'Recognize the difference between a regular user and root'
  ],
  sections: [
    {
      title: 'The prompt is a status line',
      body: `
        <p>A typical RHEL prompt looks like this:</p>
        <div class="code-label"><span>prompt</span></div>
        <pre><code>[student@rhel-lab ~]$</code></pre>
        <p>Read it left to right. <code>student</code> is the current user. <code>rhel-lab</code> is the hostname. <code>~</code> is the current working directory, and <code>~</code> is shorthand for the user's home directory. The final character is the privilege signal: <code>$</code> means a regular user; <code>#</code> means root.</p>
        <p>The prompt is configured in the shell's startup files, usually <code>~/.bashrc</code> and <code>/etc/bashrc</code>. You can change its appearance, but first learn to read it. A surprising number of "permission denied" moments are really "I thought I was root and I was not."</p>
        <div class="callout warn">
          <div class="callout-title">Root changes everything</div>
          <p>When the prompt ends in <code>#</code>, there is no safety net on commands like <code>rm</code>, <code>dd</code>, or <code>chmod</code>. Use <code>sudo</code> for one command at a time instead of living in a root shell.</p>
        </div>
      `
    },
    {
      title: 'Command grammar: verb, flags, objects',
      body: `
        <p>Most commands follow a simple grammar: <code>command [options] [arguments]</code>.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Part</th><th>Example</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td>Command</td><td><code>ls</code></td><td>The program to run. Case-sensitive.</td></tr>
              <tr><td>Short option</td><td><code>-l</code></td><td>One behavior switch. Short flags can often be combined: <code>-lah</code>.</td></tr>
              <tr><td>Long option</td><td><code>--human-readable</code></td><td>A readable version of the same idea. Usually self-documenting.</td></tr>
              <tr><td>Argument</td><td><code>/var/log</code></td><td>The object to act on: a path, a user, a package, a service.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Whitespace separates the parts. That means <code>ls -l /var/log</code> is three tokens, while <code>ls -l/var/log</code> is not what you meant. Quote arguments that contain spaces: <code>mkdir "incident notes"</code>.</p>
        <p>Some commands are <strong>shell builtins</strong> — they run inside Bash rather than as separate programs. <code>cd</code>, <code>pwd</code>, <code>echo</code>, and <code>type</code> are common examples. <code>type cd</code> will tell you that <code>cd</code> is a shell builtin; <code>type ls</code> usually reveals an alias or an external binary.</p>
        <p>Exit status is the quiet language of the shell. A command returns <code>0</code> for success and a non-zero value for failure. The special variable <code>$?</code> holds the last result:</p>
        <div class="code-label"><span>terminal · exit status</span></div>
        <pre><code>ls /etc &gt;/dev/null
echo $?</code></pre>
        <p>This matters immediately: shell scripts and automation make decisions by checking exit status, not by reading English output.</p>
      `
    },
    {
      title: 'The shortcuts that buy back hours',
      body: `
        <p>Typing is not the skill. Navigation is. These are the shortcuts worth making automatic:</p>
        <ul>
          <li><strong>Tab</strong> — complete a command, path, or argument. Press twice to list possibilities. Use it constantly.</li>
          <li><strong>↑ / ↓</strong> — walk through command history.</li>
          <li><strong>Ctrl+R</strong> — reverse-search history. Type a fragment of an old command.</li>
          <li><strong>Ctrl+A / Ctrl+E</strong> — jump to the beginning or end of the line.</li>
          <li><strong>Ctrl+U / Ctrl+K</strong> — delete left or right of the cursor.</li>
          <li><strong>Ctrl+C</strong> — interrupt the foreground process. This is not "close the terminal"; it sends SIGINT.</li>
          <li><strong>Ctrl+L</strong> — clear the screen while keeping your command line.</li>
        </ul>
        <p><code>history</code> shows numbered commands. <code>!!</code> re-runs the last command, and <code>sudo !!</code> is the classic "I forgot sudo" recovery. Be careful with history expansion: confirm what <code>!!</code> will run before pressing Enter, especially after a destructive command.</p>
        <p>Use <code>clear</code> when output is noisy, but do not confuse a clean screen with a fresh shell. The scrollback is still there, and your environment has not changed.</p>
      `
    },
    {
      title: 'First contact: the commands you will use daily',
      body: `
        <p>These commands are the equivalent of checking your pockets. They answer: who am I, where am I, and what is this machine doing?</p>
        <div class="code-label"><span>terminal · first contact</span></div>
        <pre><code>whoami
hostname
pwd
date
uptime
echo "hello, RHEL"</code></pre>
        <p><code>whoami</code> prints the effective user. <code>hostname</code> prints the host's name; on modern RHEL, <code>hostnamectl</code> gives richer context. <code>pwd</code> prints the current working directory. <code>uptime</code> shows how long the system has been running, how many users are logged in, and load averages over 1, 5, and 15 minutes.</p>
        <p><code>echo</code> looks trivial, and then you use it to test quoting, variables, and redirection for the rest of your career. Try the difference:</p>
        <div class="code-label"><span>terminal · quoting matters</span></div>
        <pre><code>echo $HOME
echo "$HOME"
echo '$HOME'</code></pre>
        <p>Double quotes expand variables; single quotes preserve the literal text. This distinction becomes critical in scripts, where a space or a dollar sign can change the meaning of a command.</p>
      `
    },
    {
      title: 'Remote access with SSH',
      body: `
        <p>Most RHEL systems you administer will not have a monitor. You will reach them over <strong>SSH</strong> (Secure Shell), usually on TCP port 22.</p>
        <div class="code-label"><span>terminal · connect to a host</span></div>
        <pre><code>ssh student@server.example.com</code></pre>
        <p>The first connection asks you to verify the server's host key fingerprint. In a managed environment, compare it with the value published by your team. Accepting an unknown key blindly is a security decision, not a formality.</p>
        <p>Once connected, your local keyboard drives a shell on the remote machine. Everything you type runs there, not on your laptop. <code>exit</code> or <code>logout</code> ends the session. If a session freezes, press Enter, then <code>~.</code> (tilde followed by a period) at the start of a line to terminate the SSH client.</p>
        <div class="callout tip">
          <div class="callout-title">Know where you are</div>
          <p>Before running a destructive command over SSH, run <code>hostname</code> and <code>pwd</code>. Muscle memory from one host becomes a production incident on another.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'whoami', desc: 'Print the effective username.', category: 'Shell' },
    { cmd: 'hostnamectl', desc: 'Show hostname and operating system details.', category: 'Shell' },
    { cmd: 'pwd', desc: 'Print the current working directory.', category: 'Filesystem' },
    { cmd: 'uptime', desc: 'Show uptime, logged-in users, and load averages.', category: 'Processes' },
    { cmd: 'echo "$HOME"', desc: 'Print a value with variable expansion.', category: 'Shell' },
    { cmd: 'type ls', desc: 'Show how the shell resolves a command.', category: 'Shell' },
    { cmd: 'ssh student@server', desc: 'Open a remote shell over SSH.', category: 'Network' },
    { cmd: 'history', desc: 'List recent commands with numbers.', category: 'Shell' },
    { cmd: 'exit', desc: 'Leave the current shell or SSH session.', category: 'Shell' }
  ],
  lab: {
    title: 'Your first five minutes',
    scenario: 'Practice reading context before acting. You will repeat this exact check every time you land on a new system.',
    minutes: 10,
    steps: [
      { text: 'Run the identity check and confirm the prompt matches reality.', cmd: 'whoami && hostname && pwd', verify: 'The username and hostname should match the prompt; pwd should be your home directory.' },
      { text: 'Inspect system uptime and load averages.', cmd: 'uptime', verify: 'The load averages are three numbers: 1, 5, and 15 minutes.' },
      { text: 'Print your home directory using both single and double quotes. Compare the output.', cmd: 'echo "$HOME" && echo \'$HOME\'' },
      { text: 'Find out whether cd is a shell builtin or an external binary.', cmd: 'type cd', verify: 'It should report that cd is a shell builtin.' },
      { text: 'Inspect your last commands and re-run one using history expansion.', cmd: 'history | tail -n 5' }
    ]
  },
  quiz: [
    {
      q: 'What does a prompt ending in # tell you?',
      options: ['The shell is in a container', 'The effective user is root', 'The last command failed', 'The host is offline'],
      answer: 1,
      why: 'A # prompt conventionally indicates root. A $ prompt indicates a regular user.'
    },
    {
      q: 'Which command shows the current directory?',
      options: ['cd', 'pwd', 'ls -a', 'whoami'],
      answer: 1,
      why: 'pwd stands for print working directory. cd changes it; ls lists its contents.'
    },
    {
      q: 'What is the safest way to run one command as root?',
      options: ['Log in as root permanently', 'Disable the password', 'Use sudo for that command', 'Add your user to every group'],
      answer: 2,
      why: 'sudo grants privilege for one command and leaves an audit trail. A permanent root shell removes friction and safety at the same time.'
    }
  ]
};

RHEL.lessons.help = {
  id: 'help',
  module: 'm01',
  title: 'Ask the system',
  subtitle: 'Manual pages, built-in help, and the search skills that replace guessing.',
  minutes: 20,
  difficulty: 'Starter',
  tags: ['man', 'documentation', 'rpm', 'troubleshooting'],
  objectives: [
    'Navigate a man page and interpret its synopsis',
    'Choose the right manual section for a command or file format',
    'Search manual pages by keyword',
    'Find the package that owns a command',
    'Read local documentation when the network is unavailable'
  ],
  sections: [
    {
      title: 'The manual is part of the system',
      body: `
        <p>RHEL ships with its own documentation, and it works when the network does not. The primary tool is <code>man</code>. Manual pages are divided into numbered sections, and the number matters:</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Section</th><th>Contents</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>User commands</td><td><code>man 1 passwd</code></td></tr>
              <tr><td>5</td><td>File formats and configuration</td><td><code>man 5 passwd</code></td></tr>
              <tr><td>8</td><td>System administration commands</td><td><code>man 8 useradd</code></td></tr>
            </tbody>
          </table>
        </div>
        <p><code>man passwd</code> gives you the command. <code>man 5 passwd</code> gives you the file format. On a system with both, the command page usually wins by default — so specify the section when you need the file layout.</p>
        <p>Inside a manual page, use <code>Space</code> to page down, <code>b</code> to go back, <code>/pattern</code> to search forward, <code>n</code> for the next match, and <code>q</code> to quit. The pager is usually <code>less</code>; the commands are coming in the next lesson.</p>
      `
    },
    {
      title: 'Anatomy of a useful man page',
      body: `
        <p>Most pages share a structure. You do not need to read every line; you need to know where the answer lives.</p>
        <ul>
          <li><strong>NAME</strong> — the command and a one-line purpose. Start here.</li>
          <li><strong>SYNOPSIS</strong> — the grammar. Brackets mean optional, ellipses mean repeatable, and a vertical bar means "or".</li>
          <li><strong>DESCRIPTION</strong> — what it does and how it thinks.</li>
          <li><strong>OPTIONS</strong> — flags, often the longest section. Search it with <code>/</code>.</li>
          <li><strong>FILES</strong> — configuration files that affect behavior.</li>
          <li><strong>EXAMPLES</strong> — the fastest way to understand intent, though not every page has one.</li>
          <li><strong>SEE ALSO</strong> — related pages and the next rabbit hole.</li>
        </ul>
        <p>Consider this synopsis shape: <code>cp [OPTION]... SOURCE... DEST</code>. The command is <code>cp</code>, options are optional but repeatable, one or more sources are required, and a destination is required. That single line tells you <code>cp file1 file2 dir/</code> is valid.</p>
        <div class="callout tip">
          <div class="callout-title">Search before you scroll</div>
          <p>Inside <code>man</code>, type <code>/-p</code> to jump to the option you need. This is much faster than reading 400 lines of flags.</p>
        </div>
      `
    },
    {
      title: 'Fast answers: built-in help and local docs',
      body: `
        <p>Not every question deserves a full manual page. Many commands support a compact help flag:</p>
        <div class="code-label"><span>terminal · quick help</span></div>
        <pre><code>ls --help
dnf --help
systemctl --help</code></pre>
        <p>Shell builtins are documented by the shell itself. <code>help cd</code> reads the Bash builtin documentation; <code>man cd</code> may not exist because <code>cd</code> is not an external program. <code>info</code> provides a hyperlinked manual for some GNU tools, though <code>man</code> remains the default habit on RHEL.</p>
        <p>Packages also install documentation under <code>/usr/share/doc</code>. Look for README files, example configurations, and upstream release notes:</p>
        <div class="code-label"><span>terminal · local documentation</span></div>
        <pre><code>ls /usr/share/doc
ls /usr/share/doc/httpd</code></pre>
        <p>When a vendor says "see the documentation," this is often where the useful sample lives — especially for services with complex configuration.</p>
      `
    },
    {
      title: 'Find the right page and the owning package',
      body: `
        <p>You know what you want to do, but not which command does it. Search the manual index:</p>
        <div class="code-label"><span>terminal · search the manual</span></div>
        <pre><code>man -k password
apropos password
whatis passwd</code></pre>
        <p><code>man -k</code> and <code>apropos</code> search short descriptions and print matching pages. <code>whatis</code> prints the one-line description for a specific page. If the index is missing, rebuild it with <code>sudo mandb</code>.</p>
        <p>When a command exists but you do not know where it came from, ask the package manager or RPM database:</p>
        <div class="code-label"><span>terminal · trace a command to its package</span></div>
        <pre><code>command -v sshd
rpm -qf "$(command -v sshd)"
dnf provides '*/sshd'</code></pre>
        <p><code>command -v</code> prints the path the shell would execute. <code>rpm -qf</code> asks which installed package owns that file. <code>dnf provides</code> finds available packages that supply a file or capability — useful when the command is not installed yet.</p>
        <div class="callout note">
          <div class="callout-title">Aliases are not binaries</div>
          <p>If <code>command -v</code> prints something like <code>alias ls='ls --color=auto'</code>, the command is being intercepted by your shell. Use <code>type -a ls</code> to see all resolutions, including the real executable.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'man ls', desc: 'Open the manual page for the ls command.', category: 'Help' },
    { cmd: 'man 5 passwd', desc: 'Read the passwd file format, not the command.', category: 'Help' },
    { cmd: 'man -k password', desc: 'Search manual page descriptions by keyword.', category: 'Help' },
    { cmd: 'whatis passwd', desc: 'Show the one-line description of a manual page.', category: 'Help' },
    { cmd: 'ls --help', desc: 'Print a compact usage summary.', category: 'Help' },
    { cmd: 'help cd', desc: 'Read Bash builtin documentation.', category: 'Help' },
    { cmd: 'rpm -qf /usr/sbin/sshd', desc: 'Find which package owns a file.', category: 'Packages' },
    { cmd: 'dnf provides */sshd', desc: 'Find a package that supplies a file or command.', category: 'Packages' }
  ],
  lab: {
    title: 'Answer three questions without a browser',
    scenario: 'Use only the terminal. The goal is not to memorize flags; it is to build the reflex to look them up.',
    minutes: 12,
    steps: [
      { text: 'Read the synopsis of cp and find the option that preserves timestamps and mode.', cmd: 'man cp', verify: 'Look for -p, --preserve. The synopsis should make sense now.' },
      { text: 'Read the fstab file-format page and find the sixth field.', cmd: 'man 5 fstab', verify: 'The sixth field controls fsck pass order; root is usually 1, others 2 or 0.' },
      { text: 'Search manual descriptions for the word "quota".', cmd: 'man -k quota', verify: 'You should see several administration and file-format pages.' },
      { text: 'Find out which installed package owns sshd.', cmd: 'command -v sshd && rpm -qf "$(command -v sshd)"' },
      { text: 'Locate the local documentation directory for a package you have installed.', cmd: 'ls /usr/share/doc | head' }
    ]
  },
  quiz: [
    {
      q: 'Which command reads the file format of /etc/passwd rather than the passwd command?',
      options: ['man passwd', 'man 5 passwd', 'passwd --help', 'cat --manual passwd'],
      answer: 1,
      why: 'Section 5 contains file formats. man 5 passwd describes the colon-separated passwd file.'
    },
    {
      q: 'What does man -k do?',
      options: ['Deletes a manual page', 'Searches manual page descriptions by keyword', 'Lists installed kernels', 'Opens the last manual page'],
      answer: 1,
      why: 'man -k (apropos) searches the whatis index by keyword. The index must exist for results to appear.'
    },
    {
      q: 'How do you find the installed package that owns /usr/bin/ls?',
      options: ['dnf remove /usr/bin/ls', 'rpm -qf /usr/bin/ls', 'chmod +x /usr/bin/ls', 'systemctl status /usr/bin/ls'],
      answer: 1,
      why: 'rpm -qf queries the RPM database for the owning package. dnf provides is for packages that are available but not necessarily installed.'
    }
  ]
};

RHEL.lessons.filesystem = {
  id: 'filesystem',
  module: 'm01',
  title: 'One tree, every path',
  subtitle: 'Learn the filesystem hierarchy, move with intent, and know which directories matter.',
  minutes: 24,
  difficulty: 'Starter',
  tags: ['filesystem', 'FHS', 'paths', 'mounts'],
  objectives: [
    'Explain the single-root filesystem model',
    'Use absolute and relative paths correctly',
    'Navigate with pwd, cd, and directory shortcuts',
    'Identify the purpose of the major RHEL directories',
    'Connect directories to mounted filesystems'
  ],
  sections: [
    {
      title: 'Everything starts at /',
      body: `
        <p>RHEL uses a <strong>single-rooted filesystem</strong>. There are no drive letters. Every file and directory lives somewhere beneath <code>/</code>, including removable media and network shares, which are attached to a directory called a <strong>mount point</strong>.</p>
        <p>The shell is always sitting in a <strong>current working directory</strong>. <code>pwd</code> prints it. <code>cd</code> changes it. <code>ls</code> lists what is there. These three commands are the floor plan of everything else.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Path</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>/</code></td><td>The root of the entire tree.</td></tr>
              <tr><td><code>.</code></td><td>The current directory.</td></tr>
              <tr><td><code>..</code></td><td>The parent directory.</td></tr>
              <tr><td><code>~</code></td><td>The current user's home directory.</td></tr>
              <tr><td><code>~student</code></td><td>The home directory of user student.</td></tr>
              <tr><td><code>-</code></td><td>The previous working directory, for <code>cd -</code>.</td></tr>
            </tbody>
          </table>
        </div>
        <p>An <strong>absolute path</strong> starts with <code>/</code> and means the same thing from anywhere: <code>/var/log/messages</code>. A <strong>relative path</strong> is interpreted from where you are now: <code>logs/messages</code> only works if you are already in <code>/var</code>. When a script must be unambiguous, prefer absolute paths and quote them.</p>
      `
    },
    {
      title: 'The landmarks that matter',
      body: `
        <p>The Filesystem Hierarchy Standard (FHS) is the shared map. You do not need to memorize every directory, but you do need to know where configuration, state, and user data belong.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Directory</th><th>What lives there</th><th>Why you care</th></tr></thead>
            <tbody>
              <tr><td><code>/etc</code></td><td>Host-specific configuration</td><td>Most service configuration and identity files.</td></tr>
              <tr><td><code>/var</code></td><td>Variable data: logs, spool, caches, databases</td><td>The first place to check when a disk fills.</td></tr>
              <tr><td><code>/home</code></td><td>Regular user home directories</td><td>User data and personal shell configuration.</td></tr>
              <tr><td><code>/root</code></td><td>Root's home directory</td><td>Not the same as <code>/</code>.</td></tr>
              <tr><td><code>/usr</code></td><td>Installed software, libraries, documentation</td><td>Read-only operating system content.</td></tr>
              <tr><td><code>/opt</code></td><td>Optional third-party application trees</td><td>Vendor software that brings its own layout.</td></tr>
              <tr><td><code>/tmp</code></td><td>Temporary files</td><td>Often cleared on reboot; never store important data.</td></tr>
              <tr><td><code>/boot</code></td><td>Kernel and bootloader files</td><td>Critical to boot; treat with respect.</td></tr>
              <tr><td><code>/dev</code></td><td>Device nodes</td><td>Disks, terminals, and pseudo-devices.</td></tr>
              <tr><td><code>/proc</code>, <code>/sys</code></td><td>Kernel and hardware interfaces</td><td>Live, virtual views — not ordinary files.</td></tr>
              <tr><td><code>/mnt</code>, <code>/media</code></td><td>Temporary and removable mount points</td><td>Conventional places to attach filesystems.</td></tr>
              <tr><td><code>/srv</code></td><td>Data served by the system</td><td>Optional but conventional for service content.</td></tr>
            </tbody>
          </table>
        </div>
        <p>On modern RHEL, <code>/bin</code>, <code>/sbin</code>, and <code>/lib</code> are symbolic links into <code>/usr</code>. This is the <strong>usrmerge</strong> layout. It is why <code>/bin/bash</code> and <code>/usr/bin/bash</code> resolve to the same program.</p>
      `
    },
    {
      title: 'Directories are mount points too',
      body: `
        <p>A directory is not necessarily part of the root filesystem. It can be the attachment point for a separate disk, an LVM volume, a network share, or a virtual filesystem. Ask the system what is mounted where:</p>
        <div class="code-label"><span>terminal · see the mount landscape</span></div>
        <pre><code>findmnt /
df -hT
lsblk -f</code></pre>
        <p><code>findmnt</code> shows the mount tree. <code>df -hT</code> shows capacity and filesystem type in human units. <code>lsblk -f</code> shows block devices, their filesystems, labels, UUIDs, and mount points. Learning to read these three together is a core administration skill.</p>
        <p>This is also how you diagnose "the disk is full" correctly. A full <code>/var</code> does not mean the root filesystem is full — it may be a separate volume. <code>df</code> reports filesystem-level usage; <code>du</code> reports the size of directories. You need both to find the culprit.</p>
        <div class="callout warn">
          <div class="callout-title">Do not delete from /var blindly</div>
          <p>Logs, package caches, and application data live under <code>/var</code>. Deleting the wrong thing can break services or destroy evidence. Identify the owner and the retention policy first.</p>
        </div>
      `
    },
    {
      title: 'Listing with intention',
      body: `
        <p><code>ls</code> is simple until you need to see hidden files, permissions, or sort order. The useful combinations:</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Command</th><th>What it shows</th></tr></thead>
            <tbody>
              <tr><td><code>ls -l</code></td><td>Long format: type, permissions, links, owner, group, size, timestamp, name.</td></tr>
              <tr><td><code>ls -a</code></td><td>Include dotfiles such as <code>.bashrc</code> and <code>.ssh</code>.</td></tr>
              <tr><td><code>ls -lh</code></td><td>Human-readable sizes.</td></tr>
              <tr><td><code>ls -lt</code></td><td>Newest first — excellent for "what just changed?"</td></tr>
              <tr><td><code>ls -ltr</code></td><td>Oldest first, with the newest at the bottom.</td></tr>
              <tr><td><code>ls -ld /var/log</code></td><td>Information about the directory itself, not its contents.</td></tr>
            </tbody>
          </table>
        </div>
        <p>The <code>-d</code> flag catches people constantly. <code>ls -l /var/log</code> lists the contents of the directory. <code>ls -ld /var/log</code> lists the directory entry itself, which is what you need when checking ownership or permissions on the directory.</p>
        <p>Wildcards are expanded by the shell before the command runs. <code>ls /etc/*.conf</code> becomes a list of matching paths. If nothing matches, the literal pattern may be passed through, which is why careful scripts test with <code>compgen</code> or <code>find</code> instead of assuming a glob matched.</p>
      `
    }
  ],
  commands: [
    { cmd: 'pwd', desc: 'Print the current working directory.', category: 'Filesystem' },
    { cmd: 'cd /var/log', desc: 'Change to an absolute directory path.', category: 'Filesystem' },
    { cmd: 'cd -', desc: 'Return to the previous directory.', category: 'Filesystem' },
    { cmd: 'ls -lah', desc: 'List all files, long format, human-readable sizes.', category: 'Filesystem' },
    { cmd: 'ls -ld /var/log', desc: 'Inspect a directory entry itself.', category: 'Filesystem' },
    { cmd: 'findmnt /', desc: 'Show the filesystem mounted at /.', category: 'Storage' },
    { cmd: 'df -hT', desc: 'Show filesystem type, size, and usage.', category: 'Storage' },
    { cmd: 'lsblk -f', desc: 'Show block devices, filesystems, UUIDs, and mounts.', category: 'Storage' }
  ],
  lab: {
    title: 'Map an unfamiliar system',
    scenario: 'You have landed on a host you did not build. Build a mental map before changing anything.',
    minutes: 14,
    steps: [
      { text: 'Start at the root and list the top-level directories.', cmd: 'cd / && ls -l', verify: 'You should see etc, var, home, usr, boot, and the virtual directories.' },
      { text: 'Identify the filesystem backing / and its usage.', cmd: 'findmnt / && df -hT /', verify: 'The device and filesystem type should match between the two commands.' },
      { text: 'Inspect /var/log as a directory entry, then list its contents.', cmd: 'ls -ld /var/log && ls -lh /var/log | head', verify: 'The first command describes the directory; the second describes its files.' },
      { text: 'Find the ten largest entries directly under /var.', cmd: 'du -sh /var/* 2>/dev/null | sort -rh | head', verify: 'du can take time on a busy host; note which directory is largest.' },
      { text: 'Return to your home directory and confirm where you are.', cmd: 'cd ~ && pwd' }
    ]
  },
  quiz: [
    {
      q: 'What is the difference between /var/log and /var/log/messages?',
      options: ['One is a directory, one is a file', 'Both are files', 'Both are mount points', 'There is no difference'],
      answer: 0,
      why: '/var/log is a directory containing log files; /var/log/messages is a file within it on traditional RHEL configurations.'
    },
    {
      q: 'Which command reports filesystem capacity and type?',
      options: ['du -sh', 'df -hT', 'ls -ltr', 'free -h'],
      answer: 1,
      why: 'df reports filesystem-level capacity. du reports directory consumption; free reports memory.'
    },
    {
      q: 'Why does cd - work?',
      options: ['It opens the root directory', 'It returns to the previous working directory', 'It deletes the current directory', 'It starts a new shell'],
      answer: 1,
      why: 'The shell remembers the previous directory; cd - switches back to it.'
    }
  ]
};
