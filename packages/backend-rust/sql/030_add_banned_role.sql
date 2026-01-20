-- 添加 BANNED 用户角色枚举值
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'BANNED';
EXCEPTION WHEN duplicate_object THEN null; END $$;
