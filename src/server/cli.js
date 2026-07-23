import { createImportPreview, confirmImport } from './services.js';

const [, , command, filePath, modeFlag] = process.argv;

if (command !== 'import' || !filePath) {
  console.error('Usage: npm run import:projects -- <csv-path> [--full|--incremental]');
  process.exit(1);
}

const mode = modeFlag === '--full' ? 'full' : 'incremental';
const preview = await createImportPreview({ filePath, mode });
if (preview.errors.length) {
  console.error(JSON.stringify({ success: false, errors: preview.errors, warnings: preview.warnings }, null, 2));
  process.exit(1);
}

const confirmed = await confirmImport(preview.id);
const { projects, ...counts } = confirmed.summary;
console.log(JSON.stringify({ success: true, mode, ...counts, warnings: preview.warnings.length }, null, 2));
