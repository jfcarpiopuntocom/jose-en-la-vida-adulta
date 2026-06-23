import { Job } from '../types';

export const jobs: Job[] = [
  {
    id: 'cajero_feria',
    title: 'Cajero en Feria Libre',
    locationId: 'feria_libre',
    hoursPerShift: 8,
    baseWage: 28,
    stressPerShift: 4,
    experiencePerShift: 2,
    minDependability: 30,
  },
  {
    id: 'asistente_centro',
    title: 'Asistente administrativo (Centro)',
    locationId: 'centro_historico',
    hoursPerShift: 8,
    baseWage: 38,
    stressPerShift: 5,
    experiencePerShift: 3,
    minDependability: 45,
  },
  {
    id: 'obrero_industrial',
    title: 'Obrero (Zona Industrial)',
    locationId: 'zona_industrial',
    hoursPerShift: 10,
    baseWage: 42,
    stressPerShift: 7,
    experiencePerShift: 2,
    minDependability: 35,
  },
  {
    id: 'cajero_banco',
    title: 'Cajero de banco (Zona Financiera)',
    locationId: 'zona_financiera',
    hoursPerShift: 8,
    baseWage: 50,
    stressPerShift: 5,
    experiencePerShift: 4,
    minDependability: 60,
  },
  {
    id: 'monitor_universidad',
    title: 'Monitor universitario',
    locationId: 'zona_universitaria',
    hoursPerShift: 6,
    baseWage: 22,
    stressPerShift: 2,
    experiencePerShift: 3,
    minDependability: 40,
  },
];

export function getJobsAt(locationId: string): Job[] {
  return jobs.filter((j) => j.locationId === locationId);
}
