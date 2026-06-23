import { Location } from '../types';

// Costos de traslado en horas, desde cualquier punto de la ciudad (mock simplificado para Semana 1).
function travelCosts(walk: number, bus: number, taxi: number, bike: number, moto: number, car: number) {
  return { walk, bus, taxi, bicycle: bike, motorcycle: moto, car };
}

export const locations: Location[] = [
  {
    id: 'centro_historico',
    name: 'Centro Histórico',
    zone: 'centro',
    crimeRisk: 30,
    travelCostByTransport: travelCosts(3, 1, 0.5, 1.5, 0.75, 0.5),
  },
  {
    id: 'feria_libre',
    name: 'Feria Libre',
    zone: 'comercial',
    crimeRisk: 45,
    travelCostByTransport: travelCosts(4, 1.5, 0.75, 2, 1, 0.75),
  },
  {
    id: 'zona_universitaria',
    name: 'Zona Universitaria',
    zone: 'universitaria',
    crimeRisk: 15,
    travelCostByTransport: travelCosts(3.5, 1, 0.5, 1.5, 0.75, 0.5),
  },
  {
    id: 'barrio_residencial',
    name: 'Barrio Residencial',
    zone: 'residencial',
    crimeRisk: 20,
    travelCostByTransport: travelCosts(2, 1, 0.5, 1, 0.5, 0.5),
  },
  {
    id: 'zona_industrial',
    name: 'Zona Industrial',
    zone: 'industrial',
    crimeRisk: 25,
    travelCostByTransport: travelCosts(5, 2, 1, 2.5, 1.25, 1),
  },
  {
    id: 'zona_financiera',
    name: 'Zona Financiera',
    zone: 'financiera',
    crimeRisk: 10,
    travelCostByTransport: travelCosts(3, 1, 0.5, 1.5, 0.75, 0.5),
  },
];

export function getLocation(id: string): Location {
  const loc = locations.find((l) => l.id === id);
  if (!loc) throw new Error(`Locación no encontrada: ${id}`);
  return loc;
}
