import cv2
import os
import json
import time
from datetime import datetime
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

HORA_INICIO = "12:00"
HORA_CORTE = "12:30"
UMBRAL = 55  # entre mas bajo mas se parece
VECES_PARA_CONFIRMAR = 5  # veces seguidas para confirmar
TOPIC_REGISTRO = "sena/asistencia/registro"

load_dotenv("../.env")


def al_conectar(cliente, datos, banderas, codigo, propiedades):
    if codigo == 0:
        print("Conectado al broker MQTT")
    else:
        print(f"No se pudo conectar al broker: {codigo}")


cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
cliente.username_pw_set(os.getenv("MQTT_USUARIO"), os.getenv("MQTT_CLAVE"))
cliente.tls_set(ca_certs="../certificados/emqxsl-ca.crt")
cliente.on_connect = al_conectar
cliente.connect(os.getenv("MQTT_HOST"), int(os.getenv("MQTT_PUERTO")))
cliente.loop_start()


def publicar_registro(nombre, hora, estado):
    mensaje = json.dumps({"nombre": nombre, "hora": hora, "estado": estado})
    cliente.publish(TOPIC_REGISTRO, mensaje, qos=1)
    print(f"Publicado: {mensaje}")


if not os.path.exists("modelo.yml"):
    print("No existe modelo.yml. Primero ejecuta: python entrenar.py")
    exit()

reconocedor = cv2.face.LBPHFaceRecognizer_create()
reconocedor.read("modelo.yml")

with open("nombres.txt", encoding="utf-8") as archivo:
    nombres = archivo.read().splitlines()

detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
camara = cv2.VideoCapture(0)
registrados = {}
ultimo_desconocido = 0
candidato = ""
veces_seguidas = 0


def calcular_estado():
    ahora = datetime.now().strftime("%H:%M")
    if ahora <= HORA_CORTE:
        return "A_TIEMPO"
    return "TARDE"


print(f"Clase: inicio {HORA_INICIO} - corte {HORA_CORTE}. ESC para salir.")

while True:
    ok, imagen = camara.read()
    if not ok:
        print("No se pudo leer la camara")
        break

    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    caras = detector.detectMultiScale(gris, 1.3, 5)

    for (x, y, w, h) in caras:
        rostro = cv2.resize(gris[y:y + h, x:x + w], (200, 200))
        etiqueta, distancia = reconocedor.predict(rostro)

        if distancia < UMBRAL:
            nombre = nombres[etiqueta]
        else:
            nombre = "DESCONOCIDO"

        # tiene que salir la misma cara varias veces
        if nombre == candidato:
            veces_seguidas += 1
        else:
            candidato = nombre
            veces_seguidas = 1
        confirmado = veces_seguidas >= VECES_PARA_CONFIRMAR

        if not confirmado:
            texto = f"Verificando... {veces_seguidas}/{VECES_PARA_CONFIRMAR}"
            color = (255, 255, 0)
        elif nombre != "DESCONOCIDO":
            # solo se registra la primera vez
            if nombre not in registrados:
                hora = datetime.now().strftime("%H:%M:%S")
                registrados[nombre] = {"hora": hora, "estado": calcular_estado()}
                print(f"{nombre} llego a las {hora} -> {registrados[nombre]['estado']}")
                publicar_registro(nombre, hora, registrados[nombre]["estado"])

            estado = registrados[nombre]["estado"]
            texto = f"{nombre} - {estado}"
            color = (0, 255, 0) if estado == "A_TIEMPO" else (0, 165, 255)
        else:
            texto = "NO REGISTRADO"
            color = (0, 0, 255)
            # el desconocido cada 10 segundos para no llenar el broker
            if time.time() - ultimo_desconocido > 10:
                ultimo_desconocido = time.time()
                publicar_registro("DESCONOCIDO", datetime.now().strftime("%H:%M:%S"), "DESCONOCIDO")

        cv2.rectangle(imagen, (x, y), (x + w, y + h), color, 2)
        cv2.putText(imagen, texto, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        cv2.putText(imagen, f"distancia: {int(distancia)}", (x, y + h + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    cv2.imshow("AsistIA SENA", imagen)
    if cv2.waitKey(1) == 27:
        break

cliente.loop_stop()
cliente.disconnect()
camara.release()
cv2.destroyAllWindows()
