'use strict';

/**
 * Järjestäjän käsin asettama / muuttama / tyhjentämä VRL-kisa-id (ks. index.js:n
 * kisa-id-lomake). Tyhjä arvo tyhjentää id:n, jolloin automaattihaku (ks.
 * lib/vrl_kisa_id_haku.js) yrittää uudelleen. Ei julkinen (ks. ../_middleware.js).
 */

import { getKilpailu, muutaVrlKisaIdKasin, getKilpailuByVrlKisaId } from '../../../lib/db.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Sama kuin index.js:n KISA_ID_MUOKATTAVAT_TILAT - ennen VRL-julkaisua id:tä ei vielä ole,
// ja tulosten lähettämisen jälkeen sen muuttamisella ei ole enää vaikutusta.
const KISA_ID_MUOKATTAVAT_TILAT = new Set(['avoinna', 'arvottu', 'tulokset_virhe']);

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });
  if (!onkoVirallinenJaos(kilpailu.jaos) || !KISA_ID_MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return new Response('VRL-kisa-id:tä ei voi muuttaa tämän kilpailun nykyisessä tilassa.', { status: 400 });
  }

  const data = await request.formData();
  const kisaId = (data.get('vrl_kisa_id') || '').toString().trim();
  if (kisaId === (kilpailu.vrl_kisa_id || '').trim()) {
    return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
  }

  if (kisaId) {
    // Yksi VRL:n kisa vastaa aina vain yhtä kilpailua (ks. lib/db.js listVaratutVrlKisaIdt).
    const varaaja = await getKilpailuByVrlKisaId(env.DB, kisaId, kilpailu.id);
    if (varaaja) {
      return new Response(
        `VRL-kisa-id ${kisaId} on jo kilpailun "${varaaja.nimi}" (id ${varaaja.id}) käytössä. Tarkista id VRL:n "Omat kilpailut" -listalta.`,
        { status: 400 }
      );
    }
  }

  await muutaVrlKisaIdKasin(env.DB, kilpailu.id, kisaId);
  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
