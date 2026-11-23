import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSnippet,
  canonicalizeUrl,
  cleanTitle,
  cyrillicToLatin,
  normalizeFeedItem,
  normalizeForComparison,
  normalizePublishedAt,
  normalizeSignalItem,
  sha1Hex,
} from '../src/normalize/index.ts';
import type { SourceConfig } from '../src/types.ts';

describe('F3: Ćirilica, latinica i ključ za poređenje (title_norm / title_hash)', () => {
  it('preslovljava srpsku ćirilicu uključujući digrafe lj, nj, dž i đ', () => {
    assert.equal(
      cyrillicToLatin('Ђорђе Љубојевић: Џепна књига у Чачку'),
      'Đorđe Ljubojević: Džepna knjiga u Čačku'
    );
  });

  it('daje identičan title_norm i title_hash za ćirilicu, punu latinicu i ošišanu latinicu', () => {
    const cyr = 'Ђорђе Љубојевић: Џепна књига у Чачку — нови рекорд!';
    const lat = 'Đorđe Ljubojević: Džepna knjiga u Čačku - novi rekord';
    const ascii = 'Djordje Ljubojevic: Dzepna knjiga u Cacku, novi rekord?';

    const n1 = normalizeForComparison(cyr);
    const n2 = normalizeForComparison(lat);
    const n3 = normalizeForComparison(ascii);

    assert.equal(n1, 'djordje ljubojevic dzepna knjiga u cacku novi rekord');
    assert.equal(n1, n2);
    assert.equal(n2, n3);
    assert.equal(sha1Hex(n1), sha1Hex(n2));
    assert.equal(sha1Hex(n2), sha1Hex(n3));
  });

  it('za prikaz čuva originalno pismo, ali skida HTML, dvostruke entitete i sufikse portala', () => {
    assert.equal(
      cleanTitle('<b>Професорка &amp;quot;Крстић&amp;quot;</b>: Важна одлука - РТС', 'RTS'),
      'Професорка "Крстић": Важна одлука'
    );
    assert.equal(cleanTitle('Novi budžet za 2027. godinu | Danas', 'Danas'), 'Novi budžet za 2027. godinu');
    assert.equal(cleanTitle('Skupština usvojila zakon – Nova.rs', 'Nova.rs'), 'Skupština usvojila zakon');
    // Ne sme da iseče legitimnu crticu u naslovu koja nije sufiks portala
    assert.equal(
      cleanTitle('Auto-put Beograd - Niš dobio novu deonicu', 'RTS'),
      'Auto-put Beograd - Niš dobio novu deonicu'
    );
  });
});

describe('F3: Uvod (snippet 1–2 rečenice, <= 280 znakova)', () => {
  it('skida HTML, WordPress šablon, duplikat naslova i poštuje srpske skraćenice', () => {
    const raw =
      '<p>Nova mera NBS stupa na snagu. Prof. dr. Petrović kaže da od 21. novembra važe nova pravila za kredite. Banke su već spremile izmene. Treća rečenica ne bi trebalo da uđe ako prelazi limit ili broj rečenica. The post Nova mera NBS appeared first on Danas.</p>';
    const snippet = buildSnippet(raw, 'Nova mera NBS stupa na snagu', 280);

    assert.ok(!snippet.includes('The post'));
    assert.ok(!snippet.startsWith('Nova mera NBS stupa na snagu'));
    assert.ok(snippet.includes('Prof. dr. Petrović'));
    assert.ok(snippet.includes('21. novembra'));
    assert.ok(snippet.includes('Banke su već spremile izmene.'));
    assert.ok(!snippet.includes('Treća rečenica'));
    assert.ok(snippet.length <= 280);
  });

  it('skraćuje predugačak opis na granici reči do najviše 280 znakova', () => {
    const longText = 'Ovo je veoma dugačka rečenica koja opisuje događaj u detalje '.repeat(10);
    const snippet = buildSnippet(longText, 'Kratak naslov', 280);
    assert.ok(snippet.length <= 280);
    assert.ok(snippet.endsWith('…'));
  });
});

describe('F3: Kanonski URL', () => {
  it('uklanja utm_*, fbclid, gclid, fragment, završnu kosu crtu i sortira ostale parametre', () => {
    const url =
      'HTTPS://WWW.Danas.rs:443/vesti/ekonomija/kurs-evra/?utm_source=fb&fbclid=xyz&b=2&a=1&gclid=123#comments';
    assert.equal(
      canonicalizeUrl(url),
      'https://www.danas.rs/vesti/ekonomija/kurs-evra?a=1&b=2'
    );
  });

  it('daje prednost validnom canonicalHint-u, ali odbacuje prazan homepage canonical', () => {
    assert.equal(
      canonicalizeUrl(
        'https://portal.rs/vest?ref=rss&utm_medium=feed',
        'https://portal.rs/ekonomija/tacan-slug/'
      ),
      'https://portal.rs/ekonomija/tacan-slug'
    );

    assert.equal(
      canonicalizeUrl(
        'https://portal.rs/ekonomija/konkretna-vest?utm_source=x',
        'https://portal.rs/'
      ),
      'https://portal.rs/ekonomija/konkretna-vest'
    );
  });
});

describe('F3: Normalizacija datuma u UTC', () => {
  const now = new Date('2026-11-21T20:00:00.000Z');

  it('pretvara RFC 2822, ISO sa zonom i srpski datum u UTC ISO', () => {
    assert.equal(
      normalizePublishedAt('Sat, 21 Nov 2026 18:30:00 +0100', now),
      '2026-11-21T17:30:00.000Z'
    );
    assert.equal(
      normalizePublishedAt('2026-11-21T19:15:00+02:00', now),
      '2026-11-21T17:15:00.000Z'
    );
    assert.equal(
      normalizePublishedAt('21.11.2026. 18:30', now),
      '2026-11-21T17:30:00.000Z'
    );
  });

  it('vraća firstSeenAt za neispravne, buduće i prestare datume', () => {
    assert.equal(normalizePublishedAt('neispravan datum', now), now.toISOString());
    assert.equal(normalizePublishedAt('2026-11-22T12:00:00Z', now), now.toISOString());
    assert.equal(normalizePublishedAt('2020-01-01T00:00:00Z', now), now.toISOString());
    assert.equal(normalizePublishedAt(null, now), now.toISOString());
  });
});

describe('F3: End-to-end normalizeFeedItem i normalizeSignalItem', () => {
  const src: SourceConfig = {
    id: 'rts',
    name: 'RTS',
    domain: 'rts.rs',
    feedUrl: 'https://www.rts.rs/lat/vesti/rss/9/vesti.html',
    kind: 'rss',
    role: 'publisher',
    categoryHint: 'Društvo',
    weight: 9,
    baseIntervalMin: 10,
    maxIntervalMin: 60,
    paywall: 'none',
    maxItems: 20,
    enabled: true,
  };

  it('proizvodi kompletan normalizovani zapis članka i signala', () => {
    const now = new Date('2026-11-21T20:00:00.000Z');
    const article = normalizeFeedItem(
      {
        title: '  Мост Газела проходан - РТС  ',
        url: 'https://www.rts.rs/vesti/gazela.html?utm_source=rss&fbclid=1',
        publishedAtRaw: 'Sat, 21 Nov 2026 19:00:00 +0100',
        descriptionRaw: '<p>Саобраћај на Газели одвија се нормално.</p>',
        imageUrl: 'https://www.rts.rs/img/gazela.jpg',
        categories: ['Društvo'],
        sourceNameHint: null,
        paywallHint: null,
        canonicalUrlHint: null,
      },
      src,
      now
    );

    assert.ok(article);
    assert.equal(article.title, 'Мост Газела проходан');
    assert.equal(article.title_norm, 'most gazela prohodan');
    assert.equal(article.canonical_url, 'https://www.rts.rs/vesti/gazela.html');
    assert.equal(article.published_at, '2026-11-21T18:00:00.000Z');
    assert.equal(article.snippet, 'Саобраћај на Газели одвија се нормално.');
    assert.equal(article.id, sha1Hex('https://www.rts.rs/vesti/gazela.html'));

    const sig = normalizeSignalItem(
      {
        title: 'Most Gazela prohodan - Danas',
        url: 'https://news.google.com/rss/articles/xyz',
        publishedAtRaw: 'Sat, 21 Nov 2026 19:05:00 +0100',
        descriptionRaw: '',
        imageUrl: null,
        categories: [],
        sourceNameHint: 'Danas',
        paywallHint: null,
        canonicalUrlHint: null,
      },
      { ...src, id: 'gn-top', role: 'signal' },
      1,
      now
    );

    assert.ok(sig);
    assert.equal(sig.title, 'Most Gazela prohodan');
    assert.equal(sig.title_norm, article.title_norm);
  });
});
