import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';

@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException();
    }

    // SUPERADMIN y ADMIN_EMPRESA no tienen restricciones
    if (
      user.role === Role.SUPERADMIN ||
      user.role === Role.ADMIN_EMPRESA
    ) {
      return true;
    }

    // ADMIN_SUCURSAL → solo su sucursal
    if (user.role === Role.ADMIN_SUCURSAL) {
      const branchId =
        req.params.branchId ||
        req.body.branchId ||
        req.query.branchId;

      if (!branchId) {
        throw new ForbiddenException('Sucursal requerida');
      }

      if (branchId !== user.branchId) {
        throw new ForbiddenException('Acceso solo permitido a tu sucursal');
      }

      return true;
    }

    throw new ForbiddenException();
  }
}