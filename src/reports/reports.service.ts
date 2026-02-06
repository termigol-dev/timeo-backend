import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, RecordType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
  ) { }

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

    /* ───────── FILTROS FECHA ───────── */
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    /* ───────── VISIBILIDAD POR ROL (CORRECTO CON MEMBERSHIPS) ───────── */

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

    /* ───────── AGRUPACIÓN SIMPLE IN / OUT ───────── */

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
  async getDailyReportForUser(
    user: {
      id: string;
      role: Role;
      companyId: string;
      branchId: string | null;
    },
    from: string,
    to: string,
  ) {

    const fromDate = new Date(from);
    const toDate = new Date(to);

    /* ---------------------------------------------
       RECORDS
    --------------------------------------------- */

    const records = await this.prisma.record.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    /* ---------------------------------------------
       INCIDENTES (YA CALCULADOS)
    --------------------------------------------- */

    const incidents = await this.prisma.incident.findMany({
      where: {
        userId: user.id,
        occurredAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    /* ---------------------------------------------
       SHIFTS HISTÓRICOS
       (usaremos validFrom / validTo después por día)
    --------------------------------------------- */

    const shifts = await this.prisma.shift.findMany({
      where: {
        schedule: {
          userId: user.id,
        },
        AND: [
          {
            validFrom: { lte: toDate },
          },
          {
            OR: [
              { validTo: null },
              { validTo: { gte: fromDate } },
            ],
          },
        ],
      },
    });

    /* ---------------------------------------------
       INDEXADO RÁPIDO
    --------------------------------------------- */

    const recordsByDay = new Map<string, any[]>();
    const incidentsByDay = new Map<string, any[]>();

    for (const r of records) {
      const d = r.createdAt.toISOString().slice(0, 10);
      if (!recordsByDay.has(d)) recordsByDay.set(d, []);
      recordsByDay.get(d)!.push(r);
    }
    for (const i of incidents) {
      const d = i.occurredAt.toISOString().slice(0, 10);
      if (!incidentsByDay.has(d)) incidentsByDay.set(d, []);
      incidentsByDay.get(d)!.push(i);
    }

    /* ---------------------------------------------
       RECORRER DÍAS
    --------------------------------------------- */

    const days: any[] = [];

    for (
      let d = new Date(fromDate);
      d <= toDate;
      d.setDate(d.getDate() + 1)
    ) {

      const day = d.toISOString().slice(0, 10);
      const weekday = d.getDay(); // 0..6

      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);

      /* -----------------------------------------
         shifts válidos ese día
      ----------------------------------------- */

      const dayShifts = shifts.filter(s => {

        const validFromOk = s.validFrom <= dayStart;
        const validToOk =
          !s.validTo || s.validTo >= dayStart;

        return (
          validFromOk &&
          validToOk &&
          s.weekday === weekday
        );
      });

      days.push({
        date: day,
        shifts: dayShifts.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        records: (recordsByDay.get(day) || []).map(r => ({
          id: r.id,
          type: r.type,
          createdAt: r.createdAt,
        })),
        incidents: incidentsByDay.get(day) || [],
      });
    }

    return { days };
  }


}