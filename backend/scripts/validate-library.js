import { loadLibrary } from '../src/library.js';
import { validateLibrary } from '../src/validate.js';

const { errors, warnings } = validateLibrary(loadLibrary());
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nLibrary OK');
process.exit(errors.length ? 1 : 0);
