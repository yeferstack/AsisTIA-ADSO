import cv2
import os

TOTAL_FOTOS = 50

nombre = input("Nombre del aprendiz (sin tildes): ").strip()
carpeta = os.path.join("fotos", nombre)
os.makedirs(carpeta, exist_ok=True)

detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
camara = cv2.VideoCapture(0)
contador = 0

print("Mira a la camara y mueve un poco la cabeza. ESC para salir.")

while contador < TOTAL_FOTOS:
    ok, imagen = camara.read()
    if not ok:
        print("No se pudo leer la camara")
        break

    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    caras = detector.detectMultiScale(gris, 1.3, 5)

    # solo la primera cara
    for (x, y, w, h) in caras[:1]:
        rostro = cv2.resize(gris[y:y + h, x:x + w], (200, 200))
        contador += 1
        cv2.imwrite(os.path.join(carpeta, f"{contador}.jpg"), rostro)
        cv2.rectangle(imagen, (x, y), (x + w, y + h), (0, 255, 0), 2)

    cv2.putText(imagen, f"Fotos: {contador}/{TOTAL_FOTOS}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    cv2.imshow("Captura de rostros", imagen)

    if cv2.waitKey(100) == 27:
        break

print(f"Se guardaron {contador} fotos en {carpeta}")
camara.release()
cv2.destroyAllWindows()
