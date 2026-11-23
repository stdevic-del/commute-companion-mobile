import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { extractCleanArticleTextInRam } from '../src/briefing/extractor.ts';
import {
  BRIEFING_SYSTEM_PROMPT,
  BriefingGenerator,
  cleanTtsBriefingText,
  LlmRateLimitError,
  type BriefingLlmClient,
  type BriefingSourceExcerpt,
} from '../src/briefing/synthesizer.ts';
import { StoryClusterer } from '../src/cluster/clusterer.ts';
import { NewsDatabase } from '../src/db.ts';
import { ArticleDeduplicator } from '../src/dedup/deduplicator.ts';
import { PoliteFetcher } from '../src/fetcher.ts';
import { normalizeFeedItem } from '../src/normalize/index.ts';
import { rankActiveClusters } from '../src/rank/ranker.ts';
import type { PaywallType, SourceConfig } from '../src/types.ts';

const UNIQUE_BODY_SENTINEL = 'TAJNI_ORIGINALI_PASUS_KOJI_NIKADA_NE_SME_U_BAZU_99182';

function makeArticleHtml(title: string, bodyText: string): string {
  return `<!doctype html>
<html lang="sr">
<head><title>${title}</title></head>
<body>
  <header><nav>Početna | Vesti | Sport | Kontakt | Reklama</nav></header>
  <main>
    <article>
      <h1>${title}</h1>
      <p>${bodyText}</p>
      <p>Dodatni kontekst iz redakcije opisuje uticaj odluke na građane i privredu u narednim mesecima, uz ocene stručnjaka da se stabilizacija očekuje tokom sledećeg kvartala.</p>
      <p>Nadležne institucije najavile su redovno praćenje situacije i novo obraćanje javnosti naredne sedmice.</p>
    </article>
  </main>
  <footer>Sva prava zadržana · Kolačići · Marketing</footer>
</body>
</html>`;
}

describe('F7: Readability RAM-only ekstrakcija i TTS čišćenje', () => {
  it('izvlači čist tekst članka bez navigacije i futera i čisti eventualni Markdown', () => {
    const html = makeArticleHtml(
      'NBS zadržala kamatnu stopu',
      'Izvršni odbor Narodne banke Srbije odlučio je danas da zadrži referentnu kamatnu stopu na nivou od 5,75 odsto.'
    );
    const text = extractCleanArticleTextInRam(html);
    assert.ok(text, 'Readability mora izvući tekst članka');
    assert.ok(text.includes('5,75 odsto'));
    assert.ok(!text.includes('Sva prava zadržana'));

    assert.equal(
      cleanTtsBriefingText('**Kako prenose RTS i Danas**, NBS je zadržala stopu.\n- Inflacija usporava.'),
      'Kako prenose RTS i Danas, NBS je zadržala stopu. Inflacija usporava.'
    );
  });
});

describe('F7: AI audio brifing — mock HTTP server + mock Gemini API', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  const fetchedPaths: string[] = [];

  before(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const u = req.url || '/';
      fetchedPaths.push(u);

      if (u === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /blocked\nAllow: /\n');
        return;
      }

      if (u.startsWith('/art/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          makeArticleHtml(
            `Vest ${u}`,
            `Detaljan izveštaj redakcije za ${u}. ${UNIQUE_BODY_SENTINEL} Ovo je pun novinski tekst sa činjenicama i brojkama koji služi samo za sintezu u RAM memoriji.`
          )
        );
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

  function makeSource(id: string, name: string, weight: number, paywall: PaywallType = 'none'): SourceConfig {
    return {
      id,
      name,
      domain: '127.0.0.1',
      feedUrl: `${baseUrl}/feed/${id}`,
      kind: 'rss',
      role: 'publisher',
      categoryHint: 'Društvo',
      weight,
      baseIntervalMin: 10,
      maxIntervalMin: 60,
      paywall,
      maxItems: 20,
      enabled: true,
    };
  }

  it('koristi tačan sistemski prompt, preskače hard paywall i robots.txt, čuva SAMO ai_briefing_text (nikad pun tekst) i ne regeneriše postojeći brifing', async () => {
    fetchedPaths.length = 0;
    const db = new NewsDatabase(':memory:');
    try {
      const rts = makeSource('rts', 'RTS', 9, 'none');
      const danas = makeSource('danas', 'Danas', 8, 'none');
      const paid = makeSource('paid', 'PaidPortal', 10, 'hard');
      db.migrate();
      db.syncSources([rts, danas, paid]);

      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const clusterArticles = [
        {
          src: rts,
          title: 'Narodna banka Srbije zadržala referentnu kamatnu stopu na 5,75 odsto',
          url: `${baseUrl}/art/rts-nbs`,
          desc: 'Izvršni odbor NBS zadržao je stopu.',
        },
        {
          src: danas,
          title: 'Šta odluka NBS o kamatnoj stopi od 5,75 odsto znači za kredite građana',
          url: `${baseUrl}/art/danas-nbs`,
          desc: 'Ekonomisti analiziraju odluku Narodne banke Srbije o kamatnoj stopi.',
        },
        {
          src: paid,
          title: 'Ekskluzivna analiza odluke NBS o kamatnoj stopi od 5,75 odsto',
          url: `${baseUrl}/art/paid-nbs`,
          desc: 'Detaljna analiza Narodne banke Srbije za pretplatnike.',
        },
      ];

      for (const a of clusterArticles) {
        const norm = normalizeFeedItem(
          {
            title: a.title,
            url: a.url,
            publishedAtRaw: '2026-11-21T19:00:00Z',
            descriptionRaw: a.desc,
            imageUrl: 'https://img.example/x.jpg',
            categories: [],
            sourceNameHint: null,
            paywallHint: null,
            canonicalUrlHint: null,
          },
          a.src,
          now
        )!;
        dedup.processOne(norm, a.src.weight, now);
      }

      clusterer.run(now);
      const { globalRanked } = rankActiveClusters(db, now);
      assert.equal(globalRanked.length, 1);

      const capturedCalls: Array<{ systemInstruction: string; excerpts: BriefingSourceExcerpt[] }> = [];
      const mockLlm: BriefingLlmClient = {
        model: 'mock-gemini-flash',
        async generate(params) {
          capturedCalls.push({
            systemInstruction: params.systemInstruction,
            excerpts: params.excerpts,
          });
          return 'Kako prenose RTS i Danas, Narodna banka Srbije zadržala je referentnu kamatnu stopu na 5,75 odsto. Odluka je doneta zbog postepenog usporavanja inflacije. Ekonomisti ocenjuju da rate kredita ostaju stabilne u narednom kvartalu.';
        },
      };

      const warnings: string[] = [];
      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 5 });
      const generator = new BriefingGenerator(db, fetcher, mockLlm, {
        topClusters: 20,
        maxNewBriefingsPerRun: 5,
        logger: { warn: (m: string) => warnings.push(m) },
      });

      const stats1 = await generator.generateForRankedClusters(globalRanked, now);
      assert.equal(stats1.generated, 1);
      assert.equal(stats1.failed, 0);
      assert.equal(capturedCalls.length, 1);

      // 1. Tačan sistemski prompt
      assert.equal(capturedCalls[0].systemInstruction, BRIEFING_SYSTEM_PROMPT);
      // 2. Hard paywall izvor nije preuzet ni poslat LLM-u
      assert.deepEqual(
        capturedCalls[0].excerpts.map((e) => e.sourceName).sort(),
        ['Danas', 'RTS']
      );
      assert.ok(!fetchedPaths.includes('/art/paid-nbs'), 'Hard paywall URL ne sme biti preuzet');

      // 3. U bazi je sačuvan SAMO generisani ai_briefing_text — nigde nema originalnog teksta!
      const storedCluster = db.getActiveClusters(48, now)[0];
      assert.ok(storedCluster.ai_briefing_text?.includes('Kako prenose RTS i Danas'));

      const allDbText = [
        JSON.stringify(db.db.prepare('SELECT * FROM articles').all()),
        JSON.stringify(db.db.prepare('SELECT * FROM clusters').all()),
        JSON.stringify(warnings),
      ].join('\n');
      assert.ok(
        !allDbText.includes(UNIQUE_BODY_SENTINEL),
        'Originalni tekst članka NIKADA ne sme završiti u SQLite bazi ili logovima'
      );

      // 4. Ponovno pokretanje NE regeneriše već generisani brifing
      const { globalRanked: ranked2 } = rankActiveClusters(db, now);
      const stats2 = await generator.generateForRankedClusters(ranked2, now);
      assert.equal(stats2.generated, 0);
      assert.equal(stats2.alreadyBriefed, 1);
      assert.equal(capturedCalls.length, 1, 'LLM ne sme biti pozvan ponovo za isti klaster');
    } finally {
      db.close();
    }
  });

  it('poštuje limit od najviše 5 novih brifinga po ciklusu', async () => {
    const db = new NewsDatabase(':memory:');
    try {
      const rts = makeSource('rts', 'RTS', 9);
      db.migrate();
      db.syncSources([rts]);

      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const topics = [
        'Skupština usvojila godišnji budžet za obrazovanje',
        'Đoković pobedio u polufinalu teniskog turnira u Parizu',
        'RHMZ izdao upozorenje na jak olujni vetar i kišu',
        'Otvorena izložba savremene skulpture u Narodnom muzeju',
        'Novi startap fond ulaže u domaće softverske kompanije',
        'Policija zaplenila veću količinu robe na graničnom prelazu',
        'Hrvatska i Slovenija potpisale sporazum o železnici',
        'Samit u Briselu o novim energetskim koridorima u Evropi',
      ];

      for (let i = 0; i < topics.length; i += 1) {
        const norm = normalizeFeedItem(
          {
            title: topics[i],
            url: `${baseUrl}/art/topic-${i}`,
            publishedAtRaw: `2026-11-21T19:${String(10 + i).padStart(2, '0')}:00Z`,
            descriptionRaw: `Kratak opis teme broj ${i}.`,
            imageUrl: 'https://img.example/x.jpg',
            categories: [],
            sourceNameHint: null,
            paywallHint: null,
            canonicalUrlHint: null,
          },
          rts,
          now
        )!;
        dedup.processOne(norm, rts.weight, now);
      }

      clusterer.run(now);
      const { globalRanked } = rankActiveClusters(db, now);
      assert.equal(globalRanked.length, 8);

      let llmCalls = 0;
      const mockLlm: BriefingLlmClient = {
        model: 'mock-gemini-flash',
        async generate({ clusterTitle }) {
          llmCalls += 1;
          return `Prema pisanju RTS-a, ${clusterTitle}. Nadležni su potvrdili sve ključne detalje. Više informacija očekuje se tokom dana.`;
        },
      };

      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 1 });
      const generator = new BriefingGenerator(db, fetcher, mockLlm, {
        topClusters: 20,
        maxNewBriefingsPerRun: 5,
      });

      const stats = await generator.generateForRankedClusters(globalRanked, now);
      assert.equal(stats.generated, 5, 'Mora generisati tačno do limita od 5 po ciklusu');
      assert.equal(llmCalls, 5);

      const remainingNull = db
        .getActiveClusters(48, now)
        .filter((c) => c.ai_briefing_text === null);
      assert.equal(remainingNull.length, 3);
    } finally {
      db.close();
    }
  });

  it('radi graceful fallback bez pucanja kad fali GEMINI_API_KEY ili kad API vrati 429', async () => {
    fetchedPaths.length = 0;
    const db = new NewsDatabase(':memory:');
    try {
      const rts = makeSource('rts', 'RTS', 9);
      db.migrate();
      db.syncSources([rts]);

      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      for (let i = 0; i < 2; i += 1) {
        const norm = normalizeFeedItem(
          {
            title: i === 0 ? 'Veliki infrastrukturni projekat u Beogradu' : 'Novi koncert filharmonije na Kolarcu',
            url: `${baseUrl}/art/fallback-${i}`,
            publishedAtRaw: '2026-11-21T19:00:00Z',
            descriptionRaw: 'Kratak uvod.',
            imageUrl: null,
            categories: [],
            sourceNameHint: null,
            paywallHint: null,
            canonicalUrlHint: null,
          },
          rts,
          now
        )!;
        dedup.processOne(norm, rts.weight, now);
      }

      clusterer.run(now);
      const { globalRanked } = rankActiveClusters(db, now);
      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 1 });

      // 1. Nema API ključa (null client) -> upozorenje, 0 HTTP zahteva, ne puca
      const warnings1: string[] = [];
      const noKeyGen = new BriefingGenerator(db, fetcher, null, {
        logger: { warn: (m: string) => warnings1.push(m) },
      });
      const statsNoKey = await noKeyGen.generateForRankedClusters(globalRanked, now);
      assert.equal(statsNoKey.skippedNoApiKey, true);
      assert.equal(statsNoKey.generated, 0);
      assert.equal(warnings1.length, 1);
      assert.equal(fetchedPaths.length, 0);

      // 2. API vraća 429 -> hvata grešku, prekida petlju za ostatak ciklusa, ai_briefing_text ostaje null
      let callsOn429 = 0;
      const rateLimitedLlm: BriefingLlmClient = {
        model: 'mock-gemini-flash',
        async generate() {
          callsOn429 += 1;
          throw new LlmRateLimitError('429 RESOURCE_EXHAUSTED');
        },
      };
      const warnings2: string[] = [];
      const gen429 = new BriefingGenerator(db, fetcher, rateLimitedLlm, {
        logger: { warn: (m: string) => warnings2.push(m) },
      });
      const stats429 = await gen429.generateForRankedClusters(globalRanked, now);
      assert.equal(stats429.hitRateLimit, true);
      assert.equal(stats429.failed, 1);
      assert.equal(callsOn429, 1, 'Posle 429 prekida dalje pozive u istom ciklusu');
      assert.ok(db.getActiveClusters(48, now).every((c) => c.ai_briefing_text === null));
    } finally {
      db.close();
    }
  });
});
