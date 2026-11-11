#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <time.h>
#include "secretos.h"
#include "certificado.h"

#define PIN_PIR 19
#define PIN_TRIG 12
#define PIN_ECHO 14
#define PIN_TACTIL 4
#define PIN_SERVO 18
#define PIN_RELE 13

#define SERVO_CERRADO 0
#define SERVO_ABIERTO 90
#define DISTANCIA_PERSONA 50  // cm

const char* TOPIC_PRESENCIA = "sena/asistencia/presencia";
const char* TOPIC_REGISTRO = "sena/asistencia/registro";
const char* TOPIC_CONTEO = "sena/asistencia/conteo";
const char* TOPIC_CONTROL = "sena/asistencia/control";

WiFiClientSecure clienteWifi;
PubSubClient clienteMqtt(clienteWifi);
Servo talanquera;
LiquidCrystal_I2C lcd(0x27, 16, 2);

bool asistenciaAbierta = true;
int contadorPersonas = 0;
bool personaCerca = false;
int pirAnterior = LOW;
int tactilAnterior = LOW;
unsigned long ultimaMedicion = 0;

void mostrar(String linea1, String linea2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linea1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(linea2.substring(0, 16));
}

void mostrarEspera() {
  if (asistenciaAbierta) {
    mostrar("AsistIA SENA", "Asist. ABIERTA");
  } else {
    mostrar("AsistIA SENA", "Asist. CERRADA");
  }
}

void conectarWifi() {
  mostrar("Conectando WiFi", WIFI_NOMBRE);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NOMBRE, WIFI_CLAVE);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    intentos++;
    // cada 30 seg vuelve a intentar
    if (intentos % 60 == 0) {
      // 1 no encuentra red, 4 clave mala, 6 desconectado
      Serial.println("\nReintentando WiFi... estado: " + String(WiFi.status()));
      WiFi.disconnect();
      WiFi.begin(WIFI_NOMBRE, WIFI_CLAVE);
    }
  }
  Serial.println("\nWiFi conectado: " + WiFi.localIP().toString());
}

// el certificado necesita la hora
void sincronizarHora() {
  mostrar("Sincronizando", "hora NTP...");
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.google.com");  // hora colombia
  struct tm hora;
  while (!getLocalTime(&hora)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(&hora, "\nHora: %d/%m/%Y %H:%M:%S");
}

void abrirTalanquera(String nombre, String estado) {
  digitalWrite(PIN_RELE, HIGH);
  talanquera.write(SERVO_ABIERTO);
  mostrar("Bienvenido", nombre);
  delay(1500);
  mostrar(nombre, estado);
  delay(1500);
  talanquera.write(SERVO_CERRADO);
  mostrarEspera();
}

void alRecibirMensaje(char* topic, byte* datos, unsigned int largo) {
  String mensaje = "";
  for (unsigned int i = 0; i < largo; i++) {
    mensaje += (char)datos[i];
  }
  String tema = String(topic);
  Serial.println(tema + " -> " + mensaje);

  if (tema == TOPIC_CONTROL) {
    if (mensaje == "ABRIR") {
      asistenciaAbierta = true;
      contadorPersonas = 0;
    } else if (mensaje == "CERRAR") {
      asistenciaAbierta = false;
      digitalWrite(PIN_RELE, LOW);
    }
    mostrarEspera();
    return;
  }

  if (tema == TOPIC_REGISTRO) {
    if (!asistenciaAbierta) {
      return;
    }
    JsonDocument registro;
    if (deserializeJson(registro, mensaje)) {
      Serial.println("JSON invalido");
      return;
    }
    String nombre = registro["nombre"].as<String>();
    String estado = registro["estado"].as<String>();

    if (estado == "A_TIEMPO") {
      abrirTalanquera(nombre, "A TIEMPO");
    } else if (estado == "TARDE") {
      abrirTalanquera(nombre, "TARDE");
    } else {
      mostrar("NO REGISTRADO", "Acceso negado");
      delay(2000);
      mostrarEspera();
    }
  }
}

void conectarMqtt() {
  while (!clienteMqtt.connected()) {
    mostrar("Conectando", "MQTT...");
    String id = "esp32-puerta-" + String(random(0xffff), HEX);
    if (clienteMqtt.connect(id.c_str(), MQTT_USUARIO, MQTT_CLAVE)) {
      Serial.println("Conectado a MQTT");
      clienteMqtt.subscribe(TOPIC_REGISTRO);
      clienteMqtt.subscribe(TOPIC_CONTROL);
      mostrarEspera();
    } else {
      Serial.print("Fallo MQTT, codigo: ");
      Serial.println(clienteMqtt.state());
      delay(3000);
    }
  }
}

long medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracion = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracion == 0) {
    return 999;  // no hay nada cerca
  }
  return duracion * 0.034 / 2;
}

void revisarPir() {
  int pir = digitalRead(PIN_PIR);
  if (pir == HIGH && pirAnterior == LOW) {
    Serial.println("PIR: presencia detectada");
    clienteMqtt.publish(TOPIC_PRESENCIA, "DETECTADO");
    mostrar("Hola!", "Mire la camara");
  }
  if (pir == LOW && pirAnterior == HIGH) {
    mostrarEspera();
  }
  pirAnterior = pir;
}

void revisarTactil() {
  int tactil = digitalRead(PIN_TACTIL);
  // el tactil publica en control y el esp32 tambien lo escucha
  if (tactil == HIGH && tactilAnterior == LOW) {
    if (asistenciaAbierta) {
      clienteMqtt.publish(TOPIC_CONTROL, "CERRAR");
    } else {
      clienteMqtt.publish(TOPIC_CONTROL, "ABRIR");
    }
  }
  tactilAnterior = tactil;
}

void revisarUltrasonico() {
  if (millis() - ultimaMedicion < 100 || !asistenciaAbierta) {
    return;
  }
  ultimaMedicion = millis();
  long distancia = medirDistancia();

  // cuenta cuando pasa de lejos a cerca
  if (distancia < DISTANCIA_PERSONA && !personaCerca) {
    personaCerca = true;
    contadorPersonas++;
    Serial.println("Personas contadas: " + String(contadorPersonas));
    clienteMqtt.publish(TOPIC_CONTEO, String(contadorPersonas).c_str());
  } else if (distancia > DISTANCIA_PERSONA + 10) {
    personaCerca = false;
  }
}

void setup() {
  Serial.begin(115200);
  // pulldown para que no de falsas alarmas
  pinMode(PIN_PIR, INPUT_PULLDOWN);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT_PULLDOWN);
  pinMode(PIN_TACTIL, INPUT_PULLDOWN);
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, LOW);

  talanquera.setPeriodHertz(50);
  talanquera.attach(PIN_SERVO, 500, 2400);
  talanquera.write(SERVO_CERRADO);

  lcd.init();
  lcd.backlight();

  conectarWifi();
  sincronizarHora();

  clienteWifi.setCACert(CERTIFICADO_CA);
  clienteMqtt.setServer(MQTT_HOST, MQTT_PUERTO);
  clienteMqtt.setCallback(alRecibirMensaje);
  conectarMqtt();
}

void loop() {
  if (!clienteMqtt.connected()) {
    conectarMqtt();
  }
  clienteMqtt.loop();

  revisarPir();
  revisarTactil();
  revisarUltrasonico();
}
