/**
 * HTTPUtils, part of LibLCU.ts
 * Methods to communicate with the League Client through HTTP
 * @author lotuspar, 2022
 * @file HTTPUtils.ts
 */

import { IncomingMessage } from 'http';
import https from 'https';
import Lockfile from './Lockfile';

export type RequestExtraParams = {
  data?: string;
  extraHeaders?: object;
  expectation?: ResponseExpectation;
};

export interface ResponseExpectation {
  code: number;
  contents?: string;
}

export class RequestError extends Error {
  public code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

const rejectUnauthorized = false; // we need this, LCU uses a self-signed certificate

export async function clientBackendRequest(
  lockfile: Lockfile,
  method: string,
  path: string,
  extra: RequestExtraParams = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const request = https.request({
      method,
      path,
      headers: {
        Authorization: lockfile.basic,
        ...extra.extraHeaders || {},
      },
      hostname: lockfile.host,
      port: lockfile.port,
      rejectUnauthorized,
    }, (result: IncomingMessage) => {
      if (extra.expectation?.code !== result.statusCode) {
        console.error(`code ${result.statusCode} trying to ${method} ${path}`);
        console.error(`data ${extra.data}`);
        reject(new RequestError(
          `Unexpected response ${result.statusMessage} ${result.statusCode}`,
          result.statusCode ?? 0,
        ));
      }

      result.on('data', (packet) => {
        // this is called on receiving a data packet
        buffer += packet;
      });

      result.on('end', () => {
        // this is called when no more response active
        if (extra.expectation?.contents !== undefined && buffer !== extra.expectation?.contents) {
          reject(new Error(`Unexpected response content ${buffer}`));
        }
        resolve(buffer);
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    if (typeof extra.data !== 'undefined') {
      request.write(extra.data);
    }

    request.end();
  });
}
