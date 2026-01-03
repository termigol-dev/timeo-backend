import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TabletService } from './tablet.service';
import { TabletGuard } from './guards/tablet.guard';

@Controller('tablet')
@UseGuards(TabletGuard)
export class TabletController {
  constructor(
    private readonly tabletService: TabletService,
  ) {}

  /* ===============================
     CONTEXTO TABLET
     Empresa + Sucursal
     👉 usado por el HEADER de la tablet
  =============================== */
  @Get('context')
  getContext(@Req() req: any) {
    return {
      company: {
        id: req.company.id,
        commercialName: req.company.commercialName,
      },
      branch: {
        id: req.branch.id,
        name: req.branch.name,
      },
    };
  }

  /* ===============================
     EMPLEADOS ACTIVOS DE LA SUCURSAL
     👉 pantalla principal de la tablet
  =============================== */
  @Get('employees')
  getEmployees(@Req() req: any) {
    return this.tabletService.getEmployees(
      req.branch.id,
    );
  }

  /* ===============================
     REGISTRO DE ENTRADA (IN)
  =============================== */
  @Post('in/:userId')
  recordIn(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    return this.tabletService.recordIn(
      userId,
      req.branch.id,
      req.company.id,
    );
  }

  /* ===============================
     REGISTRO DE SALIDA (OUT)
  =============================== */
  @Post('out/:userId')
  recordOut(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    return this.tabletService.recordOut(
      userId,
      req.branch.id,
      req.company.id,
    );
  }
}