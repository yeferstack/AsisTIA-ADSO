// si el primero falla se prueba con el siguiente
const MODELOS = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

export interface Analisis {
  resumen: string;
  sugerencia: string; // VALIDA, NO VALIDA o SIN_SUGERENCIA
  razon: string;
}

export async function analizarExcusa(nombre: string, texto: string): Promise<Analisis> {
  const instruccion =
    'Eres el asistente de un instructor del SENA. Un aprendiz falto a clase y mando esta excusa.\n' +
    'Haz un resumen corto (maximo 20 palabras) y sugiere si la excusa es VALIDA o NO VALIDA.\n' +
    'Son validas: salud, citas medicas, calamidad familiar, problemas graves de transporte o tramites obligatorios.\n' +
    'No son validas: quedarse dormido, pereza, planes personales o excusas sin explicacion.\n' +
    'Responde solo con este JSON: {"resumen": "...", "sugerencia": "VALIDA" o "NO VALIDA", "razon": "..."}\n\n' +
    `Aprendiz: ${nombre}\nExcusa: ${texto}`;

  for (const modelo of MODELOS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruccion }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20000),
      });
      const datos = await respuesta.json();
      if (respuesta.ok) {
        const textoGemini = datos.candidates[0].content.parts[0].text;
        return JSON.parse(textoGemini);
      }
      console.log(`Error de Gemini (${modelo}):`, datos.error ? datos.error.message : respuesta.status);
    } catch (error) {
      console.log(`No se pudo analizar la excusa con ${modelo}:`, error.message);
    }
  }
  return sinAnalisis();
}

function sinAnalisis(): Analisis {
  return { resumen: 'No se pudo generar el resumen', sugerencia: 'SIN_SUGERENCIA', razon: '' };
}
