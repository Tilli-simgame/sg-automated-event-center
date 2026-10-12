'use strict';

import { getKilpailu, listLuokat, listOsallistujat, tallennaTulokset, merkitseArvottu } from './db.js';
import { arvoLuokka, arvoLuokkaPainotettu } from './arvonta.js';
import { SUHTEUTETTU_ARVONTATAPA, haePainotOsallistujille } from './rmp_arvonta.js';

// Arpoo jokaisen luokan sijoitukset ja tallentaa ne, sitten merkitsee kilpailun arvotuksi.
// Kutsutaan sekä cron-workerista (automaattinen laukaisu) että voitaisiin kutsua manuaalisesti.
// Kaikki luokat arvotaan ennen kuin mitään tallennetaan: suhteutetussa arvonnassa RMP:n
// rajapinnan virhe keskeyttää koko kilpailun, jolloin mitään ei jää puoliksi tallennetuksi ja
// cron yrittää uudelleen seuraavalla ajolla.
async function arvoJaTallenna(db, kilpailuId) {
  const kilpailu = await getKilpailu(db, kilpailuId);
  const kaytaRmpPainotusta = Boolean(kilpailu) && String(kilpailu.arvontatapa) === SUHTEUTETTU_ARVONTATAPA;
  const rmpValimuisti = new Map();

  const luokat = await listLuokat(db, kilpailuId);
  const arvotut = [];
  for (const luokka of luokat) {
    const osallistujat = await listOsallistujat(db, luokka.id);
    if (osallistujat.length === 0) continue;
    const sijoitukset = kaytaRmpPainotusta
      ? arvoLuokkaPainotettu(osallistujat, await haePainotOsallistujille(kilpailu.jaos, osallistujat, rmpValimuisti))
      : arvoLuokka(osallistujat);
    arvotut.push([luokka.id, sijoitukset]);
  }
  for (const [luokkaId, sijoitukset] of arvotut) {
    await tallennaTulokset(db, luokkaId, sijoitukset);
  }
  await merkitseArvottu(db, kilpailuId);
}

export { arvoJaTallenna };
