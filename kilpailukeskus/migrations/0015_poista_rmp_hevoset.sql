-- RMP:n (Rate My Pony) ensiarvostelun tulokset haetaan nyt suoraan RMP:n rajapinnasta
-- VH-tunnuksella (ks. ../lib/rmp_client.js) eikä niitä enää kopioida omaan kantaan, joten
-- 0011_rmp_hevoset.sql:n taulut poistetaan.
DROP TABLE IF EXISTS rmp_hevoset;
DROP TABLE IF EXISTS rmp_haku_tila;
