import { IsOptional, IsString } from 'class-validator';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { pagePaginationDto } from 'src/common/dto/page-pagination.dto';

export class GetMovieDto extends CursorPaginationDto {
  @IsString()
  @IsOptional()
  title?: string;
}
