'use strict';

import { getKilpailu, poistaKilpailu } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Kilpailun voi poistaa kokonaan vain ennen julkaisua VRL:n kisakalenteriin - 'luonnos'
// (ei vielä lähetetty) tai 'vrl_virhe' (VRL hylkäsi edellisen yrityksen, ei siis julkinen).
// Muissa tiloissa kilpailu on jo (tai on ollut) avoinna ilmoittautumiselle VRL:n
// kisakalenterissa, eikä sitä voi enää perua täältä - ks. [id]/index.js:n vastaava
// MUOKATTAVAT_TILAT-rajaus samasta syystä.
const POISTETTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe']);

export async function onRequestPost({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  if (!POISTETTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response(
      'Kilpailua ei voi enää poistaa, koska se on jo julkaistu (tai ollut julkaistuna) VRL:n kisakalenterissa.',
      { status: 400 }
    );
  }

  await poistaKilpailu(env.DB, kilpailu.id);
  return uudelleenohjaus('/');
}
