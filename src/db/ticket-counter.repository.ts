import { FacilityCode } from "../config/facilities";

type SqlStatement<TRow = unknown> = {
	get(...params: unknown[]): TRow | undefined;
	run(...params: unknown[]): unknown;
};

type SqliteDatabase = {
	prepare(sql: string): SqlStatement;
};

export type TicketRangeAllocation = {
	facilityCode: FacilityCode;
	startNo: number;
	endNo: number;
	totalAllocated: number;
};

export class TicketCounterRepository {
	constructor(private readonly db: SqliteDatabase) {}

	getLastSequence(facilityCode: FacilityCode): number {
		const statement = this.db.prepare(
			`
				SELECT last_sequence
				FROM ticket_counters
				WHERE facility_code = ?
			`
		);

		const row = statement.get(facilityCode) as { last_sequence?: number } | undefined;
		return row?.last_sequence ?? 0;
	}

	setLastSequence(facilityCode: FacilityCode, lastSequence: number): void {
		if (lastSequence < 0) {
			throw new Error("lastSequence must be greater than or equal to 0");
		}

		const updatedAt = new Date().toISOString();
		const upsertStatement = this.db.prepare(
			`
				INSERT INTO ticket_counters (facility_code, last_sequence, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(facility_code)
				DO UPDATE SET
					last_sequence = excluded.last_sequence,
					updated_at = excluded.updated_at
			`
		);

		upsertStatement.run(facilityCode, lastSequence, updatedAt);
	}

	allocateRange(
		facilityCode: FacilityCode,
		totalUnits: number
	): TicketRangeAllocation {
		if (totalUnits < 1) {
			throw new Error("totalUnits must be at least 1");
		}

		const lastSequence = this.getLastSequence(facilityCode);
		const startNo = lastSequence + 1;
		const endNo = lastSequence + totalUnits;
		const updatedAt = new Date().toISOString();

		const upsertStatement = this.db.prepare(
			`
				INSERT INTO ticket_counters (facility_code, last_sequence, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(facility_code)
				DO UPDATE SET
					last_sequence = excluded.last_sequence,
					updated_at = excluded.updated_at
			`
		);

		upsertStatement.run(facilityCode, endNo, updatedAt);

		return {
			facilityCode,
			startNo,
			endNo,
			totalAllocated: totalUnits,
		};
	}

	getAllCounters() {
		const statement = this.db.prepare(
			`
				SELECT *
				FROM ticket_counters
				ORDER BY facility_code ASC
			`
		) as SqlStatement & { all(...params: unknown[]): unknown[] };

		return statement.all();
	}
}
