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
     🧪 SIMULADOR
    ====================================================== */

    async simulateDay(body: {
        userId: string;
        companyId: string;
        branchId: string;
        date: string;
        inTime?: string | null;
        outTime?: string | null;
    }) {

        console.log("🧪 USANDO PUNCH V2");

        const { userId, branchId, date, inTime, outTime } = body;

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

        // 📝 CREAR RECORD
        const record = await this.createRecord({
            type,
            userId,
            companyId,
            branchId,
            membershipId: membership.id,
        });

        // 🧠 EVALUAR
        const incidentType = await this.evaluateSchedule({
            userId,
            branchId,
            date: record.createdAt,
            type,
        });

        // 🎯 CREAR INCIDENCIA
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
     🧠 EVALUACIÓN FINAL (IN + OUT CON CONTEXTO)
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

        console.log("🧠 EVALUATE V2 SUPER FINAL", { type, date: date.toISOString() });

        const schedule = await this.prisma.schedule.findFirst({
            where: {
                userId,
                branchId,
                validFrom: { lte: date },
                OR: [{ validTo: null }, { validTo: { gte: date } }],
            },
            include: { shifts: true },
        });

        // ⏱ tiempo continuo semanal
        const weekday = date.getDay() === 0 ? 7 : date.getDay();

        const now =
            weekday * 1440 +
            date.getHours() * 60 +
            date.getMinutes();

        if (!schedule) {
            return type === RecordType.IN ? IncidentType.IN_EARLY : null;
        }

        // 🔥 normalización de turnos (fix salto de semana)
        const shifts = schedule.shifts.map(s => {

            let start =
                s.weekday * 1440 +
                this.timeToMinutes(s.startTime);

            let end =
                s.weekday * 1440 +
                this.timeToMinutes(s.endTime);

            // 👉 si ya pasó → mover a siguiente semana
            if (start < now) {
                start += 7 * 1440;
                end += 7 * 1440;
            }

            return {
                ...s,
                start,
                end,
            };
        });

        /* ============================
           🟦 IN
        ============================ */
        if (type === RecordType.IN) {

            const closest = shifts
                .map(s => ({
                    shift: s,
                    diff: now - s.start,
                    abs: Math.abs(now - s.start),
                }))
                .sort((a, b) => a.abs - b.abs)[0];

            const diff = closest.diff;

            console.log("📊 IN diff:", diff);

            if (diff < -15) return IncidentType.IN_EARLY;
            if (diff > 15) return IncidentType.IN_LATE;

            return null;
        }

        /* ============================
           🟥 OUT (SIMPLE Y CORRECTO)
        ============================ */
        if (type === RecordType.OUT) {

            const lastIn = await this.prisma.record.findFirst({
                where: {
                    userId,
                    branchId,
                    type: RecordType.IN,
                    createdAt: { lte: date },
                },
                orderBy: { createdAt: 'desc' },
            });

            if (!lastIn) {
                console.log("📊 OUT sin IN previo → null");
                return null;
            }

            // 👉 evaluar el IN
            const inIncident = await this.evaluateSchedule({
                userId,
                branchId,
                date: lastIn.createdAt,
                type: RecordType.IN,
            });

            // 🔥 REGLA CLAVE TUYA
            if (inIncident === IncidentType.IN_EARLY) {
                console.log("📊 OUT ignorado (IN sin turno)");
                return null;
            }

            // 👉 calcular momento del IN en minutos de semana
            const inWeekday = lastIn.createdAt.getDay() === 0 ? 7 : lastIn.createdAt.getDay();

            const inMinutes =
                inWeekday * 1440 +
                lastIn.createdAt.getHours() * 60 +
                lastIn.createdAt.getMinutes();

            // 👉 reconstruir turnos SIN mover semanas
            const shifts = schedule.shifts.map(s => ({
                ...s,
                start: s.weekday * 1440 + this.timeToMinutes(s.startTime),
                end: s.weekday * 1440 + this.timeToMinutes(s.endTime),
            }));

            // 👉 encontrar turno del IN
            const shift = shifts.find(
                s => inMinutes >= s.start && inMinutes <= s.end
            );

            if (!shift) {
                console.log("📊 OUT sin turno asociado → null");
                return null;
            }

            // 👉 ahora sí: diferencia REAL
            const nowWeekday = date.getDay() === 0 ? 7 : date.getDay();

            const nowMinutes =
                nowWeekday * 1440 +
                date.getHours() * 60 +
                date.getMinutes();

            const diff = nowMinutes - shift.end;

            console.log("📊 OUT diff REAL:", diff);

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