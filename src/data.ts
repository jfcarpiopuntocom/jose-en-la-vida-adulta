import { Location, Barrio, Job, Degree, GameEvent, Personality } from './types';

// TABLERO: 13 stops funcionales en loop ovalado (no rectangular), siguiendo la idea
// de "alrededor del río + bastante Centro". Aquí NO se nace — solo se actúa y circula.
export const LOCATIONS: Location[] = [
  { id:'casa',               code:'CASA', name:'Tu Casa',         zone:'hogar',       crimeRisk:15, x:380, y:60,  icon:'🏠', tc:{walk:0,bus:0,taxi:0,bicycle:0,motorcycle:0,car:0} },
  { id:'zona_universitaria', code:'UNI',  name:'Universidad (UDA)',zone:'universitaria',crimeRisk:15, x:529, y:81,  icon:'🎓', tc:{walk:3.5,bus:1,taxi:0.5,bicycle:1.5,motorcycle:0.75,car:0.5} },
  { id:'zona_financiera',    code:'FIN',  name:'Z. Financiera',   zone:'financiera',  crimeRisk:10, x:644, y:138, icon:'🏦', tc:{walk:3,bus:1,taxi:0.5,bicycle:1.5,motorcycle:0.75,car:0.5} },
  { id:'terminal',           code:'TER',  name:'Terminal Terrestre',zone:'transporte',crimeRisk:35, x:698, y:218, icon:'🚌', tc:{walk:4,bus:1,taxi:0.5,bicycle:2,motorcycle:1,car:0.5} },
  { id:'zona_industrial',    code:'IND',  name:'Z. Industrial',   zone:'industrial',  crimeRisk:25, x:679, y:304, icon:'🏭', tc:{walk:5,bus:2,taxi:1,bicycle:2.5,motorcycle:1.25,car:1} },
  { id:'hospital',           code:'HOS',  name:'Hospital',        zone:'salud',       crimeRisk:10, x:592, y:375, icon:'🏥', tc:{walk:3,bus:1.5,taxi:0.5,bicycle:1.5,motorcycle:0.75,car:0.5} },
  { id:'feria_libre',        code:'FER',  name:'Feria Libre',     zone:'comercial',   crimeRisk:45, x:456, y:415, icon:'🛒', tc:{walk:4,bus:1.5,taxi:0.75,bicycle:2,motorcycle:1,car:0.75} },
  { id:'centro_historico',   code:'CEN',  name:'Centro Histórico',zone:'centro',      crimeRisk:30, x:304, y:415, icon:'⛪', tc:{walk:3,bus:1,taxi:0.5,bicycle:1.5,motorcycle:0.75,car:0.5} },
  { id:'parque_calderon',    code:'PAR',  name:'Parque Calderón', zone:'centro',      crimeRisk:20, x:168, y:375, icon:'🌳', tc:{walk:2.5,bus:1,taxi:0.5,bicycle:1.25,motorcycle:0.6,car:0.5} },
  { id:'rio_tomebamba',      code:'RIO',  name:'Río Tomebamba',   zone:'rio',         crimeRisk:18, x:81,  y:304, icon:'🌉', tc:{walk:2,bus:1,taxi:0.5,bicycle:1,motorcycle:0.5,car:0.5} },
  { id:'municipio',          code:'MUN',  name:'Municipio',       zone:'politico',    crimeRisk:15, x:62,  y:218, icon:'🏛️', tc:{walk:3,bus:1,taxi:0.5,bicycle:1.5,motorcycle:0.75,car:0.5} },
  { id:'mall_rio',           code:'MAL',  name:'Mall del Río',    zone:'comercial',   crimeRisk:12, x:117, y:138, icon:'🛍️', tc:{walk:4,bus:1.5,taxi:0.75,bicycle:2,motorcycle:1,car:0.6} },
  { id:'estadio',            code:'EST',  name:'Estadio',         zone:'deporte',     crimeRisk:22, x:231, y:81,  icon:'⚽', tc:{walk:3,bus:1.25,taxi:0.6,bicycle:1.5,motorcycle:0.75,car:0.5} },
];
export const locById = (id: string): Location => LOCATIONS.find(l => l.id === id)!;
// orden del recorrido del tablero (loop ovalado cerrado, estilo Jones/Monopoly)
export const PATH_ORDER = LOCATIONS.map(l => l.id);

// BARRIOS reales de Cuenca — solo para nacimiento/origen familiar, NO son stops del tablero
export const BARRIOS: Barrio[] = [
  { id:'centro_colonial',   name:'El Centro (Casco Colonial)', crimeRisk:30 },
  { id:'san_sebastian',     name:'San Sebastián',              crimeRisk:25 },
  { id:'san_blas',          name:'San Blas',                   crimeRisk:28 },
  { id:'el_vado',           name:'El Vado',                    crimeRisk:32 },
  { id:'todos_santos',      name:'Todos Santos',                crimeRisk:22 },
  { id:'las_herrerias',     name:'Las Herrerías',               crimeRisk:24 },
  { id:'el_ejido',          name:'El Ejido',                    crimeRisk:14 },
  { id:'yanuncay',          name:'Yanuncay',                    crimeRisk:20 },
  { id:'remigio_crespo',    name:'Remigio Crespo',              crimeRisk:12 },
  { id:'gran_colombia',     name:'Gran Colombia',               crimeRisk:26 },
  { id:'totoracocha',       name:'Totoracocha',                 crimeRisk:35 },
  { id:'el_vergel',         name:'El Vergel',                   crimeRisk:18 },
  { id:'miraflores',        name:'Miraflores',                  crimeRisk:16 },
  { id:'bellavista',        name:'Bellavista',                  crimeRisk:15 },
  { id:'maria_auxiliadora', name:'María Auxiliadora',           crimeRisk:38 },
  { id:'sayausi',           name:'Sayausí',                     crimeRisk:20 },
  { id:'monay',             name:'Monay',                       crimeRisk:30 },
  { id:'el_arenal',         name:'El Arenal',                   crimeRisk:33 },
];
export const barrioById = (id: string): Barrio => BARRIOS.find(b => b.id === id)!;

// minLevel: nivel mínimo de carrera para acceder al puesto
export const JOBS: Job[] = [
  { id:'cajero_feria', title:'Cajero en Feria Libre', locationId:'feria_libre', hours:8, wage:28, stress:4, exp:2, minDep:30, minLevel:0 },
  { id:'monitor_universidad', title:'Monitor universitario', locationId:'zona_universitaria', hours:6, wage:22, stress:2, exp:3, minDep:40, minLevel:0 },
  { id:'obrero_industrial', title:'Obrero (Z. Industrial)', locationId:'zona_industrial', hours:10, wage:42, stress:7, exp:2, minDep:35, minLevel:1 },
  { id:'asistente_centro', title:'Asistente admin. (Centro)', locationId:'centro_historico', hours:8, wage:38, stress:5, exp:3, minDep:45, minLevel:2 },
  { id:'cajero_banco', title:'Cajero de banco (Financiera)', locationId:'zona_financiera', hours:8, wage:50, stress:5, exp:4, minDep:60, minLevel:3 },
];
export const jobsAt = (id: string): Job[] => JOBS.filter(j => j.locationId === id);

// Árbol educativo (rudimentario, expandible). levelBoost = peldaños de carrera que habilita.
export const DEGREES: Degree[] = [
  // formal
  { id:'bachillerato', name:'Bachillerato', track:'formal', prereq:null, hours:40, cost:0, knowledge:10, levelBoost:1 },
  { id:'tecnico', name:'Título Técnico', track:'formal', prereq:'bachillerato', hours:60, cost:300, knowledge:14, levelBoost:1 },
  { id:'universidad', name:'Universidad', track:'formal', prereq:'bachillerato', hours:140, cost:1200, knowledge:30, levelBoost:2 },
  { id:'especializacion', name:'Especialización', track:'formal', prereq:'universidad', hours:80, cost:1500, knowledge:18, levelBoost:1 },
  { id:'maestria', name:'Maestría', track:'formal', prereq:'universidad', hours:120, cost:3000, knowledge:24, levelBoost:1 },
  { id:'doctorado', name:'Doctorado', track:'formal', prereq:'maestria', hours:200, cost:5000, knowledge:36, levelBoost:1 },
  // técnica
  { id:'electricidad', name:'Curso de Electricidad', track:'tecnica', prereq:null, hours:30, cost:150, knowledge:8, levelBoost:1 },
  { id:'gastronomia', name:'Curso de Gastronomía', track:'tecnica', prereq:null, hours:30, cost:180, knowledge:8, levelBoost:1 },
  // autodidacta
  { id:'ventas', name:'Autodidacta: Ventas', track:'autodidacta', prereq:null, hours:24, cost:0, knowledge:7, levelBoost:0 },
  { id:'programacion', name:'Autodidacta: Programación', track:'autodidacta', prereq:null, hours:50, cost:0, knowledge:14, levelBoost:1 },
];
export const degreeById = (id: string): Degree => DEGREES.find(d => d.id === id)!;

export const FNAMES_M = ['Pedro','Luis','Jorge','Marco','Wilson','Patricio','Fabián','Galo','Vinicio','Klever'];
export const FNAMES_F = ['Rosa','María','Carmen','Narcisa','Lourdes','Gladys','Mariana','Cecilia','Fanny','Targelia'];
export const EMP_NAMES = ['Byron','Jhon','Stalin','Maribel','Tania','Édison','Darwin','Jessica','Geovanny','Mayra'];
export const RELATIONS = [
  {rel:'madre',sex:'f'},{rel:'padre',sex:'m'},{rel:'hermana',sex:'f'},{rel:'hermano',sex:'m'},
  {rel:'tía',sex:'f'},{rel:'tío',sex:'m'},{rel:'prima',sex:'f'},{rel:'primo',sex:'m'},
  {rel:'abuela',sex:'f'},{rel:'compadre',sex:'m'},
];
export const PERSONALITIES: Personality[] = ['trabajador','responsable','generoso','ahorrador','emprendedor','irresponsable','conflictivo','oportunista','fiestero','sabio','protector'];
export const PERS_WEALTH: Record<Personality, number> = { emprendedor:120, ahorrador:100, trabajador:60, generoso:50, responsable:40, sabio:30, protector:20, fiestero:-20, oportunista:-10, irresponsable:-60, conflictivo:-40 };

// 33 eventos. eff/silver tipados como Effect[].
export const EVENTS: GameEvent[] = [
  { id:'don_choro_robo', cat:'crimen', neg:true, w:8, imp:2, cond:[['minTurn',2]], wt:[['bornCrimeGt',30,1.6],['statLt','reputation',35,1.5]],
    eff:[['liq',-120],['stat','stress',15]], silver:[['stat','resilience',5],['stat','experience',1]],
    title:'Don Choro hizo de las suyas', body:'Te asaltaron camino a casa. Perdiste $120 y la tranquilidad de la semana.', sl:'Aprendiste qué calles evitar. Esa cicatriz te hace más sagaz.' },
  { id:'hurto_inventario', cat:'crimen', neg:true, w:5, imp:1, cond:[['minTurn',4]], wt:[],
    eff:[['liq',-60]], silver:[['stat','resilience',3]],
    title:'Hurto menor', body:'Un descuido en la Feria. Te volaron la cartera con $60.', sl:'Ya sabes guardar el efectivo en dos lugares.' },
  { id:'estafa_telefono', cat:'crimen', neg:true, w:4, imp:1, cond:[], wt:[['statLt','experience',20,1.6]],
    eff:[['liq',-45],['stat','stress',6]], silver:[['stat','experience',2]],
    title:'Estafa telefónica', body:'Te llamaron haciéndose pasar por el banco. Caíste por $45.', sl:'Ya no contestas números desconocidos.' },
  { id:'don_choro_redada', cat:'crimen', neg:false, w:3, imp:2, cond:[['minTurn',6]], wt:[],
    eff:[['stat','happiness',5],['impact','comunitario',3]], silver:[],
    title:'Cayó la banda de Don Choro', body:'La policía atrapó a la banda. El barrio respira tranquilo.', sl:'' },
  { id:'tio_sabio', cat:'familia', neg:false, w:7, imp:2, cond:[['minTurn',2]], wt:[],
    eff:[['stat','knowledge',4],['stat','happiness',3],['impact','familiar',3]], silver:[],
    title:'Tu tío Pedro te invitó a un café', body:'Hablaron tres horas. Te contó cómo levantó su negocio en los 90s.', sl:'' },
  { id:'herencia', cat:'familia', neg:false, w:2, imp:3, cond:[['minTurn',8]], wt:[],
    eff:[['liq',600],['stat','happiness',-4]], silver:[],
    title:'Herencia inesperada', body:'Tu abuela falleció y te dejó $600. Tristeza y oportunidad mezcladas.', sl:'' },
  { id:'prestamo_primo', cat:'familia', neg:true, w:6, imp:1, cond:[['minTurn',3]], wt:[['liquidityLt',200,0.3]],
    eff:[['liq',-80],['stat','stress',3]], silver:[['impact','familiar',4],['stat','happiness',2]],
    title:'Un primo te pidió prestado', body:'No podías negarte. Soltaste $80.', sl:'En la familia ahora te ven como el que ayuda.' },
  { id:'cumple_tia', cat:'familia', neg:false, w:9, imp:1, cond:[], wt:[],
    eff:[['liq',-30],['stat','happiness',6],['stat','stress',-4],['impact','familiar',2]], silver:[],
    title:'Cumpleaños de tía Rosa', body:'Llevaste regalo y compartiste. Comida rica, risas, recargada de energía.', sl:'' },
  { id:'recom_primo', cat:'familia', neg:false, w:5, imp:2, cond:[['minTurn',3]], wt:[['hasJob',false,2.5]],
    eff:[['stat','dependability',4],['impact','profesional',3]], silver:[],
    title:'Tu primo te recomendó', body:'Habló bien de ti en su trabajo. Tu nombre suena en círculos nuevos.', sl:'' },
  { id:'conflicto_fam', cat:'familia', neg:true, w:5, imp:1, cond:[['minTurn',5]], wt:[],
    eff:[['stat','happiness',-6],['stat','stress',8]], silver:[['stat','resilience',4]],
    title:'Discusión familiar fuerte', body:'Reunión que terminó mal. Quedó el sabor amargo.', sl:'A veces los límites se ponen así. Aprendiste a no ceder en todo.' },
  { id:'gripe', cat:'salud', neg:true, w:6, imp:1, cond:[], wt:[['statGt','stress',65,2.0],['statLt','health',50,1.5]],
    eff:[['stat','health',-12],['liq',-25]], silver:[['stat','stress',-8]],
    title:'Te dio gripe', body:'Tres días con fiebre. Gastaste $25 en medicinas.', sl:'El cuerpo te obligó a parar. Bajó el estrés.' },
  { id:'enf_estres', cat:'salud', neg:true, w:4, imp:2, cond:[['statGt','stress',75]], wt:[],
    eff:[['stat','health',-20],['stat','happiness',-10],['liq',-80]], silver:[['stat','resilience',8],['stat','stress',-15]],
    title:'El estrés te pasó factura', body:'Ataque de ansiedad. Médico, exámenes, $80. Una semana fuera de combate.', sl:'Aprendiste a leer las señales. No te volverá a pasar tan fuerte.' },
  { id:'chequeo', cat:'salud', neg:false, w:4, imp:1, cond:[['minTurn',4]], wt:[],
    eff:[['liq',-20],['stat','health',5],['stat','happiness',3]], silver:[],
    title:'Chequeo médico', body:'Pagaste $20 al doctor. Todo bien. Te tranquilizó saber.', sl:'' },
  { id:'descanso', cat:'salud', neg:false, w:5, imp:1, cond:[], wt:[['statGt','stress',50,1.5]],
    eff:[['stat','stress',-10],['stat','happiness',4]], silver:[],
    title:'Día gris ideal para descansar', body:'Cancelaron una reunión. Tomaste la tarde para ti.', sl:'' },
  { id:'ascenso', cat:'trabajo', neg:false, w:3, imp:3, cond:[['minTurn',6],['hasJob',true],['statGt','dependability',65]], wt:[],
    eff:[['stat','leadership',5],['stat','happiness',8],['liq',150],['impact','profesional',5]], silver:[],
    title:'¡Ascenso!', body:'Te llamaron a oficina. Subida de cargo y bono de $150.', sl:'' },
  { id:'despido', cat:'trabajo', neg:true, w:3, imp:3, cond:[['hasJob',true],['minTurn',5]], wt:[['statLt','dependability',40,2.0]],
    eff:[['stat','stress',18],['stat','happiness',-10]], silver:[['liq',200],['stat','resilience',10]], firesJob:true,
    title:'Te despidieron', body:'Recorte de personal. El cuello se cierra.', sl:'Te dieron $200 de liquidación. Y por dentro, algo se endurece para mejor.' },
  { id:'freelance', cat:'trabajo', neg:false, w:6, imp:2, cond:[['minTurn',3]], wt:[['statGt','knowledge',25,1.5]],
    eff:[['liq',90],['stat','experience',3]], silver:[],
    title:'Trabajito freelance', body:'Un conocido te pidió un favor pagado. $90 limpios.', sl:'' },
  { id:'felicita', cat:'trabajo', neg:false, w:5, imp:1, cond:[['hasJob',true]], wt:[['statGt','dependability',60,1.8]],
    eff:[['stat','happiness',4],['stat','dependability',2]], silver:[],
    title:'Reconocimiento del jefe', body:'Te felicitó delante del equipo. Vale.', sl:'' },
  { id:'companero', cat:'trabajo', neg:true, w:4, imp:1, cond:[['hasJob',true]], wt:[],
    eff:[['stat','stress',6],['stat','happiness',-3]], silver:[['stat','leadership',2]],
    title:'Compañero conflictivo', body:'Tuviste que mediar un drama en el trabajo. Se fue la mañana.', sl:'Manejaste la situación. Algo de liderazgo se nota.' },
  { id:'curso_muni', cat:'oportunidad', neg:false, w:6, imp:1, cond:[], wt:[],
    eff:[['stat','knowledge',5]], silver:[],
    title:'Curso gratis del municipio', body:'Te metiste a un taller. Aprendiste algo útil.', sl:'' },
  { id:'cliente_grande', cat:'oportunidad', neg:false, w:3, imp:2, cond:[['minTurn',4]], wt:[],
    eff:[['liq',180],['impact','empresarial',5]], silver:[],
    title:'Cliente grande inesperado', body:'Un encargo gordo cayó del cielo. $180 y una referencia que vale.', sl:'' },
  { id:'beca', cat:'oportunidad', neg:false, w:2, imp:2, cond:[['minTurn',5],['statGt','knowledge',20]], wt:[],
    eff:[['liq',250],['stat','happiness',6]], silver:[],
    title:'Beca de estudio', body:'Aplicaste hace tiempo. Te llamaron. $250 para tus estudios.', sl:'' },
  { id:'invitacion', cat:'oportunidad', neg:false, w:5, imp:1, cond:[['minTurn',2]], wt:[],
    eff:[['impact','comunitario',3],['stat','happiness',2]], silver:[],
    title:'Te invitaron a un evento', body:'Networking en el Centro Histórico. Conociste gente.', sl:'' },
  { id:'idea_negocio', cat:'oportunidad', neg:false, w:4, imp:1, cond:[['minTurn',3]], wt:[['statGt','knowledge',15,1.4]],
    eff:[['stat','experience',2],['stat','happiness',3]], silver:[],
    title:'Se te prendió el foco', body:'Caminando viste un nicho. Apuntaste todo en una libreta.', sl:'' },
  { id:'impuesto', cat:'politico', neg:true, w:4, imp:2, cond:[['minTurn',4]], wt:[],
    eff:[['liq',-50],['stat','stress',5]], silver:[['stat','experience',2]],
    title:'Nuevo impuesto municipal', body:'El alcalde lo anunció. Te tocó pagar $50.', sl:'Ya sabes leer la letra chica de los anuncios oficiales.' },
  { id:'subsidio', cat:'politico', neg:false, w:3, imp:1, cond:[['minTurn',3]], wt:[['liquidityLt',250,2.0]],
    eff:[['liq',90]], silver:[],
    title:'Bono estatal', body:'Salió un subsidio del gobierno. Te tocó algo: $90.', sl:'' },
  { id:'tramite', cat:'politico', neg:true, w:5, imp:1, cond:[], wt:[],
    eff:[['stat','stress',6]], silver:[['stat','experience',1]],
    title:'Trámite eterno en oficina pública', body:'Horas haciendo cola. Burocracia pura.', sl:'Aprendiste el sistema. La próxima vas directo a la ventanilla correcta.' },
  { id:'obra_publica', cat:'politico', neg:false, w:3, imp:1, cond:[['minTurn',5]], wt:[],
    eff:[['stat','happiness',3],['impact','comunitario',2]], silver:[],
    title:'Arreglaron la avenida', body:'Por fin asfaltaron. El barrio se nota distinto.', sl:'' },
  { id:'inflacion', cat:'economia', neg:true, w:5, imp:1, cond:[['minTurn',3]], wt:[],
    eff:[['liq',-40]], silver:[['stat','experience',1]],
    title:'Subió el precio de la comida', body:'El mercado amaneció más caro. $40 menos en la quincena.', sl:'Empezaste a comparar precios. Eso se queda.' },
  { id:'baja_combustible', cat:'economia', neg:false, w:3, imp:1, cond:[], wt:[],
    eff:[['liq',25]], silver:[],
    title:'Bajó el combustible', body:'Ahorraste $25 en transporte esta quincena.', sl:'' },
  { id:'recesion', cat:'economia', neg:true, w:2, imp:3, cond:[['minTurn',8]], wt:[],
    eff:[['stat','stress',10]], silver:[['stat','experience',3],['stat','resilience',5]], setEcon:'bad',
    title:'Se anuncia recesión', body:'Noticieros, redes, conversaciones. El ambiente económico se enfría.', sl:'Los que aprendieron a navegar la última crisis hoy son los más sólidos.' },
  { id:'recuperacion', cat:'economia', neg:false, w:2, imp:3, cond:[['minTurn',10]], wt:[],
    eff:[['stat','happiness',8]], silver:[], setEcon:'good',
    title:'Anuncian recuperación', body:'Los indicadores giran. Se siente en la calle.', sl:'' },
  { id:'remate', cat:'economia', neg:false, w:4, imp:1, cond:[], wt:[],
    eff:[['liq',35],['stat','happiness',2]], silver:[],
    title:'Remate en el mercado', body:'Aprovechaste rebajas. Ahorro real: $35.', sl:'' },
];

// Validación dura: ningún negativo sin silver
EVENTS.forEach(e => { if (e.neg && (!e.silver || e.silver.length === 0)) throw new Error('Evento negativo sin silver: ' + e.id); });
