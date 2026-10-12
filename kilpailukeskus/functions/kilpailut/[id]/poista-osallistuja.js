'use strict';

/**
 * Adminin osallistujan poisto kilpailun hallintasivulta - ei julkinen (ks.
 * ../_middleware.js). Toimii kilpailun tilasta riippumatta.
 */

import { getKilpailu, poistaOsallistuja } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const osallistujaId = parseInt((data.get('osallistuja_id') || '').toString(), 10);
  if (!osallistujaId) {
    return new Response('Osallistuja puuttuu.', { status: 400 });
  }

  await poistaOsallistuja(env.DB, osallistujaId);

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
