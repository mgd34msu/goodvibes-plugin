/**
 * F9 fixture: a minimal server that installs the real process-hygiene watchdog
 * and then stays alive via a keepalive timer (emulating an active MCP transport
 * holding the event loop open). Bundled by the proc test and spawned as a
 * detached child so that killing its parent exercises the ppid reparent path.
 *
 * stdin is deliberately not watched here so that ONLY the ppid poll can end the
 * process — the test is verifying the reparent watchdog, not stdin close.
 */

import { installProcessHygiene } from '../../proc/index.js';

const ppidPollMs = Number(process.env.PPID_POLL_MS ?? '1000');

installProcessHygiene({
  ppidPollMs,
  watchStdin: false,
  watchSignals: true,
});

// Keepalive: a ref'd timer so the process does not exit on its own. The hygiene
// watchdog (unref'd) will call process.exit when the parent dies.
setInterval(() => {}, 1 << 30);

process.stdout.write(`ready ${process.pid}\n`);
