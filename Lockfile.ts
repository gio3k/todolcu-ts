/**
 * Lockfile, part of LibLCU.ts
 * Classes and methods to handle the League Client lockfile
 * @author lotuspar, 2022
 * @file Lockfile.ts
 */

import { Buffer } from 'buffer';
import { constants } from 'fs';
import { readFile, access } from 'fs/promises';

export default class Lockfile {
  private data: string[];

  private basicAuth: string = '';

  public readonly host: string = '127.0.0.1';

  constructor(contents: string) {
    /**
     * The client lockfile is colon delimited.
     * A normal lockfile layout (as of April 2022) looks like this:
     * LeagueClient:<service (port)>:<server (port)>:<auth (string passkey)>:<protocol (string)>
     */
    this.data = contents.split(':');

    // Validate length
    if (this.data.length !== 5) {
      throw new Error('Unknown lockfile contents');
    }
  }

  get application() {
    return this.data[0];
  }

  get service() {
    return this.data[1];
  }

  get port() {
    return this.data[2];
  }

  get passkey() {
    return this.data[3];
  }

  get protocol() {
    return this.data[4];
  }

  get basic() {
    if (this.basicAuth !== '') {
      return this.basicAuth;
    }

    const buffer = Buffer.from(`riot:${this.passkey}`);
    this.basicAuth = `Basic ${buffer.toString('base64')}`;

    return this.basicAuth;
  }

  static async read(src: string) {
    let contents;
    try {
      await access(src, constants.R_OK);
      contents = await readFile(src);
    } catch (e) {
      throw new Error(`Lockfile at "${src}" wasn't readable or didn't exist.`);
    }

    return new Lockfile(`${contents}`);
  }
}
