-- Järjestäjän itse luomat "villit" lajit (jaokset) - eivät ole VRL:n virallisia jaoksia
-- (ks. ../lib/jaokset.js:n kiinteä JAOKSET-lista, id:t 1-6) eikä niiden kilpailuja koskaan
-- lähetetä VRL:n kisakalenteriin (ks. functions/kilpailut/[id]/laheta-vrl.js). Id:t
-- annetaan juoksevasti alkaen 9900:sta (ks. lib/db.js:n seuraavaLajiId), jotta ne eivät voi
-- koskaan osua yhteen VRL:n omien jaos-id:iden kanssa.
CREATE TABLE IF NOT EXISTS lajit (
  id TEXT PRIMARY KEY,
  lyhenne TEXT NOT NULL UNIQUE,        -- käytetään kilpailukutsun URL-polussa, ks. functions/[jaos]/...
  nimi TEXT NOT NULL,
  luotu_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Valmiit luokkavaihtoehdot villille lajille "Uusi kilpailu" -lomakkeen luokkavalitsinta
-- varten - vastaa VRL-jaoksien kiinteää lib/luokkavaihtoehdot.js:ää, mutta tallennettuna
-- kantaan koska järjestäjä ylläpitää näitä itse (ks. functions/lajit/[id]/lisaa-luokka.js).
CREATE TABLE IF NOT EXISTS laji_luokkavaihtoehdot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laji_id TEXT NOT NULL REFERENCES lajit(id) ON DELETE CASCADE,
  nimi TEXT NOT NULL,
  jarjestys INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_laji_luokkavaihtoehdot_laji ON laji_luokkavaihtoehdot(laji_id);
