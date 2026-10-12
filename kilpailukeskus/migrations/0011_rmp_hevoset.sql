-- Rate My Pony (RMP, megasim.eu/rmp) -hevosten ensiarvostelun tulokset kilpailukeskuksen omaan
-- kantaan, jotta tulevaa lajikohtaisesti painotettua arvontaa varten pisteet ovat haettavissa
-- suoraan VH-tunnuksella sen sijaan että jokainen arvonta hakisi ne RMP:stä erikseen (ks.
-- ../README.md "RMP-taitopisteiden haku"). Hevosen muita RMP-tietoja (nimi, rotu, omistaja...)
-- ei tallenneta - vain arvonnassa tarvittava VH-tunnus ja pistetulokset.
--
-- Sarakkeet vastaavat RMP:n "tietoa-ensiarvostelusta"-sivun kohtia: neljä pääkohtaa (Rakenne,
-- Liikkeet, Luonne, Taidot), joista jokaiselle lasketaan RMP:ssä yleisarvosana (0-100) niiden
-- alakohtien perusteella, sekä kaksi erillistä arvostelutilaisuuden pistettä. Sanallista
-- arvosanaa (Heikko/Kohtalainen/Hyvä/Erinomainen) ei tallenneta erikseen, koska se on suoraan
-- pääteltävissä pisteestä (1-15/16-50/51-85/86-100).
CREATE TABLE IF NOT EXISTS rmp_hevoset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rmp_id INTEGER NOT NULL,             -- RMP:n hevonen-id, ks. megasim.eu/rmp/horse/{rmp_id}/
  -- esim. VH18-026-0075 - yhdistää RMP-hevosen kilpailijaan. EI uniikki: samalla
  -- VH-tunnuksella on RMP:ssä havaittu useampia erillisiä hevonen-postauksia (esim.
  -- korjattu virheellinen aiempi postaus), joten haku (ks. getRmpHevonenByVhTunnus)
  -- valitsee näistä tuoreimmin haetun.
  vh_tunnus TEXT NOT NULL,

  rakenne_yleisarvosana INTEGER,       -- Rakenne (0-100), alakohdat:
  rakenne_paa_kaula_etuosa INTEGER,
  rakenne_runko_takaosa INTEGER,
  rakenne_jalat_kaviot INTEGER,

  liikkeet_yleisarvosana INTEGER,      -- Liikkeet (0-100), alakohdat:
  liikkeet_kaynti INTEGER,
  liikkeet_ravi INTEGER,
  liikkeet_laukka INTEGER,

  luonne_yleisarvosana INTEGER,        -- Luonne (0-100), alakohdat:
  luonne_rohkeus INTEGER,
  luonne_kuuliaisuus INTEGER,
  luonne_temperamentti INTEGER,
  luonne_herkkyys INTEGER,
  luonne_alykkyys INTEGER,

  taidot_yleisarvosana INTEGER,        -- Taidot (0-100), alakohdat:
  taidot_nopeus INTEGER,
  taidot_kestavyys INTEGER,
  taidot_ketteryys INTEGER,
  taidot_hyppytekniikka INTEGER,
  taidot_kokoamiskyky INTEGER,
  taidot_voima INTEGER,

  ratsastettavuus_ajettavuus INTEGER,  -- pääkohdat 5 ja 6 (ei alakohtia)
  kaytos_tilaisuudessa INTEGER,

  haettu_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rmp_hevoset_rmp_id ON rmp_hevoset(rmp_id);
CREATE INDEX IF NOT EXISTS idx_rmp_hevoset_vh_tunnus ON rmp_hevoset(vh_tunnus);

-- Yhden rivin tila RMP:n hevoskokoelman (wp-json/wp/v2/horse) sivutetulle läpikäynnille -
-- rajapinnassa on n. 18000 hevosta ja n. 180 sivua (100/sivu), joten koko kokoelmaa ei haeta
-- yhdellä pyynnöllä (ks. functions/rmp/paivita.js): jokainen laukaisu jatkaa siitä sivusta
-- mihin edellinen jäi.
CREATE TABLE IF NOT EXISTS rmp_haku_tila (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seuraava_sivu INTEGER NOT NULL DEFAULT 1,
  sivuja_yhteensa INTEGER,
  viimeisin_viesti TEXT,               -- viimeisimmän laukaisun yhteenveto, ks. functions/rmp/paivita.js
  paivitetty_at TEXT
);
INSERT OR IGNORE INTO rmp_haku_tila (id, seuraava_sivu) VALUES (1, 1);
