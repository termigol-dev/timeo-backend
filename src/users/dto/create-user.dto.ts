import { IsEmail, IsOptional, IsString, MinLength, IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  firstSurname: string;

  @IsOptional()
  @IsString()
  secondSurname?: string;

  @IsString()
  dni: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsString()
  role: 'ADMIN_EMPRESA' | 'ADMIN_SUCURSAL' | 'EMPLEADO';

  @IsUUID()
  branchId: string;
}
