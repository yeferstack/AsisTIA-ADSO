import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TelegramService } from './telegram.service';

@Controller('api')
export class WebController {
  constructor(private servicio: TelegramService) {}

  @Get('estado')
  estado() {
    return this.servicio.estadoDeHoy();
  }

  @Post('led')
  led(@Body() datos: { color: string; encender: boolean }) {
    if (datos.color != 'verde' && datos.color != 'rojo') {
      return { mensaje: 'Color invalido' };
    }
    this.servicio.cambiarLed(datos.color, datos.encender);
    return { mensaje: 'Listo' };
  }

  @Get('excel')
  async excel(@Res() res: Response) {
    const ruta = await this.servicio.crearExcelDeHoy();
    res.download(ruta);
  }

  @Post('sorteo')
  async sorteo() {
    return this.servicio.hacerSorteo();
  }

  @Post('excusa')
  async excusa(@Body() datos: { id: number; decision: string }) {
    if (datos.decision != 'ACEPTADA' && datos.decision != 'RECHAZADA') {
      return { mensaje: 'Decision invalida' };
    }
    const mensaje = await this.servicio.decidirExcusa(datos.id, datos.decision);
    return { mensaje };
  }

  @Post('telegram')
  async telegram() {
    const seEnvio = await this.servicio.enviarTelegrams();
    if (seEnvio) {
      return { mensaje: 'Mensajes enviados a los ausentes y al instructor' };
    }
    return { mensaje: 'Los mensajes de hoy ya se habian enviado' };
  }
}
