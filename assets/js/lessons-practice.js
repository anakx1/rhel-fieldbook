/* Module 04 — Operations */

RHEL.lessons.storage = {
  id: 'storage',
  module: 'm04',
  title: 'Storage, without guessing',
  subtitle: 'Block devices, filesystems, mounts, and the difference between full and truly full.',
  minutes: 29,
  difficulty: 'Core',
  tags: ['storage', 'lsblk', 'mount', 'fstab', 'LVM', 'XFS'],
  objectives: [
    'Read the block-device and filesystem landscape',
    'Mount and unmount a filesystem safely',
    'Persist a mount with /etc/fstab using a UUID',
    'Diagnose capacity and inode exhaustion',
    'Recognize the LVM layer and extend a logical volume'
  ],
  sections: [
    {
      title: 'Devices, filesystems, mounts',
      body: `
        <p>Storage has layers. A <strong>block device</strong> is a disk or partition. A <strong>filesystem</strong> is the structure written onto it (XFS by default on RHEL). A <strong>mount</strong> attaches that filesystem to a directory in the single tree.</p>
        <div class="code-label"><span>terminal · see all three layers</span></div>
        <pre><code>lsblk -f
blkid
findmnt
df -hT</code></pre>
        <p><code>lsblk -f</code> shows the device tree, filesystem type, label, UUID, and mount point. <code>blkid</code> queries filesystem signatures directly. <code>findmnt</code> shows the mount tree, including source, target, and options. <code>df -hT</code> shows capacity by mounted filesystem.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Layer</th><th>Question it answers</th><th>Tool</th></tr></thead>
            <tbody>
              <tr><td>Block device</td><td>What disks and partitions exist?</td><td><code>lsblk</code></td></tr>
              <tr><td>Filesystem</td><td>What is formatted on it?</td><td><code>blkid</code>, <code>lsblk -f</code></td></tr>
              <tr><td>Mount</td><td>Where is it attached and with what options?</td><td><code>findmnt</code>, <code>mount</code></td></tr>
              <tr><td>Consumption</td><td>How much is used and by whom?</td><td><code>df</code>, <code>du</code></td></tr>
            </tbody>
          </table>
        </div>
        <p>An unmounted filesystem is invisible to normal path-based tools. A mounted filesystem's root hides whatever was previously in the mount point directory. This is why mounting over a non-empty directory appears to "lose" files until you unmount.</p>
      `
    },
    {
      title: 'Mount, unmount, and persist',
      body: `
        <p>Temporary mounts are useful for inspection and recovery. Persistent mounts belong in <code>/etc/fstab</code>, and the safe way to reference a filesystem is by <strong>UUID</strong>, not by a device name that can change.</p>
        <div class="code-label"><span>terminal · mount by UUID</span></div>
        <pre><code>sudo mkdir -p /mnt/data
sudo blkid /dev/sdb1
sudo mount UUID="8f3c1e2a-..." /mnt/data
findmnt /mnt/data
sudo umount /mnt/data</code></pre>
        <p>If <code>umount</code> reports "target is busy," find out what is using it before forcing anything:</p>
        <div class="code-label"><span>terminal · who is using the mount?</span></div>
        <pre><code>sudo lsof +D /mnt/data
sudo fuser -vm /mnt/data</code></pre>
        <p>A common cause is a shell whose current directory is inside the mount. <code>cd</code> out, close the process, then unmount. <code>umount -l</code> (lazy) and <code>umount -f</code> (force) exist, but they are recovery tools, not first choices.</p>
        <div class="code-label"><span>/etc/fstab fields</span></div>
        <pre><code>UUID=8f3c1e2a-...  /data  xfs  defaults  0 0</code></pre>
        <p>The six fields are: device, mount point, filesystem type, options, dump flag, and fsck pass. On XFS, the sixth field is typically <code>0</code>; XFS does not use the traditional fsck pass model in the same way as ext4.</p>
        <div class="callout warn">
          <div class="callout-title">Test fstab before rebooting</div>
          <p>A typo in <code>/etc/fstab</code> can drop the system into emergency mode. Run <code>sudo mount -a</code> after editing; if it succeeds without error, your syntax and UUID are at least plausible. Keep console access.</p>
        </div>
      `
    },
    {
      title: 'Capacity, inodes, and deleted files',
      body: `
        <p>"Disk full" is three different problems wearing the same jacket:</p>
        <ol>
          <li><strong>Blocks exhausted</strong> — no free data blocks. <code>df -h</code> shows 100% use.</li>
          <li><strong>Inodes exhausted</strong> — many tiny files consume metadata. <code>df -h</code> may show free space while <code>df -i</code> shows 100% inode use.</li>
          <li><strong>Deleted but open</strong> — a process still holds a deleted file. Space is not reclaimed until the file descriptor closes. <code>lsof +L1</code> finds these.</li>
        </ol>
        <div class="code-label"><span>terminal · capacity forensics</span></div>
        <pre><code>df -hT
df -i
sudo du -xhd1 /var | sort -rh | head
sudo lsof +L1</code></pre>
        <p><code>du -x</code> stays on one filesystem, which prevents it from wandering into other mounts. <code>-d1</code> limits depth. Sorting by human-readable size is convenient but not perfectly numeric; use <code>du -sk</code> and sort <code>-n</code> when precision matters.</p>
        <p>On RHEL, <code>/var</code> is the usual suspect: logs, journal, package cache, containers, and application data. Do not delete blindly. Identify the owner, apply the service's retention tool, and fix the cause. A log that grows unbounded will fill the disk again tomorrow.</p>
        <div class="callout tip">
          <div class="callout-title">Use the right cleanup tool</div>
          <p><code>dnf clean all</code> clears package cache. <code>journalctl --vacuum-size=500M</code> trims the journal. Application logs have their own rotation policy. <code>rm</code> is not a retention strategy.</p>
        </div>
      `
    },
    {
      title: 'The LVM layer, in one page',
      body: `
        <p>Many RHEL systems put storage behind <strong>LVM</strong> (Logical Volume Manager). You do not need to build it yet, but you need to recognize it.</p>
        <div class="code-label"><span>terminal · inspect LVM</span></div>
        <pre><code>sudo pvs
sudo vgs
sudo lvs
lsblk</code></pre>
        <p>Think of it as three layers: <strong>physical volumes</strong> (PVs) are disks or partitions; <strong>volume groups</strong> (VGs) pool that space; <strong>logical volumes</strong> (LVs) are flexible block devices carved from the pool. The filesystem sits on the LV. This is why an LV can be extended without repartitioning a physical disk.</p>
        <p>To extend an LV and grow XFS in one supported operation on RHEL 9+:</p>
        <div class="code-label"><span>terminal · extend an LV and filesystem</span></div>
        <pre><code>sudo lvextend -r -L +5G /dev/vg_data/lv_app
df -h /app</code></pre>
        <p>The <code>-r</code> flag resizes the filesystem with the volume. XFS can grow online but cannot shrink. This asymmetry is a design constraint, not an inconvenience to work around with force. Plan capacity before creation.</p>
        <p>Later levels cover PV/VG/LV creation, LVM snapshots, NFS, and Stratis. For now, be able to answer: is this filesystem on a partition or an LV, and is there free space in the volume group?</p>
      `
    }
  ],
  commands: [
    { cmd: 'lsblk -f', desc: 'Show block devices, filesystems, UUIDs, and mounts.', category: 'Storage' },
    { cmd: 'blkid', desc: 'Show filesystem UUIDs and types.', category: 'Storage' },
    { cmd: 'findmnt /data', desc: 'Show the mount source, target, and options.', category: 'Storage' },
    { cmd: 'df -hT', desc: 'Show mounted filesystem capacity and type.', category: 'Storage' },
    { cmd: 'df -i', desc: 'Check inode consumption.', category: 'Storage' },
    { cmd: 'du -xhd1 /var', desc: 'Show directory usage without crossing mounts.', category: 'Storage' },
    { cmd: 'sudo mount UUID=... /mnt/data', desc: 'Mount a filesystem by UUID.', category: 'Storage' },
    { cmd: 'sudo umount /mnt/data', desc: 'Unmount a filesystem.', category: 'Storage' },
    { cmd: 'sudo mount -a', desc: 'Validate and apply all fstab entries.', category: 'Storage' },
    { cmd: 'sudo lsof +L1', desc: 'Find deleted files still held open.', category: 'Storage' },
    { cmd: 'sudo lvs', desc: 'List logical volumes.', category: 'Storage' },
    { cmd: 'sudo lvextend -r -L +5G LV', desc: 'Extend an LV and resize its filesystem.', category: 'Storage' }
  ],
  lab: {
    title: 'A safe storage sandbox',
    scenario: 'Create a small file-backed filesystem, mount it, fill it, inspect it, and clean up. No real disk is touched.',
    minutes: 20,
    steps: [
      { text: 'Inspect the current storage map and capacity.', cmd: 'lsblk -f && df -hT', verify: 'Identify which filesystem holds / and what else is mounted.' },
      { text: 'Create a 64 MB file and format it as XFS.', cmd: 'dd if=/dev/zero of=/tmp/lab-disk.img bs=1M count=64 status=progress && sudo mkfs.xfs /tmp/lab-disk.img', verify: 'mkfs refuses if the target already has a filesystem; that is a feature.' },
      { text: 'Mount it on a new directory and inspect the mount.', cmd: 'sudo mkdir -p /mnt/labdisk && sudo mount -o loop /tmp/lab-disk.img /mnt/labdisk && findmnt /mnt/labdisk' },
      { text: 'Write data, check usage, and calculate directory consumption.', cmd: 'sudo dd if=/dev/zero of=/mnt/labdisk/fill bs=1M count=20 && df -h /mnt/labdisk && du -sh /mnt/labdisk' },
      { text: 'Unmount and remove the file-backed disk.', cmd: 'sudo umount /mnt/labdisk && rm /tmp/lab-disk.img && sudo rmdir /mnt/labdisk', verify: 'findmnt /mnt/labdisk should return nothing.' }
    ]
  },
  quiz: [
    {
      q: 'Which command shows filesystem UUIDs and types?',
      options: ['lsblk -f', 'df -i', 'du -sh', 'free -h'],
      answer: 0,
      why: 'lsblk -f prints filesystem type, label, UUID, and mount point. blkid also queries this information.'
    },
    {
      q: 'df shows free space but writes fail with "No space left on device." What should you check?',
      options: ['Inode usage with df -i', 'The firewall', 'DNS resolution', 'The default route'],
      answer: 0,
      why: 'A filesystem can exhaust inodes while blocks remain free. df -i reveals it.'
    },
    {
      q: 'Why use a UUID in /etc/fstab instead of /dev/sdb1?',
      options: ['UUIDs are shorter', 'Device names can change across boots and hardware changes', 'UUIDs disable SELinux', 'Only UUIDs can mount XFS'],
      answer: 1,
      why: 'Device enumeration order can change. UUIDs identify the filesystem itself, making mounts stable.'
    }
  ]
};

RHEL.lessons.bash = {
  id: 'bash',
  module: 'm04',
  title: 'Your first real script',
  subtitle: 'Turn a sequence of commands into a safe, readable tool that fails loudly.',
  minutes: 32,
  difficulty: 'Core',
  tags: ['bash', 'scripting', 'automation', 'exit codes'],
  objectives: [
    'Write a Bash script with a shebang and strict mode',
    'Use variables, quoting, arguments, and command substitution',
    'Make decisions with test expressions and loops',
    'Handle errors instead of hiding them',
    'Build and run a small system health report'
  ],
  sections: [
    {
      title: 'Anatomy of a script',
      body: `
        <p>A script is a text file that the shell executes. The first line, the <strong>shebang</strong>, names the interpreter. On RHEL, use the Bash that is actually installed:</p>
        <div class="code-label"><span>healthcheck.sh</span></div>
        <pre><code>#!/bin/bash
set -euo pipefail

echo "host: $(hostname)"
echo "date: $(date -Iseconds)"
echo "user: $(whoami)"</code></pre>
        <p>Make it executable and run it:</p>
        <div class="code-label"><span>terminal · run a script</span></div>
        <pre><code>chmod +x healthcheck.sh
./healthcheck.sh
bash healthcheck.sh</code></pre>
        <p><code>./</code> means "this directory." The current directory is not on <code>PATH</code> by default, which is a safety feature: a malicious file named <code>ls</code> in your working directory should not run just because you typed <code>ls</code>.</p>
        <p><code>set -euo pipefail</code> is the closest thing Bash has to a safety belt:</p>
        <ul>
          <li><code>-e</code> — exit on an unhandled command failure.</li>
          <li><code>-u</code> — error on an undefined variable.</li>
          <li><code>-o pipefail</code> — a pipeline fails if any stage fails, not just the last one.</li>
        </ul>
        <p>It is not a substitute for thinking. Commands in conditions, pipelines, and subshells have edge cases. But it turns silent corruption into a visible failure.</p>
      `
    },
    {
      title: 'Variables, arguments, quoting',
      body: `
        <p>Assignment has no spaces around the equals sign. Expansion uses <code>$</code>. Quotes control how much the shell interprets.</p>
        <div class="code-label"><span>variables and quoting</span></div>
        <pre><code>name="RHEL Fieldbook"
count=3
echo "$name"
echo 'single quotes keep $name literal'
echo "two plus three is $((2 + 3))"</code></pre>
        <p>Always quote variable expansions unless you have a specific reason not to: <code>"$file"</code>, not <code>$file</code>. Unquoted expansions undergo word splitting and globbing, so a filename with a space can become two arguments and a filename with <code>*</code> can expand unexpectedly.</p>
        <p>Script arguments are available as positional parameters:</p>
        <div class="code-label"><span>arguments</span></div>
        <pre><code>#!/bin/bash
set -euo pipefail
echo "script: $0"
echo "first: \${1:-no argument}"
echo "count: $#"
for arg in "$@"; do
  echo "arg: $arg"
done</code></pre>
        <p><code>"$@"</code> preserves each argument as a separate word. <code>"$*"</code> joins them into one string. The difference matters the moment a filename contains a space. Use <code>"$@"</code> as the default.</p>
        <p>Command substitution captures output: <code>today=$(date +%F)</code>. Avoid backticks in new scripts; <code>$(...)</code> nests cleanly and is easier to read.</p>
      `
    },
    {
      title: 'Decisions and loops',
      body: `
        <p>Bash conditions use <code>[[ ... ]]</code> for strings and files, and arithmetic expressions for numbers.</p>
        <div class="code-label"><span>conditionals</span></div>
        <pre><code>#!/bin/bash
set -euo pipefail

file="\${1:-/etc/os-release}"

if [[ ! -r "$file" ]]; then
  echo "cannot read: $file" &gt;&amp;2
  exit 1
fi

if [[ -s "$file" ]]; then
  echo "file has content: $file"
fi

load=$(cut -d' ' -f1 /proc/loadavg)
if (( load &gt; 4 )); then
  echo "load is elevated: $load"
fi</code></pre>
        <p>Common file tests: <code>-e</code> exists, <code>-f</code> regular file, <code>-d</code> directory, <code>-r</code> readable, <code>-s</code> non-empty. String tests: <code>==</code>, <code>!=</code>, <code>-z</code> empty. Numeric comparisons inside <code>(( ))</code> use <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, and so on.</p>
        <p>Loops process collections without copy-paste:</p>
        <div class="code-label"><span>loops</span></div>
        <pre><code>for unit in sshd chronyd firewalld; do
  if systemctl is-active --quiet "$unit"; then
    echo "OK   $unit"
  else
    echo "FAIL $unit"
  fi
done</code></pre>
        <p>Prefer reading command output rather than parsing human-oriented tables. Use <code>systemctl is-active --quiet</code> for a clean exit status; do not grep the output of <code>systemctl status</code>, which is designed for people and changes between versions.</p>
        <div class="callout note">
          <div class="callout-title">Exit codes are the API</div>
          <p>A script should return <code>0</code> on success and non-zero on failure. Automation depends on this. Printing "ERROR" but exiting 0 is a lie that breaks pipelines.</p>
        </div>
      `
    },
    {
      title: 'A health report you would actually keep',
      body: `
        <p>This script combines the pieces. It is intentionally small, but it demonstrates the shape of a useful operational tool: validate inputs, set strict mode, log clearly, and fail with a non-zero status.</p>
        <div class="code-label"><span>healthcheck.sh · complete example</span></div>
        <pre><code>#!/bin/bash
set -euo pipefail

report_dir="\${1:-$HOME/health}"
mkdir -p "$report_dir"

stamp=$(date +%Y%m%d-%H%M%S)
report="$report_dir/health-$stamp.txt"

{
  echo "RHEL health report"
  echo "host: $(hostname)"
  echo "time: $(date -Iseconds)"
  echo "kernel: $(uname -r)"
  echo
  echo "== root filesystem =="
  df -h /
  echo
  echo "== failed units =="
  systemctl --failed --no-legend || true
  echo
  echo "== error-priority journal =="
  journalctl -p err -b --no-pager -n 20 || true
} &gt; "$report"

echo "wrote $report"
wc -l "$report"</code></pre>
        <p>Notice the <code>|| true</code> after commands that are allowed to find nothing. Without it, strict mode would abort the report when there are no failed units — an empty result is not an error. This is a deliberate exception, not a blanket suppression.</p>
        <p>In later levels you will add logging, locking, retention, and scheduling. The most important habit is already here: the script produces a predictable artifact and tells you where it is.</p>
      `
    }
  ],
  commands: [
    { cmd: '#!/bin/bash', desc: 'Shebang: select Bash as the interpreter.', category: 'Bash' },
    { cmd: 'set -euo pipefail', desc: 'Fail fast on errors, unset variables, and pipeline failures.', category: 'Bash' },
    { cmd: 'chmod +x script.sh', desc: 'Make a script executable.', category: 'Bash' },
    { cmd: './script.sh', desc: 'Run a script from the current directory.', category: 'Bash' },
    { cmd: 'echo "$HOME"', desc: 'Expand a variable safely in double quotes.', category: 'Bash' },
    { cmd: 'name=$(command)', desc: 'Capture command output in a variable.', category: 'Bash' },
    { cmd: '[[ -f "$file" ]]', desc: 'Test whether a path is a regular file.', category: 'Bash' },
    { cmd: 'for item in "$@"; do ...; done', desc: 'Loop over arguments safely.', category: 'Bash' },
    { cmd: 'if systemctl is-active --quiet sshd; then ...; fi', desc: 'Branch on a command exit status.', category: 'Bash' },
    { cmd: 'exit 1', desc: 'Return a non-zero status to signal failure.', category: 'Bash' }
  ],
  lab: {
    title: 'Write a health report',
    scenario: 'Create a reusable script that another admin could run without reading the source first.',
    minutes: 22,
    steps: [
      { text: 'Create the script with a shebang and strict mode.', cmd: 'mkdir -p ~/bin && $EDITOR ~/bin/healthcheck.sh' },
      { text: 'Add host, date, kernel, disk, failed-unit, and recent-error sections. Redirect the block to a timestamped file.', verify: 'Use the complete example above. Quote every variable expansion.' },
      { text: 'Make it executable and run it.', cmd: 'chmod +x ~/bin/healthcheck.sh && ~/bin/healthcheck.sh' },
      { text: 'Verify the report exists and has content.', cmd: 'ls -lh ~/health && head -n 20 ~/health/health-*.txt' },
      { text: 'Break it on purpose: run it with an unwritable report directory and observe the non-zero exit.', cmd: '~/bin/healthcheck.sh /root/not-allowed; echo "exit: $?"', verify: 'The exit status should be non-zero, and the error should be visible.' }
    ]
  },
  quiz: [
    {
      q: 'What does set -u do?',
      options: ['Enables verbose output', 'Treats undefined variables as errors', 'Unmounts filesystems', 'Disables pipes'],
      answer: 1,
      why: 'set -u makes an unset variable an error, preventing empty expansions from silently changing a command.'
    },
    {
      q: 'Why quote "$@" instead of using $@?',
      options: ['It preserves each argument as a separate word', 'It sorts the arguments', 'It removes duplicate arguments', 'It converts arguments to uppercase'],
      answer: 0,
      why: 'Quoted "$@" preserves word boundaries, which matters for arguments containing spaces or glob characters.'
    },
    {
      q: 'A script prints an error but exits 0. Why is that a problem?',
      options: ['It uses too much CPU', 'Automation will treat the run as successful', 'It disables the journal', 'Bash cannot print errors'],
      answer: 1,
      why: 'Exit status is how callers detect failure. Printing an error without a non-zero exit hides the failure from automation.'
    }
  ]
};

RHEL.lessons.security = {
  id: 'security',
  module: 'm04',
  title: 'SELinux without fear',
  subtitle: 'The second permission system on RHEL — plus a firewall and SSH baseline that stays on.',
  minutes: 31,
  difficulty: 'Core',
  tags: ['SELinux', 'firewalld', 'SSH', 'hardening', 'security'],
  objectives: [
    'Explain SELinux modes and security contexts',
    'Read a denial and find the right fix',
    'Restore a file context without disabling enforcement',
    'Apply practical SSH and firewall hardening',
    'Build a small, repeatable security baseline'
  ],
  sections: [
    {
      title: 'SELinux is not a permissions bug',
      body: `
        <p>Traditional permissions ask <em>who</em> you are and <em>what mode bits</em> allow. SELinux adds a label-based policy: even root can be denied if the process domain is not allowed to access the target type. This is <strong>mandatory access control</strong>, and it is one of the reasons RHEL is harder to casually compromise.</p>
        <div class="code-label"><span>terminal · check the mode and labels</span></div>
        <pre><code>getenforce
sestatus
ls -Z /var/www/html
ps -eZ | grep httpd</code></pre>
        <p>Modes:</p>
        <ul>
          <li><strong>Enforcing</strong> — policy is applied and denials are blocked and logged.</li>
          <li><strong>Permissive</strong> — policy is evaluated and denials are logged, but access is allowed. A diagnostic mode, not a destination.</li>
          <li><strong>Disabled</strong> — SELinux is off. Requiring a reboot and losing protection is not a troubleshooting step.</li>
        </ul>
        <p>A context looks like <code>system_u:object_r:httpd_sys_content_t:s0</code>. The type is the part you will work with most: <code>httpd_sys_content_t</code> for web content, <code>ssh_home_t</code> for SSH files, <code>user_home_t</code> for home data. Files moved into a new location keep their old context; files created in the right location usually inherit the correct one.</p>
        <div class="callout warn">
          <div class="callout-title">Never start by disabling SELinux</div>
          <p>Disabling enforcement hides the actual mismatch and often creates a false success that fails again on the next host. Read the denial, fix the label, port, or boolean, then keep enforcing.</p>
        </div>
      `
    },
    {
      title: 'Read the denial, then fix the cause',
      body: `
        <p>When SELinux blocks something, it writes an <strong>AVC denial</strong> to the audit log. The denial names the source domain, target type, and requested permission. That is enough to choose a fix.</p>
        <div class="code-label"><span>terminal · find recent denials</span></div>
        <pre><code>sudo ausearch -m AVC -ts recent
sudo journalctl -t setroubleshoot --since "1 hour ago"
sudo sealert -a /var/log/audit/audit.log</code></pre>
        <p>The most common causes and their honest fixes:</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Symptom</th><th>Likely cause</th><th>Correct fix</th></tr></thead>
            <tbody>
              <tr><td>Web content returns 403 after being copied from /home</td><td>Wrong file type/context</td><td><code>restorecon -Rv /var/www/html</code></td></tr>
              <tr><td>Service cannot bind a nonstandard port</td><td>Port not allowed for that domain</td><td><code>semanage port -a -t http_port_t -p tcp 8080</code></td></tr>
              <tr><td>Service needs to make an outbound connection</td><td>Boolean disabled</td><td><code>setsebool -P httpd_can_network_connect on</code></td></tr>
              <tr><td>Custom app files keep the wrong label</td><td>No matching file-context rule</td><td><code>semanage fcontext -a ...</code> then <code>restorecon</code></td></tr>
            </tbody>
          </table>
        </div>
        <p><code>restorecon</code> applies the policy's expected context to a path. <code>chcon</code> sets a label manually, but it is temporary and can be overwritten by a relabel. Prefer <code>semanage fcontext</code> plus <code>restorecon</code> for persistent custom paths.</p>
        <div class="code-label"><span>terminal · custom web root</span></div>
        <pre><code>sudo semanage fcontext -a -t httpd_sys_content_t "/srv/site(/.*)?"
sudo restorecon -Rv /srv/site
ls -Z /srv/site</code></pre>
        <p>Booleans toggle prewritten policy behavior. List them, inspect the description, then set persistently with <code>-P</code>:</p>
        <div class="code-label"><span>terminal · booleans</span></div>
        <pre><code>getsebool -a | grep httpd
sudo setsebool -P httpd_can_network_connect on</code></pre>
        <p>Do not enable broad booleans because a search result suggested it. Understand the capability you are granting, and prefer the narrowest one that works.</p>
      `
    },
    {
      title: 'SSH and firewall baseline',
      body: `
        <p>SSH is the front door. A small configuration change has outsized impact, so validate before restarting and keep a console path.</p>
        <div class="code-label"><span>/etc/ssh/sshd_config.d/10-baseline.conf</span></div>
        <pre><code>PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no</code></pre>
        <p>Disabling password authentication requires working key-based access first. Test with a second session before closing your current one. Validate the syntax with <code>sshd -t</code>, then reload:</p>
        <div class="code-label"><span>terminal · validate SSH config</span></div>
        <pre><code>sudo sshd -t
sudo systemctl reload sshd
ssh -o BatchMode=yes student@localhost true</code></pre>
        <p>On RHEL 9+, drop-in files under <code>/etc/ssh/sshd_config.d/</code> are included by the main configuration. Use them for local policy instead of editing the vendor file, which makes upgrades and audits easier.</p>
        <p>Keep the firewall enabled and expose only required services. Verify listening sockets, then confirm the zone:</p>
        <div class="code-label"><span>terminal · expose only what is needed</span></div>
        <pre><code>sudo ss -tulpn
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload</code></pre>
        <p>Patch discipline is part of the baseline. Subscribe, test, and update deliberately. A server that has not received security updates in a year is not "stable"; it is unmaintained.</p>
      `
    },
    {
      title: 'A baseline you can explain',
      body: `
        <p>Security is not a pile of tools. It is a set of choices you can defend. Start with these, and write down why each one exists in your environment:</p>
        <ul>
          <li><strong>Identity</strong> — unique accounts, no shared root, sudo for privilege, MFA where supported.</li>
          <li><strong>Access</strong> — SSH keys, root login disabled, only required ports open, firewall enforcing.</li>
          <li><strong>Updates</strong> — subscribed repositories, a patch cadence, and a rollback path.</li>
          <li><strong>Mandatory controls</strong> — SELinux enforcing, crypto policy appropriate to the data, auditd enabled.</li>
          <li><strong>Detection</strong> — centralized logs, failed-unit alerts, authentication monitoring, file-integrity checks.</li>
          <li><strong>Recovery</strong> — tested backups, documented restore, and a break-glass console procedure.</li>
        </ul>
        <p>RHEL provides tools to evaluate the baseline: <code>oscap</code> with the SCAP Security Guide, <code>aide</code> for file integrity, and <code>auditd</code> for system-call auditing. You will use them in the Administrator level. For now, learn to keep SELinux and firewalld on and to read what they tell you.</p>
        <div class="callout tip">
          <div class="callout-title">The best security change is small</div>
          <p>One narrow sudo rule, one open port, one correct context. Broad changes are hard to review and harder to reverse. Make the smallest change that solves the actual problem.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'getenforce', desc: 'Show the current SELinux mode.', category: 'Security' },
    { cmd: 'sestatus', desc: 'Show SELinux policy, mode, and status.', category: 'Security' },
    { cmd: 'ls -Z /var/www/html', desc: 'Show SELinux contexts for files.', category: 'Security' },
    { cmd: 'ps -eZ', desc: 'Show processes with their SELinux domains.', category: 'Security' },
    { cmd: 'sudo restorecon -Rv /path', desc: 'Restore policy-defined contexts recursively.', category: 'Security' },
    { cmd: 'sudo ausearch -m AVC -ts recent', desc: 'Find recent SELinux denials.', category: 'Security' },
    { cmd: 'getsebool -a | grep httpd', desc: 'List SELinux booleans for httpd.', category: 'Security' },
    { cmd: 'sudo setsebool -P name on', desc: 'Persistently enable an SELinux boolean.', category: 'Security' },
    { cmd: 'sudo semanage port -a ...', desc: 'Allow a service domain to bind a custom port.', category: 'Security' },
    { cmd: 'sudo sshd -t', desc: 'Validate the SSH daemon configuration.', category: 'Security' },
    { cmd: 'sudo firewall-cmd --list-all', desc: 'Inspect the active firewall zone.', category: 'Security' }
  ],
  lab: {
    title: 'Keep SELinux enforcing',
    scenario: 'Deploy content into a web root and diagnose a context mismatch without turning off the control.',
    minutes: 22,
    steps: [
      { text: 'Confirm SELinux is enforcing and record the current mode.', cmd: 'getenforce && sestatus' },
      { text: 'Install httpd and start it.', cmd: 'sudo dnf install -y httpd && sudo systemctl enable --now httpd && systemctl is-active httpd' },
      { text: 'Create content in /var/www/html and inspect its context.', cmd: 'echo "hello from RHEL" | sudo tee /var/www/html/index.html && ls -Z /var/www/html/index.html' },
      { text: 'Copy a file from your home directory into the web root and compare contexts.', cmd: 'echo "copied" &gt; ~/copied.html && sudo cp ~/copied.html /var/www/html/copied.html && ls -Z /var/www/html/copied.html', verify: 'The copied file may retain a home-directory type such as user_home_t.' },
      { text: 'Restore the correct web content context and verify.', cmd: 'sudo restorecon -Rv /var/www/html && ls -Z /var/www/html/copied.html', verify: 'The file should now be httpd_sys_content_t.' },
      { text: 'Check for denials and inspect the firewall.', cmd: 'sudo ausearch -m AVC -ts recent; sudo firewall-cmd --list-all' }
    ]
  },
  quiz: [
    {
      q: 'What should you try before setting SELinux to permissive?',
      options: ['Disable the firewall', 'Read the AVC denial and fix the context, port, or boolean', 'Delete the audit log', 'Reinstall the operating system'],
      answer: 1,
      why: 'The denial identifies the mismatch. Correcting it preserves protection and fixes the actual cause.'
    },
    {
      q: 'Which command restores policy-defined contexts under /var/www/html?',
      options: ['chmod -R 755', 'restorecon -Rv /var/www/html', 'chown -R root', 'firewall-cmd --reload'],
      answer: 1,
      why: 'restorecon applies the expected SELinux context. chmod and chown do not change SELinux labels.'
    },
    {
      q: 'Why validate SSH configuration with sshd -t before reloading?',
      options: ['It encrypts the keys', 'It catches syntax errors before they can lock you out', 'It restarts the network', 'It disables SELinux'],
      answer: 1,
      why: 'sshd -t checks the configuration. A bad config plus a restart can remove your remote access.'
    }
  ]
};

RHEL.lessons.troubleshooting = {
  id: 'troubleshooting',
  module: 'm04',
  title: 'A calm triage method',
  subtitle: 'Gather evidence, narrow the blast radius, change one thing at a time.',
  minutes: 28,
  difficulty: 'Core',
  tags: ['troubleshooting', 'journalctl', 'incident', 'logs', 'method'],
  objectives: [
    'Apply a repeatable triage method under pressure',
    'Run a first-pass health check in the right order',
    'Match common symptoms to the most useful evidence',
    'Avoid random changes that destroy the evidence trail',
    'Write a clear escalation with timeline and impact'
  ],
  sections: [
    {
      title: 'The method beats the memorized command',
      body: `
        <p>Under pressure, the temptation is to try the last thing that worked on a different system. Resist it. A short method keeps you from turning one problem into three.</p>
        <ol>
          <li><strong>Define the symptom</strong> — what is broken, for whom, and since when? "The site is down" is not a symptom. "HTTP 502 from the load balancer since 09:12 for all users" is.</li>
          <li><strong>Establish scope</strong> — one host or many? One service or the whole platform? One network or every network?</li>
          <li><strong>Find the timeline</strong> — what changed just before? Package update, config change, certificate expiry, DNS change, disk growth, deploy.</li>
          <li><strong>Collect evidence</strong> — logs, status, capacity, network, process state. Preserve before you restart.</li>
          <li><strong>Form one hypothesis</strong> — the smallest explanation that fits the evidence.</li>
          <li><strong>Test one change</strong> — then observe. If it did not help, revert before trying the next thing.</li>
        </ol>
        <div class="callout warn">
          <div class="callout-title">Restarting destroys evidence</div>
          <p>A restart may restore service, but it also clears the state that explains the failure. Capture <code>systemctl status</code>, logs, and resource state first whenever it is safe to do so.</p>
        </div>
      `
    },
    {
      title: 'The first ten checks',
      body: `
        <p>These commands are not a ritual. Each answers a different question. Run the ones that match the symptom, in an order that rules out the broadest causes first.</p>
        <div class="code-label"><span>terminal · first-pass health check</span></div>
        <pre><code>uptime
systemctl --failed
journalctl -p err -b --no-pager | tail -n 20
df -hT
df -i
free -h
ip -br addr
ip route
sudo ss -tulpn
sudo dnf history | head</code></pre>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Question</th><th>Command</th><th>What good looks like</th></tr></thead>
            <tbody>
              <tr><td>Is the system under pressure?</td><td><code>uptime</code>, <code>free -h</code></td><td>Load is proportionate; memory is not exhausted.</td></tr>
              <tr><td>Did a unit fail?</td><td><code>systemctl --failed</code></td><td>Empty list, or a specific unit to investigate.</td></tr>
              <tr><td>What errors are recent?</td><td><code>journalctl -p err -b</code></td><td>A short, time-correlated set of messages.</td></tr>
              <tr><td>Is storage exhausted?</td><td><code>df -hT</code>, <code>df -i</code></td><td>Free blocks and inodes on every mount.</td></tr>
              <tr><td>Is the network configured?</td><td><code>ip addr</code>, <code>ip route</code></td><td>Expected address and a default route.</td></tr>
              <tr><td>Is anything listening?</td><td><code>ss -tulpn</code></td><td>The expected service on the expected port and address.</td></tr>
              <tr><td>What changed?</td><td><code>dnf history</code></td><td>A known transaction, or no recent package change.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Do not run all ten on every issue. If a user cannot reach a website, start with the listener, the firewall, and the route. If the host is slow, start with load, memory, and I/O. If a service will not start, start with its unit status and journal.</p>
      `
    },
    {
      title: 'Symptoms and their first evidence',
      body: `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Symptom</th><th>First checks</th><th>Common causes</th></tr></thead>
            <tbody>
              <tr><td>Web service unreachable</td><td><code>systemctl status httpd</code>, <code>ss -tlnp</code>, <code>firewall-cmd --list-all</code>, <code>curl -I localhost</code></td><td>Service stopped, wrong bind address, firewall, SELinux port, DNS.</td></tr>
              <tr><td>Disk full</td><td><code>df -hT</code>, <code>df -i</code>, <code>du -xhd1</code>, <code>lsof +L1</code></td><td>Log growth, deleted-open files, inode exhaustion, runaway cache.</td></tr>
              <tr><td>Cannot SSH</td><td><code>systemctl status sshd</code>, <code>ss -tlnp | grep :22</code>, <code>journalctl -u sshd</code>, <code>sshd -t</code></td><td>Config error, firewall, key/permission issue, SELinux, network path.</td></tr>
              <tr><td>Host slow</td><td><code>uptime</code>, <code>vmstat 1</code>, <code>top</code>, <code>iostat -x 1</code></td><td>CPU saturation, memory pressure/swap, blocked I/O, runaway process.</td></tr>
              <tr><td>Service will not start</td><td><code>systemctl status</code>, <code>journalctl -u</code>, unit file, permissions</td><td>Bad config, missing dependency, wrong user, port conflict, SELinux.</td></tr>
              <tr><td>Permission denied</td><td><code>ls -l</code>, <code>namei -l path</code>, <code>getfacl</code>, <code>ls -Z</code>, <code>ausearch -m AVC</code></td><td>Mode bits, directory traversal, ACL, SELinux context.</td></tr>
            </tbody>
          </table>
        </div>
        <p><code>namei -l /path/to/file</code> is an underrated tool: it walks every component of the path and shows ownership and modes, which immediately reveals a missing execute bit on a parent directory.</p>
        <div class="code-label"><span>terminal · trace a path permission</span></div>
        <pre><code>namei -l /var/www/html/index.html
ls -lZ /var/www/html/index.html</code></pre>
      `
    },
    {
      title: 'Escalate with a timeline, not a vibe',
      body: `
        <p>You will not fix everything alone. A good escalation gives the next person a running start and protects your credibility.</p>
        <ul>
          <li><strong>Impact</strong> — who or what is affected, and how severe is it?</li>
          <li><strong>Timeline</strong> — when it started, what changed, what you did, and the result. Use timestamps with time zones.</li>
          <li><strong>Evidence</strong> — exact commands and raw output, not a summary that removes the error.</li>
          <li><strong>Current state</strong> — is service restored? Partial? Degraded? What is the workaround?</li>
          <li><strong>Hypotheses</strong> — what you have ruled out, and what remains.</li>
          <li><strong>Next action</strong> — what you are about to try, and the rollback plan.</li>
        </ul>
        <p>After the incident, write a short postmortem while it is fresh: trigger, detection gap, response, root cause, and one or two changes that would prevent recurrence. Blameless does not mean evidence-free; it means focusing on systems and decisions rather than individuals.</p>
        <div class="callout tip">
          <div class="callout-title">One change at a time</div>
          <p>If you change three things and the problem disappears, you do not know what fixed it — and you may have introduced two new problems. Change one variable, observe, then proceed.</p>
        </div>
      `
    }
  ],
  commands: [
    { cmd: 'uptime', desc: 'Check load averages and uptime.', category: 'Troubleshooting' },
    { cmd: 'systemctl --failed', desc: 'List units that failed to start.', category: 'Troubleshooting' },
    { cmd: 'journalctl -p err -b', desc: 'Show error-priority messages from this boot.', category: 'Troubleshooting' },
    { cmd: 'df -hT', desc: 'Check filesystem capacity and type.', category: 'Troubleshooting' },
    { cmd: 'df -i', desc: 'Check inode exhaustion.', category: 'Troubleshooting' },
    { cmd: 'free -h', desc: 'Check memory and swap pressure.', category: 'Troubleshooting' },
    { cmd: 'ip -br addr', desc: 'Show a compact interface and address summary.', category: 'Troubleshooting' },
    { cmd: 'ss -tulpn', desc: 'List listening sockets and owning processes.', category: 'Troubleshooting' },
    { cmd: 'namei -l /path', desc: 'Trace permissions on every path component.', category: 'Troubleshooting' },
    { cmd: 'sudo ausearch -m AVC -ts recent', desc: 'Find recent SELinux denials.', category: 'Troubleshooting' },
    { cmd: 'sudo dnf history', desc: 'Review recent package changes.', category: 'Troubleshooting' }
  ],
  lab: {
    title: 'Run a calm first pass',
    scenario: 'Perform a non-destructive health assessment and write a three-line situation report from the evidence.',
    minutes: 15,
    steps: [
      { text: 'Capture system identity, uptime, and load.', cmd: 'hostnamectl && uptime' },
      { text: 'List failed units and recent error-priority journal entries.', cmd: 'systemctl --failed; journalctl -p err -b --no-pager | tail -n 20' },
      { text: 'Check capacity, inodes, and memory.', cmd: 'df -hT; df -i; free -h' },
      { text: 'Check addresses, routes, and listening sockets.', cmd: 'ip -br addr; ip route; sudo ss -tulpn' },
      { text: 'Review the last package transactions for recent change.', cmd: 'sudo dnf history | head -n 10' },
      { text: 'Write a three-line report: impact, evidence, next action. Keep it factual and time-stamped.', verify: 'If nothing is wrong, say so and include the evidence you checked.' }
    ]
  },
  quiz: [
    {
      q: 'A service is failing. What should you capture before restarting it?',
      options: ['Only the exit code', 'Status, logs, and resource state', 'A new screenshot of the desktop', 'The package list only'],
      answer: 1,
      why: 'Restarting can clear the state that explains the failure. Capture status and logs first when safe.'
    },
    {
      q: 'df shows free blocks but writes fail. What is the next check?',
      options: ['df -i for inode exhaustion', 'ping the gateway', 'systemctl restart sshd', 'firewall-cmd --reload'],
      answer: 0,
      why: 'A filesystem can run out of inodes while blocks remain free. df -i confirms it.'
    },
    {
      q: 'Why change only one thing at a time during triage?',
      options: ['It is faster to type', 'It preserves causality and prevents new problems', 'It avoids using sudo', 'It disables SELinux'],
      answer: 1,
      why: 'Multiple simultaneous changes make it impossible to know what worked or what broke.'
    }
  ]
};