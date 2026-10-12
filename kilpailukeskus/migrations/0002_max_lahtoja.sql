-- Kilpailukohtainen yläraja sille, montako lähtöä (luokkaa) sama hevonen saa osallistua
-- saman kilpailun sisällä. Oletusarvo lomakkeella on jaoksen VRL-maksimi, ks.
-- ../lib/jaosrajoitukset.js. 100 tässä on vain turvaraja vanhoille riveille - käytännössä
-- jokainen uusi kilpailu asettaa tämän eksplisiittisesti.
ALTER TABLE kilpailut ADD COLUMN max_lahtoja_per_hevonen INTEGER NOT NULL DEFAULT 100;
