import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ArticleDeduplicator,
  DEFAULT_SEMANTIC_DEDUP_THRESHOLD,
} from '../src/dedup/deduplicator.ts';
import {
  extractContentTokens,
  stemSerbianToken,
  TfIdfSimilarityProvider,
  type SimilarityProvider,
  type TextDocument,
} from '../src/dedup/similarity.ts';
import { NewsDatabase } from '../src/db.ts';
import { normalizeFeedItem, normalizeForComparison } from '../src/normalize/index.ts';
import type { SourceConfig } from '../src/types.ts';

function makeSource(id: string, name: string, weight: number): SourceConfig {
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
    paywall: 'none',
    maxItems: 20,
    enabled: true,
  };
}

describe('F4: Srpski TF-IDF, stop-reči, stemming i granica duplikat vs. klaster', () => {
  const sim = new TfIdfSimilarityProvider();

  it('uklanja srpske stop-reči i svodi padeže na isti koren', () => {
    assert.equal(stemSerbianToken('beograda'), stemSerbianToken('beogradu'));
    assert.equal(stemSerbianToken('beogradu'), stemSerbianToken('beogradom'));
    assert.equal(stemSerbianToken('predsednika'), stemSerbianToken('predsedniku'));
    assert.equal(stemSerbianToken('budzeta'), stemSerbianToken('budzetu'));

    const tokens = extractContentTokens(
      normalizeForComparison('U Beogradu je danas održan sastanak o budžetu i kreditima za građane')
    );
    assert.ok(!tokens.includes('u'));
    assert.ok(!tokens.includes('je'));
    assert.ok(!tokens.includes('danas'));
    assert.ok(!tokens.includes('za'));
    assert.ok(tokens.includes('beograd'));
    assert.ok(tokens.includes('budzet'));
  });

  it('prepoznaje prepisanu agencijsku vest (ćirilica vs latinica, sitne izmene) kao >= 0.82', () => {
    const rtsAgency: TextDocument = {
      id: 'rts-1',
      titleNorm: normalizeForComparison(
        'Народна банка Србије задржала референтну каматну стопу на 5,75 одсто'
      ),
      snippet:
        'Извршни одбор Народне банке Србије одлучио је на данашњој седници да задржи референтну каматну стопу на нивоу од 5,75 одсто.',
    };
    const kurirReprint: TextDocument = {
      id: 'kurir-1',
      titleNorm: normalizeForComparison(
        'NBS zadržala referentnu kamatnu stopu na 5,75 odsto'
      ),
      snippet:
        'Izvršni odbor Narodne banke Srbije odlučio je na današnjoj sednici da zadrži referentnu kamatnu stopu na nivou od 5,75 odsto, saopšteno je.',
    };

    const score = sim.similarity(rtsAgency, kurirReprint);
    assert.ok(
      score >= DEFAULT_SEMANTIC_DEDUP_THRESHOLD,
      `Prepisana agencijska vest imala je sličnost ${score.toFixed(3)}, očekivano >= ${DEFAULT_SEMANTIC_DEDUP_THRESHOLD}`
    );
  });

  it('NE označava dva različita autorska članka o istom događaju kao duplikate (< 0.82, idu u F5 klaster)', () => {
    const rtsReport: TextDocument = {
      id: 'rts-2',
      titleNorm: normalizeForComparison(
        'Narodna banka Srbije zadržala referentnu kamatnu stopu na 5,75 odsto'
      ),
      snippet:
        'Izvršni odbor NBS naveo je da je odluka doneta zbog usporavanja inflacije i kretanja na svetskom tržištu energenata.',
    };
    const danasAnalysis: TextDocument = {
      id: 'danas-2',
      titleNorm: normalizeForComparison(
        'Šta odluka NBS o kamatnoj stopi znači za rate stambenih kredita građana'
      ),
      snippet:
        'Ekonomisti ocenjuju da dužnici u evrima i dinarima neće uskoro videti značajno pojeftinjenje mesečnih rata u bankama.',
    };

    const score = sim.similarity(rtsReport, danasAnalysis);
    assert.ok(
      score < DEFAULT_SEMANTIC_DEDUP_THRESHOLD,
      `Različiti članci o istom događaju ne smeju preći prag dedupa (dobijeno ${score.toFixed(3)})`
    );
    assert.ok(
      score >= 0.15,
      `Treba da zadrže primetnu tematsku sličnost za F5 klasterovanje (dobijeno ${score.toFixed(3)})`
    );
  });

  it('daje veoma nisku sličnost za potpuno nepovezane vesti', () => {
    const a: TextDocument = {
      id: 'a',
      titleNorm: normalizeForComparison('Novak Đoković pobedio u trećem kolu turnira u Parizu'),
      snippet: 'Srpski teniser savladao je rivala u dva seta bez većih problema.',
    };
    const b: TextDocument = {
      id: 'b',
      titleNorm: normalizeForComparison('Radovi na vodovodnoj mreži na Voždovcu do večeras'),
      snippet: 'Potrošači u nekoliko ulica biće bez vode zbog sanacije kvara na magistralnom cevovodu.',
    };

    const score = sim.similarity(a, b);
    assert.ok(score < 0.12, `Nepovezane vesti dale su sličnost ${score.toFixed(3)}`);
  });
});

describe('F4: Tačna i semantička deduplikacija u SQLite (pravilo težine i starosti)', () => {
  const rts = makeSource('rts', 'RTS', 9);
  const danas = makeSource('danas', 'Danas', 8);
  const nova = makeSource('nova', 'Nova.rs', 8);
  const kurir = makeSource('kurir', 'Kurir', 5);

  it('preskače tačan kanonski URL i dopunjuje nedostajuću sliku', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts]);
      const dedup = new ArticleDeduplicator(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const a1 = normalizeFeedItem(
        {
          title: 'Most Gazela otvoren za saobraćaj',
          url: 'https://rts.rs/vesti/gazela?utm_source=rss',
          publishedAtRaw: '2026-11-21T19:00:00Z',
          descriptionRaw: 'Saobraćaj teče bez zastoja.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;
      const a2 = normalizeFeedItem(
        {
          title: 'Most Gazela otvoren za saobraćaj',
          url: 'https://rts.rs/vesti/gazela/?fbclid=abc',
          publishedAtRaw: '2026-11-21T19:00:00Z',
          descriptionRaw: 'Saobraćaj teče bez zastoja.',
          imageUrl: 'https://rts.rs/img/gazela.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;

      assert.equal(dedup.processOne(a1, rts.weight, now).action, 'inserted');
      assert.equal(dedup.processOne(a2, rts.weight, now).action, 'skip_exact_url');
      assert.equal(db.getStats().articles, 1);
      assert.equal(
        db.findArticleByCanonicalUrl('https://rts.rs/vesti/gazela')?.image_url,
        'https://rts.rs/img/gazela.jpg'
      );
    } finally {
      db.close();
    }
  });

  it('čuva verziju sa izvora veće težine i beleži potisnuti izvor u article_duplicates (oba redosleda)', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, kurir]);
      const dedup = new ArticleDeduplicator(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      // Prvo stiže slabiji izvor (Kurir, weight 5), pa jači izvor (RTS, weight 9) sa ćiriličnim istim naslovom
      const kurirArt = normalizeFeedItem(
        {
          title: 'Đorđević najavio novu deonicu auto-puta kod Čačka',
          url: 'https://kurir.rs/vesti/autoput-cacak',
          publishedAtRaw: '2026-11-21T18:00:00Z',
          descriptionRaw: 'Otvaranje je zakazano za proleće.',
          imageUrl: 'https://kurir.rs/img/put.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        kurir,
        now
      )!;

      const rtsArt = normalizeFeedItem(
        {
          title: 'Ђорђевић најавио нову деоницу ауто-пута код Чачка',
          url: 'https://rts.rs/vesti/autoput-cacak',
          publishedAtRaw: '2026-11-21T18:10:00Z',
          descriptionRaw: 'Отварање је заказано за пролеће.',
          imageUrl: null, // treba da nasledi sliku od Kurira!
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;

      assert.equal(dedup.processOne(kurirArt, kurir.weight, now).action, 'inserted');
      const d2 = dedup.processOne(rtsArt, rts.weight, now);
      assert.equal(d2.action, 'replaced_existing');
      assert.equal(db.getStats().articles, 1);

      // U bazi je RTS, nasledio je sliku, a Kurir je evidentiran u article_duplicates
      const kept = db.findArticleByCanonicalUrl('https://rts.rs/vesti/autoput-cacak');
      assert.ok(kept);
      assert.equal(kept.source_id, 'rts');
      assert.equal(kept.image_url, 'https://kurir.rs/img/put.jpg');

      const dups = db.getArticleDuplicates(kept.id);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].duplicate_source_id, 'kurir');
      assert.equal(dups[0].reason, 'title_hash');
    } finally {
      db.close();
    }
  });

  it('kod iste težine izvora čuva stariju vest i beleži mlađu u article_duplicates', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([danas, nova]); // oba weight 8
      const dedup = new ArticleDeduplicator(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const newerNova = normalizeFeedItem(
        {
          title: 'Skupština usvojila izmene zakona o energetici',
          url: 'https://nova.rs/vesti/zakon-energetika',
          publishedAtRaw: '2026-11-21T19:00:00Z',
          descriptionRaw: 'Poslanici su većinom glasova podržali predlog.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        nova,
        now
      )!;

      const olderDanas = normalizeFeedItem(
        {
          title: 'Skupština usvojila izmene zakona o energetici',
          url: 'https://danas.rs/vesti/zakon-energetika',
          publishedAtRaw: '2026-11-21T18:20:00Z',
          descriptionRaw: 'Poslanici su većinom glasova podržali predlog.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      dedup.processOne(newerNova, nova.weight, now);
      const decision = dedup.processOne(olderDanas, danas.weight, now);
      assert.equal(decision.action, 'replaced_existing');

      const kept = db.findArticleByCanonicalUrl('https://danas.rs/vesti/zakon-energetika');
      assert.ok(kept);
      const dups = db.getArticleDuplicates(kept.id);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].duplicate_source_id, 'nova');
    } finally {
      db.close();
    }
  });

  it('semantički hvata agencijski duplikat, ali ostavlja različit autorski tekst za F5 klasterovanje', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, danas, kurir]);
      const dedup = new ArticleDeduplicator(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const rtsAgency = normalizeFeedItem(
        {
          title: 'Народна банка Србије задржала референтну каматну стопу на 5,75 одсто',
          url: 'https://rts.rs/vesti/nbs-kamata',
          publishedAtRaw: '2026-11-21T18:00:00Z',
          descriptionRaw:
            'Извршни одбор Народне банке Србије одлучио је на данашњој седници да задржи референтну каматну стопу на нивоу од 5,75 одсто.',
          imageUrl: 'https://rts.rs/nbs.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;

      const kurirAgencyCopy = normalizeFeedItem(
        {
          title: 'NBS zadržala referentnu kamatnu stopu na 5,75 odsto',
          url: 'https://kurir.rs/vesti/nbs-kamata',
          publishedAtRaw: '2026-11-21T18:05:00Z',
          descriptionRaw:
            'Izvršni odbor Narodne banke Srbije odlučio je na današnjoj sednici da zadrži referentnu kamatnu stopu na nivou od 5,75 odsto, saopšteno je.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        kurir,
        now
      )!;

      const danasDifferentAngle = normalizeFeedItem(
        {
          title: 'Šta odluka NBS o kamatnoj stopi znači za rate stambenih kredita građana',
          url: 'https://danas.rs/ekonomija/rate-kredita-nbs',
          publishedAtRaw: '2026-11-21T18:30:00Z',
          descriptionRaw:
            'Ekonomisti ocenjuju da dužnici u evrima i dinarima neće uskoro videti značajno pojeftinjenje mesečnih rata u bankama.',
          imageUrl: 'https://danas.rs/kredit.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      assert.equal(dedup.processOne(rtsAgency, rts.weight, now).action, 'inserted');
      const copyDecision = dedup.processOne(kurirAgencyCopy, kurir.weight, now);
      assert.equal(copyDecision.action, 'recorded_duplicate');
      if (copyDecision.action === 'recorded_duplicate') {
        assert.equal(copyDecision.reason, 'semantic');
      }

      // Različit članak o istoj temi MORA biti sačuvan odvojeno da bi ga F5 klasterovao
      assert.equal(dedup.processOne(danasDifferentAngle, danas.weight, now).action, 'inserted');
      assert.equal(db.getStats().articles, 2);
      assert.equal(db.getArticleDuplicates(rtsAgency.id).length, 1);
    } finally {
      db.close();
    }
  });

  it('podržava zamenu SimilarityProvider-a (npr. budući embeddings provajder)', () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      db.syncSources([rts, danas]);
      const mockEmbeddings: SimilarityProvider = {
        name: 'mock-embeddings',
        similarity: () => 0.91,
        findMostSimilar: (_q, corpus, min = 0) =>
          corpus.length > 0 && 0.91 >= min ? { id: corpus[0].id, score: 0.91 } : null,
      };
      const dedup = new ArticleDeduplicator(db, { similarityProvider: mockEmbeddings });
      const now = new Date('2026-11-21T20:00:00.000Z');

      const a = normalizeFeedItem(
        {
          title: 'Prva vest sa potpuno drugačijim rečima',
          url: 'https://rts.rs/a',
          publishedAtRaw: '2026-11-21T18:00:00Z',
          descriptionRaw: 'Tekst prve vesti dovoljno dug za proveru.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;
      const b = normalizeFeedItem(
        {
          title: 'Druga vest koja semantički znači isto',
          url: 'https://danas.rs/b',
          publishedAtRaw: '2026-11-21T18:10:00Z',
          descriptionRaw: 'Druga formulacija iste agencijske informacije.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      dedup.processOne(a, rts.weight, now);
      const res = dedup.processOne(b, danas.weight, now);
      assert.equal(res.action, 'recorded_duplicate');
      assert.equal(db.getStats().articles, 1);
    } finally {
      db.close();
    }
  });
});
