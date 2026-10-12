'use strict';

/**
 * Kilpailun tietojen muokkaus. Sallittu tiloissa 'luonnos', 'vrl_virhe' ja 'avoinna' - ei
 * enää sen jälkeen kun kilpailu on arvottu (tulokset viittaavat silloin jo osallistujiin,
 * ks. lib/db.js:n tulokset-taulu).
 *
 * Luokkien täysi korvaaminen (poistaLuokat + uudelleenluonti tekstikentästä) on turvallista
 * vain ennen kuin ilmoittautuminen on auennut ('luonnos'/'vrl_virhe') - 'avoinna'-tilassa
 * luokkiin on jo voinut tulla ilmoittautumisia (ks. osallistujat-taulun ON DELETE CASCADE),
 * joten silloin luokat-kenttä piilotetaan lomakkeelta kokonaan ja luokkia hallitaan sen
 * sijaan kilpailun sivulta (ks. [id]/index.js: lisaa-luokka.js, muokkaa-luokka.js,
 * poista-luokka.js). Samasta syystä jaosta tai kilpailupäivän kuukautta ei voi enää vaihtaa
 * 'avoinna'-tilassa, koska kilpailukutsu on silloin jo lähetetty VRL:ään juuri sillä
 * osoitteella (ks. kutsu_url) - osoitteen muuttaminen jälkikäteen rikkoisi linkin.
 */

import {
  getKilpailu,
  updateKilpailu,
  listLuokat,
  createLuokka,
  poistaLuokat,
  paivitaLuokkienMaxOsallistujia,
  seuraavaKutsuNumero,
  listLajit,
  listLajiLuokkavaihtoehdotKartta,
} from '../../../lib/db.js';
import { kokoaJaokset, isoPvmSuomeksi, validoiLomake, lomakeHtml, kilpailunLomakeArvot, AVOINNA_HUOMIO } from '../../../lib/kilpailu_lomake.js';
import { sivu, vastaus, uudelleenohjaus } from '../../../lib/html.js';

const MUOKATTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

function eiMuokattavissaSivu(kilpailu) {
  return vastaus(
    sivu({
      otsikko: 'Kilpailua ei voi muokata',
      sisalto: `
        <h1>Kilpailua ei voi enää muokata</h1>
        <p>Kilpailu on arvottu, joten sen tietojen muokkaaminen ei ole enää turvallista
        (tulokset viittaavat jo osallistujiin).</p>
        <p><a href="/kilpailut/${kilpailu.id}">← Takaisin kilpailun sivulle</a></p>
      `,
    }),
    409
  );
}

export async function onRequestGet({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailua ei löytynyt.</h1>' }), 404);
  }
  if (!MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return eiMuokattavissaSivu(kilpailu);
  }

  const [luokat, lajit, lajiLuokkavaihtoehdot] = await Promise.all([
    kilpailu.tila !== 'avoinna' ? listLuokat(env.DB, kilpailu.id) : [],
    listLajit(env.DB),
    listLajiLuokkavaihtoehdotKartta(env.DB),
  ]);
  const { arvot, naytaLuokat } = kilpailunLomakeArvot(kilpailu, luokat);

  return vastaus(
    sivu({
      otsikko: 'Muokkaa kilpailua',
      sisalto: lomakeHtml(arvot, [], {
        otsikko: 'Muokkaa kilpailua',
        submitTeksti: 'Tallenna muutokset',
        action: `/kilpailut/${kilpailu.id}/muokkaa`,
        naytaLuokat,
        huomio: naytaLuokat ? '' : AVOINNA_HUOMIO,
        lajit,
        lajiLuokkavaihtoehdot,
      }),
    })
  );
}

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailua ei löytynyt.</h1>' }), 404);
  }
  if (!MUOKATTAVAT_TILAT.has(kilpailu.tila)) {
    return eiMuokattavissaSivu(kilpailu);
  }

  const lukittu = kilpailu.tila === 'avoinna';
  const [lajit, lajiLuokkavaihtoehdot] = await Promise.all([listLajit(env.DB), listLajiLuokkavaihtoehdotKartta(env.DB)]);

  const data = await request.formData();
  const kpIsoRaw = (data.get('kp') || '').toString().trim();
  const arvot = {
    nimi: (data.get('nimi') || '').toString().trim(),
    jaos: (data.get('jaos') || '').toString(),
    kp: isoPvmSuomeksi(kpIsoRaw),
    vip: isoPvmSuomeksi((data.get('vip') || '').toString().trim()),
    arvontatapa: (data.get('arvontatapa') || '').toString(),
    jarj_talli: (data.get('jarj_talli') || '').toString().trim(),
    jarj_talli_nimi: (data.get('jarj_talli_nimi') || '').toString().trim(),
    jarj_talli_url: (data.get('jarj_talli_url') || '').toString().trim(),
    info: (data.get('info') || '').toString().trim(),
    lisatietoja: (data.get('lisatietoja') || '').toString().trim(),
    takaaja: (data.get('takaaja') || '').toString().trim(),
    vastuuhenkilo_nimi: (data.get('vastuuhenkilo_nimi') || '').toString().trim(),
    vastuuhenkilo_email: (data.get('vastuuhenkilo_email') || '').toString().trim(),
    luokat: (data.get('luokat') || '').toString(),
    max_lahtoja_per_hevonen: (data.get('max_lahtoja_per_hevonen') || '').toString().trim(),
    max_osallistujia_per_luokka: (data.get('max_osallistujia_per_luokka') || '').toString().trim(),
  };

  const { virheet, luokat, maxLahtoja, maxOsallistujia, vipIso } = validoiLomake(arvot, { ohitaLuokat: lukittu, lajit });

  const vanhaVuosi = (kilpailu.kp_iso || '').slice(0, 4);
  const vanhaKuukausi = (kilpailu.kp_iso || '').slice(5, 7);
  const uusiVuosi = kpIsoRaw.slice(0, 4);
  const uusiKuukausi = kpIsoRaw.slice(5, 7);
  const kuukausiTaiJaosVaihtui = arvot.jaos !== kilpailu.jaos || uusiVuosi !== vanhaVuosi || uusiKuukausi !== vanhaKuukausi;

  if (lukittu && kuukausiTaiJaosVaihtui) {
    virheet.push('Jaosta tai kilpailupäivän kuukautta ei voi enää muuttaa, koska kilpailu on jo lähetetty VRL:ään.');
  }

  if (virheet.length > 0) {
    return vastaus(
      sivu({
        otsikko: 'Muokkaa kilpailua',
        sisalto: lomakeHtml(arvot, virheet, {
          otsikko: 'Muokkaa kilpailua',
          submitTeksti: 'Tallenna muutokset',
          action: `/kilpailut/${kilpailu.id}/muokkaa`,
          naytaLuokat: !lukittu,
          huomio: lukittu ? AVOINNA_HUOMIO : '',
          lajit,
          lajiLuokkavaihtoehdot,
        }),
      }),
      400
    );
  }

  // Kutsun osoite (jaos-lyhenne + vuosi/kuukausi + juokseva numero) lasketaan uudelleen
  // vain jos jaos tai kilpailupäivän kuukausi on muuttunut - muuten sama kutsu_url pysyy
  // ennallaan, ettei jo mahdollisesti jaettu/esikatseltu osoite muutu turhaan. 'avoinna'-
  // tilassa tähän ei koskaan päädytä, koska muutosyritys on jo hylätty yllä.
  let kutsuUrl = kilpailu.kutsu_url;
  let kutsuNumero = kilpailu.kutsu_numero;
  if (kuukausiTaiJaosVaihtui) {
    const jaosTieto = kokoaJaokset(lajit).find((j) => j.id === arvot.jaos);
    kutsuNumero = await seuraavaKutsuNumero(env.DB, arvot.jaos, uusiVuosi, uusiKuukausi);
    const numeroStr = String(kutsuNumero).padStart(4, '0');
    const kutsuPolku = `/${jaosTieto.lyhenne.toLowerCase()}/${uusiVuosi}/${uusiKuukausi}/${numeroStr}`;
    kutsuUrl = new URL(kutsuPolku, request.url).toString();
  }

  await updateKilpailu(env.DB, kilpailu.id, {
    nimi: arvot.nimi,
    jaos: arvot.jaos,
    kp: arvot.kp,
    kpIso: kpIsoRaw,
    vip: arvot.vip,
    vipIso,
    arvontatapa: arvot.arvontatapa,
    jarjTalli: arvot.jarj_talli,
    jarjTalliNimi: arvot.jarj_talli_nimi,
    jarjTalliUrl: arvot.jarj_talli_url,
    info: arvot.info,
    lisatietoja: arvot.lisatietoja,
    takaaja: arvot.takaaja,
    vastuuhenkiloNimi: arvot.vastuuhenkilo_nimi,
    vastuuhenkiloEmail: arvot.vastuuhenkilo_email,
    maxLahtojaPerHevonen: maxLahtoja,
    maxOsallistujiaPerLuokka: maxOsallistujia,
    kutsuUrl,
    kutsuNumero,
  });

  if (luokat !== null) {
    await poistaLuokat(env.DB, kilpailu.id);
    await Promise.all(luokat.map((l, i) => createLuokka(env.DB, kilpailu.id, l.nimi, maxOsallistujia, i)));
  } else {
    // 'avoinna'-tilassa luokat-kenttä on piilotettu eikä luokkia siis luoda uudelleen (ks.
    // yllä), mutta osallistujaraja on silti sama kaikille luokille - kohdistetaan uusi raja
    // kaikkiin kilpailun jo olemassa oleviin luokkiin, etteivät ne jää hiljaa vanhaan rajaan.
    await paivitaLuokkienMaxOsallistujia(env.DB, kilpailu.id, maxOsallistujia);
  }

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
