'use strict';

/**
 * Julkinen kilpailukutsusivu, osoitteessa /<jaos-lyhenne>/<vuosi>/<kuukausi>/<numero>
 * (esim. /erj/2026/10/0001). Tämä URL on se, joka lähetetään VRL:n kisakalenteriin
 * "kutsu"-kenttänä (ks. ../../../kilpailut/uusi.js) - Kilpailukeskus siis isännöi kutsun
 * itse sen sijaan että organisaattori linkittäisi ulkoiseen sivuun. Ei vaadi kirjautumista,
 * koska VRL:n sivulta klikkaavat kilpailijat eivät ole Kilpailukeskuksen käyttäjiä.
 */

import { getKilpailuByKutsu, listLuokat, listOsallistujat, listTulokset, listLajit } from '../../../../lib/db.js';
import { yritaHakeaVrlKisaId } from '../../../../lib/vrl_kisa_id_haku.js';
import { kokoaJaokset } from '../../../../lib/kilpailu_lomake.js';
import { SUHTEUTETTU_ARVONTATAPA, kuvausTekstiJaokselle } from '../../../../lib/rmp_arvonta.js';
import { hevostaRatsastajaaKohtiLuokassa, sijoittuneidenMaara } from '../../../../lib/saannot.js';
import { escHtml, sivu, vastaus, ilmoittautumislomakeHtml } from '../../../../lib/html.js';
import { onkoAdminKirjautunut } from '../../../../lib/admin_auth.js';

// Kilpailun tilat joissa kilpailua ei ole vielä (onnistuneesti) lähetetty VRL:n
// kisakalenteriin, joten ilmoittautuminen ei voi olla auki vaikka järjestäjä voikin
// tarkistaa täältä miltä ilmoittautumislomake tulee näyttämään (esikatseluna, disabloituna).
const ESIKATSELU_TILAT = new Set(['luonnos', 'vrl_virhe']);

// Kilpailun tilat joissa arvonta (ks. lib/kilpailun_arvonta.js) on jo tehty ja luokkien
// "tulokset"-taulussa on siis aito sijoitusjärjestys - näissä tiloissa Osallistujat-listaus
// näyttää ilmoittautumisjärjestyksen sijaan arvotun sijoitusjärjestyksen ja lihavoi
// sijoittuneet (ks. lib/saannot.js:n sijoittuneidenMaara).
const TULOKSET_TILAT = new Set(['arvottu', 'tulokset_lahetetty', 'tulokset_virhe']);

export async function onRequestGet({ request, params, env }) {
  // Sivu on julkinen (ei admin-suojausta, ks. functions/_middleware.js), mutta headerin
  // navigaatio näytetään silti hallintasivujen linkkeinä jos kävijällä on voimassa oleva
  // sessioeväste (ks. lib/admin_auth.js) - muuten pelkkä "Kirjaudu sisään" -linkki, ettei
  // hallintatoimintoja tarjota kilpailijoille turhaan.
  const kirjautunut = await onkoAdminKirjautunut(request, env);

  // Jaos-lyhenne resolvoidaan VRL:n jaoksien ja järjestäjän omien lajien yhdistetystä
  // listasta (ks. kokoaJaokset), jotta myös villien lajien kilpailukutsut löytyvät
  // (ks. migrations/0013_lajit.sql).
  const lajit = await listLajit(env.DB);
  const jaosTieto = kokoaJaokset(lajit).find((j) => j.lyhenne.toLowerCase() === (params.jaos || '').toLowerCase());
  // Raakarivi lajit-taulusta (jos kyseessä villi laji) - kokoaJaokset kantaa vain
  // id/lyhenne/nimi/villi, ei järjestäjän asettamia sääntöjä (ks.
  // migrations/0014_laji_saannot.sql), joten haetaan ne tästä erikseen alla olevaa
  // Säännöt-osiota varten.
  const villiLaji = jaosTieto && lajit.find((l) => l.id === jaosTieto.id);
  const numero = parseInt(params.numero, 10);

  if (!jaosTieto || !/^\d{4}$/.test(params.vuosi) || !/^\d{2}$/.test(params.kuukausi) || !Number.isFinite(numero)) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailukutsua ei löytynyt.</h1>', kirjautunut }), 404);
  }

  let kilpailu = await getKilpailuByKutsu(env.DB, jaosTieto.id, params.vuosi, params.kuukausi, numero);
  if (!kilpailu) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailukutsua ei löytynyt.</h1>', kirjautunut }), 404);
  }
  kilpailu = await yritaHakeaVrlKisaId(env, kilpailu);

  const luokat = await listLuokat(env.DB, kilpailu.id);
  const luokkaRivit = luokat
    .map((l) => {
      const rajaTeksti = l.max_osallistujia
        ? ` <span class="pieni">(max ${l.max_osallistujia} osallistujaa)</span>`
        : '';
      return `<li>${escHtml(l.nimi)}${rajaTeksti}</li>`;
    })
    .join('');

  const luokkaTiedot = await Promise.all(
    luokat.map(async (l) => {
      const osallistujat = await listOsallistujat(env.DB, l.id);
      const tulokset = TULOKSET_TILAT.has(kilpailu.tila) ? await listTulokset(env.DB, l.id) : null;
      return { luokka: l, osallistujat, tulokset };
    })
  );
  // Ilmoittautumislomake ohjaa onnistuneen lähetyksen jälkeen takaisin tälle samalle
  // kutsusivulle (ei kilpailun hallintasivulle) - ks. [id]/ilmoittaudu.js:n "palaa"-käsittely.
  let palaaPolku = '';
  try {
    palaaPolku = new URL(kilpailu.kutsu_url).pathname;
  } catch {
    palaaPolku = '';
  }
  // Yksi yhteinen ilmoittautumislomake koko kilpailulle, jossa kaikki (vielä täyttymättömät)
  // luokat ovat auki samalla kertaa - yhdellä lähetyksellä voi siis ilmoittautua useaan
  // luokkaan sen sijaan että jokainen luokka pitäisi lähettää erikseen - ks. lib/html.js:n
  // ilmoittautumislomakeHtml.
  const avoimetLuokat = luokkaTiedot
    .filter(({ luokka, osallistujat }) => !(luokka.max_osallistujia != null && osallistujat.length >= luokka.max_osallistujia))
    .map(({ luokka }) => luokka);
  // Tunnuksettomalla lajilla (ks. migrations/0018_laji_ilman_tunnuksia.sql) oletusteksti ei saa
  // pyytää VRL-/VH-tunnuksia, vaikka järjestäjä ei olisi kuvannut omaa osallistumismuotoa.
  const osallistumismuoto = villiLaji
    ? villiLaji.osallistumismuoto || (villiLaji.ilman_tunnuksia ? 'Ratsastajan nimi - Hevosen nimi' : '')
    : '';
  const ilmoittautumislomakeSisalto =
    kilpailu.tila === 'avoinna'
      ? avoimetLuokat.length
        ? ilmoittautumislomakeHtml(kilpailu.id, avoimetLuokat, {
            palaaPolku,
            turnstileSiteKey: env.TURNSTILE_SITE_KEY,
            osallistumismuoto,
          })
        : '<p class="pieni"><strong>Kaikki luokat ovat täynnä.</strong></p>'
      : ESIKATSELU_TILAT.has(kilpailu.tila)
        ? ilmoittautumislomakeHtml(kilpailu.id, luokat, { disabled: true, palaaPolku, osallistumismuoto })
        : '';
  const osallistujatHtml = `
    <h2>Osallistujat</h2>
    <ul>
      ${luokkaTiedot
        .map(({ luokka, osallistujat, tulokset }) => {
          const maaraTeksti = luokka.max_osallistujia
            ? `${osallistujat.length}/${luokka.max_osallistujia}`
            : `${osallistujat.length} (ei ylärajaa)`;
          const rivit = tulokset || osallistujat;
          const sijoittuneidenLkm = tulokset ? sijoittuneidenMaara(tulokset.length) : 0;
          // Ennen arvontaa (tulokset === null) rivit on vain ilmoittautumisjärjestys, ei
          // sijoitusjärjestys - siksi <ul> (pallot) eikä <ol> (numerot), ettei kukaan luule
          // ilmoittautumisjärjestystä sijoituksiksi.
          const listaTagi = tulokset ? 'ol' : 'ul';
          return `
        <li>${escHtml(luokka.nimi)} <span class="pieni">(${maaraTeksti})</span>
          ${
            rivit.length
              ? `<${listaTagi} class="tulokset">${rivit
                  .map((r, i) => {
                    if (i === 0 && sijoittuneidenLkm > 0)
                      return `<li><strong>${escHtml(r.nimi)} <i class="fa-solid fa-trophy"></i></strong></li>`;
                    if (i < sijoittuneidenLkm)
                      return `<li><strong>${escHtml(r.nimi)} <i class="fa-solid fa-award"></i></strong></li>`;
                    return `<li>${escHtml(r.nimi)}</li>`;
                  })
                  .join('')}</${listaTagi}>`
              : ' <span class="pieni">ei vielä osallistujia</span>'
          }
        </li>`;
        })
        .join('')}
    </ul>
  `;

  const maxOsallistujiaPerLuokka = kilpailu.max_osallistujia_per_luokka;
  // Kilpailun oma arvontatapa (ks. lib/rmp_arvonta.js:n SUHTEUTETTU_ARVONTATAPA ja
  // lib/kilpailun_arvonta.js) ratkaisee kummasta arvontamekaniikasta kutsu kertoo - sama
  // arvontatapa jonka lib/kilpailun_arvonta.js käyttää tulosten arpomiseen kilpailun
  // umpeuduttua, joten teksti pysyy aina yhtenevänä toteutuksen kanssa.
  const rmpKuvaus = kuvausTekstiJaokselle(kilpailu.jaos);
  const arvontaSaantoHtml =
    kilpailu.arvontatapa === SUHTEUTETTU_ARVONTATAPA
      ? `<li>Tuloksiin käytetään <strong>suhteutettua arvontaa</strong>: jokaisen hevosen arvontaan
         vaikuttavat sen <a href="https://www.ratemypony.fi/">Rate My Pony</a> -ensiarvostelun pisteet${rmpKuvaus ? ` (<a href="https://megasim.eu/rmp/tietoa-ensiarvostelusta/">${escHtml(rmpKuvaus)}</a>)` : ''}
         -> parempi pistemäärä nostaa tilastollisesti mahdollisuutta hyvään sijoitukseen, muttei
         takaa sitä. Hevoset joita ei ole arvosteltu Rate My Ponyssa ovat silti mukana arvonnassa,
         kilpailukeskus arpoo pisteet satunnaisesti, joten kannattaa siis käydä arvostelemassa hevonen
         ennen kilpailua!</li>`
      : '<li>Tuloksiin käytetään lyhyttä arvontaa.</li>';
  // ARJ (Askellajiratsastusjaos, ks. lib/jaokset.js) -kohtainen lisäsääntö: rotu-/käyntilaji-
  // luokkien lisäksi ARJ:n luokkatarjonnassa (ks. disciplines_classes.md) on erillinen joukko
  // "saddle seat" -ryhmän luokkia (Classic pleasure ... Roadster), joihin osallistumista
  // rajoitetaan yhteen luokkaan per hevonen, jottei sama hevonen voisi kerätä sijoituksia
  // useasta saddle seat -luokasta.
  const arjLisasaantoHtml =
    jaosTieto.lyhenne === 'ARJ'
      ? '<li>Yksi hevonen saa osallistua kaikkiin rodulleen avoimiin luokkiin, joka luokkaan kerran ja vain yhteen saddle seat -ryhmään.</li>'
      : '';
  // Villin lajin järjestäjän vapaamuotoiset lisäsäännöt (ks. functions/lajit/index.js:n
  // saannotLomakeHtml), yksi rivi per <li> samaan tapaan kuin luokkarivit muualla lomakkeissa.
  const villinLajinSaannotHtml =
    villiLaji && villiLaji.saannot
      ? villiLaji.saannot
          .split(/\r?\n/)
          .map((r) => r.trim())
          .filter(Boolean)
          .map((r) => `<li>${escHtml(r)}</li>`)
          .join('')
      : '';
  // Nämä kolme sääntöä koskevat vain VRL:n omia jaoksia - villeillä lajeilla (ks.
  // migrations/0013_lajit.sql) ilmoittautuminen avataan suoraan eikä kutsua lähetetä VRL:n
  // kisakalenteriin, joten VRL-/VH-tunnusvaatimus ja kalenterimaininta olisivat harhaanjohtavia.
  const vrlSaannotHtml = villiLaji
    ? ''
    : `
      <li>Ratsastajan VRL-tunnus on pakollinen ilmoittautumisessa.</li>
      <li>Hevosen VH-tunnus on pakollinen ilmoittautumisessa.</li>`;
  const vrlKalenteriSaantoHtml = villiLaji ? '' : '<li>Osallistumiset vasta kun kutsu on julkaistu VRL-kalenterissa.</li>';
  const saannotHtml = `
    <h2>Säännöt</h2>
    <ul>
      <li>Enintään ${maxOsallistujiaPerLuokka} osallistujaa/luokka.</li>
      <li>Enintään ${escHtml(kilpailu.max_lahtoja_per_hevonen)} lähtöä/hevonen tässä kilpailussa.</li>
      <li>Enintään ${hevostaRatsastajaaKohtiLuokassa(villiLaji, maxOsallistujiaPerLuokka)} hevosta/ratsastaja/luokka.</li>
      <li>Sama hevonen voi ilmoittautua samaan luokkaan vain kerran.</li>
      ${arjLisasaantoHtml}
      ${villinLajinSaannotHtml}
      ${vrlSaannotHtml}
      ${arvontaSaantoHtml}
      ${vrlKalenteriSaantoHtml}
    </ul>
  `;

  const esikatseluViesti =
    kilpailu.tila === 'vrl_virhe'
      ? `<div class="viesti viesti-esikatselu"><strong>Esikatselu.</strong> VRL hylkäsi tämän kilpailun edellisen
         lähetysyrityksen, joten sitä ei ole (vielä) julkaistu kisakalenterissa eikä ilmoittautuminen ole auki -
         järjestäjä korjaa tiedot ja yrittää lähetystä uudelleen <a href="/kilpailut/${kilpailu.id}">kilpailun
         hallintasivulta</a>.</div>`
      : kilpailu.tila === 'luonnos'
        ? `<div class="viesti viesti-esikatselu"><strong>Esikatselu.</strong> Tätä kilpailua ei ole vielä lähetetty
         VRL:n kisakalenteriin eikä ilmoittautuminen ole auki - järjestäjä tarkistaa kutsun täältä
         ja hyväksyy lähetyksen <a href="/kilpailut/${kilpailu.id}">kilpailun hallintasivulta</a>.</div>`
        : '';

  const sisalto = `
    ${esikatseluViesti}
    <h1>${escHtml(kilpailu.nimi)}</h1>
    <p>
      <strong>Kilpailupäivä:</strong> ${escHtml(kilpailu.kp)}<br>
      <strong>Viimeinen ilmoittautumispäivä:</strong> ${escHtml(kilpailu.vip)}<br>
      <strong>Kilpailupaikka:</strong> <a href="${escHtml(kilpailu.jarj_talli_url)}">${escHtml(kilpailu.jarj_talli_nimi)}</a>
        <span class="pieni">(${escHtml(kilpailu.jarj_talli)})</span><br>
      <strong>Vastuuhenkilö:</strong> ${escHtml(kilpailu.vastuuhenkilo_nimi)} (${escHtml(env.VRL_IDENTITY)})
        [<a href="mailto:${escHtml(kilpailu.vastuuhenkilo_email)}">${escHtml(kilpailu.vastuuhenkilo_email)}</a>]<br>
      <strong>Alaisuus:</strong> ${escHtml(jaosTieto.nimi)} (${escHtml(jaosTieto.lyhenne)})<br>
    </p>
    ${kilpailu.info ? `<p>${escHtml(kilpailu.info)}</p>` : ''}
    ${kilpailu.lisatietoja ? `<p>${escHtml(kilpailu.lisatietoja)}</p>` : ''}
    ${kilpailu.takaaja ? `<p class="pieni">Takaaja: ${escHtml(kilpailu.takaaja)}</p>` : ''}
    <h2>Luokat</h2>
    <ul>${luokkaRivit}</ul>
    ${saannotHtml}
    ${
      kilpailu.tila === 'tulokset_lahetetty'
        ? '<p>Onnea voittajille ja sijoittuneille!</p>'
        : `<h2>Ilmoittaudu</h2>${ilmoittautumislomakeSisalto}`
    }
    ${osallistujatHtml}
  `;

  return vastaus(sivu({ otsikko: kilpailu.nimi, sisalto, turnstileSiteKey: env.TURNSTILE_SITE_KEY, kirjautunut }));
}
