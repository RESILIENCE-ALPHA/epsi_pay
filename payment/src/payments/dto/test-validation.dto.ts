import { IsOptional, IsUUID } from 'class-validator';

export class TestValidationDto {
  // Incident en cours de remédiation : si fourni, la preuve est enregistrée dans remediation_logs
  @IsOptional()
  @IsUUID()
  incidentId?: string;
}
