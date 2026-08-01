const { TableClient } = require('@azure/data-tables');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.AZURE_TABLE_NAME || 'Tasks';
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  console.warn(
    'AZURE_STORAGE_CONNECTION_STRING is not set. Falling back to the local Azurite emulator connection string.'
  );
}

const tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME, {
  allowInsecureConnection: true,
});

async function ensureTableExists() {
  try {
    await tableClient.createTable();
  } catch (err) {
    if (err.statusCode !== 409) throw err;
  }
}

function toTask(entity) {
  return {
    date: entity.partitionKey,
    id: entity.rowKey,
    title: entity.title,
    time: entity.time || '',
    category: entity.category || 'personal',
    completed: !!entity.completed,
    createdAt: entity.createdAt,
    completedAt: entity.completedAt || null,
  };
}

async function getTasksByDate(date, category) {
  const tasks = [];
  const entities = tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${date}' and category eq '${category}'` },
  });
  for await (const entity of entities) tasks.push(toTask(entity));
  tasks.sort(
    (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt.localeCompare(b.createdAt)
  );
  return tasks;
}

async function getTasksInRange(start, end, category) {
  const tasks = [];
  const entities = tableClient.listEntities({
    queryOptions: {
      filter: `PartitionKey ge '${start}' and PartitionKey le '${end}' and category eq '${category}'`,
    },
  });
  for await (const entity of entities) tasks.push(toTask(entity));
  return tasks;
}

async function createTask(date, { title, time, category }) {
  const now = new Date().toISOString();
  const entity = {
    partitionKey: date,
    rowKey: uuidv4(),
    title,
    time: time || '',
    category: category || 'personal',
    completed: false,
    createdAt: now,
  };
  await tableClient.createEntity(entity);
  return toTask(entity);
}

async function updateTask(date, id, updates) {
  const entity = { partitionKey: date, rowKey: id };
  if (typeof updates.title === 'string') entity.title = updates.title;
  if (typeof updates.time === 'string') entity.time = updates.time;
  if (typeof updates.completed === 'boolean') {
    entity.completed = updates.completed;
    entity.completedAt = updates.completed ? new Date().toISOString() : '';
  }
  await tableClient.updateEntity(entity, 'Merge');
  const updated = await tableClient.getEntity(date, id);
  return toTask(updated);
}

async function deleteTask(date, id) {
  try {
    await tableClient.deleteEntity(date, id);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

module.exports = {
  ensureTableExists,
  getTasksByDate,
  getTasksInRange,
  createTask,
  updateTask,
  deleteTask,
};
