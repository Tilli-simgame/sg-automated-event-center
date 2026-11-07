-- Kisarypäs: joukko saman lajin kilpailuja samoilla luokilla eri päivinä, luotu kerralla
-- "Uusi kilpailu" -lomakkeelta (ks. functions/kilpailut/uusi.js). Kilpailija voi ilmoittautua
-- yhdellä lomakkeella kaikkiin (tai valittuihin) ryppään kilpailuihin (ks.
-- functions/kilpailut/[id]/ilmoittaudu.js). Jokainen ryppään kilpailu on muuten tavallinen,
-- itsenäinen kilpailu (oma kutsu, VRL-lähetys, arvonta). NULL = ei kuulu ryppääseen.
CREATE TABLE IF NOT EXISTS kisaryppaat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  luotu_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE kilpailut ADD COLUMN rypas_id INTEGER REFERENCES kisaryppaat(id);

CREATE INDEX IF NOT EXISTS idx_kilpailut_rypas ON kilpailut(rypas_id);
