'use strict';

/**
 * Villin lajin kilpailun käsin asetettava näyttötila (ks. migrations/0016_villi_tila.sql ja
 * lib/html.js:n naytettavaTila) - villiä kilpailua ei lähetetä VRL:ään, joten järjestäjä
 * kertoo itse onko kilpailu vielä hyväksyttävänä, hyväksytty vai tulokset lähetetty.
 * Muuttaa vain näytettävää statusta, ei varsinaista tilaa. Ei julkinen (ks. ../_middleware.js).
 */

import { getKilpailu, asetaVilliTila } from '../../../lib/db.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Sama joukko kuin index.js:n villin tilan valitsimessa.
const SALLITUT_VILLI_TILAT = new Set(['odottaa', 'hyvaksytty', 'tulokset_lahetetty']);

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (onkoVirallinenJaos(kilpailu.jaos) || kilpailu.tila === 'luonnos') {
    return new Response('Statusta voi asettaa käsin vain julkaistulle oman lajin kilpailulle.', { status: 400 });
  }

  const data = await request.formData();
  const villiTila = (data.get('villi_tila') || '').toString();
  if (!SALLITUT_VILLI_TILAT.has(villiTila)) {
    return new Response('Tuntematon status.', { status: 400 });
  }

  await asetaVilliTila(env.DB, kilpailu.id, villiTila);
  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
