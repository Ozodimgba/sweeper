import { Controller, Get, OnModuleInit } from '@nestjs/common';
import { AppService } from './app.service';
import { MeService } from './me.service';
import { Me2Service } from './me2.service';

@Controller()
export class AppController implements OnModuleInit {
  constructor(
    private readonly appService: AppService,
    private readonly meService: MeService,
    private readonly me2Service: Me2Service,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  async onModuleInit() {
    // await this.appService.startListening();
    await this.meService.startListening();
    await this.me2Service.startListening();
  }

  @Get('ata')
  async createTokenAccount() {
    await this.appService.getOrcreateATA();
  }

  @Get('sweep')
  async Sweep() {
    await this.meService.handleTransfer();
    await this.me2Service.handleTransfer();
  }
}
