import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StoryClusterer } from '../src/cluster/clusterer.ts';
import { NewsDatabase } from '../src/db.ts';
import { ArticleDeduplicator } from '../src/dedup/deduplicator.ts';
import { normalizeFeedItem, normalizeForComparison } from '../src/normalize/index.ts';
import {
  applyDiversityRule,
  computeClusterScore,
  enforceMaxConsecutiveSource,
  rankActiveClusters,
  sortClustersByImportance,
  type RankedCluster,
} from '../src/rank/ranker.ts';
import type { CategoryName, SourceConfig } from '../src/types.ts';

function makeRankedMock(params: {
  id: string;
  sourceId: string;
  category: CategoryName;
  score: number;
  title: string;
  snippet?: string;
}): RankedCluster {
  const titleNorm = normalizeForComparison(params.title);
  return {
    cluster: {
      id: params.id,
      lead_article_id: `art_${params.id}`,
      category: params.category,
      media_count: 2,
      signal_score: 0,
      first_seen_at: '2026-11-21T18:00:00.000Z',
      updated_at: '2026-11-21T19:00:00.000Z',
      score: params.score,
      ai_briefing_text: null,
      ai_briefing_sources: null,
      ai_briefing_media_count: null,
      ai_briefing_at: null,
    },
    lead: {
      id: `art_${params.id}`,
      source_id: params.sourceId,
      canonical_url: `https://${params.sourceId}.rs/${params.id}`,
      url: `https://${params.sourceId}.rs/${params.id}`,
      title: params.title,
      title_norm: titleNorm,
      title_hash: params.id,
      snippet: params.snippet ?? '',
      image_url: 'https://img.example/x.jpg',
      published_at: '2026-11-21T19:00:00.000Z',
      first_seen_at: '2026-11-21T19:00:00.000Z',
      category: params.category,
      paywall: 'none',
      cluster_id: params.id,
    },
    leadSourceName: params.sourceId,
    leadSourceWeight: 8,
    sources: [],
    score: params.score,
    ageHours: 1,
  };
}

describe('F6: Formula rangiranja i zaštita starosti', () => {
  const now = new Date('2026-11-21T20:00:00.000Z');

  it('tačno računa (weight + mediaCount + signalScore) / ((ageHours + 2) ^ 1.5)', () => {
    // 2h starosti -> (2 + 2)^1.5 = 8; brojilac = 9 + 4 + 3 = 16 -> skor = 2.0
    const res = computeClusterScore(
      {
        sourceWeight: 9,
        mediaCount: 4,
        signalScore: 3,
        referenceTimeIso: '2026-11-21T18:00:00.000Z',
      },
      now
    );
    assert.equal(res.ageHours, 2);
    assert.equal(res.score, 2);
  });

  it('ograničava starost na >= 0 čak i za buduće vreme (nema NaN niti negativne starosti)', () => {
    const res = computeClusterScore(
      {
        sourceWeight: 8,
        mediaCount: 2,
        signalScore: 0,
        referenceTimeIso: '2026-11-21T21:30:00.000Z', // u budućnosti
      },
      now
    );
    assert.equal(res.ageHours, 0);
    assert.equal(res.score, Number((10 / Math.pow(2, 1.5)).toFixed(6)));
  });

  it('sveža priča sa više medija i GN bonusom pobeđuje stariju ili pojedinačnu vest', () => {
    const hotMulti = computeClusterScore(
      {
        sourceWeight: 8,
        mediaCount: 5,
        signalScore: 2.5,
        referenceTimeIso: '2026-11-21T19:00:00.000Z',
      },
      now
    );
    const oldMulti = computeClusterScore(
      {
        sourceWeight: 9,
        mediaCount: 6,
        signalScore: 3,
        referenceTimeIso: '2026-11-21T08:00:00.000Z', // 12h staro
      },
      now
    );
    const freshSingle = computeClusterScore(
      {
        sourceWeight: 8,
        mediaCount: 1,
        signalScore: 0,
        referenceTimeIso: '2026-11-21T19:00:00.000Z',
      },
      now
    );

    assert.ok(hotMulti.score > oldMulti.score);
    assert.ok(hotMulti.score > freshSingle.score);
  });
});

describe('F6: Pravilo raznovrsnosti (pomeranje bez brisanja + globalni vs. kategorijski feed)', () => {
  it('u prvih 5 na globalnom feedu ograničava isti izvor na 2 i spušta višak na pozicije 6+ bez brisanja', () => {
    const items = [
      makeRankedMock({ id: 'c1', sourceId: 'rts', category: 'Politika', score: 10, title: 'Skupština usvojila novi budžet' }),
      makeRankedMock({ id: 'c2', sourceId: 'rts', category: 'Društvo', score: 9, title: 'Radovi na mostu Gazela do petka' }),
      makeRankedMock({ id: 'c3', sourceId: 'rts', category: 'Sport', score: 8, title: 'Đoković izborio plasman u finale turnira' }),
      makeRankedMock({ id: 'c4', sourceId: 'rts', category: 'Kultura', score: 7, title: 'Otvorena izložba savremene umetnosti u muzeju' }),
      makeRankedMock({ id: 'c5', sourceId: 'danas', category: 'Biznis i Finansije', score: 6, title: 'Inflacija usporila u trećem kvartalu' }),
      makeRankedMock({ id: 'c6', sourceId: 'nova', category: 'Tehnologija', score: 5, title: 'Novi startap centar otvoren u Novom Sadu' }),
      makeRankedMock({ id: 'c7', sourceId: 'bizlife', category: 'Svet', score: 4, title: 'Samit lidera u Briselu o energetici' }),
    ];

    const ranked = applyDiversityRule(items, { topN: 5, maxPerSource: 2, maxPerCategory: 2 });
    assert.equal(ranked.length, items.length, 'Nijedna vest ne sme biti obrisana');

    const top5 = ranked.slice(0, 5);
    const rtsInTop5 = top5.filter((x) => x.lead.source_id === 'rts');
    assert.equal(rtsInTop5.length, 2, 'Najviše 2 vesti sa istog izvora u prvih 5');

    // c3 i c4 su pomereni na pozicije 6+ u redosledu po skoru
    assert.deepEqual(
      ranked.slice(5).map((x) => x.cluster.id),
      ['c3', 'c4']
    );
  });

  it('na globalnom feedu ograničava istu kategoriju na 2 u prvih 5, dok na kategorijskom feedu to ograničenje ne važi', () => {
    const sportItems = [
      makeRankedMock({ id: 's1', sourceId: 'rts', category: 'Sport', score: 10, title: 'Košarkaši pobedili u Evroligi pred punom halom' }),
      makeRankedMock({ id: 's2', sourceId: 'danas', category: 'Sport', score: 9, title: 'Teniser osvojio pehar u Parizu u dva seta' }),
      makeRankedMock({ id: 's3', sourceId: 'nova', category: 'Sport', score: 8, title: 'Odbojkašice spremne za svetsko prvenstvo' }),
      makeRankedMock({ id: 's4', sourceId: 'bizlife', category: 'Sport', score: 7, title: 'Vaterpolisti obezbedili polufinale kupa' }),
      makeRankedMock({ id: 's5', sourceId: 'startit', category: 'Sport', score: 6, title: 'Rukometna reprezentacija dobila novog selektora' }),
      makeRankedMock({ id: 'p1', sourceId: 'techcrunch', category: 'Politika', score: 5, title: 'Poslanici raspravljaju o novom zakonu' }),
      makeRankedMock({ id: 'd1', sourceId: 'theverge', category: 'Društvo', score: 4, title: 'Izmene gradskog prevoza tokom vikenda' }),
      makeRankedMock({ id: 'k1', sourceId: 'politika', category: 'Kultura', score: 3, title: 'Premijera dramske predstave u narodnom pozorištu' }),
    ];

    // Globalni feed -> najviše 2 Sport u prvih 5
    const globalOut = applyDiversityRule(sportItems, { topN: 5, maxPerSource: 2, maxPerCategory: 2 });
    const sportInGlobalTop5 = globalOut.slice(0, 5).filter((x) => x.cluster.category === 'Sport');
    assert.equal(sportInGlobalTop5.length, 2);
    assert.equal(globalOut.length, sportItems.length);

    // Kategorijski feed (maxPerCategory: null) -> svih 5 Sport vesti iz 5 različitih izvora ostaje u prvih 5!
    const onlySport = sportItems.filter((x) => x.cluster.category === 'Sport');
    const catOut = applyDiversityRule(onlySport, { topN: 5, maxPerSource: 2, maxPerCategory: null });
    assert.deepEqual(
      catOut.map((x) => x.cluster.id),
      ['s1', 's2', 's3', 's4', 's5']
    );
  });

  it('popunjava prvih 5 preostalim vestima kada nema dovoljno različitih izvora/kategorija (nikad poluprazan vrh)', () => {
    const onlyRts = [
      makeRankedMock({ id: 'a1', sourceId: 'rts', category: 'Politika', score: 10, title: 'Prva politička vest dana' }),
      makeRankedMock({ id: 'a2', sourceId: 'rts', category: 'Politika', score: 9, title: 'Druga rasprava u parlamentu o amandmanima' }),
      makeRankedMock({ id: 'a3', sourceId: 'rts', category: 'Politika', score: 8, title: 'Treći sastanak delegacija u Briselu' }),
      makeRankedMock({ id: 'a4', sourceId: 'rts', category: 'Politika', score: 7, title: 'Četvrta odluka gradske skupštine o komunalijama' }),
      makeRankedMock({ id: 'a5', sourceId: 'rts', category: 'Politika', score: 6, title: 'Peta konferencija za medije ministra finansija' }),
    ];

    const out = applyDiversityRule(onlyRts, { topN: 5, maxPerSource: 2, maxPerCategory: 2 });
    assert.equal(out.length, 5);
    assert.deepEqual(
      out.map((x) => x.cluster.id),
      ['a1', 'a2', 'a3', 'a4', 'a5']
    );
  });

  it('ne dozvoljava više od 2 uzastopna članka istog medija (npr. Radar) kada postoje drugi izvori u listi', () => {
    const radarHeavy = [
      makeRankedMock({ id: 'r1', sourceId: 'radar', category: 'Politika', score: 10, title: 'Prva analiza portala Radar o parlamentu' }),
      makeRankedMock({ id: 'r2', sourceId: 'radar', category: 'Društvo', score: 9.5, title: 'Druga reportaža portala Radar o školama' }),
      makeRankedMock({ id: 'r3', sourceId: 'radar', category: 'Biznis i Finansije', score: 9.0, title: 'Treći tekst portala Radar o bankama' }),
      makeRankedMock({ id: 'r4', sourceId: 'radar', category: 'Kultura', score: 8.5, title: 'Četvrti tekst portala Radar o novom filmu' }),
      makeRankedMock({ id: 'r5', sourceId: 'radar', category: 'Hronika', score: 8.0, title: 'Peti tekst portala Radar o istrazi tužilaštva' }),
      makeRankedMock({ id: 'n1', sourceId: 'n1', category: 'Politika', score: 7.5, title: 'Izveštaj televizije N1 sa sednice' }),
      makeRankedMock({ id: 'd1', sourceId: 'danas', category: 'Društvo', score: 7.0, title: 'Članak lista Danas o gradskom prevozu' }),
      makeRankedMock({ id: 'rt1', sourceId: 'rts', category: 'Sport', score: 6.5, title: 'Prenos utakmice na RTS programu' }),
      makeRankedMock({ id: 'b1', sourceId: 'blic', category: 'Svet', score: 6.0, title: 'Izveštaj o samitu u Briselu' }),
    ];

    const interleaved = enforceMaxConsecutiveSource(radarHeavy, 2);
    assert.deepEqual(
      interleaved.slice(0, 6).map((x) => x.lead.source_id),
      ['radar', 'radar', 'n1', 'radar', 'radar', 'danas']
    );

    const out = applyDiversityRule(radarHeavy, { topN: 5, maxPerSource: 2, maxPerCategory: 2 });
    assert.equal(out.length, radarHeavy.length);

    let maxConsecutiveRadar = 0;
    let currentRun = 0;
    for (const item of out) {
      if (item.lead.source_id === 'radar') {
        currentRun += 1;
        if (currentRun > maxConsecutiveRadar) maxConsecutiveRadar = currentRun;
      } else {
        currentRun = 0;
      }
    }
    assert.ok(
      maxConsecutiveRadar <= 2,
      `Radar ne sme imati više od 2 uzastopne vesti (dobijeno: ${maxConsecutiveRadar})`
    );
  });
});

describe('F6: End-to-end rangiranje u SQLite (razvijajući klaster i upis skora)', () => {
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

  it('računa i upisuje skor klastera u bazu koristeći vreme najnovije vesti u klasteru', () => {
    const db = new NewsDatabase(':memory:');
    try {
      const rts = makeSource('rts', 'RTS', 9);
      const danas = makeSource('danas', 'Danas', 8);
      db.migrate();
      db.syncSources([rts, danas]);

      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      // Priča 1: počela pre 10h, ali je Danas pre 15 min objavio nastavak -> updated_at je svež (0.25h)!
      const oldLead = normalizeFeedItem(
        {
          title: 'Narodna banka Srbije zadržala referentnu kamatnu stopu na 5,75 odsto',
          url: 'https://rts.rs/nbs-stopa',
          publishedAtRaw: '2026-11-21T10:00:00Z',
          descriptionRaw: 'Izvršni odbor NBS zadržao je kamatnu stopu zbog inflacije.',
          imageUrl: 'https://rts.rs/nbs.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;
      const freshFollowup = normalizeFeedItem(
        {
          title: 'Šta odluka NBS o kamatnoj stopi od 5,75 odsto znači za kredite građana',
          url: 'https://danas.rs/nbs-krediti',
          publishedAtRaw: '2026-11-21T19:45:00Z',
          descriptionRaw: 'Narodna banka Srbije ostavila je kamatnu stopu na 5,75 odsto.',
          imageUrl: 'https://danas.rs/kredit.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      // Priča 2: pojedinačna vest stara 4h
      const singleOld = normalizeFeedItem(
        {
          title: 'Otvorena nova izložba fotografija u Narodnom muzeju',
          url: 'https://rts.rs/muzej-izlozba',
          publishedAtRaw: '2026-11-21T16:00:00Z',
          descriptionRaw: 'Posetioci mogu pogledati postavku do kraja meseca.',
          imageUrl: 'https://rts.rs/muzej.jpg',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;

      dedup.processOne(oldLead, rts.weight, now);
      dedup.processOne(freshFollowup, danas.weight, now);
      dedup.processOne(singleOld, rts.weight, now);

      clusterer.run(now);
      const { globalRanked, byCategory } = rankActiveClusters(db, now);

      assert.equal(globalRanked.length, 2);
      assert.equal(globalRanked[0].cluster.category, 'Biznis i Finansije');
      assert.equal(globalRanked[0].ageHours, 0.25, 'Starost klastera mora koristiti najnoviju vest (updated_at)');
      assert.ok(globalRanked[0].score > globalRanked[1].score);
      assert.equal(globalRanked[0].sources.length, 2);
      assert.equal(byCategory['Kultura'].length, 1);

      // Proveri da je skor upisan i u SQLite tabelu clusters
      const stored = db.getActiveClusters(48, now);
      const nbsStored = stored.find((c) => c.id === globalRanked[0].cluster.id);
      assert.ok(nbsStored && nbsStored.score === globalRanked[0].score);
    } finally {
      db.close();
    }
  });

  it('nepreslušana vest sa 3 medija (stara 10h) ima viši rang od pojedinačne vesti sa 1 medijem (stara 1h), a preslušana vest pada ispod nepreslušanih', () => {
    const now = new Date('2026-11-22T02:00:00.000Z'); // Noćni sati (02:00)

    // 1) Pojedinačna noćna objava (1 medij, stara 1h -> 01:00)
    const single1hScore = computeClusterScore(
      {
        sourceWeight: 8,
        mediaCount: 1,
        signalScore: 0,
        referenceTimeIso: '2026-11-22T01:00:00.000Z',
      },
      now
    );
    const singleNightStory: RankedCluster = {
      ...makeRankedMock({
        id: 'clu_single_1h',
        sourceId: 'danas',
        category: 'Društvo',
        score: single1hScore.score,
        title: 'Noćni izveštaj dežurne službe o radovima u jednoj ulici',
      }),
      cluster: {
        ...makeRankedMock({
          id: 'clu_single_1h',
          sourceId: 'danas',
          category: 'Društvo',
          score: single1hScore.score,
          title: 'Noćni izveštaj dežurne službe o radovima u jednoj ulici',
        }).cluster,
        media_count: 1,
        updated_at: '2026-11-22T01:00:00.000Z',
      },
      ageHours: single1hScore.ageHours,
    };

    // 2) Glavna vest dana sa 3 medija (stara 10h -> 16:00 prethodnog dana) — nepreslušana
    const multi10hScore = computeClusterScore(
      {
        sourceWeight: 9,
        mediaCount: 3,
        signalScore: 0,
        referenceTimeIso: '2026-11-21T16:00:00.000Z',
      },
      now
    );
    const multiDayStoryUnlistened: RankedCluster = {
      ...makeRankedMock({
        id: 'clu_multi_10h',
        sourceId: 'rts',
        category: 'Biznis i Finansije',
        score: multi10hScore.score,
        title: 'Usvojen paket ekonomskih mera i novi budžet za narednu godinu',
      }),
      cluster: {
        ...makeRankedMock({
          id: 'clu_multi_10h',
          sourceId: 'rts',
          category: 'Biznis i Finansije',
          score: multi10hScore.score,
          title: 'Usvojen paket ekonomskih mera i novi budžet za narednu godinu',
        }).cluster,
        media_count: 3,
        updated_at: '2026-11-21T16:00:00.000Z',
      },
      ageHours: multi10hScore.ageHours,
    };

    // 3) Još veća vest dana sa 4 medija (stara 8h), ali VEĆ PRESLUŠANA
    const multi8hListenedScore = computeClusterScore(
      {
        sourceWeight: 9,
        mediaCount: 4,
        signalScore: 1,
        referenceTimeIso: '2026-11-21T18:00:00.000Z',
      },
      now
    );
    const multiStoryAlreadyListened: RankedCluster = {
      ...makeRankedMock({
        id: 'clu_listened_8h',
        sourceId: 'n1',
        category: 'Politika',
        score: multi8hListenedScore.score,
        title: 'Završena sednica parlamenta o infrastrukturnim projektima',
      }),
      cluster: {
        ...makeRankedMock({
          id: 'clu_listened_8h',
          sourceId: 'n1',
          category: 'Politika',
          score: multi8hListenedScore.score,
          title: 'Završena sednica parlamenta o infrastrukturnim projektima',
        }).cluster,
        media_count: 4,
        updated_at: '2026-11-21T18:00:00.000Z',
      },
      ageHours: multi8hListenedScore.ageHours,
    };

    const sorted = sortClustersByImportance(
      [singleNightStory, multiStoryAlreadyListened, multiDayStoryUnlistened],
      {
        listenedIds: new Set(['clu_listened_8h']),
        multiSourceWindowHours: 24,
      }
    );

    assert.deepEqual(
      sorted.map((x) => x.cluster.id),
      ['clu_multi_10h', 'clu_single_1h', 'clu_listened_8h'],
      'Nepreslušana vest sa 3 medija (10h) mora biti ispred pojedinačne vesti (1h), a preslušana vest mora pasti na dno'
    );
  });
});

