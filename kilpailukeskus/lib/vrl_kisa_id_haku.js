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
import { haeVrlKisaId } from './vrl_kalenteri_client.js';
import { onkoVirallinenJaos } from './jaokset.js';
import { lisaaOmatHevosetAutomaattisesti } from './omat_hevoset.js';

const KOOLDOWN_MS = 5 * 60 * 1000;

function kooldownVoimassa(kilpailu) {
  if (!kilpailu.vrl_kisa_id_yritetty_at) return false;
  const edellinen = new Date(`${kilpailu.vrl_kisa_id_yritetty_at.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(edellinen)) return false;
  return Date.now() - edellinen < KOOLDOWN_MS;
}

/**
 * @param {object} env       Pages Functions -ympäristö (tarvitaan env.DB ja env.VRL_BASE_URL)
 * @param {object} kilpailu  db.js:n getKilpailu/getKilpailuByKutsu-rivi
 * @returns {Promise<object>} sama kilpailu, tai kopio jossa vrl_kisa_id on täydennetty jos
 *   haku onnistui juuri nyt (jotta kutsuva sivu ei tarvitse erillistä uudelleenlatausta)
 */
async function yritaHakeaVrlKisaId(env, kilpailu) {
  if (!kilpailu || kilpailu.vrl_kisa_id || kilpailu.tila !== 'avoinna') return kilpailu;
  // Villin lajin (ks. migrations/0013_lajit.sql) kilpailua ei koskaan lähetetä VRL:ään, joten
  // sitä ei myöskään koskaan löydy VRL:n kisakalenterista - haku vain kuormittaisi VRL:n
  // kalenterisivua turhaan.
  if (!onkoVirallinenJaos(kilpailu.jaos)) return kilpailu;
  if (kooldownVoimassa(kilpailu)) return kilpailu;

  let tulos = null;
  try {
    tulos = await haeVrlKisaId({
      baseUrl: env.VRL_BASE_URL,
      kutsuUrl: kilpailu.kutsu_url,
      varatutIdt: await listVaratutVrlKisaIdt(env.DB, kilpailu.id),
    });
  } catch (virhe) {
    console.error('VRL-kisa-id:n automaattihaku epäonnistui:', virhe);
  }

  if (tulos) {
    await asetaVrlKisaId(env.DB, kilpailu.id, tulos.kisaId);
    let paivitetty = { ...kilpailu, vrl_kisa_id: tulos.kisaId };

    const luokat = await listLuokat(env.DB, kilpailu.id);
    const hevosTulos = await lisaaOmatHevosetAutomaattisesti(env, paivitetty, luokat);
    await merkitseOmatHevosetLisatty(env.DB, kilpailu.id, hevosTulos.virheet);
    paivitetty = {
      ...paivitetty,
      omat_hevoset_lisatty_at: new Date().toISOString(),
      omat_hevoset_virheet: hevosTulos.virheet.length ? JSON.stringify(hevosTulos.virheet) : null,
    };

    return paivitetty;
  }

  await merkitseVrlKisaIdYritetty(env.DB, kilpailu.id);
  return kilpailu;
}

export { yritaHakeaVrlKisaId };
