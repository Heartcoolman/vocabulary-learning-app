#!/bin/bash

# 服务集成测试快速启动脚本

set -e

echo "🚀 启动服务集成测试环境..."

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查测试数据库容器是否已存在
if docker ps -a --format '{{.Names}}' | grep -q '^danci-test-db$'; then
    echo "📦 测试数据库容器已存在"

    # 检查是否正在运行
    if docker ps --format '{{.Names}}' | grep -q '^danci-test-db$'; then
        echo "✅ 测试数据库正在运行"
    else
        echo "🔄 启动测试数据库..."
        docker start danci-test-db
        sleep 3
    fi
else
    echo "📦 创建并启动测试数据库容器..."
    docker run -d \
      --name danci-test-db \
      -e POSTGRES_USER=test_user \
      -e POSTGRES_PASSWORD=test_password \
      -e POSTGRES_DB=vocabulary_test \
      -p 5433:5432 \
      postgres:14

    echo "⏳ 等待数据库启动..."
    sleep 5
fi

# 检查数据库是否可访问
echo "🔍 检查数据库连接..."
max_attempts=10
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec danci-test-db pg_isready -U test_user > /dev/null 2>&1; then
        echo "✅ 数据库连接成功"
        break
    fi

    attempt=$((attempt + 1))
    echo "⏳ 等待数据库就绪... ($attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ 数据库连接超时"
    exit 1
fi

# 设置环境变量
export TEST_DATABASE_URL="postgresql://test_user:test_password@localhost:5433/vocabulary_test"
export NODE_ENV=test

# 运行数据库迁移
echo "📊 运行数据库迁移..."
cd "$(dirname "$0")/../.."
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy

# 运行测试
echo "🧪 运行集成测试..."
echo ""

if [ -z "$1" ]; then
    # 运行所有服务集成测试
    npm test -- tests/integration/services --run
else
    # 运行指定的测试文件
    npm test -- "tests/integration/services/$1" --run
fi

TEST_EXIT_CODE=$?

echo ""
echo "📊 测试完成"

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ 所有测试通过"
else
    echo "❌ 部分测试失败"
fi

echo ""
echo "💡 提示："
echo "  - 停止测试数据库: docker stop danci-test-db"
echo "  - 删除测试数据库: docker rm -f danci-test-db"
echo "  - 查看数据库日志: docker logs danci-test-db"
echo "  - 连接数据库: psql postgresql://test_user:test_password@localhost:5433/vocabulary_test"

exit $TEST_EXIT_CODE
