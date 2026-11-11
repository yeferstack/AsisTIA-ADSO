# AsistIA SENA

Sistema de asistencia con reconocimiento facial para la ficha 3237831 de ADSO.

Equipo **XchanGo**

La camara reconoce al aprendiz cuando llega, el ESP32 abre la talanquera y prende un LED (verde a tiempo, rojo tarde), el bot de Telegram le avisa al instructor quien llego, quien falto y a quien le toca el aseo, y todo se puede ver y controlar desde una pagina web.

## Como funciona

1. El aprendiz llega y el sensor PIR lo detecta, en la pantalla LCD sale "Mire la camara".
2. `reconocer.py` reconoce la cara y publica el registro por MQTT.
3. El ESP32 recibe el registro, abre la talanquera y prende el LED verde (a tiempo) o rojo (tarde o no registrado).
4. El servidor guarda la llegada y sale en la pagina web.
5. A las 6 pm se cierra la asistencia: se le escribe a los ausentes, se le manda el resumen y el Excel al instructor y se sortea el aseo en el grupo.
6. Si el ausente manda una excusa, Gemini la resume y sugiere si es valida, y el instructor la acepta o la rechaza.

Todo se comunica por MQTT con un broker de EMQX (con TLS).

## Carpetas

| Carpeta | Que tiene |
|---|---|
| `reconocimiento/` | Python con OpenCV para capturar fotos, entrenar el modelo y reconocer caras |
| `esp32/` | Codigo del ESP32 con PlatformIO (sensores, servo, LCD y MQTT) |
| `servidor/` | Servidor en NestJS con el bot de Telegram, la pagina web y Gemini |
| `certificados/` | Certificado del broker EMQX |

## Topics MQTT

| Topic | Quien publica | Mensaje |
|---|---|---|
| `sena/asistencia/registro` | reconocer.py | `{"nombre": "...", "hora": "12:25:10", "estado": "A_TIEMPO"}` |
| `sena/asistencia/control` | bot, tactil del ESP32 | `ABRIR` o `CERRAR` |
| `sena/asistencia/presencia` | ESP32 | `DETECTADO` |
| `sena/asistencia/conteo` | ESP32 | numero de personas |
| `sena/asistencia/led` | pagina web | `ENCENDER_VERDE`, `APAGAR_VERDE`, `ENCENDER_ROJO`, `APAGAR_ROJO` |
| `sena/asistencia/led/estado` | ESP32 | `{"verde": true, "rojo": false}` |

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
GEMINI_API_KEY=
```

La clave de Gemini se saca en https://aistudio.google.com/apikey. El token se saca con @BotFather en Telegram. El chat del instructor se puede ver con @userinfobot y el del grupo sale en la consola del servidor cuando escriben `/ayuda` en el grupo (es un numero negativo).

## Reconocimiento facial

Necesita Python 3 y una camara.

```
cd reconocimiento
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe capturar_rostros.py
venv\Scripts\python.exe entrenar.py
venv\Scripts\python.exe reconocer.py
```

Si sale `No module named 'cv2'` es porque no se esta usando el python del venv.

- `capturar_rostros.py` toma 50 fotos del aprendiz, el nombre va sin tildes.
- `entrenar.py` crea `modelo.yml` y `nombres.txt`. Hay que correrlo cada vez que se toman fotos nuevas.
- Si sale NO REGISTRADO es mejor volver a tomar las fotos con la misma luz del salon y entrenar otra vez.
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

### Conexiones de la maqueta

Resumen de pines: G4 tactil, G12 Trig, G13 rele, G14 Echo, G18 servo, G19 PIR, G21 SDA, G22 SCL, G26 LED verde, G27 LED rojo.

**Lineas de la protoboard**
- V5 del ESP32 a la linea de 5V (arriba)
- 3V3 del ESP32 a la linea de 3V3 (abajo)
- GND del ESP32 a la linea GND de arriba y a la de abajo (unidas con un cable)

| Componente | Conexion |
|---|---|
| PIR | VCC a 5V, OUT a G19, GND a GND |
| Servo SG90 (talanquera) | Naranja a 5V, cafe a GND, amarillo a G18 |
| Rele | + a 5V, - a GND, S a G13. Tornillo COM a 5V y tornillo NO al LED de la luz |
| LED de la luz (del rele) | NO del rele, resistencia de 220, pata larga del LED, pata corta a GND |
| LCD 16x2 I2C | VCC a 5V, GND a GND, SDA a G21, SCL a G22 (direccion 0x27) |
| Ultrasonico HC-SR04 | VCC a 3V3, GND a GND, Trig a G12, Echo a G14 |
| Sensor tactil TTP223 | VCC a 3V3, GND a GND, I/O a G4 |
| LED verde | G26, resistencia de 220, pata larga del LED, pata corta a GND |
| LED rojo | G27, resistencia de 220, pata larga del LED, pata corta a GND |
| Camara | Es la del portatil, no va al ESP32 |

```
  ESP32
  G26 ----[220]----|>|---- GND     LED verde (a tiempo)
  G27 ----[220]----|>|---- GND     LED rojo (tarde o no registrado)
                 pata   pata
                 larga  corta
```

**Si algo falla**
- Si el ultrasonico no cuenta bien puede ser por la alimentacion de 3V3, el HC-SR04 normal funciona mejor a 5V pero el Echo necesita un divisor de voltaje para no danar el ESP32 (el HC-SR04P si funciona a 3V3).
- Si el ESP32 se reinicia cuando se mueve el servo, alimentar el servo con una fuente de 5V aparte uniendo los GND.
- Si un LED no prende probablemente esta al reves, la pata larga va hacia la resistencia.

## Servidor y bot de Telegram

```
cd servidor
npm install
npm run start:dev
```

Los datos se guardan en archivos JSON en `servidor/datos/` (aprendices, asistencia, aseo y excusas).

La pagina web queda en http://localhost:3000

### Pagina web

- Lista en tiempo real de quien llego, a que hora y si fue a tiempo o tarde (se actualiza sola cada 2 segundos).
- Estado de los LED de la maqueta e interruptores para prenderlos y apagarlos.
- Botones para generar el Excel, hacer el sorteo del aseo y enviar los Telegram.
- Excusas por revisar con el resumen de Gemini y botones para aceptar o rechazar.

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

- Cuando se cierra la asistencia le escribe a cada ausente para que mande su excusa.
- La excusa la resume Gemini y sugiere si es VALIDA o NO VALIDA, pero el que decide es el instructor con los botones Aceptar o Rechazar (en Telegram o en la pagina). Al aprendiz le llega la respuesta.
- Sortea el aseo entre los que llegaron tarde (si no alcanzan se completa con los ausentes): Trapero, Escoba y Trapito.
- Si alguien completa 3 fallas seguidas le avisa al instructor por riesgo de desercion.
- Si alguien lleva 2 llegadas tarde en la semana le manda un mensaje de animo.
- Si en un dia no llega nadie no cierra la asistencia (festivo).
