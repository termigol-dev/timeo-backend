import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { BranchesModule } from './branches/branches.module';
import { RecordsModule } from './records/records.module';
import { ReportsModule } from './reports/reports.module';
import { TabletModule } from './tablet/tablet.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    BranchesModule,
    RecordsModule,
    ReportsModule,
    TabletModule,
    DashboardModule,
    BranchesModule,
  ],
})
export class AppModule {}
