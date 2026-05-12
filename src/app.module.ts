import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 👈 AÑADIDO

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { BranchesModule } from './branches/branches.module';
import { RecordsModule } from './records/records.module';
import { ReportsModule } from './reports/reports.module';
import { TabletModule } from './tablet/tablet.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SchedulesModule } from './schedules/schedules.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MobileModule } from './mobile/mobile.module';
import { DevicesModule } from './devices/devices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SimulateModule } from './records/simulate.module';
import { PublicController } from './branches/public.controller';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }), // 👈 ESTO ES LO QUE FALTABA

    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    BranchesModule,
    RecordsModule,
    ReportsModule,
    TabletModule,
    DashboardModule,
    SchedulesModule,
    IncidentsModule,
    MobileModule,
    DevicesModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    SimulateModule,
    BillingModule,
  ],
  controllers: [PublicController],
  providers: [],
})
export class AppModule {}