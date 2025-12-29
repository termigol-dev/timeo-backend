import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @IsString()
  @IsOptional()
  commercialName?: string;

  @IsString()
  @IsNotEmpty()
  nif: string;

  @IsString()
  @IsNotEmpty()
  address: string; // 👈 OBLIGATORIO

  @IsString()
  @IsNotEmpty()
  plan: string;
}