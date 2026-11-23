import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildArticleBriefingScript,
  buildContinuousBriefingFromArticle,
  fetchStaticNewsFeed,
  formatRelativeTimeSr,
  LIVE_SERVICES_CACHE_KEY,
  mapExportedItemToArticle,
  markArticlesAsListened,
  readCachedBriefingPackage,
  readCachedWeather,
  readListenedArticleMap,
  saveCachedBriefingPackage,
  sortArticlesForFeed,
  type StaticFeedPayload,
  type StorageLike,
} from '../../services/newsFeedClient.ts';
import { INGEST_ROOT } from '../src/config.ts';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('F9: Relativno vreme i AI/fallback tekst za „Pročitaj članak“', () => {
  it('formatira relativno vreme na srpskom jeziku', () => {
    const now = Date.parse('2026-11-21T20:00:00.000Z');
    assert.equal(formatRelativeTimeSr('2026-11-21T19:59:40.000Z', now), 'upravo sad');
    assert.equal(formatRelativeTimeSr('2026-11-21T19:45:00.000Z', now), 'pre 15 min');
    assert.equal(formatRelativeTimeSr('2026-11-21T17:00:00.000Z', now), 'pre 3 h');
    assert.equal(formatRelativeTimeSr('2026-11-20T18:00:00.000Z', now), 'juče');
    assert.equal(formatRelativeTimeSr('2026-11-18T18:00:00.000Z', now), 'pre 3 dana');
    assert.equal(formatRelativeTimeSr(null, now), '');
  });

  it('koristi aiBriefing kad postoji, a bezbedno pada na izvor + naslov + uvod kad je null', () => {
    const withAi = mapExportedItemToArticle(
      {
        id: 'clu_1',
        title: 'NBS zadržala kamatnu stopu',
        snippet: 'Kratak uvod.',
        url: 'https://rts.rs/nbs',
        imageUrl: 'https://wsrv.nl/?url=https%3A%2F%2Frts.rs%2Fnbs.jpg&w=640&output=webp&q=80&we',
        category: 'Biznis i Finansije',
        categorySlug: 'biznis-i-finansije',
        sourceId: 'rts',
        sourceName: 'RTS',
        paywall: 'none',
        publishedAt: '2026-11-21T19:00:00.000Z',
        updatedAt: '2026-11-21T19:30:00.000Z',
        mediaCount: 3,
        sources: [
          { id: 'rts', name: 'RTS', url: 'https://rts.rs/nbs', publishedAt: '2026-11-21T19:00:00.000Z' },
          { id: 'danas', name: 'Danas', url: 'https://danas.rs/nbs', publishedAt: '2026-11-21T19:30:00.000Z' },
        ],
        score: 4.2,
        aiBriefing:
          'Kako prenose RTS i Danas, Narodna banka Srbije zadržala je kamatnu stopu na 5,75 odsto. Rate kredita ostaju stabilne.',
        aiBriefingSources: ['RTS', 'Danas'],
      },
      0
    );

    assert.equal(buildArticleBriefingScript(withAi), withAi.aiBriefing);

    const withoutAi = mapExportedItemToArticle(
      {
        id: 'clu_2',
        title: 'Otvorena nova izložba u muzeju',
        snippet: 'Postavka obuhvata stotinu arhivskih fotografija Beograda.',
        url: 'https://danas.rs/muzej',
        imageUrl: null,
        category: 'Kultura',
        categorySlug: 'kultura',
        sourceId: 'danas',
        sourceName: 'Danas',
        paywall: 'hard',
        publishedAt: '2026-11-21T18:00:00.000Z',
        updatedAt: '2026-11-21T18:00:00.000Z',
        mediaCount: 1,
        sources: [
          { id: 'danas', name: 'Danas', url: 'https://danas.rs/muzej', publishedAt: '2026-11-21T18:00:00.000Z' },
        ],
        score: 1.5,
        aiBriefing: null,
        aiBriefingSources: [],
      },
      1
    );

    const fallbackScript = buildArticleBriefingScript(withoutAi);
    assert.ok(fallbackScript.includes('Danas'));
    assert.ok(fallbackScript.includes('Otvorena nova izložba u muzeju'));
    assert.ok(fallbackScript.includes('stotinu arhivskih fotografija'));
    assert.equal(withoutAi.paywall, 'hard');
    assert.equal(withoutAi.imageUrl, null);

    const continuous = buildContinuousBriefingFromArticle(withAi, [withAi, withoutAi], 5);
    assert.equal(continuous.count, 2);
    assert.ok(continuous.transcript.includes('Narodna banka Srbije'));
    assert.ok(continuous.transcript.includes('Sledeća vest iz kategorije Kultura'));
  });
});

describe('F9: Offline keš u newsFeedClient i provera uklanjanja CORS proxy-ja / fullText-a', () => {
  it('čuva uspešno učitani feed u localStorage i vraća ga kada mreža padne', async () => {
    const prevStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
    (globalThis as { localStorage?: StorageLike }).localStorage = createMemoryStorage();

    try {
      const samplePayload: StaticFeedPayload = {
        schemaVersion: 1,
        generatedAt: '2026-11-21T19:45:00.000Z',
        feedType: 'global',
        category: null,
        categorySlug: null,
        totalItems: 1,
        items: [
          {
            id: 'clu_offline_1',
            title: 'Most Gazela prohodan bez zastoja',
            snippet: 'Saobraćaj se odvija redovno u oba smera.',
            url: 'https://rts.rs/gazela',
            imageUrl: null,
            category: 'Društvo',
            categorySlug: 'drustvo',
            sourceId: 'rts',
            sourceName: 'RTS',
            paywall: 'none',
            publishedAt: '2026-11-21T19:30:00.000Z',
            updatedAt: '2026-11-21T19:30:00.000Z',
            mediaCount: 2,
            sources: [
              { id: 'rts', name: 'RTS', url: 'https://rts.rs/gazela', publishedAt: '2026-11-21T19:30:00.000Z' },
            ],
            score: 3.1,
            aiBriefing: null,
            aiBriefingSources: [],
          },
        ],
      };

      const onlineFetch = (async () =>
        new Response(JSON.stringify(samplePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch;

      const onlineRes = await fetchStaticNewsFeed({
        baseUrl: 'https://example.test/news-feed',
        fetchImpl: onlineFetch,
      });
      assert.ok(onlineRes);
      assert.equal(onlineRes.fromCache, false);
      assert.equal(onlineRes.isOfflineFallback, false);
      assert.equal(onlineRes.articles.length, 1);

      // Simuliraj nestanak mreže -> mora vratiti keširan feed sa isOfflineFallback=true
      const offlineFetch = (async () => {
        throw new Error('Network unreachable');
      }) as typeof fetch;

      const offlineRes = await fetchStaticNewsFeed({
        baseUrl: 'https://example.test/news-feed',
        fetchImpl: offlineFetch,
      });
      assert.ok(offlineRes);
      assert.equal(offlineRes.fromCache, true);
      assert.equal(offlineRes.isOfflineFallback, true);
      assert.equal(offlineRes.articles[0].id, 'clu_offline_1');
      assert.ok(offlineRes.lastSyncedAt.length > 0);
    } finally {
      (globalThis as { localStorage?: StorageLike }).localStorage = prevStorage;
    }
  });

  it('browserLiveEngine.ts nema javne CORS proxy pozive, a types.ts nema fullText polje (Sloj 1 & Sloj 5)', () => {
    const repoRoot = resolve(INGEST_ROOT, '..');
    const browserEngineSrc = readFileSync(resolve(repoRoot, 'services/browserLiveEngine.ts'), 'utf-8');
    const typesSrc = readFileSync(resolve(repoRoot, 'types.ts'), 'utf-8');

    assert.ok(!browserEngineSrc.includes('allorigins.win'));
    assert.ok(!browserEngineSrc.includes('corsproxy.io'));
    assert.ok(!browserEngineSrc.includes('codetabs.com'));
    assert.ok(!typesSrc.includes('fullText'));
  });

  it('Faza 4: VITE_DATA_API_URL vuče objedinjeni JSON (vesti + servisi + vreme) i pada na statički fallback ako centralni endpoint ne uspe', async () => {
    const memStorage = createMemoryStorage();
    const prevStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
    (globalThis as { localStorage?: StorageLike }).localStorage = memStorage;

    try {
      const unifiedBundle = {
        generatedAt: '2026-11-22T18:00:00.000Z',
        news: {
          generatedAt: '2026-11-22T18:00:00.000Z',
          items: [
            {
              id: 'clu_central_1',
              title: 'Novi most u Beogradu ulazi u završnu fazu radova',
              snippet: 'Radovi na saobraćajnici teku po planu.',
              url: 'https://rts.rs/beograd-most',
              imageUrl: null,
              category: 'Društvo',
              categorySlug: 'drustvo',
              sourceId: 'rts',
              sourceName: 'RTS',
              paywall: 'none' as const,
              publishedAt: '2026-11-22T17:45:00.000Z',
              updatedAt: '2026-11-22T18:00:00.000Z',
              mediaCount: 3,
              sources: [],
              score: 4.5,
              aiBriefing: null,
              aiBriefingSources: [],
            },
          ],
        },
        services: {
          verzija: 2,
          generisano: '2026-11-22T18:00:00.000Z',
          eds: [{ datum: '22.11.', opstina: 'Zvezdara', od: '09:00', do: '14:00', naselje: '', ulica: 'Koriška', brojevi: '1-10', ulicaCir: 'Коришка', izvor: 'Dan_0' }],
          direktni: [],
        },
        weather: {
          condition: 'Vedro i sunčano',
          tempC: 14,
          windKmh: 9,
          roadCondition: 'Suvi kolovozi',
        },
      };

      const centralRes = await fetchStaticNewsFeed({
        centralApiUrl: 'https://central-api.test/v1/bundle.json',
        baseUrl: 'https://static-fallback.test/news-feed',
        fetchImpl: (async (url: string | URL | Request) => {
          const urlStr = String(url);
          if (urlStr.includes('central-api.test')) {
            return new Response(JSON.stringify(unifiedBundle), { status: 200 });
          }
          return new Response('Not found', { status: 404 });
        }) as typeof fetch,
      });

      assert.ok(centralRes);
      assert.equal(centralRes.articles[0].id, 'clu_central_1');
      assert.ok(memStorage.getItem(LIVE_SERVICES_CACHE_KEY)?.includes('Koriška'));
      assert.equal(readCachedWeather()?.tempC, 14);

      // Kada centralni endpoint vrati grešku (500), automatski prelazi na statički fallback URL
      const fallbackRes = await fetchStaticNewsFeed({
        centralApiUrl: 'https://central-api.test/v1/bundle.json',
        baseUrl: 'https://static-fallback.test/news-feed',
        fetchImpl: (async (url: string | URL | Request) => {
          const urlStr = String(url);
          if (urlStr.includes('central-api.test')) {
            return new Response('Server error', { status: 500 });
          }
          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              generatedAt: '2026-11-22T18:05:00.000Z',
              feedType: 'global',
              category: null,
              categorySlug: null,
              totalItems: 1,
              items: unifiedBundle.news.items,
            }),
            { status: 200 }
          );
        }) as typeof fetch,
      });

      assert.ok(fallbackRes);
      assert.equal(fallbackRes.fromCache, false);
      assert.equal(fallbackRes.articles[0].id, 'clu_central_1');

      // Provera kompletnog tekstualnog paketa aktivnog brifinga u kešu
      saveCachedBriefingPackage({
        id: 'rep-test-1',
        timestamp: '18:00',
        routeTitle: 'Kuća → Posao',
        hostFormat: 'solo',
        transcript: 'Dobrodošli u vaš putni vodič za relaciju Kuća ka Posao.',
        chapters: [
          {
            id: 'ch-1',
            title: '1. Servisni radar',
            category: 'Servisne Informacije',
            text: 'Sve je prohodno.',
            startRatio: 0,
            endRatio: 1,
          },
        ],
        scrapedArticles: fallbackRes.articles,
        trafficNodes: [],
        serviceRadar: [],
        weather: {
          condition: 'Vedro',
          tempC: 14,
          windKmh: 9,
          roadCondition: 'Suvi kolovozi',
        },
        sources: [],
        audioData: 'base64-strip-me',
      });

      const cachedPkg = readCachedBriefingPackage();
      assert.ok(cachedPkg);
      assert.equal(cachedPkg.routeTitle, 'Kuća → Posao');
      assert.equal(cachedPkg.audioData, undefined);
      assert.equal(cachedPkg.chapters.length, 1);
      assert.equal(cachedPkg.weather.tempC, 14);
    } finally {
      (globalThis as { localStorage?: StorageLike }).localStorage = prevStorage;
    }
  });

  it('Najvažnije vs Najnovije + praćenje preslušanih vesti (automatsko brisanje starijih od 24h)', () => {
    const storage = createMemoryStorage();
    const nowMs = Date.parse('2026-11-22T02:00:00.000Z');
    const expiredMs = nowMs - 25 * 60 * 60 * 1000; // pre 25h (isteklo)
    const recentMs = nowMs - 3 * 60 * 60 * 1000; // pre 3h (aktivno)

    markArticlesAsListened('clu_expired_25h', expiredMs, storage);
    markArticlesAsListened('clu_listened_4m', recentMs, storage);

    const activeMap = readListenedArticleMap(nowMs, storage);
    assert.equal(activeMap['clu_expired_25h'], undefined, 'Unos stariji od 24h mora biti obrisan');
    assert.equal(activeMap['clu_listened_4m'], recentMs, 'Unos iz poslednja 24h ostaje aktivan');

    const single1h = mapExportedItemToArticle(
      {
        id: 'clu_single_1h',
        title: 'Noćna objava jednog portala',
        snippet: 'Kratka vest objavljena u 01:00.',
        url: 'https://danas.rs/nocna',
        imageUrl: null,
        category: 'Društvo',
        categorySlug: 'drustvo',
        sourceId: 'danas',
        sourceName: 'Danas',
        paywall: 'none',
        publishedAt: '2026-11-22T01:00:00.000Z',
        updatedAt: '2026-11-22T01:00:00.000Z',
        mediaCount: 1,
        sources: [{ id: 'danas', name: 'Danas', url: 'https://danas.rs/nocna', publishedAt: '2026-11-22T01:00:00.000Z' }],
        score: 1.73,
        aiBriefing: null,
        aiBriefingSources: [],
      },
      0,
      nowMs
    );

    const multi10hUnlistened = mapExportedItemToArticle(
      {
        id: 'clu_multi_10h',
        title: 'Glavna ekonomska vest dana u 3 medija',
        snippet: 'Glavna vest dana objavljena pre 10 sati.',
        url: 'https://rts.rs/ekonomija',
        imageUrl: null,
        category: 'Biznis i Finansije',
        categorySlug: 'biznis-i-finansije',
        sourceId: 'rts',
        sourceName: 'RTS',
        paywall: 'none',
        publishedAt: '2026-11-21T16:00:00.000Z',
        updatedAt: '2026-11-21T16:00:00.000Z',
        mediaCount: 3,
        sources: [
          { id: 'rts', name: 'RTS', url: 'https://rts.rs/ekonomija', publishedAt: '2026-11-21T16:00:00.000Z' },
          { id: 'n1', name: 'N1', url: 'https://n1.rs/ekonomija', publishedAt: '2026-11-21T16:00:00.000Z' },
          { id: 'danas', name: 'Danas', url: 'https://danas.rs/ekonomija', publishedAt: '2026-11-21T16:00:00.000Z' },
        ],
        score: 0.28,
        aiBriefing: null,
        aiBriefingSources: [],
      },
      1,
      nowMs
    );

    const multi8hListened = mapExportedItemToArticle(
      {
        id: 'clu_listened_4m',
        title: 'Već preslušana vest dana iz 4 medija',
        snippet: 'Vest koju je korisnik već čuo.',
        url: 'https://n1.rs/sednica',
        imageUrl: null,
        category: 'Politika',
        categorySlug: 'politika',
        sourceId: 'n1',
        sourceName: 'N1',
        paywall: 'none',
        publishedAt: '2026-11-21T18:00:00.000Z',
        updatedAt: '2026-11-21T18:00:00.000Z',
        mediaCount: 4,
        sources: [],
        score: 0.45,
        aiBriefing: null,
        aiBriefingSources: [],
      },
      2,
      nowMs
    );

    // 1. Tab "Najvažnije": nepreslušana sa 3 medija (10h) -> nepreslušana sa 1 medijem (1h) -> preslušana na dnu
    const importantOrder = sortArticlesForFeed(
      [single1h, multi8hListened, multi10hUnlistened],
      'important',
      activeMap,
      nowMs
    );
    assert.deepEqual(
      importantOrder.map((a) => a.id),
      ['clu_multi_10h', 'clu_single_1h', 'clu_listened_4m']
    );

    // 2. Tab "Najnovije": čisto hronološki od najnovije ka najstarijoj (1h -> 8h -> 10h)
    const latestOrder = sortArticlesForFeed(
      [multi10hUnlistened, multi8hListened, single1h],
      'latest',
      activeMap,
      nowMs
    );
    assert.deepEqual(
      latestOrder.map((a) => a.id),
      ['clu_single_1h', 'clu_listened_4m', 'clu_multi_10h']
    );
  });
});

