'use strict';

import {
  getKilpailu,
  listLuokat,
  listOsallistujat,
  listTulokset,
  merkitseOmatHevosetLisatty,
  listLajit,
  listLajiLuokkavaihtoehdotKartta,
} from '../../../lib/db.js';
import { escHtml, sivu, vastaus, tilaBadge } from '../../../lib/html.js';
import { kilpailunLomakeArvot, lomakeHtml, AVOINNA_HUOMIO } from '../../../lib/kilpailu_lomake.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { yritaHakeaVrlKisaId } from '../../../lib/vrl_kisa_id_haku.js';
import { lisaaOmatHevosetAutomaattisesti, valmisOmilleHevosille } from '../../../lib/omat_hevoset.js';

// Osallistujien käsinhallinta (muokkaa/poista/lisää) sallitaan vain ennen arvontaa - sen
// jälkeen tulokset (ks. lib/db.js:n tulokset-taulu) viittaavat osallistuja-riveihin, eikä
// niiden muuttaminen jälkikäteen ole enää turvallista/johdonmukaista VRL:ään lähetetyn
// tiedon kanssa.
const MUOKATTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);

function osallistujaRiviHtml(kilpailuId, o) {
  return `
    <div class="luokka-rivi" style="align-items:flex-start">
      <form method="post" action="/kilpailut/${kilpailuId}/muokkaa-osallistuja" style="flex:1;display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0">
        <input type="hidden" name="osallistuja_id" value="${o.id}">
        <input name="nimi" value="${escHtml(o.nimi)}" required style="flex:1;min-width:260px;margin-top:0">
        <button type="submit" class="toissijainen" style="margin-top:0">Tallenna</button>
      </form>
      <form method="post" action="/kilpailut/${kilpailuId}/poista-osallistuja" style="margin-top:0">
        <input type="hidden" name="osallistuja_id" value="${o.id}">
        <button type="submit" class="toissijainen" style="margin-top:0">Poista</button>
      </form>
    </div>`;
}

function lisaaOsallistujaLomakeHtml(kilpailuId, luokkaId) {
  return `
    <form method="post" action="/kilpailut/${kilpailuId}/lisaa-osallistuja" style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.6rem">
      <input type="hidden" name="luokka_id" value="${luokkaId}">
      <input name="nimi" placeholder='Nimi, esim. "Matti Meikäläinen (VRL-123456) - Ihka Ihana VH12-345-6789"'
             required style="flex:1;min-width:260px;margin-top:0">
      <button type="submit" style="margin-top:0">+ Lisää osallistuja</button>
    </form>`;
}

// Luokan otsikkorivi: muokattavissa (nimi + poisto) MUOKATTAVAT_TILAT-tiloissa, muuten
// pelkkä lukutila (esim. arvonnan jälkeen, ettei enää sekoiteta tuloksiin). Osallistujamäärän
// yläraja ei ole täältä muokattavissa - se on kilpailukohtainen ja sama kaikille luokille
// (ks. kilpailu.max_osallistujia_per_luokka), ja näytetään pelkkänä tekstinä.
function luokkaOtsikkoHtml(kilpailuId, luokka, maara, muokattavissa) {
  const tayttoTeksti = luokka.max_osallistujia ? `${maara} / ${luokka.max_osallistujia}` : `${maara} (ei ylärajaa)`;
  if (!muokattavissa) {
    return `
      <div class="luokka-rivi">
        <strong>${escHtml(luokka.nimi)}</strong>
        <span class="pieni">${escHtml(tayttoTeksti)}</span>
      </div>`;
  }
  return `
    <div class="luokka-rivi">
      <form method="post" action="/kilpailut/${kilpailuId}/muokkaa-luokka" style="flex:1;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;margin-top:0">
        <input type="hidden" name="luokka_id" value="${luokka.id}">
        <input name="nimi" value="${escHtml(luokka.nimi)}" required style="flex:2;min-width:160px;margin-top:0">
        <span class="pieni">${escHtml(tayttoTeksti)}</span>
        <button type="submit" class="toissijainen" style="margin-top:0">Tallenna</button>
      </form>
      <form method="post" action="/kilpailut/${kilpailuId}/poista-luokka" style="margin-top:0">
        <input type="hidden" name="luokka_id" value="${luokka.id}">
        <button type="submit" class="toissijainen" style="margin-top:0">Poista luokka</button>
      </form>
    </div>`;
}

function lisaaLuokkaLomakeHtml(kilpailuId) {
  return `
    <form method="post" action="/kilpailut/${kilpailuId}/lisaa-luokka" class="kortti" style="display:flex;gap:0.4rem;flex-wrap:wrap">
      <input name="nimi" placeholder="Luokan nimi" required style="flex:2;min-width:180px;margin-top:0">
      <button type="submit" style="margin-top:0">+ Lisää luokka</button>
    </form>`;
}

async function luokkaHtml(env, luokka, kilpailu) {
  const osallistujat = await listOsallistujat(env.DB, luokka.id);
  const maara = osallistujat.length;
  const muokattavissa = MUOKATTAVAT_TILAT.has(kilpailu.tila);

  let sisalto = '';
  if (kilpailu.tila === 'arvottu' || kilpailu.tila === 'tulokset_lahetetty' || kilpailu.tila === 'tulokset_virhe') {
    const tulokset = await listTulokset(env.DB, luokka.id);
    sisalto = tulokset.length
      ? `<ol class="tulokset">${tulokset.map((t) => `<li>${escHtml(t.nimi)}</li>`).join('')}</ol>`
      : '<p class="pieni">Ei osallistujia.</p>';
  } else if (muokattavissa) {
    sisalto = `
      ${osallistujat.map((o) => osallistujaRiviHtml(kilpailu.id, o)).join('') || '<p class="pieni">Ei vielä osallistujia.</p>'}
      ${lisaaOsallistujaLomakeHtml(kilpailu.id, luokka.id)}
    `;
  } else {
    sisalto = `<p class="pieni">Osallistujat: ${escHtml(osallistujat.map((o) => o.nimi).join(', ')) || '—'}</p>`;
  }

  return `
    <div class="kortti">
      ${luokkaOtsikkoHtml(kilpailu.id, luokka, maara, muokattavissa)}
      ${sisalto}
    </div>`;
}

export async function onRequestGet({ params, env }) {
  let kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailua ei löytynyt.</h1>' }), 404);
  }
  kilpailu = await yritaHakeaVrlKisaId(env, kilpailu);
  const villi = !onkoVirallinenJaos(kilpailu.jaos);

  const luokat = await listLuokat(env.DB, kilpailu.id);

  // Omien hevosten automaattilisäys (ks. lib/omat_hevoset.js) - vasta kun vrl_kisa_id on
  // löytynyt (omalla lajilla: kun status on "Ilmoittautuminen auki"), ja vain kerran per kilpailu (omat_hevoset_lisatty_at) - järjestäjä voi
  // laukaista haun uudelleen käsin alla olevasta napista tarvittaessa.
  if (valmisOmilleHevosille(kilpailu) && !kilpailu.omat_hevoset_lisatty_at) {
    const tulos = await lisaaOmatHevosetAutomaattisesti(env, kilpailu, luokat);
    await merkitseOmatHevosetLisatty(env.DB, kilpailu.id, tulos.virheet);
    kilpailu = {
      ...kilpailu,
      omat_hevoset_lisatty_at: new Date().toISOString(),
      omat_hevoset_virheet: tulos.virheet.length ? JSON.stringify(tulos.virheet) : null,
    };
  }

  const luokkaKortit = await Promise.all(luokat.map((l) => luokkaHtml(env, l, kilpailu)));

  const muokkausLomakeHtml = MUOKATTAVAT_TILAT.has(kilpailu.tila)
    ? await (async () => {
        const { arvot } = kilpailunLomakeArvot(kilpailu, []);
        const [lajit, lajiLuokkavaihtoehdot] = await Promise.all([listLajit(env.DB), listLajiLuokkavaihtoehdotKartta(env.DB)]);
        return `
          <h2>Muokkaa kilpailun tietoja</h2>
          ${lomakeHtml(arvot, [], {
            naytaOtsikko: false,
            submitTeksti: 'Tallenna muutokset',
            action: `/kilpailut/${kilpailu.id}/muokkaa`,
            naytaLuokat: false,
            luokatPiilotettuViesti: 'Luokkia hallitaan alla olevasta Luokat-osiosta.',
            huomio: kilpailu.tila === 'avoinna' ? AVOINNA_HUOMIO : '',
            lajit,
            lajiLuokkavaihtoehdot,
          })}`;
      })()
    : '';
  // Villin lajin (ks. migrations/0013_lajit.sql) kilpailu ei koskaan mene VRL:ään - sama
  // "Hyväksy"-nappi julkaisee sen silti (ks. [id]/laheta-vrl.js:n villi-haara), mutta
  // teksti kertoo ettei kyse ole VRL-lähetyksestä.
  const hyvaksyNappi =
    kilpailu.tila === 'luonnos'
      ? villi
        ? `<form method="post" action="/kilpailut/${kilpailu.id}/laheta-vrl">
             <p class="pieni">Kilpailu on esikatseluversiona - tarkista yllä oleva kilpailukutsu, ja avaa
             ilmoittautuminen kun kaikki on kunnossa. Tämä on oma laji, joten kilpailua ei lähetetä VRL:n
             kisakalenteriin.</p>
             <button type="submit">Avaa ilmoittautuminen</button>
           </form>`
        : `<form method="post" action="/kilpailut/${kilpailu.id}/laheta-vrl">
             <p class="pieni">Kilpailu on esikatseluversiona - tarkista yllä oleva kilpailukutsu,
             ja lähetä se VRL:n kisakalenteriin vasta kun kaikki on kunnossa.</p>
             <button type="submit">Hyväksy ja lähetä VRL:n kisakalenteriin</button>
           </form>`
      : '';
  const uudelleenyritysNappi =
    kilpailu.tila === 'vrl_virhe'
      ? `<form method="post" action="/kilpailut/${kilpailu.id}/laheta-vrl"><button type="submit">Yritä VRL-lähetystä uudelleen</button></form>`
      : '';
  const tuloksetNappi =
    kilpailu.tila === 'tulokset_virhe'
      ? `<form method="post" action="/kilpailut/${kilpailu.id}/laheta-tulokset"><button type="submit">Yritä tulosten lähetystä uudelleen</button></form>`
      : '';
  // VRL-kisa-id ei koskaan tarvita/tule villille lajille (ks. lib/vrl_kisa_id_haku.js ja
  // lib/kilpailun_tulosten_lahetys.js) - lomake piilotetaan siis kokonaan sille.
  // Id:tä voi myös muuttaa tai tyhjentää käsin (esim. jos automaattihaku on täsmännyt
  // väärän kilpailun) - tyhjennys palauttaa kilpailun automaattihaun piiriin. Sama
  // tilajoukko tarkistetaan palvelinpuolella [id]/aseta-kisa-id.js:ssä.
  const KISA_ID_MUOKATTAVAT_TILAT = new Set(['avoinna', 'arvottu', 'tulokset_virhe']);
  const kisaIdLomake =
    KISA_ID_MUOKATTAVAT_TILAT.has(kilpailu.tila) && !villi
      ? `<form method="post" action="/kilpailut/${kilpailu.id}/aseta-kisa-id" class="kortti">
           <label>VRL-kisa-id (kilpailun id VRL:n "Omat kilpailut" -listalta / URL-polusta, tarvitaan tulosten automaattilähetykseen)
             <input name="vrl_kisa_id" ${kilpailu.vrl_kisa_id ? '' : 'required'} value="${escHtml(kilpailu.vrl_kisa_id || '')}" placeholder="esim. 900009">
           </label>
           ${kilpailu.vrl_kisa_id ? '<p class="pieni">Tyhjennä kenttä ja tallenna poistaaksesi id:n - automaattihaku yrittää silloin uudelleen.</p>' : ''}
           <button type="submit">${kilpailu.vrl_kisa_id ? 'Muuta kisa-id' : 'Tallenna kisa-id'}</button>
         </form>`
      : '';
  // Villin lajin kilpailun status asetetaan käsin (ks. [id]/aseta-villi-tila.js ja
  // lib/html.js:n naytettavaTila) - VRL-kisa-id:stä sitä ei voi päätellä kuten virallisilla.
  const VILLI_TILA_VALINNAT = [
    ['odottaa', 'Odottaa hyväksyntää'],
    ['hyvaksytty', 'Ilmoittautuminen auki'],
    ['tulokset_lahetetty', 'Tulokset lähetetty'],
  ];
  // Ennen migrations/0016_villi_tila.sql:ää julkaistulla villi_tila on NULL - valitaan silloin
  // badgea (varsinaista tilaa) vastaava vaihtoehto, ettei valikko näytä eri statusta kuin otsikko.
  const valittuVilliTila =
    kilpailu.villi_tila ||
    { avoinna: 'hyvaksytty', arvottu: 'hyvaksytty', tulokset_lahetetty: 'tulokset_lahetetty' }[kilpailu.tila] ||
    'odottaa';
  const villiTilaLomake =
    villi && kilpailu.tila !== 'luonnos'
      ? `<form method="post" action="/kilpailut/${kilpailu.id}/aseta-villi-tila" class="kortti">
           <label>Status (oma laji - asetetaan käsin, vaikuttaa vain näytettävään statukseen)
             <select name="villi_tila">
               ${VILLI_TILA_VALINNAT.map(
                 ([arvo, nimi]) => `<option value="${arvo}"${valittuVilliTila === arvo ? ' selected' : ''}>${nimi}</option>`
               ).join('')}
             </select>
           </label>
           <button type="submit">Tallenna status</button>
         </form>`
      : '';
  // Sama tilajoukko tarkistetaan palvelinpuolella [id]/poista-osallistujat.js:ssä.
  const OSALLISTUJAT_POISTETTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe', 'avoinna']);
  const poistaOsallistujatNappi = OSALLISTUJAT_POISTETTAVAT_TILAT.has(kilpailu.tila)
    ? `<form method="post" action="/kilpailut/${kilpailu.id}/poista-osallistujat"
           onsubmit="return confirm('Poistetaanko kilpailun ${escHtml(kilpailu.nimi).replace(/'/g, "\\'")} KAIKKI osallistujat kaikista luokista? Tätä ei voi perua.')">
         <button type="submit" class="toissijainen">Poista kaikki osallistujat</button>
       </form>`
    : '';
  // Kilpailun voi poistaa kokonaan vain ennen julkaisua VRL:n kisakalenteriin (ks.
  // [id]/poista.js:n vastaava POISTETTAVAT_TILAT-tarkistus palvelinpuolella) - julkaisun
  // jälkeen kutsun osoite on jo jaettu eikä sitä voi enää perua täältä.
  const POISTETTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe']);
  const poistaNappi = POISTETTAVAT_TILAT.has(kilpailu.tila)
    ? `<form method="post" action="/kilpailut/${kilpailu.id}/poista"
           onsubmit="return confirm('Poistetaanko kilpailu ${escHtml(kilpailu.nimi).replace(/'/g, "\\'")} kokonaan? Kaikki luokat ja osallistujat poistuvat mukana. Tätä ei voi perua.')">
         <button type="submit" class="toissijainen">Poista kilpailu kokonaan</button>
       </form>`
    : '';

  // Virhetiloissa (VRL hylkäsi lähetyksen tai tulosten lähetys epäonnistui) viesti on
  // syy jonka organisaattori tarvitsee heti - näytetään siis erottuvana huomiolaatikkona
  // (ks. .viesti-virhe/.viesti-onnistui ../../../lib/html.js:ssä) pelkän pienen tekstin
  // sijaan, ettei se huku muun sivun sekaan.
  const VIRHETILAT = new Set(['vrl_virhe', 'tulokset_virhe']);
  const vrlViestiHtml = kilpailu.vrl_viesti
    ? `<div class="viesti ${VIRHETILAT.has(kilpailu.tila) ? 'viesti-virhe' : 'viesti-onnistui'}">
         <strong>${VIRHETILAT.has(kilpailu.tila) ? 'VRL hylkäsi lähetyksen:' : 'VRL:'}</strong>
         ${escHtml(kilpailu.vrl_viesti)}
       </div>`
    : '';

  // Omien hevosten automaattilisäyksen (ks. lib/omat_hevoset.js) rivikohtaiset huomiot -
  // näytetään vain täällä hallintasivulla, ei koskaan julkisella kutsusivulla.
  let omatHevosetVirheet = [];
  try {
    omatHevosetVirheet = kilpailu.omat_hevoset_virheet ? JSON.parse(kilpailu.omat_hevoset_virheet) : [];
  } catch {
    omatHevosetVirheet = [];
  }
  const omatHevosetVirheetHtml = omatHevosetVirheet.length
    ? `<div class="viesti viesti-virhe">
         <strong>Omien hevosten automaattilisäyksessä huomioitavaa:</strong>
         <ul>${omatHevosetVirheet.map((v) => `<li>${escHtml(v)}</li>`).join('')}</ul>
       </div>`
    : '';
  const omatHevosetUudelleenNappi = valmisOmilleHevosille(kilpailu)
    ? `<form method="post" action="/kilpailut/${kilpailu.id}/hae-omat-hevoset">
         <button type="submit" class="toissijainen">Hae omat hevoset uudelleen</button>
       </form>`
    : '';

  const sisalto = `
    <h1>${escHtml(kilpailu.nimi)} ${tilaBadge(kilpailu)}</h1>
    ${vrlViestiHtml}
    <p class="pieni">
      Kilpailupäivä ${escHtml(kilpailu.kp)} · VIP ${escHtml(kilpailu.vip)} ·
      ${villi ? 'oma laji, ei lähetetä VRL:ään' : kilpailu.vrl_kisa_id ? `VRL-kisa-id ${escHtml(kilpailu.vrl_kisa_id)}` : 'ei vielä VRL-kisa-id:tä'} ·
      enintään ${escHtml(kilpailu.max_lahtoja_per_hevonen)} lähtöä/hevonen ·
      enintään ${escHtml(kilpailu.max_osallistujia_per_luokka)} osallistujaa/luokka
    </p>
    ${kilpailu.kutsu_url ? `<p class="pieni">Kilpailukutsu${kilpailu.tila === 'luonnos' ? ' (esikatselu)' : ''}: <a href="${escHtml(kilpailu.kutsu_url)}">${escHtml(kilpailu.kutsu_url)}</a></p>` : ''}
    ${muokkausLomakeHtml}
    ${hyvaksyNappi}
    ${uudelleenyritysNappi}
    ${tuloksetNappi}
    ${kisaIdLomake}
    ${villiTilaLomake}
    ${omatHevosetVirheetHtml}
    ${omatHevosetUudelleenNappi}
    <h2>Luokat</h2>
    ${luokkaKortit.join('')}
    ${MUOKATTAVAT_TILAT.has(kilpailu.tila) ? lisaaLuokkaLomakeHtml(kilpailu.id) : ''}
    ${poistaOsallistujatNappi}
    ${poistaNappi ? `<h2>Poista kilpailu</h2><p class="pieni">Vain mahdollista ennen VRL-julkaisua.</p>${poistaNappi}` : ''}
  `;

  return vastaus(sivu({ otsikko: kilpailu.nimi, sisalto }));
}
