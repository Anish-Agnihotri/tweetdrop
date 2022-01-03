import * as fs from "fs"; // Filesystem
import axios from "axios"; // Requests
import { logger } from "./logger"; // Logging
import { ethers, providers } from "ethers"; // Ethers

// Regex matches for addresses and ENS names
const addressRegex: RegExp = /(0x[a-zA-Z0-9])\w+/;
const ENSRegex: RegExp = /([^ ]+\.(eth))/i;

export default class Scraper {
  // Optional RPC to resolve ENS names to addresses
  rpc?: providers.JsonRpcProvider | null;
  // Tweet conversation ID
  conversationID: string;
  // Twitter token
  twitterBearer: string;
  // Number of tokens to distribute per address
  numTokens: number;

  // Collected tweets from Twitter API
  tweets: { id: string; text: string }[] = [];
  // Cleaned addresses from tweets
  addresses: string[] = [];

  /**
   * Setup scraper
   * @param {string} conversationID to scrape
   * @param {string} twitterBearer 2.0 token
   * @param {number} numTokens to distribute per address
   * @param {string?} rpcProvider optional rpc endpoint to convert ENS names
   */
  constructor(
    conversationID: string,
    twitterBearer: string,
    numTokens: number,
    rpcProvider?: string
  ) {
    this.conversationID = conversationID;
    this.twitterBearer = twitterBearer;
    this.numTokens = numTokens;

    if (rpcProvider) {
      this.rpc = new providers.JsonRpcProvider(rpcProvider);
    }
  }

  /**
   * Generates endpoint to query for tweets from a thread
   * @param {string?} nextToken if paginating tweets
   * @returns {string} endpoint url
   */
  generateEndpoint(nextToken?: string): string {
    const baseEndpoint: string =
      "https://api.twitter.com/2/tweets/search/recent?query=conversation_id:" +
      // Append conversation ID
      this.conversationID +
      // Collect max allowed results
      "&max_results=100";

    // If paginating, append next_token to endpoint
    return nextToken ? `${baseEndpoint}&next_token=${nextToken}` : baseEndpoint;
  }

  /**
   * Recursively collect tweets from a thread (max. 100 per run)
   * @param {string?} nextSearchToken optional pagination token
   */
  async collectTweets(nextSearchToken?: string): Promise<void> {
    // Collect tweets
    const response = await axios({
      method: "GET",
      url: this.generateEndpoint(nextSearchToken),
      headers: {
        Authorization: `Bearer ${this.twitterBearer}`
      }
    });

    // Append new tweets
    const tweets: Record<string, string>[] = response.data.data;
    this.tweets.push(...response.data.data);
    logger.info(`Collected ${tweets.length} tweets`);

    const nextToken: string | undefined = response.data.meta.next_token;
    // If pagination token exists:
    if (nextToken) {
      // Collect next page of tweets
      await this.collectTweets(nextToken);
    }
  }

  /**
   * Cleans individual tweets, filtering for addresses
   */
  cleanTweetsForAddresses(): void {
    for (const tweet of this.tweets) {
      // Remove line-breaks, etc.
      const cleanedText: string = tweet.text.replace(/(\r\n|\n|\r)/gm, "");

      const foundAddress: RegExpMatchArray | null =
        cleanedText.match(addressRegex);
      const foundENS: RegExpMatchArray | null = cleanedText.match(ENSRegex);

      for (const foundArrs of [foundAddress, foundENS]) {
        // If match in tweet
        if (foundArrs && foundArrs.length > 0) {
          // If type(address)
          const addr: string = foundArrs[0].startsWith("0x")
            ? // Quick cleaning to only grab first 42 characters
              foundArrs[0].substring(0, 42)
            : foundArrs[0];

          // Push address or ENS name
          this.addresses.push(addr);
        }
      }
    }
  }

  /**
   * Checks if an address is valid
   * @param {string} address to check
   * @returns {{valid: boolean, address: string}} returns validity and checksum address
   */
  isValidAddress(address: string): { valid: boolean; address: string } {
    // Setup address
    let addr: string = address;

    try {
      // Return valid and address if success
      addr = ethers.utils.getAddress(address);
      return { valid: true, address: addr };
    } catch {
      // Else, if error
      return { valid: false, address };
    }
  }

  /**
   * Convert ENS names to addresses
   */
  async convertENS(): Promise<void> {
    let convertedAddresses: string[] = [];

    for (let i = 0; i < this.addresses.length; i++) {
      // Force lowercase (to avoid .ETH, .eth, .eTh matching)
      const address: string = this.addresses[i].toLowerCase();

      // If ENS name
      if (address.includes(".eth")) {
        // Resolve name via RPC
        const parsed: string | undefined = await this.rpc?.resolveName(address);
        if (parsed) {
          // If successful resolve, push name
          convertedAddresses.push(parsed);
        }
      } else {
        // Else, check if valid address
        const { valid, address: addr } = this.isValidAddress(address);
        // If address is valid
        if (valid) {
          // Push checksummed address
          convertedAddresses.push(addr);
        }
      }
    }

    this.addresses = convertedAddresses;
  }

  /**
   * Outputs batched, copyable addresses to /output directory
   * Effects: Modifies filesystem, adds output directory and text files
   */
  outputAddresses(): void {
    // Create /output folder if it doesnt exist
    const outputDir: string = "./output";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    for (let i = 0; i < this.addresses.length; i++) {
      // Batch file numbers by 100
      const fileNumber: number = Math.floor(i / 100);

      fs.appendFileSync(
        // Append to file-1...(numAddresses/100)
        `${outputDir}/batch-${fileNumber}.txt`,
        // "address, tokenAmount" per line
        `${this.addresses[i]}, ${this.numTokens}\n`
      );
    }
  }

  /**
   * Scrape tweets, find addresses, output batch copyable disperse files
   */
  async scrape() {
    // Collect all tweets from thread
    await this.collectTweets();
    logger.info(`Collected ${this.tweets.length} total tweets`);

    // Clean tweets, finding addresses and ENS names
    await this.cleanTweetsForAddresses();
    logger.info(`Collected ${this.addresses.length} addresses from tweets`);

    // If RPC provided
    if (this.rpc) {
      // Resolve ENS names to addresses
      await this.convertENS();
      logger.info("Converted ENS names to addresses");
    }

    // Output addresses to filesystem
    await this.outputAddresses();
    logger.info("Outputted addresses in 100-address batches to /output");
  }
}
