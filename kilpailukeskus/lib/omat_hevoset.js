'use strict';

/**
 * Järjestäjän omien hevosten automaattilisäys kilpailun luokkiin - hakee hevoset
 * ulkoisesta rajapinnasta (https://sg-visu.vercel.app/api/horses/by-owner-discipline)
 * kilpailun jaosta vastaavalla lajilla, ja lisää kunkin hevosen sen lajitasoa (esim.
 * "120cm", "Helppo A") nimeltään vastaavaan luokkaan - ilman että järjestäjän tarvitsee
 * ilmoittaa hevosiaan käsin ilmoittautumislomakkeella.
 *
 * Kutsutaan heti kun kilpailulle löytyy vrl_kisa_id - joko automaattihaun yhteydessä (ks.
 * lib/vrl_kisa_id_haku.js, kutsutaan sekä julkiselta kutsusivulta että hallintasivulta) tai
 * varalta vielä kerran hallintasivun lataushetkellä (ks. functions/kilpailut/[id]/index.js,
 * esim. jos id on asetettu käsin [id]/aseta-kisa-id.js:llä) - ei aiemmin, koska kilpailu ei
 * ole vielä varmasti VRL:n hyväksymä eikä luokkien lopullinen kokoonpano ole vielä
 * vakiintunut. Oman lajin (villi, ks. migrations/0013_lajit.sql) kilpailulle vrl_kisa_id:tä
 * ei koskaan tule, joten sille vastaava hetki on kun järjestäjä asettaa statukseksi
 * "Ilmoittautuminen auki" (villi_tila 'hyvaksytty', ks. valmisOmilleHevosille alla).
 *
 * Noudattaa samoja luokkakohtaisia rajoja kuin julkinen ilmoittautuminen (ks.
 * [id]/ilmoittaudu.js, lib/saannot.js): luokan osallistujaraja (luokka.max_osallistujia)
 * ja "yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä" -sääntö. Koska
 * kaikki tämän automaation lisäämät hevoset ovat saman kiinteän ratsastajaidentiteetin
 * (env.OMA_RATSASTAJA_*) alla, jälkimmäinen sääntö rajoittaa käytännössä montako omaa
 * hevosta samaan luokkaan voi kerralla tulla - loput jäävät lisäämättä ja näkyvät virheenä,
 * eivät ylitä rajaa vain koska lisäys on automaattinen.
 */

import { listOsallistujat, lisaaOsallistuja, getLaji } from './db.js';
import { hevostaRatsastajaaKohtiLuokassa } from './saannot.js';
import { onkoVirallinenJaos } from './jaokset.js';

// Tässä järjestelmässä oma talli on aina "Tilli" (ei vaihtele kilpailukohtaisesti eikä
// ole sama asia kuin kilpailun oma jarj_talli_nimi, joka on VRL:lle ilmoitettu kilpailupaikan
// nimi - "owner" tässä on hevospelin oman tallin nimi ulkoisessa rajapinnassa).
const OMA_TALLI = 'Tilli';

// jaos-id (ks. lib/jaokset.js) -> ulkoisen rajapinnan discipline-parametri. Vain jaokset
// joita kilpailukeskus tukee (JAOKSET-listan 1-6) on kartoitettu - loput (matkaratsastus,
// ravit, työhevosajo, laukat, poniravit, maastoeste, näyttelyt) eivät koskaan esiinny
// kilpailun jaos-kentässä. Huom: ../disciplines_ids.md nimeää jaoksen 5 "lännenratsastus",
// mutta rajapinta itse käyttää nimeä "westernratsastus" (todennettu suoraan rajapinnasta -
// "lännenratsastus" palauttaa aina 0 hevosta vaikka dataa on olemassa).
const JAOS_LAJIT = {
  1: 'esteratsastus',
  2: 'kouluratsastus',
  3: 'kenttäratsastus',
  4: 'valjakkoajo',
  5: 'westernratsastus',
  6: 'askellajiratsastus',
};

// Onko kilpailu siinä vaiheessa että omat hevoset lisätään (ks. tiedoston alun kommentti) -
// sama ehto sekä automaattiselle ensimmäiselle haulle (functions/kilpailut/[id]/index.js)
// että käsin laukaistulle uudelleenhaulle ([id]/hae-omat-hevoset.js).
// Ennen migrations/0016_villi_tila.sql:ää julkaistulla kilpailulla villi_tila on NULL - sen
// badge näyttää silloin varsinaisen tilan ("Ilmoittautuminen auki", ks. lib/html.js:n
// naytettavaTila), joten se lasketaan samoin valmiiksi.
function valmisOmilleHevosille(kilpailu) {
  if (onkoVirallinenJaos(kilpailu.jaos)) return Boolean(kilpailu.vrl_kisa_id);
  return kilpailu.tila === 'avoinna' && (kilpailu.villi_tila === 'hyvaksytty' || kilpailu.villi_tila == null);
}

// Luokkien nimien eteen lisätään aina juokseva numero lomakkeella (esim. "1. Helppo D",
// "2. 40cm" - ks. lib/kilpailu_lomake.js:n siistiNimi/kokoa), mutta ulkoisen rajapinnan
// discipline_level ei tunne tätä numerointia (esim. "Helppo D") - numero jätetään siis
// pois vertailusta samalla säännöllä kuin lomake käyttää sen poistamiseen.
function normalisoi(s) {
  return (s || '')
    .toString()
    .replace(/^\d+\.\s*/, '')
    .trim()
    .toLowerCase();
}

// Luokan nimen ja rajapinnan lajitason vertailu sanoittain: numerointi pois (ks. normalisoi),
// välimerkit/sulut/alaviivat ohitetaan ja luku erotetaan yksiköstä ("80km_nopeus",
// "80 km (nopeus)" ja "80 km nopeus" ovat kaikki ["80", "km", "nopeus"]).
function sanat(s) {
  return normalisoi(s)
    .replace(/(\d)([a-zåäö])/g, '$1 $2')
    .split(/[^0-9a-zåäö]+/)
    .filter(Boolean);
}

// Ensin täsmälleen samat sanat, sitten (jos yksiselitteinen) sanoittainen lyhenne -
// esim. luokka "15 km (ihanne)" vastaa lajitasoa "15 km ihanneaika".
function etsiLuokka(luokkaSanat, lajitaso) {
  const tasoSanat = sanat(lajitaso);
  const samat = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const tarkka = luokkaSanat.find(({ s }) => samat(s, tasoSanat));
  if (tarkka) return tarkka.luokka;
  const lyhenteet = luokkaSanat.filter(
    ({ s }) => s.length === tasoSanat.length && s.every((x, i) => tasoSanat[i].startsWith(x) || x.startsWith(tasoSanat[i]))
  );
  return lyhenteet.length === 1 ? lyhenteet[0].luokka : null;
}

async function haeOmatHevoset(baseUrl, laji) {
  const osoite = `${baseUrl}?${new URLSearchParams({ owner: OMA_TALLI, discipline: laji })}`;
  const vastaus = await fetch(osoite);
  if (!vastaus.ok) {
    throw new Error(`Rajapinta vastasi ${vastaus.status}`);
  }
  const data = await vastaus.json();
  return Array.isArray(data.horses) ? data.horses : [];
}

// Fisher-Yates. Rajapinta palauttaa hevoset aina samassa (esim. aakkos- tai lisäys-)
// järjestyksessä, ja alla oleva silmukka täyttää luokan täyttörajan tullessa vastaan siinä
// järjestyksessä kuin taulukko käydään läpi - ilman sekoitusta samat "ekana listassa olevat"
// hevoset pääsisivät joka kerta mukaan ja loput jäisivät aina ulos. Sekoittamalla jokainen
// hevonen saa yhtäläisen mahdollisuuden osua täyttörajan sisä- tai ulkopuolelle.
function sekoita(taulukko) {
  const kopio = taulukko.slice();
  for (let i = kopio.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopio[i], kopio[j]] = [kopio[j], kopio[i]];
  }
  return kopio;
}

/**
 * @param {object} env      Pages Functions -ympäristö (env.OMAT_HEVOSET_API_URL, valinnainen,
 *   oletus sg-visu-rajapinta; env.OMA_RATSASTAJA_NIMI, env.OMA_RATSASTAJA_VRL_TUNNUS)
 * @param {object} kilpailu db.js:n getKilpailu-rivi
 * @param {Array}  luokat   db.js:n listLuokat(kilpailu.id) - sama kilpailun luokkalista
 * @returns {Promise<{lisatty: number, virheet: string[]}>}
 */
async function lisaaOmatHevosetAutomaattisesti(env, kilpailu, luokat) {
  const virheet = [];

  // Oman lajin rajapintanimi tulee lajin asetuksista (ks. migrations/0017_laji_omat_hevoset.sql),
  // oletuksena lajin nimi pienillä kirjaimilla (esim. "Matkaratsastus" -> "matkaratsastus").
  const villiLaji = onkoVirallinenJaos(kilpailu.jaos) ? null : await getLaji(env.DB, kilpailu.jaos);
  const laji = villiLaji
    ? (villiLaji.omat_hevoset_laji || villiLaji.nimi).trim().toLowerCase()
    : JAOS_LAJIT[Number(kilpailu.jaos)];
  if (!laji) {
    return { lisatty: 0, virheet: [`Jaokselle ${kilpailu.jaos} ei ole lajikartoitusta omien hevosten hakuun.`] };
  }

  if (!env.OMA_RATSASTAJA_NIMI || !env.OMA_RATSASTAJA_VRL_TUNNUS) {
    return {
      lisatty: 0,
      virheet: ['Omien hevosten lisäys ei ole käytössä: OMA_RATSASTAJA_NIMI ja/tai OMA_RATSASTAJA_VRL_TUNNUS puuttuu asetuksista.'],
    };
  }

  const apiUrl = env.OMAT_HEVOSET_API_URL || 'https://sg-visu.vercel.app/api/horses/by-owner-discipline';

  let hevoset;
  try {
    hevoset = await haeOmatHevoset(apiUrl, laji);
  } catch (virhe) {
    console.error('Omien hevosten haku epäonnistui:', virhe);
    return { lisatty: 0, virheet: [`Hevosten haku ulkoisesta rajapinnasta epäonnistui: ${virhe.message || virhe}`] };
  }
  // Tyhjä vastaus johtuu lähes aina siitä, ettei lajin nimi vastaa rajapinnan lajinimeä
  // (esim. "matkaratsastusjaos" vs. "matkaratsastus") - kerrotaan se eikä hiljaa lisätä nollaa.
  if (hevoset.length === 0) {
    return {
      lisatty: 0,
      virheet: [
        `Rajapinta ei palauttanut yhtään hevosta lajilla "${laji}".` +
          (villiLaji ? ' Tarkista lajin "Laji omien hevosten haussa" -asetus Omat lajit -sivulta (esim. "matkaratsastus").' : ''),
      ],
    };
  }
  hevoset = sekoita(hevoset);

  const luokkaSanat = luokat.map((luokka) => ({ luokka, s: sanat(luokka.nimi) }));
  let lisatty = 0;

  for (const hevonen of hevoset) {
    const nimi = hevonen.name || '(nimetön)';
    const vhTunnus = (hevonen.registration_number || '').toString().toUpperCase();
    const lajitaso = hevonen.discipline_level;

    if (!vhTunnus) {
      virheet.push(`${nimi}: VH-tunnus puuttuu, ei voitu lisätä.`);
      continue;
    }
    if (!lajitaso) {
      virheet.push(`${nimi} (${vhTunnus}): lajitasoa ei ole asetettu, ei voitu päätellä luokkaa.`);
      continue;
    }

    const luokka = etsiLuokka(luokkaSanat, lajitaso);
    if (!luokka) {
      virheet.push(`${nimi} (${vhTunnus}): lajitasoa "${lajitaso}" vastaavaa luokkaa ei löytynyt kilpailusta.`);
      continue;
    }

    // Idempotenssi: käsin laukaistu uudelleenhaku (ks. [id]/hae-omat-hevoset.js) ei saa
    // lisätä samaa hevosta samaan luokkaan toiseen kertaan. Haetaan tuoreena joka
    // hevoselle, koska tämän saman ajon aiemmat lisäykset (edelliset silmukan kierrokset)
    // vaikuttavat sekä täällä että alla olevassa täyttöraja-tarkistuksessa.
    const osallistujat = await listOsallistujat(env.DB, luokka.id);
    const jo_lisatty = osallistujat.some((o) => normalisoi(o.vh_tunnus) === normalisoi(vhTunnus));
    if (jo_lisatty) continue;

    if (luokka.max_osallistujia != null && osallistujat.length >= luokka.max_osallistujia) {
      virheet.push(
        `${nimi} (${vhTunnus}): luokka "${luokka.nimi}" on jo täynnä (enintään ${luokka.max_osallistujia} osallistujaa) - ei lisätty.`
      );
      continue;
    }

    // "Yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä" - omalla lajilla
    // lajin oma kiinteä raja (ks. lib/saannot.js:n hevostaRatsastajaaKohtiLuokassa, sama
    // sääntö kuin [id]/ilmoittaudu.js) -
    // kaikki tämän automaation lisäämät hevoset lasketaan saman kiinteän ratsastajan
    // (env.OMA_RATSASTAJA_VRL_TUNNUS) alle, joten sääntö rajaa suoraan montako omaa
    // hevosta samaan luokkaan voi kerralla tulla.
    if (luokka.max_osallistujia != null) {
      const raja = hevostaRatsastajaaKohtiLuokassa(villiLaji, luokka.max_osallistujia);
      const omiaLuokassa = osallistujat.filter(
        (o) => normalisoi(o.vrl_tunnus) === normalisoi(env.OMA_RATSASTAJA_VRL_TUNNUS)
      ).length;
      if (omiaLuokassa >= raja) {
        virheet.push(
          `${nimi} (${vhTunnus}): ratsastajalla on jo luokassa "${luokka.nimi}" enimmäismäärä omia hevosia ` +
            `(${raja}) - ei lisätty.`
        );
        continue;
      }
    }

    // Lajilla voi olla osallistujat ilman tunnuksia (ks. migrations/0018_laji_ilman_tunnuksia.sql) -
    // tunnukset tallennetaan silti omiin sarakkeisiinsa yllä olevia tarkistuksia varten.
    const osallistujaNimi = villiLaji && villiLaji.ilman_tunnuksia
      ? `${env.OMA_RATSASTAJA_NIMI} - ${nimi}`
      : `${env.OMA_RATSASTAJA_NIMI} (${env.OMA_RATSASTAJA_VRL_TUNNUS}) - ${nimi} ${vhTunnus}`;
    await lisaaOsallistuja(env.DB, luokka.id, osallistujaNimi, env.OMA_RATSASTAJA_VRL_TUNNUS, vhTunnus);
    lisatty += 1;
  }

  return { lisatty, virheet };
}

export { lisaaOmatHevosetAutomaattisesti, valmisOmilleHevosille, OMA_TALLI, JAOS_LAJIT };
