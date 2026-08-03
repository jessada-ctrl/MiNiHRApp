import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CheckInDto {
  @IsIn(['qr', 'gps'])
  method!: 'qr' | 'gps';

  @ValidateIf((o: CheckInDto) => o.method === 'qr')
  @IsString()
  qrToken?: string;

  @ValidateIf((o: CheckInDto) => o.method === 'gps')
  @IsLatitude()
  latitude?: number;

  @ValidateIf((o: CheckInDto) => o.method === 'gps')
  @IsLongitude()
  longitude?: number;
}
