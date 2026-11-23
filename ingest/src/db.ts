import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_RETENTION_HOURS,
  type ArticleDuplicateRow,
  type ArticleRow,
  type ArticleWithWeight,
  type CategoryName,
  type ClusterRow,
  type DuplicateReason,
  type FeedKind,
  type FetchStateRow,
  type PaywallType,
  type RobotsCacheRow,
  type SignalRow,
  type SourceConfig,
  type SourceRole,
  type SourceWithState,
} from './types.ts';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Verzionisane SQLite migracije.
 * Napomena (Sloj 5): tabela `articles` NAMERNO nema kolonu za ceo tekst članka.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        feed_url TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('rss', 'atom', 'html')),
        role TEXT NOT NULL CHECK (role IN ('publisher', 'signal')),
        category_hint TEXT NOT NULL,
        weight REAL NOT NULL CHECK (weight >= 1 AND weight <= 10),
        base_interval_min INTEGER NOT NULL CHECK (base_interval_min >= 5),
        max_interval_min INTEGER NOT NULL CHECK (max_interval_min >= base_interval_min),
        paywall TEXT NOT NULL CHECK (paywall IN ('none', 'soft', 'hard')),
        max_items INTEGER NOT NULL DEFAULT 20,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS fetch_state (
        source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
        etag TEXT,
        last_modified TEXT,
        last_status INTEGER,
        last_fetched_at TEXT,
        next_check_at TEXT,
        current_interval_min INTEGER NOT NULL,
        consecutive_304 INTEGER NOT NULL DEFAULT 0,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS clusters (
        id TEXT PRIMARY KEY,
        lead_article_id TEXT,
        category TEXT NOT NULL,
        media_count INTEGER NOT NULL DEFAULT 1,
        signal_score REAL NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        ai_briefing_text TEXT,
        ai_briefing_sources TEXT,
        ai_briefing_media_count INTEGER,
        ai_briefing_at TEXT
      );

      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        canonical_url TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        title_norm TEXT NOT NULL,
        title_hash TEXT NOT NULL,
        snippet TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        published_at TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        category TEXT NOT NULL,
        paywall TEXT NOT NULL CHECK (paywall IN ('none', 'soft', 'hard')),
        cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        title_norm TEXT NOT NULL,
        rank INTEGER NOT NULL,
        seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS robots_cache (
        domain TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        status INTEGER NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_articles_title_hash ON articles(title_hash);
      CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_clusters_score ON clusters(score DESC);
      CREATE INDEX IF NOT EXISTS idx_clusters_category_score ON clusters(category, score DESC);
      CREATE INDEX IF NOT EXISTS idx_signals_seen_at ON signals(seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fetch_state_next_check ON fetch_state(next_check_at);
    `,
  },
  {
    version: 2,
    name: 'article_duplicates',
    sql: `
      CREATE TABLE IF NOT EXISTS article_duplicates (
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        duplicate_source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        duplicate_url TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('title_hash', 'semantic')),
        similarity REAL NOT NULL,
        seen_at TEXT NOT NULL,
        PRIMARY KEY (article_id, duplicate_source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_article_duplicates_article_id
        ON article_duplicates(article_id);
    `,
  },
];

export interface SyncSummary {
  upserted: number;
  disabledRemoved: number;
  statesInitialized: number;
}

export class NewsDatabase {
  public readonly db: DatabaseSync;
  public readonly path: string;

  constructor(dbPath: string) {
    this.path = dbPath;
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  public migrate(): number[] {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = this.db
      .prepare('SELECT version FROM schema_migrations')
      .all() as Array<{ version: number }>;
    const applied = new Set(appliedRows.map((r) => Number(r.version)));

    const newlyApplied: number[] = [];
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;

      this.db.exec('BEGIN;');
      try {
        this.db.exec(migration.sql);
        this.db
          .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString());
        this.db.exec('COMMIT;');
        newlyApplied.push(migration.version);
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    }

    return newlyApplied;
  }

  /**
   * Sinhronizuje izvore iz sources.json u SQLite.
   * Izvori uklonjeni iz JSON-a se označavaju kao enabled=0 (ne brišu se članci odmah).
   */
  public syncSources(sources: SourceConfig[]): SyncSummary {
    const upsertSource = this.db.prepare(`
      INSERT INTO sources (
        id, name, domain, feed_url, kind, role, category_hint,
        weight, base_interval_min, max_interval_min, paywall, max_items, enabled, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        domain = excluded.domain,
        feed_url = excluded.feed_url,
        kind = excluded.kind,
        role = excluded.role,
        category_hint = excluded.category_hint,
        weight = excluded.weight,
        base_interval_min = excluded.base_interval_min,
        max_interval_min = excluded.max_interval_min,
        paywall = excluded.paywall,
        max_items = excluded.max_items,
        enabled = excluded.enabled,
        notes = excluded.notes
    `);

    const ensureState = this.db.prepare(`
      INSERT OR IGNORE INTO fetch_state (
        source_id, current_interval_min, consecutive_304, consecutive_errors
      ) VALUES (?, ?, 0, 0)
    `);

    const clampStateInterval = this.db.prepare(`
      UPDATE fetch_state
      SET current_interval_min = MAX(?, MIN(?, current_interval_min))
      WHERE source_id = ?
    `);

    let statesInitialized = 0;
    let disabledRemoved = 0;

    this.db.exec('BEGIN;');
    try {
      const configIds = new Set<string>();
      for (const s of sources) {
        configIds.add(s.id);
        upsertSource.run(
          s.id,
          s.name,
          s.domain,
          s.feedUrl,
          s.kind,
          s.role,
          s.categoryHint,
          s.weight,
          s.baseIntervalMin,
          s.maxIntervalMin,
          s.paywall,
          s.maxItems,
          s.enabled ? 1 : 0,
          s.notes ?? null
        );
        const stateRes = ensureState.run(s.id, s.baseIntervalMin);
        if (Number(stateRes.changes) > 0) {
          statesInitialized += 1;
        }
        clampStateInterval.run(s.baseIntervalMin, s.maxIntervalMin, s.id);
      }

      const existingRows = this.db
        .prepare('SELECT id FROM sources WHERE enabled = 1')
        .all() as Array<{ id: string }>;

      const disableStmt = this.db.prepare('UPDATE sources SET enabled = 0 WHERE id = ?');
      for (const row of existingRows) {
        if (!configIds.has(row.id)) {
          disableStmt.run(row.id);
          disabledRemoved += 1;
        }
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return {
      upserted: sources.length,
      disabledRemoved,
      statesInitialized,
    };
  }

  public getAllSourcesWithState(): SourceWithState[] {
    const rows = this.db
      .prepare(`
        SELECT
          s.id, s.name, s.domain, s.feed_url, s.kind, s.role, s.category_hint,
          s.weight, s.base_interval_min, s.max_interval_min, s.paywall, s.max_items, s.enabled, s.notes,
          f.etag, f.last_modified, f.last_status, f.last_fetched_at, f.next_check_at,
          f.current_interval_min, f.consecutive_304, f.consecutive_errors, f.last_error
        FROM sources s
        JOIN fetch_state f ON f.source_id = s.id
        ORDER BY s.enabled DESC, s.role ASC, s.weight DESC, s.id ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      source: {
        id: String(r.id),
        name: String(r.name),
        domain: String(r.domain),
        feedUrl: String(r.feed_url),
        kind: String(r.kind) as FeedKind,
        role: String(r.role) as SourceRole,
        categoryHint: String(r.category_hint) as CategoryName,
        weight: Number(r.weight),
        baseIntervalMin: Number(r.base_interval_min),
        maxIntervalMin: Number(r.max_interval_min),
        paywall: String(r.paywall) as PaywallType,
        maxItems: Number(r.max_items),
        enabled: Number(r.enabled) === 1,
        notes: r.notes ? String(r.notes) : undefined,
      },
      state: {
        source_id: String(r.id),
        etag: r.etag ? String(r.etag) : null,
        last_modified: r.last_modified ? String(r.last_modified) : null,
        last_status: r.last_status !== null ? Number(r.last_status) : null,
        last_fetched_at: r.last_fetched_at ? String(r.last_fetched_at) : null,
        next_check_at: r.next_check_at ? String(r.next_check_at) : null,
        current_interval_min: Number(r.current_interval_min),
        consecutive_304: Number(r.consecutive_304),
        consecutive_errors: Number(r.consecutive_errors),
        last_error: r.last_error ? String(r.last_error) : null,
      } satisfies FetchStateRow,
    }));
  }

  /**
   * Vraća uključene izvore kojima je istekao next_check_at (ili nikad nisu provereni).
   */
  public getDueSources(nowIso: string = new Date().toISOString()): SourceWithState[] {
    return this.getAllSourcesWithState().filter(({ source, state }) => {
      if (!source.enabled) return false;
      if (!state.next_check_at) return true;
      return state.next_check_at <= nowIso;
    });
  }

  public updateFetchState(state: FetchStateRow): void {
    this.db
      .prepare(`
        UPDATE fetch_state
        SET
          etag = ?,
          last_modified = ?,
          last_status = ?,
          last_fetched_at = ?,
          next_check_at = ?,
          current_interval_min = ?,
          consecutive_304 = ?,
          consecutive_errors = ?,
          last_error = ?
        WHERE source_id = ?
      `)
      .run(
        state.etag,
        state.last_modified,
        state.last_status,
        state.last_fetched_at,
        state.next_check_at,
        state.current_interval_min,
        state.consecutive_304,
        state.consecutive_errors,
        state.last_error,
        state.source_id
      );
  }

  public getRobotsCache(domain: string): RobotsCacheRow | null {
    const row = this.db
      .prepare('SELECT domain, body, status, fetched_at FROM robots_cache WHERE domain = ?')
      .get(domain.toLowerCase()) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      domain: String(row.domain),
      body: String(row.body),
      status: Number(row.status),
      fetched_at: String(row.fetched_at),
    };
  }

  public upsertRobotsCache(entry: RobotsCacheRow): void {
    this.db
      .prepare(`
        INSERT INTO robots_cache (domain, body, status, fetched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(domain) DO UPDATE SET
          body = excluded.body,
          status = excluded.status,
          fetched_at = excluded.fetched_at
      `)
      .run(entry.domain.toLowerCase(), entry.body, entry.status, entry.fetched_at);
  }

  private mapArticleRow(r: Record<string, unknown>): ArticleRow {
    return {
      id: String(r.id),
      source_id: String(r.source_id),
      canonical_url: String(r.canonical_url),
      url: String(r.url),
      title: String(r.title),
      title_norm: String(r.title_norm),
      title_hash: String(r.title_hash),
      snippet: String(r.snippet ?? ''),
      image_url: r.image_url ? String(r.image_url) : null,
      published_at: String(r.published_at),
      first_seen_at: String(r.first_seen_at),
      category: String(r.category) as CategoryName,
      paywall: String(r.paywall) as PaywallType,
      cluster_id: r.cluster_id ? String(r.cluster_id) : null,
    };
  }

  public insertArticle(article: Omit<ArticleRow, 'cluster_id'>, clusterId: string | null = null): void {
    this.db
      .prepare(`
        INSERT INTO articles (
          id, source_id, canonical_url, url, title, title_norm, title_hash,
          snippet, image_url, published_at, first_seen_at, category, paywall, cluster_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        article.id,
        article.source_id,
        article.canonical_url,
        article.url,
        article.title,
        article.title_norm,
        article.title_hash,
        article.snippet,
        article.image_url,
        article.published_at,
        article.first_seen_at,
        article.category,
        article.paywall,
        clusterId
      );
  }

  public findArticleByCanonicalUrl(canonicalUrl: string): ArticleRow | null {
    const row = this.db
      .prepare('SELECT * FROM articles WHERE canonical_url = ?')
      .get(canonicalUrl) as Record<string, unknown> | undefined;
    return row ? this.mapArticleRow(row) : null;
  }

  public findArticlesByTitleHash(titleHash: string): ArticleWithWeight[] {
    const rows = this.db
      .prepare(`
        SELECT a.*, s.weight AS source_weight
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.title_hash = ?
        ORDER BY s.weight DESC, a.published_at ASC
      `)
      .all(titleHash) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      article: this.mapArticleRow(r),
      sourceWeight: Number(r.source_weight),
    }));
  }

  public getRecentArticlesWithWeight(
    windowHours: number = 48,
    now: Date = new Date()
  ): ArticleWithWeight[] {
    const cutoffIso = new Date(now.getTime() - windowHours * 3600 * 1_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT a.*, s.weight AS source_weight
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.first_seen_at >= ? OR a.published_at >= ?
        ORDER BY s.weight DESC, a.published_at ASC
      `)
      .all(cutoffIso, cutoffIso) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      article: this.mapArticleRow(r),
      sourceWeight: Number(r.source_weight),
    }));
  }

  public fillMissingArticleMetadata(
    articleId: string,
    imageUrl: string | null,
    snippet: string
  ): void {
    if (!imageUrl && !snippet) return;
    this.db
      .prepare(`
        UPDATE articles
        SET
          image_url = COALESCE(image_url, ?),
          snippet = CASE WHEN snippet = '' AND ? != '' THEN ? ELSE snippet END
        WHERE id = ?
      `)
      .run(imageUrl, snippet, snippet, articleId);
  }

  public recordArticleDuplicate(entry: ArticleDuplicateRow): void {
    this.db
      .prepare(`
        INSERT INTO article_duplicates (
          article_id, duplicate_source_id, duplicate_url, reason, similarity, seen_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(article_id, duplicate_source_id) DO UPDATE SET
          duplicate_url = excluded.duplicate_url,
          similarity = MAX(article_duplicates.similarity, excluded.similarity),
          seen_at = excluded.seen_at
      `)
      .run(
        entry.article_id,
        entry.duplicate_source_id,
        entry.duplicate_url,
        entry.reason,
        entry.similarity,
        entry.seen_at
      );
  }

  public getArticleDuplicates(articleId: string): ArticleDuplicateRow[] {
    const rows = this.db
      .prepare(`
        SELECT article_id, duplicate_source_id, duplicate_url, reason, similarity, seen_at
        FROM article_duplicates
        WHERE article_id = ?
        ORDER BY seen_at ASC
      `)
      .all(articleId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      article_id: String(r.article_id),
      duplicate_source_id: String(r.duplicate_source_id),
      duplicate_url: String(r.duplicate_url),
      reason: String(r.reason) as DuplicateReason,
      similarity: Number(r.similarity),
      seen_at: String(r.seen_at),
    }));
  }

  /**
   * Atomski zamenjuje slabiji/mlađi duplikat jačim/starijim člankom:
   * - novi članak nasleđuje `cluster_id`, postojeću sliku/uvod ako fali i sve prethodne duplikate
   * - potisnuti izvor se beleži u `article_duplicates` da se ne izgubi signal popularnosti
   */
  public promoteDuplicateReplacement(
    existingId: string,
    incoming: Omit<ArticleRow, 'cluster_id'>,
    reason: DuplicateReason,
    similarity: number,
    nowIso: string
  ): void {
    const existingRow = this.db
      .prepare('SELECT * FROM articles WHERE id = ?')
      .get(existingId) as Record<string, unknown> | undefined;
    if (!existingRow) {
      this.insertArticle(incoming);
      return;
    }

    const existing = this.mapArticleRow(existingRow);
    const existingDups = this.getArticleDuplicates(existingId);

    this.db.exec('BEGIN;');
    try {
      this.insertArticle(
        {
          ...incoming,
          image_url: incoming.image_url ?? existing.image_url,
          snippet: incoming.snippet || existing.snippet,
        },
        existing.cluster_id
      );

      // Prenesi postojeće zabeležene duplikate (osim ako je neki baš novi izvor)
      for (const d of existingDups) {
        if (d.duplicate_source_id === incoming.source_id) continue;
        this.recordArticleDuplicate({
          ...d,
          article_id: incoming.id,
        });
      }

      // Zabeleži potisnuti članak kao duplikat-signal
      this.recordArticleDuplicate({
        article_id: incoming.id,
        duplicate_source_id: existing.source_id,
        duplicate_url: existing.canonical_url,
        reason,
        similarity,
        seen_at: nowIso,
      });

      // Ažuriraj eventualni lead_article_id klastera
      this.db
        .prepare('UPDATE clusters SET lead_article_id = ? WHERE lead_article_id = ?')
        .run(incoming.id, existingId);

      // Obriši stari zapis (CASCADE briše njegove stare redove u article_duplicates)
      this.db.prepare('DELETE FROM articles WHERE id = ?').run(existingId);

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public upsertSignal(signal: SignalRow): void {
    this.db
      .prepare(`
        INSERT INTO signals (id, source_id, title, title_norm, rank, seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          rank = MIN(signals.rank, excluded.rank),
          seen_at = excluded.seen_at
      `)
      .run(
        signal.id,
        signal.source_id,
        signal.title,
        signal.title_norm,
        signal.rank,
        signal.seen_at
      );
  }

  private mapClusterRow(r: Record<string, unknown>): ClusterRow {
    return {
      id: String(r.id),
      lead_article_id: r.lead_article_id ? String(r.lead_article_id) : null,
      category: String(r.category) as CategoryName,
      media_count: Number(r.media_count),
      signal_score: Number(r.signal_score),
      first_seen_at: String(r.first_seen_at),
      updated_at: String(r.updated_at),
      score: Number(r.score),
      ai_briefing_text: r.ai_briefing_text ? String(r.ai_briefing_text) : null,
      ai_briefing_sources: r.ai_briefing_sources ? String(r.ai_briefing_sources) : null,
      ai_briefing_media_count:
        r.ai_briefing_media_count !== null && r.ai_briefing_media_count !== undefined
          ? Number(r.ai_briefing_media_count)
          : null,
      ai_briefing_at: r.ai_briefing_at ? String(r.ai_briefing_at) : null,
    };
  }

  public getUnclusteredArticles(
    windowHours: number = 36,
    now: Date = new Date()
  ): ArticleWithWeight[] {
    const cutoffIso = new Date(now.getTime() - windowHours * 3600 * 1_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT a.*, s.weight AS source_weight
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.cluster_id IS NULL
          AND s.role = 'publisher'
          AND (a.first_seen_at >= ? OR a.published_at >= ?)
        ORDER BY a.published_at ASC, s.weight DESC
      `)
      .all(cutoffIso, cutoffIso) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      article: this.mapArticleRow(r),
      sourceWeight: Number(r.source_weight),
    }));
  }

  public getActiveClusters(
    windowHours: number = 36,
    now: Date = new Date()
  ): ClusterRow[] {
    const cutoffIso = new Date(now.getTime() - windowHours * 3600 * 1_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT * FROM clusters
        WHERE updated_at >= ? OR first_seen_at >= ?
        ORDER BY updated_at DESC
      `)
      .all(cutoffIso, cutoffIso) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapClusterRow(r));
  }

  public getClusterMembers(clusterId: string): ArticleWithWeight[] {
    const rows = this.db
      .prepare(`
        SELECT a.*, s.weight AS source_weight
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.cluster_id = ?
        ORDER BY a.published_at ASC
      `)
      .all(clusterId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      article: this.mapArticleRow(r),
      sourceWeight: Number(r.source_weight),
    }));
  }

  /**
   * Vraća sve jedinstvene publisher `source_id` vrednosti za klaster,
   * uključujući i potisnute agencijske duplikate iz `article_duplicates`.
   */
  public getClusterDistinctPublisherIds(clusterId: string): string[] {
    const rows = this.db
      .prepare(`
        SELECT DISTINCT src_id FROM (
          SELECT a.source_id AS src_id
          FROM articles a
          JOIN sources s ON s.id = a.source_id
          WHERE a.cluster_id = ? AND s.role = 'publisher'
          UNION
          SELECT d.duplicate_source_id AS src_id
          FROM article_duplicates d
          JOIN articles a ON a.id = d.article_id
          JOIN sources s ON s.id = d.duplicate_source_id
          WHERE a.cluster_id = ? AND s.role = 'publisher'
        )
      `)
      .all(clusterId, clusterId) as Array<{ src_id: string }>;

    return rows.map((r) => String(r.src_id));
  }

  public createCluster(cluster: ClusterRow): void {
    this.db
      .prepare(`
        INSERT INTO clusters (
          id, lead_article_id, category, media_count, signal_score,
          first_seen_at, updated_at, score,
          ai_briefing_text, ai_briefing_sources, ai_briefing_media_count, ai_briefing_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        cluster.id,
        cluster.lead_article_id,
        cluster.category,
        cluster.media_count,
        cluster.signal_score,
        cluster.first_seen_at,
        cluster.updated_at,
        cluster.score,
        cluster.ai_briefing_text,
        cluster.ai_briefing_sources,
        cluster.ai_briefing_media_count,
        cluster.ai_briefing_at
      );
  }

  public updateClusterSummary(params: {
    id: string;
    lead_article_id: string;
    category: CategoryName;
    media_count: number;
    first_seen_at: string;
    updated_at: string;
  }): void {
    this.db
      .prepare(`
        UPDATE clusters
        SET
          lead_article_id = ?,
          category = ?,
          media_count = ?,
          first_seen_at = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        params.lead_article_id,
        params.category,
        params.media_count,
        params.first_seen_at,
        params.updated_at,
        params.id
      );
  }

  public updateClusterSignalScore(clusterId: string, signalScore: number): void {
    this.db
      .prepare('UPDATE clusters SET signal_score = ? WHERE id = ?')
      .run(signalScore, clusterId);
  }

  public updateClusterScores(updates: Array<{ id: string; score: number }>): void {
    if (updates.length === 0) return;
    const stmt = this.db.prepare('UPDATE clusters SET score = ? WHERE id = ?');
    this.db.exec('BEGIN;');
    try {
      for (const u of updates) {
        stmt.run(u.score, u.id);
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Vraća jedinstvene publisher izvore u klasteru (uključujući i duplikate iz `article_duplicates`),
   * poređane po vremenu objave (najstariji prvo — ko je prvi objavio).
   */
  public getClusterPublisherSources(clusterId: string): Array<{
    sourceId: string;
    sourceName: string;
    sourceWeight: number;
    url: string;
    publishedAt: string;
    paywall: PaywallType;
    isDuplicate: boolean;
  }> {
    const articleRows = this.db
      .prepare(`
        SELECT a.source_id, s.name AS source_name, s.weight AS source_weight,
               a.url, a.published_at, a.paywall
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.cluster_id = ? AND s.role = 'publisher'
        ORDER BY a.published_at ASC
      `)
      .all(clusterId) as Array<Record<string, unknown>>;

    const dupRows = this.db
      .prepare(`
        SELECT d.duplicate_source_id AS source_id, s.name AS source_name,
               s.weight AS source_weight, d.duplicate_url AS url,
               d.seen_at AS published_at, s.paywall
        FROM article_duplicates d
        JOIN articles a ON a.id = d.article_id
        JOIN sources s ON s.id = d.duplicate_source_id
        WHERE a.cluster_id = ? AND s.role = 'publisher'
        ORDER BY d.seen_at ASC
      `)
      .all(clusterId) as Array<Record<string, unknown>>;

    const seen = new Set<string>();
    const combined: Array<{
      sourceId: string;
      sourceName: string;
      sourceWeight: number;
      url: string;
      publishedAt: string;
      paywall: PaywallType;
      isDuplicate: boolean;
    }> = [];

    for (const r of articleRows) {
      const sid = String(r.source_id);
      if (seen.has(sid)) continue;
      seen.add(sid);
      combined.push({
        sourceId: sid,
        sourceName: String(r.source_name),
        sourceWeight: Number(r.source_weight),
        url: String(r.url),
        publishedAt: String(r.published_at),
        paywall: String(r.paywall) as PaywallType,
        isDuplicate: false,
      });
    }

    for (const r of dupRows) {
      const sid = String(r.source_id);
      if (seen.has(sid)) continue;
      seen.add(sid);
      combined.push({
        sourceId: sid,
        sourceName: String(r.source_name),
        sourceWeight: Number(r.source_weight),
        url: String(r.url),
        publishedAt: String(r.published_at),
        paywall: String(r.paywall) as PaywallType,
        isDuplicate: true,
      });
    }

    combined.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    return combined;
  }

  public assignArticleToCluster(articleId: string, clusterId: string): void {
    this.db
      .prepare('UPDATE articles SET cluster_id = ? WHERE id = ?')
      .run(clusterId, articleId);
  }

  public saveClusterBriefing(params: {
    clusterId: string;
    text: string;
    sourceNames: string[];
    mediaCount: number;
    generatedAt: string;
  }): void {
    this.db
      .prepare(`
        UPDATE clusters
        SET
          ai_briefing_text = ?,
          ai_briefing_sources = ?,
          ai_briefing_media_count = ?,
          ai_briefing_at = ?
        WHERE id = ?
      `)
      .run(
        params.text,
        JSON.stringify(params.sourceNames),
        params.mediaCount,
        params.generatedAt,
        params.clusterId
      );
  }

  public getRecentSignals(windowHours: number = 36, now: Date = new Date()): SignalRow[] {
    const cutoffIso = new Date(now.getTime() - windowHours * 3600 * 1_000).toISOString();
    const rows = this.db
      .prepare(`
        SELECT id, source_id, title, title_norm, rank, seen_at
        FROM signals
        WHERE seen_at >= ?
        ORDER BY rank ASC, seen_at DESC
      `)
      .all(cutoffIso) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      source_id: String(r.source_id),
      title: String(r.title),
      title_norm: String(r.title_norm),
      rank: Number(r.rank),
      seen_at: String(r.seen_at),
    }));
  }

  /**
   * Briše članke, klastere i signale starije od zadatog broja sati (podrazumevano 72 h).
   */
  public pruneOldData(
    retentionHours: number = DEFAULT_RETENTION_HOURS,
    now: Date = new Date()
  ): { deletedArticles: number; deletedClusters: number; deletedSignals: number } {
    const cutoffIso = new Date(now.getTime() - retentionHours * 3600 * 1000).toISOString();

    this.db.exec('BEGIN;');
    try {
      const delArticles = this.db
        .prepare('DELETE FROM articles WHERE first_seen_at < ?')
        .run(cutoffIso);
      const delClusters = this.db
        .prepare(
          'DELETE FROM clusters WHERE updated_at < ? OR id NOT IN (SELECT DISTINCT cluster_id FROM articles WHERE cluster_id IS NOT NULL)'
        )
        .run(cutoffIso);
      const delSignals = this.db
        .prepare('DELETE FROM signals WHERE seen_at < ?')
        .run(cutoffIso);
      this.db.exec('COMMIT;');

      return {
        deletedArticles: Number(delArticles.changes),
        deletedClusters: Number(delClusters.changes),
        deletedSignals: Number(delSignals.changes),
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Uklanja eventualni tabloid/lajfstajl šum koji je već ranije ušao u keširanu SQLite bazu.
   */
  public purgeNoiseArticles(
    isNoise: (row: { url: string; canonicalUrl: string; title: string; snippet: string }) => boolean
  ): number {
    const rows = this.db
      .prepare('SELECT id, url, canonical_url, title, snippet FROM articles')
      .all() as Array<Record<string, unknown>>;

    const toDelete: string[] = [];
    for (const r of rows) {
      if (
        isNoise({
          url: String(r.url),
          canonicalUrl: String(r.canonical_url),
          title: String(r.title),
          snippet: String(r.snippet ?? ''),
        })
      ) {
        toDelete.push(String(r.id));
      }
    }

    if (toDelete.length === 0) return 0;

    const delStmt = this.db.prepare('DELETE FROM articles WHERE id = ?');
    this.db.exec('BEGIN;');
    try {
      for (const id of toDelete) {
        delStmt.run(id);
      }
      this.db.exec(
        'DELETE FROM clusters WHERE id NOT IN (SELECT DISTINCT cluster_id FROM articles WHERE cluster_id IS NOT NULL)'
      );
      this.db.exec('COMMIT;');
      return toDelete.length;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Ponovo klasifikuje postojeće članke u keširanoj bazi (npr. posle unapređenja pravila klasifikacije).
   */
  public reclassifyStoredArticles(
    classifier: (row: {
      title: string;
      snippet: string;
      url: string;
      defaultCategory: CategoryName;
    }) => CategoryName
  ): number {
    const rows = this.db
      .prepare(`
        SELECT a.id, a.title, a.snippet, a.canonical_url, a.category, s.category_hint
        FROM articles a
        JOIN sources s ON s.id = a.source_id
      `)
      .all() as Array<Record<string, unknown>>;

    const updates: Array<{ id: string; category: CategoryName }> = [];
    for (const r of rows) {
      const currentCat = String(r.category) as CategoryName;
      const nextCat = classifier({
        title: String(r.title),
        snippet: String(r.snippet ?? ''),
        url: String(r.canonical_url),
        defaultCategory: String(r.category_hint) as CategoryName,
      });
      if (nextCat !== currentCat) {
        updates.push({ id: String(r.id), category: nextCat });
      }
    }

    if (updates.length === 0) return 0;

    const updStmt = this.db.prepare('UPDATE articles SET category = ? WHERE id = ?');
    this.db.exec('BEGIN;');
    try {
      for (const u of updates) {
        updStmt.run(u.category, u.id);
      }
      this.db.exec('COMMIT;');
      return updates.length;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public getStats(): {
    sourcesEnabled: number;
    sourcesTotal: number;
    articles: number;
    clusters: number;
    signals: number;
  } {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM sources WHERE enabled = 1) AS sourcesEnabled,
          (SELECT COUNT(*) FROM sources) AS sourcesTotal,
          (SELECT COUNT(*) FROM articles) AS articles,
          (SELECT COUNT(*) FROM clusters) AS clusters,
          (SELECT COUNT(*) FROM signals) AS signals
      `)
      .get() as Record<string, unknown>;

    return {
      sourcesEnabled: Number(row.sourcesEnabled),
      sourcesTotal: Number(row.sourcesTotal),
      articles: Number(row.articles),
      clusters: Number(row.clusters),
      signals: Number(row.signals),
    };
  }

  public close(): void {
    if (this.path !== ':memory:') {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        // ignore if read-only or already closed
      }
    }
    this.db.close();
  }
}
