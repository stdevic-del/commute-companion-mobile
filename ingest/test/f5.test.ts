import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyNewsCategory } from '../../shared/categories.ts';
import {
  pickLeadArticle,
  StoryClusterer,
} from '../src/cluster/clusterer.ts';
import { NewsDatabase } from '../src/db.ts';
import { ArticleDeduplicator } from '../src/dedup/deduplicator.ts';
import { normalizeFeedItem, normalizeSignalItem } from '../src/normalize/index.ts';
import type { ArticleWithWeight, SourceConfig } from '../src/types.ts';

function makeSource(
  id: string,
  name: string,
  weight: number,
  paywall: 'none' | 'soft' | 'hard' = 'none'
): SourceConfig {
  return {
    id,
    name,
    domain: `${id}.rs`,
    feedUrl: `https://${id}.rs/feed`,
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

describe('F5: Zajednički klasifikator kategorija (shared/categories.ts)', () => {
  it('tačno klasifikuje ćirilične i latinične vesti uz zadržana pravila (Gazela, pojas Gaze)', () => {
    assert.equal(
      classifyNewsCategory('Народна банка Србије задржала референтну каматну стопу'),
      'Biznis i Finansije'
    );
    assert.equal(
      classifyNewsCategory('Звезда победила Партизан у Евролиги'),
      'Sport'
    );
    assert.equal(
      classifyNewsCategory('Ухапшен осумњичени за пљачку у Београду'),
      'Hronika'
    );
    assert.equal(
      classifyNewsCategory('Gužva na mostu Gazela zbog radova u jutarnjem špicu'),
      'Društvo'
    );
    assert.equal(
      classifyNewsCategory('Novi pregovori o primirju u pojasu Gaze'),
      'Svet'
    );
    assert.equal(
      classifyNewsCategory('Opšta vest bez ključnih reči', '', undefined, 'Kultura'),
      'Kultura'
    );
  });
});

describe('F5: Izbor glavne vesti (Lead article) u klasteru', () => {
  const baseArticle = {
    source_id: 'rts',
    canonical_url: 'https://rts.rs/a',
    url: 'https://rts.rs/a',
    title: 'Vest',
    title_norm: 'vest',
    title_hash: 'h',
    snippet: 'Uvod.',
    published_at: '2026-11-21T18:00:00.000Z',
    first_seen_at: '2026-11-21T18:00:00.000Z',
    category: 'Društvo' as const,
    cluster_id: 'clu_1',
  };

  it('poštuje redosled: (a) bez paywall-a, (b) ima sliku, (c) veća težina izvora, (d) svežina', () => {
    const hardPaywallTop: ArticleWithWeight = {
      article: { ...baseArticle, id: '1', paywall: 'hard', image_url: 'https://x/1.jpg', published_at: '2026-11-21T19:50:00.000Z' },
      sourceWeight: 10,
    };
    const freeNoImg: ArticleWithWeight = {
      article: { ...baseArticle, id: '2', paywall: 'none', image_url: null, published_at: '2026-11-21T18:00:00.000Z' },
      sourceWeight: 9,
    };
    const freeWithImgLowerWeight: ArticleWithWeight = {
      article: { ...baseArticle, id: '3', paywall: 'none', image_url: 'https://x/3.jpg', published_at: '2026-11-21T18:00:00.000Z' },
      sourceWeight: 6,
    };
    const freeWithImgHigherWeightOlder: ArticleWithWeight = {
      article: { ...baseArticle, id: '4', paywall: 'none', image_url: 'https://x/4.jpg', published_at: '2026-11-21T18:10:00.000Z' },
      sourceWeight: 8,
    };
    const freeWithImgHigherWeightNewer: ArticleWithWeight = {
      article: { ...baseArticle, id: '5', paywall: 'none', image_url: 'https://x/5.jpg', published_at: '2026-11-21T19:10:00.000Z' },
      sourceWeight: 8,
    };

    // (a) Bez paywall-a pobeđuje hard paywall čak i bez slike i sa manjom težinom
    assert.equal(pickLeadArticle([hardPaywallTop, freeNoImg]).article.id, '2');

    // (b) Slika pobeđuje veću težinu bez slike
    assert.equal(pickLeadArticle([freeNoImg, freeWithImgLowerWeight]).article.id, '3');

    // (c) Veća težina pobeđuje manju težinu kada oba imaju sliku i nemaju paywall
    assert.equal(
      pickLeadArticle([freeWithImgLowerWeight, freeWithImgHigherWeightOlder]).article.id,
      '4'
    );

    // (d) Svežina odlučuje kad su paywall, slika i težina jednaki
    assert.equal(
      pickLeadArticle([
        hardPaywallTop,
        freeNoImg,
        freeWithImgLowerWeight,
        freeWithImgHigherWeightOlder,
        freeWithImgHigherWeightNewer,
      ]).article.id,
      '5'
    );
  });
});

describe('F5: Klasterovanje priča, lažni parovi, duplikati i Google News signali', () => {
  const rts = makeSource('rts', 'RTS', 9);
  const danas = makeSource('danas', 'Danas', 8);
  const nova = makeSource('nova', 'Nova.rs', 8);
  const kurir = makeSource('kurir', 'Kurir', 5);
  const gnSignal: SourceConfig = {
    ...makeSource('gn-top', 'Google News', 1),
    domain: 'news.google.com',
    role: 'signal',
  };

  it('spaja različite autorske tekstove o istom događaju (ćirilica + latinica) u jedan klaster', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, danas, nova]);
      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const articles = [
        {
          src: rts,
          title: 'Народна банка Србије задржала референтну каматну стопу на 5,75 одсто',
          url: 'https://rts.rs/nbs-stopa',
          desc: 'Извршни одбор НБС задржао је референтну каматну стопу због кретања инфлације.',
          img: 'https://rts.rs/nbs.jpg',
          pub: '2026-11-21T17:00:00Z',
        },
        {
          src: danas,
          title: 'Šta odluka NBS o kamatnoj stopi od 5,75 odsto znači za kredite građana',
          url: 'https://danas.rs/nbs-krediti',
          desc: 'Nakon što je Narodna banka Srbije zadržala referentnu kamatnu stopu, ekonomisti komentarišu rate stambenih kredita.',
          img: 'https://danas.rs/krediti.jpg',
          pub: '2026-11-21T17:30:00Z',
        },
        {
          src: nova,
          title: 'NBS bez promene referentne kamatne stope: inflacija usporava',
          url: 'https://nova.rs/nbs-inflacija',
          desc: 'Centralna banka ostavila je kamatnu stopu na 5,75 odsto i najavila opreznu monetarnu politiku.',
          img: null,
          pub: '2026-11-21T18:00:00Z',
        },
      ];

      for (const a of articles) {
        const norm = normalizeFeedItem(
          {
            title: a.title,
            url: a.url,
            publishedAtRaw: a.pub,
            descriptionRaw: a.desc,
            imageUrl: a.img,
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

      const stats = clusterer.run(now);
      assert.equal(stats.createdClusters, 1, 'Sve 3 vesti o odluci NBS moraju završiti u 1 klasteru');
      assert.equal(stats.joinedExisting, 2);

      const clusters = db.getActiveClusters(36, now);
      assert.equal(clusters.length, 1);
      assert.equal(clusters[0].media_count, 3);
      assert.equal(clusters[0].category, 'Biznis i Finansije');
      // Lead mora biti RTS (nema paywall, ima sliku, najveća težina 9)
      assert.equal(
        clusters[0].lead_article_id,
        db.findArticleByCanonicalUrl('https://rts.rs/nbs-stopa')?.id
      );
    } finally {
      db.close();
    }
  });

  it('NEGATIVAN TEST (lažni parovi): NE spaja dve različite vesti istog kluba ili istog političara', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, danas, nova, kurir]);
      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const falsePairs = [
        // Lažni par 1: dve različite utakmice/teme istog kluba (Crvena zvezda)
        {
          src: rts,
          title: 'Crvena zvezda pobedila Barselonu posle drame u Beogradskoj areni',
          url: 'https://rts.rs/zvezda-barsa',
          desc: 'Košarkaši Zvezde slavili su u uzbudljivoj završnici Evrolige pred punim tribinama.',
        },
        {
          src: danas,
          title: 'Crvena zvezda dovodi novog brazilskog napadača u zimskom prelaznom roku',
          url: 'https://danas.rs/zvezda-transfer',
          desc: 'Fudbalski klub sa Marakane pregovara o pojačanju za prolećni deo prvenstva.',
        },
        // Lažni par 2: dve potpuno nepovezane izjave/aktivnosti istog političara
        {
          src: nova,
          title: 'Predsednik Srbije razgovarao sa ambasadorom Nemačke o nemačkim investicijama',
          url: 'https://nova.rs/predsednik-nemacka',
          desc: 'Tema sastanka bile su nove fabrike u automobilskoj industriji i bilateralna trgovina.',
        },
        {
          src: kurir,
          title: 'Predsednik Srbije obišao završne radove na novom kliničkom centru u Nišu',
          url: 'https://kurir.rs/predsednik-nis-bolnica',
          desc: 'Nabavljena je savremena medicinska oprema za dijagnostiku i operacione sale na jugu zemlje.',
        },
      ];

      for (const item of falsePairs) {
        const norm = normalizeFeedItem(
          {
            title: item.title,
            url: item.url,
            publishedAtRaw: '2026-11-21T18:00:00Z',
            descriptionRaw: item.desc,
            imageUrl: 'https://img.example/x.jpg',
            categories: [],
            sourceNameHint: null,
            paywallHint: null,
            canonicalUrlHint: null,
          },
          item.src,
          now
        )!;
        dedup.processOne(norm, item.src.weight, now);
      }

      const stats = clusterer.run(now);
      assert.equal(
        stats.createdClusters,
        4,
        'Svaka od 4 nepovezane vesti (iako dele ime kluba ili političara) mora ostati poseban klaster'
      );
      assert.equal(stats.joinedExisting, 0);
    } finally {
      db.close();
    }
  });

  it('uračunava article_duplicates u media_count i povezuje Google News signale (bez ubrajanja GN u media_count)', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, danas, kurir, gnSignal]);
      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      // 1. RTS agencijska vest
      const rtsArt = normalizeFeedItem(
        {
          title: 'Most Gazela zatvoren za teretna vozila zbog hitne sanacije kolovoza',
          url: 'https://rts.rs/gazela-sanacija',
          publishedAtRaw: '2026-11-21T18:00:00Z',
          descriptionRaw: 'Putevi Srbije saopštili su da su na mostu Gazela uvedene izmene saobraćaja zbog hitne sanacije kolovoza.',
          imageUrl: 'https://rts.rs/gazela.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;

      // 2. Kurir doslovno prepisuje istu vest -> F4 beleži Kurir u article_duplicates
      const kurirCopy = normalizeFeedItem(
        {
          title: 'Most Gazela zatvoren za teretna vozila zbog hitne sanacije kolovoza',
          url: 'https://kurir.rs/gazela-sanacija',
          publishedAtRaw: '2026-11-21T18:05:00Z',
          descriptionRaw: 'Putevi Srbije saopštili su da su na mostu Gazela uvedene izmene saobraćaja zbog hitne sanacije kolovoza.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        kurir,
        now
      )!;

      // 3. Danas piše poseban tekst o gužvama na Gazeli -> F5 ga spaja u klaster
      const danasAngle = normalizeFeedItem(
        {
          title: 'Velike gužve kod Gazele: alternativni pravci tokom sanacije kolovoza',
          url: 'https://danas.rs/gazela-guzve',
          publishedAtRaw: '2026-11-21T18:20:00Z',
          descriptionRaw: 'Zbog zatvaranja dela mosta Gazela za teretna vozila vozačima se preporučuje Brankov most i Pupinov most.',
          imageUrl: 'https://danas.rs/guzva.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      dedup.processOne(rtsArt, rts.weight, now);
      assert.equal(dedup.processOne(kurirCopy, kurir.weight, now).action, 'recorded_duplicate');
      dedup.processOne(danasAngle, danas.weight, now);

      // 4. Google News signal na rangu #2 za istu priču
      const gn = normalizeSignalItem(
        {
          title: 'Sanacija kolovoza na mostu Gazela: zatvoreno za teretna vozila - Blic',
          url: 'https://news.google.com/rss/articles/gn1',
          publishedAtRaw: '2026-11-21T18:15:00Z',
          descriptionRaw: '',
          imageUrl: null,
          categories: [],
          sourceNameHint: 'Blic',
          paywallHint: null,
          canonicalUrlHint: null,
        },
        gnSignal,
        2,
        now
      )!;
      db.upsertSignal(gn);

      const stats = clusterer.run(now);
      assert.equal(stats.signalsMatched, 1);

      const clusters = db.getActiveClusters(36, now);
      assert.equal(clusters.length, 1);
      // 2 članka (RTS + Danas) + 1 zabeleženi duplikat (Kurir) = 3 medija (GN se NE računa u media_count!)
      assert.equal(clusters[0].media_count, 3);
      assert.equal(clusters[0].signal_score, 3.0);
    } finally {
      db.close();
    }
  });
});
