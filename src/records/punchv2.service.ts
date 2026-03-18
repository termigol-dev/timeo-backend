import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    RecordType,
    IncidentType,
    IncidentBy,
} from '@prisma/client';

@Injectable()
export class Punch2Service {

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    /* ======================================================
     🧪 SIMULADOR (NO GUARDA EN BD)
    ====================================================== */

    async simulateDay(body: {
        userId: string;
        companyId: string;
        branchId: string;
        date: string;
        inTime?: string | null;
        outTime?: string | null;
    }) {
        console.log("USANDO PUNCH V2");
        const { userId, companyId, branchId, date, inTime, outTime } = body;

        const results: any[] = [];

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

        for (const event of events) {

            const incidentType = await this.evaluateSchedule({
                userId,
                branchId,
                date: event.createdAt,
                type: event.type,
            });

            results.push({
                event,
                incidentType,
            });
        }

        return {
            simulatedEvents: results,
        };
    }

    /* ======================================================
     🔥 PUNCH REAL
    ====================================================== */

    async punch(params: {
        userId: string;
        companyId: string;
        branchId: string;
        type: RecordType;
        createdBy: 'TABLET' | 'MOBILE';
    }) {

        const { userId, companyId, branchId, type } = params;

        const membership = await this.getActiveMembership(
            userId,
            companyId,
            branchId,
        );

        const lastRecord = await this.getLastRecord(membership.id);

        if (type === RecordType.IN && lastRecord?.type === RecordType.IN) {
            throw new BadRequestException('Already IN');
        }

        if (type === RecordType.OUT && (!lastRecord || lastRecord.type === RecordType.OUT)) {
            throw new BadRequestException('No active IN');
        }

        // 📝 1. CREAR RECORD
        const record = await this.createRecord({
            type,
            userId,
            companyId,
            branchId,
            membershipId: membership.id,
        });

        // 🧠 2. EVALUAR
        const incidentType = await this.evaluateSchedule({
            userId,
            branchId,
            date: record.createdAt,
            type,
        });

        // 🎯 3. CREAR INCIDENCIA
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
     🧠 EVALUACIÓN NUEVA (SIN INTERMEDIOS)
    ====================================================== */

    private async evaluateSchedule({
        userId,
        branchId,
        date,
        type,
    }: {
        userId: string;
        branchId: string;
        date: Date;
        type: RecordType;
    }): Promise<IncidentType | null> {

        const weekday = date.getDay() === 0 ? 7 : date.getDay();

        const schedule = await this.prisma.schedule.findFirst({
            where: {
                userId,
                branchId,
                validFrom: { lte: date },
                OR: [{ validTo: null }, { validTo: { gte: date } }],
            },
            include: { shifts: true },
        });

        // 🕐 ajuste España
        const localDate = new Date(date.getTime() + 60 * 60 * 1000);
        const nowMinutes = localDate.getHours() * 60 + localDate.getMinutes();

        // ❌ SIN HORARIO
        if (!schedule) {
            return type === RecordType.IN
                ? IncidentType.IN_EARLY
                : IncidentType.OUT_LATE;
        }

        const shiftsOfDay = schedule.shifts.filter(
            s => s.weekday === weekday,
        );

        const shiftsToUse = shiftsOfDay.length > 0
            ? shiftsOfDay
            : schedule.shifts; // 👈 fallback a TODOS los turnos

        const enriched = shiftsToUse.map(s => ({
            ...s,
            startMinutes: this.timeToMinutes(s.startTime),
            endMinutes: this.timeToMinutes(s.endTime),
        }));

        // 🔥 TURNO ACTIVO
        const activeShift = enriched.find(
            s => nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes
        );

        /* ============================
           🟦 IN
        ============================ */
        if (type === RecordType.IN) {

            let targetShift;

            if (activeShift) {
                targetShift = activeShift;
            } else {
                targetShift = enriched
                    .map(s => ({
                        shift: s,
                        diff: Math.abs(nowMinutes - s.startMinutes),
                    }))
                    .sort((a, b) => a.diff - b.diff)[0].shift;
            }

            const diff = nowMinutes - targetShift.startMinutes;

            if (diff < -15) return IncidentType.IN_EARLY;
            if (diff > 15) return IncidentType.IN_LATE;

            return null;
        }

        /* ============================
           🟥 OUT
        ============================ */
        if (type === RecordType.OUT) {

            let targetShift;

            if (activeShift) {
                targetShift = activeShift;
            } else {
                targetShift = enriched
                    .map(s => ({
                        shift: s,
                        diff: Math.abs(nowMinutes - s.endMinutes),
                    }))
                    .sort((a, b) => a.diff - b.diff)[0].shift;
            }

            const diff = nowMinutes - targetShift.endMinutes;

            if (diff < -15) return IncidentType.OUT_EARLY;
            if (diff > 15) return IncidentType.OUT_LATE;

            return null;
        }

        return null;
    }

    /* ====================================================== */

    private timeToMinutes(time: string) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    private buildLocalDate(date: string, time: string) {
        const [year, month, day] = date.split('-').map(Number);
        const [h, m] = time.split(':').map(Number);
        return new Date(year, month - 1, day, h, m, 0, 0);
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