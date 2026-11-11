# AsistIA SENA

Sistema de asistencia con reconocimiento facial para la ficha 3237831 de ADSO.

Equipo **XchanGo**

La camara reconoce al aprendiz cuando llega, el ESP32 abre la talanquera y el bot de Telegram le avisa al instructor quien llego, quien falto y a quien le toca el aseo.

## Como funciona

1. El aprendiz llega y el sensor PIR lo detecta, en la pantalla LCD sale "Mire la camara".
2. `reconocer.py` reconoce la cara y publica el registro por MQTT.
3. El ESP32 recibe el registro y abre la talanquera.
4. El servidor (bot de Telegram) guarda la llegada.
5. A las 6 pm se cierra la asistencia: se le escribe a los ausentes, se le manda el resumen y el Excel al instructor y se sortea el aseo en el grupo.

Todo se comunica por MQTT con un broker de EMQX (con TLS).

## Carpetas

| Carpeta | Que tiene |
|---|---|
| `reconocimiento/` | Python con OpenCV para capturar fotos, entrenar el modelo y reconocer caras |
| `esp32/` | Codigo del ESP32 con PlatformIO (sensores, servo, LCD y MQTT) |
| `servidor/` | Servidor en NestJS con el bot de Telegram |
| `certificados/` | Certificado del broker EMQX |

## Topics MQTT

| Topic | Quien publica | Mensaje |
|---|---|---|
| `sena/asistencia/registro` | reconocer.py | `{"nombre": "...", "hora": "12:25:10", "estado": "A_TIEMPO"}` |
| `sena/asistencia/control` | bot, tactil del ESP32 | `ABRIR` o `CERRAR` |
| `sena/asistencia/presencia` | ESP32 | `DETECTADO` |
| `sena/asistencia/conteo` | ESP32 | numero de personas |

## Horario

- 12:00 se abre la asistencia
- 12:30 entrada, despues de esa hora es TARDE
- 5:00 pm recordatorio del aseo en el grupo
- 6:00 pm se cierra la asistencia

Las horas se cambian en `servidor/src/telegram/asistencia.ts`.

## Archivo .env

Va en la raiz del proyecto (no se sube a github):

```
MQTT_HOST=
MQTT_PUERTO=
MQTT_USUARIO=
MQTT_CLAVE=
TELEGRAM_TOKEN=
TELEGRAM_CHAT_INSTRUCTOR=
TELEGRAM_GRUPO=
```

El token se saca con @BotFather en Telegram. El chat del instructor se puede ver con @userinfobot y el del grupo sale en la consola del servidor cuando escriben `/ayuda` en el grupo (es un numero negativo).

## Reconocimiento facial

Necesita Python 3 y una camara.

```
cd reconocimiento
pip install -r requirements.txt
python capturar_rostros.py
python entrenar.py
python reconocer.py
```

- `capturar_rostros.py` toma 50 fotos del aprendiz, el nombre va sin tildes.
- `entrenar.py` crea `modelo.yml` y `nombres.txt`.
- `reconocer.py` reconoce y publica en MQTT. Con ESC se sale.
- `escuchar.py` es para probar, muestra todo lo que llega al broker.

## ESP32

Se abre la carpeta `esp32` con PlatformIO en VS Code. Hay que crear `esp32/include/secretos.h` (no se sube a github):

```cpp
#define WIFI_NOMBRE "nombre del wifi"
#define WIFI_CLAVE "clave"
#define MQTT_HOST "host del broker"
#define MQTT_PUERTO 8883
#define MQTT_USUARIO "usuario"
#define MQTT_CLAVE "clave"
```

Pines:

| Componente | Pin |
|---|---|
| Sensor PIR | 19 |
| Ultrasonico TRIG | 12 |
| Ultrasonico ECHO | 14 |
| Sensor tactil | 4 |
| Servo (talanquera) | 18 |
| Rele | 13 |
| LCD I2C | SDA 21, SCL 22 (direccion 0x27) |

## Servidor y bot de Telegram

```
cd servidor
npm install
npm run start:dev
```

Los datos se guardan en archivos JSON en `servidor/datos/` (aprendices, asistencia, aseo y excusas).

### Comandos del bot

Aprendiz:
- `/start` registrarse eligiendo su nombre
- `/fallas` cuantas fallas y llegadas tarde lleva
- `/aseo` si le toca aseo, que dia y que tarea
- `/ayuda` lista de comandos

Instructor:
- `/hoy` quien ha llegado hoy y a que hora
- `/excel` Excel de la asistencia del dia
- `/cerrar` cerrar la asistencia ya
- `/ayuda` lista de comandos

### Que hace el bot solo

- Cuando se cierra la asistencia le escribe a cada ausente para que mande su excusa, y la excusa le llega al instructor.
- Sortea el aseo entre los que llegaron tarde (si no alcanzan se completa con los ausentes): Trapero, Escoba y Trapito.
- Si alguien completa 3 fallas seguidas le avisa al instructor por riesgo de desercion.
- Si alguien lleva 2 llegadas tarde en la semana le manda un mensaje de animo.
- Si en un dia no llega nadie no cierra la asistencia (festivo).

## Pendiente

- Clasificar las excusas con Gemini (VALIDA o NO VALIDA).
