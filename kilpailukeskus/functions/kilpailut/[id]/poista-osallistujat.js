'use strict';

/**
 * Adminin kaikkien osallistujien poisto kerralla kilpailun hallintasivulta (ks. index.js) -
 * esim. kun osallistujia on ehtinyt tulla väärän VRL-kisa-id:n perusteella ennen kuin
 * kilpailu on oikeasti hyväksytty kalenteriin. Ei julkinen (ks. ../_middleware.js).
 *
 * Sallittu vain ennen arvontaa: arvonnan jälkeen osallistujiin viittaavat tulokset
 * poistuisivat mukana (ON DELETE CASCADE) ja kilpailu jäisi arvottuun tilaan tyhjänä.
 */

import { getKilpailu, poistaKilpailunOsallistujat } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Sama kuin index.js:n OSALLISTUJAT_POISTETTAVAT_TILAT.
const OSALLISTUJAT_POISTETTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

export async function onRequestPost({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (!OSALLISTUJAT_POISTETTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('Osallistujia ei voi enää poistaa kerralla arvonnan jälkeen.', { status: 400 });
  }

  await poistaKilpailunOsallistujat(env.DB, kilpailu.id);
  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
