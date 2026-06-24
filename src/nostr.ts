// Persistencia rudimentaria y expandible.
// Estrategia: localStorage = caché primaria SIEMPRE funciona.
//             Nostr = respaldo descentralizado (cero servidor propio).
// Más adelante: además publicar score/historia a un repo de GitHub (pendiente).

import { generateSecretKey, getPublicKey, finalizeEvent, SimplePool } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { GameState } from './types';

const LS_KEY = 'jvda_save_v1';
const LS_SK = 'jvda_nostr_sk_v1';
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const APP_D = 'jose-en-la-vida-adulta'; // identificador del evento reemplazable

// ---- keypair persistente del jugador ----
export function getOrCreateKeypair(): { sk: Uint8Array; pk: string } {
  let hex = localStorage.getItem(LS_SK);
  if (!hex) {
    const sk = generateSecretKey();
    hex = bytesToHex(sk);
    localStorage.setItem(LS_SK, hex);
  }
  const sk = hexToBytes(hex);
  return { sk, pk: getPublicKey(sk) };
}

// ---- guardado local (siempre) ----
export interface SaveBlob {
  savedAt: number;
  state: GameState;
}
export function saveLocal(state: GameState): void {
  try {
    const blob: SaveBlob = { savedAt: Date.now(), state };
    localStorage.setItem(LS_KEY, JSON.stringify(blob));
  } catch { /* localStorage full or unavailable — continue without saving */ }
}
export function loadLocal(): GameState | null {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const g = (JSON.parse(raw) as SaveBlob).state;
    // Migrate old saves: ensure each player has collectibles array (added v0.90+)
    if (g?.players) {
      for (const p of g.players) {
        if (!Array.isArray(p.collectibles)) p.collectibles = [];
      }
      if (!g.goals?.emergencyMonths) g.goals = { ...g.goals, emergencyMonths: 6 };
    }
    return g;
  } catch { return null; }
}
export function hasLocalSave(): boolean { return localStorage.getItem(LS_KEY) !== null; }
export function clearLocal(): void { localStorage.removeItem(LS_KEY); }

// ---- respaldo en Nostr (mejor esfuerzo, no bloquea el juego) ----
export async function publishToNostr(state: GameState): Promise<string | null> {
  try {
    const { sk } = getOrCreateKeypair();
    const evt = finalizeEvent({
      kind: 30078, // parametrized replaceable (datos de app)
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', APP_D], ['turn', String(state.turn)]],
      content: JSON.stringify(state),
    }, sk);
    const pool = new SimplePool();
    await Promise.any(pool.publish(RELAYS, evt));
    pool.close(RELAYS);
    return evt.id;
  } catch (e) {
    console.warn('Nostr publish falló (se conserva la copia local):', e);
    return null;
  }
}

// ---- publicar la historia / score (evento de nota legible) ----
export async function publishStory(playerName: string, summary: string): Promise<string | null> {
  try {
    const { sk } = getOrCreateKeypair();
    const evt = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'joseenlavidaadulta']],
      content: `🏆 José en la Vida Adulta — la historia de ${playerName}\n\n${summary}`,
    }, sk);
    const pool = new SimplePool();
    await Promise.any(pool.publish(RELAYS, evt));
    pool.close(RELAYS);
    return evt.id;
  } catch (e) {
    console.warn('Nostr story publish falló:', e);
    return null;
  }
}
