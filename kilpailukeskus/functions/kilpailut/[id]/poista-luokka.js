'use strict';

/**
 * Adminin luokan poisto kilpailun sivulta. Kieltäytyy jos luokassa on jo osallistujia
 * (ON DELETE CASCADE poistaisi myös heidät hiljaa) - osallistujat pitää siirtää/poistaa
 * ensin erikseen ([id]/poista-osallistuja.js). Sallittu ennen arvontaa (ks. [id]/index.js:n
 * MUOKATTAVAT_TILAT).
 */

import { getKilpailu, getLuokka, laskeOsallistujat, poistaLuokka } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

const MUOKATTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (!MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('Luokkia ei voi enää poistaa tästä kilpailusta.', { status: 409 });
  }

  const data = await request.formData();
  const luokkaId = parseInt((data.get('luokka_id') || '').toString(), 10);

  const luokka = await getLuokka(env.DB, luokkaId);
  if (!luokka || luokka.kilpailu_id !== kilpailu.id) {
    return new Response('Luokkaa ei löytynyt tästä kilpailusta.', { status: 400 });
  }

  const maara = await laskeOsallistujat(env.DB, luokka.id);
  if (maara > 0) {
    return new Response(
      `Luokassa "${luokka.nimi}" on ${maara} osallistujaa - poista tai siirrä heidät ensin ennen luokan poistoa.`,
      { status: 409 }
    );
  }

  await poistaLuokka(env.DB, luokka.id);

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
