import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { CARPETA_DATOS } from './archivos';

export const HORA_APERTURA = '12:00';
export const HORA_INICIO = '12:30';
export const HORA_CIERRE = '18:00';
export const HORA_RECORDATORIO_ASEO = '17:00';
export const DIAS_CLASE = [1, 2, 3, 4, 5]; // lunes a viernes

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TAREAS = ['Trapero', 'Escoba', 'Trapito'];

export interface Registro {
  nombre: string;
  hora: string;
  estado: string; // A_TIEMPO, TARDE, AUSENTE
  excusa?: string;
  motivo?: string;
}

export interface Asignado {
  nombre: string;
  tarea: string;
}

function dosDigitos(numero: number) {
  return String(numero).padStart(2, '0');
}

// queda asi 2026-11-10
export function formatoFecha(fecha: Date) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

export function fechaHoy() {
  return formatoFecha(new Date());
}

// queda asi miercoles 11 de noviembre
export function fechaEnTexto(fecha: Date) {
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

export function siguienteDiaClase() {
  const fecha = new Date();
  do {
    fecha.setDate(fecha.getDate() + 1);
  } while (!DIAS_CLASE.includes(fecha.getDay()));
  return fecha;
}

// fecha del lunes de esta semana
export function inicioSemana() {
  const fecha = new Date();
  let dias = fecha.getDay() - 1;
  if (dias < 0) {
    dias = 6; // domingo
  }
  fecha.setDate(fecha.getDate() - dias);
  return formatoFecha(fecha);
}

function revolver(lista: string[]) {
  return lista.slice().sort(() => Math.random() - 0.5);
}

// 3 al azar de los que llegaron tarde, si no alcanza se completa con los ausentes
export function sortearAseo(tardes: string[], ausentes: string[]) {
  const lista = revolver(tardes).concat(revolver(ausentes));
  const tareas = revolver(TAREAS);
  const asignados: Asignado[] = [];
  for (let i = 0; i < lista.length && i < 3; i++) {
    asignados.push({ nombre: lista[i], tarea: tareas[i] });
  }
  return asignados;
}

export async function crearExcel(fecha: string, registros: Registro[]) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Asistencia');
  hoja.columns = [
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Hora', key: 'hora', width: 12 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Excusa', key: 'excusa', width: 18 },
    { header: 'Motivo', key: 'motivo', width: 50 },
  ];
  hoja.addRows(registros);
  hoja.getRow(1).font = { bold: true };

  const carpeta = path.join(CARPETA_DATOS, 'excel');
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, `asistencia-${fecha}.xlsx`);
  await libro.xlsx.writeFile(ruta);
  return ruta;
}
