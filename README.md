# tweetdrop

Simple script to collect and clean Ethereum addresses and ENS names from replies to a Tweet. Inspired by [punk4156 needing to airdrop thousands of addresses](https://twitter.com/punk4156/status/1428089265641201665?s=20).

Produces batches of text files containing 100 addresses (one-per-line) per-file in the format `address, tokenAmount`, in `/output`, to use with [Disperse](https://disperse.app/) or [Multisender](https://multisender.app/).

## Requirements

1. Twitter API V2 access (easy to apply for at [developer.twitter.com](https://developer.twitter.com)). You will need a V2 API Bearer Token.
2. Conversation ID for thread you'd like to scrape. This is the number after `/status/` in a tweets direct URL. For example, `1428089265641201665` for punk4156s tweet (`https://twitter.com/punk4156/status/1428089265641201665`). Because of Twitter API limitations, the thread must be less than 7 days old.
3. Optional: If you'd like to resolve ENS names to addresses (necessary for Disperse), an Ethereum RPC url.

## Steps

```bash
# 1. Copy .env.sample to .env and fill out environment variables
# NUM_TOKENS should be how many tokens you'd like to airdrop per address
cp .env.sample .env

# 2. Install dependencies
npm install

# 3. Run script
npm run start
```

# Extras

## Most recent followers

Inspired by [Cole's](https://twitter.com/ColeThereum/status/1468221153344954369?s=20) tweet, Tweetdrop supports scraping your latest `X` followers.

**Limitations:**

- Really, none, beyond Twitter imposed timeouts (max: 30,000 followers / 15 minutes). By default, script pulls 15,000 newest followers at once.

**Steps:**

```bash
# 1. Update only TWITTER_BEARER and TWITTER_USER (handle)
cp .env.sample .env

# 2. Install dependencies
npm install

# 3. Run followers script
npm run followers
```

**Outputs:**

- `follower-ids.json`: List of all follower ids
- `follower-details.json`: List of follower details (beyond just id: `name`, `handle`, `description`, `followers_count`, `following_count`, `verified`, `created_at`)
