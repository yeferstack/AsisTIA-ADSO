import * as fs from 'fs';
import * as path from 'path';

export const CARPETA_DATOS =path.join(process.cwd(), 'datos');
const ARCHIVO_NOMBRES = path.join(process.cwd(), '..', 'reconocimiento', 'nombres.txt');

export function leerJson(archivo: string, porDefecto: any) {
  const ruta = path.join(CARPETA_DATOS, archivo);
  if (!fs.existsSync(ruta)) {
    return porDefecto;
  }
  return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
}

export function guardarJson(archivo: string, datos: any) {
  fs.mkdirSync(CARPETA_DATOS, { recursive: true });
  const ruta = path.join(CARPETA_DATOS, archivo);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf-8');
}

export function leerNombres(): string[] {
  const texto = fs.readFileSync(ARCHIVO_NOMBRES, 'utf-8');
  return texto
    .split('\n')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre !== '');
}
