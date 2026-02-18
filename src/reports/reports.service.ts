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
     (NO TOCAMOS) – listado agregado antiguo
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
     NUEVO MÉTODO – SIEMPRE CON userId OBJETIVO
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
       permisos
    --------------------------------*/

    if (requestUser.role === Role.EMPLEADO) {

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

    /* reutilizamos tu lógica real */
    return this.getDailyReportForUser(
      requestUser,
      targetUserId,
      from,
      to,
    );
  }

  /* =========================================================
     TU FUNCIÓN REAL DE CÁLCULO (NO SE TOCA)
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
    if (
      requestUser.role === Role.EMPLEADO &&
      requestUser.id === targetUserId
    ) {
      // permitido
    } else {
      throw new ForbiddenException();
    }
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  /* ---------------------------------------------
     RECORDS
  --------------------------------------------- */

  const records = await this.prisma.record.findMany({
    where: {
      userId: targetUserId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  /* ---------------------------------------------
     INCIDENTES
  --------------------------------------------- */

  const incidents = await this.prisma.incident.findMany({
    where: {
      userId: targetUserId,
      occurredAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
  });

  /* ---------------------------------------------
     INDEXADO POR DÍA
  --------------------------------------------- */

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

  /* ---------------------------------------------
     RECORRER DÍAS
  --------------------------------------------- */

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

    /* 🔥 AQUÍ ESTÁ LA CORRECCIÓN CLAVE */
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId: targetUserId,
        validFrom: { lte: dayStart },
        OR: [
          { validTo: null },
          { validTo: { gte: dayStart } },
        ],
      },
      include: { shifts: true },
    });

    const dayShifts = schedule
      ? schedule.shifts.filter(s => s.weekday === weekday)
      : [];

    days.push({
      date: dayKey,
      shifts: dayShifts.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
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