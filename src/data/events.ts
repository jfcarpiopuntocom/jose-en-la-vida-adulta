import { GameEvent } from '../types';

// 33 eventos calibrados: magnitudes pequeñas/medias para no robar el helm al jugador.
// Cada evento negativo TIENE silver lining (validado en cosasQuePasanEngine).

export const events: GameEvent[] = [
  // ============ CRIMEN (4) ============
  {
    id: 'don_choro_robo',
    category: 'crimen',
    isNegative: true,
    baseWeight: 8,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 2 }],
    weights: [
      { when: { type: 'housing', value: 'rent_cheap' }, multiplier: 1.8 },
      { when: { type: 'statLt', key: 'reputation', value: 35 }, multiplier: 1.5 },
    ],
    effects: [
      { target: 'liquidity', operation: 'add', value: -120 },
      { target: 'stats', operation: 'add', key: 'stress', value: 15 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'resilience', value: 5 },
      { target: 'stats', operation: 'add', key: 'experience', value: 1 },
    ],
    narrative: {
      title: 'Don Choro hizo de las suyas',
      body: 'Te asaltaron camino a casa. Perdiste $120 y la tranquilidad de la semana.',
      silverLiningText: 'Aprendiste qué calles evitar. Esa cicatriz te hace más sagaz.',
    },
  },
  {
    id: 'hurto_inventario_menor',
    category: 'crimen',
    isNegative: true,
    baseWeight: 5,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 4 }],
    weights: [],
    effects: [{ target: 'liquidity', operation: 'add', value: -60 }],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'resilience', value: 3 },
    ],
    narrative: {
      title: 'Hurto menor',
      body: 'Un descuido en la Feria. Te volaron la cartera con $60.',
      silverLiningText: 'Ya sabes guardar el efectivo en dos lugares.',
    },
  },
  {
    id: 'estafa_telefono',
    category: 'crimen',
    isNegative: true,
    baseWeight: 4,
    importance: 1,
    conditions: [],
    weights: [{ when: { type: 'statLt', key: 'experience', value: 20 }, multiplier: 1.6 }],
    effects: [
      { target: 'liquidity', operation: 'add', value: -45 },
      { target: 'stats', operation: 'add', key: 'stress', value: 6 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'experience', value: 2 },
    ],
    narrative: {
      title: 'Estafa telefónica',
      body: 'Te llamaron haciéndose pasar por el banco. Caíste por $45.',
      silverLiningText: 'Ya no contestas números desconocidos.',
    },
  },
  {
    id: 'don_choro_redada',
    category: 'crimen',
    isNegative: false,
    baseWeight: 3,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 6 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'happiness', value: 5 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Cayó la banda de Don Choro',
      body: 'La policía atrapó a la banda. El barrio respira tranquilo.',
    },
  },

  // ============ FAMILIA (6) ============
  {
    id: 'tio_sabio_mentoria',
    category: 'familia',
    isNegative: false,
    baseWeight: 7,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 2 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'knowledge', value: 4 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Tu tío Pedro te invitó a un café',
      body: 'Hablaron tres horas. Te contó cómo levantó su negocio en los 90s.',
    },
  },
  {
    id: 'herencia_pequena',
    category: 'familia',
    isNegative: false,
    baseWeight: 2,
    importance: 3,
    conditions: [{ type: 'minTurn', value: 8 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: 600 },
      { target: 'stats', operation: 'add', key: 'happiness', value: -4 },
    ],
    silverLining: [],
    narrative: {
      title: 'Herencia inesperada',
      body: 'Tu abuela falleció y te dejó $600. Tristeza y oportunidad mezcladas.',
    },
  },
  {
    id: 'prestamo_familiar_solicitud',
    category: 'familia',
    isNegative: true,
    baseWeight: 6,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [{ when: { type: 'liquidityLt', value: 200 }, multiplier: 0.3 }],
    effects: [
      { target: 'liquidity', operation: 'add', value: -80 },
      { target: 'stats', operation: 'add', key: 'stress', value: 3 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'reputation', value: 4 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 2 },
    ],
    narrative: {
      title: 'Un primo te pidió prestado',
      body: 'No podías negarte. Soltaste $80.',
      silverLiningText: 'En la familia ahora te ven como el que ayuda.',
    },
  },
  {
    id: 'cumpleanos_familiar',
    category: 'familia',
    isNegative: false,
    baseWeight: 9,
    importance: 1,
    conditions: [],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: -30 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 6 },
      { target: 'stats', operation: 'add', key: 'stress', value: -4 },
    ],
    silverLining: [],
    narrative: {
      title: 'Cumpleaños de tía Rosa',
      body: 'Llevaste regalo y compartiste. Comida rica, risas, recargada de energía.',
    },
  },
  {
    id: 'recomendacion_laboral_primo',
    category: 'familia',
    isNegative: false,
    baseWeight: 5,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [{ when: { type: 'hasJob', value: false }, multiplier: 2.5 }],
    effects: [
      { target: 'stats', operation: 'add', key: 'dependability', value: 4 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Tu primo te recomendó',
      body: 'Habló bien de ti en su trabajo. Tu nombre suena en círculos nuevos.',
    },
  },
  {
    id: 'conflicto_familiar',
    category: 'familia',
    isNegative: true,
    baseWeight: 5,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 5 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'happiness', value: -6 },
      { target: 'stats', operation: 'add', key: 'stress', value: 8 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'resilience', value: 4 },
    ],
    narrative: {
      title: 'Discusión familiar fuerte',
      body: 'Reunión que terminó mal. Quedó el sabor amargo.',
      silverLiningText: 'A veces los límites se ponen así. Aprendiste a no ceder en todo.',
    },
  },

  // ============ SALUD (4) ============
  {
    id: 'gripe_invierno',
    category: 'salud',
    isNegative: true,
    baseWeight: 6,
    importance: 1,
    conditions: [],
    weights: [
      { when: { type: 'statGt', key: 'stress', value: 65 }, multiplier: 2.0 },
      { when: { type: 'statLt', key: 'health', value: 50 }, multiplier: 1.5 },
    ],
    effects: [
      { target: 'stats', operation: 'add', key: 'health', value: -12 },
      { target: 'liquidity', operation: 'add', value: -25 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'stress', value: -8 },
    ],
    narrative: {
      title: 'Te dio gripe',
      body: 'Tres días con fiebre. Gastaste $25 en medicinas.',
      silverLiningText: 'El cuerpo te obligó a parar. Bajó el estrés.',
    },
  },
  {
    id: 'enfermedad_estres',
    category: 'salud',
    isNegative: true,
    baseWeight: 4,
    importance: 2,
    conditions: [{ type: 'statGt', key: 'stress', value: 75 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'health', value: -20 },
      { target: 'stats', operation: 'add', key: 'happiness', value: -10 },
      { target: 'liquidity', operation: 'add', value: -80 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'resilience', value: 8 },
      { target: 'stats', operation: 'add', key: 'stress', value: -15 },
    ],
    narrative: {
      title: 'El estrés te pasó factura',
      body: 'Ataque de ansiedad. Médico, exámenes, $80. Una semana fuera de combate.',
      silverLiningText: 'Aprendiste a leer las señales. No te volverá a pasar tan fuerte.',
    },
  },
  {
    id: 'chequeo_rutina_bien',
    category: 'salud',
    isNegative: false,
    baseWeight: 4,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 4 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: -20 },
      { target: 'stats', operation: 'add', key: 'health', value: 5 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Chequeo médico',
      body: 'Pagaste $20 al doctor. Todo bien. Te tranquilizó saber.',
    },
  },
  {
    id: 'descanso_inesperado',
    category: 'salud',
    isNegative: false,
    baseWeight: 5,
    importance: 1,
    conditions: [],
    weights: [{ when: { type: 'statGt', key: 'stress', value: 50 }, multiplier: 1.5 }],
    effects: [
      { target: 'stats', operation: 'add', key: 'stress', value: -10 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 4 },
    ],
    silverLining: [],
    narrative: {
      title: 'Día gris ideal para descansar',
      body: 'Cancelaron una reunión. Tomaste la tarde para ti.',
    },
  },

  // ============ TRABAJO (5) ============
  {
    id: 'ascenso_inesperado',
    category: 'trabajo',
    isNegative: false,
    baseWeight: 3,
    importance: 3,
    conditions: [
      { type: 'minTurn', value: 6 },
      { type: 'hasJob', value: true },
      { type: 'statGt', key: 'dependability', value: 65 },
    ],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'leadership', value: 5 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 8 },
      { target: 'liquidity', operation: 'add', value: 150 },
    ],
    silverLining: [],
    narrative: {
      title: '¡Ascenso!',
      body: 'Te llamaron a oficina. Subida de cargo y bono de $150.',
    },
  },
  {
    id: 'despido_recorte',
    category: 'trabajo',
    isNegative: true,
    baseWeight: 3,
    importance: 3,
    conditions: [{ type: 'hasJob', value: true }, { type: 'minTurn', value: 5 }],
    weights: [{ when: { type: 'statLt', key: 'dependability', value: 40 }, multiplier: 2.0 }],
    effects: [
      { target: 'stats', operation: 'add', key: 'stress', value: 18 },
      { target: 'stats', operation: 'add', key: 'happiness', value: -10 },
    ],
    silverLining: [
      { target: 'liquidity', operation: 'add', value: 200 },
      { target: 'stats', operation: 'add', key: 'resilience', value: 10 },
    ],
    narrative: {
      title: 'Te despidieron',
      body: 'Recorte de personal. El cuello se cierra.',
      silverLiningText: 'Te dieron $200 de liquidación. Y por dentro, algo se endurece para mejor.',
    },
  },
  {
    id: 'oferta_freelance',
    category: 'trabajo',
    isNegative: false,
    baseWeight: 6,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [{ when: { type: 'statGt', key: 'knowledge', value: 25 }, multiplier: 1.5 }],
    effects: [
      { target: 'liquidity', operation: 'add', value: 90 },
      { target: 'stats', operation: 'add', key: 'experience', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Trabajito freelance',
      body: 'Un conocido te pidió un favor pagado. $90 limpios.',
    },
  },
  {
    id: 'jefe_te_felicita',
    category: 'trabajo',
    isNegative: false,
    baseWeight: 5,
    importance: 1,
    conditions: [{ type: 'hasJob', value: true }],
    weights: [{ when: { type: 'statGt', key: 'dependability', value: 60 }, multiplier: 1.8 }],
    effects: [
      { target: 'stats', operation: 'add', key: 'happiness', value: 4 },
      { target: 'stats', operation: 'add', key: 'dependability', value: 2 },
    ],
    silverLining: [],
    narrative: {
      title: 'Reconocimiento del jefe',
      body: 'Te felicitó delante del equipo. Vale.',
    },
  },
  {
    id: 'compañero_problemas',
    category: 'trabajo',
    isNegative: true,
    baseWeight: 4,
    importance: 1,
    conditions: [{ type: 'hasJob', value: true }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'stress', value: 6 },
      { target: 'stats', operation: 'add', key: 'happiness', value: -3 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'leadership', value: 2 },
    ],
    narrative: {
      title: 'Compañero conflictivo',
      body: 'Tuviste que mediar un drama en el trabajo. Se fue la mañana.',
      silverLiningText: 'Manejaste la situación. Algo de liderazgo se nota.',
    },
  },

  // ============ OPORTUNIDAD (5) ============
  {
    id: 'curso_gratis_municipio',
    category: 'oportunidad',
    isNegative: false,
    baseWeight: 6,
    importance: 1,
    conditions: [],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'knowledge', value: 5 },
      { target: 'time', operation: 'add', value: -6 },
    ],
    silverLining: [],
    narrative: {
      title: 'Curso gratis del municipio',
      body: 'Te metiste a un taller de 6 horas. Aprendiste algo útil.',
    },
  },
  {
    id: 'cliente_grande',
    category: 'oportunidad',
    isNegative: false,
    baseWeight: 3,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 4 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: 180 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 5 },
    ],
    silverLining: [],
    narrative: {
      title: 'Cliente grande inesperado',
      body: 'Un encargo gordo cayó del cielo. $180 y una referencia que vale.',
    },
  },
  {
    id: 'beca_pequena',
    category: 'oportunidad',
    isNegative: false,
    baseWeight: 2,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 5 }, { type: 'statGt', key: 'knowledge', value: 20 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: 250 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 6 },
    ],
    silverLining: [],
    narrative: {
      title: 'Beca de estudio',
      body: 'Aplicaste hace tiempo. Te llamaron. $250 para tus estudios.',
    },
  },
  {
    id: 'invitacion_red',
    category: 'oportunidad',
    isNegative: false,
    baseWeight: 5,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 2 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'reputation', value: 3 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 2 },
    ],
    silverLining: [],
    narrative: {
      title: 'Te invitaron a un evento',
      body: 'Networking en el Centro Histórico. Conociste gente.',
    },
  },
  {
    id: 'idea_negocio',
    category: 'oportunidad',
    isNegative: false,
    baseWeight: 4,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [{ when: { type: 'statGt', key: 'knowledge', value: 15 }, multiplier: 1.4 }],
    effects: [
      { target: 'stats', operation: 'add', key: 'experience', value: 2 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 3 },
    ],
    silverLining: [],
    narrative: {
      title: 'Se te prendió el foco',
      body: 'Caminando viste un nicho. Apuntaste todo en una libreta.',
    },
  },

  // ============ POLITICO (4) ============
  {
    id: 'impuesto_nuevo',
    category: 'politico',
    isNegative: true,
    baseWeight: 4,
    importance: 2,
    conditions: [{ type: 'minTurn', value: 4 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: -50 },
      { target: 'stats', operation: 'add', key: 'stress', value: 5 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'experience', value: 2 },
    ],
    narrative: {
      title: 'Nuevo impuesto municipal',
      body: 'El alcalde lo anunció. Te tocó pagar $50.',
      silverLiningText: 'Ya sabes leer la letra chica de los anuncios oficiales.',
    },
  },
  {
    id: 'subsidio_temporal',
    category: 'politico',
    isNegative: false,
    baseWeight: 3,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [{ when: { type: 'liquidityLt', value: 250 }, multiplier: 2.0 }],
    effects: [
      { target: 'liquidity', operation: 'add', value: 90 },
    ],
    silverLining: [],
    narrative: {
      title: 'Bono estatal',
      body: 'Salió un subsidio del gobierno. Te tocó algo: $90.',
    },
  },
  {
    id: 'tramite_largo',
    category: 'politico',
    isNegative: true,
    baseWeight: 5,
    importance: 1,
    conditions: [],
    weights: [],
    effects: [
      { target: 'time', operation: 'add', value: -8 },
      { target: 'stats', operation: 'add', key: 'stress', value: 6 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'experience', value: 1 },
    ],
    narrative: {
      title: 'Trámite eterno en oficina pública',
      body: 'Ocho horas haciendo cola. Burocracia pura.',
      silverLiningText: 'Aprendiste el sistema. La próxima vez vas directo a la ventanilla correcta.',
    },
  },
  {
    id: 'obra_publica_zona',
    category: 'politico',
    isNegative: false,
    baseWeight: 3,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 5 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'happiness', value: 3 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 2 },
    ],
    silverLining: [],
    narrative: {
      title: 'Arreglaron la avenida',
      body: 'Por fin asfaltaron. El barrio se nota distinto.',
    },
  },

  // ============ ECONOMIA (5) ============
  {
    id: 'inflacion_alimentos',
    category: 'economia',
    isNegative: true,
    baseWeight: 5,
    importance: 1,
    conditions: [{ type: 'minTurn', value: 3 }],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: -40 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'experience', value: 1 },
    ],
    narrative: {
      title: 'Subió el precio de la comida',
      body: 'El mercado amaneció más caro. $40 menos en la quincena.',
      silverLiningText: 'Empezaste a comparar precios. Eso se queda.',
    },
  },
  {
    id: 'bajada_combustible',
    category: 'economia',
    isNegative: false,
    baseWeight: 3,
    importance: 1,
    conditions: [],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: 25 },
    ],
    silverLining: [],
    narrative: {
      title: 'Bajó el combustible',
      body: 'Ahorraste $25 en transporte este quincena.',
    },
  },
  {
    id: 'cambio_economia_buena_a_mala',
    category: 'economia',
    isNegative: true,
    baseWeight: 2,
    importance: 3,
    conditions: [{ type: 'minTurn', value: 8 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'stress', value: 10 },
    ],
    silverLining: [
      { target: 'stats', operation: 'add', key: 'experience', value: 3 },
      { target: 'stats', operation: 'add', key: 'resilience', value: 5 },
    ],
    narrative: {
      title: 'Se anuncia recesión',
      body: 'Noticieros, redes, conversaciones. El ambiente económico se enfría.',
      silverLiningText: 'Los que aprendieron a navegar la última crisis hoy son los más sólidos.',
    },
  },
  {
    id: 'cambio_economia_mala_a_buena',
    category: 'economia',
    isNegative: false,
    baseWeight: 2,
    importance: 3,
    conditions: [{ type: 'minTurn', value: 10 }],
    weights: [],
    effects: [
      { target: 'stats', operation: 'add', key: 'happiness', value: 8 },
    ],
    silverLining: [],
    narrative: {
      title: 'Anuncian recuperación',
      body: 'Los indicadores giran. Se siente en la calle.',
    },
  },
  {
    id: 'oferta_remate_mercado',
    category: 'economia',
    isNegative: false,
    baseWeight: 4,
    importance: 1,
    conditions: [],
    weights: [],
    effects: [
      { target: 'liquidity', operation: 'add', value: 35 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 2 },
    ],
    silverLining: [],
    narrative: {
      title: 'Remate en el mercado',
      body: 'Aprovechaste rebajas. Ahorro real: $35.',
    },
  },
];

if (events.length < 33) {
  throw new Error(`events.ts debe tener al menos 33 eventos. Hay ${events.length}.`);
}
