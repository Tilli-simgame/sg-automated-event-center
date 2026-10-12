-- Oak Hill Event Park (OAKH4632) -- Virtuaalinen Kilpailukeskus
-- Perusskeema: kilpailut, niiden luokat, luokkien osallistujat ja arvotut tulokset.

CREATE TABLE IF NOT EXISTS kilpailut (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nimi TEXT NOT NULL,
  jaos TEXT NOT NULL,                 -- jaoksen id, ks. lib/jaokset.js
  kp TEXT NOT NULL,                   -- kilpailupäivä PP.KK.VVVV (VRL-lomakkeen muoto)
  vip TEXT NOT NULL,                  -- viimeinen ilmoittautumispäivä PP.KK.VVVV
  vip_iso TEXT NOT NULL,              -- sama päivä VVVV-KK-PP -muodossa, jotta cron voi verrata datetime('now')-arvoon
  arvontatapa TEXT NOT NULL,
  jarj_talli TEXT NOT NULL,
  kutsu_url TEXT NOT NULL,
  info TEXT,
  takaaja TEXT,
  -- tila: luonnos -> lahetetaan_vrl -> avoinna (ilmoittautuminen auki)
  --       -> arvottu -> tulokset_lahetetty
  -- virhetilat: vrl_virhe, tulokset_virhe (jää odottamaan käsittelyä / uudelleenyritystä)
  tila TEXT NOT NULL DEFAULT 'luonnos',
  vrl_kisa_id TEXT,                   -- kilpailun id VRL:n puolella, saadaan/syötetään tulosten lähetystä varten
  vrl_viesti TEXT,                    -- viimeisin VRL:ltä saatu viesti (onnistui tai virhe)
  luotu_at TEXT NOT NULL DEFAULT (datetime('now')),
  lahetetty_vrl_at TEXT,
  arvottu_at TEXT,
  tulokset_lahetetty_at TEXT
);

CREATE TABLE IF NOT EXISTS luokat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kilpailu_id INTEGER NOT NULL REFERENCES kilpailut(id) ON DELETE CASCADE,
  nimi TEXT NOT NULL,                 -- yli 5 merkkiä, VRL:n tulosrajapinnan vaatimus
  max_osallistujia INTEGER,           -- NULL = ei ylärajaa (luokka ei voi "täyttyä" itsestään)
  jarjestys INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS osallistujat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  luokka_id INTEGER NOT NULL REFERENCES luokat(id) ON DELETE CASCADE,
  nimi TEXT NOT NULL,                 -- esim. hevonen/ratsastaja-yhdistelmä
  lisatiedot TEXT,
  ilmoittautunut_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tulokset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  luokka_id INTEGER NOT NULL REFERENCES luokat(id) ON DELETE CASCADE,
  osallistuja_id INTEGER NOT NULL REFERENCES osallistujat(id) ON DELETE CASCADE,
  sija INTEGER,                       -- NULL = hylätty
  luotu_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_luokat_kilpailu ON luokat(kilpailu_id);
CREATE INDEX IF NOT EXISTS idx_osallistujat_luokka ON osallistujat(luokka_id);
CREATE INDEX IF NOT EXISTS idx_tulokset_luokka ON tulokset(luokka_id);
CREATE INDEX IF NOT EXISTS idx_kilpailut_tila ON kilpailut(tila);
