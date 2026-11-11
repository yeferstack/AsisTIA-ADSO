import cv2
import os
import numpy as np

rostros = []
etiquetas = []
nombres = []

for nombre in sorted(os.listdir("fotos")):
    carpeta = os.path.join("fotos", nombre)
    if not os.path.isdir(carpeta):
        continue

    nombres.append(nombre)
    etiqueta = len(nombres) - 1

    for archivo in os.listdir(carpeta):
        imagen = cv2.imread(os.path.join(carpeta, archivo), cv2.IMREAD_GRAYSCALE)
        if imagen is None:
            continue
        rostros.append(imagen)
        etiquetas.append(etiqueta)

    print(f"Leyendo fotos de {nombre}")

if len(rostros) == 0:
    print("No hay fotos. Primero ejecuta capturar_rostros.py")
    exit()

print("Entrenando modelo...")
reconocedor = cv2.face.LBPHFaceRecognizer_create()
reconocedor.train(rostros, np.array(etiquetas))
reconocedor.write("modelo.yml")

with open("nombres.txt", "w", encoding="utf-8") as archivo:
    archivo.write("\n".join(nombres))

print(f"Modelo guardado con {len(nombres)} aprendices y {len(rostros)} fotos")
