-- SQLite 离线存储表结构定义
-- 版本: 1.0.0
-- 创建日期: 2025-12-12

-- ============================================================
-- 词书元信息表
-- ============================================================
CREATE TABLE IF NOT EXISTS word_book (
    id TEXT PRIMARY KEY,                          -- 词书唯一标识 (UUID)
    name TEXT NOT NULL,                           -- 词书名称
    description TEXT,                             -- 词书描述
    cover_url TEXT,                               -- 封面图片 URL
    word_count INTEGER NOT NULL DEFAULT 0,        -- 单词总数
    category TEXT,                                -- 分类 (如: CET4, CET6, IELTS)
    difficulty_level INTEGER DEFAULT 1,           -- 难度等级 (1-5)
    is_default INTEGER NOT NULL DEFAULT 0,       -- 是否为默认词书
    is_downloaded INTEGER NOT NULL DEFAULT 0,    -- 是否已下载到本地
    version INTEGER NOT NULL DEFAULT 1,           -- 数据版本号
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,                               -- 最后同步时间
    cloud_version INTEGER DEFAULT 0              -- 云端版本号
);

CREATE INDEX IF NOT EXISTS idx_word_book_category ON word_book(category);
CREATE INDEX IF NOT EXISTS idx_word_book_is_downloaded ON word_book(is_downloaded);

-- ============================================================
-- 单词数据表
-- ============================================================
CREATE TABLE IF NOT EXISTS word (
    id TEXT PRIMARY KEY,                          -- 单词唯一标识 (UUID)
    word_book_id TEXT NOT NULL,                   -- 所属词书 ID
    word TEXT NOT NULL,                           -- 单词拼写
    phonetic_uk TEXT,                             -- 英式音标
    phonetic_us TEXT,                             -- 美式音标
    audio_uk_url TEXT,                            -- 英式发音 URL
    audio_us_url TEXT,                            -- 美式发音 URL
    definition TEXT NOT NULL,                     -- 中文释义 (JSON 格式)
    definition_en TEXT,                           -- 英文释义
    example_sentences TEXT,                       -- 例句 (JSON 数组)
    word_forms TEXT,                              -- 词形变化 (JSON 对象)
    synonyms TEXT,                                -- 同义词 (JSON 数组)
    antonyms TEXT,                                -- 反义词 (JSON 数组)
    tags TEXT,                                    -- 标签 (JSON 数组)
    frequency_rank INTEGER,                       -- 词频排名
    difficulty_score REAL DEFAULT 0.5,            -- 难度分数 (0-1)
    sort_order INTEGER DEFAULT 0,                 -- 在词书中的排序
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,
    cloud_version INTEGER DEFAULT 0,

    FOREIGN KEY (word_book_id) REFERENCES word_book(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_word_word_book_id ON word(word_book_id);
CREATE INDEX IF NOT EXISTS idx_word_word ON word(word);
CREATE INDEX IF NOT EXISTS idx_word_frequency_rank ON word(frequency_rank);
CREATE INDEX IF NOT EXISTS idx_word_sort_order ON word(word_book_id, sort_order);

-- ============================================================
-- 单词学习状态表 (核心)
-- ============================================================
CREATE TABLE IF NOT EXISTS word_learning_state (
    id TEXT PRIMARY KEY,                          -- 状态记录唯一标识 (UUID)
    user_id TEXT NOT NULL,                        -- 用户 ID
    word_id TEXT NOT NULL,                        -- 单词 ID
    word_book_id TEXT NOT NULL,                   -- 词书 ID

    -- FSRS 算法核心参数
    stability REAL NOT NULL DEFAULT 0.0,          -- 稳定性 (S)
    difficulty REAL NOT NULL DEFAULT 0.0,         -- 难度 (D)
    elapsed_days REAL NOT NULL DEFAULT 0.0,       -- 已过天数
    scheduled_days REAL NOT NULL DEFAULT 0.0,     -- 计划间隔天数
    reps INTEGER NOT NULL DEFAULT 0,              -- 复习次数
    lapses INTEGER NOT NULL DEFAULT 0,            -- 遗忘次数
    state INTEGER NOT NULL DEFAULT 0,             -- 状态: 0=New, 1=Learning, 2=Review, 3=Relearning

    -- 学习进度
    mastery_level INTEGER NOT NULL DEFAULT 0,     -- 掌握等级 (0-5)
    retention_score REAL DEFAULT 0.0,             -- 记忆保持率 (0-1)
    is_mastered INTEGER NOT NULL DEFAULT 0,       -- 是否已掌握
    is_difficult INTEGER NOT NULL DEFAULT 0,      -- 是否标记为难词
    is_favorite INTEGER NOT NULL DEFAULT 0,       -- 是否收藏

    -- 时间记录
    first_learned_at TEXT,                        -- 首次学习时间
    last_reviewed_at TEXT,                        -- 最后复习时间
    next_review_at TEXT,                          -- 下次复习时间
    due_date TEXT,                                -- 到期日期

    -- 统计数据
    total_reviews INTEGER NOT NULL DEFAULT 0,     -- 总复习次数
    correct_count INTEGER NOT NULL DEFAULT 0,     -- 正确次数
    wrong_count INTEGER NOT NULL DEFAULT 0,       -- 错误次数
    total_time_spent INTEGER NOT NULL DEFAULT 0,  -- 总花费时间(毫秒)
    avg_response_time INTEGER DEFAULT 0,          -- 平均响应时间(毫秒)

    -- 同步相关
    version INTEGER NOT NULL DEFAULT 1,           -- 本地版本号
    cloud_version INTEGER DEFAULT 0,              -- 云端版本号
    is_dirty INTEGER NOT NULL DEFAULT 1,          -- 是否有未同步的修改
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,                               -- 最后同步时间

    UNIQUE(user_id, word_id),
    FOREIGN KEY (word_id) REFERENCES word(id) ON DELETE CASCADE,
    FOREIGN KEY (word_book_id) REFERENCES word_book(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wls_user_word ON word_learning_state(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_wls_user_book ON word_learning_state(user_id, word_book_id);
CREATE INDEX IF NOT EXISTS idx_wls_next_review ON word_learning_state(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_wls_due_date ON word_learning_state(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_wls_is_dirty ON word_learning_state(is_dirty);
CREATE INDEX IF NOT EXISTS idx_wls_mastery ON word_learning_state(user_id, mastery_level);
CREATE INDEX IF NOT EXISTS idx_wls_state ON word_learning_state(user_id, state);

-- ============================================================
-- 答题记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS answer_record (
    id TEXT PRIMARY KEY,                          -- 记录唯一标识 (UUID)
    user_id TEXT NOT NULL,                        -- 用户 ID
    word_id TEXT NOT NULL,                        -- 单词 ID
    word_book_id TEXT NOT NULL,                   -- 词书 ID
    learning_state_id TEXT,                       -- 关联的学习状态 ID

    -- 答题信息
    question_type TEXT NOT NULL,                  -- 题型: recognition/recall/spelling/listening
    question_content TEXT,                        -- 题目内容 (JSON)
    user_answer TEXT,                             -- 用户答案
    correct_answer TEXT,                          -- 正确答案
    is_correct INTEGER NOT NULL,                  -- 是否正确

    -- FSRS 评分
    rating INTEGER NOT NULL,                      -- 评分: 1=Again, 2=Hard, 3=Good, 4=Easy

    -- 性能数据
    response_time INTEGER NOT NULL DEFAULT 0,     -- 响应时间(毫秒)
    hesitation_time INTEGER DEFAULT 0,            -- 犹豫时间(毫秒)

    -- 上下文信息
    session_id TEXT,                              -- 学习会话 ID
    study_mode TEXT,                              -- 学习模式: learn/review/test
    device_info TEXT,                             -- 设备信息 (JSON)

    -- 同步相关
    version INTEGER NOT NULL DEFAULT 1,
    cloud_version INTEGER DEFAULT 0,
    is_synced INTEGER NOT NULL DEFAULT 0,         -- 是否已同步到云端
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,

    FOREIGN KEY (word_id) REFERENCES word(id) ON DELETE CASCADE,
    FOREIGN KEY (word_book_id) REFERENCES word_book(id) ON DELETE CASCADE,
    FOREIGN KEY (learning_state_id) REFERENCES word_learning_state(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ar_user_word ON answer_record(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_ar_user_book ON answer_record(user_id, word_book_id);
CREATE INDEX IF NOT EXISTS idx_ar_created_at ON answer_record(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ar_is_synced ON answer_record(is_synced);
CREATE INDEX IF NOT EXISTS idx_ar_session ON answer_record(session_id);
CREATE INDEX IF NOT EXISTS idx_ar_question_type ON answer_record(user_id, question_type);

-- ============================================================
-- 同步队列表
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,                      -- 操作类型: insert/update/delete
    table_name TEXT NOT NULL,                     -- 目标表名
    record_id TEXT NOT NULL,                      -- 记录 ID
    payload TEXT NOT NULL,                        -- 变更数据 (JSON)
    priority INTEGER NOT NULL DEFAULT 5,          -- 优先级 (1-10, 1最高)
    retry_count INTEGER NOT NULL DEFAULT 0,       -- 重试次数
    max_retries INTEGER NOT NULL DEFAULT 3,       -- 最大重试次数
    last_error TEXT,                              -- 最后一次错误信息
    status TEXT NOT NULL DEFAULT 'pending',       -- 状态: pending/processing/completed/failed
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    scheduled_at TEXT,                            -- 计划执行时间
    completed_at TEXT                             -- 完成时间
);

CREATE INDEX IF NOT EXISTS idx_sq_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sq_priority ON sync_queue(priority, created_at);
CREATE INDEX IF NOT EXISTS idx_sq_table_record ON sync_queue(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_sq_scheduled ON sync_queue(scheduled_at);

-- ============================================================
-- 同步元数据表
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,                         -- 元数据键
    value TEXT NOT NULL,                          -- 元数据值
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 初始化同步元数据
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES
    ('last_sync_time', ''),
    ('sync_token', ''),
    ('schema_version', '1');

-- ============================================================
-- 学习会话表
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_session (
    id TEXT PRIMARY KEY,                          -- 会话 ID (UUID)
    user_id TEXT NOT NULL,                        -- 用户 ID
    word_book_id TEXT NOT NULL,                   -- 词书 ID
    session_type TEXT NOT NULL,                   -- 会话类型: learn/review/test

    -- 会话统计
    words_studied INTEGER NOT NULL DEFAULT 0,     -- 学习单词数
    words_new INTEGER NOT NULL DEFAULT 0,         -- 新学单词数
    words_reviewed INTEGER NOT NULL DEFAULT 0,    -- 复习单词数
    correct_count INTEGER NOT NULL DEFAULT 0,     -- 正确数
    wrong_count INTEGER NOT NULL DEFAULT 0,       -- 错误数

    -- 时间记录
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration INTEGER DEFAULT 0,                   -- 持续时间(秒)

    -- 同步相关
    version INTEGER NOT NULL DEFAULT 1,
    is_synced INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT,

    FOREIGN KEY (word_book_id) REFERENCES word_book(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ls_user ON learning_session(user_id);
CREATE INDEX IF NOT EXISTS idx_ls_user_book ON learning_session(user_id, word_book_id);
CREATE INDEX IF NOT EXISTS idx_ls_started_at ON learning_session(user_id, started_at);

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_word_book_updated_at
    AFTER UPDATE ON word_book
    FOR EACH ROW
BEGIN
    UPDATE word_book SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_word_updated_at
    AFTER UPDATE ON word
    FOR EACH ROW
BEGIN
    UPDATE word SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_word_learning_state_updated_at
    AFTER UPDATE ON word_learning_state
    FOR EACH ROW
BEGIN
    UPDATE word_learning_state
    SET updated_at = datetime('now'), is_dirty = 1
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_queue_updated_at
    AFTER UPDATE ON sync_queue
    FOR EACH ROW
BEGIN
    UPDATE sync_queue SET updated_at = datetime('now') WHERE id = NEW.id;
END;
