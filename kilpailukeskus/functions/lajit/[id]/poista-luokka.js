'use strict';

import { getLaji, getLajiLuokkavaihtoehto, poistaLajiLuokkavaihtoehto } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ request, params, env }) {
  const laji = await getLaji(env.DB, params.id);
  if (!laji) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const luokkavaihtoehtoId = parseInt((data.get('luokkavaihtoehto_id') || '').toString(), 10);

  const luokkavaihtoehto = await getLajiLuokkavaihtoehto(env.DB, luokkavaihtoehtoId);
  if (!luokkavaihtoehto || luokkavaihtoehto.laji_id !== laji.id) {
    return new Response('Luokkavaihtoehtoa ei löytynyt tästä lajista.', { status: 400 });
  }

  await poistaLajiLuokkavaihtoehto(env.DB, luokkavaihtoehto.id);
  return uudelleenohjaus('/lajit');
}
