/* ==========================================================================
   RHEL Fieldbook — curriculum data
   Independent study project. RHEL is a trademark of Red Hat, Inc.
   ========================================================================== */

window.RHEL = {
  meta: {
    title: 'RHEL Fieldbook',
    version: '1.0',
    updated: 'November 2026',
    target: 'RHEL 9 & 10',
    tagline: 'From first prompt to production.'
  },

  levels: [
    {
      id: '01',
      title: 'Foundations',
      kicker: 'The daily driver',
      status: 'live',
      duration: '7–9 hours',
      cert: 'RHCSA groundwork',
      promise: 'Get fluent in the shell, the filesystem, identity, permissions, packages, services, and the habits that keep a RHEL box healthy.',
      outcomes: [
        'Move around a RHEL filesystem without guessing',
        'Create users, groups, and safe sudo access',
        'Read permissions and fix ownership correctly',
        'Inspect processes, packages, services, and logs',
        'Configure basic networking and storage',
        'Write a small Bash script and apply a security baseline'
      ],
      modules: [
        {
          id: 'm01',
          number: '01',
          title: 'Orientation',
          blurb: 'Learn where you are, how the shell thinks, and where to find the truth.',
          duration: 'about 2 hours',
          lessons: ['orientation', 'shell', 'help', 'filesystem']
        },
        {
          id: 'm02',
          number: '02',
          title: 'Daily driver',
          blurb: 'Files, text, users, and permissions — the work you will do every day.',
          duration: 'about 2.5 hours',
          lessons: ['files', 'text', 'users', 'permissions']
        },
        {
          id: 'm03',
          number: '03',
          title: 'Systems',
          blurb: 'Processes, packages, services, and the network: how RHEL actually runs.',
          duration: 'about 2 hours',
          lessons: ['processes', 'packages', 'services', 'network']
        },
        {
          id: 'm04',
          number: '04',
          title: 'Operations',
          blurb: 'Storage, scripting, hardening, and a calm method for fixing what breaks.',
          duration: 'about 2.5 hours',
          lessons: ['storage', 'bash', 'security', 'troubleshooting']
        }
      ]
    },
    {
      id: '02',
      title: 'Operator',
      kicker: 'Hands on the controls',
      status: 'live',
      duration: '14–18 hours',
      cert: 'RHCSA depth',
      promise: 'Operate real services with confidence: storage, identity, networking, package repositories, logs, and scheduled work.',
      outcomes: [
        'Provision and mount storage safely',
        'Manage SSH access and sudo policy',
        'Build and troubleshoot systemd services',
        'Work with DNF repositories and package streams',
        'Configure NetworkManager and firewalld',
        'Automate recurring work with timers and cron'
      ],
      modules: [
        {
          id: 'm05', number: '05', title: 'Storage operations', duration: 'about 3 hours',
          blurb: 'Turn block devices into durable capacity: partitions, XFS, LVM, swap, and mount policy.',
          desc: 'Partitions, XFS, LVM, swap, mount policy, and NFS basics.',
          lessons: ['storage-partitions', 'storage-lvm']
        },
        {
          id: 'm06', number: '06', title: 'Identity & access', duration: 'about 2 hours',
          blurb: 'Make remote access deliberate: SSH keys, least-privilege sudo, and file modes that mean something.',
          desc: 'Users, groups, sudoers, SSH keys, PAM, and password policy.',
          lessons: ['ssh-sudo']
        },
        {
          id: 'm07', number: '07', title: 'Services & logs', duration: 'about 4 hours',
          blurb: 'Own the lifecycle of a service, from unit file to journal evidence and scheduled timers.',
          desc: 'Unit files, dependencies, journald, timers, and boot targets.',
          lessons: ['systemd-units', 'timers-journal']
        },
        {
          id: 'm08', number: '08', title: 'Packages at scale', duration: 'about 2.5 hours',
          blurb: 'Control where software comes from, which stream is active, and how to roll back a transaction.',
          desc: 'DNF, modules/streams, repositories, RPM verification, and history.',
          lessons: ['dnf-repos']
        },
        {
          id: 'm09', number: '09', title: 'Network operations', duration: 'about 2.5 hours',
          blurb: 'Configure connections with NetworkManager and expose only the ports that should exist.',
          desc: 'NetworkManager, nmcli, DNS, firewall zones, and connectivity triage.',
          lessons: ['network-firewall']
        },
        {
          id: 'm10', number: '10', title: 'Shell productivity', duration: 'about 4 hours',
          blurb: 'Find the right files, transform the right lines, and schedule the work to repeat safely.',
          desc: 'find, grep, sed, awk, tar, cron, and safe bulk operations.',
          lessons: ['text-pipeline', 'archive-cron']
        }
      ]
    },
    {
      id: '03',
      title: 'Administrator',
      kicker: 'Own the platform',
      status: 'mapped',
      duration: '18–24 hours',
      cert: 'RHCE groundwork',
      promise: 'Go below the surface. Build resilient storage, run containers, understand SELinux, recover broken boots, and measure performance.',
      outcomes: [
        'Engineer LVM and shared storage',
        'Run and persist Podman containers',
        'Diagnose SELinux denials instead of disabling it',
        'Recover a system that will not boot',
        'Tune resources with evidence, not folklore',
        'Apply a repeatable security baseline'
      ],
      modules: [
        { title: 'Storage engineering', desc: 'LVM, Stratis, NFS/SMB, autofs, iSCSI, and capacity planning.' },
        { title: 'Containers with Podman', desc: 'Images, volumes, networks, rootless mode, and Quadlet units.' },
        { title: 'SELinux in depth', desc: 'Contexts, booleans, policy modules, and AVC troubleshooting.' },
        { title: 'Boot & recovery', desc: 'GRUB, initramfs, emergency targets, root password recovery, and rescue.' },
        { title: 'Performance & resources', desc: 'tuned, cgroups v2, vmstat, iostat, sar, and pressure signals.' },
        { title: 'Security baseline', desc: 'OpenSCAP, crypto policies, auditd, AIDE, and patch discipline.' }
      ]
    },
    {
      id: '04',
      title: 'Automation',
      kicker: 'Make it repeatable',
      status: 'mapped',
      duration: '16–20 hours',
      cert: 'RHCE depth',
      promise: 'Move from one-off commands to reviewed, idempotent automation that another admin can run without fear.',
      outcomes: [
        'Write robust Bash with strict mode and traps',
        'Build Ansible inventories, playbooks, and roles',
        'Manage automation in Git with review',
        'Use templates and handlers safely',
        'Build and customize RHEL images',
        'Test automation before it reaches production'
      ],
      modules: [
        { title: 'Bash engineering', desc: 'Functions, arrays, traps, strict mode, and argument design.' },
        { title: 'Ansible essentials', desc: 'Inventory, modules, playbooks, roles, facts, and vault.' },
        { title: 'Git for operators', desc: 'Branching, diffs, pull requests, and change history.' },
        { title: 'Automation patterns', desc: 'Idempotency, templates, handlers, check mode, and rollback.' },
        { title: 'Image & cloud', desc: 'Image Builder, cloud-init, kickstart, and golden images.' },
        { title: 'CI for sysadmins', desc: 'Linting, molecule tests, pipeline gates, and safe delivery.' }
      ]
    },
    {
      id: '05',
      title: 'Production',
      kicker: 'Design for failure',
      status: 'mapped',
      duration: '20–28 hours',
      cert: 'RHCA track',
      promise: 'Think in systems: high availability, identity at scale, observability, compliance, lifecycle, and a capstone that ties it together.',
      outcomes: [
        'Design and test a highly available service',
        'Integrate RHEL with central identity',
        'Build advanced network topologies',
        'Instrument services for observability',
        'Operate a compliance and patch lifecycle',
        'Deliver a production-ready capstone'
      ],
      modules: [
        { title: 'High availability', desc: 'Pacemaker, quorum, fencing, failover testing, and runbooks.' },
        { title: 'Identity at scale', desc: 'IdM/FreeIPA, SSSD, Kerberos, certificates, and trust.' },
        { title: 'Advanced networking', desc: 'Bonding, VLANs, routing, nftables, and packet-level triage.' },
        { title: 'Observability', desc: 'Metrics, structured logs, alert design, and incident response.' },
        { title: 'Compliance & lifecycle', desc: 'Hardening, patching, ELS planning, migration, and evidence.' },
        { title: 'Capstone', desc: 'A production-grade web stack with storage, identity, monitoring, and recovery.' }
      ]
    }
  ],

  ex200: [
    { id: 'tools', title: 'Understand and use essential tools', official: 'Access a shell prompt and issue commands with correct syntax; use input-output redirection, grep and regular expressions; archive, compress, unpack, and create files.' },
    { id: 'scripts', title: 'Create simple shell scripts', official: 'Conditionally execute code, use looping constructs, process script inputs, and use shell script exit codes.' },
    { id: 'running', title: 'Operate running systems', official: 'Boot and troubleshoot a system, identify processes and manage them, locate and interpret logs, tune system performance, and manage scheduling.' },
    { id: 'local-storage', title: 'Configure local storage', official: 'List, create, and delete partitions; create and remove physical volumes, volume groups, and logical volumes; add swap and configure encryption.' },
    { id: 'file-systems', title: 'Create and configure file systems', official: 'Create, mount, unmount, and use XFS and ext4 file systems; configure automount and persistent mounts; diagnose and repair file-system problems.' },
    { id: 'deploy', title: 'Deploy, configure, and maintain systems', official: 'Schedule tasks, start and stop services, configure a boot target, manage software with DNF, configure repositories, and manage systemd units.' },
    { id: 'networking', title: 'Manage basic networking', official: 'Configure IPv4 and IPv6 addresses, hostnames, name resolution, and firewall rules; troubleshoot network connectivity.' },
    { id: 'users-groups', title: 'Manage users and groups', official: 'Create, delete, and modify local user accounts and groups; manage password aging and sudo access.' },
    { id: 'security', title: 'Manage security', official: 'Configure firewall settings, manage SELinux modes and contexts, and configure key-based SSH authentication.' }
  ],

  certifications: [
    {
      code: 'EX200',
      name: 'RHCSA',
      range: 'Levels 01–02',
      desc: 'The hands-on system administration baseline. Everything in Foundations is deliberately aligned with its habits and objectives.',
      topics: ['Shell & files', 'Users & permissions', 'Storage & networking', 'Services & boot', 'Containers & security']
    },
    {
      code: 'EX294',
      name: 'RHCE',
      range: 'Levels 03–04',
      desc: 'The automation credential. The Administrator and Automation levels build toward writing and operating Ansible at scale.',
      topics: ['Ansible roles', 'Templates & handlers', 'System roles', 'Idempotency', 'Git workflow']
    },
    {
      code: 'RHCA',
      name: 'Architect',
      range: 'Level 05 + specialists',
      desc: 'A specialist track, not a single exam. Production-level depth in availability, identity, observability, and platform design.',
      topics: ['High availability', 'Identity', 'Performance', 'Security', 'Platform design']
    }
  ]
};

RHEL.modules = RHEL.levels[0].modules;
RHEL.liveLevels = RHEL.levels.filter(function (level) { return level.status === 'live'; });
RHEL.allModules = RHEL.liveLevels.reduce(function (list, level) {
  level.modules.forEach(function (module) {
    module.level = level.id;
    list.push(module);
  });
  return list;
}, []);
RHEL.modulesById = {};
RHEL.allModules.forEach(function (module) { RHEL.modulesById[module.id] = module; });
RHEL.lessons = {};
RHEL.lessonOrder = RHEL.allModules.reduce(function (ids, module) { return ids.concat(module.lessons); }, []);

RHEL.getLesson = function (id) {
  return RHEL.lessons[id] || null;
};

RHEL.getModule = function (id) {
  return RHEL.modulesById[id] || (RHEL.modules.find(function (m) { return m.id === id; })) || null;
};

RHEL.getLevel = function (id) {
  return RHEL.levels.find(function (level) { return level.id === id; }) || null;
};

RHEL.getLessonLevel = function (id) {
  var lesson = RHEL.lessons[id];
  var module = lesson ? RHEL.getModule(lesson.module) : null;
  return module && module.level ? RHEL.getLevel(module.level) : null;
};

RHEL.getLessonNumber = function (id) {
  return RHEL.lessonOrder.indexOf(id) + 1;
};

RHEL.getNextLesson = function (id) {
  var i = RHEL.lessonOrder.indexOf(id);
  return i >= 0 && i < RHEL.lessonOrder.length - 1 ? RHEL.lessons[RHEL.lessonOrder[i + 1]] : null;
};

RHEL.getPrevLesson = function (id) {
  var i = RHEL.lessonOrder.indexOf(id);
  return i > 0 ? RHEL.lessons[RHEL.lessonOrder[i - 1]] : null;
};
