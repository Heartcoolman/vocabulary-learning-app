use std::sync::Arc;

use sha2::{Digest, Sha256};
use tracing::{error, info, warn};

use crate::db::operations::embeddings::{
    select_words_missing_embeddings, upsert_word_embedding, WordForEmbedding,
};
use crate::db::DatabaseProxy;
use crate::services::embedding_provider::EmbeddingProvider;

const BATCH_SIZE: usize = 50;
const FETCH_LIMIT: i64 = 500;

pub async fn process_pending_embeddings(
    db: Arc<DatabaseProxy>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    info!("Embedding worker cycle started");

    let embedder = EmbeddingProvider::from_db(&db).await;
    if !embedder.is_available() {
        info!("Embedding provider not configured, skipping");
        return Ok(());
    }

    let items = select_words_missing_embeddings(&db, FETCH_LIMIT).await?;
    if items.is_empty() {
        info!("No words missing embeddings");
        return Ok(());
    }

    let model = embedder.model().to_string();
    let dim = embedder.dimension() as i32;

    info!(count = items.len(), model = %model, "Generating embeddings");

    let mut saved = 0usize;
    let mut failed = 0usize;

    for batch in items.chunks(BATCH_SIZE) {
        let (inputs, hashes): (Vec<_>, Vec<_>) =
            batch.iter().map(build_input_and_hash).unzip();

        let vectors = match embedder.embed_texts(&inputs).await {
            Ok(v) => v,
            Err(e) => {
                error!(error = %e, "Embedding batch failed");
                failed += batch.len();
                continue;
            }
        };

        if vectors.len() != batch.len() {
            error!(expected = batch.len(), actual = vectors.len(), "Batch size mismatch");
            failed += batch.len();
            continue;
        }

        for (i, word) in batch.iter().enumerate() {
            match upsert_word_embedding(&db, &word.id, &model, dim, &vectors[i], Some(&hashes[i]))
                .await
            {
                Ok(_) => saved += 1,
                Err(e) => {
                    warn!(word_id = %word.id, error = %e, "Failed to save embedding");
                    failed += 1;
                }
            }
        }
    }

    info!(saved, failed, "Embedding worker cycle completed");
    Ok(())
}

fn build_input_and_hash(word: &WordForEmbedding) -> (String, String) {
    let input = format!("{}\n{}", word.spelling, word.meanings.join("; "));
    let hash = hex::encode(Sha256::digest(input.as_bytes()));
    (input, hash)
}
