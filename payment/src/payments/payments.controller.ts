import { BadRequestException, Body, Controller, Headers, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { CurrentUser, SessionGuard, SessionUser } from '../common/session.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { TestValidationDto } from './dto/test-validation.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreatePaymentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && (idempotencyKey.length === 0 || idempotencyKey.length > 255)) {
      throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    }
    const payment = await this.paymentsService.create(user, dto, { ip, userAgent }, idempotencyKey);
    return { payment };
  }

  @Post('test-validation')
  @HttpCode(200)
  @UseGuards(InternalTokenGuard)
  testValidation(@Body() dto: TestValidationDto) {
    return this.paymentsService.runValidationTest(dto.incidentId);
  }
}
