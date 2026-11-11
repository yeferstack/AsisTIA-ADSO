import os
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# prueba para ver lo que llega al broker
load_dotenv("../.env")


def al_conectar(cliente, datos, banderas, codigo, propiedades):
    if codigo == 0:
        print("Conectado. Escuchando sena/asistencia/# (Ctrl + C para salir)")
        cliente.subscribe("sena/asistencia/#")
    else:
        print(f"No se pudo conectar al broker: {codigo}")


def al_recibir(cliente, datos, mensaje):
    print(f"{mensaje.topic} -> {mensaje.payload.decode()}")


cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
cliente.username_pw_set(os.getenv("MQTT_USUARIO"), os.getenv("MQTT_CLAVE"))
cliente.tls_set(ca_certs="../certificados/emqxsl-ca.crt")
cliente.on_connect = al_conectar
cliente.on_message = al_recibir
cliente.connect(os.getenv("MQTT_HOST"), int(os.getenv("MQTT_PUERTO")))
cliente.loop_forever()
