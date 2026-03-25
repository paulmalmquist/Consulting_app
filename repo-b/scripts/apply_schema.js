const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEFAULT_SQL_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

const args = process.argv.slice(2);
const options = {
  dryRun: false,
  singleTransaction: true,
  verbose: false,
  sqlPath: DEFAULT_SQL_PATH,
};

for (const arg of args) {
  if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--single-transaction') {
    options.singleTransaction = true;
  } else if (arg === '--no-single-transaction') {
    options.singleTransaction = false;
  } else if (arg.startsWith('--single-transaction=')) {
    const value = arg.split('=')[1];
    options.singleTransaction = value !== 'false';
  } else if (arg.startsWith('--sql=')) {
    options.sqlPath = path.resolve(process.cwd(), arg.split('=')[1]);
  } else if (arg.startsWith('--sql-path=')) {
    options.sqlPath = path.resolve(process.cwd(), arg.split('=')[1]);
  }
}

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
    if (trimmed) {
      statements.push(trimmed);
    }
    buffer = '';
  };

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buffer += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      buffer += char;
      if (char === '*' && next === '/') {
        buffer += next;
        i += 1;
        inBlockComment = false;
      }
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
      if (char === '-' && next === '-') {
        buffer += char + next;
        i += 1;
        inLineComment = true;
        continue;
      }
      if (char === '/' && next === '*') {
        buffer += char + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
      if (char === '$') {
        const rest = sql.slice(i);
        const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
        if (match) {
          dollarTag = match[0];
          buffer += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      }
    }

    if (char === '\'' && !inDouble) {
      buffer += char;
      if (inSingle && next === '\'') {
        buffer += next;
        i += 1;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }

    if (char === '"' && !inSingle) {
      buffer += char;
      if (inDouble && next === '"') {
        buffer += next;
        i += 1;
      } else {
        inDouble = !inDouble;
      }
      continue;
    }

    if (char === ';' && !inSingle && !inDouble) {
      flush();
      continue;
    }

    buffer += char;
  }

  flush();
  return statements;
}

function excerpt(statement, length = 120) {
  const compact = statement.replace(/\s+/g, ' ').trim();
  if (compact.length <= length) {
    return compact;
  }
  return `${compact.slice(0, length)}...`;
}

function formatErrorContext(statement, position) {
  if (!position) {
    return null;
  }
  const index = Number(position) - 1;
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }
  const lines = statement.split(/\r?\n/);
  let offset = 0;
  let lineNumber = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const lineLength = lines[i].length + 1;
    if (offset + lineLength > index) {
      lineNumber = i;
      break;
    }
    offset += lineLength;
  }
  const start = Math.max(0, lineNumber - 2);
  const end = Math.min(lines.length - 1, lineNumber + 2);
  const context = [];
  for (let i = start; i <= end; i += 1) {
    const pointer = i === lineNumber ? '>' : ' ';
    context.push(`${pointer} ${String(i + 1).padStart(3, ' ')} | ${lines[i]}`);
  }
  return context.join('\n');
}

async function main() {
  const sql = fs.readFileSync(options.sqlPath, 'utf8');
  const statements = splitSql(sql);

  console.log(`Found ${statements.length} statements in ${options.sqlPath}.`);

  statements.forEach((statement, index) => {
    if (options.verbose || options.dryRun) {
      console.log(`\n[${index + 1}] ${statement}`);
    } else {
      console.log(`[${index + 1}] ${excerpt(statement)}`);
    }
  });

  if (options.dryRun) {
    console.log('\nDry run complete.');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL or SUPABASE_DB_URL must be set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (options.singleTransaction) {
      await client.query('BEGIN');
    }

    for (let i = 0; i < statements.length; i += 1) {
      const statement = statements[i];
      try {
        await client.query(statement);
      } catch (error) {
        const context = formatErrorContext(statement, error.position);
        console.error(`\nFailed on statement ${i + 1}:`);
        console.error(statement);
        console.error(`\nMessage: ${error.message}`);
        if (error.code) {
          console.error(`SQLSTATE: ${error.code}`);
        }
        if (error.detail) {
          console.error(`Detail: ${error.detail}`);
        }
        if (error.hint) {
          console.error(`Hint: ${error.hint}`);
        }
        if (error.position) {
          console.error(`Position: ${error.position}`);
        }
        if (context) {
          console.error('\nContext:\n' + context);
        }
        if (options.singleTransaction) {
          await client.query('ROLLBACK');
        }
        process.exit(1);
      }
    }

    if (options.singleTransaction) {
      await client.query('COMMIT');
    }

    console.log('\nSchema applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
