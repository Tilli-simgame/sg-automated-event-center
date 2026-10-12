'use strict';

/**
 * Adminin uuden luokan lisäys kilpailun sivulta - sallittu ennen arvontaa (ks. [id]/index.js:n
 * MUOKATTAVAT_TILAT), myös kun kilpailu on jo 'avoinna' (jolloin lomakkeen luokat-kenttä on
 * piilotettu, ks. [id]/muokkaa.js). Osallistujamäärän yläraja ei ole erikseen valittavissa
 * täältä - se on kilpailukohtainen ja sama kaikille luokille (ks. kilpailu.max_osallistujia_per_luokka
 * / lib/kilpailu_lomake.js), joten uusi luokka perii sen suoraan kilpailulta.
 */

import { getKilpailu, listLuokat, createLuokka } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

const MUOKATTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (!MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('Luokkia ei voi enää lisätä tähän kilpailuun.', { status: 409 });
  }

  const data = await request.formData();
  const nimi = (data.get('nimi') || '').toString().trim();

  if (!nimi) {
    return new Response('Luokan nimi puuttuu.', { status: 400 });
  }

  const luokat = await listLuokat(env.DB, kilpailu.id);
  await createLuokka(env.DB, kilpailu.id, nimi, kilpailu.max_osallistujia_per_luokka, luokat.length);

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
