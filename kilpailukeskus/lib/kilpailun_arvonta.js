'use strict';

import { getKilpailu, getLaji, listLuokat, listKilpailunOsallistujat, lisaaTaytehevoset, tallennaArvonta } from './db.js';
import { arvoLuokka, arvoLuokkaPainotettu } from './arvonta.js';
import { SUHTEUTETTU_ARVONTATAPA, haePainotOsallistujille } from './rmp_arvonta.js';

// Villin lajin täytehevoset (ks. migrations/0019_laji_taytehevoset.sql): jos luokassa on
// vähemmän kuin lajin min_osallistujia_per_luokka osallistujaa, lisätään täytehevosia kunnes
// raja täyttyy - kuitenkin enintään luokan omaan max_osallistujia-rajaan asti. Täytehevoset
// tallennetaan tavallisina osallistujina (ilman tunnuksia), joten ne arvotaan ja näkyvät
// tuloksissa kuten muutkin. Idempotentti: jos arvonta keskeytyy ja cron yrittää uudelleen,
// jo lisätyt täytehevoset lasketaan mukaan eikä uusia lisätä tuplana.
// Palauttaa luokan puuttuvat täytehevoset lisättäviksi riveiksi ({ luokkaId, nimi }) - ne
// tallennetaan kaikista luokista yhtenä batchina (ks. arvoJaTallenna).
function puuttuvatTaytehevoset(laji, luokka, osallistujat) {
  const min = laji ? laji.min_osallistujia_per_luokka || 0 : 0;
  const tavoite = luokka.max_osallistujia ? Math.min(min, luokka.max_osallistujia) : min;
  const puuttuu = tavoite - osallistujat.length;
  if (puuttuu <= 0) return [];
  const pohja = laji.taytehevonen_nimi || 'Ratsastaja - Täytehevonen';
  return Array.from({ length: puuttuu }, (_, i) => ({ luokkaId: luokka.id, nimi: pohja.replace(/\{n\}/g, String(i + 1)) }));
}

// Villin lajin hylätyt (ks. migrations/0020_laji_hylatyt_ja_taytehevosmerkinta.sql): luokan
// alhaisimman tuloksen saaneista hylätään ceil(prosentti / 100 x osallistujamäärä) - hylätyt
// saavat sijan null (tallennetaan tulokset-tauluun sija = NULL). Lasketaan kokonaisluvuilla,
// koska esim. 0.1 * 30 on liukulukuna 3.0000000000000004 ja pyöristyisi ylöspäin neljään.
function merkitseHylatyt(laji, sijoitukset) {
  const prosentti = laji ? laji.hylattyja_prosenttia || 0 : 0;
  const hylattyja = Math.min(sijoitukset.length, Math.ceil((prosentti * sijoitukset.length) / 100));
  const raja = sijoitukset.length - hylattyja;
  return sijoitukset.map((s, i) => (i < raja ? s : { ...s, sija: null }));
}

// Arpoo jokaisen luokan sijoitukset ja tallentaa ne, sitten merkitsee kilpailun arvotuksi.
// Kutsutaan sekä cron-workerista (automaattinen laukaisu) että voitaisiin kutsua manuaalisesti.
// Kaikki luokat arvotaan ennen kuin mitään tallennetaan: suhteutetussa arvonnassa RMP:n
// rajapinnan virhe keskeyttää koko kilpailun, jolloin mitään ei jää puoliksi tallennetuksi ja
// cron yrittää uudelleen seuraavalla ajolla.
//
// Tietokantakutsuja on kiinteä määrä kilpailua kohden luokkien ja osallistujien määrästä
// riippumatta (osallistujat yhdellä kyselyllä, täytehevoset ja tulokset batcheina), koska
// rivikohtaiset kyselyt ylittävät isolla kilpailulla Workerin yhden pyynnön API-kutsurajan.
async function arvoJaTallenna(db, kilpailuId) {
  const kilpailu = await getKilpailu(db, kilpailuId);
  const kaytaRmpPainotusta = Boolean(kilpailu) && String(kilpailu.arvontatapa) === SUHTEUTETTU_ARVONTATAPA;
  const rmpValimuisti = new Map();
  // VRL:n jaoksilla ei ole riviä lajit-taulussa -> null -> ei täytehevosia.
  const villiLaji = kilpailu ? await getLaji(db, kilpailu.jaos) : null;

  const luokat = await listLuokat(db, kilpailuId);
  let osallistujatLuokittain = await listKilpailunOsallistujat(db, kilpailuId);
  const osallistujatLuokalle = (luokka) => osallistujatLuokittain.get(String(luokka.id)) || [];

  const taytehevoset = luokat.flatMap((luokka) => puuttuvatTaytehevoset(villiLaji, luokka, osallistujatLuokalle(luokka)));
  if (taytehevoset.length > 0) {
    await lisaaTaytehevoset(db, taytehevoset);
    // Haetaan uudelleen, jotta täytehevosilla on osallistuja-id:t tuloksia varten.
    osallistujatLuokittain = await listKilpailunOsallistujat(db, kilpailuId);
  }

  const arvotut = [];
  for (const luokka of luokat) {
    const osallistujat = osallistujatLuokalle(luokka);
    if (osallistujat.length === 0) continue;
    const sijoitukset = kaytaRmpPainotusta
      ? arvoLuokkaPainotettu(osallistujat, await haePainotOsallistujille(kilpailu.jaos, osallistujat, rmpValimuisti))
      : arvoLuokka(osallistujat);
    arvotut.push([luokka.id, merkitseHylatyt(villiLaji, sijoitukset)]);
  }
  await tallennaArvonta(db, kilpailuId, arvotut);
}

export { arvoJaTallenna };
