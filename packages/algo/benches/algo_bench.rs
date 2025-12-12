//! Benchmark suite for danci-algo
//!
//! Run with: cargo bench

use criterion::{criterion_group, criterion_main, Criterion};
use danci_algo::types::BanditModel;

fn bench_bandit_model_default(c: &mut Criterion) {
    c.bench_function("BanditModel::default", |b| {
        b.iter(|| BanditModel::default())
    });
}

criterion_group!(benches, bench_bandit_model_default);
criterion_main!(benches);
