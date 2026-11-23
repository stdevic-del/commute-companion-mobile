import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { NewsDatabase } from '../src/db.ts';
import { PoliteFetcher } from '../src/fetcher.ts';
import { enrichMissingMetadata } from '../src/parsers/enrich.ts';
import { detectFeedFormat, parseFeed } from '../src/parsers/feedParser.ts';
import { parseHtmlArticle } from '../src/parsers/htmlParser.ts';
import type { SourceConfig } from '../src/types.ts';

const RTS_STYLE_RSS = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<!-- RTS RSS poslat sa Content-Type: text/html -->
<rss version="2.0">
  <channel>
    <title>RTS :: Vesti</title>
    <link>https://www.rts.rs/</link>
    <item>
      <title><![CDATA[Most Gazela prohodan posle radova]]></title>
      <link>/lat/vesti/drustvo/555123/gazela.html</link>
      <pubDate>Sat, 21 Nov 2026 18:30:00 +0100</pubDate>
      <description><![CDATA[<img src="/upload/storyBoxImageData/gazela.jpg" /> Saobraćaj se odvija bez zastoja.]]></description>
      <category>Društvo</category>
    </item>
    <item>
      <title>Druga vest sa enclosure slikom</title>
      <link>https://www.rts.rs/lat/vesti/ekonomija/555124/ekonomija.html</link>
      <pubDate>Sat, 21 Nov 2026 17:00:00 +0100</pubDate>
      <description>Kratak opis ekonomske vesti.</description>
      <enclosure url="https://www.rts.rs/img/eko.jpg" type="image/jpeg" length="12345" />
    </item>
  </channel>
</rss>`;

const MEDIA_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Portal Media</title>
    <item>
      <title>Vest sa više media:content slika</title>
      <link>https://portal.rs/vest-1</link>
      <dc:date>2026-11-21T18:00:00Z</dc:date>
      <description><![CDATA[<img src="https://portal.rs/pixel.gif" width="1" height="1" /><p>Uvodni pasus.</p>]]></description>
      <media:content url="https://portal.rs/small.jpg" medium="image" width="320" />
      <media:content url="https://portal.rs/large.jpg" medium="image" width="1200" />
      <category>Politika</category>
      <category>Srbija</category>
    </item>
    <item>
      <title>Google News stil</title>
      <link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Sat, 21 Nov 2026 19:00:00 GMT</pubDate>
      <description>Opis</description>
      <source url="https://www.danas.rs">Danas</source>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Verge</title>
  <entry>
    <title>Novi čip troši 30% manje energije</title>
    <link rel="self" href="https://www.theverge.com/api/entry/1" />
    <link rel="alternate" type="text/html" href="https://www.theverge.com/2026/11/21/new-chip" />
    <published>2026-11-21T19:15:00Z</published>
    <summary>Detalji o novom procesoru.</summary>
    <content type="html"><![CDATA[<p><img src="https://cdn.theverge.com/chip.webp" alt="chip"/>Tekst.</p>]]></content>
    <category term="tech" label="Tech" />
  </entry>
</feed>`;

const HTML_JSONLD_PAYWALL = `<!doctype html>
<html lang="sr">
<head>
  <title>Naslov taba | Portal</title>
  <link rel="canonical" href="https://portal.rs/ekskluzivno/analiza" />
  <meta property="og:title" content="OG naslov" />
  <meta property="og:image" content="/og-fallback.jpg" />
  <script type="application/ld+json">{ neispravan json }</script>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "name": "Portal" },
        {
          "@type": "NewsArticle",
          "headline": "Ekskluzivna analiza budžeta",
          "description": "Ključne stavke budžeta za narednu godinu.",
          "datePublished": "2026-11-21T18:45:00+01:00",
          "image": [{ "@type": "ImageObject", "url": "https://cdn.portal.rs/budzet.jpg" }],
          "isAccessibleForFree": false
        }
      ]
    }
  </script>
</head>
<body><article><p>Ceo tekst koji se nikad ne čuva.</p></article></body>
</html>`;

const HTML_OG_ONLY = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="Vest samo sa Open Graph tagovima" />
  <meta property="og:description" content="Kratak OG opis vesti." />
  <meta property="og:image" content="/images/og-slika.png" />
  <meta property="article:published_time" content="2026-11-21T16:00:00Z" />
  <meta property="og:url" content="https://example.rs/vest-og" />
</head>
<body></body>
</html>`;

describe('F2: Detekcija formata po sadržaju i RSS/Atom parser', () => {
  it('detektuje RSS/Atom/HTML po XML tagovima bez obzira na Content-Type', () => {
    assert.equal(detectFeedFormat(RTS_STYLE_RSS), 'rss');
    assert.equal(detectFeedFormat(ATOM_FEED), 'atom');
    assert.equal(detectFeedFormat(HTML_OG_ONLY), 'html');
    assert.equal(detectFeedFormat('plain text without tags'), 'unknown');
  });

  it('parsira RTS-stil RSS sa BOM-om, CDATA, relativnim linkovima, img u opisu i enclosure slikom', () => {
    const res = parseFeed(RTS_STYLE_RSS, 'https://www.rts.rs/lat/vesti/rss/9/vesti.html');
    assert.equal(res.format, 'rss');
    assert.equal(res.feedTitle, 'RTS :: Vesti');
    assert.equal(res.items.length, 2);

    assert.equal(res.items[0].title, 'Most Gazela prohodan posle radova');
    assert.equal(res.items[0].url, 'https://www.rts.rs/lat/vesti/drustvo/555123/gazela.html');
    assert.equal(
      res.items[0].imageUrl,
      'https://www.rts.rs/upload/storyBoxImageData/gazela.jpg'
    );
    assert.deepEqual(res.items[0].categories, ['Društvo']);

    assert.equal(res.items[1].imageUrl, 'https://www.rts.rs/img/eko.jpg');
  });

  it('bira najveću media:content sliku, preskače 1x1 tracking piksel i čita <source> tag', () => {
    const res = parseFeed(MEDIA_RSS, 'https://portal.rs/feed');
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].imageUrl, 'https://portal.rs/large.jpg');
    assert.equal(res.items[0].publishedAtRaw, '2026-11-21T18:00:00Z');
    assert.deepEqual(res.items[0].categories, ['Politika', 'Srbija']);

    assert.equal(res.items[1].sourceNameHint, 'Danas');
  });

  it('parsira Atom 1.0 feed (rel="alternate", published i img iz content-a)', () => {
    const res = parseFeed(ATOM_FEED, 'https://www.theverge.com/rss/index.xml');
    assert.equal(res.format, 'atom');
    assert.equal(res.feedTitle, 'The Verge');
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].url, 'https://www.theverge.com/2026/11/21/new-chip');
    assert.equal(res.items[0].imageUrl, 'https://cdn.theverge.com/chip.webp');
    assert.equal(res.items[0].publishedAtRaw, '2026-11-21T19:15:00Z');
    assert.deepEqual(res.items[0].categories, ['Tech']);
  });
});

describe('F2: HTML fallback parser (JSON-LD NewsArticle + Open Graph)', () => {
  it('izvlači Schema.org NewsArticle iz @graph, otporan je na loš JSON-LD i prepoznaje paywall', () => {
    const meta = parseHtmlArticle(HTML_JSONLD_PAYWALL, 'https://portal.rs/ekskluzivno/analiza?utm_source=x');
    assert.equal(meta.title, 'Ekskluzivna analiza budžeta');
    assert.equal(meta.description, 'Ključne stavke budžeta za narednu godinu.');
    assert.equal(meta.imageUrl, 'https://cdn.portal.rs/budzet.jpg');
    assert.equal(meta.publishedAtRaw, '2026-11-21T18:45:00+01:00');
    assert.equal(meta.canonicalUrl, 'https://portal.rs/ekskluzivno/analiza');
    assert.equal(meta.paywallHint, 'hard');
  });

  it('pada na Open Graph kada nema JSON-LD i razrešava relativnu og:image adresu', () => {
    const meta = parseHtmlArticle(HTML_OG_ONLY, 'https://example.rs/vest-og');
    assert.equal(meta.title, 'Vest samo sa Open Graph tagovima');
    assert.equal(meta.description, 'Kratak OG opis vesti.');
    assert.equal(meta.imageUrl, 'https://example.rs/images/og-slika.png');
    assert.equal(meta.publishedAtRaw, '2026-11-21T16:00:00Z');
    assert.equal(meta.canonicalUrl, 'https://example.rs/vest-og');
    assert.equal(meta.paywallHint, null);
  });

  it('ignoriše WordPress/Yoast JSON-LD #primaryimage @id fragment i pada na og:image', () => {
    const yoastHtml = `<!doctype html>
    <html><head>
      <meta property="og:image" content="https://bizlife.rs/wp-content/uploads/2026/11/fitch.jpg" />
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "NewsArticle",
              "headline": "Fitch potvrdio rejting",
              "image": { "@id": "https://bizlife.rs/fitch-rejting/#primaryimage" }
            }
          ]
        }
      </script>
    </head><body></body></html>`;
    const meta = parseHtmlArticle(yoastHtml, 'https://bizlife.rs/fitch-rejting/');
    assert.equal(meta.imageUrl, 'https://bizlife.rs/wp-content/uploads/2026/11/fitch.jpg');
  });

  it('parseFeed obrađuje direktnu HTML stranicu preko fallback parsera', () => {
    const res = parseFeed(HTML_OG_ONLY, 'https://example.rs/vest-og');
    assert.equal(res.format, 'html');
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].imageUrl, 'https://example.rs/images/og-slika.png');
  });
});

describe('F2: Pristojno HTML dopunjavanje (mock HTTP server)', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  const hitUrls: string[] = [];

  before(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const u = req.url || '/';
      hitUrls.push(u);
      if (u === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /blocked-article\nAllow: /\n');
        return;
      }
      if (u === '/article-1') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_JSONLD_PAYWALL);
        return;
      }
      if (u === '/article-2') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_OG_ONLY);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('dopunjava slike/paywall iz HTML-a, poštuje robots.txt, limit po izvoru i preskače signalne izvore', async () => {
    hitUrls.length = 0;
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 5 });

      const publisherSrc: SourceConfig = {
        id: 'mock-pub',
        name: 'Mock',
        domain: '127.0.0.1',
        feedUrl: `${baseUrl}/rss`,
        kind: 'rss',
        role: 'publisher',
        categoryHint: 'Društvo',
        weight: 8,
        baseIntervalMin: 10,
        maxIntervalMin: 60,
        paywall: 'none',
        maxItems: 10,
        enabled: true,
      };

      const items = [
        {
          title: 'Već ima sliku',
          url: `${baseUrl}/article-already-ok`,
          publishedAtRaw: '2026-11-21T18:00:00Z',
          descriptionRaw: 'Opis',
          imageUrl: 'https://cdn.example.com/ok.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        {
          title: 'Fali slika (JSON-LD)',
          url: `${baseUrl}/article-1`,
          publishedAtRaw: null,
          descriptionRaw: '',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        {
          title: 'Zabranjeno robots.txt',
          url: `${baseUrl}/blocked-article`,
          publishedAtRaw: null,
          descriptionRaw: '',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        {
          title: 'Preko limita',
          url: `${baseUrl}/article-2`,
          publishedAtRaw: null,
          descriptionRaw: '',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
      ];

      const stats = await enrichMissingMetadata(publisherSrc, items, fetcher, {
        maxFallbackPerSource: 2,
      });

      assert.equal(stats.attempted, 2);
      assert.equal(stats.enriched, 1);
      assert.equal(stats.skippedRobots, 1);
      assert.equal(items[1].imageUrl, 'https://cdn.portal.rs/budzet.jpg');
      assert.equal(items[1].paywallHint, 'hard');
      assert.equal(items[1].canonicalUrlHint, 'https://portal.rs/ekskluzivno/analiza');
      // article-2 nije ni pozvan zbog limita maxFallbackPerSource=2
      assert.equal(items[3].imageUrl, null);
      assert.ok(!hitUrls.includes('/blocked-article'));
      assert.ok(!hitUrls.includes('/article-2'));

      // Signalni izvor se nikad ne dopunjava
      const signalSrc: SourceConfig = { ...publisherSrc, id: 'gn-sig', role: 'signal' };
      const sigStats = await enrichMissingMetadata(signalSrc, [items[3]], fetcher, {
        maxFallbackPerSource: 5,
      });
      assert.equal(sigStats.attempted, 0);
    } finally {
      db.close();
    }
  });
});
