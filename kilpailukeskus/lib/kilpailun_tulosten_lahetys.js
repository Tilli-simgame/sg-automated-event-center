'use strict';

/**
 * Muotoilee kilpailun jo arvotut tulokset (tulokset-taulu) laheta_tulokset.js:n
 * odottamaan muotoon ja lähettää ne VRL:ään. VRL:n "omat kilpailut" -sivu ei paljasta
 * kisan id:tä kilpailun luontivastauksessa, joten `vrl_kisa_id` on täytettävä kilpailun
 * sivulta käsin ennen kuin tämä voi onnistua (ks. functions/kilpailut/[id]/aseta-kisa-id.js).
 */

import { getKilpailu, listLuokat, listTulokset, merkitseTuloksetLahetetty } from './db.js';
import { lahetaTulokset } from './tulokset_client.js';
import { onkoVirallinenJaos } from './jaokset.js';

async function laheteTuloksetVrl(env, kilpailuId) {
  const kilpailu = await getKilpailu(env.DB, kilpailuId);
  if (!kilpailu) {
    return { onnistui: false, viesti: 'Kilpailua ei löytynyt.' };
  }

  // Villin lajin (ks. migrations/0013_lajit.sql) kilpailulla ei koskaan ole eikä tule
  // olemaan vrl_kisa_id:tä, koska sitä ei ole koskaan lähetetty VRL:ään (ks.
  // functions/kilpailut/[id]/laheta-vrl.js) - tulokset "lähetetään" siis suoraan valmiiksi
  // sen sijaan että cron jäisi odottamaan kisa-id:tä joka ei koskaan tule.
  if (!onkoVirallinenJaos(kilpailu.jaos)) {
    const viesti = 'Oma laji - tuloksia ei lähetetä VRL:ään.';
    await merkitseTuloksetLahetetty(env.DB, kilpailuId, { onnistui: true, viesti });
    return { onnistui: true, viesti };
  }

  if (!kilpailu.vrl_kisa_id) {
    const viesti = 'VRL-kisa-id puuttuu - täytä se kilpailun sivulta ennen kuin tulokset voidaan lähettää.';
    await merkitseTuloksetLahetetty(env.DB, kilpailuId, { onnistui: false, viesti });
    return { onnistui: false, viesti };
  }

  const luokat = await listLuokat(env.DB, kilpailuId);
  const luokatData = [];
  for (const luokka of luokat) {
    // Luokka lähetetään myös ilman osallistujia (tyhjänä), jotta se näkyy VRL:n tuloksissa.
    const tulokset = await listTulokset(env.DB, luokka.id);
    const osallistujat = tulokset
      .filter((t) => t.sija != null)
      .map((t) => `${t.sija}. ${t.nimi}`)
      .join('\n');
    const hylatyt = tulokset
      .filter((t) => t.sija == null)
      .map((t) => t.nimi)
      .join('\n');
    luokatData.push({ luokka: luokka.nimi, osallistujat, hylatyt });
  }

  const tulos = await lahetaTulokset({
    baseUrl: env.VRL_BASE_URL,
    identity: env.VRL_IDENTITY,
    password: env.VRL_PASSWORD,
    kisaId: kilpailu.vrl_kisa_id,
    luokat: luokatData,
  });

  await merkitseTuloksetLahetetty(env.DB, kilpailuId, { onnistui: tulos.onnistui, viesti: tulos.viesti });
  return tulos;
}

export { laheteTuloksetVrl };
