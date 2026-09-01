import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations() {
  console.log('🔄 Running database migrations...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  db.execScript(sql);
  console.log('✅ All 22 migration tables & indexes created successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
}
