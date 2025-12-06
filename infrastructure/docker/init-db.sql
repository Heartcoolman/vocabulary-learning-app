-- TimescaleDB 初始化脚本
-- 启用 TimescaleDB 扩展

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 注意：Prisma 会自动创建表结构
-- 此文件用于 TimescaleDB 特定优化

-- 以下 SQL 将在 Prisma migrate 后手动执行（可选）
-- 将高频时序表转换为 hypertable：

-- 答题记录表（按时间分区）
-- SELECT create_hypertable('answer_records', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);

-- 决策记录表（按时间分区）
-- SELECT create_hypertable('decision_records', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);

-- 单词复习轨迹表（按时间分区）
-- SELECT create_hypertable('word_review_traces', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);

-- 因果观测数据表（按时间分区）
-- SELECT create_hypertable('causal_observations', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);
