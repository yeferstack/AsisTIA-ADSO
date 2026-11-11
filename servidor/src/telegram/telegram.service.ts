import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import * as mqtt from 'mqtt';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { leerJson, guardarJson, leerNombres } from './archivos';
import {
  HORA_APERTURA, HORA_INICIO, HORA_CIERRE, HORA_RECORDATORIO_ASEO, DIAS_CLASE, Registro, Asignado,
  fechaHoy, formatoFecha, inicioSemana, fechaEnTexto, siguienteDiaClase, sortearAseo, crearExcel,
} from './asistencia';

const TOPIC_REGISTRO = 'sena/asistencia/registro';
const TOPIC_CONTROL = 'sena/asistencia/control';

interface Aprendiz {
  nombre: string;
  chatId: number;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  bot: TelegramBot;
  clienteMqtt: mqtt.MqttClient;
  chatInstructor = Number(process.env.TELEGRAM_CHAT_INSTRUCTOR);
  chatGrupo = Number(process.env.TELEGRAM_GRUPO);

  onModuleInit() {
    this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN || '', { polling: true });

    this.bot.on('message', (mensaje) => {
      console.log(`Mensaje de ${mensaje.chat.id}: ${mensaje.text}`);
      // si no es un comando puede ser una excusa
      if (mensaje.chat.type === 'private' && mensaje.text && !mensaje.text.startsWith('/')) {
        this.recibirExcusa(mensaje.chat.id, mensaje.text);
      }
    });

    this.bot.onText(/^\/start/, (mensaje) => this.iniciar(mensaje.chat.id));
    this.bot.onText(/^\/ayuda/, (mensaje) => this.ayuda(mensaje.chat.id));
    this.bot.on('callback_query', (boton) => this.elegirNombre(boton));
    this.bot.onText(/^\/cerrar/, (mensaje) => this.comandoCerrar(mensaje.chat.id));
    this.bot.onText(/^\/fallas/, (mensaje) => this.comandoFallas(mensaje.chat.id));
    this.bot.onText(/^\/aseo/, (mensaje) => this.comandoAseo(mensaje.chat.id));
    this.bot.onText(/^\/hoy/, (mensaje) => this.comandoHoy(mensaje.chat.id));
    this.bot.onText(/^\/excel/, (mensaje) => this.comandoExcel(mensaje.chat.id));

    // abrir la asistencia
    const [horaAbrir, minutoAbrir] = HORA_APERTURA.split(':');
    cron.schedule(`${minutoAbrir} ${horaAbrir} * * ${DIAS_CLASE.join(',')}`, () => {
      this.clienteMqtt.publish(TOPIC_CONTROL, 'ABRIR', { qos: 1 });
      console.log('Asistencia abierta');
    });

    // cerrar la asistencia
    const [hora, minuto] = HORA_CIERRE.split(':');
    cron.schedule(`${minuto} ${hora} * * ${DIAS_CLASE.join(',')}`, () => this.cierreAutomatico());

    // recordar el aseo
    const [horaAseo, minutoAseo] = HORA_RECORDATORIO_ASEO.split(':');
    cron.schedule(`${minutoAseo} ${horaAseo} * * ${DIAS_CLASE.join(',')}`, () => this.recordarAseo());

    this.conectarMqtt();
    console.log('Bot de Telegram iniciado');
  }

  onModuleDestroy() {
    this.bot.stopPolling();
    this.clienteMqtt.end();
  }

  conectarMqtt() {
    this.clienteMqtt = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: Number(process.env.MQTT_PUERTO),
      protocol: 'mqtts',
      username: process.env.MQTT_USUARIO,
      password: process.env.MQTT_CLAVE,
      ca: fs.readFileSync(path.join(process.cwd(), '..', 'certificados', 'emqxsl-ca.crt')),
    });

    this.clienteMqtt.on('connect', () => {
      console.log('Bot conectado al broker MQTT');
      this.clienteMqtt.subscribe([TOPIC_REGISTRO, TOPIC_CONTROL]);
    });

    this.clienteMqtt.on('message', (topic, datos) => {
      const mensaje = datos.toString();
      if (topic === TOPIC_REGISTRO) {
        try {
          this.guardarLlegada(JSON.parse(mensaje));
        } catch (error) {
          console.log(`Registro invalido: ${mensaje}`);
        }
      }
      // si cierran desde el tactil tambien se cierra aca
      if (topic === TOPIC_CONTROL && mensaje === 'CERRAR') {
        this.cerrarAsistencia();
      }
    });
  }

  // con try para que no se caiga el servidor
  async enviar(chatId: number, texto: string) {
    try {
      await this.bot.sendMessage(chatId, texto);
    } catch (error) {
      console.log(`No se pudo enviar mensaje a ${chatId}: ${error.message}`);
    }
  }

  leerDia(asistencia: any, fecha: string) {
    if (!asistencia[fecha]) {
      asistencia[fecha] = { cerrada: false, registros: [] };
    }
    return asistencia[fecha];
  }

  guardarLlegada(registro: Registro) {
    if (registro.nombre === 'DESCONOCIDO') {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    const yaLlego = dia.registros.some((r: Registro) => r.nombre === registro.nombre);
    if (dia.cerrada || yaLlego) {
      return;
    }
    dia.registros.push({ nombre: registro.nombre, hora: registro.hora, estado: registro.estado });
    guardarJson('asistencia.json', asistencia);
    console.log(`Llegada guardada: ${registro.nombre} ${registro.estado}`);
  }

  // si no llego nadie es porque no hubo clase (festivo)
  cierreAutomatico() {
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    if (dia.registros.length === 0) {
      console.log('Hoy no llego nadie, no se cierra la asistencia (posible festivo)');
      return;
    }
    this.cerrarAsistencia();
  }

  async cerrarAsistencia() {
    const hoy = fechaHoy();
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, hoy);
    if (dia.cerrada) {
      return false;
    }

    const llegaron = dia.registros.map((r: Registro) => r.nombre);
    const ausentes = leerNombres().filter((nombre) => !llegaron.includes(nombre));
    for (const nombre of ausentes) {
      dia.registros.push({ nombre, hora: '', estado: 'AUSENTE' });
    }
    dia.cerrada = true;
    guardarJson('asistencia.json', asistencia);
    this.clienteMqtt.publish(TOPIC_CONTROL, 'CERRAR', { qos: 1 });

    const registros: Registro[] = dia.registros;
    const aTiempo = registros.filter((r) => r.estado === 'A_TIEMPO').map((r) => r.nombre);
    const tardes = registros.filter((r) => r.estado === 'TARDE').map((r) => r.nombre);

    // mensaje a los ausentes
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    const excusas = leerJson('excusas.json', []);
    for (const nombre of ausentes) {
      const aprendiz = aprendices.find((a) => a.nombre === nombre);
      if (aprendiz) {
        excusas.push({ nombre, chatId: aprendiz.chatId, fecha: hoy, texto: '', estado: 'SIN_RESPUESTA' });
        guardarJson('excusas.json', excusas);
        await this.enviar(
          aprendiz.chatId,
          `Hola ${nombre}, hoy no asististe a clase (${HORA_INICIO}). Que paso? Responde este mensaje con tu excusa.`,
        );
      }
    }

    // resumen al instructor
    if (this.chatInstructor) {
      await this.enviar(
        this.chatInstructor,
        `Resumen de asistencia ${hoy}\n\n` +
          `A tiempo (${aTiempo.length}): ${this.listar(aTiempo)}\n` +
          `Tarde (${tardes.length}): ${this.listar(tardes)}\n` +
          `Ausentes (${ausentes.length}): ${this.listar(ausentes)}`,
      );
      await this.enviarExcel(this.chatInstructor, hoy, registros);
    }

    // sorteo del aseo
    const diaAseo = siguienteDiaClase();
    const asignados = sortearAseo(tardes, ausentes);
    if (asignados.length > 0) {
      const aseo = leerJson('aseo.json', []);
      aseo.push({ fecha: formatoFecha(diaAseo), asignados });
      guardarJson('aseo.json', aseo);
    }
    if (this.chatGrupo) {
      let texto = `Aseo para el ${fechaEnTexto(diaAseo)}:\n`;
      if (asignados.length === 0) {
        texto += 'Todos llegaron a tiempo, hoy no hay sorteo.';
      }
      for (const asignado of asignados) {
        texto += `- ${asignado.nombre} -> ${asignado.tarea}\n`;
      }
      await this.enviar(this.chatGrupo, texto);
    }

    await this.revisarAlertas(asistencia, ausentes, tardes);

    console.log(`Asistencia del ${hoy} cerrada`);
    return true;
  }

  async recordarAseo() {
    const aseo = leerJson('aseo.json', []);
    const hoy = aseo.find((dia) => dia.fecha === fechaHoy());
    if (!hoy || !this.chatGrupo) {
      return;
    }
    let nombres = '';
    for (let i = 0; i < hoy.asignados.length; i++) {
      const asignado: Asignado = hoy.asignados[i];
      if (i > 0 && i == hoy.asignados.length - 1) {
        nombres += ' y ';
      } else if (i > 0) {
        nombres += ', ';
      }
      nombres += `${asignado.nombre} (${asignado.tarea})`;
    }
    await this.enviar(this.chatGrupo, `Hoy les toca aseo a ${nombres}. No se vayan sin hacerlo!`);
  }

  async revisarAlertas(asistencia: any, ausentes: string[], tardes: string[]) {
    const fechas = Object.keys(asistencia).filter((f) => asistencia[f].cerrada).sort();

    // fallas seguidas, se cuenta desde el ultimo dia para atras
    for (const nombre of ausentes) {
      let seguidas = 0;
      for (let i = fechas.length - 1; i >= 0; i--) {
        const registro = asistencia[fechas[i]].registros.find((r: Registro) => r.nombre === nombre);
        if (registro && registro.estado == 'AUSENTE') {
          seguidas++;
        } else {
          break;
        }
      }
      if (seguidas === 3 && this.chatInstructor) {
        await this.enviar(this.chatInstructor, `Atencion: ${nombre} lleva 3 fallas seguidas, posible riesgo de desercion.`);
      }
    }

    // llegadas tarde de esta semana
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    for (const nombre of tardes) {
      let tardesSemana = 0;
      for (const fecha of fechas) {
        const registro = asistencia[fecha].registros.find((r: Registro) => r.nombre === nombre);
        if (fecha >= inicioSemana() && registro && registro.estado == 'TARDE') {
          tardesSemana++;
        }
      }
      const aprendiz = aprendices.find((a) => a.nombre === nombre);
      if (tardesSemana === 2 && aprendiz) {
        await this.enviar(
          aprendiz.chatId,
          `Hola ${nombre}, esta semana llevas 2 llegadas tarde. Sabemos que a veces se complica, pero tu puedes! ` +
            `Intenta salir un poco antes, te esperamos a las ${HORA_INICIO}.`,
        );
      }
    }
  }

  recibirExcusa(chatId: number, texto: string) {
    const excusas = leerJson('excusas.json', []);
    const excusa = excusas.find((e) => e.chatId === chatId && e.estado === 'SIN_RESPUESTA');
    if (!excusa) {
      this.enviar(chatId, 'No entendi. Escribe /ayuda para ver los comandos.');
      return;
    }

    // queda PENDIENTE, despues la clasificamos con gemini
    excusa.texto = texto;
    excusa.estado = 'PENDIENTE';
    guardarJson('excusas.json', excusas);

    this.enviar(chatId, 'Gracias, tu excusa fue enviada al instructor.');
    if (this.chatInstructor) {
      this.enviar(this.chatInstructor, `Excusa de ${excusa.nombre} (${excusa.fecha}): ${texto}`);
    }
  }

  listar(nombres: string[]) {
    if (nombres.length == 0) {
      return 'ninguno';
    }
    return nombres.join(', ');
  }

  async enviarExcel(chatId: number, fecha: string, registros: Registro[]) {
    const ruta = await crearExcel(fecha, registros);
    try {
      await this.bot.sendDocument(chatId, ruta, {}, {
        filename: path.basename(ruta),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (error) {
      console.log(`No se pudo enviar el Excel: ${error.message}`);
    }
  }

  soloInstructor(chatId: number) {
    if (!this.esInstructor(chatId)) {
      this.enviar(chatId, 'Ese comando es solo para el instructor.');
      return false;
    }
    return true;
  }

  comandoFallas(chatId: number) {
    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      this.enviar(chatId, 'Primero registrate con /start.');
      return;
    }

    const asistencia = leerJson('asistencia.json', {});
    let fallas = 0;
    let tardes = 0;
    for (const fecha in asistencia) {
      const registro = asistencia[fecha].registros.find((r: Registro) => r.nombre === aprendiz.nombre);
      if (registro && registro.estado == 'AUSENTE') {
        fallas++;
      }
      if (registro && registro.estado == 'TARDE') {
        tardes++;
      }
    }
    this.enviar(chatId, `${aprendiz.nombre}, llevas ${fallas} fallas y ${tardes} llegadas tarde.`);
  }

  comandoAseo(chatId: number) {
    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      this.enviar(chatId, 'Primero registrate con /start.');
      return;
    }

    const aseo = leerJson('aseo.json', []);
    for (const dia of aseo) {
      const asignado = dia.asignados.find((a) => a.nombre === aprendiz.nombre);
      if (dia.fecha >= fechaHoy() && asignado) {
        const fecha = fechaEnTexto(new Date(`${dia.fecha}T00:00:00`));
        this.enviar(chatId, `Te toca aseo el ${fecha}. Tu tarea: ${asignado.tarea}.`);
        return;
      }
    }
    this.enviar(chatId, 'No te toca aseo por ahora.');
  }

  comandoHoy(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    const llegaron = dia.registros.filter((r: Registro) => r.estado !== 'AUSENTE');
    if (llegaron.length === 0) {
      this.enviar(chatId, 'Hoy no ha llegado nadie todavia.');
      return;
    }

    let texto = `Llegadas de hoy (${llegaron.length}):\n`;
    for (const registro of llegaron) {
      texto += `- ${registro.nombre} - ${registro.hora} (${registro.estado})\n`;
    }
    if (dia.cerrada) {
      texto += '\nLa asistencia ya esta cerrada.';
    }
    this.enviar(chatId, texto);
  }

  async comandoExcel(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    if (dia.registros.length === 0) {
      this.enviar(chatId, 'Hoy no hay registros todavia.');
      return;
    }
    await this.enviarExcel(chatId, fechaHoy(), dia.registros);
  }

  async comandoCerrar(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const seCerro = await this.cerrarAsistencia();
    if (seCerro) {
      this.enviar(chatId, 'Asistencia cerrada. Se aviso a los ausentes y al grupo.');
    } else {
      this.enviar(chatId, 'La asistencia de hoy ya estaba cerrada.');
    }
  }

  esInstructor(chatId: number) {
    return chatId === this.chatInstructor;
  }

  buscarAprendiz(chatId: number): Aprendiz | undefined {
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    return aprendices.find((aprendiz) => aprendiz.chatId === chatId);
  }

  iniciar(chatId: number) {
    if (this.esInstructor(chatId)) {
      this.bot.sendMessage(chatId, 'Hola instructor, bienvenido a AsistIA SENA. Escribe /ayuda para ver tus comandos.');
      return;
    }

    const aprendiz = this.buscarAprendiz(chatId);
    if (aprendiz) {
      this.bot.sendMessage(chatId, `Hola ${aprendiz.nombre}, ya estas registrado en AsistIA.`);
      return;
    }

    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    const registrados = aprendices.map((a) => a.nombre);
    const libres = leerNombres().filter((nombre) => !registrados.includes(nombre));

    if (libres.length === 0) {
      this.bot.sendMessage(chatId, 'Todos los aprendices ya estan registrados. Habla con el instructor.');
      return;
    }

    // un boton por cada nombre
    const botones = libres.map((nombre) => [{ text: nombre, callback_data: nombre }]);
    this.bot.sendMessage(chatId, 'Hola, bienvenido a AsistIA SENA. Cual es tu nombre?', {
      reply_markup: { inline_keyboard: botones },
    });
  }

  elegirNombre(boton: TelegramBot.CallbackQuery) {
    if (!boton.message) {
      return;
    }
    const chatId = boton.message.chat.id;
    const nombre = boton.data || '';
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);

    this.bot.answerCallbackQuery(boton.id);

    if (this.buscarAprendiz(chatId)) {
      this.bot.sendMessage(chatId, 'Ya estas registrado en AsistIA.');
      return;
    }
    if (aprendices.some((a) => a.nombre === nombre)) {
      this.bot.sendMessage(chatId, `${nombre} ya fue registrado por otra persona. Escribe /start de nuevo.`);
      return;
    }

    aprendices.push({ nombre, chatId });
    guardarJson('aprendices.json', aprendices);

    this.bot.editMessageText(`Listo ${nombre}, ya quedaste registrado en AsistIA.`, {
      chat_id: chatId,
      message_id: boton.message.message_id,
    });
  }

  ayuda(chatId: number) {
    if (this.esInstructor(chatId)) {
      this.bot.sendMessage(
        chatId,
        'Comandos del instructor:\n' +
          '/hoy - Quien ha llegado hoy y a que hora\n' +
          '/excel - Excel de la asistencia del dia\n' +
          '/cerrar - Cerrar la asistencia ya\n' +
          '/ayuda - Ver esta lista',
      );
      return;
    }

    this.bot.sendMessage(
      chatId,
      'Comandos del aprendiz:\n' +
        '/start - Registrarte en AsistIA\n' +
        '/fallas - Cuantas fallas y llegadas tarde llevas\n' +
        '/aseo - Si te toca aseo, que dia y que tarea\n' +
        '/ayuda - Ver esta lista',
    );
  }
}
