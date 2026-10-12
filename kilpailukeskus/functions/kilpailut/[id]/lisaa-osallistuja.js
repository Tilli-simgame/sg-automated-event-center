'use strict';

/**
 * Adminin käsin tekemä osallistujan lisäys kilpailun hallintasivulta - ei julkinen (ks.
 * ../_middleware.js). Yksi vapaamuotoinen "nimi"-kenttä riittää - VRL-/VH-tunnukset
 * puretaan siitä automaattisesti jos teksti noudattaa muotoa "Ratsastajan nimi
 * (VRL-tunnus) - Hevosen nimi VH-tunnus" (ks. lib/saannot.js), muuten ne jäävät tyhjiksi.
 * Ei noudata julkisen ilmoittautumisen muoto-/sääntövalidointia (ks. ilmoittaudu.js:
 * luokka-/ratsastajarajat) - admin vastaa itse tiedon oikeellisuudesta.
 */

import { getKilpailu, listLuokat, lisaaOsallistuja } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';
import { jasennaIlmoittautuminen } from '../../../lib/saannot.js';

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const luokkaId = parseInt((data.get('luokka_id') || '').toString(), 10);
  const nimi = (data.get('nimi') || '').toString().trim();

  const luokat = await listLuokat(env.DB, kilpailu.id);
  const luokka = luokat.find((l) => l.id === luokkaId);
  if (!luokka || !nimi) {
    return new Response('Luokka tai nimi puuttuu.', { status: 400 });
  }

  const jasennetty = jasennaIlmoittautuminen(nimi);
  await lisaaOsallistuja(env.DB, luokka.id, nimi, jasennetty?.vrlTunnus || null, jasennetty?.vhTunnus || null);

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
