import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    RecordType,
    IncidentType,
    IncidentBy,
} from '@prisma/client';

@Injectable()
export class Punch2Service {

    constructor(private readonly prisma: PrismaService) { }

    /* ======================================================
     🧪 SIMULADOR (CON MEMORIA)
    ====================================================== */

    async simulateDay(body: {
        userId: string;
        companyId: string;
        branchId: string;
        date: string;
        inTime?: string | null;
        outTime?: string | null;
    }) {

        console.log("🧪 USANDO PV2 CLEAN");

        const { userId, branchId, date, inTime, outTime } = body;

        const events: { type: RecordType; createdAt: Date }[] = [];

        if (inTime) {
            events.push({
                type: RecordType.IN,
                createdAt: this.buildLocalDate(date, inTime),
            });
        }

        if (outTime) {
            events.push({
                type: RecordType.OUT,
                createdAt: this.buildLocalDate(date, outTime),
            });
        }

        let lastSimulatedIn: Date | null = null;

        const results = [];

        for (const event of events) {

            let incidentType;

            if (event.type === RecordType.IN) {

                lastSimulatedIn = event.createdAt;

                incidentType = await this.evaluateSchedule({
                    userId,
                    branchId,
                    date: event.createdAt,
                    type: RecordType.IN,
                });

            } else {

                incidentType = await this.evaluateSchedule({
                    userId,
                    branchId,
                    date: event.createdAt,
                    type: RecordType.OUT,
                    simulatedLastIn: lastSimulatedIn,
                });

            }

            results.push({
                event,
                incidentType,
            });
        }

        return { simulatedEvents: results };
    }

    /* ======================================================
     🔥 PUNCH REAL (SIN CAMBIOS)
    ====================================================== */

    async punch(params: {
        userId: string;
        companyId: string;
        branchId: string;
        type: RecordType;
        createdBy: 'TABLET' | 'MOBILE';
    }) {

        const { userId, companyId, branchId, type } = params;

        const membership = await this.getActiveMembership(userId, companyId, branchId);

        const lastRecord = await this.getLastRecord(membership.id);

        if (type === RecordType.IN && lastRecord?.type === RecordType.IN) {
            throw new BadRequestException('Already IN');
        }

        if (type === RecordType.OUT && (!lastRecord || lastRecord.type === RecordType.OUT)) {
            throw new BadRequestException('No active IN');
        }

        const record = await this.createRecord({
            type,
            userId,
            companyId,
            branchId,
            membershipId: membership.id,
        });

        const incidentType = await this.evaluateSchedule({
            userId,
            branchId,
            date: record.createdAt,
            type,
        });

        if (incidentType) {
            await this.prisma.incident.create({
                data: {
                    type: incidentType,
                    createdBy: IncidentBy.SYSTEM,
                    admitted: false,
                    userId,
                    membershipId: membership.id,
                    companyId,
                    branchId,
                    recordId: record.id,
                    occurredAt: record.createdAt,
                },
            });
        }

        return record;
    }

    /* ======================================================
     🧠 CORE — EVALUACIÓN
    ====================================================== */

    private async evaluateSchedule({
        userId,
        branchId,
        date,
        type,
        simulatedLastIn,
    }: {
        userId: string;
        branchId: string;
        date: Date;
        type: RecordType;
        simulatedLastIn?: Date | null;
    }): Promise<IncidentType | null> {

        console.log("🧠 EVALUATE PV2 CLEAN", { type, date: date.toISOString() });

        const schedule = await this.prisma.schedule.findFirst({
            where: {
                userId,
                branchId,
                validFrom: { lte: date },
                OR: [{ validTo: null }, { validTo: { gte: date } }],
            },
            include: { shifts: true },
        });

        if (!schedule || schedule.shifts.length === 0) {
            return type === RecordType.IN ? IncidentType.IN_EARLY : null;
        }

        const now = date.getTime();

        const shifts = schedule.shifts.map(s => {
            const shiftStart = this.buildShiftDate(date, s.weekday, s.startTime);
            const shiftEnd = this.buildShiftDate(date, s.weekday, s.endTime);

            return {
                ...s,
                start: shiftStart.getTime(),
                end: shiftEnd.getTime(),
            };
        });

        /* ============================
           🟦 IN
        ============================ */

        if (type === RecordType.IN) {

            const validShifts = shifts.filter(s => now <= s.end + 15 * 60 * 1000);

            const target = validShifts.length
                ? this.getClosestByStart(validShifts, now)
                : this.getNextShift(shifts, now);

            const diff = (now - target.start) / 60000;

            if (diff < -15) return IncidentType.IN_EARLY;
            if (diff > 15) return IncidentType.IN_LATE;

            return null;
        }

        /* ============================
           🟥 OUT
        ============================ */

        if (type === RecordType.OUT) {

            let lastInDate: Date | null = null;

            if (simulatedLastIn) {
                lastInDate = simulatedLastIn;
            } else {
                const lastIn = await this.prisma.record.findFirst({
                    where: {
                        userId,
                        branchId,
                        type: RecordType.IN,
                        createdAt: { lte: date },
                    },
                    orderBy: { createdAt: 'desc' },
                });

                lastInDate = lastIn?.createdAt || null;
            }

            if (!lastInDate) return null;

            const now = date.getTime();
            const inTime = lastInDate.getTime();

            /* ======================================================
               🧠 TURNO DEL IN (turno anterior)
            ====================================================== */

            const validShiftsForIn = shifts.filter(s => inTime <= s.end + 15 * 60 * 1000);

            const previousShift = validShiftsForIn.length
                ? this.getClosestByStart(validShiftsForIn, inTime)
                : this.getNextShift(shifts, inTime);

            if (!previousShift) return null;

            // ❗ OUT antes de start → null
            if (now < previousShift.start) return null;

            /* ======================================================
               🧠 TURNO ACTUAL (posible segundo turno)
            ====================================================== */

            const validCurrentShifts = shifts.filter(s => now <= s.end + 15 * 60 * 1000);

            const currentShift = validCurrentShifts.length
                ? this.getClosestByStart(validCurrentShifts, now)
                : null;

            /* ======================================================
               🧠 DECISIÓN DE TURNO (flujo normal vs roto)
            ====================================================== */

            let targetShift = previousShift;
            let isBrokenFlow = false;

            if (currentShift && currentShift.start !== previousShift.start) {

                const distPrev = Math.abs(now - previousShift.end);
                const distCurr = Math.abs(now - currentShift.end);

                const afterStartPlus15 = now >= currentShift.start + 15 * 60 * 1000;

                // 🔥 TU REGLA EXACTA
                if (afterStartPlus15) {
                    // 👉 después de +15 manda el turno actual SIEMPRE
                    targetShift = currentShift;
                    isBrokenFlow = true;
                } else {
                    // 👉 antes de +15 decidimos por proximidad
                    if (distCurr < distPrev) {
                        targetShift = currentShift;
                        isBrokenFlow = true;
                    } else {
                        targetShift = previousShift;
                    }
                }
            }

            /* ======================================================
               🎯 EVALUACIÓN FINAL (SIEMPRE contra END)
            ====================================================== */

            const diff = (now - targetShift.end) / 60000;

            // 💥 FORGOT OUT
            if (isBrokenFlow && diff >= -15 && diff < 15) {
                return IncidentType.FORGOT_OUT;
            }

            if (diff < -15) return IncidentType.OUT_EARLY;
            if (diff >= 15) return IncidentType.OUT_LATE;

            return null;
        }
        return null;
    }

    /* ====================================================== */

    private getClosestByStart(shifts, now) {
        return shifts.sort((a, b) =>
            Math.abs(now - a.start) - Math.abs(now - b.start)
        )[0];
    }

    private getClosestByEnd(shifts, now) {
        return shifts.sort((a, b) =>
            Math.abs(now - a.end) - Math.abs(now - b.end)
        )[0];
    }

    private getNextShift(shifts, now) {
        return shifts
            .filter(s => s.start > now)
            .sort((a, b) => a.start - b.start)[0];
    }

    private buildShiftDate(baseDate: Date, weekday: number, time: string) {
        const d = new Date(baseDate);
        const currentDay = d.getDay() === 0 ? 7 : d.getDay();
        let diff = weekday - currentDay;
        if (diff < 0) diff += 7;

        d.setDate(d.getDate() + diff);

        const [h, m] = time.split(':').map(Number);
        d.setHours(h, m, 0, 0);

        return d;
    }

    private buildLocalDate(date: string, time: string) {
        const [year, month, day] = date.split('-').map(Number);
        const [h, m] = time.split(':').map(Number);
        return new Date(year, month - 1, day, h, m);
    }

    private async getActiveMembership(userId: string, companyId: string, branchId: string) {
        const membership = await this.prisma.membership.findFirst({
            where: { userId, companyId, branchId, active: true },
        });

        if (!membership) {
            throw new BadRequestException('Usuario no pertenece a esta sucursal');
        }

        return membership;
    }

    private async getLastRecord(membershipId: string) {
        return this.prisma.record.findFirst({
            where: { membershipId },
            orderBy: { createdAt: 'desc' },
        });
    }

    private async createRecord(data: any) {
        return this.prisma.record.create({
            data: {
                type: data.type,
                user: { connect: { id: data.userId } },
                company: { connect: { id: data.companyId } },
                branch: { connect: { id: data.branchId } },
                membership: { connect: { id: data.membershipId } },
            },
        });
    }
}