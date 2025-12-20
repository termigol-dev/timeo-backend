import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, RecordType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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

    /* ───────── VISIBILIDAD POR ROL ───────── */
    if (user.role === Role.EMPLEADO) {
      where.userId = user.id;
    }

    if (user.role === Role.ADMIN_SUCURSAL) {
      where.branchId = user.branchId;
    }

    if (
      user.role === Role.ADMIN_EMPRESA ||
      user.role === Role.SUPERADMIN
    ) {
      where.companyId = user.companyId;
    }

    const records = await this.prisma.record.findMany({
      where,
      orderBy: { createdAt: 'asc' },
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

    /* ───────── AGRUPACIÓN B14 ───────── */

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

      const day = current.createdAt.toISOString().slice(0, 10);
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
        d.totalHours = Math.round(d.totalHours * 100) / 100;
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
      totalHours: Math.round(totalHours * 100) / 100,
    };
  }
}