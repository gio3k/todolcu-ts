/* eslint no-param-reassign: "off" */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import Connection from './Connection';
import Lockfile from './Lockfile';

// this is for mac
// windows should be around C:/Riot Games/League of Legends/lockfile
const LOCKFILE_PATH: string = '/Applications/League of Legends.app/Contents/LoL/lockfile';

let connection: Connection;
let localSummonerId: number;
let todos: { [key: string]: UserTodos } = {};

/**
 * User data (this should've been called User maybe)
 */
class UserTodos {
  public todos: string[] = [];

  public inGameTodos: string[] = [];

  public lastTodo?: string = undefined;

  public inGame: boolean = false;
}

/**
 * Single command data
 */
interface Command {
  func: (arg0: UserTodos, arg1: string[]) => string,
  description: string,
  minimumArguments: number,
}

const commands: { [key: string]: Command } = {
  /**
   * Add todo
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  add: {
    func: (arg0: UserTodos, arg1: string[]) => {
      const description = arg1.join(' ');
      if (arg0.todos.includes(description)) {
        return 'already exists!';
      }

      arg0.todos.push(description);
      if (arg0.inGame) {
        arg0.inGameTodos.push(description);
      }
      arg0.lastTodo = description;
      return 'added!';
    },
    description: 'Add a new todo',
    minimumArguments: 2,
  },

  /**
   * Remove todo
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  remove: {
    func: (arg0: UserTodos, arg1: string[]) => {
      const description = arg1.join(' ');
      let matches = 0;

      arg0.todos.forEach((todo) => {
        if (todo.includes(description)) {
          matches += 1;
        }
      });

      if (matches === 1) {
        arg0.todos = arg0.todos.filter((todo) => !todo.includes(description));
      } else if (matches === 0) {
        return 'no matches found!';
      } else {
        const previousLength = arg0.todos.length;
        arg0.todos = arg0.todos.filter((todo) => todo !== description);
        if (previousLength === arg0.todos.length) {
          return "didn't remove anything, please be more specific!";
        }
      }

      return 'removed!';
    },
    description: 'Remove a todo',
    minimumArguments: 2,
  },

  /**
   * Remove last todo
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  removelast: {
    func: (arg0: UserTodos, arg1: string[]) => {
      if (arg0.lastTodo === undefined) {
        return 'no last todo to remove!';
      }

      arg0.todos = arg0.todos.filter((todo) => todo !== arg0.lastTodo);
      arg0.lastTodo = undefined;
      return 'removed!';
    },
    description: 'Remove last created todo',
    minimumArguments: 2,
  },

  /**
   * List todos
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  list: {
    func: (arg0: UserTodos, arg1: string[]) => {
      if (arg0.todos.length === 0) {
        return 'you have no todos. use the add command!';
      }

      let output = `${arg0.todos.length} todo(s):\n`;
      arg0.todos.forEach((todo) => {
        output += `- ${todo}\n`;
      });
      // if in-game add new line to start for readability
      if (arg0.inGame) {
        output = `\n${output}`;
      }
      return output.trimEnd();
    },
    description: 'List todos',
    minimumArguments: 1,
  },

  /**
   * List commands
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  help: {
    func: (arg0: UserTodos, arg1: string[]) => {
      let output = 'commands:\n';
      Object.keys(commands).forEach((name) => {
        output += `${name} (${commands[name].description})\n`;
      });
      // if in-game add new line to start for readability
      if (arg0.inGame) {
        output = `\n${output}`;
      }
      return output.trimEnd();
    },
    description: 'List commands',
    minimumArguments: 1,
  },
};

/**
 * Send message to user
 * @param id User ID (format id@region)
 * @param body Message body
 */
async function sendMessage(id: string, body: string) {
  await connection.request('POST', `/lol-chat/v1/conversations/${id}/messages`, {
    data: JSON.stringify({ body }),
    expectation: { code: 200 },
  });
}

async function updateInGameStatus(
  { eventType, data, uri }: { eventType: any, data: any, uri: string },
) {
  if (eventType !== 'Update') {
    return;
  }

  if (!uri.includes('participants')) {
    return;
  }

  // make sure this user has todo storage
  if (todos[data.id] === undefined) {
    todos[data.id] = new UserTodos();
  }

  if (data.lol === undefined) {
    console.error('data.lol undefined!', eventType, data, uri);
    return;
  }

  const userTodos = todos[data.id];
  const previousStatus = userTodos.inGame;
  userTodos.inGame = (data.lol.gameStatus === 'inGame');

  if (previousStatus === userTodos.inGame) {
    return;
  }

  if (userTodos.inGame === false && userTodos.inGameTodos.length !== 0) {
    // tell user about created todos
    let output = `while you were in game, you made ${userTodos.inGameTodos.length} reminder(s).\n`;
    userTodos.inGameTodos.forEach((todo) => {
      output += `- ${todo}\n`;
    });
    sendMessage(data.id, output.trim());
    userTodos.inGameTodos = [];
  }
}

async function receiveMessage(
  { eventType, data, uri }: { eventType: any, data: any, uri: string },
) {
  if (eventType !== 'Create') {
    return;
  }

  // make sure it's not our message...
  if (data.fromSummonerId === localSummonerId) {
    return;
  }

  // make sure this user has todo storage
  if (todos[data.fromId] === undefined) {
    todos[data.fromId] = new UserTodos();
  }

  let body = '';
  const parts: string[] = data.body.split(' ');
  if (parts.length === 0) {
    // impossible it seems but who knows maybe the api changes
    return;
  }

  // Run command
  const command = commands[parts[0]];

  if (command === undefined) {
    body = 'command not found!';
  } else if (parts.length < command.minimumArguments) {
    body = 'not enough arguments!';
  } else {
    parts.shift();
    body = command.func(todos[data.fromId], parts);
  }

  // Save todos
  await writeFile('todos.json', JSON.stringify(todos));

  // Respond
  sendMessage(data.fromId, body);
}

async function run() {
  const lockfile = new Lockfile(`${await readFile(LOCKFILE_PATH)}`);
  connection = await Connection.initialize(lockfile);

  // this is worse than bad...
  if (existsSync('todos.json')) {
    // WARNING!
    // this will cause most crashes you get
    // the last todos.json could be broken / missing a field
    // and this will just load it normally and it'll crash later
    todos = JSON.parse(`${await readFile('todos.json')}`);
  }

  // this isn't pretty either,
  // (ok well it kinda is)
  // but it just gets the local summoner ID to compare to later
  localSummonerId = JSON.parse(await connection.request('GET', '/lol-chat/v1/me', {
    expectation: { code: 200 },
  })).summonerId;

  // subscribe to events
  connection.subscribe('OnJsonApiEvent_lol-chat_v1_conversations', updateInGameStatus); // this should use a diff event
  connection.subscribe('OnJsonApiEvent_lol-chat_v1_conversations', receiveMessage);
}
run();
