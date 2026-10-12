-- Omien hevosten automaattilisäys (ks. lib/omat_hevoset.js): kun kilpailulle löytyy
-- VRL-kisa-id (ks. lib/vrl_kisa_id_haku.js), haetaan järjestäjän omat hevoset ulkoisesta
-- rajapinnasta kilpailun jaosta vastaavalla lajilla ja lisätään ne automaattisesti niiden
-- lajitasoa vastaaviin luokkiin. omat_hevoset_lisatty_at estää haun toistamisen joka
-- sivulatauksella (haku tehdään vain kerran per kilpailu, samaan tapaan kuin
-- vrl_kisa_id_yritetty_at) - järjestäjä voi silti laukaista haun uudelleen käsin kilpailun
-- sivulta. omat_hevoset_virheet (JSON-taulukko merkkijonoja) tallentaa hevoset joita ei
-- voitu lisätä (esim. lajitasoa vastaavaa luokkaa ei löytynyt) - näytetään vain
-- admin-hallintasivulla, ei julkisella kutsusivulla.
ALTER TABLE kilpailut ADD COLUMN omat_hevoset_lisatty_at TEXT;
ALTER TABLE kilpailut ADD COLUMN omat_hevoset_virheet TEXT;
