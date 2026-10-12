'use strict';

/**
 * Lisää yhden luokkavaihtoehdon lajille (ks. functions/lajit/index.js). Nämä ovat pelkkiä
 * ehdotuksia "Uusi kilpailu" -lomakkeen luokkavalitsimeen (ks. lib/kilpailu_lomake.js:n
 * kokoaJaosLuokat) - kilpailun omat luokat voi silti aina kirjoittaa vapaasti lomakkeen
 * tekstikenttään, samaan tapaan kuin VRL-jaoksillakin.
 */

import { getLaji, lisaaLajiLuokkavaihtoehto } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ request, params, env }) {
  const laji = await getLaji(env.DB, params.id);
  if (!laji) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const nimi = (data.get('nimi') || '').toString().trim();
  if (!nimi) {
    return new Response('Luokan nimi puuttuu.', { status: 400 });
  }

  await lisaaLajiLuokkavaihtoehto(env.DB, laji.id, nimi);
  return uudelleenohjaus('/lajit');
}
