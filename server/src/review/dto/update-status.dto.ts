import { IsIn } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['approved', 'pending', 'hidden', 'spam'])
  status!: 'approved' | 'pending' | 'hidden' | 'spam';
}
