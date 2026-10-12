-- Kilpailukohtainen yläraja osallistujille per luokka - sama kaikille kilpailun luokille,
-- koska osallistujamäärä ei saa vaihdella luokittain saman kilpailun sisällä. Oletusarvo
-- lomakkeella on jaoksen VRL-maksimi, ks. ../lib/jaosrajoitukset.js. 100 tässä on vain
-- turvaraja vanhoille riveille - käytännössä jokainen uusi kilpailu asettaa tämän eksplisiittisesti.
ALTER TABLE kilpailut ADD COLUMN max_osallistujia_per_luokka INTEGER NOT NULL DEFAULT 100;
