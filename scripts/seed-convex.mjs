// Seeds the Convex `tasks` table from library/tasks/*.json after validating each task.
// Usage: npm run convex:seed                  -> seeds the demo task (whatsapp-photos)
//        npm run convex:seed -- --all         -> seeds every task in library/index.json
//        npm run convex:seed -- --prod        -> targets the production deployment
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateTask, fromLibraryFile } from '../convex/lib/taskValidation.js';

const args = process.argv.slice(2);
const index = JSON.parse(readFileSync('library/index.json', 'utf8'));
const ids = args.includes('--all') ? index.tasks : ['whatsapp-photos'];

let failed = false;
for (const id of ids) {
  const task = fromLibraryFile(JSON.parse(readFileSync(`library/tasks/${id}.json`, 'utf8')));
  const problems = validateTask(task);
  if (problems.length) {
    failed = true;
    console.error(`✗ ${id}\n  ${problems.join('\n  ')}`);
    continue;
  }
  const cli = ['convex', 'run', ...(args.includes('--prod') ? ['--prod'] : []), 'tasks:seed', JSON.stringify({ task })];
  const out = execFileSync('npx', cli, { encoding: 'utf8' });
  console.log(`✓ ${id}: ${out.trim()}`);
}
process.exit(failed ? 1 : 0);
