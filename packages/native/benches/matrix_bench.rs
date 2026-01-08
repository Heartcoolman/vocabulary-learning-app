use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

// 导入需要基准测试的函数
// 注意：需要在 lib.rs 中添加 pub mod matrix 或使用正确的路径

fn bench_cholesky_decompose(c: &mut Criterion) {
    let d = 22;
    // 创建一个正定矩阵（单位矩阵）
    let mut a: Vec<f64> = vec![0.0; d * d];
    for i in 0..d {
        a[i * d + i] = 1.0;
    }

    c.bench_function("cholesky_decompose_22x22", |b| {
        b.iter(|| {
            let result = a.clone();
            // 调用 cholesky_decompose
            // TODO: 集成实际的 cholesky_decompose 函数后替换此占位代码
            black_box(&result);
            result
        })
    });
}

fn bench_dot_product(c: &mut Criterion) {
    let sizes = [22, 50, 100];
    let mut group = c.benchmark_group("dot_product");

    for size in sizes {
        let x: Vec<f64> = (0..size).map(|i| i as f64 * 0.1).collect();
        let y: Vec<f64> = (0..size).map(|i| i as f64 * 0.2).collect();

        group.bench_with_input(BenchmarkId::from_parameter(size), &size, |b, _| {
            b.iter(|| {
                let mut sum = 0.0;
                for i in 0..x.len() {
                    sum += x[i] * y[i];
                }
                black_box(sum)
            })
        });
    }
    group.finish();
}

fn bench_rank1_update(c: &mut Criterion) {
    let d = 22;
    let mut matrix: Vec<f64> = vec![0.0; d * d];
    for i in 0..d {
        matrix[i * d + i] = 1.0;
    }
    let x: Vec<f64> = (0..d).map(|i| i as f64 * 0.1).collect();

    c.bench_function("rank1_update_22x22", |b| {
        b.iter(|| {
            let mut m = matrix.clone();
            // rank1 update
            for i in 0..d {
                for j in 0..d {
                    m[i * d + j] += x[i] * x[j];
                }
            }
            black_box(m)
        })
    });
}

criterion_group!(
    benches,
    bench_cholesky_decompose,
    bench_dot_product,
    bench_rank1_update
);
criterion_main!(benches);
