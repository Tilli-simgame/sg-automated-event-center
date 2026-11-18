'use strict';

/**
 * Kutsutaan kilpailun kutsu-/hallintasivujen GET-käsittelijöistä (ks.
 * functions/kilpailut/[id]/index.js ja functions/[jaos]/[vuosi]/[kuukausi]/[numero].js) -
 * yrittää täydentää puuttuvan vrl_kisa_id:n automaattisesti VRL:n kisakalenterista (ks.
 * ./vrl_kalenteri_client.js) sen sijaan että järjestäjän pitäisi käydä kopioimassa se käsin
 * VRL:n "Omat kilpailut" -listalta [id]/aseta-kisa-id.js:n lomakkeeseen.
 *
 * Heti kun vrl_kisa_id löytyy, käynnistetään myös omien hevosten automaattilisäys (ks.
 * lib/omat_hevoset.js) tässä samassa funktiossa - riippumatta kumpi sivu (julkinen kutsusivu
 * tai järjestäjän hallintasivu) löysi id:n juuri nyt, ettei lisäys jää odottamaan että joku
 * käy erikseen hallintasivulla. functions/kilpailut/[id]/index.js tekee saman tarkistuksen
 * varalta (esim. id asetettu käsin [id]/aseta-kisa-id.js:llä).
 *
 * KOOLDOWN_MS estää VRL:n kalenterisivun hakemisen joka ikisellä sivun avauksella (varsinkin
 * julkinen kutsusivu voi saada paljon katselijoita) - epäonnistunutkin yritys merkitään, jotta
 * seuraava yritys viivästyy siinäkin tapauksessa (esim. VRL ei ole vielä hyväksynyt kutsua).
 */

import { asetaVrlKisaId, listVaratutVrlKisaIdt, merkitseVrlKisaIdYritetty, listLuokat, merkitseOmatHevosetLisatty } from './db.js';
import { haeKalenterinRivit, etsiKisaId } from './vrl_kalenteri_client.js';
import { onkoVirallinenJaos } from './jaokset.js';
import { lisaaOmatHevosetAutomaattisesti, valmisOmilleHevosille } from './omat_hevoset.js';

const KOOLDOWN_MS = 5 * 60 * 1000;

function kooldownVoimassa(kilpailu) {
  if (!kilpailu.vrl_kisa_id_yritetty_at) return false;
  const edellinen = new Date(`${kilpailu.vrl_kisa_id_yritetty_at.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(edellinen)) return false;
  return Date.now() - edellinen < KOOLDOWN_MS;
}

// Yhden sivunlatauksen aikana jaettu VRL:n kisakalenteri: haetaan vasta kun jokin kilpailu
// sitä oikeasti tarvitsee, ja korkeintaan kerran - kisaryppään (ks. kasitteleRyppaanKilpailut)
// kaikki kilpailut täsmätään samoihin riveihin.
function luoKalenteri(env) {
  let lupaus = null;
  return () => {
    if (!lupaus) lupaus = haeKalenterinRivit({ baseUrl: env.VRL_BASE_URL });
    return lupaus;
  };
}

// Omien hevosten automaattilisäys (ks. lib/omat_hevoset.js), jos kilpailu on siihen valmis eikä
// lisäystä ole vielä tehty (omat_hevoset_lisatty_at) - palauttaa kilpailun päivitettynä.
async function lisaaOmatHevosetJosValmis(env, kilpailu, luokat) {
  if (!valmisOmilleHevosille(kilpailu) || kilpailu.omat_hevoset_lisatty_at) return kilpailu;
  const tulos = await lisaaOmatHevosetAutomaattisesti(env, kilpailu, luokat || (await listLuokat(env.DB, kilpailu.id)));
  await merkitseOmatHevosetLisatty(env.DB, kilpailu.id, tulos.virheet);
  return {
    ...kilpailu,
    omat_hevoset_lisatty_at: new Date().toISOString(),
    omat_hevoset_virheet: tulos.virheet.length ? JSON.stringify(tulos.virheet) : null,
  };
}

/**
 * @param {object} env       Pages Functions -ympäristö (tarvitaan env.DB ja env.VRL_BASE_URL)
 * @param {object} kilpailu  db.js:n getKilpailu/getKilpailuByKutsu-rivi
 * @param {Function} [kalenteri] luoKalenteri(env):n palauttama jaettu kalenterihaku
 * @returns {Promise<object>} sama kilpailu, tai kopio jossa vrl_kisa_id on täydennetty jos
 *   haku onnistui juuri nyt (jotta kutsuva sivu ei tarvitse erillistä uudelleenlatausta)
 */
async function yritaHakeaVrlKisaId(env, kilpailu, kalenteri = luoKalenteri(env)) {
  if (!kilpailu || kilpailu.vrl_kisa_id || kilpailu.tila !== 'avoinna') return kilpailu;
  // Villin lajin (ks. migrations/0013_lajit.sql) kilpailua ei koskaan lähetetä VRL:ään, joten
  // sitä ei myöskään koskaan löydy VRL:n kisakalenterista - haku vain kuormittaisi VRL:n
  // kalenterisivua turhaan.
  if (!onkoVirallinenJaos(kilpailu.jaos)) return kilpailu;
  if (kooldownVoimassa(kilpailu)) return kilpailu;

  let tulos = null;
  try {
    const rivit = await kalenteri();
    tulos = rivit && etsiKisaId(rivit, kilpailu.kutsu_url, await listVaratutVrlKisaIdt(env.DB, kilpailu.id));
  } catch (virhe) {
    console.error('VRL-kisa-id:n automaattihaku epäonnistui:', virhe);
  }

  if (tulos) {
    // asetaVrlKisaId nollaa myös omat_hevoset_lisatty_at:n (ks. db.js), joten lisäys tehdään nyt.
    await asetaVrlKisaId(env.DB, kilpailu.id, tulos.kisaId);
    return lisaaOmatHevosetJosValmis(env, {
      ...kilpailu,
      vrl_kisa_id: tulos.kisaId,
      omat_hevoset_lisatty_at: null,
      omat_hevoset_virheet: null,
    });
  }

  await merkitseVrlKisaIdYritetty(env.DB, kilpailu.id);
  return kilpailu;
}

/**
 * Kisarypäs (ks. migrations/0022_kisaryppaat.sql): kilpailijat ilmoittautuvat ryppään kaikkiin
 * kilpailuihin yhden kilpailun kutsusivulta, joten ryppään muiden kilpailujen sivuja ei
 * välttämättä avata koskaan. Koska vrl_kisa_id:n haku ja omien hevosten lisäys tehdään
 * sivunlatauksen yhteydessä, ne jäisivät muilta ryppään kilpailuilta tekemättä - siksi
 * minkä tahansa ryppään kilpailun sivu hoitaa ne koko ryppäälle.
 *
 * Valmiissa tilanteessa (id:t löytyneet, hevoset lisätty) tämä ei tee yhtään kantakyselyä
 * tai ulkoista hakua - kaikki ehdot luetaan jo haetuista riveistä.
 *
 * @param {object} kilpailu          sivun oma (jo käsitelty) kilpailu
 * @param {Array}  ryppaanKilpailut  listRyppaanKilpailut-rivit
 * @param {Function} [kalenteri]     luoKalenteri(env):n palauttama jaettu kalenterihaku
 * @returns {Promise<Array>} ryppaanKilpailut päivitettyinä
 */
async function kasitteleRyppaanKilpailut(env, kilpailu, ryppaanKilpailut, kalenteri = luoKalenteri(env)) {
  const tulos = [];
  for (const k of ryppaanKilpailut) {
    if (k.id === kilpailu.id) {
      tulos.push({ ...k, ...kilpailu });
      continue;
    }
    try {
      tulos.push(await lisaaOmatHevosetJosValmis(env, await yritaHakeaVrlKisaId(env, k, kalenteri)));
    } catch (virhe) {
      console.error(`Ryppään kilpailun ${k.id} käsittely epäonnistui:`, virhe);
      tulos.push(k);
    }
  }
  return tulos;
}

export { yritaHakeaVrlKisaId, kasitteleRyppaanKilpailut, lisaaOmatHevosetJosValmis, luoKalenteri };
