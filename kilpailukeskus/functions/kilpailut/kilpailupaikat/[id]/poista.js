'use strict';

// Kilpailupaikan poisto ei vaikuta jo luotuihin kilpailuihin, koska kilpailulle kopioidaan
// valitun kilpailupaikan tiedot sitä luotaessa (ks. migrations/0010_kilpailupaikat.sql).

import { getKilpailupaikka, poistaKilpailupaikka } from '../../../../lib/db.js';
import { uudelleenohjaus } from '../../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  const kilpailupaikka = await getKilpailupaikka(env.DB, params.id);
  if (!kilpailupaikka) return new Response('Ei löytynyt.', { status: 404 });

  await poistaKilpailupaikka(env.DB, kilpailupaikka.id);
  return uudelleenohjaus('/kilpailut/kilpailupaikat');
}
