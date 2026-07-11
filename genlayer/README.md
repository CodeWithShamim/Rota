# Rota News Curator — GenLayer Intelligent Contract

[`news_curator.py`](./news_curator.py) is a GenLayer **Intelligent Contract**: a
Python contract whose validators can browse the web and run LLM inference, reaching
consensus on the result (the "equivalence principle"). Rota uses it as an on-chain,
AI-curated news desk:

- **`arc` category** — best news for the Arc ecosystem (Arc L1, Circle, USDC,
  stablecoin payments).
- **`rota` category** — news for Rota's domain: ROSCAs / chit funds / group
  savings, financial inclusion, stablecoin remittances.

Each `refresh_news()` transaction makes validators fetch two live Google News
feeds, ask an LLM to pick and summarize the most relevant stories, agree on the
result, and store it on-chain as JSON. The app's **/news** page reads it with
[genlayer-js](https://www.npmjs.com/package/genlayer-js) — no backend, no API keys
in the frontend.

## Deploy on GenLayer Studio testnet (studionet)

1. Open [GenLayer Studio](https://studio.genlayer.com) and connect/create an
   account (studionet is free — no gas token needed).
2. Create a new contract, paste the contents of `news_curator.py`, and **Deploy**
   (the constructor takes no arguments).
3. Copy the deployed contract address (`0x…`).
4. In the repo root `.env.local`, add:

   ```bash
   VITE_GENLAYER_NEWS_CONTRACT=0xYourDeployedAddress
   ```

5. Restart `pnpm dev`. The **News** page now reads from your contract.
6. Seed it: either call `refresh_news` from the Studio UI, or use the
   **Refresh on-chain** button on the /news page (it signs with a free local
   burner account — fine on studionet).

Alternative: the [GenLayer CLI](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup)
(`npm i -g genlayer`, `genlayer init`, `genlayer deploy`) deploys the same file.

## Notes / limitations

- Curation quality and feed availability depend on the validators' LLM and web
  access; `refresh_news` can take ~30–60 s to finalize while consensus runs.
- Anyone may call `refresh_news` — acceptable for a testnet news feed; gate it
  behind an owner address before any production use.
- Studionet resets occasionally; redeploy and update
  `VITE_GENLAYER_NEWS_CONTRACT` if reads start failing.
