'use strict';

/**
 * Pieni kokoelma D1-kyselyitä. Ei ORM:ää - kilpailukeskuksen skeema on pieni
 * (ks. ../migrations/0001_init.sql) ja suorat kyselyt pitävät riippuvuudet nollassa,
 * samassa hengessä kuin ../../lib/*.js.
 */

async function listKilpailut(db) {
  const { results } = await db
    .prepare('SELECT * FROM kilpailut ORDER BY kp_iso DESC, luotu_at DESC')
    .all();
  return results;
}

async function getKilpailu(db, id) {
  return db.prepare('SELECT * FROM kilpailut WHERE id = ?').bind(id).first();
}

async function createKilpailu(db, k) {
  const tulos = await db
    .prepare(
      `INSERT INTO kilpailut
         (nimi, jaos, kp, kp_iso, vip, vip_iso, arvontatapa, jarj_talli, jarj_talli_nimi, jarj_talli_url, kutsu_url, kutsu_numero, info, lisatietoja, takaaja, max_lahtoja_per_hevonen, max_osallistujia_per_luokka, vastuuhenkilo_nimi, vastuuhenkilo_email, tila)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'luonnos')`
    )
    .bind(
      k.nimi, k.jaos, k.kp, k.kpIso, k.vip, k.vipIso, k.arvontatapa, k.jarjTalli, k.jarjTalliNimi, k.jarjTalliUrl,
      k.kutsuUrl, k.kutsuNumero, k.info || null, k.lisatietoja || null, k.takaaja || null, k.maxLahtojaPerHevonen, k.maxOsallistujiaPerLuokka,
      k.vastuuhenkiloNimi, k.vastuuhenkiloEmail
    )
    .run();
  return tulos.meta.last_row_id;
}

// Kilpailun muokkaus ennen VRL-lähetystä (tila 'luonnos' tai 'vrl_virhe' - ks.
// [id]/muokkaa.js). kutsu_url/kutsu_numero päivitetään mukana vain jos jaos tai
// kilpailupäivän kuukausi on muuttunut (muuten ne pidetään ennallaan kutsusivun
// osoitteen pysyvyyden vuoksi, ks. muokkaa.js:n kutsun uudelleenlaskennan ehto).
async function updateKilpailu(db, id, k) {
  await db
    .prepare(
      `UPDATE kilpailut
       SET nimi = ?, jaos = ?, kp = ?, kp_iso = ?, vip = ?, vip_iso = ?, arvontatapa = ?,
           jarj_talli = ?, jarj_talli_nimi = ?, jarj_talli_url = ?, info = ?, lisatietoja = ?, takaaja = ?,
           max_lahtoja_per_hevonen = ?, max_osallistujia_per_luokka = ?,
           vastuuhenkilo_nimi = ?, vastuuhenkilo_email = ?, kutsu_url = ?, kutsu_numero = ?
       WHERE id = ?`
    )
    .bind(
      k.nimi, k.jaos, k.kp, k.kpIso, k.vip, k.vipIso, k.arvontatapa, k.jarjTalli, k.jarjTalliNimi, k.jarjTalliUrl,
      k.info || null, k.lisatietoja || null, k.takaaja || null, k.maxLahtojaPerHevonen, k.maxOsallistujiaPerLuokka,
      k.vastuuhenkiloNimi, k.vastuuhenkiloEmail, k.kutsuUrl, k.kutsuNumero, id
    )
    .run();
}

async function poistaLuokat(db, kilpailuId) {
  await db.prepare('DELETE FROM luokat WHERE kilpailu_id = ?').bind(kilpailuId).run();
}

// Kilpailun kokonaan poistaminen (ks. [id]/poista.js) - sallittu vain ennen julkaisua
// (tilat 'luonnos'/'vrl_virhe', ks. poista.js:n oma tarkistus). Luokat, osallistujat ja
// mahdolliset tulokset poistuvat kannan ON DELETE CASCADE -viittausten kautta (D1:ssä
// foreign_keys on oletuksena päällä), joten pelkkä kilpailut-rivin poisto riittää.
async function poistaKilpailu(db, id) {
  await db.prepare('DELETE FROM kilpailut WHERE id = ?').bind(id).run();
}

// Juokseva kutsunumero, joka nollautuu kuukausittain per jaos (ei koko historian yli) -
// esim. ensimmäinen ERJ-kutsu lokakuulle 2026 on 1 ("0001" URL:ssa), seuraava ERJ-kutsu
// samalle kuulle 2, marraskuussa ERJ alkaa taas 1:stä. Perustuu MAX:iin (ei COUNT:iin),
// jotta poistettu kilpailu ei aiheuta numerotörmäystä uuden kanssa.
async function seuraavaKutsuNumero(db, jaos, vuosi, kuukausi) {
  const rivi = await db
    .prepare(
      `SELECT COALESCE(MAX(kutsu_numero), 0) + 1 AS seuraava FROM kilpailut
       WHERE jaos = ? AND substr(kp_iso, 1, 4) = ? AND substr(kp_iso, 6, 2) = ?`
    )
    .bind(jaos, vuosi, kuukausi)
    .first();
  return rivi.seuraava;
}

// Kutsusivun näyttämiseen: etsii kilpailun jaos-lyhenteen, kilpailupäivän vuoden/kuukauden
// ja kutsunumeron perusteella (ks. URL-muoto functions/[jaos]/[vuosi]/[kuukausi]/[numero].js).
async function getKilpailuByKutsu(db, jaos, vuosi, kuukausi, numero) {
  return db
    .prepare(
      `SELECT * FROM kilpailut
       WHERE jaos = ? AND substr(kp_iso, 1, 4) = ? AND substr(kp_iso, 6, 2) = ? AND kutsu_numero = ?`
    )
    .bind(jaos, vuosi, kuukausi, numero)
    .first();
}

async function merkitseVrlLahetys(db, id, { onnistui, viesti, vrlKisaId }) {
  await db
    .prepare(
      `UPDATE kilpailut
       SET tila = ?, vrl_viesti = ?, vrl_kisa_id = COALESCE(?, vrl_kisa_id),
           lahetetty_vrl_at = datetime('now')
       WHERE id = ?`
    )
    .bind(onnistui ? 'avoinna' : 'vrl_virhe', viesti, vrlKisaId || null, id)
    .run();
}

async function asetaVrlKisaId(db, id, vrlKisaId) {
  await db.prepare('UPDATE kilpailut SET vrl_kisa_id = ? WHERE id = ?').bind(vrlKisaId, id).run();
}

// Järjestäjän käsin tekemä muutos (ks. functions/kilpailut/[id]/aseta-kisa-id.js) - tyhjä
// arvo tyhjentää id:n, jolloin automaattihaku (ks. ../lib/vrl_kisa_id_haku.js) yrittää
// uudelleen. Omien hevosten lisäysmerkintä nollataan, jotta lisäys ajetaan uudelleen
// uudella id:llä (lisäys on idempotentti, ks. ../lib/omat_hevoset.js).
async function muutaVrlKisaIdKasin(db, id, vrlKisaId) {
  await db
    .prepare(
      `UPDATE kilpailut
       SET vrl_kisa_id = ?, omat_hevoset_lisatty_at = NULL, omat_hevoset_virheet = NULL
       WHERE id = ?`
    )
    .bind(vrlKisaId || null, id)
    .run();
}

// Kaikki muiden kilpailujen jo käyttämät VRL-kisa-id:t - yksi VRL:n kisa vastaa aina vain
// yhtä Kilpailukeskuksen kilpailua, joten jo varattua id:tä ei saa antaa toiselle (ks.
// ../lib/vrl_kisa_id_haku.js ja functions/kilpailut/[id]/aseta-kisa-id.js).
async function listVaratutVrlKisaIdt(db, poisLukienKilpailuId) {
  const { results } = await db
    .prepare(
      `SELECT vrl_kisa_id FROM kilpailut
       WHERE vrl_kisa_id IS NOT NULL AND vrl_kisa_id != '' AND id != ?`
    )
    .bind(poisLukienKilpailuId)
    .all();
  return new Set(results.map((r) => String(r.vrl_kisa_id).trim()));
}

async function getKilpailuByVrlKisaId(db, vrlKisaId, poisLukienKilpailuId) {
  return db
    .prepare('SELECT id, nimi FROM kilpailut WHERE TRIM(vrl_kisa_id) = ? AND id != ? LIMIT 1')
    .bind(String(vrlKisaId).trim(), poisLukienKilpailuId)
    .first();
}

// "Villin" lajin (ks. lajit-taulu alempana) kilpailu ei koskaan käy läpi VRL-lähetystä -
// tämä avaa ilmoittautumisen suoraan samaan 'avoinna'-tilaan kuin onnistunut VRL-lähetys
// tekisi (ks. merkitseVrlLahetys yllä), jotta loppu tilakone (arvonta, ilmoittautuminen,
// kilpailukutsu) toimii identtisesti - ainoa ero on vrl_viesti ja ettei vrl_kisa_id koskaan
// täyty (ks. functions/kilpailut/[id]/laheta-vrl.js). Näyttötilaksi (villi_tila, ks.
// migrations/0016_villi_tila.sql) asetetaan 'odottaa' - järjestäjä vaihtaa sen käsin
// hallintasivulta (ks. functions/kilpailut/[id]/aseta-villi-tila.js).
async function merkitseJulkaistuVillina(db, id) {
  await db
    .prepare(
      `UPDATE kilpailut SET tila = 'avoinna', villi_tila = 'odottaa', vrl_viesti = ?, lahetetty_vrl_at = datetime('now') WHERE id = ?`
    )
    .bind('Oma laji - kilpailua ei lähetetä VRL:n kisakalenteriin, ilmoittautuminen avattu suoraan.', id)
    .run();
}

async function asetaVilliTila(db, id, villiTila) {
  await db.prepare('UPDATE kilpailut SET villi_tila = ? WHERE id = ?').bind(villiTila, id).run();
}

// Aikaleima automaattihaun (ks. ../lib/vrl_kisa_id_haku.js) viimeisimmästä yrityksestä -
// riippumatta löytyikö id vai ei, jotta epäonnistunutkin haku jarruttaa seuraavaa yritystä
// eikä VRL:n kalenterisivua hakemassa käydä joka ikisellä kutsu-/hallintasivun avauksella.
async function merkitseVrlKisaIdYritetty(db, id) {
  await db
    .prepare("UPDATE kilpailut SET vrl_kisa_id_yritetty_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

// Merkitsee omien hevosten automaattihaun (ks. ../lib/omat_hevoset.js) tehdyksi -
// riippumatta löytyikö kaikille hevosille sopiva luokka vai ei, jotta haku ei toistu joka
// sivulatauksella. virheet on merkkijonotaulukko (tyhjä jos kaikki meni ongelmitta),
// tallennetaan JSON:ina koska rivien määrä vaihtelee kilpailukohtaisesti.
async function merkitseOmatHevosetLisatty(db, id, virheet) {
  await db
    .prepare("UPDATE kilpailut SET omat_hevoset_lisatty_at = datetime('now'), omat_hevoset_virheet = ? WHERE id = ?")
    .bind(virheet && virheet.length ? JSON.stringify(virheet) : null, id)
    .run();
}

// Järjestäjän itse luomat "villit" lajit (ks. migrations/0013_lajit.sql ja
// lib/jaokset.js:n onkoVirallinenJaos) - hallinnoidaan functions/lajit/-sivuilta ja
// tarjotaan "Uusi kilpailu" -lomakkeen jaos-valikossa VRL:n omien jaoksien rinnalla
// (ks. lib/kilpailu_lomake.js).
async function listLajit(db) {
  const { results } = await db.prepare('SELECT * FROM lajit ORDER BY luotu_at').all();
  return results;
}

async function getLaji(db, id) {
  return db.prepare('SELECT * FROM lajit WHERE id = ?').bind(id).first();
}

// Villien lajien id:t alkavat 9900:sta ja juoksevat siitä ylöspäin - kaukana VRL:n omista
// jaos-id:istä (1-6, ks. lib/jaokset.js), jotta ne eivät voi koskaan sekoittua keskenään.
async function seuraavaLajiId(db) {
  const rivi = await db.prepare('SELECT MAX(CAST(id AS INTEGER)) AS maxId FROM lajit').first();
  const edellinen = rivi && rivi.maxId != null ? rivi.maxId : 9899;
  return String(Math.max(edellinen + 1, 9900));
}

async function createLaji(db, { id, lyhenne, nimi }) {
  await db.prepare('INSERT INTO lajit (id, lyhenne, nimi) VALUES (?, ?, ?)').bind(id, lyhenne, nimi).run();
}

// Kieltäytyy poistamasta lajia jota jokin kilpailu jo käyttää (ks. laskeKilpailutJaokselle) -
// muuten kyseiset kilpailut jäisivät viittaamaan olemattomaan jaokseen (rikkoisi mm.
// kilpailukutsun lyhenne-URL:n resoluution, ks. functions/[jaos]/...).
async function poistaLaji(db, id) {
  await db.prepare('DELETE FROM lajit WHERE id = ?').bind(id).run();
}

// Järjestäjän itse asettamat lajikohtaiset säännöt (ks. migrations/0014_laji_saannot.sql ja
// functions/lajit/[id]/muokkaa-saannot.js) - korvaavat VRL:n jaoskohtaiset rajat
// (lib/jaosrajoitukset.js) tälle lajille kaikissa sen kilpailuissa.
async function paivitaLajinSaannot(
  db,
  id,
  { maxOsallistujiaPerLuokka, maxLahtojaPerHevonen, maxHevostaRatsastajaPerLuokka, osallistumismuoto, saannot, omatHevosetLaji, ilmanTunnuksia }
) {
  await db
    .prepare(
      `UPDATE lajit SET max_osallistujia_per_luokka = ?, max_lahtoja_per_hevonen = ?,
       max_hevosta_ratsastaja_per_luokka = ?, osallistumismuoto = ?, saannot = ?, omat_hevoset_laji = ?, ilman_tunnuksia = ? WHERE id = ?`
    )
    .bind(
      maxOsallistujiaPerLuokka,
      maxLahtojaPerHevonen,
      maxHevostaRatsastajaPerLuokka,
      osallistumismuoto,
      saannot,
      omatHevosetLaji,
      ilmanTunnuksia ? 1 : 0,
      id
    )
    .run();
}

async function laskeKilpailutJaokselle(db, jaosId) {
  const rivi = await db.prepare('SELECT COUNT(*) AS n FROM kilpailut WHERE jaos = ?').bind(jaosId).first();
  return rivi.n;
}

async function listLajiLuokkavaihtoehdot(db, lajiId) {
  const { results } = await db
    .prepare('SELECT * FROM laji_luokkavaihtoehdot WHERE laji_id = ? ORDER BY jarjestys, id')
    .bind(lajiId)
    .all();
  return results;
}

// Kaikkien lajien luokkavaihtoehdot yhdellä kyselyllä, ryhmiteltynä laji_id:n mukaan -
// käytössä "Uusi kilpailu"/muokkauslomakkeella (ks. lib/kilpailu_lomake.js), joka tarvitsee
// jokaisen (myös villin) jaoksen luokkavalikoiman kerralla eikä yhtä kerrallaan.
async function listLajiLuokkavaihtoehdotKartta(db) {
  const { results } = await db
    .prepare('SELECT laji_id, nimi FROM laji_luokkavaihtoehdot ORDER BY laji_id, jarjestys, id')
    .all();
  const kartta = {};
  for (const rivi of results) {
    (kartta[rivi.laji_id] ||= []).push(rivi.nimi);
  }
  return kartta;
}

async function lisaaLajiLuokkavaihtoehto(db, lajiId, nimi) {
  const rivi = await db
    .prepare('SELECT COALESCE(MAX(jarjestys), -1) + 1 AS seuraava FROM laji_luokkavaihtoehdot WHERE laji_id = ?')
    .bind(lajiId)
    .first();
  await db
    .prepare('INSERT INTO laji_luokkavaihtoehdot (laji_id, nimi, jarjestys) VALUES (?, ?, ?)')
    .bind(lajiId, nimi, rivi.seuraava)
    .run();
}

async function getLajiLuokkavaihtoehto(db, id) {
  return db.prepare('SELECT * FROM laji_luokkavaihtoehdot WHERE id = ?').bind(id).first();
}

async function poistaLajiLuokkavaihtoehto(db, id) {
  await db.prepare('DELETE FROM laji_luokkavaihtoehdot WHERE id = ?').bind(id).run();
}

// Profiiliin tallennetut kilpailupaikat (ks. migrations/0010_kilpailupaikat.sql ja
// functions/kilpailut/kilpailupaikat/) - näytetään pudotusvalikkona uuden kilpailun
// lomakkeella (ks. lib/kilpailu_lomake.js:n kilpailupaikat-optio).
async function listKilpailupaikat(db) {
  const { results } = await db
    .prepare('SELECT * FROM kilpailupaikat ORDER BY talli_nimi')
    .all();
  return results;
}

async function getKilpailupaikka(db, id) {
  return db.prepare('SELECT * FROM kilpailupaikat WHERE id = ?').bind(id).first();
}

async function getOletusKilpailupaikka(db) {
  return db.prepare('SELECT * FROM kilpailupaikat WHERE oletus = 1').first();
}

// Ensimmäinen tallennettava kilpailupaikka merkitään aina oletukseksi (vaikka lomakkeen
// "oletus"-rasti ei olisi valittuna), jotta pudotusvalikossa on aina valmiiksi jokin valinta
// heti kun profiiliin on lisätty edes yksi kilpailupaikka.
async function createKilpailupaikka(db, p) {
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM kilpailupaikat').first();
  const oletus = p.oletus || n === 0;
  if (oletus) {
    await db.prepare('UPDATE kilpailupaikat SET oletus = 0 WHERE oletus = 1').run();
  }
  const tulos = await db
    .prepare(
      `INSERT INTO kilpailupaikat (talli_nimi, talli_url, tunnus, vastuuhenkilo_nimi, vastuuhenkilo_email, oletus)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(p.talliNimi, p.talliUrl, p.tunnus, p.vastuuhenkiloNimi, p.vastuuhenkiloEmail, oletus ? 1 : 0)
    .run();
  return tulos.meta.last_row_id;
}

async function updateKilpailupaikka(db, id, p) {
  if (p.oletus) {
    await db.prepare('UPDATE kilpailupaikat SET oletus = 0 WHERE oletus = 1 AND id != ?').bind(id).run();
  }
  await db
    .prepare(
      `UPDATE kilpailupaikat
       SET talli_nimi = ?, talli_url = ?, tunnus = ?, vastuuhenkilo_nimi = ?, vastuuhenkilo_email = ?, oletus = ?
       WHERE id = ?`
    )
    .bind(p.talliNimi, p.talliUrl, p.tunnus, p.vastuuhenkiloNimi, p.vastuuhenkiloEmail, p.oletus ? 1 : 0, id)
    .run();
}

// Vaihtaa oletuskilpailupaikan - vanha oletus (jos joku on) puretaan ensin erikseen, koska
// idx_kilpailupaikat_oletus sallii vain yhden oletus-rivin kerrallaan.
async function asetaOletusKilpailupaikka(db, id) {
  await db.prepare('UPDATE kilpailupaikat SET oletus = 0 WHERE oletus = 1').run();
  await db.prepare('UPDATE kilpailupaikat SET oletus = 1 WHERE id = ?').bind(id).run();
}

async function poistaKilpailupaikka(db, id) {
  await db.prepare('DELETE FROM kilpailupaikat WHERE id = ?').bind(id).run();
}

async function listLuokat(db, kilpailuId) {
  const { results } = await db
    .prepare('SELECT * FROM luokat WHERE kilpailu_id = ? ORDER BY jarjestys, id')
    .bind(kilpailuId)
    .all();
  return results;
}

async function createLuokka(db, kilpailuId, nimi, maxOsallistujia, jarjestys) {
  await db
    .prepare('INSERT INTO luokat (kilpailu_id, nimi, max_osallistujia, jarjestys) VALUES (?, ?, ?, ?)')
    .bind(kilpailuId, nimi, maxOsallistujia || null, jarjestys)
    .run();
}

async function getLuokka(db, id) {
  return db.prepare('SELECT * FROM luokat WHERE id = ?').bind(id).first();
}

// Adminin luokkahallinta kilpailun sivulta (ks. [id]/muokkaa-luokka.js, poista-luokka.js) -
// muokkaa/poistaa yhden luokan koskematta muihin tai niiden osallistujiin.
async function paivitaLuokka(db, id, nimi, maxOsallistujia) {
  await db
    .prepare('UPDATE luokat SET nimi = ?, max_osallistujia = ? WHERE id = ?')
    .bind(nimi, maxOsallistujia || null, id)
    .run();
}

async function poistaLuokka(db, id) {
  await db.prepare('DELETE FROM luokat WHERE id = ?').bind(id).run();
}

// Osallistujaraja on kilpailukohtainen ja sama kaikille luokille (ks. yllä createLuokka/
// lisaa-luokka.js) - kun järjestäjä muuttaa sitä kilpailun muokkaussivulta kilpailun ollessa
// jo 'avoinna' (jolloin luokkia ei enää luoda uudelleen tekstikentästä, ks. [id]/muokkaa.js),
// muutos pitää silti kohdistaa kaikkiin kilpailun jo olemassa oleviin luokkiin - muuten ne
// jäisivät hiljaa vanhaan rajaan.
async function paivitaLuokkienMaxOsallistujia(db, kilpailuId, maxOsallistujia) {
  await db
    .prepare('UPDATE luokat SET max_osallistujia = ? WHERE kilpailu_id = ?')
    .bind(maxOsallistujia || null, kilpailuId)
    .run();
}

async function listOsallistujat(db, luokkaId) {
  const { results } = await db
    .prepare('SELECT * FROM osallistujat WHERE luokka_id = ? ORDER BY ilmoittautunut_at')
    .bind(luokkaId)
    .all();
  return results;
}

async function getOsallistuja(db, id) {
  return db.prepare('SELECT * FROM osallistujat WHERE id = ?').bind(id).first();
}

async function laskeOsallistujat(db, luokkaId) {
  const rivi = await db
    .prepare('SELECT COUNT(*) AS n FROM osallistujat WHERE luokka_id = ?')
    .bind(luokkaId)
    .first();
  return rivi.n;
}

// Montako lähtöä (luokkaa) tällä hevosen VH-tunnuksella on jo tässä kilpailussa (missä
// tahansa luokassa) - VH-tunnus on luotettavampi tunniste kuin vapaa nimiteksti, koska
// sen kirjoitusasu ei vaihtele. Vertailu ei ole herkkä isoille/pienille kirjaimille tai
// ympäröivälle tyhjälle.
async function laskeHevosenLahdot(db, kilpailuId, vhTunnus) {
  const rivi = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM osallistujat o
       JOIN luokat l ON l.id = o.luokka_id
       WHERE l.kilpailu_id = ? AND LOWER(TRIM(o.vh_tunnus)) = LOWER(TRIM(?))`
    )
    .bind(kilpailuId, vhTunnus)
    .first();
  return rivi.n;
}

// Onko tämä hevonen (VH-tunnuksen perusteella) jo ilmoitettu tähän samaan luokkaan -
// sääntö "1 hevonen yhteen luokkaan kerran".
async function onkoHevonenLuokassa(db, luokkaId, vhTunnus) {
  const rivi = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM osallistujat
       WHERE luokka_id = ? AND LOWER(TRIM(vh_tunnus)) = LOWER(TRIM(?))`
    )
    .bind(luokkaId, vhTunnus)
    .first();
  return rivi.n > 0;
}

// Montako hevosta tällä ratsastajalla (VRL-tunnuksen perusteella) on jo tässä luokassa -
// sääntö "yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä" (ks.
// [id]/ilmoittaudu.js:n raja-arvon laskenta).
async function laskeRatsastajanHevoset(db, luokkaId, vrlTunnus) {
  const rivi = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM osallistujat
       WHERE luokka_id = ? AND LOWER(TRIM(vrl_tunnus)) = LOWER(TRIM(?))`
    )
    .bind(luokkaId, vrlTunnus)
    .first();
  return rivi.n;
}

async function lisaaOsallistuja(db, luokkaId, nimi, vrlTunnus, vhTunnus) {
  await db
    .prepare('INSERT INTO osallistujat (luokka_id, nimi, vrl_tunnus, vh_tunnus) VALUES (?, ?, ?, ?)')
    .bind(luokkaId, nimi, vrlTunnus, vhTunnus)
    .run();
}

// Adminin osallistujahallinta (ks. [id]/muokkaa-osallistuja.js, poista-osallistuja.js,
// lisaa-osallistuja.js) - ei sido samoihin muoto-/sääntövalidointeihin kuin julkinen
// ilmoittautuminen (ks. [id]/ilmoittaudu.js), koska admin korjaa/lisää tietoja käsin.
async function paivitaOsallistuja(db, id, { nimi, vrlTunnus, vhTunnus }) {
  await db
    .prepare('UPDATE osallistujat SET nimi = ?, vrl_tunnus = ?, vh_tunnus = ? WHERE id = ?')
    .bind(nimi, vrlTunnus || null, vhTunnus || null, id)
    .run();
}

async function poistaOsallistuja(db, id) {
  await db.prepare('DELETE FROM osallistujat WHERE id = ?').bind(id).run();
}

// Poistaa kilpailun kaikkien luokkien kaikki osallistujat kerralla (ks.
// functions/kilpailut/[id]/poista-osallistujat.js). Palauttaa poistettujen määrän.
async function poistaKilpailunOsallistujat(db, kilpailuId) {
  const tulos = await db
    .prepare('DELETE FROM osallistujat WHERE luokka_id IN (SELECT id FROM luokat WHERE kilpailu_id = ?)')
    .bind(kilpailuId)
    .run();
  return tulos.meta?.changes ?? 0;
}

// Kilpailut jotka ovat valmiita arvottavaksi: ilmoittautuminen on auki ("avoinna") ja
// joko VIP on umpeutunut TAI kaikki luokat (joilla on yläraja asetettu) ovat täynnä.
// Kilpailu, jonka yhdelläkin luokalla ei ole ylärajaa, ei voi "täyttyä" ennenaikaisesti -
// se odottaa VIP:iä, ks. ../README.md.
async function listArvontaaOdottavat(db) {
  const { results } = await db
    .prepare(
      `SELECT k.* FROM kilpailut k
       WHERE k.tila = 'avoinna'
         AND (
           -- VIP-päivä on vielä ilmoittautumispäivä: arvonta vasta VIP+1 vrk (00:00 UTC).
           datetime('now') >= datetime(k.vip_iso, '+1 day')
           OR (
             (SELECT COUNT(*) FROM luokat l WHERE l.kilpailu_id = k.id) > 0
             AND NOT EXISTS (
               SELECT 1 FROM luokat l
               WHERE l.kilpailu_id = k.id
                 AND (
                   l.max_osallistujia IS NULL
                   OR (SELECT COUNT(*) FROM osallistujat o WHERE o.luokka_id = l.id) < l.max_osallistujia
                 )
             )
           )
         )`
    )
    .all();
  return results;
}

async function tallennaTulokset(db, luokkaId, sijoitukset) {
  const stmt = db.prepare(
    'INSERT INTO tulokset (luokka_id, osallistuja_id, sija) VALUES (?, ?, ?)'
  );
  const batch = sijoitukset.map(({ osallistujaId, sija }) => stmt.bind(luokkaId, osallistujaId, sija));
  if (batch.length > 0) {
    await db.batch(batch);
  }
}

async function merkitseArvottu(db, kilpailuId) {
  await db
    .prepare("UPDATE kilpailut SET tila = 'arvottu', arvottu_at = datetime('now') WHERE id = ?")
    .bind(kilpailuId)
    .run();
}

async function merkitseTuloksetLahetetty(db, kilpailuId, { onnistui, viesti }) {
  await db
    .prepare(
      `UPDATE kilpailut
       SET tila = ?, vrl_viesti = ?, tulokset_lahetetty_at = datetime('now')
       WHERE id = ?`
    )
    .bind(onnistui ? 'tulokset_lahetetty' : 'tulokset_virhe', viesti, kilpailuId)
    .run();
}

async function listTulokset(db, luokkaId) {
  const { results } = await db
    .prepare(
      `SELECT t.sija, o.nimi FROM tulokset t
       JOIN osallistujat o ON o.id = t.osallistuja_id
       WHERE t.luokka_id = ?
       ORDER BY (t.sija IS NULL), t.sija`
    )
    .bind(luokkaId)
    .all();
  return results;
}

export {
  listTulokset,
  listKilpailut,
  getKilpailu,
  createKilpailu,
  updateKilpailu,
  seuraavaKutsuNumero,
  getKilpailuByKutsu,
  merkitseVrlLahetys,
  merkitseJulkaistuVillina,
  asetaVilliTila,
  asetaVrlKisaId,
  muutaVrlKisaIdKasin,
  listVaratutVrlKisaIdt,
  getKilpailuByVrlKisaId,
  merkitseVrlKisaIdYritetty,
  merkitseOmatHevosetLisatty,
  listLajit,
  getLaji,
  seuraavaLajiId,
  createLaji,
  poistaLaji,
  paivitaLajinSaannot,
  laskeKilpailutJaokselle,
  listLajiLuokkavaihtoehdot,
  listLajiLuokkavaihtoehdotKartta,
  lisaaLajiLuokkavaihtoehto,
  getLajiLuokkavaihtoehto,
  poistaLajiLuokkavaihtoehto,
  listKilpailupaikat,
  getKilpailupaikka,
  getOletusKilpailupaikka,
  createKilpailupaikka,
  updateKilpailupaikka,
  asetaOletusKilpailupaikka,
  poistaKilpailupaikka,
  listLuokat,
  getLuokka,
  createLuokka,
  paivitaLuokka,
  paivitaLuokkienMaxOsallistujia,
  poistaLuokka,
  poistaLuokat,
  poistaKilpailu,
  listOsallistujat,
  getOsallistuja,
  laskeOsallistujat,
  laskeHevosenLahdot,
  onkoHevonenLuokassa,
  laskeRatsastajanHevoset,
  lisaaOsallistuja,
  paivitaOsallistuja,
  poistaOsallistuja,
  poistaKilpailunOsallistujat,
  listArvontaaOdottavat,
  tallennaTulokset,
  merkitseArvottu,
  merkitseTuloksetLahetetty,
};

