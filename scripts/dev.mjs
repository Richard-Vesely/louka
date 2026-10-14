// `npm run dev`: starts the game client (Vite) and, once it exists, the game server.
// Plain child_process, no extra dependency. Ctrl+C stops everything.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const jobs = [['client', ['run', 'dev', '-w', 'client']]];
if (fs.existsSync('server/package.json')) jobs.push(['server', ['run', 'dev', '-w', 'server']]);

const children = jobs.map(([name, args]) => {
  // Windows needs a shell to find npm.cmd; give it one command string (args are our own constants).
  const child = process.platform === 'win32'
    ? spawn(`npm ${args.join(' ')}`, { stdio: ['inherit', 'pipe', 'pipe'], shell: true })
    : spawn('npm', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  const prefix = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => { console.log(`[${name}] exited (${code})`); stopAll(code ?? 0); });
  return child;
});

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
