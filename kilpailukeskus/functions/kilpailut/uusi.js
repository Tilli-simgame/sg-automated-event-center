'use strict';

/**
 * Uuden kilpailun luonti: lomake tallentaa kilpailun + luokat D1:een tilaan 'luonnos'
 * ja generoi kilpailukutsun, mutta ei vielä lähetä sitä VRL:n kisakalenteriin. Järjestäjä
 * näkee kutsun esikatseluna kilpailun sivulta ja lähettää sen VRL:ään vasta erikseen
 * hyväksymällä (ks. [id]/laheta-vrl.js), samalla lahetaKilpailu()-logiikalla kuin CLI-skripti
 * (../../../laheta_kilpailu.js) käyttää. Onnistuessaan ilmoittautuminen avautuu kilpailulle
 * (tila 'avoinna'); epäonnistuessaan kilpailu jää tilaan 'vrl_virhe' ja lähetystä voi
 * yrittää uudelleen kilpailun sivulta. Kilpailua voi tarvittaessa myös muokata ennen
 * hyväksymistä (ks. [id]/muokkaa.js) - esim. jos VRL-lähetys epäonnistuu väärän tiedon takia.
 */

import { createKilpailu, createKisarypas, createLuokka, seuraavaKutsuNumero, listKilpailupaikat, listLajit, listLajiLuokkavaihtoehdotKartta } from '../../lib/db.js';
import { kokoaJaokset, isoPvmSuomeksi, validoiLomake, validoiRypas, lomakeHtml } from '../../lib/kilpailu_lomake.js';
import { sivu, vastaus, uudelleenohjaus } from '../../lib/html.js';

export async function onRequestGet({ env }) {
  const [kilpailupaikat, lajit, lajiLuokkavaihtoehdot] = await Promise.all([
    listKilpailupaikat(env.DB),
    listLajit(env.DB),
    listLajiLuokkavaihtoehdotKartta(env.DB),
  ]);
  const oletus = kilpailupaikat.find((p) => p.oletus);

  const arvot = { arvontatapa: '1' };
  if (oletus) {
    arvot.jarj_talli = oletus.tunnus;
    arvot.jarj_talli_nimi = oletus.talli_nimi;
    arvot.jarj_talli_url = oletus.talli_url;
    arvot.vastuuhenkilo_nimi = oletus.vastuuhenkilo_nimi;
    arvot.vastuuhenkilo_email = oletus.vastuuhenkilo_email;
  }

  return vastaus(
    sivu({
      otsikko: 'Uusi kilpailu',
      sisalto: lomakeHtml(arvot, [], { kilpailupaikat, lajit, lajiLuokkavaihtoehdot, naytaRypas: true }),
    })
  );
}

export async function onRequestPost({ request, env }) {
  const [kilpailupaikat, lajit, lajiLuokkavaihtoehdot] = await Promise.all([
    listKilpailupaikat(env.DB),
    listLajit(env.DB),
    listLajiLuokkavaihtoehdotKartta(env.DB),
  ]);
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
    // Kisarypäs pois päältä = yksittäinen kilpailu (ks. lib/kilpailu_lomake.js:n rypasHtml).
    rypas_paalla: data.get('rypas_paalla') === '1',
    rypas_maara: data.get('rypas_paalla') === '1' ? (data.get('rypas_maara') || '1').toString().trim() : '1',
    rypas_vali: (data.get('rypas_vali') || '1').toString(),
    rypas_vip: (data.get('rypas_vip') || 'oma').toString(),
    rypas_paivat: data.getAll('rypas_kp').map((p) => p.toString()),
  };

  const { virheet, luokat, maxLahtoja, maxOsallistujia } = validoiLomake(arvot, { lajit });
  const { virheet: rypasVirheet, paivat } = validoiRypas(arvot);
  virheet.push(...rypasVirheet);

  if (virheet.length > 0) {
    return vastaus(
      sivu({
        otsikko: 'Uusi kilpailu',
        sisalto: lomakeHtml(arvot, virheet, { kilpailupaikat, lajit, lajiLuokkavaihtoehdot, naytaRypas: true }),
      }),
      400
    );
  }

  // Kilpailukutsu ei ole organisaattorin syöttämä ulkoinen linkki - Kilpailukeskus generoi
  // ja isännöi sen itse osoitteessa /<jaos-lyhenne>/<vuosi>/<kuukausi>/<numero>. Numero
  // nollautuu kuukausittain per jaos (kilpailupäivän mukaan), ks. lib/db.js:n
  // seuraavaKutsuNumero. Sivu itse renderöidään functions/[jaos]/[vuosi]/[kuukausi]/[numero].js:ssä.
  // jaosTieto haetaan VRL:n jaoksien ja järjestäjän omien lajien yhdistetystä listasta
  // (ks. kokoaJaokset), koska jaos voi olla kumpi tahansa.
  const jaosTieto = kokoaJaokset(lajit).find((j) => j.id === arvot.jaos);

  // Kisarypäs (ks. migrations/0022_kisaryppaat.sql): jokainen ryppään päivä on oma
  // tavallinen kilpailunsa (oma kutsu, VRL-lähetys ja arvonta), vain yhteinen rypas_id
  // yhdistää ne ilmoittautumista varten. Yksittäinen kilpailu ei kuulu ryppääseen.
  const rypasId = paivat.length > 1 ? await createKisarypas(env.DB) : null;
  let ensimmainenId = null;
  // Kutsunumerot lasketaan järjestyksessä, koska seuraavaKutsuNumero näkee vain jo tallennetut.
  for (const { kpIso, vipIso } of paivat) {
    const kp = isoPvmSuomeksi(kpIso);
    // Ryppäässä lomakkeen nimessä oleva ensimmäinen kilpailupäivä (oletusnimi "ERJ - 1.2.2026")
    // vaihdetaan kunkin kilpailun omaksi päiväksi; muuten päivä lisätään nimen perään.
    const nimi =
      paivat.length === 1 || kp === arvot.kp
        ? arvot.nimi
        : arvot.nimi.includes(arvot.kp)
          ? arvot.nimi.split(arvot.kp).join(kp)
          : `${arvot.nimi} - ${kp}`;

    const vuosi = kpIso.slice(0, 4);
    const kuukausi = kpIso.slice(5, 7);
    const kutsuNumero = await seuraavaKutsuNumero(env.DB, arvot.jaos, vuosi, kuukausi);
    const numeroStr = String(kutsuNumero).padStart(4, '0');
    const kutsuPolku = `/${jaosTieto.lyhenne.toLowerCase()}/${vuosi}/${kuukausi}/${numeroStr}`;
    const kutsuUrl = new URL(kutsuPolku, request.url).toString();

    const kilpailuId = await createKilpailu(env.DB, {
      nimi,
      jaos: arvot.jaos,
      kp,
      kpIso,
      vip: isoPvmSuomeksi(vipIso),
      vipIso,
      arvontatapa: arvot.arvontatapa,
      jarjTalli: arvot.jarj_talli,
      jarjTalliNimi: arvot.jarj_talli_nimi,
      jarjTalliUrl: arvot.jarj_talli_url,
      kutsuUrl,
      kutsuNumero,
      info: arvot.info,
      lisatietoja: arvot.lisatietoja,
      takaaja: arvot.takaaja,
      vastuuhenkiloNimi: arvot.vastuuhenkilo_nimi,
      vastuuhenkiloEmail: arvot.vastuuhenkilo_email,
      maxLahtojaPerHevonen: maxLahtoja,
      maxOsallistujiaPerLuokka: maxOsallistujia,
      rypasId,
    });
    ensimmainenId ??= kilpailuId;

    await Promise.all(
      luokat.map((l, i) => createLuokka(env.DB, kilpailuId, l.nimi, maxOsallistujia, i))
    );
  }

  // Kilpailu jää tilaan 'luonnos': kutsu on jo luotu ja nähtävissä esikatseluna
  // (kutsu_url), mutta VRL-lähetys tehdään vasta kun järjestäjä on tarkistanut
  // kutsun ja hyväksynyt sen kilpailun sivulta (ks. [id]/laheta-vrl.js).
  return uudelleenohjaus(`/kilpailut/${ensimmainenId}`);
}
