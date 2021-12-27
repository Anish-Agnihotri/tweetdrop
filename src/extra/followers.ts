import fs from "fs"; // Filesystem
import axios from "axios"; // Requests
import * as dotenv from "dotenv"; // Env vars
import { logger } from "../logger"; // Logging

// Setup env
dotenv.config();

// Type: User data
type User = {
  // Twitter id
  id: string;
  // Screen name
  name: string;
  // Handle
  handle: string;
  // Bio
  description: string;
  // Number of followers
  followers_count: number;
  // Number who they follow
  following_count: number;
  // Verified?
  verified: boolean;
  // Date of account creation
  created_at: string;
};

export default class Scraper {
  // Twitter Bearer token
  twitterBearer: string;
  // Twitter handle to scrape
  twitterHandle: string;
  // Ids of followers
  ids: string[] = [];
  // User objects of ids
  users: User[] = [];

  /**
   * Setup scraper
   * @param {string} twitterBearer for API
   * @param {string} twitterHandle to scrape
   */
  constructor(twitterBearer: string, twitterHandle: string) {
    this.twitterBearer = twitterBearer;
    this.twitterHandle = twitterHandle;
  }

  /**
   * Generates endpoint to call to retrieve followers in batches of 5K
   * @param {string | undefined} nextToken to paginate responses
   * @returns {string} endpoint to call
   */
  generateFollowersEndpoint(nextToken?: string): string {
    const baseEndpoint: string =
      "https://api.twitter.com/1.1/followers/ids.json?screen_name=" +
      // Append twitter handle
      this.twitterHandle +
      // Stringify ids (to prevent JS big number issues)
      "&stringify_ids=true";

    // If paginating, append next_token to endpoint
    return nextToken ? `${baseEndpoint}&cursor=${nextToken}` : baseEndpoint;
  }

  /**
   * Collects follower ids
   * @param {string | undefined} nextFollowerEndpoint to paginate responses
   */
  async collectAllFollowers(nextFollowerEndpoint?: string): Promise<void> {
    // Collect followers
    const { data } = await axios({
      method: "GET",
      url: this.generateFollowersEndpoint(nextFollowerEndpoint),
      headers: {
        Authorization: `Bearer ${this.twitterBearer}`
      }
    });

    // Get follower ids and push to ids array
    const ids: string[] = data.ids;
    this.ids.push(...ids);
    logger.info(`Collected ${ids.length} followers`);

    // Get cursor
    const nextCursor: string = data.next_cursor_str;
    // If cursor exists (user has more followers) and not at max retrieval
    if (nextCursor !== "0" && this.ids.length < 15000) {
      // Paginate and collect more users
      await this.collectAllFollowers(nextCursor);
    }
  }

  /**
   * Chunk generic, break large array into chunks
   * @param {T[]} array to chunk
   * @param {number} chunkSize of max child array
   * @returns {T[][]} chunked array
   */
  chunk<T>(array: T[], chunkSize: number): T[][] {
    // Result array
    const results = [];

    // Chunk via slicing in size
    for (let i = 0, len = array.length; i < len; i += chunkSize) {
      results.push(array.slice(i, i + chunkSize));
    }

    // Return result array
    return results;
  }

  /**
   * Collects all users for collected ids
   */
  async collectAllUsers(): Promise<void> {
    // Chunk ids into max endpoint size (100)
    const chunked_ids: string[][] = this.chunk(this.ids, 100);

    // For each chunk
    for (let i = 0; i < chunked_ids.length; i++) {
      // Generate required data
      const batchIdsStr: string = chunked_ids[i].join(",");

      // Collect user data from Twitter in bulk
      const { data } = await axios({
        method: "POST",
        url: `https://api.twitter.com/1.1/users/lookup.json?user_id=${batchIdsStr}&include_entities=false`,
        headers: {
          Authorization: `Bearer ${this.twitterBearer}`
        }
      });

      // For each user
      for (let j = 0; j < data.length; j++) {
        const user = data[j]; // Define user object

        // Push data about user
        this.users.push({
          id: user.id_str,
          name: user.name,
          handle: user.screen_name,
          description: user.description,
          followers_count: user.followers_count,
          following_count: user.friends_count,
          verified: user.verified,
          created_at: user.created_at
        });
      }

      // Log new user collection total
      logger.info(`Total collected users: ${this.users.length}`);
    }
  }

  /**
   * Run scraping process
   */
  async scrape(): Promise<void> {
    // Collect follower ids, log, and store
    await this.collectAllFollowers();
    logger.info(
      `Collected ${this.ids.length} follower ids. Now collecting details.`
    );
    await fs.writeFileSync("follower-ids.json", JSON.stringify(this.ids));

    // Collect follower users, log, and store
    await this.collectAllUsers();
    logger.info(`Collected ${this.users.length} followers`);
    await fs.writeFileSync("follower-details.json", JSON.stringify(this.users));
  }
}

(async () => {
  // Collect environment variables
  const twitterBearer: string | undefined = process.env.TWITTER_BEARER;
  const twitterHandle: string | undefined = process.env.TWITTER_USER;

  // If no twitter bearer or twitter handle provided
  if (!twitterBearer || !twitterHandle) {
    // Throw error and exit
    logger.error("Missing required parameters, update .env");
    process.exit(1);
  }

  // Scrape handle for followers
  const scraper = new Scraper(twitterBearer, twitterHandle);
  await scraper.scrape();
})();
