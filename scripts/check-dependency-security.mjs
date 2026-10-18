import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const policyPath = fileURLToPath(new URL('../security/dependency-exceptions.json', import.meta.url));
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
if (policy.version !== 1 || !Array.isArray(policy.exceptions)) {
  throw new Error('Invalid dependency exception policy');
}

const today = new Date().toISOString().slice(0, 10);
const nodeDir = dirname(process.execPath);
const npmCli = [
  process.env.npm_execpath,
  resolve(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
  resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
].find((path) => path && existsSync(path));
if (!npmCli) throw new Error('Could not locate the installed npm CLI');
const audited = (scope, extraArgs) => {
  const command = spawnSync(process.execPath, [npmCli, 'audit', '--json', '--package-lock-only', ...extraArgs], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (command.error) throw command.error;
  let result;
  try { result = JSON.parse(command.stdout); } catch {
    throw new Error(`${scope} audit did not return JSON (exit ${command.status}): ${command.stderr.trim()}`);
  }
  if (result.error || !result.vulnerabilities || !result.metadata?.vulnerabilities) {
    throw new Error(`${scope} audit failed: ${result.error?.summary || 'incomplete audit response'}`);
  }
  if (command.status !== 0 && command.status !== 1) {
    throw new Error(`${scope} audit exited unexpectedly with status ${command.status}`);
  }
  const reported = result.metadata.vulnerabilities;
  for (const severity of ['critical', 'high', 'moderate']) {
    const observed = Object.values(result.vulnerabilities)
      .filter((finding) => finding.severity === severity).length;
    if (reported[severity] !== observed) {
      throw new Error(`${scope} audit count mismatch for ${severity}`);
    }
  }
  return result;
};

const viaIdentity = (entry) => typeof entry === 'string'
  ? `package:${entry}` : `advisory:${entry.url}`;

const approvedException = (name, finding, scope) => {
  const actualVia = finding.via.map(viaIdentity).sort();
  return policy.exceptions.some((entry) =>
    entry.package === name && entry.scope === scope && entry.severity === 'moderate' &&
    entry.decision === 'approved' && typeof entry.approvedBy === 'string' &&
    entry.approvedBy.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(entry.approvedOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn) &&
    entry.approvedOn <= today && today <= entry.expiresOn &&
    Array.isArray(entry.via) && JSON.stringify([...entry.via].sort()) === JSON.stringify(actualVia)
  );
};

const problems = [];
const productionNames = new Set();
for (const [scope, args] of [['production', ['--omit=dev']], ['full', []]]) {
  const result = audited(scope, args);
  const counts = result.metadata.vulnerabilities;
  console.log(`${scope} audit: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate`);
  for (const [name, finding] of Object.entries(result.vulnerabilities)) {
    if (scope === 'production') productionNames.add(name);
    const exceptionScope = scope === 'full' && productionNames.has(name) ? 'production' : scope;
    if (finding.severity === 'high' || finding.severity === 'critical') {
      problems.push(`${scope}: ${name} ${finding.severity}`);
    } else if (finding.severity === 'moderate' && !approvedException(name, finding, exceptionScope)) {
      problems.push(`${scope}: ${name} moderate (no current owner-approved exception)`);
    }
  }
}

if (problems.length) {
  console.error('Dependency release gate failed:\n' + problems.map((item) => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Dependency release gate passed.');
}
