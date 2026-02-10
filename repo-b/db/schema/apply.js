/**
 * apply.js — Schema applicator for Business OS backbone.
 *
 * Reads all *.sql files in db/schema/ in numeric filename order,
 * concatenates them, and executes against the database.
 *
 * Supports:
 *   --dry-run     Parse and print statements without executing
 *   --verbose     Show full SQL for each statement
 *   --no-single-transaction   Run each statement independently
 *
 * Env: DATABASE_URL or SUPABASE_DB_URL
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SCHEMA_DIR = path.resolve(__dirname);

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  singleTransaction: !args.includes('--no-single-transaction'),
};

/**
 * Split SQL into individual statements, respecting string literals,
 * dollar-quoted blocks, and comments.
 */
function splitSql(sql) {
  const statements = [];
  let buffer = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) statements.push(trimmed);
    buffer = '';
  };

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buffer += char;
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      buffer += char;
      if (char === '*' && next === '/') { buffer += next; i++; inBlockComment = false; }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buffer += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        buffer += char;
      }
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === '-' && next === '-') { buffer += char + next; i++; inLineComment = true; continue; }
      if (char === '/' && next === '*') { buffer += char + next; i++; inBlockComment = true; continue; }
      if (char === '$') {
        const rest = sql.slice(i);
        const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
        if (match) { dollarTag = match[0]; buffer += dollarTag; i += dollarTag.length - 1; continue; }
      }
    }
    if (char === '\'' && !inDouble) {
      buffer += char;
      if (inSingle && next === '\'') { buffer += next; i++; } else { inSingle = !inSingle; }
      continue;
    }
    if (char === '"' && !inSingle) {
      buffer += char;
      if (inDouble && next === '"') { buffer += next; i++; } else { inDouble = !inDouble; }
      continue;
    }
    if (char === ';' && !inSingle && !inDouble) { flush(); continue; }
    buffer += char;
  }
  flush();
  return statements;
}

function excerpt(statement, length = 120) {
  const compact = statement.replace(/\s+/g, ' ').trim();
  return compact.length <= length ? compact : compact.slice(0, length) + '...';
}

async function main() {
  // Collect SQL files in numeric order
  const files = fs.readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error('No .sql files found in', SCHEMA_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} SQL files in ${SCHEMA_DIR}:`);
  files.forEach(f => console.log(`  ${f}`));
  console.log('');

  // Concatenate all SQL
  let allSql = '';
  for (const file of files) {
    const content = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
    allSql += `\n-- === FILE: ${file} ===\n${content}\n`;
  }

  const statements = splitSql(allSql);
  console.log(`Total: ${statements.length} statements.\n`);

  if (options.dryRun || options.verbose) {
    statements.forEach((stmt, i) => {
      if (options.verbose || options.dryRun) {
        console.log(`[${i + 1}] ${stmt}\n`);
      } else {
        console.log(`[${i + 1}] ${excerpt(stmt)}`);
      }
    });
  } else {
    statements.forEach((stmt, i) => {
      console.log(`[${i + 1}] ${excerpt(stmt)}`);
    });
  }

  if (options.dryRun) {
    console.log('\nDry run complete. No statements executed.');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('\nERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  console.log('\nConnected to database. Applying schema...\n');

  try {
    if (options.singleTransaction) await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
        // Progress indicator every 50 statements
        if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${statements.length} applied`);
      } catch (error) {
        console.error(`\nFAILED on statement ${i + 1}:`);
        console.error(stmt.slice(0, 500));
        console.error(`\nError: ${error.message}`);
        if (error.code) console.error(`SQLSTATE: ${error.code}`);
        if (error.detail) console.error(`Detail: ${error.detail}`);
        if (error.hint) console.error(`Hint: ${error.hint}`);
        if (options.singleTransaction) await client.query('ROLLBACK');
        process.exit(1);
      }
    }

    if (options.singleTransaction) await client.query('COMMIT');
    console.log(`\nSchema applied successfully. ${statements.length} statements executed.`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
