import { DatabaseSync } from 'node:sqlite';

// Exercise the production SQL, including conditional UPDATEs, on real SQLite.
// Yield around each statement so independent HTTP handlers can read the same
// version before attempting their writes; a plain synchronous mock hides races.
export function createSqliteD1(filename) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  let afterRead = null;
  const stats = { casConflicts: 0 };
  const tick = () => new Promise(resolve => setImmediate(resolve));

  function statement(sql, values = []) {
    const execute = async mode => {
      await tick();
      const query = sqlite.prepare(sql);
      let result;
      if (mode === 'run') {
        const written = query.run(...values);
        result = { success: true, meta: {
          changes: Number(written.changes), last_row_id: Number(written.lastInsertRowid),
        }, results: [] };
        if (/UPDATE\s+auction_rooms/i.test(sql) && /storage_version\s*=/i.test(sql) && !result.meta.changes) stats.casConflicts++;
      } else {
        const rows = query.all(...values).map(row => ({ ...row }));
        result = mode === 'first' ? (rows[0] ?? null) : { success: true, results: rows, meta: {} };
        if (afterRead) await afterRead(sql, values, result);
      }
      await tick();
      return result;
    };
    return {
      bind(...bound) { return statement(sql, bound); },
      async first(column) {
        const row = await execute('first');
        return column && row ? row[column] : row;
      },
      all() { return execute('all'); },
      run() { return execute('run'); },
      _executeSync() {
        const query = sqlite.prepare(sql);
        const written = query.run(...values);
        return { success: true, meta: { changes: Number(written.changes), last_row_id: Number(written.lastInsertRowid) }, results: [] };
      },
    };
  }

  return {
    prepare: statement,
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; },
    async batch(statements) {
      await tick();
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(query => query._executeSync());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    // Pause after both callers have already read snapshots, forcing a CAS retry.
    barrierRoomReads(code, count = 2) {
      let arrived = 0, release;
      const gate = new Promise(resolve => { release = resolve; });
      afterRead = async (sql, values, result) => {
        const row = result?.results?.[0] ?? result;
        if (!/FROM\s+auction_rooms/i.test(sql) || !values.includes(code) || !row?.record_json || arrived >= count) return;
        arrived++;
        if (arrived === count) { afterRead = null; release(); }
        await gate;
      };
      return () => { afterRead = null; release(); };
    },
    stats,
    close() { sqlite.close(); },
  };
}
