'use strict';

/**
 * Kirjautumissessio HttpOnly-evästeenä, allekirjoitettu HMAC-SHA256:lla (ks. functions/kirjaudu.js
 * ja functions/kirjaudu-ulos.js). Allekirjoitusavaimena käytetään env.ADMIN_PASSWORDia eikä
 * erillistä secretiä - jos ADMIN_PASSWORD joskus vuotaa, admin-tunnistus on joka tapauksessa jo
 * murrettu, joten tämä ei lisää uutta luottamusrajaa. Sessiota ei tallenneta palvelimelle
 * (ei KV/D1-taulua) - pelkkä allekirjoitettu vanhenemisaika riittää, koska ainoa "käyttäjä" on
 * yksi jaettu admin-tili eikä yksittäisiä sessioita tarvitse pystyä perumaan erikseen.
 */

const EVASTEEN_NIMI = 'oakh_admin';
const KESTO_MS = 30 * 24 * 60 * 60 * 1000; // 30 vrk - järjestäjän ei tarvitse kirjautua joka käynnillä

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const paddattu = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(paddattu);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hmacAvain(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function luoSessioEvaste(env) {
  const vanhenee = Date.now() + KESTO_MS;
  const avain = await hmacAvain(env);
  const allekirjoitus = await crypto.subtle.sign('HMAC', avain, new TextEncoder().encode(String(vanhenee)));
  const token = `${vanhenee}.${base64UrlEncode(new Uint8Array(allekirjoitus))}`;
  return `${EVASTEEN_NIMI}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(KESTO_MS / 1000)}`;
}

function uloskirjautumisEvaste() {
  return `${EVASTEEN_NIMI}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function lueEvaste(request) {
  const otsikko = request.headers.get('Cookie') || '';
  for (const pala of otsikko.split(';')) {
    const erotin = pala.indexOf('=');
    if (erotin === -1) continue;
    if (pala.slice(0, erotin).trim() === EVASTEEN_NIMI) return pala.slice(erotin + 1).trim();
  }
  return null;
}

async function onkoSessioVoimassa(request, env) {
  const token = lueEvaste(request);
  if (!token) return false;

  const piste = token.indexOf('.');
  if (piste === -1) return false;
  const vanhenee = token.slice(0, piste);
  if (!/^\d+$/.test(vanhenee) || Number(vanhenee) < Date.now()) return false;

  let allekirjoitus;
  try {
    allekirjoitus = base64UrlDecode(token.slice(piste + 1));
  } catch {
    return false;
  }

  const avain = await hmacAvain(env);
  return crypto.subtle.verify('HMAC', avain, allekirjoitus, new TextEncoder().encode(vanhenee));
}

export { luoSessioEvaste, uloskirjautumisEvaste, onkoSessioVoimassa };
