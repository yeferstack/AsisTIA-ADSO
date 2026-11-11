let nombresAnteriores = [];
let primeraVez = true;

async function actualizar() {
  try {
    const respuesta = await fetch('/api/estado');
    const datos = await respuesta.json();
    mostrarDatos(datos);
    document.getElementById('enVivo').className = 'en-vivo conectado';
    document.getElementById('textoConexion').textContent = 'En vivo';
  } catch (error) {
    document.getElementById('enVivo').className = 'en-vivo sin-conexion';
    document.getElementById('textoConexion').textContent = 'Sin conexion';
  }
}

function mostrarDatos(datos) {
  document.getElementById('fecha').textContent = 'Hoy ' + datos.fecha;

  const etiqueta = document.getElementById('estadoAsistencia');
  if (datos.cerrada) {
    etiqueta.textContent = 'Asistencia cerrada';
    etiqueta.className = 'etiqueta cerrada';
  } else {
    etiqueta.textContent = 'Asistencia abierta';
    etiqueta.className = 'etiqueta abierta';
  }

  document.getElementById('totalATiempo').textContent = datos.aTiempo;
  document.getElementById('totalTarde').textContent = datos.tardes;
  document.getElementById('totalAusentes').textContent = datos.ausentes.length;

  mostrarLlegadas(datos.llegadas);

  if (datos.ausentes.length > 0) {
    document.getElementById('listaAusentes').textContent = datos.ausentes.join(', ');
  } else {
    document.getElementById('listaAusentes').textContent = 'nadie';
  }

  mostrarLed('cajaVerde', 'interruptorVerde', 'textoVerde', 'encendido-verde', datos.leds.verde);
  mostrarLed('cajaRojo', 'interruptorRojo', 'textoRojo', 'encendido-rojo', datos.leds.rojo);

  mostrarSorteo(datos.sorteo);
  mostrarExcusas(datos.excusas);
}

// para que lo que escriba el aprendiz no se meta como html
function limpiar(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mostrarExcusas(excusas) {
  document.getElementById('totalExcusas').textContent = excusas.length;
  const lista = document.getElementById('listaExcusas');

  // si no cambio nada no se vuelve a dibujar
  const ids = excusas.map((excusa) => excusa.id + (excusa.resumen || '')).join(',');
  if (lista.dataset.ids == ids && ids != '') {
    return;
  }
  lista.dataset.ids = ids;

  if (excusas.length == 0) {
    lista.innerHTML = '<p class="vacio">No hay excusas por revisar</p>';
    return;
  }

  let html = '';
  for (const excusa of excusas) {
    let claseSugerencia = 'sugerencia';
    if (excusa.sugerencia == 'VALIDA') {
      claseSugerencia = 'sugerencia valida';
    } else if (excusa.sugerencia == 'NO VALIDA') {
      claseSugerencia = 'sugerencia no-valida';
    }

    let cajaIa = '<p>Analizando con IA...</p>';
    if (excusa.resumen) {
      cajaIa = `
        <p><b>Resumen:</b> ${limpiar(excusa.resumen)}</p>
        <p><b>Sugerencia:</b> <span class="${claseSugerencia}">${limpiar(excusa.sugerencia)}</span></p>
        <p>${limpiar(excusa.razon)}</p>`;
    }

    html += `
      <div class="excusa">
        <div class="excusa-cabecera">
          <b>${limpiar(excusa.nombre)}</b>
          <small>Falto el ${excusa.fecha}</small>
        </div>
        <p class="texto-excusa">"${limpiar(excusa.texto)}"</p>
        <div class="caja-ia">
          <p class="titulo-ia">Gemini IA</p>
          ${cajaIa}
        </div>
        <div class="decision">
          <button class="boton-aceptar" onclick="decidirExcusa(${excusa.id}, 'ACEPTADA')">Aceptar</button>
          <button class="boton-rechazar" onclick="decidirExcusa(${excusa.id}, 'RECHAZADA')">Rechazar</button>
        </div>
      </div>`;
  }
  lista.innerHTML = html;
}

async function decidirExcusa(id, decision) {
  const respuesta = await enviarPost('/api/excusa', { id: id, decision: decision });
  mostrarMensaje(respuesta.mensaje);
  actualizar();
}

function mostrarLlegadas(llegadas) {
  let html = '';
  for (const llegada of llegadas) {
    let clase = 'llegada llegada-a-tiempo';
    let texto = 'A tiempo';
    if (llegada.estado == 'TARDE') {
      clase = 'llegada llegada-tarde';
      texto = 'Tarde';
    }

    // si es alguien que acaba de llegar se anima y sale el aviso
    if (!nombresAnteriores.includes(llegada.nombre) && !primeraVez) {
      clase += ' nueva';
      mostrarMensaje('Llego ' + llegada.nombre + ' - ' + texto);
    }

    html += `
      <div class="${clase}">
        <div class="inicial">${llegada.nombre[0]}</div>
        <div class="datos">
          <b>${llegada.nombre}</b>
          <small>Llego a las ${llegada.hora}</small>
        </div>
        <span class="insignia">${texto}</span>
      </div>`;
  }

  if (html == '') {
    html = '<p class="vacio">Todavia no ha llegado nadie</p>';
  }
  document.getElementById('listaLlegadas').innerHTML = html;

  nombresAnteriores = llegadas.map((llegada) => llegada.nombre);
  primeraVez = false;
}

function mostrarLed(idCaja, idInterruptor, idTexto, clase, encendido) {
  const caja = document.getElementById(idCaja);
  document.getElementById(idInterruptor).checked = encendido;
  if (encendido) {
    caja.classList.add(clase);
    document.getElementById(idTexto).textContent = 'Encendido';
  } else {
    caja.classList.remove(clase);
    document.getElementById(idTexto).textContent = 'Apagado';
  }
}

function mostrarSorteo(sorteo) {
  const caja = document.getElementById('sorteo');
  if (!sorteo) {
    caja.className = 'sorteo-vacio';
    caja.textContent = 'Todavia no se ha hecho el sorteo de hoy.';
    return;
  }
  if (sorteo.asignados.length == 0) {
    caja.className = 'sorteo-vacio';
    caja.textContent = 'Todos llegaron a tiempo, no hay aseo.';
    return;
  }

  // para no repetir la animacion cada 2 segundos
  if (caja.dataset.sorteo == sorteo.fecha) {
    return;
  }
  caja.className = '';
  caja.dataset.sorteo = sorteo.fecha;
  caja.innerHTML = crearHtmlSorteo(sorteo);
}

function crearHtmlSorteo(sorteo) {
  let html = `<p class="dia-aseo">Aseo para el ${sorteo.fecha}</p>`;
  for (const asignado of sorteo.asignados) {
    html += `<div class="tarea"><b>${asignado.nombre}</b><span>${asignado.tarea}</span></div>`;
  }
  return html;
}

async function enviarPost(url, datos) {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  return respuesta.json();
}

function mostrarMensaje(texto) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.classList.add('mostrar');
  setTimeout(() => aviso.classList.remove('mostrar'), 3500);
}

async function cambiarLed(color, encender) {
  await enviarPost('/api/led', { color: color, encender: encender });
  if (encender) {
    mostrarMensaje('Encendiendo LED ' + color);
  } else {
    mostrarMensaje('Apagando LED ' + color);
  }
}

function generarExcel() {
  window.location.href = '/api/excel';
  mostrarMensaje('Descargando el Excel...');
}

async function hacerSorteo() {
  const sorteo = await enviarPost('/api/sorteo', {});
  mostrarSorteo(sorteo);
  mostrarMensaje('Sorteo hecho y enviado al grupo');
}

async function enviarTelegram() {
  if (!confirm('Esto cierra la asistencia de hoy y les escribe a los ausentes. Continuar?')) {
    return;
  }
  const respuesta = await enviarPost('/api/telegram', {});
  mostrarMensaje(respuesta.mensaje);
}

function mostrarReloj() {
  const ahora = new Date();
  document.getElementById('reloj').textContent = ahora.toLocaleTimeString('es-CO');
}

mostrarReloj();
setInterval(mostrarReloj, 1000);
actualizar();
setInterval(actualizar, 2000);
