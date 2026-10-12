'use strict';

/**
 * Lajin poisto - kielletty jos jollain kilpailulla on jo tämä jaos (ks.
 * lib/db.js:n laskeKilpailutJaokselle), koska ne jäisivät muuten viittaamaan olemattomaan
 * jaokseen (rikkoisi mm. kilpailukutsun lyhenne-URL:n resoluution, ks. functions/[jaos]/...).
 * Luokkavaihtoehdot poistuvat mukana (ON DELETE CASCADE, ks. migrations/0013_lajit.sql).
 */

import { getLaji, poistaLaji, laskeKilpailutJaokselle } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  const laji = await getLaji(env.DB, params.id);
  if (!laji) return new Response('Ei löytynyt.', { status: 404 });

  const kilpailuja = await laskeKilpailutJaokselle(env.DB, laji.id);
  if (kilpailuja > 0) {
    return new Response(
      `Lajilla "${laji.nimi}" on jo ${kilpailuja} kilpailua - lajia ei voi enää poistaa.`,
      { status: 409 }
    );
  }

  await poistaLaji(env.DB, laji.id);
  return uudelleenohjaus('/lajit');
}
