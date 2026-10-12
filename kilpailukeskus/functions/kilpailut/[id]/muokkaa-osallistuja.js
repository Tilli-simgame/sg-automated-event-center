'use strict';

/**
 * Adminin osallistujan muokkaus kilpailun hallintasivulta - ei julkinen (ks.
 * ../_middleware.js). Yksi kenttä ("nimi", esim. "Matti Meikäläinen (VRL-123456) -
 * Ihka Ihana VH12-345-6789") riittää minkä tahansa kirjoitusvirheen korjaamiseen -
 * VRL-/VH-tunnukset puretaan siitä automaattisesti jos teksti noudattaa muotoa
 * (ks. lib/saannot.js), muuten aiemmat tunnukset jäävät ennalleen (admin ei ole sidottu
 * muotovaatimukseen, ks. ilmoittaudu.js).
 */

import { getKilpailu, getOsallistuja, paivitaOsallistuja } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';
import { jasennaIlmoittautuminen } from '../../../lib/saannot.js';

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const osallistujaId = parseInt((data.get('osallistuja_id') || '').toString(), 10);
  const nimi = (data.get('nimi') || '').toString().trim();

  if (!osallistujaId || !nimi) {
    return new Response('Osallistuja tai nimi puuttuu.', { status: 400 });
  }

  const osallistuja = await getOsallistuja(env.DB, osallistujaId);
  if (!osallistuja) {
    return new Response('Osallistujaa ei löytynyt.', { status: 404 });
  }

  const jasennetty = jasennaIlmoittautuminen(nimi);
  const vrlTunnus = jasennetty ? jasennetty.vrlTunnus : osallistuja.vrl_tunnus;
  const vhTunnus = jasennetty ? jasennetty.vhTunnus : osallistuja.vh_tunnus;

  await paivitaOsallistuja(env.DB, osallistujaId, { nimi, vrlTunnus, vhTunnus });

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
