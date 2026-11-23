import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyNewsCategory } from '../../shared/categories.ts';
import {
  CLICKBAIT_BLOCKLIST,
  detectNoiseReason,
  isSerbianOrRegionalLanguage,
  normalizeFeedItem,
} from '../src/normalize/index.ts';
import type { ParsedFeedItem } from '../src/parsers/types.ts';
import type { SourceConfig } from '../src/types.ts';

function makeSource(
  id: string,
  name: string,
  categoryHint: SourceConfig['categoryHint']
): SourceConfig {
  return {
    id,
    name,
    domain: `${id}.rs`,
    feedUrl: `https://${id}.rs/feed`,
    kind: 'rss',
    role: 'publisher',
    categoryHint,
    weight: 8,
    baseIntervalMin: 10,
    maxIntervalMin: 60,
    paywall: 'none',
    maxItems: 20,
    enabled: true,
  };
}

function makeParsedItem(overrides: Partial<ParsedFeedItem>): ParsedFeedItem {
  return {
    title: 'Naslov',
    url: 'https://example.rs/vesti/test',
    publishedAtRaw: '2026-11-22T12:00:00Z',
    descriptionRaw: '',
    imageUrl: null,
    categories: [],
    sourceNameHint: null,
    paywallHint: null,
    canonicalUrlHint: null,
    ...overrides,
  };
}

describe('Regresioni testovi iz produkcije: klasifikacija i odbacivanje tabloid/lajfstajl šuma', () => {
  const danas = makeSource('danas', 'Danas', 'Politika');
  const blic = makeSource('blic', 'Blic', 'Društvo');
  const klix = makeSource('klix', 'Klix.ba', 'Region');
  const now = new Date('2026-11-22T18:00:00.000Z');

  it('REGRESIJA 1: „Aleksandar Zverev drugi finalista Završnog mastersa u Torinu“ (Danas) -> Sport (sa i bez /sport/ URL-a)', () => {
    const withSportUrl = normalizeFeedItem(
      makeParsedItem({
        title: 'Aleksandar Zverev drugi finalista Završnog mastersa u Torinu',
        url: 'https://www.danas.rs/sport/aleksandar-zverev-drugi-finalista-zavrsnog-mastersa-u-torinu/',
        descriptionRaw: 'Nemački teniser plasirao se u završnicu u Torinu.',
        categories: ['Sport'],
      }),
      danas,
      now
    );
    assert.ok(withSportUrl, 'Zverev vest ne sme biti odbačena');
    assert.equal(withSportUrl.category, 'Sport');

    // Čak i bez /sport/ u URL-u i bez RSS kategorije, ključne reči moraju dati Sport, NIKAD Politiku
    const withoutHints = normalizeFeedItem(
      makeParsedItem({
        title: 'Aleksandar Zverev drugi finalista Završnog mastersa u Torinu',
        url: 'https://www.danas.rs/vesti/12345',
        descriptionRaw: '',
        categories: [],
      }),
      danas,
      now
    );
    assert.ok(withoutHints);
    assert.equal(withoutHints.category, 'Sport');
  });

  it('REGRESIJA 2: „SRPSKA STARLETA SLAVI SINU 12. ROĐENDAN... Bivša zadrugarka...“ (Blic) -> ODBAČENO', () => {
    const withUrl = normalizeFeedItem(
      makeParsedItem({
        title: 'SRPSKA STARLETA SLAVI SINU 12. ROĐENDAN Bivša zadrugarka platila luksuzno slavlje',
        url: 'https://www.blic.rs/zabava/srpska-starleta-slavi-sinu-12-rodjendan/abc123',
        descriptionRaw: 'Bivša zadrugarka organizovala je gala proslavu i platila tortu.',
        categories: ['Zabava', 'Jetset'],
      }),
      blic,
      now
    );
    assert.equal(withUrl, null);

    // Čak i ako URL nije pod /zabava/, ključne reči starleta/zadrugarka moraju odbaciti vest
    const withoutUrl = normalizeFeedItem(
      makeParsedItem({
        title: 'SRPSKA STARLETA SLAVI SINU 12. ROĐENDAN',
        url: 'https://www.blic.rs/vesti/abc123',
        descriptionRaw: 'Bivša zadrugarka podelila fotografije sa proslave.',
        categories: [],
      }),
      blic,
      now
    );
    assert.equal(withoutUrl, null);
  });

  it('REGRESIJA 3: „Stručnjak otkriva koji jeseni korak presuđuje da li će naš travnjak preživeti zimu“ (Blic) -> ODBAČENO', () => {
    const item = normalizeFeedItem(
      makeParsedItem({
        title: 'Stručnjak otkriva koji jeseni korak presuđuje da li će naš travnjak preživeti zimu',
        url: 'https://www.blic.rs/slobodno-vreme/jeseni-korak-travnjak-zima/xyz',
        descriptionRaw: 'Pravilno košenje i đubrenje pre prvog mraza ključni su za travnjak.',
        categories: ['Slobodno vreme'],
      }),
      blic,
      now
    );
    assert.equal(item, null);

    // Odbacuje se i samo po ključnoj reči (travnjak) bez /slobodno-vreme/ URL-a
    const byKeywordOnly = normalizeFeedItem(
      makeParsedItem({
        title: 'Stručnjak otkriva koji jeseni korak presuđuje da li će naš travnjak preživeti zimu',
        url: 'https://www.blic.rs/vesti/xyz',
        descriptionRaw: '',
        categories: [],
      }),
      blic,
      now
    );
    assert.equal(byKeywordOnly, null);
  });

  it('REGRESIJA 4: „Topla kupka ili tuš prije spavanja pomaže da brže zaspite“ (Klix) -> ODBAČENO', () => {
    const item = normalizeFeedItem(
      makeParsedItem({
        title: 'Topla kupka ili tuš prije spavanja pomaže da brže zaspite',
        url: 'https://www.klix.ba/lifestyle/zdravlje/topla-kupka-ili-tus-prije-spavanja/261122001',
        descriptionRaw: 'Stručnjaci za san objašnjavaju kako temperatura vode utiče na uspavljivanje.',
        categories: ['Lifestyle'],
      }),
      klix,
      now
    );
    assert.equal(item, null);

    // Odbacuje se i samo po tekstu bez /lifestyle/ URL-a
    const byKeywordOnly = normalizeFeedItem(
      makeParsedItem({
        title: 'Topla kupka ili tuš prije spavanja pomaže da brže zaspite',
        url: 'https://www.klix.ba/vijesti/261122001',
        descriptionRaw: '',
        categories: [],
      }),
      klix,
      now
    );
    assert.equal(byKeywordOnly, null);
  });
});

describe('Primarni signali (URL putanja i RSS kategorije), filter URL-ova i sprečavanje lažnih poklapanja', () => {
  it('odbacuje sve zabranjene URL putanje (/zabava/, /estrada/, /magazin/, /recepti/, /horoskop/, /zena/, /dom/, /basta/, /saveti/, /lepota/, /ljubav/)', () => {
    const blockedUrls = [
      'https://blic.rs/zabava/vest-1',
      'https://nova.rs/estrada/vest-2',
      'https://blic.rs/rijaliti/vest-3',
      'https://blic.rs/jetset/vest-4',
      'https://klix.ba/magazin/vest-5',
      'https://klix.ba/lifestyle/vest-6',
      'https://blic.rs/slobodno-vreme/vest-7',
      'https://zena.blic.rs/zena/lepota/vest-8',
      'https://nova.rs/dom/basta/vest-9',
      'https://nova.rs/recepti/vest-10',
      'https://blic.rs/horoskop/vest-11',
      'https://blic.rs/saveti/vest-12',
      'https://blic.rs/ljubav/vest-13',
      'https://blic.rs/domacinstvo/vest-14',
    ];

    for (const url of blockedUrls) {
      assert.ok(
        detectNoiseReason({ url, title: 'Neutralan naslov vesti u Beogradu' }) !== null,
        `URL ${url} mora biti odbačen`
      );
    }

    // Legitimne vesti moraju proći filter
    assert.equal(
      detectNoiseReason({
        url: 'https://www.danas.rs/vesti/ekonomija/novi-budzet-srbije/',
        title: 'Skupština raspravlja o budžetu Srbije za narednu godinu',
        rssCategories: ['Ekonomija'],
      }),
      null
    );
  });

  it('koristi URL putanju i RSS <category> kao primarni signal za mapiranje u 10 kategorija', () => {
    assert.equal(
      classifyNewsCategory(
        'Neutralan naslov bez očiglednih ključnih reči',
        '',
        { url: 'https://www.danas.rs/sport/vest-123/' },
        'Politika'
      ),
      'Sport'
    );
    assert.equal(
      classifyNewsCategory(
        'Neutralan naslov bez očiglednih ključnih reči',
        '',
        { url: 'https://www.rts.rs/lat/vesti/ekonomija/555/vest.html' },
        'Društvo'
      ),
      'Biznis i Finansije'
    );
    assert.equal(
      classifyNewsCategory(
        'Neutralan naslov bez očiglednih ključnih reči',
        '',
        { url: 'https://nova.rs/vesti/biznis/nova-investicija/' },
        'Društvo'
      ),
      'Biznis i Finansije'
    );
    assert.equal(
      classifyNewsCategory(
        'Neutralan naslov bez očiglednih ključnih reči',
        '',
        { url: 'https://www.blic.rs/vesti/hronika/slucaj-1' },
        'Društvo'
      ),
      'Hronika'
    );
    assert.equal(
      classifyNewsCategory(
        'Neutralan naslov bez očiglednih ključnih reči',
        '',
        { rssCategories: ['Politika'] },
        'Društvo'
      ),
      'Politika'
    );
  });

  it('ne gura vesti u Politiku ili Biznis samo zbog ličnog imena ili glagola „platila“', () => {
    assert.equal(
      classifyNewsCategory('Aleksandar Siner i Karlos Alkaraz u borbi za ATP trofej', '', undefined, 'Društvo'),
      'Sport'
    );
    assert.equal(
      classifyNewsCategory('Siniša Kovačević najavio premijeru predstave u pozorištu', '', undefined, 'Društvo'),
      'Kultura'
    );
    // "platila" ne sme više da okida Biznis i Finansije
    assert.equal(
      classifyNewsCategory('Opština platila popravku krova osnovne škole u Zemunu', '', undefined, 'Društvo'),
      'Društvo'
    );
  });
});

describe('Faza 2: Jezički filter i filter klikbejta / saveta za domaćinstvo / buđi', () => {
  const benchmark = makeSource('benchmark', 'Benchmark', 'Tehnologija');
  const blic = makeSource('blic', 'Blic', 'Društvo');
  const now = new Date('2026-11-22T18:00:00.000Z');

  it('odbacuje članke na engleskom i drugim stranim jezicima, a propušta srpske/regionalne (uključujući IT vesti sa stranim brendovima)', () => {
    // Engleski članci iz tech ili stranih fidova moraju biti odbačeni
    assert.equal(
      isSerbianOrRegionalLanguage(
        'Apple announces new MacBook Pro with M4 chip and longer battery life',
        'The company revealed the new laptop lineup with better performance for users.'
      ),
      false
    );
    assert.equal(
      detectNoiseReason({
        url: 'https://benchmark.rs/vesti/apple-macbook-m4',
        title: 'How to fix Windows 11 update issues and boost gaming performance',
        snippet: 'Microsoft is rolling out a new update that fixes major bugs for users.',
      }),
      'lang:non-serbian'
    );
    // Slučaj kada je naslov samo ime proizvoda, a opis je na engleskom
    assert.equal(
      detectNoiseReason({
        url: 'https://benchmark.rs/vesti/windows-11-24h2',
        title: 'Windows 11 24H2',
        snippet: 'Microsoft has released the new cumulative update with security fixes for all users.',
      }),
      'lang:non-serbian'
    );

    // Nemački članak
    assert.equal(
      isSerbianOrRegionalLanguage(
        'Bundesregierung beschließt neues Gesetz für erneuerbare Energien',
        'Die neuen Regeln sind für alle Unternehmen ab sofort gültig.'
      ),
      false
    );

    // Srpske IT vesti sa engleskim nazivima brendova (Apple, iPhone, Windows, AI) MORAJU da prođu
    const validSrTech = normalizeFeedItem(
      makeParsedItem({
        title: 'Apple predstavio novi MacBook Pro sa M4 čipom: Evo koje novine donosi korisnicima u Srbiji',
        url: 'https://benchmark.rs/vesti/apple-predstavio-novi-macbook-pro/',
        descriptionRaw: 'Kompanija Apple zvanično je lansirala novu generaciju laptopova sa boljom baterijom.',
        categories: ['Tehnologija'],
      }),
      benchmark,
      now
    );
    assert.ok(validSrTech, 'Srpska IT vest sa stranim nazivima proizvoda mora da prođe');
    assert.equal(validSrTech.category, 'Tehnologija');

    // Srpska vest sa citiranim engleskim nazivom filma
    assert.equal(
      isSerbianOrRegionalLanguage(
        "Film 'The Brutalist' osvojio glavnu nagradu na festivalu u Veneciji",
        'Publika u sali pozdravila je reditelja višeminutnim aplauzom.'
      ),
      true
    );
  });

  it('odbacuje savete za domaćinstvo, buđ/vlagu, narodne lekove i klikbejt naslove, a propušta ozbiljne vesti iz zdravstva i društva', () => {
    assert.ok(CLICKBAIT_BLOCKLIST.length >= 8);

    const noiseSamples = [
      {
        title: 'Rešite se vlage i buđi u kupatilu pomoću dve namirnice iz kuhinje',
        snippet: 'Kondenzacija na prozorima i crna buđ na zidovima nestaju za 10 minuta.',
      },
      {
        title: 'Stavite jednu tabletu u veš mašinu: Neprijatan miris iz veš mašine i kamenac nestaju odmah',
        snippet: 'Jednostavan trik sa sodom bikarbonom i sirćetom.',
      },
      {
        title: 'NEĆETE VEROVATI šta se dogodilo u centru grada: Šokiraćete se kada vidite snimak!',
        snippet: 'Ostaćete bez teksta zbog ovog prizora koji je zapalio društvene mreže.',
      },
      {
        title: 'Evo šta se dešava u telu ako jedete ovo svakog jutra na prazan stomak',
        snippet: 'Ovaj napitak čisti jetru i topi masne naslage za samo nedelju dana.',
      },
      {
        title: 'Celog života radite pogrešno: Svi prave ovu grešku prilikom pranja sudova',
        snippet: 'Odmah izbacite iz kuće predmet koji privlači nesreću u dom.',
      },
    ];

    for (const sample of noiseSamples) {
      const reason = detectNoiseReason({
        url: 'https://www.blic.rs/vesti/test-clanak',
        title: sample.title,
        snippet: sample.snippet,
      });
      assert.ok(reason !== null, `Šum/klikbejt "${sample.title}" mora biti odbačen`);

      const normalized = normalizeFeedItem(
        makeParsedItem({
          title: sample.title,
          url: 'https://www.blic.rs/vesti/test-clanak',
          descriptionRaw: sample.snippet,
        }),
        blic,
        now
      );
      assert.equal(normalized, null);
    }

    // Ozbiljna vest iz javnog zdravstva MORA da prođe
    const publicHealthNews = normalizeFeedItem(
      makeParsedItem({
        title: 'Ministarstvo zdravlja najavilo nabavku nove opreme za Klinički centar Srbije',
        url: 'https://www.rts.rs/lat/vesti/drustvo/klinicki-centar-oprema.html',
        descriptionRaw: 'U bolnicama u Beogradu i Novom Sadu počinje rad na novim magnetnim rezonancama.',
        categories: ['Društvo'],
      }),
      blic,
      now
    );
    assert.ok(publicHealthNews, 'Ozbiljna vest iz javnog zdravstva mora da prođe');
    assert.equal(publicHealthNews.category, 'Društvo');
  });

  it('precizno klasifikuje banke/poslovanje u Biznis i Finansije, TV adaptacije/serije/knjige/pisce u Kultura i političke stranke (SNS/odbornici/skupština/izbori) u Politika', () => {
    // 1. Banke, klijenti, poslovanje, krediti, investicije i nagrade kompanija -> Biznis i Finansije
    assert.equal(
      classifyNewsCategory(
        'Prestižno priznanje za uspešno poslovanje: Domaćoj banci dodeljena nagrada za rad sa klijentima',
        'Rast kreditne aktivnosti i nove investicije obeležili su poslovnu godinu.',
        undefined,
        'Politika'
      ),
      'Biznis i Finansije'
    );
    assert.equal(
      classifyNewsCategory(
        'Novi uslovi za stambene kredite i digitalno bankarstvo za klijente u Srbiji',
        '',
        undefined,
        'Društvo'
      ),
      'Biznis i Finansije'
    );

    // 2. TV adaptacije, serije, filmovi, knjige i pisci -> Kultura (nikako Politika)
    assert.equal(
      classifyNewsCategory(
        'Stiže nova TV adaptacija čuvenog romana: Poznati pisac oduševljen prvom sezonom serije',
        'Reditelj i glumci najavili su premijeru nove ekranizacije knjige.',
        undefined,
        'Politika'
      ),
      'Kultura'
    );
    assert.equal(
      classifyNewsCategory(
        'Novi domaći film obara rekorde gledanosti u bioskopima',
        'Knjiga po kojoj je snimljen scenario ponovo je u vrhu čitanosti.',
        undefined,
        'Politika'
      ),
      'Kultura'
    );

    // 3. Političke stranke (SNS, skupština, izbori, odbornici) -> Politika
    assert.equal(
      classifyNewsCategory(
        'Odbornici SNS i opozicije u Skupštini grada raspravljaju o lokalnim izborima',
        'Sednica gradskog parlamenta počela je raspravom o izbornim uslovima.',
        undefined,
        'Društvo'
      ),
      'Politika'
    );
    assert.equal(
      classifyNewsCategory(
        'Poslanici u Skupštini Srbije glasaju o predloženim amandmanima',
        'Političke stranke najavile su nove predloge zakona.',
        undefined,
        'Društvo'
      ),
      'Politika'
    );
  });
});


