import {requireValue} from './problem.mjs';

export const CHAT_RESERVE = 1_000_000;
export const VOICE_RESERVE = 30_000;
export const MONTHLY_USD = 30;
export const RATES = Object.freeze({input:2,cached:0.10,output:10});

// These HTTP rejections occur before generation. Server/network failures can
// leave usage unknown and must retain their reservation until reconciled.
export function isUnbilledRejection(status) {
  return [400,401,403,404,413,415,422,429].includes(status);
}

export function monthWindow(now=Date.now()) {
  const date=new Date(now);
  return {since:Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1),until:Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)};
}

// Anonymous monetary records survive chat/account deletion and the 30-day content retention.
export function setupBudget(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS cost_ledger (
    id TEXT PRIMARY KEY, cost_micros INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cost_ledger_date ON cost_ledger(created_at);
  CREATE TRIGGER IF NOT EXISTS budget_attempt_insert AFTER INSERT ON attempts BEGIN
    INSERT INTO cost_ledger VALUES('chat:'||NEW.id,NEW.cost_micros,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS budget_attempt_update AFTER UPDATE OF cost_micros ON attempts BEGIN
    INSERT INTO cost_ledger VALUES('chat:'||NEW.id,NEW.cost_micros,NEW.created_at)
    ON CONFLICT(id) DO UPDATE SET cost_micros=excluded.cost_micros;
  END;
  CREATE TRIGGER IF NOT EXISTS budget_voice_insert AFTER INSERT ON voice_requests BEGIN
    INSERT INTO cost_ledger VALUES('voice:'||NEW.id,NEW.cost_micros,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS budget_voice_update AFTER UPDATE OF cost_micros ON voice_requests BEGIN
    INSERT INTO cost_ledger VALUES('voice:'||NEW.id,NEW.cost_micros,NEW.created_at)
    ON CONFLICT(id) DO UPDATE SET cost_micros=excluded.cost_micros;
  END;
  INSERT OR IGNORE INTO cost_ledger SELECT 'chat:'||id,cost_micros,created_at FROM attempts;
  INSERT OR IGNORE INTO cost_ledger SELECT 'voice:'||id,cost_micros,created_at FROM voice_requests;`);
  return {
    summary(now=Date.now()) {
      const {since,until}=monthWindow(now);
      store.run('DELETE FROM cost_ledger WHERE created_at<?',since);
      const totals=store.get("SELECT coalesce(sum(cost_micros),0) costMicros,count(CASE WHEN id LIKE 'chat:%' THEN 1 END) attempts,count(CASE WHEN id LIKE 'voice:%' THEN 1 END) voiceAttempts FROM cost_ledger WHERE created_at>=? AND created_at<?",since,until);
      return {...totals,since,until,remainingMicros:Math.max(0,MONTHLY_USD*1_000_000-totals.costMicros),monthlyUsd:MONTHLY_USD};
    },
    check(reserve) {
      requireValue(this.summary().remainingMicros>=reserve,'Das gemeinsame Monatsbudget für den Test ist aufgebraucht oder für laufende Anfragen reserviert. Bitte gib Adrien Bescheid. Zum nächsten Monat wird es erneuert.',429);
    }
  };
}
