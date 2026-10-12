'use strict';

/**
 * Muokkaa lajin omia sääntöjä (ks. migrations/0014_laji_saannot.sql ja
 * functions/lajit/index.js:n saannotLomakeHtml). VRL:n jaoskohtaiset rajat
 * (lib/jaosrajoitukset.js) eivät koske villejä lajeja - järjestäjä asettaa nämä itse per
 * laji, ja ne pätevät sellaisenaan jokaiseen tämän lajin kilpailuun (ks.
 * lib/kilpailu_lomake.js:n kokoaJaosRajoitukset ja lib/saannot.js:n
 * hevostaRatsastajaaKohtiLuokassa).
 */

import { getLaji, paivitaLajinSaannot } from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ request, params, env }) {
  const laji = await getLaji(env.DB, params.id);
  if (!laji) return new Response('Ei löytynyt.', { status: 404 });

  const data = await request.formData();
  const maxOsallistujiaPerLuokka = parseInt((data.get('max_osallistujia_per_luokka') || '').toString(), 10);
  const maxLahtojaPerHevonen = parseInt((data.get('max_lahtoja_per_hevonen') || '').toString(), 10);
  const maxHevostaRatsastajaPerLuokka = parseInt((data.get('max_hevosta_ratsastaja_per_luokka') || '').toString(), 10);
  const osallistumismuoto = (data.get('osallistumismuoto') || '').toString().trim();
  const saannot = (data.get('saannot') || '').toString().trim();
  const omatHevosetLaji = (data.get('omat_hevoset_laji') || '').toString().trim();
  const ilmanTunnuksia = data.get('ilman_tunnuksia') === '1';

  const virheet = [];
  if (!Number.isFinite(maxOsallistujiaPerLuokka) || maxOsallistujiaPerLuokka < 1) {
    virheet.push('Enimmäisosallistujia per luokka on oltava vähintään 1.');
  }
  if (!Number.isFinite(maxLahtojaPerHevonen) || maxLahtojaPerHevonen < 1) {
    virheet.push('Enimmäislähtöjä per hevonen on oltava vähintään 1.');
  }
  if (!Number.isFinite(maxHevostaRatsastajaPerLuokka) || maxHevostaRatsastajaPerLuokka < 1) {
    virheet.push('Enimmäishevosia per ratsastaja/luokka on oltava vähintään 1.');
  }
  if (virheet.length > 0) {
    return new Response(virheet.join(' '), { status: 400 });
  }

  await paivitaLajinSaannot(env.DB, laji.id, {
    maxOsallistujiaPerLuokka,
    maxLahtojaPerHevonen,
    maxHevostaRatsastajaPerLuokka,
    osallistumismuoto,
    saannot,
    omatHevosetLaji,
    ilmanTunnuksia,
  });

  return uudelleenohjaus('/lajit');
}
