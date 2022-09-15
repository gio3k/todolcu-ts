/**
 * Connection, part of LibLCU.ts
 * Controller and manager handling connection to the League Client
 * @author lotuspar, 2022
 * @file Connection.ts
 */

import Lockfile from './Lockfile';
import { RequestExtraParams, clientBackendRequest } from './RequestUtils';
import WebSocketController from './WebSocketController';

export default class Connection {
  private lockfile: Lockfile;

  public websocket: WebSocketController;

  private constructor(lockfile: Lockfile, websocket: WebSocketController) {
    this.lockfile = lockfile;
    this.websocket = websocket;
  }

  public subscribe(
    name: string,
    callback: (...args: any) => void,
  ) {
    return this.websocket.subscribe(name, callback);
  }

  public async request(
    method: string,
    path: string,
    extra: RequestExtraParams = {},
  ) {
    return clientBackendRequest(this.lockfile, method, path, extra);
  }

  static async initialize(lockfile: Lockfile): Promise<Connection> {
    let wsc;

    try {
      /* Make sure HTTP connection is possible first */
      await clientBackendRequest(lockfile, 'GET', '/plugin-manager/v1/status', {
        expectation: { code: 200, contents: '{"state":"PluginsInitialized"}' },
      });

      /* Connect to WebSocket server */
      wsc = await WebSocketController.initialize(lockfile);
    } catch (e) {
      throw new Error(`Error while initializing Instance connections: ${e}`);
    }

    return new Connection(lockfile, wsc);
  }
}
