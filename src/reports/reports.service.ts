import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, RecordType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
  ) { }

  /* =========================================================
     LISTADO AGREGADO ANTIGUO
  ========================================================= */

  async getReportsForUser(
    user: {
      id: string;
      role: Role;
      companyId: string;
      branchId: string;
    },
    from?: string,
    to?: string,
  ) {
    const where: any = {};

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (user.role === Role.EMPLEADO) {
      where.userId = user.id;
    } else {
      where.user = {
        memberships: {
          some: {
            companyId: user.companyId,
            ...(user.role === Role.ADMIN_SUCURSAL
              ? { branchId: user.branchId }
              : {}),
          },
        },
      };
    }

    const records = await this.prisma.record.findMany({
      where,
      orderBy: [
        { userId: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            firstSurname: true,
          },
        },
      },
    });

    const canSeeTotals =
      user.role === Role.ADMIN_EMPRESA ||
      user.role === Role.SUPERADMIN;

    const grouped = new Map<string, any>();

    for (let i = 0; i < records.length - 1; i++) {
      const current = records[i];
      const next = records[i + 1];

      if (
        current.type !== RecordType.IN ||
        next.type !== RecordType.OUT ||
        current.userId !== next.userId
      ) {
        continue;
      }

      const day = current.createdAt
        .toISOString()
        .slice(0, 10);

      const key = `${current.userId}_${day}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          date: day,
          user: current.user,
          sessions: [],
          totalHours: 0,
        });
      }

      const diff =
        (next.createdAt.getTime() -
          current.createdAt.getTime()) /
        1000 /
        60 /
        60;

      if (diff > 0 && diff < 16) {
        grouped.get(key).sessions.push({
          in: current.createdAt,
          out: next.createdAt,
        });

        grouped.get(key).totalHours += diff;
      }
    }

    const days = Array.from(grouped.values()).map(d => {
      if (!canSeeTotals) {
        delete d.totalHours;
      } else {
        d.totalHours =
          Math.round(d.totalHours * 100) / 100;
      }
      return d;
    });

    if (!canSeeTotals) {
      return { days };
    }

    const totalHours = days.reduce(
      (sum, d) => sum + (d.totalHours || 0),
      0,
    );

    return {
      days,
      totalHours:
        Math.round(totalHours * 100) / 100,
    };
  }

  /* =========================================================
     NUEVO MÉTODO – CON userId OBJETIVO
  ========================================================= */

  async getDailyReport(
    requestUser: {
      id: string;
      role: Role;
      companyId: string;
      branchId: string | null;
    },
    targetUserId: string,
    from: string,
    to: string,
  ) {

    /* -------------------------------
       permisos CORREGIDOS
    --------------------------------*/

    if (requestUser.role === Role.SUPERADMIN) {
      // acceso total
    }
    else if (requestUser.role === Role.EMPLEADO) {

      if (requestUser.id !== targetUserId) {
        throw new ForbiddenException();
      }

    } else {

      const membership = await this.prisma.membership.findFirst({
        where: {
          userId: targetUserId,
          companyId: requestUser.companyId,
          ...(requestUser.role === Role.ADMIN_SUCURSAL
            ? { branchId: requestUser.branchId }
            : {}),
        },
      });

      if (!membership) {
        throw new ForbiddenException();
      }
    }

    return this.getDailyReportForUser(
      requestUser,
      targetUserId,
      from,
      to,
    );
  }

  /* =========================================================
     TU FUNCIÓN REAL DE CÁLCULO
  ========================================================= */

  async getDailyReportForUser(
    requestUser: {
      id: string;
      role: Role;
      companyId: string;
      branchId: string | null;
    },
    targetUserId: string,
    from: string,
    to: string,
  ) {

    /* 🔑 membership solo si no es superadmin */

    let membership = null;

    if (requestUser.role !== Role.SUPERADMIN) {
      membership = await this.prisma.membership.findFirst({
        where: {
          userId: targetUserId,
          companyId: requestUser.companyId,
          ...(requestUser.role === Role.ADMIN_SUCURSAL
            ? { branchId: requestUser.branchId }
            : {}),
        },
      });
    }

    if (!membership) {
      if (
        requestUser.role === Role.EMPLEADO &&
        requestUser.id === targetUserId
      ) {
      } else if (requestUser.role !== Role.SUPERADMIN) {
        throw new ForbiddenException();
      }
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    const records = await this.prisma.record.findMany({
      where: {
        userId: targetUserId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const incidents = await this.prisma.incident.findMany({
      where: {
        userId: targetUserId,
        occurredAt: { gte: fromDate, lte: toDate },
      },
    });

    const recordsByDay = new Map<string, any[]>();
    const incidentsByDay = new Map<string, any[]>();

    const toDayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };

    for (const r of records) {
      const d = toDayKey(r.createdAt);
      if (!recordsByDay.has(d)) recordsByDay.set(d, []);
      recordsByDay.get(d)!.push(r);
    }

    for (const i of incidents) {
      const d = toDayKey(i.occurredAt);
      if (!incidentsByDay.has(d)) incidentsByDay.set(d, []);
      incidentsByDay.get(d)!.push(i);
    }

    const mergeTurns = (turns: { startTime: string; endTime: string }[]) => {
      if (!turns.length) return [];

      const sorted = [...turns].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );

      const merged = [{ ...sorted[0] }];

      for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const cur = sorted[i];

        if (cur.startTime <= last.endTime) {
          if (cur.endTime > last.endTime) last.endTime = cur.endTime;
        } else {
          merged.push({ ...cur });
        }
      }

      return merged;
    };

    const days: any[] = [];

    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {

      const dayKey = toDayKey(cursor);
      const jsDay = cursor.getDay();
      const weekday = jsDay === 0 ? 7 : jsDay;
      const dayStart = new Date(cursor);

      const schedule = await this.prisma.schedule.findFirst({
        where: {
          userId: targetUserId,
          validFrom: { lte: dayStart },
          OR: [
            { validTo: null },
            { validTo: { gte: dayStart } },
          ],
        },
        include: {
          shifts: true,
          exceptions: {
            where: { date: dayStart },
            include: { blocks: true },
          },
        },
      });

      let finalShifts: { startTime: string; endTime: string }[] = [];

      if (schedule) {

        const exception = schedule.exceptions[0];

        if (exception) {

          if (exception.type === 'VACATION') {
            finalShifts = [];
          }

          else if (exception.type === 'MODIFIED_SHIFT') {
            finalShifts = exception.blocks.map(b => ({
              startTime: b.startTime,
              endTime: b.endTime,
            }));
          }

        } else {

          const base = schedule.shifts.filter(s => {

            const from = new Date(s.validFrom);
            from.setHours(0, 0, 0, 0);

            const to = s.validTo ? new Date(s.validTo) : null;
            if (to) to.setHours(0, 0, 0, 0);

            const inRange =
              from.getTime() <= dayStart.getTime() &&
              (!to || to.getTime() >= dayStart.getTime());

            return inRange && s.weekday === weekday;
          });

          finalShifts = base.map(s => ({
            startTime: s.startTime,
            endTime: s.endTime,
          }));
        }
      }

      finalShifts = mergeTurns(finalShifts);

      days.push({
        date: dayKey,
        shifts: finalShifts,
        records: (recordsByDay.get(dayKey) || []).map(r => ({
          id: r.id,
          type: r.type,
          createdAt: r.createdAt,
        })),
        incidents: incidentsByDay.get(dayKey) || [],
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return { days };
  }
}