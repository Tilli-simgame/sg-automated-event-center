'use strict';

/**
 * Adminin yhden luokan nimen muokkaus kilpailun sivulta - koskematta muihin luokkiin tai
 * osallistujiin. Sallittu ennen arvontaa (ks. [id]/index.js:n MUOKATTAVAT_TILAT).
 * Osallistujamäärän yläraja ei ole erikseen muokattavissa täältä - se on kilpailukohtainen
 * ja sama kaikille luokille (ks. kilpailu.max_osallistujia_per_luokka / lib/kilpailu_lomake.js).
 */

import { getKilpailu, getLuokka, paivitaLuokka } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

const MUOKATTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (!MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('Luokkia ei voi enää muokata tässä kilpailussa.', { status: 409 });
  }

  const data = await request.formData();
  const luokkaId = parseInt((data.get('luokka_id') || '').toString(), 10);
  const nimi = (data.get('nimi') || '').toString().trim();

  const luokka = await getLuokka(env.DB, luokkaId);
  if (!luokka || luokka.kilpailu_id !== kilpailu.id) {
    return new Response('Luokkaa ei löytynyt tästä kilpailusta.', { status: 400 });
  }
  if (!nimi) {
    return new Response('Luokan nimi puuttuu.', { status: 400 });
  }

  await paivitaLuokka(env.DB, luokka.id, nimi, kilpailu.max_osallistujia_per_luokka);

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
