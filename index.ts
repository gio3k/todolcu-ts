/* eslint no-param-reassign: "off" */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import Connection from './Connection';
import Lockfile from './Lockfile';

let connection: Connection;
let localSummonerId: number;

interface UserTodos {
  todos: string[];
  lastTodo?: string;
}

interface Command {
  func: (arg0: UserTodos, arg1: string[]) => string,
  description: string,
  minimumArguments: number
}

let todos: { [key: string]: UserTodos } = {};
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
      arg0.lastTodo = description;
      return 'added!';
    },
    description: 'Add a new todo',
    minimumArguments: 2,
  },

  /**
   * List todos
   * @param arg0 UserTodos
   * @param arg1 Arguments
   */
  list: {
    func: (arg0: UserTodos, arg1: string[]) => {
      let output = `you have ${arg0.todos.length} todo(s):\n`;
      arg0.todos.forEach((todo) => {
        output += `${todo}\n`;
      });
      return output;
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
      let output = '⚙️ registered commands(s):\n';
      Object.keys(commands).forEach((name) => {
        output += `${name} (${commands[name].description})\n`;
      });
      return output;
    },
    description: 'List commands',
    minimumArguments: 1,
  },
};

async function update({ eventType, data, uri }: { eventType: any, data: any, uri: string }) {
  if (eventType !== 'Create') {
    return;
  }

  if (data.fromSummonerId === localSummonerId) {
    return;
  }

  let body = '';

  if (todos[data.fromId] === undefined) {
    todos[data.fromId] = { todos: [], lastTodo: undefined };
  }

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

  // Respond
  await connection.request('POST', `/lol-chat/v1/conversations/${data.fromId}/messages`, {
    data: JSON.stringify({ body }),
    expectation: { code: 200 },
  });

  // Save
  await writeFile('todos.json', JSON.stringify(todos));
}

async function run() {
  const src = 'C:/Riot Games/League of Legends/lockfile';
  const lockfile = new Lockfile(`${await readFile(src)}`);
  connection = await Connection.initialize(lockfile);

  if (existsSync('todos.json')) {
    todos = JSON.parse(`${await readFile('todos.json')}`);
  }

  localSummonerId = JSON.parse(await connection.request('GET', '/lol-chat/v1/me', {
    expectation: { code: 200 },
  })).summonerId;

  connection.subscribe('OnJsonApiEvent_lol-chat_v1_conversations', update);
}
run();
