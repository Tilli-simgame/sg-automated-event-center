'use strict';

/**
 * Oman lajin kilpailun uudelleenarvonta: poistaa jo arvotut tulokset ja arvonnan lisäämät
 * täytehevoset (ks. lib/db.js:n poistaKilpailunTuloksetJaTaytehevoset) ja arpoo kilpailun
 * uudelleen lajin nykyisillä asetuksilla (täytehevoset, hylätyt, ks. lib/kilpailun_arvonta.js).
 * Vain villeille lajeille - VRL:n jaoksen kilpailun tulokset on jo lähetetty VRL:ään, eikä
 * niitä voi muuttaa täältä. Oikeat osallistujat säilyvät. Ei julkinen (ks. ../_middleware.js).
 */

import { getKilpailu, poistaKilpailunTuloksetJaTaytehevoset } from '../../../lib/db.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { arvoJaTallenna } from '../../../lib/kilpailun_arvonta.js';
import { laheteTuloksetVrl } from '../../../lib/kilpailun_tulosten_lahetys.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Sama joukko kuin index.js:n "Arvo tulokset uudelleen" -napin näyttöehto.
const UUDELLEENARVOTTAVAT_TILAT = new Set(['arvottu', 'tulokset_lahetetty', 'tulokset_virhe']);

export async function onRequestPost({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (onkoVirallinenJaos(kilpailu.jaos) || !UUDELLEENARVOTTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('Uudelleen voi arpoa vain jo arvotun oman lajin kilpailun.', { status: 400 });
  }

  await poistaKilpailunTuloksetJaTaytehevoset(env.DB, kilpailu.id);
  await arvoJaTallenna(env.DB, kilpailu.id);
  // Villillä lajilla tämä vain merkitsee tulokset valmiiksi, mitään ei lähetetä VRL:ään.
  await laheteTuloksetVrl(env, kilpailu.id);
  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
