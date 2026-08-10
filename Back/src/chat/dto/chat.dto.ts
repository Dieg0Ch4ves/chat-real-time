import { IsString, MinLength } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @MinLength(1)
  roomId!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsString()
  @MinLength(1)
  roomId!: string;
}
