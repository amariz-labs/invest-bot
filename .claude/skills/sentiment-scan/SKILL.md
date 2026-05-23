---
name: sentiment-scan
description: Score news headlines or RSS feeds for sentiment using FinBERT (or VADER fallback). Optionally correlate against next-day price. Invoke when the user asks "what's the sentiment on X", "scan news for AAPL", or wants a news-driven trade idea.
---

# When to use

User has tickers and a time window. For deep multi-doc financial reasoning, route to FinGPT-driven agents.

# Upstream libraries / repos

- [`ProsusAI/finBERT`](https://huggingface.co/ProsusAI/finbert) — FinBERT base model.
- [`AI4Finance-Foundation/FinGPT`](https://github.com/AI4Finance-Foundation/FinGPT) — MIT; FinGPT + FinNLP pipeline (heavier).
- Reference pipelines: [`Laurenz-Thuemmler/nlp-sentiment-quant-monitor`](https://github.com/Laurenz-Thuemmler/nlp-sentiment-quant-monitor), [`KushyKernel/financial_news_sentiment`](https://github.com/KushyKernel/financial_news_sentiment).
- News fetchers: [`areed1192/finance-news-aggregator`](https://github.com/areed1192/finance-news-aggregator), [`janlukasschroeder/realtime-newsapi`](https://github.com/janlukasschroeder/realtime-newsapi).

# Recipe

```
/sentiment-scan --tickers AAPL,NVDA --window 24h --model finbert --correlate price
```

1. Fetch headlines (RSS via `finance-news-aggregator`, or `realtime-newsapi`).
2. Classify with FinBERT:
   ```python
   from transformers import pipeline
   cls = pipeline('text-classification', model='ProsusAI/finbert')
   ```
3. Aggregate per ticker: `(positive%, neutral%, negative%, avg_score)`.
4. If `--correlate price`, pull next-day return via `market-data` and report Pearson r over the last 90 days.

# Output convention

`reports/sentiment-scan/<ts>/{scores.csv, summary.md, correlation.png?}`.

# Install on first use

```bash
uvx --with transformers --with torch --with feedparser python -c "from transformers import pipeline"
```

# Don't

- Don't trade purely on FinBERT — short-horizon sentiment edge decays within minutes to hours; embargo-aware live latency often kills it.
- Don't quote sentiment as a single number — always report distribution + headline counts.
- Don't ignore non-English news for non-US tickers — FinBERT is English-only; route to FinGPT-Multilingual.

# Credits

- [OpenBB](https://github.com/OpenBB-finance/OpenBB) behavioral menu and [FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal) AI sentiment view — in-UI alternatives.
