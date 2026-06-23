import { Location } from '../types';

function travelCosts(walk: number, bus: number, taxi: number, bike: number, moto: number, car: number) {
  return { walk, bus, taxi, bicycle: bike, motorcycle: moto, car };
}

export const locations: Location[] = [
  {
    id: 'centro_historico',
    name: 'Centro Historico',
    zone: 'centro',
    crimeRisk: 30,
    travelCostByTransport: travelCosts(3, 1, 0.5, 1.5, 0.75, 0.5),
    boardPos: { col: 30, row: 6 },
  },
  {
    id: 'feria_libre',
    name: 'Feria Libre',
    zone: 'comercial',
    crimeRisk: 45,
    travelCostByTransport: travelCosts(4, 1.5, 0.75, 2, 1, 0.75),
    boardPos: { col: 12, row: 10 },
  },
  {
    id: 'zona_universitaria',
    name: 'Zona Universitaria',
    zone: 'universitaria',
    crimeRisk: 15,
    travelCostByTransport: travelCosts(3.5, 1, 0.5, 1.5, 0.75, 0.5),
    boardPos: { col: 12, row: 3 },
  },
  {
    id: 'barrio_residencial',
    name: 'Barrio Residencial',
    zone: 'residencial',
    crimeRisk: 20,
    travelCostByTransport: travelCosts(2, 1, 0.5, 1, 0.5, 0.5),
    boardPos: { col: 50, row: 10 },
  },
  {
    id: 'zona_industrial',
    name: 'Zona Industrial',
    zone: 'industrial',
    crimeRisk: 25,
    travelCostByTransport: travelCosts(5, 2, 1, 2.5, 1.25, 1),
    boardPos: { col: 30, row: 14 },
  },
  {
    id: 'zona_financiera',
    name: 'Zona Financiera',
    zone: 'financiera',
    crimeRisk: 10,
    travelCostByTransport: travelCosts(3, 1, 0.5, 1.5, 0.75, 0.5),
    boardPos: { col: 50, row: 3 },
  },
];

export function getLocation(id: string): Location {
  const loc = locations.find((l) => l.id === id);
  if (!loc) throw new Error(`Locacion no encontrada: ${id}`);
  return loc;
}
