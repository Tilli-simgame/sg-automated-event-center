'use strict';

import { getKilpailupaikka, asetaOletusKilpailupaikka } from '../../../../lib/db.js';
import { uudelleenohjaus } from '../../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  const kilpailupaikka = await getKilpailupaikka(env.DB, params.id);
  if (!kilpailupaikka) return new Response('Ei löytynyt.', { status: 404 });

  await asetaOletusKilpailupaikka(env.DB, kilpailupaikka.id);
  return uudelleenohjaus('/kilpailut/kilpailupaikat');
}
