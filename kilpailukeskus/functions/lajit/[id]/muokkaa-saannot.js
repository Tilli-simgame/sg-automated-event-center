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
import { jasennaPisteet } from '../../../lib/saannot.js';

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
  // Tyhjä kenttä = 0 = ei täytehevosia (ks. migrations/0019_laji_taytehevoset.sql).
  const minOsallistujiaRaw = (data.get('min_osallistujia_per_luokka') || '').toString().trim();
  const minOsallistujiaPerLuokka = minOsallistujiaRaw === '' ? 0 : parseInt(minOsallistujiaRaw, 10);
  const hylattyjaRaw = (data.get('hylattyja_prosenttia') || '').toString().trim();
  const hylattyjaProsenttia = hylattyjaRaw === '' ? 0 : parseInt(hylattyjaRaw, 10);
  const pisteetLista = jasennaPisteet((data.get('pisteet') || '').toString());
  const pisteetMuilleRaw = (data.get('pisteet_muille') || '').toString().trim();
  const pisteetMuille = pisteetMuilleRaw === '' ? 0 : parseInt(pisteetMuilleRaw, 10);
  const taytehevonenNimi = (data.get('taytehevonen_nimi') || '').toString().trim() || 'Ratsastaja - Täytehevonen';

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
  if (!Number.isFinite(minOsallistujiaPerLuokka) || minOsallistujiaPerLuokka < 0) {
    virheet.push('Vähimmäisosallistujia per luokka (täytehevoset) on oltava 0 tai suurempi.');
  } else if (Number.isFinite(maxOsallistujiaPerLuokka) && minOsallistujiaPerLuokka > maxOsallistujiaPerLuokka) {
    virheet.push('Vähimmäisosallistujia per luokka ei voi olla suurempi kuin enimmäisosallistujia per luokka.');
  }
  if (!Number.isFinite(hylattyjaProsenttia) || hylattyjaProsenttia < 0 || hylattyjaProsenttia > 100) {
    virheet.push('Hylättyjen osuuden on oltava 0-100 %.');
  }
  if (!pisteetLista) {
    virheet.push('Pisteet sijoittain: anna pilkuilla eroteltuja kokonaislukuja, esim. 10,9,8.');
  }
  if (!Number.isFinite(pisteetMuille) || pisteetMuille < 0) {
    virheet.push('Pisteet muille hyväksytyille on oltava 0 tai suurempi.');
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
    minOsallistujiaPerLuokka,
    taytehevonenNimi,
    hylattyjaProsenttia,
    pisteet: pisteetLista.join(','),
    pisteetMuille,
  });

  return uudelleenohjaus('/lajit');
}
