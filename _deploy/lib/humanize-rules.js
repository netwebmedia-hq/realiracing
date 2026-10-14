'use strict';
// Writing rules appended to every blog-queue generator's system prompt, so new posts come out
// without the usual AI-writing tells. Distilled from the humanizer skill (Wikipedia "Signs of AI
// writing"). Keep it short: each rule costs prompt tokens on every generation call.
//
//   const { withHumanizeRules } = require('./lib/humanize-rules.js');
//   system: withHumanizeRules(SYSTEM_PROMPT, 'en')   // 'en' | 'es' | 'both'

const EN = `WRITING STYLE. These rules apply to every sentence you write.
- No em dashes (—) or en dashes (–) in prose. Use a period, comma, colon or parentheses. Ranges keep a plain hyphen or the word "to".
- Never use "not X but Y", "isn't just X, it's Y", "not only X but also Y", or the split form "This doesn't mean X. It means Y." State the positive point directly.
- No one-line closers that restate the paragraph ("That is the real win.", "Read that again.") and no fragment runs ("No fluff. No jargon. Just results."). End a section on its last concrete fact.
- No staged openers: "Let's dive in", "Here's the thing", "Here's what you need to know", "Honestly?", "Look,", "The real question is", "At its core". Start with the point.
- Don't argue with a reader nobody mentioned ("You might think...", "A tempting approach would be...", "To be clear, I'm not saying...").
- Avoid triads built for rhythm. Use two or four items, or one developed example, when that is what the content has.
- Banned words: delve, tapestry, testament, pivotal, crucial, seamless, robust (figurative), landscape (abstract), game-changer, unlock, elevate, leverage, vibrant, showcase, underscore, "in today's fast-paced world". Say "is", "are" and "has" instead of "serves as", "stands as", "boasts".
- No inflated significance ("marks a pivotal moment", "a lasting legacy", "the future looks bright") and no sales language ("breathtaking", "stunning", "must-see", "renowned"). No send-off paragraph; end on the last useful fact.
- No bold labels on every list item, no emoji, no arrows as decoration, sentence-case headings.
- Vary sentence length. Short and long sentences should alternate. Use plain verbs and concrete nouns.`;

const ES = `ESTILO DE ESCRITURA. Estas reglas aplican a cada frase.
- Sin rayas largas (—) ni medias (–) en la prosa. Usa punto, coma, dos puntos o paréntesis. Los rangos llevan guion simple o "a".
- Nunca uses "no es solo X, es Y", "no se trata de X sino de Y", "no solo X sino también Y", ni la forma partida "Esto no significa X. Significa Y." Afirma el punto directamente.
- Sin cierres de una línea que repitan el párrafo ("Ese es el verdadero beneficio.") ni rachas de fragmentos ("Sin humo. Sin jerga. Solo resultados."). Termina cada sección con el último dato concreto.
- Sin entradas teatrales: "Vamos a ver", "La verdad es que", "En pocas palabras", "Esto es lo que necesitas saber", "La pregunta real es", "En el fondo". Empieza por el punto.
- No discutas con un lector que nadie mencionó ("Podrías pensar que...", "Una opción tentadora sería...", "Para ser claros, no digo que...").
- Evita tríadas armadas por ritmo. Usa dos o cuatro elementos, o un ejemplo desarrollado, cuando eso es lo que hay.
- Palabras vetadas: crucial, fundamental (como énfasis), panorama (abstracto), "sin duda", potenciar, "en el mundo acelerado de hoy". Usa "es", "son" y "tiene" en vez de "se erige como", "funge como", "cuenta con".
- Sin significancia inflada ("marca un hito", "un legado duradero", "el futuro es prometedor") ni lenguaje de venta ("impresionante", "imperdible", "de renombre"). Sin párrafo de despedida; cierra con el último dato útil.
- Sin negritas en cada ítem de lista, sin emojis, sin flechas decorativas, títulos en minúscula salvo la primera palabra y los nombres propios.
- Varía el largo de las frases. Alterna cortas y largas. Usa verbos simples y sustantivos concretos.`;

function humanizeRules(lang) {
  if (lang === 'es') return ES;
  if (lang === 'both') return `${EN}\n\n(For the Spanish text, the same rules apply in Spanish. Spanish version:)\n\n${ES}`;
  return EN;
}

function withHumanizeRules(systemPrompt, lang = 'en') {
  return `${systemPrompt}\n\n${humanizeRules(lang)}`;
}

module.exports = { humanizeRules, withHumanizeRules };
