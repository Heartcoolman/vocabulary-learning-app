//! Word 和 WordBook 数据库操作
//!
//! 提供单词和词书的 CRUD 操作。

use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::storage::models::{Word, WordBook};
use crate::storage::{StorageError, StorageResult};

/// 单词和词书数据库操作仓库
///
/// 支持两种使用方式：
/// 1. 使用 `Arc<Mutex<Connection>>` 进行线程安全操作（适用于 Tauri 状态）
/// 2. 使用 `&Connection` 引用进行直接操作（适用于事务内操作）
pub struct WordRepository {
    conn: Arc<Mutex<Connection>>,
}

impl WordRepository {
    /// 创建新的 WordRepository 实例（使用 Arc<Mutex<Connection>>）
    ///
    /// 适用于在 Tauri 状态中使用，支持跨线程访问。
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// 获取连接锁
    fn get_conn(&self) -> StorageResult<std::sync::MutexGuard<Connection>> {
        self.conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }

    // ============================================================
    // WordBook 操作
    // ============================================================

    /// 根据 ID 获取词书
    pub fn get_word_book(&self, id: &str) -> StorageResult<Option<WordBook>> {
        let conn = self.get_conn()?;
        Self::get_word_book_internal(&conn, id)
    }

    /// 获取所有词书
    pub fn get_all_word_books(&self) -> StorageResult<Vec<WordBook>> {
        let conn = self.get_conn()?;
        Self::get_all_word_books_internal(&conn)
    }

    /// 保存词书（插入或更新）
    pub fn save_word_book(&self, book: &WordBook) -> StorageResult<()> {
        let conn = self.get_conn()?;
        Self::save_word_book_internal(&conn, book)
    }

    /// 删除词书
    pub fn delete_word_book(&self, id: &str) -> StorageResult<()> {
        let conn = self.get_conn()?;
        Self::delete_word_book_internal(&conn, id)
    }

    /// 获取已下载的词书列表
    pub fn get_downloaded_word_books(&self) -> StorageResult<Vec<WordBook>> {
        let conn = self.get_conn()?;
        Self::get_downloaded_word_books_internal(&conn)
    }

    // ============================================================
    // Word 操作
    // ============================================================

    /// 根据 ID 获取单词
    pub fn get_word(&self, id: &str) -> StorageResult<Option<Word>> {
        let conn = self.get_conn()?;
        Self::get_word_internal(&conn, id)
    }

    /// 根据词书 ID 获取所有单词
    pub fn get_words_by_book(&self, book_id: &str) -> StorageResult<Vec<Word>> {
        let conn = self.get_conn()?;
        Self::get_words_by_book_internal(&conn, book_id)
    }

    /// 根据 ID 列表获取多个单词
    pub fn get_words_by_ids(&self, ids: &[String]) -> StorageResult<Vec<Word>> {
        let conn = self.get_conn()?;
        Self::get_words_by_ids_internal(&conn, ids)
    }

    /// 保存单个单词
    pub fn save_word(&self, word: &Word) -> StorageResult<()> {
        let conn = self.get_conn()?;
        Self::save_word_internal(&conn, word)
    }

    /// 批量保存单词
    pub fn save_words_batch(&self, words: &[Word]) -> StorageResult<()> {
        let conn = self.get_conn()?;
        Self::save_words_batch_internal(&conn, words)
    }

    /// 搜索单词
    pub fn search_words(&self, query: &str, limit: i32) -> StorageResult<Vec<Word>> {
        let conn = self.get_conn()?;
        Self::search_words_internal(&conn, query, limit)
    }

    /// 获取词书中的单词数量
    pub fn get_word_count_by_book(&self, book_id: &str) -> StorageResult<i32> {
        let conn = self.get_conn()?;
        Self::get_word_count_by_book_internal(&conn, book_id)
    }

    // ============================================================
    // 内部实现方法（静态方法，接受 &Connection）
    // ============================================================

    /// 根据 ID 获取词书（内部实现）
    pub fn get_word_book_internal(conn: &Connection, id: &str) -> StorageResult<Option<WordBook>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, description, cover_url, word_count, category,
                   difficulty_level, is_default, is_downloaded, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word_book
            WHERE id = ?1
            "#,
        )?;

        let result = stmt.query_row(params![id], |row| WordBook::from_row(row));

        match result {
            Ok(book) => Ok(Some(book)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 获取所有词书（内部实现）
    pub fn get_all_word_books_internal(conn: &Connection) -> StorageResult<Vec<WordBook>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, description, cover_url, word_count, category,
                   difficulty_level, is_default, is_downloaded, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word_book
            ORDER BY created_at DESC
            "#,
        )?;

        let books = stmt
            .query_map([], |row| WordBook::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(books)
    }

    /// 保存词书（内部实现）
    pub fn save_word_book_internal(conn: &Connection, book: &WordBook) -> StorageResult<()> {
        // 先检查是否存在
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM word_book WHERE id = ?1)",
            params![book.id],
            |row| row.get(0),
        )?;

        if exists {
            book.update(conn)?;
        } else {
            book.insert(conn)?;
        }

        Ok(())
    }

    /// 删除词书（内部实现）
    pub fn delete_word_book_internal(conn: &Connection, id: &str) -> StorageResult<()> {
        // 先删除关联的单词
        conn.execute("DELETE FROM word WHERE word_book_id = ?1", params![id])?;

        // 再删除词书
        conn.execute("DELETE FROM word_book WHERE id = ?1", params![id])?;

        Ok(())
    }

    /// 获取已下载的词书列表（内部实现）
    pub fn get_downloaded_word_books_internal(conn: &Connection) -> StorageResult<Vec<WordBook>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, description, cover_url, word_count, category,
                   difficulty_level, is_default, is_downloaded, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word_book
            WHERE is_downloaded = 1
            ORDER BY created_at DESC
            "#,
        )?;

        let books = stmt
            .query_map([], |row| WordBook::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(books)
    }

    /// 根据 ID 获取单词（内部实现）
    pub fn get_word_internal(conn: &Connection, id: &str) -> StorageResult<Option<Word>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, word_book_id, word, phonetic_uk, phonetic_us,
                   audio_uk_url, audio_us_url, definition, definition_en,
                   example_sentences, word_forms, synonyms, antonyms, tags,
                   frequency_rank, difficulty_score, sort_order, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word
            WHERE id = ?1
            "#,
        )?;

        let result = stmt.query_row(params![id], |row| Word::from_row(row));

        match result {
            Ok(word) => Ok(Some(word)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 根据词书 ID 获取所有单词（内部实现）
    pub fn get_words_by_book_internal(
        conn: &Connection,
        book_id: &str,
    ) -> StorageResult<Vec<Word>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, word_book_id, word, phonetic_uk, phonetic_us,
                   audio_uk_url, audio_us_url, definition, definition_en,
                   example_sentences, word_forms, synonyms, antonyms, tags,
                   frequency_rank, difficulty_score, sort_order, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word
            WHERE word_book_id = ?1
            ORDER BY sort_order ASC
            "#,
        )?;

        let words = stmt
            .query_map(params![book_id], |row| Word::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(words)
    }

    /// 根据 ID 列表获取多个单词（内部实现）
    pub fn get_words_by_ids_internal(
        conn: &Connection,
        ids: &[String],
    ) -> StorageResult<Vec<Word>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        // 构建动态 IN 子句
        let placeholders: Vec<String> = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            r#"
            SELECT id, word_book_id, word, phonetic_uk, phonetic_us,
                   audio_uk_url, audio_us_url, definition, definition_en,
                   example_sentences, word_forms, synonyms, antonyms, tags,
                   frequency_rank, difficulty_score, sort_order, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word
            WHERE id IN ({})
            "#,
            placeholders.join(", ")
        );

        let mut stmt = conn.prepare(&sql)?;

        // 绑定参数
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let words = stmt
            .query_map(params.as_slice(), |row| Word::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(words)
    }

    /// 保存单个单词（内部实现）
    pub fn save_word_internal(conn: &Connection, word: &Word) -> StorageResult<()> {
        // 检查是否存在，使用 upsert 逻辑
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM word WHERE id = ?1)",
            params![word.id],
            |row| row.get(0),
        )?;

        if exists {
            // 更新
            conn.execute(
                r#"
                UPDATE word SET
                    word_book_id = ?2, word = ?3, phonetic_uk = ?4, phonetic_us = ?5,
                    audio_uk_url = ?6, audio_us_url = ?7, definition = ?8, definition_en = ?9,
                    example_sentences = ?10, word_forms = ?11, synonyms = ?12, antonyms = ?13,
                    tags = ?14, frequency_rank = ?15, difficulty_score = ?16, sort_order = ?17,
                    version = ?18, updated_at = ?19, synced_at = ?20, cloud_version = ?21
                WHERE id = ?1
                "#,
                params![
                    word.id,
                    word.word_book_id,
                    word.word,
                    word.phonetic_uk,
                    word.phonetic_us,
                    word.audio_uk_url,
                    word.audio_us_url,
                    word.definition,
                    word.definition_en,
                    word.example_sentences,
                    word.word_forms,
                    word.synonyms,
                    word.antonyms,
                    word.tags,
                    word.frequency_rank,
                    word.difficulty_score,
                    word.sort_order,
                    word.version,
                    word.updated_at.format("%Y-%m-%d %H:%M:%S").to_string(),
                    word.synced_at
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()),
                    word.cloud_version,
                ],
            )?;
        } else {
            word.insert(conn)?;
        }

        Ok(())
    }

    /// 批量保存单词（内部实现）
    pub fn save_words_batch_internal(conn: &Connection, words: &[Word]) -> StorageResult<()> {
        if words.is_empty() {
            return Ok(());
        }

        // 使用 upsert 批量插入
        for word in words {
            conn.execute(
                r#"
                INSERT INTO word (
                    id, word_book_id, word, phonetic_uk, phonetic_us,
                    audio_uk_url, audio_us_url, definition, definition_en,
                    example_sentences, word_forms, synonyms, antonyms, tags,
                    frequency_rank, difficulty_score, sort_order, version,
                    created_at, updated_at, synced_at, cloud_version
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                    ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
                )
                ON CONFLICT(id) DO UPDATE SET
                    word_book_id = excluded.word_book_id,
                    word = excluded.word,
                    phonetic_uk = excluded.phonetic_uk,
                    phonetic_us = excluded.phonetic_us,
                    audio_uk_url = excluded.audio_uk_url,
                    audio_us_url = excluded.audio_us_url,
                    definition = excluded.definition,
                    definition_en = excluded.definition_en,
                    example_sentences = excluded.example_sentences,
                    word_forms = excluded.word_forms,
                    synonyms = excluded.synonyms,
                    antonyms = excluded.antonyms,
                    tags = excluded.tags,
                    frequency_rank = excluded.frequency_rank,
                    difficulty_score = excluded.difficulty_score,
                    sort_order = excluded.sort_order,
                    version = excluded.version,
                    updated_at = excluded.updated_at,
                    synced_at = excluded.synced_at,
                    cloud_version = excluded.cloud_version
                "#,
                params![
                    word.id,
                    word.word_book_id,
                    word.word,
                    word.phonetic_uk,
                    word.phonetic_us,
                    word.audio_uk_url,
                    word.audio_us_url,
                    word.definition,
                    word.definition_en,
                    word.example_sentences,
                    word.word_forms,
                    word.synonyms,
                    word.antonyms,
                    word.tags,
                    word.frequency_rank,
                    word.difficulty_score,
                    word.sort_order,
                    word.version,
                    word.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
                    word.updated_at.format("%Y-%m-%d %H:%M:%S").to_string(),
                    word.synced_at
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()),
                    word.cloud_version,
                ],
            )?;
        }

        Ok(())
    }

    /// 搜索单词（内部实现）
    pub fn search_words_internal(
        conn: &Connection,
        query: &str,
        limit: i32,
    ) -> StorageResult<Vec<Word>> {
        let search_pattern = format!("%{}%", query);

        let mut stmt = conn.prepare(
            r#"
            SELECT id, word_book_id, word, phonetic_uk, phonetic_us,
                   audio_uk_url, audio_us_url, definition, definition_en,
                   example_sentences, word_forms, synonyms, antonyms, tags,
                   frequency_rank, difficulty_score, sort_order, version,
                   created_at, updated_at, synced_at, cloud_version
            FROM word
            WHERE word LIKE ?1 OR definition LIKE ?1
            ORDER BY
                CASE
                    WHEN word = ?2 THEN 0
                    WHEN word LIKE ?3 THEN 1
                    ELSE 2
                END,
                frequency_rank ASC NULLS LAST
            LIMIT ?4
            "#,
        )?;

        let prefix_pattern = format!("{}%", query);
        let words = stmt
            .query_map(
                params![search_pattern, query, prefix_pattern, limit],
                |row| Word::from_row(row),
            )?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(words)
    }

    /// 获取词书中的单词数量（内部实现）
    pub fn get_word_count_by_book_internal(conn: &Connection, book_id: &str) -> StorageResult<i32> {
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM word WHERE word_book_id = ?1",
            params![book_id],
            |row| row.get(0),
        )?;

        Ok(count)
    }
}

// ============================================================
// 借用版本的 Repository（用于事务内操作）
// ============================================================

/// 借用连接的词库操作仓库
///
/// 用于在事务中直接操作数据库，避免死锁问题。
pub struct WordRepositoryRef<'a> {
    conn: &'a Connection,
}

impl<'a> WordRepositoryRef<'a> {
    /// 创建新的 WordRepositoryRef 实例
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    // WordBook 操作
    pub fn get_word_book(&self, id: &str) -> StorageResult<Option<WordBook>> {
        WordRepository::get_word_book_internal(self.conn, id)
    }

    pub fn get_all_word_books(&self) -> StorageResult<Vec<WordBook>> {
        WordRepository::get_all_word_books_internal(self.conn)
    }

    pub fn save_word_book(&self, book: &WordBook) -> StorageResult<()> {
        WordRepository::save_word_book_internal(self.conn, book)
    }

    pub fn delete_word_book(&self, id: &str) -> StorageResult<()> {
        WordRepository::delete_word_book_internal(self.conn, id)
    }

    pub fn get_downloaded_word_books(&self) -> StorageResult<Vec<WordBook>> {
        WordRepository::get_downloaded_word_books_internal(self.conn)
    }

    // Word 操作
    pub fn get_word(&self, id: &str) -> StorageResult<Option<Word>> {
        WordRepository::get_word_internal(self.conn, id)
    }

    pub fn get_words_by_book(&self, book_id: &str) -> StorageResult<Vec<Word>> {
        WordRepository::get_words_by_book_internal(self.conn, book_id)
    }

    pub fn get_words_by_ids(&self, ids: &[String]) -> StorageResult<Vec<Word>> {
        WordRepository::get_words_by_ids_internal(self.conn, ids)
    }

    pub fn save_word(&self, word: &Word) -> StorageResult<()> {
        WordRepository::save_word_internal(self.conn, word)
    }

    pub fn save_words_batch(&self, words: &[Word]) -> StorageResult<()> {
        WordRepository::save_words_batch_internal(self.conn, words)
    }

    pub fn search_words(&self, query: &str, limit: i32) -> StorageResult<Vec<Word>> {
        WordRepository::search_words_internal(self.conn, query, limit)
    }

    pub fn get_word_count_by_book(&self, book_id: &str) -> StorageResult<i32> {
        WordRepository::get_word_count_by_book_internal(self.conn, book_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        // 创建表
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS word_book (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                cover_url TEXT,
                word_count INTEGER DEFAULT 0,
                category TEXT,
                difficulty_level INTEGER DEFAULT 1,
                is_default INTEGER DEFAULT 0,
                is_downloaded INTEGER DEFAULT 0,
                version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT,
                cloud_version INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS word (
                id TEXT PRIMARY KEY,
                word_book_id TEXT NOT NULL,
                word TEXT NOT NULL,
                phonetic_uk TEXT,
                phonetic_us TEXT,
                audio_uk_url TEXT,
                audio_us_url TEXT,
                definition TEXT NOT NULL,
                definition_en TEXT,
                example_sentences TEXT,
                word_forms TEXT,
                synonyms TEXT,
                antonyms TEXT,
                tags TEXT,
                frequency_rank INTEGER,
                difficulty_score REAL DEFAULT 0.5,
                sort_order INTEGER DEFAULT 0,
                version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT,
                cloud_version INTEGER DEFAULT 0,
                FOREIGN KEY (word_book_id) REFERENCES word_book(id)
            );

            CREATE INDEX IF NOT EXISTS idx_word_book_id ON word(word_book_id);
            CREATE INDEX IF NOT EXISTS idx_word_text ON word(word);
            "#,
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    fn create_test_word_book() -> WordBook {
        let now = Utc::now();
        WordBook {
            id: "book-1".to_string(),
            name: "CET4".to_string(),
            description: Some("四级词汇".to_string()),
            cover_url: None,
            word_count: 100,
            category: Some("CET".to_string()),
            difficulty_level: 2,
            is_default: false,
            is_downloaded: true,
            version: 1,
            created_at: now,
            updated_at: now,
            synced_at: None,
            cloud_version: 0,
        }
    }

    fn create_test_word(id: &str, word_text: &str) -> Word {
        let now = Utc::now();
        Word {
            id: id.to_string(),
            word_book_id: "book-1".to_string(),
            word: word_text.to_string(),
            phonetic_uk: Some("/test/".to_string()),
            phonetic_us: Some("/test/".to_string()),
            audio_uk_url: None,
            audio_us_url: None,
            definition: r#"{"n": "测试"}"#.to_string(),
            definition_en: Some("test definition".to_string()),
            example_sentences: None,
            word_forms: None,
            synonyms: None,
            antonyms: None,
            tags: None,
            frequency_rank: Some(100),
            difficulty_score: 0.5,
            sort_order: 1,
            version: 1,
            created_at: now,
            updated_at: now,
            synced_at: None,
            cloud_version: 0,
        }
    }

    #[test]
    fn test_word_book_crud() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 获取词书
        let fetched = repo.get_word_book("book-1").unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "CET4");

        // 获取所有词书
        let all_books = repo.get_all_word_books().unwrap();
        assert_eq!(all_books.len(), 1);

        // 获取已下载词书
        let downloaded = repo.get_downloaded_word_books().unwrap();
        assert_eq!(downloaded.len(), 1);

        // 删除词书
        repo.delete_word_book("book-1").unwrap();
        let deleted = repo.get_word_book("book-1").unwrap();
        assert!(deleted.is_none());
    }

    #[test]
    fn test_word_crud() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 先创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 创建单词
        let word = create_test_word("word-1", "apple");
        repo.save_word(&word).unwrap();

        // 获取单词
        let fetched = repo.get_word("word-1").unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().word, "apple");

        // 根据词书获取单词
        let words = repo.get_words_by_book("book-1").unwrap();
        assert_eq!(words.len(), 1);

        // 获取单词数量
        let count = repo.get_word_count_by_book("book-1").unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_batch_save_words() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 先创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 批量创建单词
        let words = vec![
            create_test_word("word-1", "apple"),
            create_test_word("word-2", "banana"),
            create_test_word("word-3", "cherry"),
        ];
        repo.save_words_batch(&words).unwrap();

        // 验证数量
        let count = repo.get_word_count_by_book("book-1").unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_get_words_by_ids() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 先创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 批量创建单词
        let words = vec![
            create_test_word("word-1", "apple"),
            create_test_word("word-2", "banana"),
            create_test_word("word-3", "cherry"),
        ];
        repo.save_words_batch(&words).unwrap();

        // 根据 ID 列表获取
        let ids = vec!["word-1".to_string(), "word-3".to_string()];
        let fetched = repo.get_words_by_ids(&ids).unwrap();
        assert_eq!(fetched.len(), 2);

        // 测试空列表
        let empty: Vec<String> = vec![];
        let empty_result = repo.get_words_by_ids(&empty).unwrap();
        assert!(empty_result.is_empty());
    }

    #[test]
    fn test_search_words() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 先创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 创建单词
        let words = vec![
            create_test_word("word-1", "apple"),
            create_test_word("word-2", "application"),
            create_test_word("word-3", "banana"),
        ];
        repo.save_words_batch(&words).unwrap();

        // 搜索
        let results = repo.search_words("app", 10).unwrap();
        assert_eq!(results.len(), 2);

        // 限制结果数量
        let limited = repo.search_words("app", 1).unwrap();
        assert_eq!(limited.len(), 1);
    }

    #[test]
    fn test_word_repository_ref() {
        let conn = Connection::open_in_memory().unwrap();

        // 创建表
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS word_book (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                cover_url TEXT,
                word_count INTEGER DEFAULT 0,
                category TEXT,
                difficulty_level INTEGER DEFAULT 1,
                is_default INTEGER DEFAULT 0,
                is_downloaded INTEGER DEFAULT 0,
                version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT,
                cloud_version INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS word (
                id TEXT PRIMARY KEY,
                word_book_id TEXT NOT NULL,
                word TEXT NOT NULL,
                phonetic_uk TEXT,
                phonetic_us TEXT,
                audio_uk_url TEXT,
                audio_us_url TEXT,
                definition TEXT NOT NULL,
                definition_en TEXT,
                example_sentences TEXT,
                word_forms TEXT,
                synonyms TEXT,
                antonyms TEXT,
                tags TEXT,
                frequency_rank INTEGER,
                difficulty_score REAL DEFAULT 0.5,
                sort_order INTEGER DEFAULT 0,
                version INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT,
                cloud_version INTEGER DEFAULT 0,
                FOREIGN KEY (word_book_id) REFERENCES word_book(id)
            );
            "#,
        )
        .unwrap();

        let repo = WordRepositoryRef::new(&conn);

        // 创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 获取词书
        let fetched = repo.get_word_book("book-1").unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "CET4");
    }

    #[test]
    fn test_update_word() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 先创建词书
        let book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 创建单词
        let mut word = create_test_word("word-1", "apple");
        repo.save_word(&word).unwrap();

        // 更新单词
        word.definition = r#"{"n": "苹果"}"#.to_string();
        repo.save_word(&word).unwrap();

        // 验证更新
        let fetched = repo.get_word("word-1").unwrap().unwrap();
        assert_eq!(fetched.definition, r#"{"n": "苹果"}"#);
    }

    #[test]
    fn test_update_word_book() {
        let conn = setup_test_db();
        let repo = WordRepository::new(conn);

        // 创建词书
        let mut book = create_test_word_book();
        repo.save_word_book(&book).unwrap();

        // 更新词书
        book.name = "CET6".to_string();
        book.word_count = 200;
        repo.save_word_book(&book).unwrap();

        // 验证更新
        let fetched = repo.get_word_book("book-1").unwrap().unwrap();
        assert_eq!(fetched.name, "CET6");
        assert_eq!(fetched.word_count, 200);
    }
}
