"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketCounterRepository = void 0;
class TicketCounterRepository {
    constructor(db) {
        this.db = db;
    }
    getLastSequence(facilityCode) {
        const statement = this.db.prepare(`
				SELECT last_sequence
				FROM ticket_counters
				WHERE facility_code = ?
			`);
        const row = statement.get(facilityCode);
        return row?.last_sequence ?? 0;
    }
    setLastSequence(facilityCode, lastSequence) {
        if (lastSequence < 0) {
            throw new Error("lastSequence must be greater than or equal to 0");
        }
        const updatedAt = new Date().toISOString();
        const upsertStatement = this.db.prepare(`
				INSERT INTO ticket_counters (facility_code, last_sequence, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(facility_code)
				DO UPDATE SET
					last_sequence = excluded.last_sequence,
					updated_at = excluded.updated_at
			`);
        upsertStatement.run(facilityCode, lastSequence, updatedAt);
    }
    allocateRange(facilityCode, totalUnits) {
        if (totalUnits < 1) {
            throw new Error("totalUnits must be at least 1");
        }
        const lastSequence = this.getLastSequence(facilityCode);
        const startNo = lastSequence + 1;
        const endNo = lastSequence + totalUnits;
        const updatedAt = new Date().toISOString();
        const upsertStatement = this.db.prepare(`
				INSERT INTO ticket_counters (facility_code, last_sequence, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(facility_code)
				DO UPDATE SET
					last_sequence = excluded.last_sequence,
					updated_at = excluded.updated_at
			`);
        upsertStatement.run(facilityCode, endNo, updatedAt);
        return {
            facilityCode,
            startNo,
            endNo,
            totalAllocated: totalUnits,
        };
    }
    getAllCounters() {
        const statement = this.db.prepare(`
				SELECT *
				FROM ticket_counters
				ORDER BY facility_code ASC
			`);
        return statement.all();
    }
}
exports.TicketCounterRepository = TicketCounterRepository;
